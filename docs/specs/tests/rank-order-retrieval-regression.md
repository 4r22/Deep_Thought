# Spec: rank-order retrieval regression

**Status:** spec-ready · **Effort:** M · **Seam:** experience terminal entity search (+ memory signal reads)
**Provenance:** pattern observed during a survey of other Hack-Nation submissions;
behavior re-specified from scratch (see docs/CLEAN-ROOM.md). No archive access needed
or permitted.

## Why (vc-brain terms)

The terminal's palette is the front door to every entity (persons, signals, runs, docs) —
its fuzzy ranking IS the product behavior "you type `spolsky`, the right chair surfaces
first." Nothing tests it. The classic weak version of a search test asserts *presence*
("results contain X"), which stays green while ranking silently degrades. The strong
version — the one worth building — asserts **order**: for a given query, entity A MUST
rank above entity B, and uses "must not appear" only where exclusion is *guaranteed by a
rule*, never as a relevance opinion.

## Behavioral contract

1. **Testable scorer.** The palette's match/rank logic in `experience/terminal.js` MUST
   be callable outside the browser: either extract the scoring/matching into a pure
   function file loadable by Node (no DOM references), or expose it via a small shim.
   Zero-dependency constraint holds — no bundler, no npm install; plain `node` execution.
2. **Declarative golden cases.** A committed JSON file of cases, each:
   - `query` (string), `corpus` (inline entity list OR a named fixture — cases must be
     hermetic, never dependent on the live `corpus.json` contents),
   - `rank_assertions`: ordered pairs `[higher, lower]` — the id ranked higher MUST
     precede the id ranked lower in results,
   - `must_include`: ids that must appear (presence, used sparingly),
   - `must_exclude`: ONLY for rule-guaranteed exclusions (e.g. an entity type the query
     grammar filters out), each with a `rule` string naming the guarantee,
   - `category`: `core` | `edge` | `adversarial`.
3. **Required case coverage** (minimum 20 cases):
   - core: exact-key hit ranks above substring hit; prefix beats mid-string; an
     entity+function query (`<key> <fn>`) resolves the function form.
   - edge: empty query (defined behavior, asserted); single-entity corpus; query longer
     than any key; unicode in keys.
   - adversarial: two entities sharing a long common prefix (order pinned); an entity
     whose *name* contains another entity's key (the exact-key entity must win); repeated
     identical entities deduped to one result (pin the dedup rule).
4. **Runner.** A test that loads the cases, runs the scorer, and reports every violated
   assertion with query + expected + actual order. Wired into the repo's test invocation
   documented in `experience/TERMINAL.md` (a `node` one-liner is acceptable).

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Planted fault A — ranking-weight regression: perturb one scoring weight (e.g. the bonus
  that makes exact-key beat substring) and ≥1 `rank_assertions` case MUST fail, naming
  the pair. Restore; suite green.
- Planted fault B — dedup regression: make the scorer return duplicates and the dedup
  case MUST fail.
- Planted fault C — presence-only blindness: demonstrate that converting all
  `rank_assertions` of one case to `must_include` makes fault A invisible for that case
  (this is the recorded justification for order assertions; keep as a meta-test or a
  documented experiment in the PR).
- No network, no browser, deterministic across runs.

## Non-goals

- Not a benchmark of the LLM pipeline; no model calls.
- Not a test of `corpus.json` content freshness (that is build-corpus territory).
- Memory-layer signal retrieval gets the same treatment ONLY if a ranked read path
  exists at implementation time; if reads are still unranked, note it and stop — do not
  invent a ranking to test.

## Integration points

- `experience/terminal.js` (scorer extraction), `experience/TERMINAL.md` (document the
  run command + the case-file format), new case file + runner under `experience/` or
  `experience/tests/` (implementer's choice, no build step).

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
