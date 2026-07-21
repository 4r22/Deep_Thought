"""VCBRAIN_FENCE_ALLOW globs — legitimate-concurrent-writer escape hatch (vc-brain-kei).

The j3n write-fence snapshots all of intelligence/out/ and fails on any
change outside the active -o dir, which made concurrent pipeline runs
impossible (observed live: a tape build aborted because a batch in another
session was writing its own farm-trial output dirs). The fix:
VCBRAIN_FENCE_ALLOW, comma-separated fnmatch globs excluded from the
contamination diff. Pinned here: default stays strict, globs only exempt
what they match, and the active -o prefix keeps working alongside them.

Pure-function tests over contamination_violations — no model calls, no fs.
"""
import os
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402


class TestFenceAllowGlobs(unittest.TestCase):
    def setUp(self):
        self._saved = os.environ.get("VCBRAIN_FENCE_ALLOW")

    def tearDown(self):
        if self._saved is None:
            os.environ.pop("VCBRAIN_FENCE_ALLOW", None)
        else:
            os.environ["VCBRAIN_FENCE_ALLOW"] = self._saved

    def test_default_is_strict(self):
        os.environ.pop("VCBRAIN_FENCE_ALLOW", None)
        before = {"my-run/memo.json": 1.0}
        after = {"my-run/memo.json": 1.0, "farm-trial-x/slug/screen.json": 2.0}
        self.assertEqual(run.contamination_violations(before, after, "my-run"),
                         ["farm-trial-x/slug/screen.json"])

    def test_glob_exempts_matching_concurrent_writer(self):
        os.environ["VCBRAIN_FENCE_ALLOW"] = "farm-trial-*/*"
        before = {"my-run/memo.json": 1.0}
        after = {"my-run/memo.json": 1.0,
                 "farm-trial-batch/slug/screen.json": 2.0,
                 "farm-trial-batch/REPORT.md": 3.0}
        self.assertEqual(run.contamination_violations(before, after, "my-run"), [])

    def test_glob_does_not_exempt_nonmatching_paths(self):
        os.environ["VCBRAIN_FENCE_ALLOW"] = "farm-trial-*/*"
        before = {}
        after = {"other-run/memo.json": 1.0}
        self.assertEqual(run.contamination_violations(before, after, "my-run"),
                         ["other-run/memo.json"])

    def test_multiple_globs_comma_separated_with_whitespace(self):
        os.environ["VCBRAIN_FENCE_ALLOW"] = "farm-trial-*/*, reruns/*"
        before = {}
        after = {"farm-trial-x/a.json": 1.0,
                 "reruns/pair/forum-debate.md": 2.0,
                 "stray.json": 3.0}
        self.assertEqual(run.contamination_violations(before, after, "my-run"),
                         ["stray.json"])

    def test_active_prefix_still_allowed_alongside_globs(self):
        os.environ["VCBRAIN_FENCE_ALLOW"] = "farm-trial-*/*"
        before = {"my-run/memo.json": 1.0}
        after = {"my-run/memo.json": 9.0, "my-run/axes.json": 2.0}
        self.assertEqual(run.contamination_violations(before, after, "my-run"), [])

    def test_none_prefix_stays_fully_fenced_without_globs(self):
        # -o outside out/: every out/ mutation is a violation (strict intent).
        os.environ.pop("VCBRAIN_FENCE_ALLOW", None)
        before = {}
        after = {"anything/at-all.json": 1.0}
        self.assertEqual(run.contamination_violations(before, after, None),
                         ["anything/at-all.json"])


if __name__ == "__main__":
    unittest.main()
