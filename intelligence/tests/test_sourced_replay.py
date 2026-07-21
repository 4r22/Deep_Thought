"""Sourced-record replay — sourcing gate + pipeline sorting as ONE funnel.

Proves on the REAL cmd_pipeline (offline; CannedModel at the single call seam,
same harness as test_pipeline_replay) that the outbound-sourced path behaves:

1. an application assembled by sourcing.to_application from a pass-tier repo
   drives the full inverted pipeline end to end — adapter output and pipeline
   input cannot drift apart, because this test runs one into the other;
2. the sourced record actually reaches the screen prompt (data flows, not
   just shape) with its provenance tag intact;
3. a thin sourced record is refused at the door with ZERO model calls;
4. a screen 'reject' on a sourced record skips the forum but still completes
   the run — the sorting behavior the funnel promises for weak-but-valid data.
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
import sourcing  # noqa: E402
from test_pipeline_replay import CRUX_MARKER, CannedModel, _Replay  # noqa: E402
from test_sourcing_gate import RICH_README, make_repo  # noqa: E402


def sourced_application(tmp):
    """A real adapter product: synthetic pass-tier repo -> assess_repo -> application."""
    repo = make_repo(tmp, "acme__dealscope", readme=RICH_README, code_files=6)
    rec = sourcing.assess_repo(repo, meta={
        "full_name": "acme/dealscope",
        "description": "AI analyst that screens startup applications into cited memos",
        "owner": {"login": "acme", "html_url": "https://github.com/acme"},
        "html_url": "https://github.com/acme/dealscope",
        "pushed_at": "2026-07-19T00:00:00Z"}, archive_label="test-archive")
    assert rec["verdict"] == "pass", rec["reasons"]
    return rec["application"]


class TestSourcedRecordFlows(unittest.TestCase):
    def test_pass_tier_sourced_application_completes_pipeline(self):
        model = CannedModel("contested", CRUX_MARKER)
        with tempfile.TemporaryDirectory() as td:
            app = sourced_application(td)
            app_path = pathlib.Path(td) / "sourced.json"
            app_path.write_text(json.dumps(app))
            with _Replay(model) as rp:
                rp.args.application = str(app_path)
                rp.run()
                self.assertTrue(rp.exists("memo.json"))
                self.assertTrue(rp.exists("latency.json"))
            screen_prompt = model.prompts_for("screen")[0]
            self.assertIn("dealscope", screen_prompt)
            self.assertIn("sourced-github:test-archive", screen_prompt)
            # sourced records have no ask — the screen prompt must render anyway
            self.assertNotIn("{{APPLICATION_JSON}}", screen_prompt)

    def test_thin_sourced_record_refused_with_zero_model_calls(self):
        model = CannedModel("advance", CRUX_MARKER)
        with tempfile.TemporaryDirectory() as td:
            thin = {"company_name": "stub", "one_liner": "wip",
                    "source": "sourced-github:test-archive"}
            path = pathlib.Path(td) / "thin.json"
            path.write_text(json.dumps(thin))
            with _Replay(model) as rp:
                rp.args.application = str(path)
                with self.assertRaises(SystemExit) as ctx:
                    rp.run()
            self.assertIn("application gate REFUSED", str(ctx.exception))
            self.assertEqual(model.calls, [])

    def test_reject_screen_on_sourced_record_skips_forum_but_completes(self):
        model = CannedModel("reject", CRUX_MARKER)
        with tempfile.TemporaryDirectory() as td:
            app = sourced_application(td)
            app_path = pathlib.Path(td) / "sourced.json"
            app_path.write_text(json.dumps(app))
            with _Replay(model) as rp:
                rp.args.application = str(app_path)
                rp.run()
                self.assertTrue(rp.exists("memo.json"))
            self.assertEqual(model.prompts_for("forum:seed"), [])


if __name__ == "__main__":
    unittest.main()
