"""Test-adoption forum builder — offline proof (bead vc-brain-9m7).

Two invariants: (1) the builder turns a registry entry into schema-valid
forum inputs (signals pass the signal contract; the decision carries crux +
room_brief + evidenced tensions); (2) a built room actually CONVENES through
the REAL cmd_forum offline — CannedModel at the single call seam, same
harness as test_pipeline_replay — writing the full forum artifact set.
"""
import json
import pathlib
import sys
import tempfile
import types
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))
sys.path.insert(0, str(INTEL / "scripts"))

import run  # noqa: E402
import build_test_adoption_forums as batf  # noqa: E402
from test_pipeline_replay import CannedModel  # noqa: E402

ENTRY = {
    "slug": "verbatim-quote-citation-gate",
    "name": "Verbatim-quote citation gate",
    "pattern_area": "Citation-grounding and anti-hallucination validators",
    "what_it_is": "A deterministic post-processor that keeps a model sentence only "
                  "if its cited quote appears verbatim in the source evidence.",
    "adoption_in_vcbrain": "A code-side check at the memo assembly seam verifying "
                           "every claim quote is a substring of its cited signal.",
    "effort": "S",
    "deepdive_recommendation": "adopt — the field's most crowded good idea and ours are thin",
    "crux": "Does a hard verbatim-substring gate sharpen evidence discipline, or "
            "push the model toward quoting less and paraphrasing more?",
    "exemplars": [{
        "repo": "example/quotecheck",
        "github_url": "https://github.com/example/quotecheck/blob/main/textmatch.py",
        "local_path": "archives/work/example__quotecheck",
        "lines": "textmatch.py",
        "why_good": "quote-in-text drop guard applied to every generated claim",
        "verification_note": "confirmed by independent verifier",
    }],
    "our_side_facts": ["memo claims carry evidence quotes but no verbatim-substring check exists"],
}


class TestBuilderOutputs(unittest.TestCase):
    def build(self, td):
        args = types.SimpleNamespace(registry=str(pathlib.Path(td) / "reg.json"),
                                     out=str(pathlib.Path(td) / "rooms"),
                                     date="2026-07-20", seats=3, only=None, run=False)
        (pathlib.Path(td) / "reg.json").write_text(json.dumps([ENTRY]))
        batf.cmd_build(args)
        return pathlib.Path(td) / "rooms" / ENTRY["slug"]

    def test_signals_pass_contract_and_tiers_are_honest(self):
        with tempfile.TemporaryDirectory() as td:
            outdir = self.build(td)
            signals = json.loads((outdir / "signals.json").read_text())
            self.assertEqual(len(signals), 3)  # 1 exemplar + 1 our-side + 1 assessment
            sch = run.schema("signal.schema.json")
            for s in signals:
                run.validate(s, sch, s["id"])
            by_auth = {s["authority"]: s for s in signals}
            self.assertEqual(by_auth["independent"]["trust_tier"], "verified-artifact")
            self.assertEqual(by_auth["agent-derived"]["trust_tier"], "reconstructed")

    def test_decision_carries_crux_brief_and_evidenced_tensions(self):
        with tempfile.TemporaryDirectory() as td:
            outdir = self.build(td)
            decision = json.loads((outdir / "decision.json").read_text())
            self.assertEqual(decision["triage"]["crux"], ENTRY["crux"])
            self.assertIn("published work", decision["triage"]["room_brief"].lower())
            for t in decision["triage"]["tensions"]:
                for side in ("side_a", "side_b"):
                    self.assertTrue(t[side]["evidence_refs"],
                                    "a side with no evidence is not a side")

    def test_registry_validation_rejects_broken_entries(self):
        with tempfile.TemporaryDirectory() as td:
            bad = dict(ENTRY)
            bad.pop("crux")
            path = pathlib.Path(td) / "reg.json"
            path.write_text(json.dumps([bad]))
            with self.assertRaises(SystemExit):
                batf.load_registry(str(path))


class TestBuiltRoomConvenesOffline(unittest.TestCase):
    def test_cmd_forum_runs_on_built_inputs(self):
        model = CannedModel("contested", ENTRY["crux"], n_seats=3)
        with tempfile.TemporaryDirectory() as td:
            reg = pathlib.Path(td) / "reg.json"
            reg.write_text(json.dumps([ENTRY]))
            rooms = pathlib.Path(td) / "rooms"
            batf.cmd_build(types.SimpleNamespace(registry=str(reg), out=str(rooms),
                                                 date="2026-07-20", seats=3,
                                                 only=None, run=False))
            outdir = rooms / ENTRY["slug"]
            args = types.SimpleNamespace(
                decision=str(outdir / "decision.json"), crux=ENTRY["crux"],
                mode="seeded", seats=3, thesis=None,
                signals=str(outdir / "signals.json"), out=str(outdir),
                robustness=False, robustness_model=run.ROBUST_MODEL)
            original = run.call
            run.call = model
            try:
                import contextlib, io
                with contextlib.redirect_stderr(io.StringIO()):
                    run.cmd_forum(args)
            finally:
                run.call = original
            for artifact in ("forum-attendants.json", "forum-adjudication.json",
                             "forum-meta.json"):
                self.assertTrue((outdir / artifact).exists(), artifact)
            attendants = json.loads((outdir / "forum-attendants.json").read_text())
            self.assertEqual(len(attendants["attendants"]), 3)


if __name__ == "__main__":
    unittest.main()
