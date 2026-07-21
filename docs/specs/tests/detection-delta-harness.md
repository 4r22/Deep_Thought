# Spec: the detection-delta harness

**Status:** spec-ready · **Effort:** M · **Seam:** `intelligence/tests/` (meta-tooling)
**Provenance:** the 28 adoption rooms independently converged on "measure incremental
catch before adopting any harness" as doctrine; the manual prototype was run by hand on
2026-07-21 (reject-everything postcheck stubs → 13 failures each; schema-closure walk →
vacuous). This spec turns that hand experiment into a tool. Specified from scratch.

## Why (vc-brain terms)

Fourteen ledger items are SPIKE-FIRST: each adoption decision is gated on the question
"does the existing suite already catch this fault class?" Answering by hand means ad-hoc
monkeypatching and eyeballing failures — done once, lost forever. The harness makes the
answer reproducible and turns it into an artifact: plant a named fault, run the suite,
record exactly which tests caught it (or that nothing did), emit the delta report that
IS the adoption evidence. It also doubles as mutation-testing for our own gates: a gate
whose planted fault is caught by nothing is theater, and now that is measurable.

## Behavioral contract

1. **FaultPlan.** A fault is a named, versioned entry (JSON or a Python registry — one
   file, implementer's choice) with:
   - `id`, `description`, `adoption_slug` (optional link to a ledger item),
   - `mutation`: how the fault is introduced — v1 supports exactly two mechanisms:
     (a) *source-text substitution*: target file + unique `old` → `new` snippet (applied
     to a COPY of the tree, never in place); (b) *artifact substitution*: replace a named
     fixture/tape file with a provided faulty variant — or REMOVE it (the faulty variant
     being absence; required by replay-field-mutation's deletion mutants). No other
     mechanisms in v1.
   - `expectation`: `caught` | `missed` — the currently-believed answer (so drift in
     either direction fails loudly later).
2. **Runner.** For each selected fault: materialize a pristine copy of the relevant tree
   (git worktree or tempdir copy — pristine means the run cannot dirty the real repo),
   apply the mutation, run the full `intelligence/tests` suite (and `memory` tests when
   the target lives there), and record: overall pass/fail, the identifiers of failing
   tests, wall time. Then discard the copy. A mutation whose `old` snippet no longer
   matches MUST error as `stale-fault` (never silently skip).
3. **Delta report.** One JSON per invocation: per fault — `outcome` (`caught` /
   `missed` / `stale-fault`), `caught_by` (test ids), `agrees_with_expectation` (bool).
   Exit code nonzero if any fault disagrees with its recorded expectation. The report is
   the artifact a SPIKE-FIRST decision cites.
4. **Seed corpus.** Ship with ≥4 registered faults:
   - the two postcheck reject-everything stubs (expectation: `caught` — reproduces the
     2026-07-21 hand experiment),
   - an unsourced-figure fault in a canned memo body (expectation today: `missed`;
     flips to `caught` when the rendered-figure gate lands — the flip is the point),
   - a nested-key widening of one stage schema fixture (expectation per the
     structured-output room's spike: record what the run actually shows).
5. **Ergonomics.** Single entry point (`python3 …/detection_delta.py [--only id]`),
   runtime bounded (full suite per fault; fine at our suite's speed), no network, no
   model calls.

## Acceptance criteria

- Running the seed corpus produces a report matching all recorded expectations, and the
  real repo tree is bit-identical afterwards (assert via `git status --porcelain` empty
  delta or tempdir isolation).
- Corrupting one fault's `old` snippet yields `stale-fault` and nonzero exit.
- Flipping one expectation yields `agrees_with_expectation: false` and nonzero exit.
- A self-test drives the runner on a trivial synthetic fault end-to-end in CI-able time.

## Non-goals

- Not generalized mutation testing (no random mutants, no operators beyond the two
  mechanisms). Named faults only — the registry is a curated ledger, not a fuzzer.
- Not a CI gate in v1 (that decision belongs to the CI adoption item); it is a tool the
  operator runs to settle SPIKE-FIRST questions.

## Integration points

- New: `intelligence/scripts/detection_delta.py` (or `tests/` — implementer's call) +
  fault registry + self-test.
- Consumers: adoption-decision ledger items marked SPIKE-FIRST cite the report path
  when their spike runs.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
