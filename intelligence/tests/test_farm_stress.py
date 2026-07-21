"""Overnight-batch stress tests for the farm harness — no model calls.

Pins the failure-injection behavior an UNATTENDED batch depends on (stress
audit 2026-07-21; overlaps bead vc-brain-fnx's farm-level slice):

1. The j3n fence vs the batch log: a log file inside intelligence/out/ trips
   the fence (this is the F1 regression — the overnight script must keep its
   log OUTSIDE the fenced tree); a log outside is invisible to it.
2. run_batch continues after one failed app (per-app isolation).
3. A timeout kills the WHOLE process group — no orphaned worker-CLI
   grandchildren burning quota into the next app's run.
4. exit-0-but-incomplete runs are failed, not trusted.
5. The circuit breaker aborts after N consecutive failures (quota/auth
   outage) and leaves the rest pending for resume — and reports are written.
6. Reports are written even when the batch loop dies unexpectedly.
7. run_is_complete rejects truncated JSON (a killed run must re-run, not be
   skipped as complete forever).
8. forum_fired_and_reason speaks the POST-INVERSION gate (vc-brain-mau).

Pipeline subprocesses are stubbed via build_pipeline_cmd monkeypatching —
the REAL run_one/run_batch/snapshot/diff code paths execute.
"""
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import time
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))
sys.path.insert(0, str(INTEL / "scripts"))

import farm_run  # noqa: E402

OK_STUB = ("mkdir -p {out} && printf '{{}}' > {out}/memo.json && "
           "printf '{{\"stages\":[{{\"stage\":\"screen\",\"seconds\":1}}],"
           "\"total_seconds\":1}}' > {out}/latency.json")
FAIL_STUB = "exit 3"
INCOMPLETE_STUB = "true"   # exit 0, writes nothing
HANG_STUB = ("mkdir -p {out} && sleep 60 & echo $! > {out}/grandchild.pid; sleep 60")


class StubbedFarm:
    """Temp intel_out + out_root, with build_pipeline_cmd stubbed per slug."""

    def __init__(self, behaviors):
        self.behaviors = behaviors     # slug -> stub template

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = pathlib.Path(self._tmp.name)
        self.intel_out = base / "out"
        self.out_root = self.intel_out / "farm-test"
        self.intel_out.mkdir()
        self._orig_cmd = farm_run.build_pipeline_cmd

        behaviors = self.behaviors
        harness = self

        def stub_cmd(*, worker, application, thesis, signals, out, forum_mode="2-pole", run_py=None):
            slug = pathlib.Path(out).name
            script = behaviors[slug].format(out=out, intel=str(harness.intel_out))
            return ["/bin/sh", "-c", script]

        farm_run.build_pipeline_cmd = stub_cmd
        return self

    def __exit__(self, *exc):
        farm_run.build_pipeline_cmd = self._orig_cmd
        self._tmp.cleanup()
        return False

    def entries(self):
        return [{"slug": s, "application": "app.json", "signals": "sig.json"}
                for s in self.behaviors]

    def run(self, **kw):
        with contextlib.redirect_stderr(io.StringIO()):
            return farm_run.run_batch(
                self.entries(), worker="claude", thesis="thesis.json",
                out_root=self.out_root, intel_out=self.intel_out,
                timeout=kw.pop("timeout", 30), **kw)


class TestLogFenceRegression(unittest.TestCase):
    """F1: the overnight log must live OUTSIDE intelligence/out/."""

    def test_log_inside_fenced_tree_trips_the_fence(self):
        with tempfile.TemporaryDirectory() as td:
            out = pathlib.Path(td) / "out"
            (out / "farm-x" / "app1").mkdir(parents=True)
            log = out / "farm-x.log"
            log.write_text("start\n")
            before = farm_run.snapshot_out_tree(out)
            time.sleep(0.02)
            with log.open("a") as f:
                f.write("[run ] app1\n")
            complaints = farm_run.diff_snapshots(before, farm_run.snapshot_out_tree(out),
                                                 "farm-x/app1")
            self.assertTrue(complaints, "a log inside out/ MUST trip the fence")
            self.assertIn("farm-x.log", complaints[0])

    def test_log_outside_fenced_tree_is_invisible(self):
        with tempfile.TemporaryDirectory() as td:
            base = pathlib.Path(td)
            out = base / "out"
            (out / "farm-x" / "app1").mkdir(parents=True)
            log = base / "farm-x.log"      # sibling of out/, like the fixed script
            log.write_text("start\n")
            before = farm_run.snapshot_out_tree(out)
            with log.open("a") as f:
                f.write("[run ] app1\n")
            complaints = farm_run.diff_snapshots(before, farm_run.snapshot_out_tree(out),
                                                 "farm-x/app1")
            self.assertEqual(complaints, [])


class TestBatchIsolationAndBreaker(unittest.TestCase):
    def test_batch_continues_after_one_failure(self):
        with StubbedFarm({"bad": FAIL_STUB, "good": OK_STUB}) as f:
            report = f.run()
        statuses = {r["slug"]: r["status"] for r in report["runs"]}
        self.assertEqual(statuses, {"bad": "failed", "good": "ok"})
        self.assertIsNone(report["aborted"])

    def test_exit_zero_but_incomplete_is_failed(self):
        with StubbedFarm({"empty": INCOMPLETE_STUB}) as f:
            report = f.run()
        row = report["runs"][0]
        self.assertEqual(row["status"], "failed")
        self.assertIn("incomplete", row["error"])

    def test_circuit_breaker_aborts_and_leaves_rest_pending(self):
        with StubbedFarm({"f1": FAIL_STUB, "f2": FAIL_STUB, "f3": FAIL_STUB,
                          "later": OK_STUB}) as f:
            report = f.run(max_consecutive_failures=3)
            self.assertTrue((f.out_root / "report.json").is_file())
            self.assertTrue((f.out_root / "REPORT.md").is_file())
        self.assertIn("circuit breaker", report["aborted"])
        statuses = {r["slug"]: r["status"] for r in report["runs"]}
        self.assertEqual(statuses,
                         {"f1": "failed", "f2": "failed", "f3": "failed",
                          "later": "pending"})

    def test_ok_resets_the_breaker(self):
        with StubbedFarm({"f1": FAIL_STUB, "f2": FAIL_STUB, "ok1": OK_STUB,
                          "f3": FAIL_STUB, "f4": FAIL_STUB, "ok2": OK_STUB}) as f:
            report = f.run(max_consecutive_failures=3)
        self.assertIsNone(report["aborted"])
        self.assertEqual([r["status"] for r in report["runs"]],
                         ["failed", "failed", "ok", "failed", "failed", "ok"])

    def test_reports_written_even_on_unexpected_crash(self):
        with StubbedFarm({"x": OK_STUB}) as f:
            orig = farm_run.run_one
            farm_run.run_one = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
            try:
                with contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(RuntimeError):
                        farm_run.run_batch(
                            f.entries(), worker="claude", thesis="t.json",
                            out_root=f.out_root, intel_out=f.intel_out, timeout=5)
            finally:
                farm_run.run_one = orig
            self.assertTrue((f.out_root / "report.json").is_file(),
                            "a crash must still leave an honest partial report")


NEIGHBOR_WRITE_STUB = ("printf '{{}}' > {intel}/neighbor-session.json && " + OK_STUB)
FENCE_ENV_STUB = ('printf "%s" "${{VCBRAIN_PIPELINE_FENCE:-unset}}" > {out}/fence.env && ' + OK_STUB)


class TestFenceScope(unittest.TestCase):
    """Concurrent-session regression (2026-07-21 live abort): another session
    writing under intelligence/out/ must not kill a batch fenced at out-root
    scope — while cross-run contamination inside the batch tree still must."""

    def test_default_scope_aborts_on_concurrent_neighbor(self):
        with StubbedFarm({"app": NEIGHBOR_WRITE_STUB}) as f:
            report = f.run()   # default fence_scope="out-tree"
        self.assertIsNotNone(report["aborted"])
        self.assertIn("neighbor-session.json", report["aborted"])

    def test_out_root_scope_tolerates_concurrent_neighbor(self):
        with StubbedFarm({"app": NEIGHBOR_WRITE_STUB}) as f:
            report = f.run(fence_scope="out-root")
        self.assertIsNone(report["aborted"])
        self.assertEqual(report["runs"][0]["status"], "ok")

    def test_out_root_scope_still_catches_cross_slug_writes(self):
        cross = ("printf '{{}}' > {out}/../other-slug-file.json && " + OK_STUB)
        with StubbedFarm({"app": cross}) as f:
            report = f.run(fence_scope="out-root")
        self.assertIsNotNone(report["aborted"])
        self.assertIn("other-slug-file.json", report["aborted"])

    def test_out_root_scope_disables_pipeline_internal_fence_via_env(self):
        with StubbedFarm({"app": FENCE_ENV_STUB}) as f:
            f.run(fence_scope="out-root")
            env_val = (f.out_root / "app" / "fence.env").read_text()
        self.assertEqual(env_val, "off")

    def test_default_scope_leaves_pipeline_internal_fence_on(self):
        with StubbedFarm({"app": FENCE_ENV_STUB}) as f:
            f.run()
            env_val = (f.out_root / "app" / "fence.env").read_text()
        self.assertEqual(env_val, "unset")


class TestTimeoutKillsProcessGroup(unittest.TestCase):
    def test_timeout_row_and_no_orphaned_grandchild(self):
        with StubbedFarm({"slow": HANG_STUB}) as f:
            report = f.run(timeout=2)
            row = report["runs"][0]
            self.assertEqual(row["status"], "timeout")
            pid_file = f.out_root / "slow" / "grandchild.pid"
            self.assertTrue(pid_file.is_file(), "stub should have spawned a grandchild")
            pid = int(pid_file.read_text().strip())
        time.sleep(0.3)
        # SIGKILL'd along with its process group => no such process (or a
        # zombie reparented to launchd — either way not our orphan running on).
        try:
            os.kill(pid, 0)
            alive = True
        except ProcessLookupError:
            alive = False
        except PermissionError:
            alive = True
        self.assertFalse(alive, f"grandchild {pid} survived the group kill — "
                                "it would burn quota into the next app's run")


class TestResumePredicate(unittest.TestCase):
    def test_truncated_latency_is_not_complete(self):
        with tempfile.TemporaryDirectory() as td:
            d = pathlib.Path(td)
            (d / "memo.json").write_text("{}")
            (d / "latency.json").write_text('{"stages": [{"stage": "scr')  # killed mid-write
            self.assertFalse(farm_run.run_is_complete(d))
            (d / "latency.json").write_text('{"stages": [], "total_seconds": 1}')
            self.assertTrue(farm_run.run_is_complete(d))

    def test_missing_files_not_complete(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertFalse(farm_run.run_is_complete(pathlib.Path(td)))


class TestPostInversionReport(unittest.TestCase):
    """vc-brain-mau: the report must speak the inverted gate, not forum_trigger."""

    def _dir(self, td, verdict, crux, forum):
        d = pathlib.Path(td)
        (d / "screen.json").write_text(json.dumps({"verdict": verdict}))
        (d / "triage.json").write_text(json.dumps({"crux": crux}))
        if forum:
            (d / "forum-adjudication.json").write_text("{}")
        return d

    def test_advance_with_crux_and_artifacts_reads_fired(self):
        with tempfile.TemporaryDirectory() as td:
            fired, reason = farm_run.forum_fired_and_reason(
                self._dir(td, "advance", "is the moat durable", forum=True))
        self.assertTrue(fired)
        self.assertNotIn("would skip", reason)
        self.assertIn("not rejected", reason)

    def test_contested_with_artifacts_reads_fired(self):
        # The OLD report shape called every fired room "gate would skip"; the
        # room convenes for contested too.
        with tempfile.TemporaryDirectory() as td:
            fired, reason = farm_run.forum_fired_and_reason(
                self._dir(td, "contested", "crux", forum=True))
        self.assertTrue(fired)
        self.assertNotIn("would skip", reason)

    def test_reject_without_artifacts_reads_skipped_with_inverted_reason(self):
        with tempfile.TemporaryDirectory() as td:
            fired, reason = farm_run.forum_fired_and_reason(
                self._dir(td, "reject", "crux", forum=False))
        self.assertFalse(fired)
        self.assertEqual(reason, "screen verdict is 'reject'")

    def test_blank_crux_without_artifacts_reads_skipped(self):
        with tempfile.TemporaryDirectory() as td:
            fired, reason = farm_run.forum_fired_and_reason(
                self._dir(td, "advance", "   ", forum=False))
        self.assertFalse(fired)
        self.assertEqual(reason, "triage crux is blank")

    def test_gate_fires_but_no_artifacts_flags_early_death(self):
        with tempfile.TemporaryDirectory() as td:
            fired, reason = farm_run.forum_fired_and_reason(
                self._dir(td, "advance", "crux", forum=False))
        self.assertFalse(fired)
        self.assertIn("died pre-forum", reason)


if __name__ == "__main__":
    unittest.main()
