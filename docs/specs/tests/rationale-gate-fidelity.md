# Spec: rationale/gate fidelity

**Status:** spec-ready · **Effort:** S · **Seam:** memo assembly (`assemble_memo`, `run_memo_dispatch`)
**Provenance:** the failure class was surfaced by our own adoption room
`phantom-gate-hallucinated-justification` (see its adjudication); the underlying pattern
— rationale text citing checks that never ran — was observed during a survey of other
Hack-Nation submissions; behavior re-specified from scratch (see docs/CLEAN-ROOM.md).

## Why (vc-brain terms)

Our gates are mechanical and honest — `forum_gate` fires or skips with a named reason,
robustness runs or doesn't, adjudication exists or doesn't. But the *prose* that explains
a decision is model-written, and nothing prevents it from citing machinery that never
ran: a memo on the no-room path could say "the committee's instruments require…" when no
room convened; a decision block could reference a robustness replication that was never
requested. Gate *computation* being correct does not propagate to gate *narration* being
correct — that consistency is a separate invariant, and it is mechanically checkable
because every gate leaves an artifact.

## Behavioral contract

1. **The gate record.** A pure function `gate_record(outdir)` derives, from a run's
   artifacts (the out-dir), the set of machinery that actually ran: `forum_convened`
   (forum-attendants.json exists), `adjudication_present`, `robustness_ran`
   (forum-robustness.json exists), `seats` (count), plus the skip reason when the forum
   was skipped (already printed by the pipeline; persist it — add it to the decision path
   if not yet on disk). This is a shared helper: it lives in `intelligence/registers.py`
   (the shared-constants module owned by the import-boundary spec, created by whichever
   registers.py spec lands first) — chosen over
   `run.py` to match that module convention — and the verdict-rubric-clamp spec reuses it,
   extending the returned facts with the screen verdict from its own source. The screen
   verdict is NOT added here: `gate_record` stays the forum-convened / adjudication-present
   facts, and a caller needing the screen reads it itself.
2. **Structural invariants (fatal, code-side, in `assemble_memo` / the memo postcheck):**
   - If `adjudication_present` is false: the decision block's `conditions` MUST derive
     from triage's routed checks, and no diligence-log entry may carry an
     instrument-style source reference. (The assembly already receives `adjudication`
     as `None` on that path — the check pins that nothing instrument-shaped survives.)
   - If `robustness_ran` is false: no artifact may contain a robustness/second-model
     consistency claim (checked over the structured fields, see 3 for prose).
3. **Prose lint (fatal):** over `body_md` of every assembled section and the decision
   rationale, a deterministic vocabulary scan for gate-narration phrases — at minimum:
   references to a convened room/committee/debate/adjudication/instruments when
   `forum_convened` is false, and references to a second-model/robustness replication
   when `robustness_ran` is false. The phrase list is a named code constant; matches
   report the section, the phrase, and the gate record that contradicts it. False-positive
   escape hatch: none in v1 — if a legitimate sentence trips it ("no room convened, so…"),
   the lint must be *negation-aware* only to this extent: a match within the same
   sentence as an explicit negation of the machinery ("no room", "was skipped", "did not
   run") does not fire. Document the exact rule. Factor the negation test as a reusable
   primitive `is_negated(sentence, matched_span, cues)` — true when a cue from `cues`
   appears before `matched_span` in the same sentence — called here with THIS spec's cue
   set (`"no room"`, `"was skipped"`, `"did not run"`). The primitive lives in
   `intelligence/registers.py` (the shared-constants module) and is shared with the
   honesty-closed-oracle-scan spec, which calls it with its own negator cues (`not`,
   `not yet`, `no`, `cannot`, `could not` — its `un-` prefix case is handled by
   word-boundary matching on honesty's side, not passed as a cue).
4. **Failure mode:** violations raise (SystemExit, house style) at assembly — a memo
   that misnarrates its own machinery must not be written to disk.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Planted fault A — phantom instruments: replay-drive the reject path (no room) with a
  canned decision agent that emits a condition citing committee instruments → assembly
  MUST refuse, naming the phrase and the gate record.
- Planted fault B — phantom robustness: a canned section body claiming the debate was
  replicated on a second model when it wasn't → refuse.
- Negation guard: the honest sentence "no room convened; conditions derive from routed
  checks" MUST pass.
- The full existing replay suite stays green (both convened and skipped paths).

## Non-goals

- No general "truthfulness" policing of prose — only narration of *our own machinery*
  whose ground truth is on disk. (General overclaim policing was explicitly bounded out
  by the honesty-audit room.)
- No LLM re-checking; deterministic scan only.

## Integration points

- `intelligence/run.py`: `assemble_memo` / `run_memo_dispatch` (postcheck seam beside
  `lint_provenance`), the forum-skip reason persistence.
- `intelligence/registers.py` (the shared-constants module — owned by the import-boundary
  spec, created by whichever registers.py spec lands first): the `gate_record(outdir)`
  helper (shared with verdict-rubric-clamp) and the
  `is_negated` negation primitive (shared with honesty-closed-oracle-scan).
- Tests beside `intelligence/tests/test_assembly.py` and the replay harness
  (`test_pipeline_replay.py` CannedModel pattern).

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
