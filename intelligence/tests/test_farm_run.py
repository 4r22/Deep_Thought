#!/usr/bin/env python3
"""Unit tests for farm_run pure helpers (bead vc-brain-mau)."""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))
import farm_run as fr  # noqa: E402


class TestManifestParsing(unittest.TestCase):
    def test_list_manifest(self):
        data = [
            {"application": "/a/app.json", "signals": "/a/sig.json", "slug": "alpha"},
            {"application": "/a/b.json", "signals": "/a/sig.json", "slug": "beta"},
        ]
        entries = fr.parse_manifest(data)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["slug"], "alpha")
        self.assertEqual(entries[1]["application"], "/a/b.json")

    def test_object_manifest_entries_key(self):
        data = {"entries": [
            {"application": "x.json", "signals": "s.json", "slug": "x"},
        ]}
        entries = fr.parse_manifest(data)
        self.assertEqual(entries[0]["slug"], "x")

    def test_object_manifest_candidates_key(self):
        data = {"candidates": [
            {"application": "x.json", "signals": "s.json", "slug": "y"},
        ]}
        self.assertEqual(fr.parse_manifest(data)[0]["slug"], "y")

    def test_default_signals_fills_missing(self):
        data = [{"application": "a.json", "slug": "a"}]
        entries = fr.parse_manifest(data, default_signals="/shared/signals.json")
        self.assertEqual(entries[0]["signals"], "/shared/signals.json")

    def test_missing_slug_raises(self):
        with self.assertRaises(ValueError):
            fr.parse_manifest([{"application": "a.json", "signals": "s.json"}])

    def test_missing_signals_raises(self):
        with self.assertRaises(ValueError):
            fr.parse_manifest([{"application": "a.json", "slug": "a"}])

    def test_glob_applications(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "application-acme.json").write_text("{}", encoding="utf-8")
            (root / "application-beta.json").write_text("{}", encoding="utf-8")
            (root / "notes.txt").write_text("nope", encoding="utf-8")
            entries = fr.entries_from_application_glob(
                str(root / "application-*.json"),
                signals=str(root / "signals.json"),
            )
            slugs = sorted(e["slug"] for e in entries)
            self.assertEqual(slugs, ["acme", "beta"])
            self.assertTrue(entries[0]["application"].endswith(".json"))


class TestSnapshotDiff(unittest.TestCase):
    def test_active_dir_changes_are_ok(self):
        before = {"farm/demo/screen.json": 1.0, "other/memo.json": 2.0}
        after = {
            "farm/demo/screen.json": 1.5,  # mtime bump inside active
            "farm/demo/memo.json": 3.0,    # new inside active
            "other/memo.json": 2.0,
        }
        self.assertEqual(fr.diff_snapshots(before, after, "farm/demo"), [])

    def test_foreign_new_file_is_contamination(self):
        before = {"farm/demo/screen.json": 1.0}
        after = {
            "farm/demo/screen.json": 1.0,
            "other-run/memo.json": 9.0,
        }
        hits = fr.diff_snapshots(before, after, "farm/demo")
        self.assertEqual(len(hits), 1)
        self.assertIn("NEW", hits[0])
        self.assertIn("other-run/memo.json", hits[0])

    def test_foreign_mtime_change_is_contamination(self):
        before = {"farm/a/x": 1.0, "ferrite-full/memo.json": 5.0}
        after = {"farm/a/x": 1.0, "ferrite-full/memo.json": 5.5}
        hits = fr.diff_snapshots(before, after, "farm/a")
        self.assertTrue(any("MTIME" in h and "ferrite-full" in h for h in hits))

    def test_foreign_delete_is_contamination(self):
        before = {"farm/a/x": 1.0, "other/y": 2.0}
        after = {"farm/a/x": 1.0}
        hits = fr.diff_snapshots(before, after, "farm/a")
        self.assertTrue(any("DELETED" in h for h in hits))

    def test_snapshot_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "farm" / "a").mkdir(parents=True)
            f = root / "farm" / "a" / "memo.json"
            f.write_text("{}", encoding="utf-8")
            snap = fr.snapshot_out_tree(root)
            self.assertIn("farm/a/memo.json", snap)
            time.sleep(0.02)
            f.write_text('{"x":1}', encoding="utf-8")
            after = fr.snapshot_out_tree(root)
            hits = fr.diff_snapshots(snap, after, "farm/other")
            self.assertTrue(any("MTIME" in h for h in hits))
            self.assertEqual(fr.diff_snapshots(snap, after, "farm/a"), [])


class TestReportAggregation(unittest.TestCase):
    def _row(self, **kw):
        base = {
            "slug": "x",
            "status": "ok",
            "screen_verdict": "contested",
            "forum_fired": True,
            "forum_gate_reason": "ok",
            "decision_recommendation": "advance",
            "conditions_count": 2,
            "total_seconds": 100.0,
            "tokens": None,
            "error": None,
        }
        base.update(kw)
        return base

    def test_fire_rate_and_latency(self):
        rows = [
            self._row(slug="a", forum_fired=True, total_seconds=10, screen_verdict="contested"),
            self._row(slug="b", forum_fired=False, total_seconds=30, screen_verdict="advance",
                      decision_recommendation="pass"),
            self._row(slug="c", status="skipped", forum_fired=True, total_seconds=20,
                      screen_verdict="contested"),
            self._row(slug="d", status="failed", forum_fired=None, total_seconds=None,
                      screen_verdict=None),
        ]
        ag = fr.aggregate_rows(rows)
        self.assertEqual(ag["forum_fired"], 2)
        self.assertEqual(ag["forum_eligible"], 3)
        self.assertAlmostEqual(ag["forum_fire_rate"], 2 / 3)
        self.assertEqual(ag["latency"]["n"], 3)
        self.assertEqual(ag["latency"]["min"], 10)
        self.assertEqual(ag["latency"]["max"], 30)
        self.assertEqual(ag["latency"]["median"], 20)
        self.assertEqual(ag["verdict_counts"]["contested"], 2)
        self.assertEqual(ag["verdict_counts"]["advance"], 1)

    def test_render_report_contains_table_and_paragraph(self):
        rows = [self._row(slug="demo")]
        ag = fr.aggregate_rows(rows)
        md = fr.render_report_md(rows, ag)
        self.assertIn("| slug |", md)
        self.assertIn("demo", md)
        self.assertIn("## Honest read", md)
        self.assertTrue(len(md.split("## Honest read")[1].strip()) > 40)

    def test_summarize_run_from_fixture_shaped_dir(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "screen.json").write_text(
                json.dumps({"verdict": "advance"}), encoding="utf-8"
            )
            # Post-inversion artifacts (vc-brain-mau): the gate reads
            # screen.verdict + triage.crux; forum_trigger no longer exists.
            (out / "triage.json").write_text(
                json.dumps({"crux": ""}), encoding="utf-8"
            )
            (out / "memo.json").write_text(
                json.dumps({
                    "decision": {
                        "recommendation": "pass",
                        "conditions": ["a", "b", "c"],
                    }
                }),
                encoding="utf-8",
            )
            (out / "latency.json").write_text(
                json.dumps({"total_seconds": 42.5, "tokens": {"input": 1, "output": 2}}),
                encoding="utf-8",
            )
            row = fr.summarize_run("demo", out, "ok")
            self.assertEqual(row["screen_verdict"], "advance")
            self.assertFalse(row["forum_fired"])
            self.assertEqual(row["forum_gate_reason"], "triage crux is blank")
            self.assertEqual(row["decision_recommendation"], "pass")
            self.assertEqual(row["conditions_count"], 3)
            self.assertEqual(row["total_seconds"], 42.5)
            self.assertEqual(row["tokens"]["input"], 1)

    def test_run_is_complete(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            self.assertFalse(fr.run_is_complete(out))
            (out / "memo.json").write_text("{}", encoding="utf-8")
            self.assertFalse(fr.run_is_complete(out))
            (out / "latency.json").write_text("{}", encoding="utf-8")
            self.assertTrue(fr.run_is_complete(out))


class TestMiniAppGenerator(unittest.TestCase):
    def test_build_mini_application_shape(self):
        founder = {
            "id": "fndr-gh-maravoss",
            "name": "Mara Voss",
            "aliases": ["maravoss"],
            "links": {"github": "https://github.com/example-maravoss"},
            "location": None,
            "signal_ids": ["sig-gh-001"],
        }
        signal = {
            "id": "sig-gh-001",
            "url": "https://github.com/example-maravoss/ferrite",
            "summary": 'GitHub repo example-maravoss/ferrite. Description: "Tiny engine."',
            "observed_at": "2026-07-19T11:45:00Z",
        }
        app = fr.build_mini_application(founder, signal)
        self.assertIn("ferrite", app["company_name"])
        self.assertEqual(app["one_liner"], "Tiny engine.")
        self.assertEqual(app["founder"]["name"], "Mara Voss")
        self.assertIn("sig-gh-001", app["deck_claims"][0])

    def test_generate_writes_twenty(self):
        founders = fr.DEFAULT_FOUNDERS
        signals = fr.DEFAULT_SIGNALS
        if not founders.is_file() or not signals.is_file():
            self.skipTest("memory fixture files not present")
        with tempfile.TemporaryDirectory() as td:
            app_dir = Path(td) / "generated"
            manifest = Path(td) / "manifest.json"
            entries = fr.generate_first_slice_entries(
                founders_path=founders,
                signals_path=signals,
                app_dir=app_dir,
                manifest_path=manifest,
            )
            self.assertEqual(len(entries), 20)
            self.assertTrue(manifest.is_file())
            self.assertTrue(entries[0]["application"])
            slugs = [e["slug"] for e in entries]
            self.assertEqual(len(slugs), len(set(slugs)))


if __name__ == "__main__":
    unittest.main()
