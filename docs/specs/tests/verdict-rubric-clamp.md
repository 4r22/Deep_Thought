# Spec: verdict-rubric clamp

**Status:** spec-ready · **Effort:** M · **Seam:** decision-block clamp in `cmd_pipeline`
after `run_memo_dispatch` and before `write_out` (run.py:1378-1380) + counsel postchecks
(`validate_counsel_member_postchecks`, run.py:851)
**Provenance:** golden verdict fixtures with LLM-cannot-override semantics — a
pattern observed during a survey of other Hack-Nation submissions (including the
weak-and-thin-must-NOT-decline pin); behavior re-specified from scratch (see
docs/CLEAN-ROOM.md). Adoption-room verdict SPIKE-FIRST
(`golden-verdict-rubric-llm-cannot-override`), bounded by our doctrine: unlike the
exemplar, vc-brain's recommendation is deliberately model-authored — so the clamp pins
the *lattice of permissible outcomes*, never a deterministic verdict.

## Why (vc-brain terms)

The decision block's `recommendation` is written by the decision agent from the forum's
instruments (or triage's routed checks on the no-room path). That is by design — the
human gate decides, the agent recommends. But the *space* of coherent recommendations
is mechanically constrained by upstream artifacts, and today nothing enforces the
constraint: a canned or drifted model could emit an enthusiastic recommendation on a
screen-rejected run and assembly would write it. The clamp: **derive the permissible
recommendation set from the run's mechanical facts; refuse anything outside it.** The
adjacent thin-vs-weak distinction is counsel territory and gets its pin there: thin
evidence must widen uncertainty, not lower the central judgment.

## Behavioral contract

1. **Permissibility table.** A committed pure function mapping mechanical run facts →
   the allowed set of `decision.recommendation` values (the memo-decision schema's enum
   — read the enum from `intelligence/schemas/memo-decision.schema.json` at
   implementation time and cover every value in the table). Minimum rows, derived from
   existing gate semantics (`forum_gate` run.py:586; screen verdict enum in
   `screen.schema.json`):
   - screen `reject` → recommendation MUST NOT be an advance/invest-positive value;
     conditions may only reference triage routed checks (consistent with the
     rationale-gate-fidelity spec — share the gate-record derivation).
   - forum convened + adjudication outcome is a stable-fork/residual type → an
     unconditional positive recommendation (no conditions attached) is impermissible:
     residual forks must surface as conditions or a contested recommendation.
   - no-room path (`adjudication is None`) → no room fired, so `contested` is
     impermissible: per Row 2 a `contested` recommendation IS the surfacing of a
     convened room's residual fork, so with no room nothing produced a fork to
     contest. The two no-room sub-cases differ only on `fund`. Screen `reject` (Row
     1's reject is inherently no-room — `forum_gate` skips the room on reject,
     run.py:586-597) → allowed = {`pass`} (`fund` barred as invest-positive per Row 1;
     `contested` barred as room-backed). Blank-crux no-room (screen `advance` or
     `contested`, triage crux blank) → allowed = {`fund`, `pass`} (the screen did not
     reject, so an invest-positive value stays coherent; only `contested` is barred).
     This pins the mapping unambiguously: "values implying room backing" = `contested`
     alone (its Row-2 definition), not `fund`.
   The table is fact-driven and total: for every combination of (screen verdict ×
   forum convened × adjudication outcome class) an explicit allowed set — no default
   branch, no fallthrough. The adjudication outcome classes are read from the
   authoritative `outcome` enum: *residual-bearing* (`action-converged-plus-residual` |
   `stable-fork-plus-instrument`), *clean* (`converged` | `degenerate`), and *none*
   (the forum was skipped, so `adjudication is None`); the four-value `outcome` enum
   lives in `adjudication.schema.json`. The `outcome` value alone classifies the row —
   never the `adjudication.residual` array, which the schema does NOT couple to
   `outcome` (nothing forbids a schema-valid `outcome:"converged"` carrying a non-empty
   `residual`, or a `stable-fork-plus-instrument` with an empty one). A drifted model
   that produces such a mismatch is itself a clamp failure: before computing any allowed
   set, the clamp asserts the invariant `outcome in {"converged","degenerate"}` ⇔
   `adjudication.residual == []` and raises (SystemExit, naming the outcome and the
   residual length) when it does not hold — an outcome/residual disagreement is refused
   in its own right, never silently resolved to one reading.
   Combinations the upstream gate makes unreachable — screen `reject` with the forum
   convened is impossible, since `forum_gate` returns
   `(False, "screen verdict is 'reject'")` on a reject verdict (run.py:586-597) — are
   still encoded as explicit rows that assert unreachability, never left to fall through.
2. **Clamp.** Apply the table in `cmd_pipeline` immediately after
   `memo = run_memo_dispatch(...)` and before `write_out(outdir / "memo.json", memo)`
   (run.py:1378-1380) — the one seam where `screen`, `adjudication`, and `outdir` are
   all in scope. This deliberately avoids threading a new `screen`/out-dir argument
   through `run_memo_dispatch`, whose signature carries none (`args, triage, axes,
   adjudication, timed, docs_dir, counsel`, run.py:1267). The clamp reads the screen
   verdict from the in-scope `screen`; for the standalone `memo` subcommand — which has
   no `--screen` flag and calls `run_memo_dispatch` directly (run.py:1620-1625) — the
   source is the `screen.json` sibling of the triage input, derived as
   `pathlib.Path(args.triage).parent / "screen.json"`: the triage input's own run dir
   is where the pipeline persisted the screen verdict (run.py:1344), and the
   subcommand exposes no run-dir argument — only per-file input flags and an
   `-o`/`--out` that is the memo *output* path, never a run dir (run.py:1514-1521,
   1648-1651) — so that sibling is the only place to read it. If the file is absent the
   clamp treats the run as the no-screen/no-room row: with no `--adjudication` either
   (no room), it cannot confirm a non-reject screen, so it applies the reject-equivalent
   no-room set (Row 1) and refuses rather than inventing an advance; when an
   `--adjudication` IS supplied a room provably fired, which itself proves the screen
   was non-reject, so the convened rows apply. Note the reject-vs-blank-crux crux: `adjudication is None`
   alone does NOT disambiguate a screen `reject` from a blank-crux no-room path (both
   skip the room), so the split requires the screen verdict itself, or the persisted
   forum skip reason (`forum_gate` returns `(False, reason)`, run.py:586-597). Compute
   the allowed set and raise (SystemExit, naming the facts and the offending
   recommendation) when the model's value falls outside. The model's text is otherwise
   untouched — the clamp never rewrites, only refuses (regeneration is the
   operator's/dispatch's move; silent correction is banned).
3. **Thin-vs-weak pin (counsel seam).** Extend `validate_counsel_member_postchecks`
   (run.py:851; called at 832/840) with the explicit distinction test: given a member
   whose evidence base is thin, a LOW central score with a NARROW band must be rejected
   — thin evidence widens the band (or abstains), it does not license a low *confident*
   score. "Thin" is office-specific, and the postcheck reads no cold-start today: its
   signature is `(axis, m, convened)` and `cold_start` lives only on the founder office
   (`counsel-founder.schema.json`) — the market and idea_vs_market schemas are
   `additionalProperties:false` with no such field, so a generic `m["cold_start"]` read
   KeyErrors there. Scope the cold-start branch to the founder axis; for the other two
   offices define thinness as a low `len(m["evidence_refs"])` (`evidence_refs` is
   present on every office). Exact band-width floor: the schema supplies only the
   *direction* (thin / cold-start ⇒ wider band, qualitative prose, no numeric width) —
   so the floor and the evidence-count threshold are chosen named constants, each
   committed with a one-line rationale, not values derived from the schema.
4. **Golden fixture set.** ≥8 committed fixtures spanning the table's rows (each: the
   mechanical facts + a candidate decision block + expected allow/refuse), run as a
   parametrized test. Fixtures live beside the tests, hand-readable. Two rows are
   mandatory: the blank-crux no-room row (screen `advance`/`contested` + blank crux +
   `adjudication is None`; allowed = {`fund`, `pass`}, `contested` refused) and an
   outcome/residual-mismatch fixture (`outcome:"converged"` + non-empty `residual`)
   whose expected result is the invariant failure of contract item 1, not any
   permissibility verdict.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Reject-path override: canned run with screen `reject` + a positive recommendation →
  clamp refuses naming the screen verdict.
- Residual-fork override: convened room, residual-type outcome, unconditional positive
  recommendation with empty conditions → refuses.
- Blank-crux no-room: screen `advance` (or `contested`) + blank triage crux (room
  skipped, `adjudication is None`) + a `contested` recommendation → clamp refuses
  (nothing contested it without a room); the same facts with `fund` or `pass` → pass.
- Thin-narrow fault: a founder member with cold-start facts (and, separately, a
  non-founder office with few `evidence_refs`) + low score + band narrower than the
  floor → counsel postcheck refuses; the same member with a widened band → passes.
- Table totality: a meta-test enumerates the fact space (screen verdict × forum
  convened × outcome class, including the unreachable screen-`reject`-plus-convened
  cell) and asserts every combination has an explicit row — reachable or explicitly
  marked unreachable — with no fallthrough branch.
- Outcome/residual mismatch: a schema-valid adjudication with `outcome:"converged"` and
  a non-empty `residual` (or a residual-bearing `outcome` with an empty `residual`) →
  clamp raises on the invariant itself, naming the outcome and residual length,
  regardless of the recommendation value.
- Silent-correction ban: demonstrate the clamp raises rather than mutating (assert the
  artifact is unwritten after refusal).

## Non-goals

- No deterministic verdict computation — the recommendation stays model-authored
  within the clamped set (this is where we deliberately diverge from the exemplar,
  whose judge narrates a rules-engine verdict; our room already adjudicated that
  pattern as a costume in the FORUM deep-dive).
- No score thresholds over counsel numbers beyond the band-width pin (per-office band
  and ordering — `0<=low<=score<=high<=100` — are already postchecked in
  `validate_counsel_member_postchecks` (run.py:862-865) and, for the projected axes, in
  `validate_axes_postchecks` (run.py:958)).

## Integration points

- `intelligence/run.py`: the clamp in `cmd_pipeline` (post-`run_memo_dispatch`,
  pre-`write_out`, run.py:1378-1380) + the counsel postchecks
  (`validate_counsel_member_postchecks`); fixtures + tests in `intelligence/tests/`
  (suggested `test_verdict_clamp.py`); shares the gate-record helper (forum-convened /
  adjudication-present facts, not the screen verdict) with the rationale-gate-fidelity
  spec.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
