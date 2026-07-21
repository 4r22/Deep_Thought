# Spec: both-ways postcheck pairs

**Status:** spec-ready · **Effort:** S · **Seam:** every code-side postcheck in `intelligence/run.py`
**Provenance:** pattern observed during a survey of other Hack-Nation submissions;
behavior re-specified from scratch (see docs/CLEAN-ROOM.md). Adoption-room verdict:
ADOPT-NOW (`structured-output-contract-tests`), urgency re-scoped by the 2026-07-21
mutation experiment recorded below.

## Why (vc-brain terms)

Our load-bearing invariants live code-side: `gate_application`,
`validate_triage_postchecks`, `validate_counsel_member_postchecks`,
`validate_axes_postchecks` (all in `intelligence/run.py`), plus the sourcing verdict ladder in
`intelligence/sourcing.py`. A validator is only trustworthy when its tests exercise
**both directions per rule**: a violating input that must raise, and a minimally
compliant input that must pass. The 2026-07-21 mutation experiment showed our replay
suite already refutes the grossest rot (a reject-everything stub in either the axes or
triage postcheck produces 13 test failures) — so this spec is *per-rule completion*,
not emergency surgery. The recursive schema-closure walker from the same adoption item
is explicitly OUT: a closure walk over the then-13 `intelligence/schemas/*.schema.json`
on 2026-07-21 found 1 open-by-design file — `application.schema.json`
(`additionalProperties: true`, documented). The tree now holds 17 schemas (4
`counsel*` schemas added since: 3 office schemas plus `counsel.schema.json`); a
re-audit finds one further open file —
`counsel.schema.json` declares no `additionalProperties`, so its nested objects are
default-open by omission rather than by explicit design.

## Behavioral contract

1. **Rule inventory.** Enumerate, in one committed machine-readable inventory inside the
   test file (a list/dict of rule ids; a structured docstring table at most, never
   free prose), every distinct *rule* each postcheck
   enforces. Minimum inventory to cover: each named refusal reason in
   `gate_application` (placeholder company_name; one_liner floor; founder-name
   placeholder; substance floor — see `gate_application`, run.py:509ff (2026-07-21));
   each SystemExit branch in
   `validate_triage_postchecks` (evidence-refs-per-tension-side),
   `validate_axes_postchecks` (band ordering, position_refs-when-convened), and
   `validate_counsel_member_postchecks` (enumerate its branches as found);
   the sourcing ladder's junk/thin conditions (thresholds are named constants in
   `intelligence/sourcing.py`).
2. **Pairs.** For every rule in the inventory: one test input violating exactly that
   rule (must raise / refuse, and the error text must name that rule's subject), and
   one input that differs from the violating input *minimally* and passes. Shared
   valid-object factories are encouraged; a compliant case that passes for an
   unrelated reason (e.g. failing an earlier rule first) does not count — assert the
   error absence, not just no-crash.
3. **Coverage tripwire.** A meta-test asserts the inventory table and the pair-count
   match (every rule id appears in at least one violating and at least one compliant test), so a
   future rule added to a postcheck without its pair fails the suite.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Reproduce the recorded baseline: a reject-everything stub of
  `validate_axes_postchecks` fails ≥1 of the new compliant-pair tests *directly* (not
  only via replay), and same for `validate_triage_postchecks` and
  `validate_counsel_member_postchecks`.
- Planted fault A — over-strictness: tighten one rule (e.g. substance floor
  `GATE_MIN_SUBSTANCE_CHARS` raised 10×) and the compliant-pair test for that rule
  MUST fail. Restore; green.
- Planted fault B — silent rule deletion: remove one branch from a postcheck and its
  violating-pair test MUST fail.
- Coverage tripwire demonstrated: add a fake rule id to the inventory without tests →
  meta-test fails.

## Non-goals

- No recursive schema-closure walker (near-vacuous today; see above). Revisit if a
  schema is deliberately opened beyond `application.schema.json`, or if
  `counsel.schema.json`'s default-open nested objects are later deemed a gap worth closing.
- No new validation framework; plain unittest beside the existing
  `intelligence/tests/test_input_gate.py` conventions.

## Integration points

- New test module in `intelligence/tests/` (suggested: `test_postcheck_pairs.py`);
  factories may import canned objects from `test_pipeline_replay.py`.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
