"""Unit tests for founder→signals join helpers (bead vc-brain-uid)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from run import (  # noqa: E402
    escalate_gate,
    founder_slug,
    resolve_founder,
    signals_for_founder,
)


FOUNDERS = [
    {
        "id": "fndr-a",
        "name": "Ada Example",
        "signal_ids": ["sig-1", "sig-3"],
        "aliases": ["ada"],
    },
    {
        "id": "fndr-b",
        "name": "Bob Other",
        "signal_ids": ["sig-2"],
    },
]

SIGNALS = [
    {
        "id": "sig-1",
        "founder_ids": ["fndr-a"],
        "observed_at": "2026-07-10T00:00:00Z",
        "summary": "first",
    },
    {
        "id": "sig-2",
        "founder_ids": ["fndr-b"],
        "observed_at": "2026-07-11T00:00:00Z",
        "summary": "bob only",
    },
    {
        "id": "sig-3",
        "founder_ids": ["fndr-a"],
        "observed_at": "2026-07-05T00:00:00Z",
        "summary": "earlier",
    },
    {
        "id": "sig-orphan",
        "founder_ids": ["fndr-a"],
        "observed_at": "2026-07-12T00:00:00Z",
        "summary": "on founder_ids but not signal_ids — still joins",
    },
]


class TestResolveFounder(unittest.TestCase):
    def test_resolve_by_id_from_list_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "founders.json"
            path.write_text(json.dumps(FOUNDERS))
            got = resolve_founder("fndr-a", path)
            self.assertEqual(got["name"], "Ada Example")

    def test_resolve_by_alias(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "founders.json"
            path.write_text(json.dumps(FOUNDERS))
            got = resolve_founder("ada", path)
            self.assertEqual(got["id"], "fndr-a")

    def test_resolve_from_file_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "one.json"
            path.write_text(json.dumps(FOUNDERS[1]))
            got = resolve_founder(str(path))
            self.assertEqual(got["id"], "fndr-b")

    def test_missing_id_exits(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "founders.json"
            path.write_text(json.dumps(FOUNDERS))
            with self.assertRaises(SystemExit) as ctx:
                resolve_founder("fndr-missing", path)
            self.assertIn("fndr-missing", str(ctx.exception))


class TestSignalsForFounder(unittest.TestCase):
    def test_joins_by_signal_ids_and_founder_ids(self):
        joined = signals_for_founder(FOUNDERS[0], SIGNALS)
        ids = [s["id"] for s in joined]
        self.assertEqual(ids, ["sig-3", "sig-1", "sig-orphan"])

    def test_empty_when_no_overlap(self):
        lone = {"id": "fndr-z", "name": "Z", "signal_ids": []}
        self.assertEqual(signals_for_founder(lone, SIGNALS), [])

    def test_slug(self):
        self.assertEqual(founder_slug(FOUNDERS[0]), "fndr-a")


class TestEscalateGate(unittest.TestCase):
    def test_default_false_ok(self):
        ok, _ = escalate_gate({"to_forum": False, "crux": ""})
        self.assertTrue(ok)

    def test_true_with_crux_ok(self):
        ok, reason = escalate_gate({
            "to_forum": True,
            "crux": "Is solo-builder taste a durable edge or a scaling ceiling?",
        })
        self.assertTrue(ok, reason)

    def test_true_with_blank_crux_blocks(self):
        ok, reason = escalate_gate({"to_forum": True, "crux": "  "})
        self.assertFalse(ok)
        self.assertIn("crux", reason)


if __name__ == "__main__":
    unittest.main()
