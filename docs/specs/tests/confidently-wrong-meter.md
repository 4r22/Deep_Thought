# Spec: the confidently-wrong meter

**Status:** spec-ready · **Effort:** M · **Seam:** memo claims + a new operator-feedback record
**Provenance:** pattern observed during a survey of other Hack-Nation submissions;
behavior re-specified from scratch (see docs/CLEAN-ROOM.md).

## Why (vc-brain terms)

Our trust ladder (memo claims carry `trust: {tier, authority, verification, confidence}`;
signals carry `trust_tier`) is validated *structurally* — nothing ever measures whether
high-trust labels are **earned**. The honest failure mode of a diligence system is not
being wrong; it is being wrong *while claiming high confidence*. Today, if the operator
reads a memo and rejects a claim that carried `verified-artifact`-tier evidence and high
confidence, that event vanishes. This spec creates the smallest possible loop that counts
those events and turns them into a calibration number the suite can regress.

## Behavioral contract

1. **Feedback record.** An append-only JSONL file (suggested: `memory/feedback.jsonl`),
   one event per line:
   - required: `event_id`, `run_id` (the pipeline out-dir name), `claim_id` (the memo
     claim, e.g. `C3`), `verdict` (`accept` | `reject`), `noted_at` (ISO 8601).
   - optional: `reason` (free text).
   - Events are operator-authored (authority `operator-primary` by construction). The
     writer MUST be append-only (never rewrite the file) and MUST tolerate concurrent
     appends (write a full line or nothing).
2. **Correlation.** A pure function joins feedback events to the claims of the referenced
   run by loading that run's `memo.json` claims ledger. Events whose `run_id` has no
   on-disk memo, or whose `claim_id` is absent from that memo, are counted separately as
   `orphaned` — never silently dropped, never matched fuzzily.
3. **The meter.** From the joined set, compute:
   - `confidently_wrong` = (rejected claims whose trust `confidence` was `high`) ÷
     (all rejected claims), when ≥1 rejection exists; else `null` — never 0-by-default.
   - per-tier breakdown: for each `trust.tier` value, its rejection rate.
   - `sample_sizes` for every ratio reported (a rate without its n is banned output).
4. **Output.** A single JSON report (schema of the implementer's design, but every ratio
   MUST be accompanied by its numerator and denominator). Exposed as a CLI entry
   (`--report` style) and as an importable function for tests.
5. **No model calls.** The whole path is deterministic stdlib code.

## Acceptance criteria (planted faults included — all MUST be demonstrated)

- Golden path: a synthetic run dir with a memo of 4 claims (two `high` confidence, two
  `low`) + 3 feedback events (reject one high, reject one low, accept one high) yields
  `confidently_wrong = 1/2`, correct per-tier rates, all n's correct.
- Planted fault A — silent-drop: an event citing a nonexistent `claim_id` MUST appear in
  `orphaned` with count 1; a version of the joiner that drops it must fail the test.
- Planted fault B — vanity default: with zero rejections the meter MUST be `null`; an
  implementation returning `0.0` must fail the test.
- Planted fault C — rate-without-n: the report writer MUST refuse (raise) to emit a ratio
  field lacking its sample size.
- Append-only: attempting to rewrite an existing line via the writer API is impossible by
  construction (no such code path exists).

## Non-goals

- No conformal prediction, no statistical intervals, no abstention machinery — the
  adoption room for calibration explicitly skipped that until a calibration seam exists.
  This spec **builds the seam**; the fancier statistics stay out.
- No UI. No automatic feedback capture. The operator writes events by hand or via a
  trivial CLI append helper.

## Integration points

- Reads: `intelligence/out/<run>/memo.json` (claims ledger shape — see
  `intelligence/run.py` `assemble_memo` and `intelligence/schemas/memo.schema.json`).
- New: `memory/feedback.jsonl` + one new module + tests (Python, stdlib, house style —
  or TypeScript beside `memory/lib/` if the implementer prefers; pick one, not both).

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
