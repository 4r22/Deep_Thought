"""Bounded-retry tests for the model-call seam — no live calls.

The overnight hardening (stress audit 2026-07-21) added exactly TWO retries,
both bounded to one attempt each:

1. call(): a SHAPE failure (unparseable worker JSON, schema-invalid output)
   retries once with the violation named in the reprompt. Environment
   failures (binary missing, not logged in, refusal) are never retried.
2. stage_counsel's one_office: a counsel POSTCHECK violation (schema-valid
   but rule-breaking output) retries the office call once.

These tests pin: retry fires only on retryable messages, is bounded, feeds
the violation back, and exhaustion still dies loudly with the original
SystemExit discipline.
"""
import contextlib
import io
import pathlib
import sys
import types
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402
from test_counsel import member  # noqa: E402  (canned schema-valid office outputs)

FIXTURES = INTEL / "fixtures"
VALID_SCREEN = {
    "verdict": "advance",
    "thesis_fit": {"in_scope": True, "mismatches": []},
    "missing_minimums": [],
    "red_flags": [],
    "rationale": "canned",
    "confidence": "medium",
}


class FakeBackend:
    """Stands in for call_api at the backend seam (below call()'s retry)."""

    def __init__(self, outputs):
        self.outputs = list(outputs)      # values returned, or exceptions raised
        self.prompts = []

    def __call__(self, prompt_text, json_schema=None, max_tokens=16000, model=None):
        self.prompts.append(prompt_text)
        out = self.outputs.pop(0)
        if isinstance(out, BaseException):
            raise out
        return out, None


class CallRetryHarness(unittest.TestCase):
    def setUp(self):
        self._worker, self._api = run.WORKER, run.call_api
        run.WORKER = "api"

    def tearDown(self):
        run.WORKER, run.call_api = self._worker, self._api

    def drive(self, outputs, json_schema):
        fake = FakeBackend(outputs)
        run.call_api = fake
        with contextlib.redirect_stderr(io.StringIO()):
            result, _ = run.call("prompt", json_schema)
        return result, fake


class TestCallSeamRetry(CallRetryHarness):
    def test_schema_invalid_output_retries_once_with_violation_named(self):
        result, fake = self.drive([{"verdict": "advance"},        # missing required keys
                                   VALID_SCREEN],
                                  run.schema("screen.schema.json"))
        self.assertEqual(result["verdict"], "advance")
        self.assertEqual(len(fake.prompts), 2)
        self.assertIn("Previous attempt rejected", fake.prompts[1])
        self.assertIn("invalid", fake.prompts[1])

    def test_retry_is_bounded_then_dies_loudly(self):
        fake = FakeBackend([{}, {}])                              # invalid twice
        run.call_api = fake
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as ctx:
                run.call("prompt", run.schema("screen.schema.json"))
        self.assertIn("invalid", str(ctx.exception))
        self.assertEqual(len(fake.prompts), 2, "exactly one retry, never more")

    def test_environment_failures_are_never_retried(self):
        for msg in ("claude CLI not found on PATH",
                    "claude CLI is not logged in — run `claude /login` once",
                    "model refused the request (stop_reason=refusal)",
                    "cursor-agent exited 1:\nboom"):
            fake = FakeBackend([SystemExit(msg), VALID_SCREEN])
            run.call_api = fake
            with self.assertRaises(SystemExit):
                run.call("prompt", run.schema("screen.schema.json"))
            self.assertEqual(len(fake.prompts), 1, f"retried on: {msg!r}")

    def test_unparseable_worker_json_is_retryable(self):
        result, fake = self.drive(
            [SystemExit("worker returned no JSON object; tail:\nblah"), VALID_SCREEN],
            run.schema("screen.schema.json"))
        self.assertEqual(result, VALID_SCREEN)
        self.assertEqual(len(fake.prompts), 2)

    def test_markdown_stages_never_retry(self):
        # json_schema=None (forum interviews/debate) — shape retry does not apply.
        fake = FakeBackend([SystemExit("worker returned no JSON object; tail:\nx")])
        run.call_api = fake
        with self.assertRaises(SystemExit):
            run.call("prompt", None)
        self.assertEqual(len(fake.prompts), 1)


class TestCounselPostcheckRetry(unittest.TestCase):
    """A schema-valid but postcheck-violating office output retries once."""

    def setUp(self):
        self._call = run.call
        self.args = types.SimpleNamespace(
            application=str(FIXTURES / "application-ferrite.json"),
            thesis=str(INTEL.parent / "config" / "thesis.example.json"),
            signals=str(FIXTURES / "signals-ferrite.json"))

    def tearDown(self):
        run.call = self._call

    def drive_stage(self, first_founder):
        calls = {"founder": 0, "market": 0, "idea_vs_market": 0}

        def fake_call(prompt_text, json_schema=None, max_tokens=16000, model=None):
            label = json_schema["_label"]
            axis = {"counsel-founder": "founder", "counsel-market": "market",
                    "counsel-idea-vs-market": "idea_vs_market"}[label]
            calls[axis] += 1
            if axis == "founder" and calls[axis] == 1:
                return first_founder, None
            return member(axis, convened=False), None

        run.call = fake_call
        screen = {"verdict": "reject"}
        triage = {"crux": ""}
        with contextlib.redirect_stderr(io.StringIO()):
            counsel, axes = run.stage_counsel(self.args, screen, triage, None)
        return counsel, calls

    def test_postcheck_violation_retries_once_and_recovers(self):
        # Degraded (no-room) sitting, but the first founder output cites a
        # seat — fabricated refs, the postcheck kills it, retry recovers.
        bad = member("founder", convened=False)
        bad["position_refs"] = ["seat-1/post"]
        counsel, calls = self.drive_stage(bad)
        self.assertEqual(calls, {"founder": 2, "market": 1, "idea_vs_market": 1})
        self.assertEqual(counsel["members"]["founder"]["position_refs"], [])

    def test_postcheck_retry_exhaustion_dies_loudly(self):
        bad = member("founder", convened=False)
        bad["position_refs"] = ["seat-1/post"]

        def always_bad(prompt_text, json_schema=None, max_tokens=16000, model=None):
            label = json_schema["_label"]
            if label == "counsel-founder":
                return dict(bad), None
            axis = {"counsel-market": "market",
                    "counsel-idea-vs-market": "idea_vs_market"}[label]
            return member(axis, convened=False), None

        run.call = always_bad
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as ctx:
                run.stage_counsel(self.args, {"verdict": "reject"}, {"crux": ""}, None)
        self.assertIn("never met", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
