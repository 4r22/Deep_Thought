"""Contract tests for the stage seam — no model call.

Two mechanical invariants structured outputs and prompts cannot police:

1. Prompt-slot registry: every {{SLOT}} token in every prompts/**/*.md file is
   provided by the fill() mapping the stage that renders it builds. An
   unfilled token would leak a literal `{{FOO}}` into a model prompt — this
   test catches prompt/code drift in either direction.
2. Axes post-checks: validate_axes_postchecks enforces the founder band/score
   ordering and the room-cites-every-axis rule (closes bead vc-brain-xsj.17).
"""
import pathlib
import re
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402

PROMPTS = INTEL / "prompts"
_TOKEN = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

# The slots each prompt's rendering stage supplies via fill(). Keyed by the
# prompt path relative to prompts/. THIS is the registry: when a prompt gains a
# token or a stage stops providing one, this map and the code must move
# together or a test here fails.
EXPECTED_SLOTS = {
    "screen.md": {"THESIS_JSON", "APPLICATION_JSON", "SIGNALS_JSON"},
    "triage.md": {"THESIS_JSON", "APPLICATION_JSON", "SIGNALS_JSON", "SCREEN_JSON"},
    "counsel/member.md": {"THESIS_JSON", "APPLICATION_JSON", "SIGNALS_JSON",
                          "SCREEN_JSON", "TRIAGE_JSON", "ATTENDANTS_JSON",
                          "PRE_INTERVIEWS", "TRANSCRIPT", "POST_INTERVIEWS",
                          "ADJUDICATION_JSON", "AXIS_NAME", "AXIS_BRIEF"},
    "forum/seed.md": {"THESIS_JSON", "DECISION_JSON", "CRUX", "SIGNALS_JSON", "N_SEATS"},
    "forum/pre-interview.md": {"THESIS_JSON", "DECISION_JSON", "CRUX", "SIGNALS_JSON",
                               "ATTENDANT_JSON", "ATTENDANT_HANDLE"},
    "forum/debate.md": {"THESIS_JSON", "DECISION_JSON", "CRUX", "SIGNALS_JSON",
                        "ATTENDANTS_JSON", "PRE_INTERVIEWS"},
    "forum/post-interview.md": {"THESIS_JSON", "DECISION_JSON", "CRUX", "ATTENDANT_JSON",
                                "PRE_INTERVIEW", "TRANSCRIPT", "ATTENDANT_HANDLE"},
    "forum/adjudication.md": {"THESIS_JSON", "DECISION_JSON", "ATTENDANTS_JSON",
                              "PRE_INTERVIEWS", "TRANSCRIPT", "POST_INTERVIEWS"},
    "memo/section.md": {"DOC_TITLE", "DOC_SPEC", "THESIS_JSON", "APPLICATION_JSON",
                        "SIGNALS_JSON", "TRIAGE_JSON", "AXES_JSON", "ADJUDICATION_JSON"},
    "memo/decision.md": {"THESIS_JSON", "APPLICATION_JSON", "TRIAGE_JSON", "AXES_JSON",
                         "COUNSEL_JSON", "ADJUDICATION_JSON", "ASSEMBLED_JSON"},
    "potential.md": {"THESIS_JSON", "FOUNDER_JSON", "SIGNALS_JSON"},
}


class TestPromptSlotRegistry(unittest.TestCase):
    def test_every_prompt_file_is_registered(self):
        on_disk = {str(p.relative_to(PROMPTS)) for p in PROMPTS.rglob("*.md")}
        registered = set(EXPECTED_SLOTS)
        self.assertEqual(on_disk, registered,
                         f"unregistered prompt(s): {on_disk - registered}; "
                         f"stale registry entries: {registered - on_disk}")

    def test_prompt_tokens_are_all_provided(self):
        for rel, slots in EXPECTED_SLOTS.items():
            tokens = set(_TOKEN.findall((PROMPTS / rel).read_text()))
            missing = tokens - slots
            self.assertFalse(missing,
                             f"{rel}: token(s) {missing} appear in the prompt but the "
                             f"stage's fill() mapping does not provide them")

    def test_registry_has_no_dead_slots(self):
        # A registered slot never used by its prompt is dead code in the fill().
        for rel, slots in EXPECTED_SLOTS.items():
            tokens = set(_TOKEN.findall((PROMPTS / rel).read_text()))
            dead = slots - tokens
            self.assertFalse(dead, f"{rel}: registry lists slot(s) {dead} the prompt never uses")


def _axes(convened=True, score=60, band=(40, 80), refs=("seat-1/post",)):
    axis = {"trend": "stable", "confidence": "medium", "evidence_refs": ["sig-1"],
            "position_refs": list(refs), "room_effect": "x", "notes": ""}
    return {
        "room": {"convened": convened, "note": ""},
        "founder": {"score": score, "band": list(band), "cold_start": False, **axis},
        "market": {"rating": "neutral", **axis},
        "idea_vs_market": {"verdict": "survives-as-is", **axis},
        "disagreement": "",
    }


class TestAxesPostChecks(unittest.TestCase):
    def test_valid_axes_passes(self):
        run.validate_axes_postchecks(_axes())  # no raise

    def test_band_must_be_two_ints(self):
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(band=(40, 60, 80)))
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(band=(40,)))

    def test_band_ordering_low_le_score_le_high(self):
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(score=90, band=(40, 80)))  # score > high
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(score=30, band=(40, 80)))  # score < low
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(band=(80, 40)))            # low > high

    def test_band_bounds_zero_to_hundred(self):
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(score=60, band=(-1, 80)))
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(_axes(score=60, band=(40, 101)))

    def test_convened_room_requires_position_refs_on_every_axis(self):
        a = _axes()
        a["market"]["position_refs"] = []
        with self.assertRaises(SystemExit):
            run.validate_axes_postchecks(a)

    def test_no_room_allows_empty_position_refs(self):
        a = _axes(convened=False)
        for name in ("founder", "market", "idea_vs_market"):
            a[name]["position_refs"] = []
            a[name]["room_effect"] = ""
        run.validate_axes_postchecks(a)  # no raise — degraded no-room mode


if __name__ == "__main__":
    unittest.main()
