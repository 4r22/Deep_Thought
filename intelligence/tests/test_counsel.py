"""Counsel unit tests — no model call (bead vc-brain-gaw, spec docs/COUNSEL.md).

The counsel is three blind ABSTRACT axis offices reading the room; everything
downstream of the three calls is MECHANICAL code, and this file is its gate:

1. validate_counsel_member_postchecks — band/score ordering on EVERY office
   (all offices are numeric now), position_refs required iff a room convened,
   and the mandate-deviation lints (declared <=> note).
2. assemble_counsel — the assembled record carries per-axis scores only; the
   cross-axis mean deliberately does not exist in artifacts (operator
   decision 2026-07-21: it is presentational, Experience-layer only).
3. project_axes — the legacy axes.json shape is a faithful mechanical
   projection of the counsel record (back-compat artifact).
4. disagreement_line — divergence is a spread computation, not a model
   judgment: spread > DISAGREEMENT_SPREAD => stated plainly, else empty.

Stdlib unittest only, matching the house style.
"""
import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402


def member(axis="founder", convened=True, score=73, band=(61, 85), **over):
    m = {
        "score": score, "band": list(band), "trend": "stable",
        "confidence": "medium" if convened else "low",
        "evidence_refs": ["sig-001"] if convened else [],
        "position_refs": ["seat-1/post"] if convened else [],
        "room_effect": "seat-1 held on turn 5" if convened else "",
        "mandate_refs": ["risk_appetite"],
        "deviation": {"declared": False, "note": ""},
        "coverage_challenges": ["the room never priced churn"] if convened else [],
        "open_questions": ["request the payment-processor export"],
        "notes": "",
    }
    if axis == "founder":
        m["cold_start"] = not convened
    elif axis == "market":
        m["rating"] = "neutral"
    else:
        m["verdict"] = "survives-as-is"
    m.update(over)
    return m


def members(convened=True, scores=(73, 73, 73)):
    return {
        "founder": member("founder", convened, score=scores[0]),
        "market": member("market", convened, score=scores[1]),
        "idea_vs_market": member("idea_vs_market", convened, score=scores[2]),
    }


class TestMemberPostchecks(unittest.TestCase):
    def check(self, axis="market", convened=True, **over):
        run.validate_counsel_member_postchecks(axis, member(axis, convened, **over), convened)

    def test_valid_member_passes_convened_and_degraded(self):
        for axis in ("founder", "market", "idea_vs_market"):
            self.check(axis, convened=True)
            self.check(axis, convened=False)

    def test_band_ordering_enforced_on_every_office(self):
        # The old rule policed founder only; every office is numeric now.
        for axis in ("founder", "market", "idea_vs_market"):
            with self.assertRaises(SystemExit):
                self.check(axis, score=90, band=(40, 80))   # score > high
            with self.assertRaises(SystemExit):
                self.check(axis, band=(80, 40), score=60)   # low > high
            with self.assertRaises(SystemExit):
                self.check(axis, band=(61, 101), score=73)  # high > 100
            with self.assertRaises(SystemExit):
                self.check(axis, band=(61, 85, 90), score=73)

    def test_convened_requires_position_refs(self):
        with self.assertRaises(SystemExit) as ctx:
            self.check("market", convened=True, position_refs=[])
        self.assertIn("market", str(ctx.exception))
        self.assertIn("position_refs", str(ctx.exception))

    def test_no_room_forbids_position_refs(self):
        # Citing a room that never met is fabrication — fail loudly.
        with self.assertRaises(SystemExit) as ctx:
            self.check("founder", convened=False, position_refs=["seat-1/post"])
        self.assertIn("never met", str(ctx.exception))

    def test_declared_deviation_requires_note(self):
        with self.assertRaises(SystemExit):
            self.check(deviation={"declared": True, "note": "  "})
        self.check(deviation={"declared": True,
                              "note": "rates above risk_appetite because seat-3 conceded"})

    def test_undeclared_deviation_note_is_a_defect(self):
        with self.assertRaises(SystemExit) as ctx:
            self.check(deviation={"declared": False, "note": "quietly against mandate"})
        self.assertIn("undeclared", str(ctx.exception))


class TestAssembleAndProject(unittest.TestCase):
    def test_assembled_record_has_per_axis_scores_and_no_cross_axis_mean(self):
        c = run.assemble_counsel(members(scores=(70, 50, 90)), convened=True)
        self.assertTrue(c["room"]["convened"])
        self.assertEqual(c["aggregation"]["per_axis_scores"],
                         {"founder": 70, "market": 50, "idea_vs_market": 90})
        # The operator's line: the grand mean is UI-only. Nothing in the
        # artifact may carry it — not under any plausible key.
        flat = json.dumps(c).lower()
        for banned in ("cross_axis_score", "overall", "grand_mean", "average\":"):
            self.assertNotIn(banned, flat)
        self.assertIn("presentational", c["aggregation"]["cross_axis_note"])

    def test_projection_matches_legacy_axes_shape(self):
        c = run.assemble_counsel(members(), convened=True)
        axes = run.project_axes(c)
        run.validate_axes_postchecks(axes)  # the legacy invariants hold
        sch = run.schema("axes.schema.json")
        run._require_keys(axes, sch, "axes")
        # No extra keys beyond the legacy schema at any level jsonschema would
        # police (additionalProperties: false) — the projection must not leak
        # counsel-only fields (score on market/ivm, mandate_refs, ...).
        for name in ("founder", "market", "idea_vs_market"):
            allowed = set(sch["properties"][name]["properties"])
            self.assertEqual(set(axes[name]) - allowed, set(),
                             f"{name} projection leaks counsel-only keys")
        self.assertEqual(axes["market"]["rating"], "neutral")
        self.assertEqual(axes["idea_vs_market"]["verdict"], "survives-as-is")
        self.assertEqual(axes["founder"]["score"], 73)

    def test_degraded_mode_projects_cleanly(self):
        c = run.assemble_counsel(members(convened=False), convened=False)
        axes = run.project_axes(c)
        run.validate_axes_postchecks(axes)
        self.assertFalse(axes["room"]["convened"])
        for name in ("founder", "market", "idea_vs_market"):
            self.assertEqual(axes[name]["position_refs"], [])
            self.assertEqual(axes[name]["room_effect"], "")


class TestDisagreementLine(unittest.TestCase):
    def test_agreement_is_empty_string(self):
        self.assertEqual(run.disagreement_line(members(scores=(70, 72, 68))), "")

    def test_spread_at_threshold_is_agreement(self):
        line = run.disagreement_line(members(scores=(60, 80, 70)))
        self.assertEqual(line, "")   # spread == DISAGREEMENT_SPREAD

    def test_divergence_is_stated_with_all_three_offices(self):
        line = run.disagreement_line(members(scores=(30, 80, 55)))
        self.assertIn("spread 50", line)
        self.assertIn("founder 30", line)
        self.assertIn("market 80", line)
        self.assertIn("idea-vs-market 55", line)
        self.assertIn("never averaged", line)


if __name__ == "__main__":
    unittest.main()
