"""Input-gate tests — the data door in front of the pipeline (bead vc-brain-asp).

The invariant under test: bad DATA never reaches a model. gate_application is
a pure verdict function (never raises, names its reasons); load_application is
the single seam every --application flag loads through, and it refuses before
call() can spend a token. The screen keeps judging DEALS — a gated-through
record with a missing deck stays the screen's missing_minimums territory.
"""
import json
import pathlib
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402

FERRITE = INTEL / "fixtures" / "application-ferrite.json"


def gate(app):
    return run.gate_application(app)


class TestGateAcceptsRealRecords(unittest.TestCase):
    def test_ferrite_fixture_passes(self):
        report = gate(json.loads(FERRITE.read_text()))
        self.assertEqual(report["verdict"], "pass", report["reasons"])


class TestGateRefusesBadData(unittest.TestCase):
    def refused(self, app, expect_fragment):
        report = gate(app)
        self.assertEqual(report["verdict"], "refuse", f"expected refusal for {app!r}")
        self.assertTrue(any(expect_fragment in r for r in report["reasons"]),
                        f"no reason mentions {expect_fragment!r}: {report['reasons']}")
        return report

    def test_non_object(self):
        for bad in (None, [], "hello", 7):
            self.assertEqual(gate(bad)["verdict"], "refuse")

    def test_empty_object(self):
        self.refused({}, "company_name")

    def test_placeholder_company_name(self):
        self.refused({"company_name": "TBD",
                      "one_liner": "A serious sentence describing a real product here."},
                     "company_name")

    def test_one_liner_too_short(self):
        self.refused({"company_name": "Acme", "one_liner": "An app."}, "one_liner")

    def test_lorem_ipsum_is_not_substance(self):
        self.refused({"company_name": "Acme",
                      "one_liner": "Lorem ipsum dolor sit amet consectetur adipiscing elit sed."},
                     "one_liner")

    def test_thin_substance_refused(self):
        # A real one-liner but nothing else: under the substance floor.
        self.refused({"company_name": "Acme",
                      "one_liner": "Continuous founder-quality memory for seed funds."},
                     "substance")

    def test_placeholder_founder_name_refused(self):
        self.refused({"company_name": "Acme",
                      "one_liner": "Continuous founder-quality memory for seed funds and angels.",
                      "founder": {"name": "???"},
                      "deck_claims": ["x" * 300]},
                     "founder.name")

    def test_garbage_shapes_never_raise(self):
        # Hostile/wrong types must produce a verdict, not a traceback.
        for app in ({"company_name": 3, "one_liner": {"a": 1}},
                    {"company_name": "Acme", "one_liner": "words " * 10,
                     "deck_claims": "not-a-list", "founder": "not-a-dict"},
                    {"deck_claims": [None, 4, {}]},):
            self.assertIn(gate(app)["verdict"], ("pass", "refuse"))

    def test_placeholder_claims_count_zero_substance(self):
        report = gate({"company_name": "Acme",
                       "one_liner": "Continuous founder-quality memory for seed funds.",
                       "deck_claims": ["TODO", "tbd", "----", "lorem ipsum " * 30]})
        self.assertEqual(report["verdict"], "refuse")
        self.assertEqual(report["metrics"]["informative_claims"], 0)


class TestLoadApplicationSeam(unittest.TestCase):
    def test_load_refuses_thin_file(self):
        with tempfile.TemporaryDirectory() as td:
            path = pathlib.Path(td) / "thin.json"
            path.write_text(json.dumps({"company_name": "Acme", "one_liner": "An app."}))
            with self.assertRaises(SystemExit) as ctx:
                run.load_application(str(path))
            self.assertIn("application gate REFUSED", str(ctx.exception))

    def test_load_passes_ferrite(self):
        app = run.load_application(str(FERRITE))
        self.assertEqual(app["company_name"], "Ferrite")

    def test_stage_refuses_before_any_model_call(self):
        """The load-bearing claim: refusal happens BEFORE call() — a thin
        application must never cost a token."""
        def exploding_call(*a, **k):
            raise AssertionError("model call attempted on gated-out application")
        original = run.call
        run.call = exploding_call
        try:
            with tempfile.TemporaryDirectory() as td:
                path = pathlib.Path(td) / "thin.json"
                path.write_text(json.dumps({"company_name": "x"}))
                args = type("A", (), {"application": str(path),
                                      "thesis": str(INTEL.parent / "config" / "thesis.example.json"),
                                      "signals": None})()
                with self.assertRaises(SystemExit):   # gate refusal, not AssertionError
                    run.stage_screen(args)
        finally:
            run.call = original


if __name__ == "__main__":
    unittest.main()
