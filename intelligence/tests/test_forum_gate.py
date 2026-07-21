"""Unit tests for the inverted mechanical forum gate (epic vc-brain-26w).

The room now builds the reference space BEFORE scoring, so it convenes for
advance AND contested screens alike. It is skipped ONLY when the screen
rejected the deal or triage produced a blank crux.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from run import forum_gate  # noqa: E402


def _triage(crux="Is the moat durable once incumbents copy the trick?", **kw):
    base = {
        "routed_checks": ["MRR claim -> request payment-processor export"],
        "tensions": [],
        "crux": crux,
        "room_brief": "cover the cold-start durability question and the wedge",
        "confidence": "medium",
    }
    base.update(kw)
    return base


class TestForumGate(unittest.TestCase):
    def test_advance_with_crux_fires(self):
        ok, reason = forum_gate({"verdict": "advance"}, _triage())
        self.assertTrue(ok, reason)

    def test_contested_with_crux_fires(self):
        ok, reason = forum_gate({"verdict": "contested"}, _triage())
        self.assertTrue(ok, reason)

    def test_reject_screen_skips(self):
        ok, reason = forum_gate({"verdict": "reject"}, _triage())
        self.assertFalse(ok)
        self.assertIn("reject", reason)

    def test_blank_crux_skips(self):
        ok, reason = forum_gate({"verdict": "advance"}, _triage(crux="   "))
        self.assertFalse(ok)
        self.assertIn("crux", reason)

    def test_empty_crux_skips(self):
        ok, reason = forum_gate({"verdict": "contested"}, _triage(crux=""))
        self.assertFalse(ok)
        self.assertIn("crux", reason)

    def test_missing_crux_field_skips_rather_than_crash(self):
        ok, reason = forum_gate({"verdict": "advance"}, {})
        self.assertFalse(ok)
        self.assertIn("crux", reason)

    def test_reject_beats_present_crux(self):
        # reject wins even with a perfectly good crux — the deal is dead.
        ok, reason = forum_gate({"verdict": "reject"}, _triage())
        self.assertFalse(ok)
        self.assertIn("reject", reason)

    def test_missing_verdict_treated_as_not_reject(self):
        # a screen with no verdict is not a reject; a good crux still fires.
        ok, reason = forum_gate({}, _triage())
        self.assertTrue(ok, reason)


if __name__ == "__main__":
    unittest.main()
