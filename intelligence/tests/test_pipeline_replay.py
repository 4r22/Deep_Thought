"""OFFLINE end-to-end replay proof of the inverted pipeline (epic vc-brain-26w).

No API key exists and none is needed: the single model seam — run.call — is
monkeypatched with a canned dispatcher that inspects each stage's json_schema
`_label` (and prompt text for the markdown forum stages) and returns
schema-valid canned objects. The REAL run.cmd_pipeline drives the whole
inverted flow:

    screen -> triage -> forum (fires unless screen rejected or crux blank)
            -> counsel (three blind axis offices over the room; axes.json is
               the mechanical legacy projection) -> memo

Nothing in run.py is modified — every stage boundary, the mechanical
forum_gate, the code-side validate_axes_postchecks, the latency record, and
every write_out land for real. The dispatcher only supplies what a live model
would have returned.

Stdlib unittest only, matching the house style (test_assembly.py etc.).
"""
import contextlib
import io
import json
import pathlib
import sys
import tempfile
import types
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))          # so `import run` resolves to intelligence/run.py

import run  # noqa: E402

FIXTURES = INTEL / "fixtures"
APPLICATION = FIXTURES / "application-ferrite.json"
SIGNALS = FIXTURES / "signals-ferrite.json"
THESIS = INTEL.parent / "config" / "thesis.example.json"

# Recognizable markers threaded through the canned artifacts so a test can prove
# a downstream prompt actually SAW an upstream artifact (and, for anchoring,
# that it did NOT see one it must never see).
CRUX_MARKER = "CRUX_MARKER: is the moat durable once incumbents copy the trick"
DEBATE_MARKER = "DEBATE_TRANSCRIPT_MARKER"
PRE_MARKER = "PRE_INTERVIEW_MARKER"
POST_MARKER = "POST_INTERVIEW_MARKER"
# A string that lives ONLY inside the axes object. It must never surface in any
# forum-stage prompt: axes is projected AFTER the room, so the room cannot have
# seen it (de-anchoring, review #23).
AXES_SENTINEL = "AXESLEAK_SENTINEL_DO_NOT_LEAK"

FORUM_STAGES = {"forum:seed", "forum:pre", "forum:debate", "forum:post", "forum:adjudicate"}


# --------------------------------------------------------------- canned objects


def _screen(verdict):
    return {
        "verdict": verdict,
        "thesis_fit": {"in_scope": verdict != "reject",
                       "mismatches": [] if verdict != "reject" else ["out of thesis stage"]},
        "missing_minimums": [],
        "red_flags": ([] if verdict != "reject"
                      else [{"flag": "no viable market", "evidence_ref": "sig-001",
                             "severity": "kill"}]),
        "rationale": f"Canned {verdict} screen for the offline replay proof.",
        "confidence": "medium",
    }


def _triage(crux):
    return {
        "routed_checks": ["MRR claim -> request payment-processor export"],
        "tensions": [{
            "name": "deck install-count vs registry downloads",
            "side_a": {"claim": "10k installs per the deck",
                       "evidence_refs": ["sig-002"]},
            "side_b": {"claim": "registry shows ~1k downloads",
                       "evidence_refs": ["sig-003"]},
        }],
        "crux": crux,
        "room_brief": "cover cold-start durability and the wedge",
        "confidence": "medium",
    }


def _seeds(n):
    attendants = []
    for i in range(1, n + 1):
        attendants.append({
            "id": f"seat-{i}",
            "handle": f"Real Person {i}",
            "slug": f"real-person-{i}",
            "invitation": {"invited_by": "evidence-record",
                           "reason": "published work bearing on the crux"},
            "lens": "reads the opportunity through durable-moat economics",
            "mandate": "pressure-test the install-count vs downloads tension",
            "evidence_refs": ["sig-002", "sig-003"],
            "decisive_question": f"distinct decisive question {i}",
            "opening_lean": ["for", "against", "genuinely-split"][i % 3],
        })
    return {"crux_restatement": "the room presses the durability of the moat",
            "attendants": attendants,
            "room_note": "seats span the disagreement; seat-2 can argue the minority"}


def _adjudication():
    return {
        "outcome": "action-converged-plus-residual",
        "converged": [{"action": "request the payment-processor export", "turn": 4}],
        "residual": [{"fork": "durability once incumbents copy the trick",
                      "positions": [{"attendant": "seat-1", "position": "durable via data moat"},
                                    {"attendant": "seat-2", "position": "commoditizes in 18mo"}]}],
        "instrument": [{"for_fork": "durability once incumbents copy the trick",
                        "move": "gate the check on a 6-month retention milestone"}],
        "evolution": [{"attendant": "seat-1", "movement": "held", "turns": [2, 5]},
                      {"attendant": "seat-2", "movement": "refined", "turns": [4]}],
        "suggested_attendants": [],
        "authority_note": ("This adjudication is agent-derived — material for the "
                           "investor to argue with, never an authority."),
    }


def _member(axis, convened, band=(61, 85), score=73):
    """One canned counsel-office output (schema-valid per counsel-<axis>)."""
    shared = ({"trend": "stable", "confidence": "medium", "evidence_refs": ["sig-001"],
               "position_refs": ["seat-1/post"], "room_effect": "seat-1 held on turn 5",
               "notes": AXES_SENTINEL}
              if convened else
              {"trend": "stable", "confidence": "low", "evidence_refs": [],
               "position_refs": [], "room_effect": "", "notes": ""})
    m = {"score": score, "band": list(band),
         "mandate_refs": ["risk_appetite"],
         "deviation": {"declared": False, "note": ""},
         "coverage_challenges": (["the room never priced churn"] if convened else []),
         "open_questions": ["request the payment-processor export"],
         **shared}
    if axis == "founder":
        m["cold_start"] = not convened
    elif axis == "market":
        m["rating"] = "neutral"
    else:
        m["verdict"] = "survives-as-is"
    return m


def _memo_section():
    return {
        "body_md": "Canned section body with one claim [C1].",
        "claims": [{
            "text": "a load-bearing claim",
            "trust": {"tier": "claimed", "authority": "subject",
                      "verification": "unverified", "confidence": "low"},
            "evidence": [{"signal_id": "sig-001", "quote": "q"}],
            "contradictions": [],
        }],
        "gaps": [{"field": "cap_table", "note": "not disclosed"}],
    }


def _memo_decision():
    return {
        "company": {"name": "Ferrite", "one_liner": "canned one-liner"},
        "diligence_log": [{"item": "MRR", "status": "open",
                           "instrument": "request payment-processor export"}],
        "decision": {"recommendation": "contested", "check_usd": 100000,
                     "conditions": ["gate on a 6-month retention milestone"],
                     "rationale": "Agent-derived input; the human investor is the gate."},
        "provenance": ["[prov: C1 / snapshot / sig-001]"],
    }


# ----------------------------------------------------------------- dispatcher


class CannedModel:
    """Stands in for run.call — the single model seam. Records every prompt it
    receives (with the stage it resolved to) so tests can assert on prompt
    content, then returns a schema-valid canned object for that stage."""

    def __init__(self, screen_verdict, crux, n_seats=3, axes_variant="ok"):
        self.screen_verdict = screen_verdict
        self.crux = crux
        self.n_seats = n_seats
        # "ok" | "no_room"(auto) | "bad_band" (founder office) | "missing_refs"
        # (market office) — the variants now poison ONE counsel office's output
        # so the per-member postcheck tripwire is what fires.
        self.axes_variant = axes_variant
        self.calls = []                       # [{stage, prompt, label}]

    def __call__(self, prompt_text, json_schema=None, max_tokens=16000, model=None):
        stage = self._classify(prompt_text, json_schema)
        self.calls.append({"stage": stage, "prompt": prompt_text,
                           "label": json_schema.get("_label") if json_schema else None})
        return self._respond(stage, prompt_text), None

    def prompts_for(self, *stages):
        return [c["prompt"] for c in self.calls if c["stage"] in stages]

    def _classify(self, prompt_text, json_schema):
        if json_schema is not None:
            return {
                "screen": "screen", "triage": "triage",
                "forum-seed": "forum:seed", "adjudication": "forum:adjudicate",
                "counsel-founder": "counsel:founder",
                "counsel-market": "counsel:market",
                "counsel-idea-vs-market": "counsel:idea_vs_market",
                "memo-section": "memo:doc",
                "memo-decision": "memo:decision",
            }[json_schema.get("_label")]
        if "forum pre-interview" in prompt_text:
            return "forum:pre"
        if "forum debate" in prompt_text:
            return "forum:debate"
        if "forum post-interview" in prompt_text:
            return "forum:post"
        raise AssertionError(f"unclassifiable model call; head:\n{prompt_text[:200]}")

    def _respond(self, stage, prompt_text):
        if stage == "screen":
            return _screen(self.screen_verdict)
        if stage == "triage":
            return _triage(self.crux)
        if stage == "forum:seed":
            return _seeds(self.n_seats)
        if stage == "forum:pre":
            return f"# {PRE_MARKER}\n\nBlind pre-interview reasoning."
        if stage == "forum:debate":
            return f"# {DEBATE_MARKER}\n\nTurn 1 ... turn 5 pressing the crux."
        if stage == "forum:post":
            return f"# {POST_MARKER}\n\nPosition evolution recorded."
        if stage == "forum:adjudicate":
            return _adjudication()
        if stage.startswith("counsel:"):
            axis = stage.split(":", 1)[1]
            convened = run._NO_ROOM not in prompt_text
            if convened and self.axes_variant == "bad_band" and axis == "founder":
                return _member("founder", True, band=(84, 58), score=70)
            if convened and self.axes_variant == "missing_refs" and axis == "market":
                m = _member("market", True)
                m["position_refs"] = []
                return m
            return _member(axis, convened)
        if stage == "memo:doc":
            return _memo_section()
        if stage == "memo:decision":
            return _memo_decision()
        raise AssertionError(stage)


# ------------------------------------------------------------------- harness


def _args(outdir, forum_mode="seeded", seats=3):
    return types.SimpleNamespace(
        application=str(APPLICATION),
        thesis=str(THESIS),
        signals=str(SIGNALS),
        out=str(outdir),
        forum_mode=forum_mode,
        seats=seats,
        robustness=False,
        robustness_model=run.ROBUST_MODEL,
    )


class _Replay:
    """Run cmd_pipeline once with call() monkeypatched, in a fresh tempdir.
    stderr/stdout are captured (write_out and the timed wrapper are chatty)."""

    def __init__(self, model, forum_mode="seeded", seats=3):
        self.model = model
        self.forum_mode = forum_mode
        self.seats = seats

    def __enter__(self):
        self._orig_call = run.call
        run.call = self.model
        self._tmp = tempfile.TemporaryDirectory()
        self.out = pathlib.Path(self._tmp.name) / "run"
        self.args = _args(self.out, self.forum_mode, self.seats)
        self.stderr = io.StringIO()
        return self

    def run(self):
        with contextlib.redirect_stderr(self.stderr), contextlib.redirect_stdout(io.StringIO()):
            run.cmd_pipeline(self.args)

    def run_expecting_exit(self):
        with contextlib.redirect_stderr(self.stderr), contextlib.redirect_stdout(io.StringIO()):
            run.cmd_pipeline(self.args)

    def __exit__(self, *exc):
        run.call = self._orig_call
        self._tmp.cleanup()
        return False

    def path(self, *parts):
        return self.out.joinpath(*parts)

    def exists(self, *parts):
        return self.out.joinpath(*parts).exists()

    def load(self, *parts):
        return json.loads(self.out.joinpath(*parts).read_text())


# --------------------------------------------------------------------- tests


class TestContestedSeeded(unittest.TestCase):
    """Scenario 1: contested + seeded — the full artifact set, on disk, in order,
    with the exact new latency stage list."""

    def test_full_artifact_set_and_latency_stages(self):
        model = CannedModel("contested", CRUX_MARKER, n_seats=3)
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()

            # Top-level artifacts. counsel.json is the tribunal record;
            # axes.json is its mechanical legacy projection.
            for rel in ("screen.json", "triage.json", "forum-attendants.json",
                        "forum-debate.md", "forum-adjudication.json", "forum-meta.json",
                        "counsel.json", "axes.json", "memo.json", "latency.json"):
                self.assertTrue(r.exists(rel), f"missing {rel}")

            # Per-seat interview markdown (seat-1..seat-3), pre and post.
            attendants = r.load("forum-attendants.json")["attendants"]
            self.assertEqual([a["id"] for a in attendants], ["seat-1", "seat-2", "seat-3"])
            for a in attendants:
                self.assertTrue(r.exists(f"forum-{a['id']}.md"), f"missing pre {a['id']}")
                self.assertTrue(r.exists(f"forum-post-{a['id']}.md"), f"missing post {a['id']}")

            # memo-docs/*: one per brief document.
            for key, *_ in run.DOCS:
                self.assertTrue(r.exists("memo-docs", f"{key}.json"), f"missing memo-doc {key}")

            # Latency stage names — exactly the new inverted list, in order.
            latency = r.load("latency.json")
            names = [s["stage"] for s in latency["stages"]]
            self.assertEqual(names, [
                "screen", "triage",
                "forum:seed", "forum:pre-interviews", "forum:debate",
                "forum:post-interviews", "forum:adjudicate",
                "counsel:members", "memo:documents", "memo:decision",
            ])
            self.assertIn("total_seconds", latency)
            self.assertEqual(latency["decision"], "contested")

    def test_axes_prompt_sees_the_room_and_memo_decision_sees_triage(self):
        model = CannedModel("contested", CRUX_MARKER, n_seats=3)
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()

            # EVERY counsel office actually sees the room: each blind office
            # prompt carries the debate transcript and the post-interview text.
            counsel_prompts = model.prompts_for(
                "counsel:founder", "counsel:market", "counsel:idea_vs_market")
            self.assertEqual(len(counsel_prompts), 3)
            for cp in counsel_prompts:
                self.assertIn(DEBATE_MARKER, cp)
                self.assertIn(POST_MARKER, cp)

            # The memo decision prompt threads the triage JSON.
            dec_prompt = model.prompts_for("memo:decision")[0]
            self.assertIn(CRUX_MARKER, dec_prompt)


class TestAnchoring(unittest.TestCase):
    """Scenario 2 — THE ANCHORING ASSERTION. No axes score, band, or axes-object
    key may reach the room. The forum sees only {application, screen, triage}."""

    def test_no_axes_leaks_into_any_forum_prompt(self):
        model = CannedModel("contested", CRUX_MARKER, n_seats=3)
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()

            forum_prompts = model.prompts_for(*FORUM_STAGES)
            self.assertTrue(forum_prompts, "no forum-stage prompts captured")

            # `"founder"` legitimately appears exactly once — it is a field of the
            # application, which the room IS allowed to see. A second occurrence
            # would mean the axes object (axes.founder) had leaked in.
            app_founder_count = json.dumps(json.loads(APPLICATION.read_text())).count('"founder"')
            self.assertEqual(app_founder_count, 1)

            for p in forum_prompts:
                # The axes object's own sentinel must never appear.
                self.assertNotIn(AXES_SENTINEL, p)
                # Axes-only JSON keys — none exist in application/screen/triage.
                for key in ('"band"', '"position_refs"', '"room_effect"',
                            '"idea_vs_market"', '"cold_start"', '"score"'):
                    self.assertNotIn(key, p, f"axes key {key} leaked into a forum prompt")
                # `"founder"` appears only as the application's field, never twice.
                self.assertEqual(p.count('"founder"'), app_founder_count,
                                 "an extra \"founder\" (axes object) reached the room")


class TestAdvanceSeeded(unittest.TestCase):
    """Scenario 3: advance + seeded — the forum FIRES. That the room convenes on
    an advance screen (not just contested) is the whole point of the inversion."""

    def test_forum_fires_on_advance(self):
        model = CannedModel("advance", CRUX_MARKER, n_seats=3)
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()
            self.assertTrue(r.exists("forum-attendants.json"))
            self.assertTrue(r.exists("forum-debate.md"))
            self.assertTrue(r.exists("forum-adjudication.json"))
            self.assertTrue(r.exists("forum-meta.json"))
            self.assertTrue(r.exists("forum-seat-1.md"))
            self.assertTrue(r.load("axes.json")["room"]["convened"])
            # The seed stage ran (forum fired), captured as a real model call.
            self.assertTrue(any(c["stage"] == "forum:seed" for c in model.calls))


class TestReject(unittest.TestCase):
    """Scenario 4: reject — no forum, degraded no-room axes, memo still written,
    clean exit."""

    def test_reject_skips_forum_but_completes(self):
        model = CannedModel("reject", CRUX_MARKER, n_seats=3)
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()   # must not raise

            for rel in ("forum-attendants.json", "forum-debate.md",
                        "forum-adjudication.json", "forum-meta.json", "forum-seat-1.md"):
                self.assertFalse(r.exists(rel), f"forum artifact {rel} should not exist")

            axes = r.load("axes.json")
            self.assertFalse(axes["room"]["convened"])

            self.assertTrue(r.exists("memo.json"))
            self.assertTrue(r.exists("latency.json"))

            # The gate named the reject reason.
            self.assertIn("skip", r.stderr.getvalue())
            self.assertIn("reject", r.stderr.getvalue())

            # No forum-stage model call ever happened.
            self.assertFalse(any(c["stage"] in FORUM_STAGES for c in model.calls))


class TestBlankCrux(unittest.TestCase):
    """Scenario 5: blank triage crux — gate skips with a named reason, no forum."""

    def test_blank_crux_skips_forum(self):
        model = CannedModel("advance", "   ", n_seats=3)   # advance screen, blank crux
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            r.run()

            self.assertFalse(r.exists("forum-attendants.json"))
            self.assertFalse(r.exists("forum-debate.md"))
            self.assertFalse(any(c["stage"] in FORUM_STAGES for c in model.calls))

            self.assertFalse(r.load("axes.json")["room"]["convened"])
            self.assertTrue(r.exists("memo.json"))

            err = r.stderr.getvalue()
            self.assertIn("skip", err)
            self.assertIn("crux", err)      # the named skip reason


class TestTwoPoleLegacy(unittest.TestCase):
    """Scenario 6: 2-pole legacy mode — bull/bear artifacts written; no seed
    stage; the bundle threads into axes."""

    def test_two_pole_writes_poles_and_threads_into_axes(self):
        model = CannedModel("contested", CRUX_MARKER)
        with _Replay(model, forum_mode="2-pole") as r:
            r.run()

            # Legacy bull/bear pole artifacts, not seeded seats.
            for rel in ("forum-bull.md", "forum-bear.md",
                        "forum-post-bull.md", "forum-post-bear.md"):
                self.assertTrue(r.exists(rel), f"missing {rel}")
            self.assertFalse(r.exists("forum-attendants.json"),
                             "2-pole mode must not mint a seeded attendants file")
            self.assertFalse(any(c["stage"] == "forum:seed" for c in model.calls),
                             "2-pole mode must not run the seed stage")

            # The forum bundle threaded into the counsel: the offices saw the room.
            axes = r.load("axes.json")
            self.assertTrue(axes["room"]["convened"])
            counsel_prompt = model.prompts_for("counsel:founder")[0]
            self.assertIn(DEBATE_MARKER, counsel_prompt)
            self.assertIn(POST_MARKER, counsel_prompt)


class TestAxesPostCheckTripwire(unittest.TestCase):
    """Scenario 7: a canned counsel office with an inverted band [84,58] trips
    the code-side validate_counsel_member_postchecks — the pipeline dies with
    SystemExit naming the office and the violation."""

    def test_bad_band_kills_the_pipeline(self):
        model = CannedModel("contested", CRUX_MARKER, n_seats=3, axes_variant="bad_band")
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            with self.assertRaises(SystemExit) as ctx:
                r.run_expecting_exit()
            msg = str(ctx.exception)
            self.assertIn("band", msg)
            self.assertIn("84", msg)   # names the offending low bound

    def test_missing_position_refs_when_convened_kills_the_pipeline(self):
        model = CannedModel("contested", CRUX_MARKER, n_seats=3, axes_variant="missing_refs")
        with _Replay(model, forum_mode="seeded", seats=3) as r:
            with self.assertRaises(SystemExit) as ctx:
                r.run_expecting_exit()
            msg = str(ctx.exception)
            self.assertIn("position_refs", msg)
            self.assertIn("market", msg)   # names the offending axis


if __name__ == "__main__":
    unittest.main()
