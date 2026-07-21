# Spec: replay-field mutation family

**Status:** spec-ready · **Effort:** S · **Seam:** detection-delta harness fault registry (see detection-delta-harness.md)
**Provenance:** single-field perturbation over a valid replay expecting a throw — a
pattern observed during a survey of other Hack-Nation submissions; behavior
re-specified from scratch (see docs/CLEAN-ROOM.md).
Adoption-room verdict SPIKE-FIRST (`anti-fabrication-mutation-over-replay`), with the
room's own framing: this mirrors our planted-fault discipline, aimed at the pipeline
replay we simply have not mutation-tested yet.

## Why (vc-brain terms)

The detection-delta harness (its own spec) ships with a seed corpus of four faults.
This spec is the *family expansion* that makes the harness earn its keep on the forum
and memo artifacts specifically: take one valid, committed replay bundle (canned
contested-path output — attendants, pre/post interviews, transcript, adjudication,
memo), perturb exactly one field (or delete one file) per mutant, and record — via the
harness's standard report — whether the suite throws. Each mutant is an *expectation
ledger entry*: `caught` mutants pin the check that catches them; `missed` mutants are
the measured backlog that justifies (or kills) the next gate.

There is one load-bearing fact the first version of this spec got wrong: artifact
mutations only register as `caught` if some suite test actually READS the committed
bundle and fails. Today nothing does — `test_pipeline_replay.py` builds throwaway
tempdirs, `run.py`'s postchecks fire on in-memory model output at the call seam, and
`verify_artifacts.py` is invoked by no test. So this spec ships exactly ONE new thing: a
generic **bundle-consumer gate** — a single test that loads the committed fixture bundle
and runs the checks the pipeline already owns over it. No per-mutant assertions, no new
production gate. The consumer is the designated reader; the fault corpus is what it eats.

## Behavioral contract

### 1. Base bundle (authored, then committed)

The bundle does not exist yet — author it once and commit it. Run the existing replay
harness for the **contested + seeded, 3-seat** scenario — `CannedModel("contested",
CRUX_MARKER, n_seats=3)` driving `_Replay(model, forum_mode="seeded", seats=3)` in
`intelligence/tests/test_pipeline_replay.py` (the `_Replay` class, `:268`) — and copy its
tempdir (`r.out`) verbatim into a committed fixtures dir. The copy MUST happen inside
the `with _Replay(...) as r:` block, after `r.run()` — `_Replay.__exit__` deletes the
tempdir (`:294-296`), so a copy attempted after the block finds nothing:

`intelligence/tests/fixtures/replay-bundle/`

The load-bearing files the registry mutates are:

```
screen.json  triage.json
forum-attendants.json  forum-seat-1.md  forum-seat-2.md  forum-seat-3.md
forum-post-seat-1.md   forum-post-seat-2.md  forum-post-seat-3.md
forum-debate.md  forum-adjudication.json
counsel.json  axes.json  memo.json  latency.json
```

The raw dump also carries `forum-meta.json` and `memo-docs/*.json`; commit them too —
`verify_artifacts.py` skips `forum-meta.json` (`classify`, `:57`) and validates each
`memo-docs/*.json` against `memo-section.schema.json` (`:60`), so they add coverage and
cost nothing. This is the harness's artifact-substitution mechanism (b): every mutant is
"replace (or delete) one named bundle file with a faulty variant," applied to the
pristine tree copy, never in place. Deletion is an EXTENSION to mechanism (b) — the
detection-delta-harness spec's v1 wording was replacement-only; it now states removal
support (the faulty variant being absence), and the implementation bead for this spec
must land that harness extension with it (mutants 1 and 11 depend on it).

### 2. The bundle-consumer gate (the one new test)

One new stdlib-`unittest` test (house style: `intelligence/tests/`, e.g.
`test_replay_bundle_consumer.py`) points at `fixtures/replay-bundle/` and, in one test,
runs three families of checks — all of which the pipeline already applies elsewhere:

- **(a) `verify_artifacts.py` over the bundle dir.** Invoke its `main(["_", bundle])` (or
  its functions) and assert a clean exit. This gives schema-by-filename validation
  (`SCHEMA_BY_KEY`, `:31`), the `latency.json` shape check (`check_latency`, `:150`), the
  `REQUIRED`-presence check (`:43`), and — load-bearing for the forum — `check_forum_presence`
  (`:119`), which fails when the mechanical gate fires (verdict ≠ reject, non-blank crux)
  but `forum-adjudication.json` is absent (`:137`), or is present when the gate skips.
- **(b) JSON-schema validation of each artifact** against `intelligence/schemas/*` (the
  same `validate()` verify uses; `jsonschema` when importable, else the stdlib
  required-keys walk).
- **(c) The mechanical coherence walks the pipeline applies**, re-expressed over the
  committed files because schema and the stdlib walk cannot state them:
  - **band ordering per office** — `0<=low<=score<=high<=100` for each of
    `counsel.json` `members.{founder,market,idea_vs_market}` and `axes.json` `founder`,
    the same invariant `validate_counsel_member_postchecks` (`run.py:851`, ordering at
    `:862`) and `validate_axes_postchecks` (`run.py:944`, ordering at `:958`) enforce at
    the call seam. Those production postchecks never see a committed file, which is
    exactly why the consumer needs its own walk;
  - **gate coherence** — forum artifacts present ⇔ the gate fired (this is `(a)`'s
    `check_forum_presence`, named here so a mutant can cite it);
  - **adjudication `outcome` enum** — an explicit membership check against
    `adjudication.schema.json`'s enum (`:8`), independent of whether `jsonschema` is
    installed (the stdlib walk in `verify_artifacts._walk` does NOT police enums).

On the pristine bundle this test passes. Under any registry mutant it either fails
(`caught`) or still passes (`missed`) — and THAT is what the detection-delta harness
records.

### 3. Mutant registry (11 entries, one field/file each), with proven expectations

Every disposition below was walked against the consumer's actual checks. `caught` names
the exact check; `missed` names the gate it motivates.

**Caught (3) — proving the consumer has teeth:**

1. `forum-adjudication.json` **deleted** from the (fired) contested bundle — **caught**
   by `(a)` `check_forum_presence` (`verify_artifacts.py:137`): the gate fires but no
   forum record exists.
2. `counsel.json` `members.founder.band` inverted to `[84, 58]` — **caught** by `(c)`
   the band-ordering walk (`0<=low<=score<=high` violated; mirrors `run.py:851/:862`).
   Schema alone passes it: `counsel.schema.json` requires `band` but cannot express
   ordering.
3. `forum-adjudication.json` `outcome` set outside the enum (e.g. `"funded"`) — **caught**
   by `(c)` the outcome-enum walk against `adjudication.schema.json` enum (`:8`; also
   `(b)` when `jsonschema` is present — but the `(c)` walk is what makes it deterministic
   without it).

**Missed (8) — the measured backlog, each linked to the gate that would close it:**

4. `forum-adjudication.json` `evolution[].attendant` renamed to `"seat-99"` (absent from
   the attendants list) — **missed**: `adjudication.schema.json` types `attendant` as a
   free string with no membership check anywhere. Motivates an **adjudication↔attendants
   membership gate**.
5. Duplicate seat id in `forum-attendants.json` — **missed**: `forum-seed.schema.json`
   has no `uniqueItems`, and the seed stage asserts count, not uniqueness. Motivates a
   **seat-id-uniqueness gate**.
6. `forum-debate.md` truncated to the bare `# DEBATE_TRANSCRIPT_MARKER` line, dropping
   the turn summary the adjudication leans on (the canned transcript is that marker plus
   a single `Turn 1 ... turn 5` summary line — `test_pipeline_replay.py:229-230`, written
   verbatim at `run.py:1119`; it has no `## Turn N` headings to reorder) — **missed**:
   `verify_artifacts` only reads `*.json` (`rglob("*.json")`, `:182`); no walk touches
   transcript markdown. Motivates a **transcript-content gate** (turn structure +
   adjudication-cite coverage, once real transcripts carry per-turn headings).
7. `memo.json` `claims[].evidence[].signal_id` pointed at a signal absent from the run —
   **missed** today (`memo.schema.json:61` types `signal_id` as a free string); flips to
   **caught** when the claim-provenance-completeness gate lands — the flip is the point,
   same pattern as the harness's unsourced-figure seed.
8. `memo.json` `claims[].evidence[].quote` reworded to a paraphrase — **missed**
   (`memo.schema.json:62` is a free string); flips with the **verbatim-span gate**.
9. `memo.json` `decision.recommendation` flipped to `"fund"` while the adjudication
   `outcome` and the claim trust ledger point to contested/pass — **missed**: `"fund"` is
   a valid enum value (`memo.schema.json:102`, also `memo-decision.schema.json:34`), so
   schema passes; nothing cross-checks the recommendation against the room's evidence.
   Motivates the **verdict-rubric clamp gate**. (Rewritten from the original reject-path
   variant: the single committed contested bundle cannot supply a reject path —
   `TestReject`, `test_pipeline_replay.py:418-441`, shows reject runs write no forum
   artifacts — so the contradiction is expressed inside the contested bundle instead.)
10. `latency.json` stage list carrying a duplicated stage entry — **missed**:
    `check_latency` (`verify_artifacts.py:150`) validates each entry's shape and the
    total, never the sequence or uniqueness. Motivates a **canonical-stage-list gate**.
11. `forum-post-seat-2.md` **deleted** while `forum-adjudication.json` `evolution` still
    cites seat-2's movement — **missed**: nothing checks per-seat interview completeness
    (contrast with mutant 1, where deleting the ADJUDICATION json trips `check_forum_presence`).
    Motivates a **forum-artifact-completeness gate**.

### 4. Expectations are claims

Every `caught`/`missed` above ships as the committed expectation — the registry never
carries unknowns. Disagreement between a later run and the recorded expectation is a
nonzero-exit event (harness semantics).

### 5. Report linkage

The generated delta report is committed (or its summary table pasted into the PR); each
`missed` mutant references the gate spec/ledger item that would close it, or states
"accepted exposure" with one line of why.

## Acceptance criteria

- All mutants runnable through the detection-delta harness with zero real-tree mutation
  (pristine-copy discipline per the harness spec).
- The committed bundle passes the consumer gate clean; ≥11 mutants registered; **≥3
  initially `caught`** (mutants 1–3, proving the consumer's forum-presence, band-ordering,
  and outcome-enum checks have teeth); every `missed` linked to a closing gate or an
  accepted-exposure line.
- Determinism: two consecutive harness runs over the family produce identical
  caught/missed/`agrees_with_expectation` dispositions — the harness report's timing
  fields (per-fault wall time) are excluded from the comparison.
- One deliberate expectation-flip demonstrated (edit a recorded expectation, harness
  exits nonzero, restore).

## Non-goals

- **No new PER-MUTANT assertions** — one generic bundle-consumer gate is the designated
  consumer, and every check it runs (`verify_artifacts`, schema validation, the
  band/gate/enum walks) already exists in the tree; this spec only points them at a
  committed bundle.
- No new production gates (the linked specs own the eight the `missed` mutants motivate);
  no random/generative mutation (curated fields/files only, per the harness's no-fuzzer
  rule).

## Integration points

- Extends the detection-delta harness's fault registry + fixtures; depends on that spec
  landing first (state the dependency in the implementation bead). Adds
  `intelligence/tests/fixtures/replay-bundle/` and one `intelligence/tests/` consumer test.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
