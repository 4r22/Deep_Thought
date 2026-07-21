"""claude-CLI backend — offline plumbing proof (no login, no network).

A fake `claude` shim on PATH stands in for the real CLI. Proves: the backend
finds and invokes the binary with -p/--model/--max-turns, pipes the prompt via
stdin, appends the enforced-JSON suffix, extracts + returns the object, honors
per-call model overrides, scrubs the host session's CLAUDE*/ANTHROPIC* env
(a nested session must use the CLI's own login), and surfaces the
not-logged-in state as a clear SystemExit.

Also pins the two vc-brain-lbe robustness fixes end-to-end: the turn budget
(--max-turns 8, not 1) and seed-count conformance (wrong attendant count for
the seat count → named seed_count reason, one retry, bounded).
"""
import contextlib
import io
import json
import os
import pathlib
import stat
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402

SHIM = """#!/bin/sh
# fake claude CLI: records argv + env evidence, answers with JSON
prompt=$(cat)
suffix=false
case "$prompt" in *"Output format (enforced)"*) suffix=true;; esac
cat > "$SHIM_LOG" <<EOF
{"argv": "$*", "claudecode_env": "${CLAUDECODE:-unset}",
 "anthropic_base": "${ANTHROPIC_BASE_URL:-unset}",
 "prompt_has_schema_suffix": $suffix}
EOF
printf '%s' '{"ok": true, "echo": "from-shim"}'
"""

NOT_LOGGED_IN_SHIM = """#!/bin/sh
cat > /dev/null
printf 'Not logged in \xc2\xb7 Please run /login'
"""


class ShimEnv:
    def __init__(self, shim_body):
        self.shim_body = shim_body

    def __enter__(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = pathlib.Path(self.tmp.name)
        shim = d / "claude"
        shim.write_text(self.shim_body)
        shim.chmod(shim.stat().st_mode | stat.S_IEXEC)
        self.log = d / "shim-log.json"
        self.old_path = os.environ.get("PATH", "")
        self.old_cc = os.environ.get("CLAUDECODE")
        os.environ["PATH"] = f"{d}:{self.old_path}"
        os.environ["CLAUDECODE"] = "1"           # simulate the nested-session env
        os.environ["SHIM_LOG"] = str(self.log)
        return self

    def __exit__(self, *exc):
        os.environ["PATH"] = self.old_path
        if self.old_cc is None:
            os.environ.pop("CLAUDECODE", None)
        else:
            os.environ["CLAUDECODE"] = self.old_cc
        os.environ.pop("SHIM_LOG", None)
        self.tmp.cleanup()
        return False


class TestClaudeBackend(unittest.TestCase):
    def test_json_call_flows_and_env_is_scrubbed(self):
        with ShimEnv(SHIM) as env:
            result, usage = run.call_claude(
                "hello room", json_schema={"type": "object", "_label": "t"})
            self.assertEqual(result, {"ok": True, "echo": "from-shim"})
            self.assertIsNone(usage)
            log = json.loads(env.log.read_text())
            self.assertIn("--model", log["argv"])
            self.assertIn(run.MODEL, log["argv"])
            # Turn budget is 8, not 1: --max-turns 1 was a coin-flip — one
            # stray extra turn killed the adjudication stage LAST, after the
            # room's tokens were spent (vc-brain-lbe).
            self.assertIn("--max-turns 8", log["argv"])
            # Tools stay disabled alongside the budget (complementary): a
            # worker that reaches for a tool burns turns and died with
            # "Reached max turns (1)" — observed non-deterministically on the
            # room-doubling adjudication stage (vc-brain-6w6). Every stage
            # here is pure text-in/JSON-out.
            self.assertIn("--tools", log["argv"])
            self.assertEqual(log["claudecode_env"], "unset")   # scrubbed
            self.assertEqual(log["anthropic_base"], "unset")   # scrubbed
            self.assertTrue(log["prompt_has_schema_suffix"])

    def test_model_override_honored(self):
        with ShimEnv(SHIM) as env:
            run.call_claude("x", json_schema={"type": "object"},
                            model="claude-sonnet-5")
            log = json.loads(env.log.read_text())
            self.assertIn("claude-sonnet-5", log["argv"])

    def test_turn_budget_override_flows_to_argv(self):
        # VCBRAIN_CLAUDE_TURNS is read into run.CLAUDE_TURNS at import; pin
        # that the variable (not a re-hardcoded literal) reaches the CLI.
        with ShimEnv(SHIM) as env:
            saved = run.CLAUDE_TURNS
            run.CLAUDE_TURNS = "3"
            try:
                run.call_claude("x", json_schema={"type": "object"})
            finally:
                run.CLAUDE_TURNS = saved
            log = json.loads(env.log.read_text())
            self.assertIn("--max-turns 3", log["argv"])

    def test_plain_text_call_returns_text(self):
        with ShimEnv(SHIM):
            result, _ = run.call_claude("just words, no schema")
            self.assertEqual(result, '{"ok": true, "echo": "from-shim"}')

    def test_not_logged_in_is_a_clear_refusal(self):
        with ShimEnv(NOT_LOGGED_IN_SHIM):
            with self.assertRaises(SystemExit) as ctx:
                run.call_claude("x", json_schema={"type": "object"})
            self.assertIn("claude /login", str(ctx.exception))


SEQ_SHIM = """#!/bin/sh
# fake claude CLI: replays canned responses in order, records each prompt
prompt=$(cat)
n=$(cat "$SHIM_COUNT" 2>/dev/null || echo 0)
n=$((n+1))
printf '%s' "$n" > "$SHIM_COUNT"
printf '%s' "$prompt" > "$SHIM_DIR/prompt-$n.txt"
cat "$SHIM_DIR/response-$n.json"
"""


class SeqShimEnv(ShimEnv):
    """Stateful shim: response-N.json answers the Nth call, prompts recorded."""

    def __init__(self, responses):
        super().__init__(SEQ_SHIM)
        self.responses = responses

    def __enter__(self):
        super().__enter__()
        d = pathlib.Path(self.tmp.name)
        os.environ["SHIM_COUNT"] = str(d / "count")
        os.environ["SHIM_DIR"] = str(d)
        for i, resp in enumerate(self.responses, 1):
            (d / f"response-{i}.json").write_text(json.dumps(resp))
        return self

    def __exit__(self, *exc):
        os.environ.pop("SHIM_COUNT", None)
        os.environ.pop("SHIM_DIR", None)
        return super().__exit__(*exc)

    def calls(self):
        count = pathlib.Path(self.tmp.name) / "count"
        return int(count.read_text()) if count.exists() else 0

    def prompt(self, n):
        return (pathlib.Path(self.tmp.name) / f"prompt-{n}.txt").read_text()


def seed_attendant(i):
    """A minimal forum-seed.schema.json-valid attendant."""
    return {
        "id": f"seat-{i}", "handle": f"Person {i}", "slug": f"person-{i}",
        "invitation": {"invited_by": "evidence-record", "reason": f"essay {i}"},
        "lens": "reads the deal through x", "mandate": "presses sig-001",
        "evidence_refs": ["sig-001"], "decisive_question": f"question {i}?",
        "opening_lean": "for",
    }


def seed_payload(n):
    return {"crux_restatement": "the crux",
            "attendants": [seed_attendant(i) for i in range(1, n + 1)],
            "room_note": "spans the disagreement"}


class TestSeedCountConformance(unittest.TestCase):
    """stage_forum_seed through the real claude backend: a schema-valid seed
    with the WRONG attendant count for the seat count (observed live — the
    claude worker returned 6 for a 5-seat room, bead vc-brain-lbe) fails fast
    with the violation named (seed_count), retries exactly once with the
    reason fed back, and never reaches a downstream stage."""

    def setUp(self):
        self._worker = run.WORKER
        run.WORKER = "claude"

    def tearDown(self):
        run.WORKER = self._worker

    def test_wrong_count_names_reason_retries_once_and_recovers(self):
        with SeqShimEnv([seed_payload(6), seed_payload(5)]) as env:
            with contextlib.redirect_stderr(io.StringIO()):
                seeds = run.stage_forum_seed("{}", {"id": "d"}, "crux?", "[]", 5)
            self.assertEqual(len(seeds["attendants"]), 5)
            self.assertEqual(env.calls(), 2)
            reprompt = env.prompt(2)
            self.assertIn("Previous attempt rejected", reprompt)
            self.assertIn("seed_count", reprompt)
            self.assertIn("returned 6 attendants", reprompt)

    def test_wrong_count_retry_is_bounded_then_dies_loudly(self):
        with SeqShimEnv([seed_payload(6), seed_payload(4)]) as env:
            with contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    run.stage_forum_seed("{}", {"id": "d"}, "crux?", "[]", 5)
            self.assertIn("seed_count", str(ctx.exception))
            self.assertEqual(env.calls(), 2, "exactly one retry, never more")

    def test_right_count_passes_without_retry(self):
        with SeqShimEnv([seed_payload(5)]) as env:
            seeds = run.stage_forum_seed("{}", {"id": "d"}, "crux?", "[]", 5)
            self.assertEqual(len(seeds["attendants"]), 5)
            self.assertEqual(env.calls(), 1)


if __name__ == "__main__":
    unittest.main()
