# Spec: claim-provenance completeness validators

**Status:** spec-ready · **Effort:** M · **Seam:** memo-stage dispatch inside
`run_memo_dispatch` (def run.py:1267, 2026-07-21) — rules fire immediately after the
`assemble_memo(...)` call (run.py:1290) and before the `memo:decision` model call
(run.py:1300-1301), the only model-free spot in the dispatch; the `lint_provenance(...)`
call (run.py:1307) is a downstream neighbor in the same function, not the insertion
point. They never run inside `assemble_memo` (def run.py:1235, 2026-07-21), which sees
only `docs_by_key`.
**Provenance:** both-directions provenance checking (every number→citation AND every
line item→a source utterance) and structural rejection of uncited findings — patterns
observed during a survey of other Hack-Nation submissions; behavior re-specified from
scratch (see docs/CLEAN-ROOM.md). Adoption-room verdict SPIKE-FIRST
(`claim-provenance-completeness-validators`).

## Why (vc-brain terms)

`lint_provenance` today checks one narrow direction — provenance *lines* cite known
claim ids — and only warns. The claims ledger's real integrity surface is wider, and
every rule below is checkable mechanically at assembly time against artifacts already
in hand (claims carry `{id, section, text, trust, evidence:[{quote, signal_id}],
contradictions}` — see any committed tape's `memo.json`):

## Behavioral contract

All rules run in `run_memo_dispatch` (def run.py:1267, 2026-07-21) — immediately after
the `sections, claims, gaps = assemble_memo(docs_by_key)` call (run.py:1290) and before
the `memo:decision` model call (run.py:1300-1301); the `lint_provenance(...)` call
(run.py:1307) sits a few lines further down in the same function. They do NOT run
inside `assemble_memo` (def run.py:1235): that function receives only `docs_by_key` and is
called bare by `test_assembly.py`, so it can see neither the run's signals input nor
the application record. No `assemble_memo` signature change is needed — at the dispatch
seam `application_json` and `sig = signals_or_empty(args)` are already in scope
(run.py:1277-1278), which is exactly what rules 2 and 3 need. Both, though, are jdump'd
JSON **strings**, not parsed structures — `sig = signals_or_empty(args)` returns
`jdump(load_json(args.signals))` (run.py:466-467) and `application_json =
jdump(load_application(args.application))` (run.py:1277) — so rules 2 and 3 must
`json.loads` them before resolving, and a signal resolves by its `id` field (every entry
in `signals-ferrite.json` carries one, `sig-001`…`sig-006`). Every violation raises
SystemExit naming rule id, claim id, and the offending value. The existing
`lint_provenance` warnings become failures in the same pass (shared work item with the
rendered-figure gate spec — implement once, whichever lands first; state in the PR
which spec landed it).

1. **evidence-nonempty:** every claim has ≥1 evidence entry. A deliberate evidence-free
   claim is not a claim — it belongs in `gaps`.
2. **signal-resolution:** every `evidence[].signal_id` resolves against the run's
   signals input (`sig = signals_or_empty(args)`, in scope at run.py:1278 — `json.loads`
   it first, then match each id against a signal's `id` field), OR names the application
   record (`signal_id == "application"`, present in every committed tape). Do not
   re-derive the id-resolution convention here: **import `resolve_signal_by_id(
   signal_id, signals_list, application_record)`, the id-resolution helper the
   verbatim-span gate spec defines and places in `intelligence/registers.py`** — it
   maps an id to its signal object by the `id` field over the parsed signals list and
   treats the literal id `application` as resolving to the application record. (The
   verbatim-span spec's other helper, `resolve_span_source`, takes a quote and an
   already-resolved signal — that one is its span gate's concern, not rule 2's.) The
   module is owned by the import-boundary spec and created by whichever of the
   registers.py specs lands first; neither spec re-declares the helper. The
   *fatal* form of this gate scopes to the frozen-ferrite pair only (see acceptance
   criteria); tapes whose signals live in the mutable `memory/signals.json` store resolve
   but are not merge-gated.
3. **contradiction-resolution:** every id in `claims[].contradictions` resolves to a
   claim `id` present in this run OR to a signal `id` in the parsed signals input (the
   same `json.loads(sig)` list rule 2 uses — match against each signal's `id` field).
   Dangling contradiction refs are the worst kind of theater — they *look* like rigor.
4. **duplicate-citation-divergence:** two claims citing the *same* evidence quote
   (same signal_id + normalized quote) fail only when their extracted figures
   *conflict* — i.e. they share a normalized quantity **kind** whose value differs (one
   says `$18k MRR`, the other `$80k MRR`). A figure token in a claim's `text` parses into
   a **(quantity-kind, numeric-value)** pair, defined here — the rendered-figure gate
   supplies value normalization but has no notion of metric identity (its taxonomy is the
   coarse class currency/percent/multiplier/count, nothing that separates `$18k MRR` from
   `$18k ARR`), so kind-extraction is defined inline in this spec and only the value side
   is reused:
   - **value** is the number normalized by the rendered-figure gate's rules — strip
     separators, resolve `k`/`M` suffixes — via the shared value-normalization constant
     this spec imports from `intelligence/registers.py` (the same constant the
     rendered-figure gate places there; `18k` and `18,000` normalize equal).
   - **kind** is the currency symbol/unit class plus the metric noun or unit adjacent to
     the number: `$…MRR` → `currency:mrr`; `…ARR` → `currency:arr`; a `40%` growth figure
     → `percent:growth`; `10x` → `multiplier`; `3,100 installs` → `count:installs`. Two
     kinds are the **same** iff their (class, adjacent-noun) match after lowercasing —
     so `$18k MRR` and `$18k ARR` are **different** kinds (same class, different noun) and
     never conflict, and a percentage-growth figure and a currency-level figure are
     distinct kinds by class.
   Figure-set inequality is NOT the test: `$18k MRR up 40%` and `$18k MRR` cite one
   receipt and agree on the `currency:mrr` value `18000`, so they pass — the lone
   `percent:growth` `40%` on one side is not a conflict because the other side asserts no
   competing `percent:growth`. Formally: fail iff, for some quantity kind present in
   *both* claims' `text`, the two normalized values differ. One receipt cannot support
   two different values of the same kind, but it can support a superset of kinds.
5. **gap-shape:** every `gaps[]` entry names a concrete `field` (nonempty), and no
   gap's field is *also* the subject of a same-section claim asserting a value — a
   thing cannot be simultaneously known and declared missing. Two mechanics the
   assembled artifact does not hand you for free:
   - **Section for a gap.** `assemble_memo` merges gaps section-blind (`gaps +=
     doc["gaps"]`, whereas claims are stamped `{"section": key, ...}`), and the memo
     schema's gap item is `{field, note}` with `additionalProperties:false` — so a
     `section` key can be neither read off the merged list nor added to the artifact.
     Build an internal, non-artifact `section → gaps` index in the dispatch by
     iterating `docs_by_key` (where `key` is in scope, alongside the `docs_dir` write
     loop), and match each gap only against claims carrying that same `section`.
   - **Field↔claim matching.** Tokenize the gap's `field` on underscore / whitespace /
     punctuation into lowercase word tokens (`cap_table → [cap, table]`;
     `Market size (TAM/SAM/SOM) → [market, size, tam, sam, som]`), normalize the claim
     `text` the same way, and fire only when *every* field token appears as a whole
     word in the claim text, case-insensitive. Word-boundary matching of the raw field
     string does NOT work — `\bcap_table\b` never matches `the cap table shows`
     (underscore ≠ space) — which is why the acceptance example below is stated in
     tokens. All-tokens (not any-token) keeps real spaced fields like
     `Market size (TAM/SAM/SOM)` from tripping unrelated prose.
6. **trust-shape:** every claim's `trust.tier`/`authority`/`verification`/`confidence`
   take values from the memo schema's enums (the memo schema pins all four as `enum`s
   under `claims[].trust`; verify in `intelligence/schemas/memo.schema.json`). This is
   belt-and-braces because the code-assembled memo is self-validated only by the minimal
   `_require_keys` (def run.py:672, called at run.py:1306), which checks object-ness and
   top-level required keys but never descends into the nested `trust` enums — so an
   out-of-enum trust value survives assembly today unless a full jsonschema validator is
   installed.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- One planted fixture per rule (six faults), each failing with its rule id named; the
  minimally corrected twin passes (both-ways discipline, per the both-ways spec).
- Dangling contradiction: claim citing `contradictions: ["sig-nope"]` → rule 3 fails.
- Two-claims-one-receipt (rule 4): the same quote supporting "$18k MRR" and "$80k MRR"
  fails (conflicting MRR); the same quote supporting the same figure in two sections
  passes; and a third fixture — one claim "$18k MRR up 40%", its twin "$18k MRR", same
  receipt — MUST pass, proving the check keys on a conflicting shared quantity kind, not
  on figure-set inequality.
- Known-and-missing (rule 5): a gap `{"field": "cap_table"}` beside a claim "the cap
  table shows…" in the *same section* fails — `cap_table` tokenizes to `[cap, table]`,
  both present as whole words in the claim text; the minimally corrected twin (same
  gap, no such claim in that section) passes.
- **Committed-corpus reality (verified at HEAD d3b727e, 2026-07-21) — the corpus does
  NOT pass rule 1 clean.** `ferrite-inverted/memo.json` claim **C48** (`section:
  problem_product`) and `ferrite-full/memo.json` claim **C11** (`section:
  team_history`) both carry `evidence: []`. Pre-seed a **dated grandfather allowlist**
  with exactly those two entries — `ferrite-inverted:C48` and `ferrite-full:C11`
  (dated 2026-07-21) — and gate everything else. Regenerate-or-grandfather is the same
  discipline as the verbatim-span gate.
- **Signals pairing for rule 2 (via the shared resolution helper).** The *frozen-ferrite
  pair* — `ferrite-full` + `ferrite-inverted` — resolves against the committed
  fixtures `intelligence/fixtures/signals-ferrite.json` (ids `sig-001..006`) +
  `application-ferrite.json`; name this the frozen-pair rule, and run the fatal merge
  gate against this pair only. The other committed tapes cite `sig-gh-*` ids
  that DO resolve — against `memory/signals.json` (a store in the working repo,
  20 entries `sig-gh-001..020`, not shipped here) — but that store is a **living** one, so these tapes are
  *resolvable-but-living* and are excluded from the fatal merge gate; evaluate them
  advisory-only. (`signal_id == "application"` resolves via the application-record
  branch in every tape.)

## Non-goals

- No truth-checking of evidence content (trust ladder territory); resolution and
  internal consistency only.
- No prose scanning beyond rules 4–5's defined extraction (the rendered-figure gate
  owns prose figures).
- No new schema files — the memo schema stays the source of shape truth.

## Integration points

- `intelligence/run.py` memo-dispatch seam (`run_memo_dispatch`, def run.py:1267), rules
  pinned right after the `assemble_memo` call (run.py:1290) and before the
  `memo:decision` model call (run.py:1300-1301); tests beside
  `intelligence/tests/test_assembly.py` (its canned docs are the fixture base). Shared
  constants are imported from `intelligence/registers.py` (owned by the import-boundary
  scan-gate spec, created by whichever registers.py spec lands first — the verbatim-span
  gate places the id-resolution helper there, the rendered-figure gate the
  value-normalization constant; this spec imports both and re-declares neither).

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
