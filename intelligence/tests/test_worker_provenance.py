"""worker_model() — meta/latency record provenance, not config (vc-brain-ytl).

MODEL is a config knob (VCBRAIN_MODEL, default claude-opus-4-8). The cursor
worker ignores it entirely and runs CURSOR_MODEL, so writing MODEL into
forum-meta.json mislabeled ten 2026-07-21 design rooms as opus while they
actually ran cursor-grok-4.5-high. Pinned here: the recorded model follows
the ACTIVE WORKER, and a worker field always accompanies it so a reader
never has to infer the backend from a null token count.
"""
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402


class TestWorkerModelProvenance(unittest.TestCase):
    def setUp(self):
        self._worker = run.WORKER

    def tearDown(self):
        run.WORKER = self._worker

    def test_cursor_worker_reports_its_pinned_model_not_the_config_echo(self):
        run.WORKER = "cursor"
        self.assertEqual(run.worker_model(), run.CURSOR_MODEL)
        self.assertNotEqual(run.worker_model(), run.MODEL)

    def test_claude_worker_reports_the_configured_model(self):
        run.WORKER = "claude"
        self.assertEqual(run.worker_model(), run.MODEL)

    def test_api_worker_reports_the_configured_model(self):
        run.WORKER = "api"
        self.assertEqual(run.worker_model(), run.MODEL)


if __name__ == "__main__":
    unittest.main()
