# Spec: verbatim-span citation gate

**Status:** spec-ready · **Effort:** S · **Seam:** memo claims ledger — the gate lands
in `run_memo_dispatch` (def run.py:1267, 2026-07-21), immediately after the
`assemble_memo(...)` call (run.py:1290) and BEFORE the `memo:decision` model call
(run.py:1300-1301), so a bad quote fails fast with no wasted model spend (NOT inside
`assemble_memo`, NOT at the later `lint_provenance` neighbor)
**Provenance:** verbatim-span assertion and numeric-edit fidelity are patterns observed
during a survey of other Hack-Nation submissions; behavior re-specified from scratch
(see docs/CLEAN-ROOM.md). Adoption-room verdict SPIKE-FIRST with a gate-zero
characterization ordered first (`verbatim-quote-fidelity-gate` room, converged actions),
cross-family-confirmed by the Opus handroll room (no convergence flip).

## Why (vc-brain terms)

Every memo claim already carries span-shaped evidence: `claims[].evidence` is a list of
`{quote, signal_id}` (verify in any committed tape, e.g.
`intelligence/out/ferrite-inverted/memo.json`). The signal schema's own contract says
"Verbatim quotes preferred over paraphrase" (`intelligence/schemas/signal.schema.json`,
`summary` description) — but nothing enforces it: a model-written `quote` can be a
paraphrase, or cite a signal that never said it, and assembly accepts it. The gate:
**every evidence quote must be a literal span of its cited signal**, with the room's
required source-field resolution order made explicit.

## Behavioral contract

1. **Gate zero — characterization (run first, commit the report).** A script or test
   fixture pass over the **frozen ferrite corpus** — the tapes
   `intelligence/out/ferrite-inverted/` and `intelligence/out/ferrite-full/`
   (the latter in the working repo only; this public copy ships `ferrite-inverted`), whose
   memos cite `sig-001`…`sig-006` (and, in ferrite-inverted, the literal id
   `application`); verified 2026-07-21. No `signals.json` sits adjacent to any memo
   tape under `intelligence/out/`: the `signals.json` files elsewhere in an internal
   adoption-forum corpus (not in this repo) are forum-INPUT fixtures with no
   `memo.json` beside them, so a `ferrite-*` memo tape has no per-tape signal store to
   read (census verified 2026-07-21); its signals live only as the committed fixture
   pair. **Pairing rule (state it explicitly):** a `ferrite-*` memo tape resolves its
   signal ids against the frozen fixture pair `intelligence/fixtures/signals-ferrite.json` +
   `intelligence/fixtures/application-ferrite.json` — that pair IS the signal source.
   This is the ONLY resolvable memo corpus at implementation time. **Excluded as
   resolvable-but-living:** the memo tapes citing `sig-gh-*` ids (two earlier memo
   tapes under `intelligence/out/`, not in this repo) resolve
   against `memory/signals.json` — a living store that carries `sig-gh-001`…`sig-gh-020`
   at HEAD, not a frozen fixture — so they are documented here but kept OUT of the
   frozen characterization corpus and out of any fatal claim (their store may drift).
   For every claim evidence entry in the frozen corpus, resolve the cited signal and
   test whether `quote` is a verbatim substring of the resolved source text after
   whitespace normalization (collapse runs of whitespace; no other transformation).
   Output: per-tape counts {evidence entries, verbatim, near-miss, unresolvable}. This
   report is committed (a JSON beside the test fixtures) and is the adoption evidence;
   the fatal gate below only lands if the characterization shows the pass-rate makes it
   viable (the room's condition), otherwise the implementer files the report + a spec
   bug describing the failure taxonomy — that outcome is a SUCCESS of gate zero, not a
   failed task.
2. **Source-field resolution (fixed order, per the room):** the quote is checked
   against, in order: (a) the signal's archived raw text when `raw_ref` resolves to a
   committed file, resolved relative to the repo root; (b) else the signal's `summary`;
   (c) for the literal `signal_id` value `application` (referencing the application
   record itself), EVERY string value reachable RECURSIVELY in the application JSON —
   top-level strings, nested-dict values, and list elements alike — taken from the
   tape's paired `application-ferrite.json`. First field containing the span wins; the
   gate records which field matched, labeling it by the JSON path of the matched string
   (a top-level key, a `dict.key` such as `founder.background_claimed`, or a
   `list[index]` such as `deck_claims[3]`). The recursion is load-bearing, not a detail:
   on `ferrite-inverted` the 43 `application`-cited evidence entries resolve 42
   recursively (13 via top-level strings, 15 ONLY inside `deck_claims[]`, 14 ONLY inside
   the `founder{}` dict, 1 unresolvable) but only 13 under a top-level-only reading —
   whole-tape resolution 99.2% (123/124) vs 75.8% (94/124), and divergent committed
   reports; verified 2026-07-21. **Present-but-dormant note (current corpus):** every `raw_ref`
   in `signals-ferrite.json` is a relative path to an artifact committed nowhere in the
   repo (e.g. `sig-001` → `decks/ferrite-2026-07.pdf`, `sig-002` →
   `archive/github-ferrite-2026-07-16.json`, and `sig-006` has `raw_ref: null`;
   verified 2026-07-21). Branch (a) therefore never fires today — and the one PDF
   target is not stdlib-text-readable anyway — so the characterization and tests
   exercise only the `summary` (b) and application-field (c) branches. Branch (a) is
   specified for the future but stays dormant; do not add a raw artifact to force it,
   that is out of scope for this spec.
3. **Fatal gate.** In the memo-assembly stage `run_memo_dispatch` (def run.py:1267,
   2026-07-21), immediately after the `assemble_memo(...)` call (run.py:1290) and BEFORE
   the `memo:decision` model call (run.py:1300-1301) — fail-fast, so a bad quote never
   burns an expensive decision call: any evidence entry whose quote matches NO permitted
   field raises SystemExit naming the claim id, signal id, and the closest field tried.
   (Orientation only: the `lint_provenance(...)` call at run.py:1307 is a downstream
   neighbor in the same function, AFTER the decision call — the gate does NOT land
   there.) **Plumbing (do not shortcut this):** the gate needs the signals and the
   application record to resolve a quote's source, and both are already in scope at that
   call site — `sig = signals_or_empty(args)` (run.py:1278) and `application_json =
   jdump(load_application(args.application))` (run.py:1277). Thread those in; do NOT
   change the `assemble_memo` signature. `assemble_memo` takes only `docs_by_key` (def
   run.py:1235) and is called bare by `test_assembly.py`; a gate placed inside it would
   see neither signals nor application and would wrongly `SystemExit` those unit tests.
   Empty quotes: permitted only when the tape predates the gate (a dated grandfather
   list, committed, max = the tapes existing at implementation time; note the frozen
   ferrite corpus carries zero empty evidence quotes at implementation time — verified
   2026-07-21 — so that list is empty for the frozen corpus).
4. **Numeric-edit variant is OUT for now** (deferred behind the span gate by the room);
   the acceptance suite still includes adversarial *fixtures* for it, marked expected-
   pass-through, so the future variant inherits a ready corpus.
5. **Adversarial fixture family** (folds the word-sense adoption item's spirit): a
   quote that appears verbatim in a DIFFERENT signal than the one cited MUST fail
   (right words, wrong receipt); a quote that is a substring of the cited signal but
   crosses two sentences MUST pass (substring semantics only — no sentence heuristics).

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Paraphrase fault: evidence quote reworded from the signal summary → assembly refuses,
  naming claim + signal.
- Wrong-receipt fault: quote verbatim in signal B, cited to signal A → refuses.
- Whitespace robustness: quote differing only in whitespace runs → passes.
- Characterization report: regenerating it twice is byte-identical; its counts match a
  hand-checkable micro-fixture (3 claims: 1 verbatim, 1 paraphrase, 1 unresolvable).
- Full existing suite green (canned replay bodies gain compliant quotes if needed —
  that churn is in scope).

## Non-goals

- No fuzzy matching, no edit-distance, no LLM re-checking.
- No numeric cross-unit equivalence (the deferred variant's territory).
- Claim `text` prose is NOT scanned here (that is the rendered-figure gate's seam).

## Integration points

- `intelligence/run.py`: the gate call sits in `run_memo_dispatch`, immediately after
  the `assemble_memo(...)` call (run.py:1290) and BEFORE the `memo:decision` model call
  (run.py:1300-1301, 2026-07-21) — NOT inside `assemble_memo`, and NOT at the later
  `lint_provenance(...)` neighbor (run.py:1307, which runs after the decision call).
  Characterization under `intelligence/scripts/` or as a committed fixture + test;
  tests beside `test_assembly.py`.
- **Shared home for the resolution convention:** this spec owns TWO named helpers in
  `intelligence/registers.py`, and they are distinct: `resolve_signal_by_id(signal_id,
  signals_list, application_record)` maps an id to its signal object by the `id` field
  (the literal id `application` resolves to the application record) — this is the
  helper claim-provenance's rule 2 imports, no quote involved; `resolve_span_source(
  quote, sig, application_record)` then resolves WHICH source field a quote matched,
  per the fixed a→b→c order (recursive over the application's string values), and is
  this gate's own span resolver. `RESOLUTION_ORDER` names the branch order constant.
  (`intelligence/registers.py` is owned by the import-boundary spec and created by
  whichever of the registers.py specs lands first; this spec extends it. Verified
  absent at HEAD, 2026-07-21.)

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
