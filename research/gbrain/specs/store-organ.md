# Spec dossier — the bitemporal store organ

Bead `vc-brain-1ad.2` (spec recovery, narrowed scope). Recovered from gbrain source so a
fresh implementation needs **no** gbrain access. gbrain is MIT-licensed ("Copyright (c) 2026
Garry Tan", per its LICENSE file). **This dossier copies no gbrain code** — it
recovers the design as normative requirements; the implementing `.ts` files that later
transcribe any gbrain function carry the MIT + "Adapted from gbrain <path> (MIT)" header per
HARD CONSTRAINT 1. All examples here are synthesized VC-domain data (HARD CONSTRAINT 2); no
gbrain fixture data is reproduced [gsig-115].

**What the "store organ" is.** The persistence layer under vc-brain's frozen `signal` and
`founder` contracts (`intelligence/schemas/signal.schema.json`, `founder.schema.json`). gbrain's
closest analogue is the `facts` table, defined **only** inside the embedded migration registry
(`src/core/migrate.ts:2288`), **not** in `src/schema.sql` [gsig-036] — extracting "the schema"
from `schema.sql` alone misses the table that matters. Everything below is recovered from the
migration DDL, the storage/import/operations code, and the migration history where it records
its own scars. Docs were used only where source-verified: gbrain's own docs demonstrably drift
(claim "37/47 methods" against 143–146 actual [gsig-007]; cite deleted files [gsig-119]), so no
clause here rests on a doc.

**How to read.** Every normative clause has **WHAT** (implement-blind requirement), **WHY**
(gbrain scar/rationale + `[gsig-NNN]` + file:line), **TEST** (an assertion the 1ad.5 harness or
a `node --test` store unit test can implement). Clauses are numbered `S-n`.

---

## Non-goals (explicitly out of this slice, and why)

- **gbrain's supersession / `expired_at` / `superseded_by` / `consolidated_into` machinery**
  (`migrate.ts:2302-2305`). Replaced by *substrate versioning* — the Dolt commit graph is the
  leading candidate (bead 1ad.3). Row-level supersession columns duplicate what a versioned
  substrate gives natively; deferred to 1ad.3 so we don't hand-roll a second history mechanism.
- **The `asof` ontology surface and `whoknows` expert-routing.** Zero downstream callers proven
  (bead 1ad.1 gate); the run-vs-own fork over this band is settled — no gbrain process runs. Its
  *storage substrate* (the `facts` two-clock shape) is in scope; its *query ops* are not.
- **The live-PID PGLite lock discipline** [gsig-026] (`pglite-lock.ts`). Architecture-specific to
  gbrain's dual-engine PGLite+Postgres setup; non-transferable to a single-engine owned store
  (debate Turn 14). A single-writer store needs no never-steal-a-live-PID heartbeat.
- **Vector/embedding columns and HNSW indexes** (`embedding`, `embedded_at`,
  `idx_facts_embedding_hnsw`, `migrate.ts:2310-2311,2353-2355`). Dead weight keyless [gsig-038];
  the store is full-text/relational only.

---

## Normative clauses

### S-1 — Two-clock split: valid time vs transaction time, as two distinct required columns

**WHAT.** The store records every signal under **two independent clocks**, stored as two
columns that are never conflated:
- `observed_at` — **valid time**: when the underlying event actually happened (commit date,
  post date, filing date, deck date). Supplied by the caller from the artifact. **Required**;
  it MUST NOT silently default to ingest time.
- `ingested_at` — **transaction time**: when the store captured the row. Server-assigned at
  write; monotonic; never back-dated by a payload.

The pair, not either alone, is what yields trend-over-time rather than a latest-snapshot
(signal schema, `observed_at`/`ingested_at` descriptions). A re-ingest of the same event
produces a new `ingested_at` but preserves the original `observed_at`.

Additionally record **`observed_at_source`** — a sentinel naming where `observed_at` came from
(`event_date | date | published | filename | fallback`), so an *inferred* observed time is
distinguishable from an artifact-stamped one and can be graded `reconstructed`.

**WHY.** gbrain's `facts` DDL already implements exactly this split: `valid_from` / `valid_until`
/ `expired_at` (validity time) versus `created_at` (record time), never-delete
[gsig-037, `migrate.ts:2300-2312`]. **The recovered strengthening:** gbrain declares
`valid_from TIMESTAMPTZ NOT NULL DEFAULT now()` (`migrate.ts:2300`) — so a caller that omits the
event time silently collapses valid time onto transaction time, destroying the very
trend-over-time signal the two clocks exist for. vc-brain's frozen contract makes `observed_at`
**required and distinct** from `ingested_at`, so the store must reject the default-to-now
collapse. The `observed_at_source` sentinel is gbrain's `pages.effective_date_source`
(`schema.sql:112-119`, documented values `event_date|date|published|filename|fallback`), consumed
by a doctor health check [gsig-041] — provenance-of-the-date-itself, which maps onto grading an
inferred date `reconstructed`.

**TEST.**
1. Insert a signal with `observed_at = 2026-05-11T00:00:00Z` (event day) at wall-clock
   `2026-07-16`. Assert stored `observed_at == 2026-05-11...` and `ingested_at >= 2026-07-16`,
   and `ingested_at != observed_at`.
2. Re-ingest the same event (same `dedupe_key`) a day later. Assert `observed_at` is unchanged
   and the earliest `ingested_at` is retained/derivable (S-3 dedup preserves timestamps).
3. Attempt to insert a signal with `observed_at` absent → assert the write is rejected
   (no silent `now()` default).
4. Insert with `observed_at` derived from a filename → assert `observed_at_source == 'filename'`
   and that the grader may down-tier it to `reconstructed`.

---

### S-2 — Provenance and gate-assigned fields are fail-closed: payloads cannot self-elevate

**WHAT.** `trust_tier`, `authority`, `observed_at_source`, and `ingested_at` are **assigned by
the write gate**, not by the incoming payload, unless the caller is a trusted local caller. The
default posture is: server-stamp these fields; only an explicitly trusted local ingestion path
may pass them through. A remote/untrusted/agent-originated write that *claims*
`trust_tier: "verified-artifact"` or `authority: "independent"` gets the server's conservative
stamp regardless of what it sent. There is exactly one truthy condition that admits
client-supplied provenance (trusted-local); every other path is stamped.

**WHY.** gbrain's `put_page` provenance stamping is fail-closed: per its CV6 gate,
`ctx.remote === false` is the only condition that admits client-supplied
`source_kind`/`source_uri`/`ingested_via`; every other caller is stamped `mcp:put_page`
[gsig-068, `operations.ts:745-771`]. The scar: pre-fix, "a write-scope OAuth token could send
`source_kind: 'capture-cli'` to poison the audit trail" (`operations.ts:753-754`). This is the
structural template for making `trust_tier`/`authority` gate-assigned — the frozen contract's
whole trust model collapses if a subject-supplied deck can label itself `verified-artifact`.
`authority: subject` material must never be able to stamp itself `independent`.

**Deferred to 1ad.5.** S-2 fixes the fail-closed *direction* only (payloads cannot self-elevate).
The concrete `(source, remote) → (trust_tier, authority)` stamp table — which exact conservative
default each `source` enum receives — is pinned in bead 1ad.5, not here; TEST 1 is therefore stated
as a deterministic *negative* assertion (the requested elevation did not take), not against a
specific default enum value.

**TEST.**
1. Call the write path with `{remote:true, trust_tier:"verified-artifact", authority:"independent"}`
   on a subject-supplied `source:"deck"` signal → assert the stored `trust_tier` is **not** the
   requested `verified-artifact` (and not any elevated tier in `{verified-artifact, verified-online}`),
   and the stored `authority == "subject"` (a subject-supplied source cannot self-elevate to
   `independent`). The exact conservative default tier is asserted in 1ad.5 once its stamp table
   is pinned.
2. Call the trusted-local path (`remote:false`) with the same payload → assert the passed values
   are honored.
3. Assert that no code path lets `authority` be set to `independent`/`operator-primary` from a
   `remote:true` caller.

---

### S-3 — Dedupe key is a deterministic content hash that excludes ephemeral keys

**WHAT.** `dedupe_key` is a stable content fingerprint computed by the store (when the caller
does not supply a natural key such as a canonical URL). Recipe:
`dedupe_key = sha256(canonicalJson(payload_minus_ephemeral)).slice(0, 8)` where
- `canonicalJson` recursively stringifies with **sorted object keys** so reordering fields does
  not change the hash, and
- `payload_minus_ephemeral` **deletes the ephemeral keys before hashing** — at minimum
  `ingested_at`, any `captured_at`/`fetched_at`, and any gate-derived markers (quarantine /
  content-flag / embed-skip). Only the *meaningful* fields hash: the identity of the signal
  (e.g. `{founder_ids, company_ids, source, summary, observed_at, url, raw_ref}` — sorted).

A hash match **short-circuits the write**: the original row and its timestamps are left
untouched (idempotent re-ingest). Both surviving `observed_at` timestamps of merged duplicates
are preserved in history (signal schema `dedupe_key` note: "their timestamps both survive").

**WHY.** Two gbrain modules converge on this recipe. (1) Import dedup deletes
`HASH_EPHEMERAL_FRONTMATTER_KEYS = ['captured_at','ingested_at', quarantine, content_flag,
embed_skip]` before `sha256` over `{title,type,compiled_truth,timeline,frontmatter,tags.sort()}`;
a hash match returns early, "leaving the original row and timestamps untouched"
[gsig-077, `import-file.ts:529-550`]. The scar (in-source, `import-file.ts:520-528`): gate-derived
markers carry a fresh `assessed_at`, so hashing them made "every re-sync of a flagged page … 
re-chunk + re-embed forever" — unbounded spend. (2) The op-checkpoint fingerprint is
`sha256(canonicalJson(params)).slice(0,8)` with sorted-key canonicalization "so a reorder of
object literals doesn't flip the fingerprint" [gsig-078, `op-checkpoint.ts:311-321`]. If
`ingested_at` is in the hash, every re-fetch mints a new key and the dedup never fires — the exact
defeat-by-timestamp the ephemeral-key exclusion prevents.

**TEST.**
1. Compute `dedupe_key` for a signal payload, then recompute after reordering the object's keys
   → assert the two keys are identical.
2. Compute `dedupe_key`, then bump only `ingested_at` (and any `captured_at`) and recompute
   → assert identical (ephemeral keys excluded).
3. Change one meaningful field (`summary`) → assert the key changes.
4. Insert a signal, then re-ingest the byte-identical event with a later `ingested_at` → assert
   exactly one row exists and its `observed_at`/first `ingested_at` are unchanged (short-circuit).

---

### S-4 — Value-hash dedup for per-attribute claims is deterministic and idempotent under crash-retry

**WHAT.** When a signal asserts a *typed attribute* of an entity (a `(entity, dimension, value)`
claim — e.g. `(fndr-0001, role, "cofounder")`, `(co-0001, mrr, "18000")`), the store computes a
deterministic `value_hash` over the resolved value and enforces a **UNIQUE** constraint on
`(source_scope, entity_id, dimension, value_hash, source_ref)`. The uniqueness tuple carries
**no timestamp**, so a crash-and-retry of the same write is idempotent (the retry hits the
existing row instead of inserting a duplicate). A plain (non-typed) signal leaves `dimension`
NULL and is unaffected by this index.

The `value_hash` recipe is pinned for cross-process stability:
`value_hash = sha256(canonicalJson(normalized_value))`, reusing S-3's sorted-key `canonicalJson`
over the value **after** the dimension's normalization (type coercion, trim, case-fold). gbrain's
source names it only "a deterministic value_hash dedup key" [gsig-045] without a recipe; any
deterministic hash satisfies idempotency, so the exact algorithm is an implementation choice — the
store fixes this one so the key stays stable across processes and re-opens.

**WHY.** gbrain migration v122 (`facts_ontology_dimension`, "Life Chronicle #2390") overlays
`dimension`, `value`, `value_hash` ("a deterministic value_hash dedup key"), `dim_status` on
`facts`, with `CREATE UNIQUE INDEX idx_facts_ontology_dedup ON facts(source_id, entity_slug,
dimension, value_hash, source_markdown_slug) WHERE dimension IS NOT NULL`, and the in-source
rationale: "The partial UNIQUE is deterministic (no timestamp) so a crash-retry is idempotent"
[gsig-045, `migrate.ts:5479-5506`]. Plain facts keep `dimension` NULL → unchanged behavior. This
is the substrate that lets `founder_score` inputs be de-duplicated per attribute without letting
two ingests of the same claim double-count.

**TEST.**
1. Write `(fndr-0001, role, "cofounder", source_ref=X)` twice → assert one row.
2. Write the same claim from a *different* `source_ref=Y` → assert two rows (distinct
   provenance survives; see S-6).
3. Simulate crash-retry: issue the identical insert twice in a tight loop → assert idempotent
   (one row, no unique-violation crash bubbles to the caller).
4. Write a plain signal with `dimension` NULL → assert the value-hash unique index does not
   constrain it (two plain signals with the same summary but different `dedupe_key` coexist).

---

### S-5 — Create-vs-update decides on named evidence, never on a blended score

**WHAT.** Before creating a *new* entity record (founder/company) or a new signal that might
duplicate an existing one, the resolver MUST classify **why** a candidate match surfaced and
derive a `create_safety` verdict from that named reason — not from thresholding a single blended
similarity number. Named evidence (strongest wins):
`exact_id_match | alias_hit | exact_title_match | strong_field_match | weak_match`, deriving
`create_safety ∈ {exists, probable, unknown}`:
- `exists` — strong evidence this IS the record; do **not** create a duplicate (update instead).
- `probable` — likely the record; prefer update over create.
- `unknown` — weak signal; require a closer look before creating.

Every candidate result carries both `evidence` and `create_safety` so the caller and any
`--explain` path read the same contract.

**WHY.** gbrain's `evidence.ts` is a 79-line pure module born from a real incident: an agent
"read a single blended score (0.64) and decided 'no strong match, safe to write a new page' —
then wrote a duplicate on top of a fully-developed concept page" [gsig-034, `evidence.ts:1-14`].
Fix: name the strongest signal (`alias_hit | exact_title_match | high_vector_match |
keyword_exact | weak_semantic`, `evidence.ts:31-52`) and derive `create_safety` from it
(`evidence.ts:54-65`), stamped on every result (`stampEvidence`, `evidence.ts:72-78`). **Portability
caveat recovered from source:** two of gbrain's tiers (`high_vector_match`, `keyword_exact`) are
themselves `base_score` floors (`HIGH_MATCH_FLOOR = 0.85`, `SOLID_MATCH_FLOOR = 0.6`,
`evidence.ts:41-43`) — the *portable* part is the named-evidence **shape**, not those vector
thresholds. In keyless vc-brain the vector tier is absent; the surviving named reasons are
id/alias/title/field-exact, which is exactly the deterministic subset.

**TEST.**
1. Given an existing founder with alias "SB", resolve an incoming signal naming "SB" → assert
   `evidence == 'alias_hit'` and `create_safety == 'exists'`; assert the resolver updates, not
   creates.
2. Given only a weak fuzzy overlap → assert `create_safety == 'unknown'` and that creation is
   gated behind a closer-look step, not auto-performed.
3. Assert every returned candidate carries both `evidence` and `create_safety` (idempotent
   re-stamp yields the same values).

---

### S-6 — Dedup keys include source; same-fact-different-source rows are preserved, not collapsed

**WHAT.** Any uniqueness/dedup constraint that could merge two observations MUST include the
**source/provenance** in its key. Two rows that agree on entity, date, and content but come from
**different sources** are distinct rows and both survive. Provenance is never a tiebreaker that
silently discards one observation.

**WHY.** gbrain widened its timeline dedup index from `(page_id, date, summary)` to
`(page_id, date, summary, source)` "so distinct meeting provenance survives"
[gsig-042, `schema.sql:551-554`]. Source-blind dedup keys silently collide same-fact-
different-source rows — and cross-source corroboration (≥2 independent sources on one claim) is a
*trust-tier promotion signal* for vc-brain, so collapsing it destroys evidence. This is also why
S-4's value-hash tuple carries `source_ref`.

**TEST.**
1. Insert the same claim (`entity`, `observed_at`, `summary`) from `source:"press"` and
   `source:"registry"` → assert two rows persist.
2. Insert the byte-identical claim twice from the *same* source → assert one row (S-3/S-4 dedup).
3. Assert a corroboration query can count DISTINCT sources on one claim (≥2 ⇒ promotable).

---

### S-7 — Schema/index integrity is verified by SHAPE on every startup, not trusted from a version counter

**WHAT.** The store MUST NOT trust a migration/version counter as proof that its indexes and
columns have the expected shape. On every startup (including the "no migration pending" path), it
inspects the **actual** shape of load-bearing unique indexes and columns (introspect
`information_schema` / index catalog), compares against the expected shape, and self-heals a
missing or wrong-shaped index idempotently. An absent expected index counts as "needs repair".
Repairs that tighten a unique index first **de-duplicate** existing rows that the looser index
allowed, then rebuild — so `CREATE UNIQUE INDEX` cannot throw on pre-existing collisions.

**WHY.** gbrain's `timeline-dedup-repair.ts` exists because a **renumbered migration** left some
brains with the old 3-column index while the version counter was stamped *past* the fix, so
`runMigrations` early-returned (nothing pending) and "timeline writes silently break brain-wide"
with an ON CONFLICT mismatch [gsig-042, `timeline-dedup-repair.ts:1-17`]. The repair is "keyed off
the actual index SHAPE and runs on every migrate pass … Idempotent: a no-op when already correct"
(`:14-17`); it dedupes first because the loose index let colliding rows coexist and the unique
rebuild would otherwise throw (`:76-78`). Independently, gbrain ships `schema-verify.ts` because
"PgBouncer transaction-mode poolers can silently swallow ALTER TABLE" while the counter increments
anyway [gsig-008]. **The general requirement: shape is the source of truth, the counter is a
hint.** A single-engine owned store inherits the failure mode (a partially-applied migration, a
manual edit) even without pooler/dual-engine specifics.

**TEST.**
1. Create the store, then out-of-band drop the value-hash unique index (S-4) and bump the version
   counter past it. Reopen the store → assert startup detects the missing/wrong-shape index,
   rebuilds it, and a subsequent duplicate-claim insert is correctly deduped.
2. Seed rows that violate the *tightened* uniqueness (allowed under a looser prior index), then
   run the repair → assert it collapses duplicates first and the unique rebuild succeeds without
   throwing.
3. Run the integrity check on an already-correct store → assert it reports `already_correct` and
   changes nothing (idempotent).

---

### S-8 — Writes to flat files are crash-atomic (tmp + fsync + rename)

**WHAT.** Any store persistence to a flat file (JSON export, sidecar, snapshot) writes to a
unique temp path `${path}.tmp.${pid}.${timestamp}`, fsyncs (tolerating filesystems without
fsync — "rename is still atomic per POSIX"), then `rename`s over the target; on any failure it
unlinks the temp file and surfaces a typed IO error. A reader never observes a half-written file.

**WHY.** gbrain's `writeAtomic` is this exact ~15-line idiom, `node:fs` only, used for every
schema-pack mutation [gsig-065, `schema-pack/mutate.ts:261-283`]. Directly copyable for
crash-safe flat-JSON writes; included because the store's durability is a store-organ concern
even if the substrate (S-appendix) is a DB. If 1ad.3 picks a transactional DB substrate, this
clause governs only the export/sidecar surface, not row writes.

**TEST.**
1. Write a JSON blob via the atomic writer; assert no `*.tmp.*` file remains afterward.
2. Inject a failure between temp-write and rename → assert the target file is unchanged (old
   content intact) and the temp file is cleaned up.
3. Concurrent writers to distinct pids → assert distinct temp paths (no clobber) and a
   well-formed final file.

---

### S-9 — The store returns the COMPLETE, time-ordered signal set for an opportunity (fifth workload gate)

**WHAT.** For a given founder/company/opportunity, the store exposes a query that returns **every**
signal attached to it (nothing filtered away as "superseded" or "stale"), ordered by
`observed_at` (valid-time timeline). Attachment is materialized by the
`signal_entities(signal_id, entity_id, entity_kind)` junction of section (a) — populated from each
signal's `founder_ids[]`/`company_ids[]` — so the query joins `signal_entities` on
`(entity_id, entity_kind)` and sorts by `observed_at`. An "opportunity" resolves to its `founder_id`
and/or `company_id`, and their attached signal sets union. Contradicting signals are **included**,
tagged (S-10), not suppressed. This is the memory guarantee the Intelligence track reads for
sourcing-depth: the full ledger, in event order, with provenance intact.

**WHY.** The signal schema's founding principle is "Nothing discarded: timestamped, source-tagged,
deduplicated, trust-tiered" (`signal.schema.json` description). gbrain's never-delete facts design
[gsig-037] and its markdown facts-fence render supersession as *strikethrough*, "a rendering,
never a row removal" [gsig-040, `facts-fence.ts:12-33`] — the row stays queryable. The store's job
is to hand back the whole time-ordered set; ranking/filtering is a downstream concern, not a
storage one. This is the fifth of the adjudication's workload gates.

**TEST.**
1. Attach 5 signals to `fndr-0001` (via each signal's `founder_ids`, materialized into
   `signal_entities`) across 3 months, including one pair that contradict. Query the
   opportunity → assert all 5 returned, ordered ascending by `observed_at`, with the contradicting
   pair present and flagged (not dropped).
2. Supersede/append a corrected claim → assert the prior claim is still returned by the complete
   query (append-only; retrieval sees history).

---

### S-10 — Same-attribute conflicts are surfaced as data (contradicts[]), not resolved away

**WHAT.** When two current, non-superseding signals assert **different values for the same
attribute** of the same entity from **different provenances**, the store surfaces the conflict as
first-class data: each signal's `contradicts[]` names the other, and a query returns "attributes
with ≥2 distinct current values from ≥2 sources". Genuine disagreement is distinguished from
temporal supersession (a later value replacing an earlier one is *not* a contradiction).
Contradictions are debate seeds and memo flags, never errors to suppress.

**Defining "current" from in-scope columns only** (no `superseded_by` — that column is a Non-goal).
For an `(entity, dimension, source)` triple, the **current** value is the row with `max(observed_at)`
for that triple. A **conflict** is ≥2 *distinct* current values across ≥2 *sources*. A later
`observed_at` from the **same** source is temporal replacement — the newer row becomes that source's
current value and the older is simply not current — **not** a conflict. Only cross-source
disagreement (≥2 sources still current) is surfaced; same-source replacement is silent. This
grounds "current"/"non-superseding" entirely on `observed_at`, without the deferred supersession
machinery.

**WHY.** gbrain's `ontology_conflicts` op returns "dimensions with ≥2 distinct current values from
≥2 provenances (genuine disagreement, not temporal supersession)"
[gsig-045, `operations.ts:5211-5233`]. vc-brain's frozen contract already reserves `contradicts[]`
as a first-class array ("Contradictions are first-class — they become debate seeds and memo flags,
not errors to suppress", `signal.schema.json`). The ferrite fixture is the worked example:
`sig-001` (deck: "3,100 active installations") and `sig-004` (registry: "2,900 lifetime downloads")
mutually list each other in `contradicts[]`. The store must make that queryable, not paper over it.

**TEST.**
1. Insert `sig-001` (deck claim) and `sig-004` (registry claim) with mutual `contradicts[]` →
   assert a conflict query returns this attribute with both distinct values and both sources.
2. Insert a second value for the same `(entity, dimension)` from the **same source** at a later
   `observed_at` (per the "current" rule above, this replaces the earlier one) → assert it is NOT
   reported as a conflict (temporal replacement, not cross-source disagreement).
3. Assert `contradicts[]` is a real queryable column/edge, not free text (the `contradicts` row in
   section (a)).

---

## (a) Frozen-contract fields → store columns (first-class, never frontmatter/JSON-blob)

gbrain's `facts` table has **no** native column for vc-brain's four load-bearing fields —
`trust_tier`, `authority`, `dedupe_key`, `contradicts[]` — and no JSONB metadata column to stuff
them into; free text goes in `context TEXT`, sourcing is only `source TEXT` + `source_session` +
scalar `confidence` [gsig-038, `migrate.ts:2288-2360`]. Running gbrain would force these four
through pages-frontmatter convention. **The owned store makes them real, indexed columns.**

The tables below map the **complete** frozen field set of both contracts (not just the four),
so every field an S-clause leans on has a named column. Entity linkage (`founder_ids`/
`company_ids`/`signal_ids`/`companies`) and `aliases` are called out because S-9 and S-5 are not
blind-implementable without them.

**Signal record** (`signal.schema.json`).

| Frozen field | Store column (recovered target) | gbrain analogue / gap | Anchor |
|---|---|---|---|
| `id` | `id TEXT PRIMARY KEY` (e.g. `sig-0001`, never reused) | `facts` surrogate PK | [gsig-037] `migrate.ts:2288` |
| `founder_ids[]` | junction `signal_entities(signal_id, entity_id, entity_kind)` rows with `entity_kind='founder'`; UNIQUE`(signal_id, entity_id, entity_kind)`, INDEX`(entity_id, entity_kind)` for the S-9 reverse scan | **absent** — facts has no signal↔entity link table | [gsig-038] `migrate.ts:2288-2360` |
| `company_ids[]` | same `signal_entities` junction, `entity_kind='company'` | **absent** | [gsig-038] |
| `source` (enum) | `source TEXT NOT NULL` CHECK enum | `facts.source TEXT NOT NULL` (free text) | [gsig-037] `migrate.ts:2306` |
| `url` | `url TEXT` (nullable) | **absent** in facts | [gsig-038] |
| `observed_at` (valid time) | `observed_at TIMESTAMP NOT NULL` (no `now()` default) | `facts.valid_from` — but gbrain defaults it to `now()`; S-1 removes the default | [gsig-037] `migrate.ts:2300` |
| `ingested_at` (transaction time) | `ingested_at TIMESTAMP NOT NULL` (server-assigned) | `facts.created_at DEFAULT now()` | [gsig-037] `migrate.ts:2312` |
| (`observed_at` provenance) | `observed_at_source TEXT` (`event_date\|date\|published\|filename\|fallback`) | `pages.effective_date_source` | [gsig-041] `schema.sql:112-119` |
| `summary` | `summary TEXT NOT NULL` | `facts.context TEXT` (free text) | [gsig-038] `migrate.ts:2288-2360` |
| `raw_ref` | `raw_ref TEXT` | **absent** in facts (`raw_data` table + `.raw/` sidecar convention) | [gsig-043] |
| `trust_tier` | `trust_tier TEXT NOT NULL` first-class, gate-assigned, CHECK enum | **absent** in facts; would be frontmatter | [gsig-038] `migrate.ts:2288-2360` |
| `authority` | `authority TEXT NOT NULL` first-class, gate-assigned, CHECK enum | **absent** in facts | [gsig-038] |
| `dedupe_key` | `dedupe_key TEXT` first-class + UNIQUE (content hash) | `facts.value_hash` (typed attrs only, v122) / import hash | [gsig-045] `migrate.ts:5497`; [gsig-077] |
| `contradicts[]` | `contradicts` — real edge/array column, queryable (S-10) | **absent**; gbrain surfaces conflicts via query op only | [gsig-038]; [gsig-045] `operations.ts:5211` |

**Founder record** (`founder.schema.json`).

| Frozen field | Store column (recovered target) | gbrain analogue / gap | Anchor |
|---|---|---|---|
| `id` | `id TEXT PRIMARY KEY` (e.g. `fndr-0001`, never reused) | entity surrogate PK | `founder.schema.json` |
| `name` | `name TEXT NOT NULL` | entity attribute (no facts analogue) | `founder.schema.json` |
| `aliases[]` | lookup `founder_aliases(founder_id, alias, alias_norm)`, INDEX on `alias_norm` — the queryable surface S-5's `alias_hit` resolves against | gbrain classifies `alias_hit` in `evidence.ts` but recovers no stored alias table | [gsig-034] `evidence.ts:31-52` |
| `links.{github,linkedin,twitter,site}` | four nullable columns `link_github / link_linkedin / link_twitter / link_site TEXT` (fixed contract keys) | entity attributes | `founder.schema.json` |
| `location` | `location TEXT` (nullable) | entity attribute | `founder.schema.json` |
| `first_seen` | `first_seen TIMESTAMP NOT NULL` | entity attribute | `founder.schema.json` |
| `last_updated` | `last_updated TIMESTAMP NOT NULL` | entity attribute | `founder.schema.json` |
| `founder_score.{value,band,confidence,evidence_count,cold_start}` | `score_value INTEGER`, `band_low / band_high INTEGER`, `score_confidence TEXT CHECK`, `evidence_count INTEGER`, `cold_start BOOLEAN` — semantics governed by (c) | `founder-scorecard.ts` pure rollup, zero new schema | [gsig-095] `founder-scorecard.ts:1-7` |
| `founder_score.history[]` (append-only) | `founder_score_history` append-only rows `(at, value, reason, signal_id)` | `page_versions` snapshot-on-write append-only pattern | [gsig-044] `schema.sql:563-571` |
| `signal_ids[]` | **derived**, not a second table: `SELECT signal_id FROM signal_entities WHERE entity_id=<founder> AND entity_kind='founder'` (reciprocal of the signal-side junction) | — | [gsig-038] |
| `companies[]` | junction `founder_companies(founder_id, company_id, role, from_at, to_at)` | entity relationship | `founder.schema.json` |
| `notes` | `notes TEXT` (nullable) | free text | `founder.schema.json` |

**Rule:** these are columns with CHECK constraints and indexes, evolved by backward-compatible
`ALTER`s — never keys in a frontmatter/JSON blob. That first-class-column requirement is the whole
reason the room chose *own* over *run* (adjudication converged action 3).

## (b) Fifth workload gate — see S-9 (complete time-ordered signal set). Restated as a store SLA:
`getSignalsFor(opportunity)` returns 100% of attached signals (joined through the
`signal_entities` junction of section (a)), `ORDER BY observed_at ASC`, contradictions included and
tagged. No storage-layer filtering by trust/recency/supersession.

## (c) Cold-start founders are representable without penalty (memory spec item 4)

**WHAT.** A founder with only a public footprint (no funding history, no shipped-product history)
is a **first-class** stored record. The store persists `founder_score` with `cold_start: true`, a
**wide confidence `band`** `[low, high]`, and never a low `value` merely for absence of history.
The `history` array is append-only and may legitimately start with a single cold-start entry.
Absence of signals is stored as a wide band, not a low score.

**WHY.** The founder schema mandates it: "Cold-start founders get a wide band, not a low value"
(`founder.schema.json`, `band` description; `cold_start` field). Memory spec item 4: "Cold-start
founders: wide band, `cold_start: true`, never a low score for absence of history".
The store must not encode "no evidence" as "bad founder"; that is a
representation the columns permit and the harness checks.

**TEST.**
1. Persist a founder with `evidence_count: 1`, `cold_start: true`, `band: [40, 85]`, `value: 62`
   → assert round-trips intact; assert no store-side logic clamps `value` down for low
   `evidence_count`.
2. Assert `band` high−low widens (or stays wide) when `evidence_count` is low, and that `history`
   is append-only (a later score change appends, never rewrites, the cold-start entry).

## (d) Founder-score history is append-only snapshot-on-write

**WHAT.** Every `founder_score` change appends a `(at, value, reason, signal_id)` row; prior rows
are immutable. The current score is the latest row; the trajectory is the full ordered set. No
update overwrites a history row.

**WHY.** gbrain's `page_versions` is an append-only snapshot table written *before every overwrite*
of an existing page [gsig-044, `schema.sql:563-571`] — the DB-enforced snapshot-on-write pattern
that matches `founder_score.history`'s append-only requirement. gbrain's `founder-scorecard.ts` is
"Pure aggregation over facts + takes … Zero new schema. Zero LLM calls" [gsig-095,
`founder-scorecard.ts:1-7`], confirming the rollup reads an append-only substrate, it does not
mutate scores in place.

**TEST.** Append three score changes; assert three history rows in `at` order, each with its
`reason` and triggering `signal_id`, and that reading "current score" returns the last one while
all three remain retrievable.

---

## Appendix — substrate mapping (which clauses collapse to native features if 1ad.3 picks Dolt)

Dolt is a **versioned MySQL-flavored** database: it gives a commit graph, `AS OF` time-travel, and
per-table `dolt_history_<table>` / `dolt_diff_<table>` / `dolt_log`. Two caveats shape this map:
(i) Dolt's temporal is **transaction-time only** — `AS OF` and the commit graph answer "what did
the store hold at commit/time T", which is *ingest* time, not *event* (valid) time; (ii) MySQL/Dolt
**does not support partial (filtered) indexes** (`WHERE …`), so gbrain's Postgres partial-unique
idioms become full unique indexes plus an application/`NULL`-tuple discipline.

**Collapse to native Dolt features (if 1ad.3 = Dolt):**
- **S-1 transaction-time clock (`ingested_at`) & the never-delete history behind the Non-goals
  supersession machinery** → the **commit graph** + `dolt_history_signals`. Each ingest is (or maps
  to) a commit; "what did we know at ingest-time T" = `AS OF`. This is why row-level
  `superseded_by`/`expired_at` are Non-goals — Dolt versioning replaces them.
- **S-9 complete time-ordered set / point-in-time recall** → `AS OF <commit|timestamp>` +
  `dolt_log`; retrieving prior states is native.
- **(d) founder-score history / (a) `founder_score_history` / gbrain's `page_versions`** →
  `dolt_history_*` gives snapshot-on-write for free; an explicit history table becomes optional
  (a materialized convenience view over `dolt_history`).
- **S-7 partially** → Dolt still needs shape verification (a bad migration commits like any other),
  but `dolt_schema_diff` / `information_schema` introspection is the native mechanism to implement
  it against.

**Survive as application logic either way (Dolt does NOT provide these):**
- **S-1 valid time (`observed_at`, `observed_at_source`)** — Dolt time-travel is transaction-time;
  **valid time must remain an explicit column**. This is the load-bearing bitemporal point:
  substrate versioning gives one clock free, the store still owns the other.
- **S-3 / S-4 dedupe-key and value-hash computation** — canonical-JSON sorted-key hashing and
  ephemeral-key exclusion are pure app code; Dolt enforces the resulting UNIQUE constraint but does
  not compute the key. (Partial-unique → full unique + `dimension IS NULL` handled in app, since
  Dolt lacks filtered indexes.)
- **S-2 fail-closed provenance / gate-assigned `trust_tier`,`authority`** — pure gate logic; no
  substrate feature stamps trust.
- **S-5 create_safety named-evidence classification** — pure function over resolver results.
- **S-6 source-in-dedup-key** — a column-design + UNIQUE-tuple decision (app-owned), though the
  constraint is DB-enforced.
- **S-10 same-attribute conflict surfacing / `contradicts[]`** — an application query
  ("≥2 distinct current values from ≥2 sources") plus a first-class column; not a Dolt primitive.
- **S-8 atomic flat-file writes** — governs exports/sidecars, orthogonal to the DB substrate;
  survives if any flat files are written.
- **(a) first-class `trust_tier`/`authority`/`dedupe_key`/`contradicts` columns** — plain columns
  either way; the point is they are columns, not frontmatter, regardless of substrate.

**Net:** choosing Dolt for 1ad.3 collapses the *transaction-time / history / point-in-time* half of
the bitemporal model into the commit graph, but the *valid-time* column, all four frozen fields,
the hashing/dedup recipes, the provenance gate, and conflict surfacing remain owned application
logic. The store organ is real work under any substrate; Dolt shrinks the history plumbing, not the
contract.

---

## Source anchor index (gbrain, READ-ONLY reference)

| gsig | What | File:line |
|---|---|---|
| gsig-037 | Bitemporal never-delete facts DDL | `migrate.ts:2288-2356` |
| gsig-038 | facts lacks trust_tier/authority/dedupe_key/contradicts/raw_ref | `migrate.ts:2288-2360` |
| gsig-045 | v122 ontology dimension + deterministic value_hash + idempotent unique | `migrate.ts:5479-5506`; `operations.ts:5141-5233` |
| gsig-034 | create_safety named-evidence contract | `search/evidence.ts:1-79` |
| gsig-077 | Import dedup hash excludes ephemeral keys | `import-file.ts:529-550` |
| gsig-078 | Canonical-JSON sha8 stable fingerprint | `op-checkpoint.ts:311-321` |
| gsig-068 | Fail-closed provenance stamping (put_page CV6) | `operations.ts:745-771` |
| gsig-042 | Source-in-dedup-index + shape-keyed self-heal | `schema.sql:551-554`; `timeline-dedup-repair.ts:1-78` |
| gsig-041 | effective_date_source date-provenance sentinel | `schema.sql:112-119` |
| gsig-065 | writeAtomic tmp+fsync+rename | `schema-pack/mutate.ts:261-283` |
| gsig-044 | page_versions append-only snapshot-on-write | `schema.sql:563-571` |
| gsig-095 | Pure zero-LLM founder scorecard over append-only substrate | `commands/founder-scorecard.ts:1-34` |
| gsig-040 | Facts-fence strikethrough supersession is a rendering, not deletion | `facts-fence.ts:12-33` |
| gsig-036 | facts table lives only in migrations, not schema.sql | `migrate.ts:2288` |
| gsig-007, gsig-119 | Docs drift — do not trust gbrain docs without source verification | `docs/ENGINES.md`, `docs/architecture/*` |
| gsig-115 | gbrain fixtures carry operator personal data — never copy fixture data | `test/fixtures/whoknows-eval.jsonl` |
