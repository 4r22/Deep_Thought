"""Seam tests for the wire-schema strip and single-pass fill.

Born of the deep-review P0s on the inverted pipeline (epic vc-brain-26w):

1. wire_schema must drop constraint keywords the structured-outputs endpoint
   rejects (minItems etc.) at EVERY nesting level, while the schema files keep
   them as the single source of truth for local jsonschema validation. The
   load-bearing invariants are re-enforced code-side (validate_*_postchecks).
2. fill() must be single-pass: an inserted value containing {{TOKEN}}-shaped
   text (templating syntax quoted in a transcript, or a hostile application)
   must never pull another slot's payload into itself.
3. validate_triage_postchecks carries the evidence-backed-tension invariant
   the wire schema can no longer express.
"""
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run  # noqa: E402


def _walk(node):
    yield node
    if isinstance(node, dict):
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


class TestWireSchema(unittest.TestCase):
    def test_unsupported_keywords_stripped_recursively(self):
        for name in ("triage.schema.json", "axes.schema.json"):
            wire = run.wire_schema(run.schema(name))
            for node in _walk(wire):
                if isinstance(node, dict):
                    hit = run.WIRE_UNSUPPORTED & set(node)
                    self.assertFalse(hit, f"{name}: {sorted(hit)} reached the wire")
                    self.assertFalse([k for k in node if k.startswith("_")],
                                     f"{name}: private key reached the wire")

    def test_supported_structure_survives(self):
        wire = run.wire_schema(run.schema("axes.schema.json"))
        band = wire["properties"]["founder"]["properties"]["band"]
        self.assertEqual(band["type"], "array")          # typed, just unconstrained
        self.assertIn("required", wire)
        self.assertFalse(wire["additionalProperties"])
        self.assertIn("enum", wire["properties"]["market"]["properties"]["rating"])


class TestFillSinglePass(unittest.TestCase):
    def test_value_containing_token_is_not_resubstituted(self):
        out = run.fill("A={{ALPHA}} B={{BETA}}",
                       {"ALPHA": "uses {{BETA}} literally", "BETA": "payload"})
        self.assertEqual(out, "A=uses {{BETA}} literally B=payload")

    def test_unknown_token_passes_through(self):
        self.assertEqual(run.fill("x {{NOT_A_SLOT}} y", {"A": "1"}),
                         "x {{NOT_A_SLOT}} y")


class TestTriagePostchecks(unittest.TestCase):
    GOOD = {"tensions": [{"name": "deck vs registry",
                          "side_a": {"claim": "3,100 installs", "evidence_refs": ["sig-001"]},
                          "side_b": {"claim": "2,900 lifetime downloads", "evidence_refs": ["sig-004"]}}]}

    def test_backed_tensions_pass(self):
        run.validate_triage_postchecks(self.GOOD)   # no raise

    def test_unbacked_side_dies_naming_the_tension(self):
        bad = {"tensions": [{"name": "deck vs registry",
                             "side_a": {"claim": "x", "evidence_refs": ["sig-001"]},
                             "side_b": {"claim": "y", "evidence_refs": []}}]}
        with self.assertRaises(SystemExit) as ctx:
            run.validate_triage_postchecks(bad)
        self.assertIn("deck vs registry", str(ctx.exception))
        self.assertIn("side_b", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
