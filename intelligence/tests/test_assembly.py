"""Tests for run.py's mechanical layer — memo assembly and lints.

Stdlib unittest only. These tests police the code that house invariant #3
keeps out of model hands: global claim renumbering across dispatched
documents, inline [C#] ref rewriting (no double-shift, no prefix collision),
section stamping, gap merging, and the provenance lint. No model call —
run.py is imported but call() is never invoked.
"""
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))          # so `import run` resolves to intelligence/run.py

import run


def doc(n_claims, body):
    claim = {"text": "t", "trust": {"tier": "claimed", "authority": "subject",
                                    "verification": "unverified", "confidence": "low"},
             "evidence": [{"signal_id": "sig-001", "quote": "q"}], "contradictions": []}
    return {"body_md": body, "claims": [dict(claim) for _ in range(n_claims)],
            "gaps": [{"field": f"g{n_claims}", "note": "n"}]}


def docs_for(bodies_and_counts):
    """Build a full 9-document dict; unlisted docs get zero claims."""
    out = {key: doc(0, "") for key, *_ in run.DOCS}
    for key, n, body in bodies_and_counts:
        out[key] = doc(n, body)
    return out


class TestAssembleMemo(unittest.TestCase):
    def test_global_renumbering_and_section_stamp(self):
        docs = docs_for([("snapshot", 2, "a [C1] b [C2]"),
                         ("hypotheses", 3, "x [C3] y [C1]")])
        sections, claims, gaps = run.assemble_memo(docs)
        self.assertEqual(sections["snapshot"], "a [C1] b [C2]")
        # hypotheses claims follow snapshot's two: local C1..C3 -> global C3..C5
        self.assertEqual(sections["hypotheses"], "x [C5] y [C3]")
        self.assertEqual([c["id"] for c in claims], [f"C{i}" for i in range(1, 6)])
        self.assertEqual(claims[2]["section"], "hypotheses")

    def test_no_double_shift_on_dense_refs(self):
        # 12 claims: [C1] must not be rewritten inside an already-produced id,
        # and [C12] must be handled before [C1] (prefix discipline).
        body = " ".join(f"[C{i}]" for i in range(1, 13))
        docs = docs_for([("snapshot", 1, "[C1]"), ("hypotheses", 12, body)])
        sections, claims, _ = run.assemble_memo(docs)
        self.assertEqual(sections["hypotheses"],
                         " ".join(f"[C{i}]" for i in range(2, 14)))
        self.assertEqual(len(claims), 13)

    def test_gaps_merge_in_document_order(self):
        docs = docs_for([("snapshot", 1, "[C1]"), ("traction", 2, "[C1] [C2]")])
        _, _, gaps = run.assemble_memo(docs)
        self.assertEqual(len(gaps), 9)          # one per document in this fixture
        self.assertEqual(gaps[0]["field"], "g1")


class TestProvenanceLint(unittest.TestCase):
    def _warns(self, lines, claims):
        import contextlib, io
        buf = io.StringIO()
        with contextlib.redirect_stderr(buf):
            run.lint_provenance(lines, claims)
        return buf.getvalue()

    def test_clean_line_passes(self):
        out = self._warns(["[prov: C1 / traction / sig-014]"], [{"id": "C1"}])
        self.assertEqual(out, "")

    def test_label_in_id_slot_flagged(self):
        out = self._warns(["[prov: gap / traction / sig-014]"], [{"id": "C1"}])
        self.assertIn("not machine-countable", out)

    def test_unknown_claim_flagged(self):
        out = self._warns(["[prov: C9 / traction / sig-014]"], [{"id": "C1"}])
        self.assertIn("unknown claim", out)


if __name__ == "__main__":
    unittest.main()
