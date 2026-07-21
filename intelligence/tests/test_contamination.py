"""Unit tests for out/ contamination detection (bead vc-brain-j3n).

Pure function over two path→mtime snapshots: files that appear, vanish, or
change outside the active -o prefix are violations. No filesystem, no model.
"""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from run import contamination_violations  # noqa: E402


class TestContaminationViolations(unittest.TestCase):
    def test_clean_when_only_allowed_prefix_changes(self):
        before = {"other/run/a.json": 1, "active/screen.json": 1}
        after = {"other/run/a.json": 1, "active/screen.json": 2, "active/axes.json": 3}
        self.assertEqual(contamination_violations(before, after, "active"), [])

    def test_flags_new_file_outside_allowed(self):
        before = {"active/screen.json": 1}
        after = {
            "active/screen.json": 1,
            "other-run/memo-snapshot-draft.json": 9,
        }
        self.assertEqual(
            contamination_violations(before, after, "active"),
            ["other-run/memo-snapshot-draft.json"],
        )

    def test_flags_mtime_change_outside_allowed(self):
        before = {"other-run/memo.json": 1, "active/x.json": 1}
        after = {"other-run/memo.json": 2, "active/x.json": 2}
        self.assertEqual(
            contamination_violations(before, after, "active"),
            ["other-run/memo.json"],
        )

    def test_flags_deletion_outside_allowed(self):
        before = {"other/keep.json": 1, "active/x.json": 1}
        after = {"active/x.json": 1}
        self.assertEqual(
            contamination_violations(before, after, "active"),
            ["other/keep.json"],
        )

    def test_none_allowed_prefix_flags_any_change(self):
        before = {"a.json": 1}
        after = {"a.json": 1, "b.json": 2}
        self.assertEqual(contamination_violations(before, after, None), ["b.json"])
        self.assertEqual(contamination_violations(before, after, ""), ["b.json"])

    def test_nested_allowed_prefix_does_not_match_sibling(self):
        before = {}
        after = {"run/x.json": 1, "run-extra/y.json": 1}
        self.assertEqual(
            contamination_violations(before, after, "run"),
            ["run-extra/y.json"],
        )

    def test_identical_snapshots_clean(self):
        snap = {"a/b.json": 1, "c.json": 2}
        self.assertEqual(contamination_violations(snap, snap, "a"), [])


if __name__ == "__main__":
    unittest.main()
