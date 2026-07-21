// Copyright (c) 2026 Garry Tan
// Adapted from gbrain src/eval/retrieval-quality/harness.ts (MIT) — the
// engine-agnostic, injected-search contract (ranked slugs, best-first) that
// lets one harness gate any store implementation.
//
// store-interface.ts — the minimal contract the acceptance harness (bead
// vc-brain-1ad.5) exercises and the thin owned store (bead vc-brain-1ad.3)
// implements. Shaped from exactly what the five CI gates need:
//   G1 dedupe-includes-source     -> ingest + get + StoredSignal.sources
//   G2 contradiction side-by-side  -> ingest + contradictions()
//   G3 append-only supersession    -> assertRole + roleHistory + currentRole
//   G4 no fabricated slug in top-3  -> putEntity + hasEntity + search
//   G5 complete time-ordered set    -> signalsForOpportunity
//
// Every method is async (returns a Promise): the contract must be
// implementable by a SQL- or Dolt-backed store, and Dolt speaks the MySQL wire
// protocol, which is async in node. A synchronous read/write signature is
// itself an in-memory-only assumption (it would force sync-over-async blocking
// on any real engine). The in-memory reference store satisfies the async
// contract trivially; a network-backed one satisfies it natively.
//
// Zero runtime imports (type-only files erase to nothing under node
// type-stripping). Runtime-neutral: no engine, no I/O, no LLM, no keys.

/**
 * A raw observed fact about a founder or company. Structural mirror of the
 * frozen contract at intelligence/schemas/signal.schema.json — field names and
 * meaning must not diverge. `observed_at` is the event time (the ordering key);
 * `ingested_at` is capture time. Their divergence is the out-of-order signal.
 */
export interface Signal {
  id: string;
  founder_ids: string[];
  company_ids: string[];
  source: string;
  url: string | null;
  observed_at: string;
  ingested_at: string;
  summary: string;
  raw_ref: string | null;
  trust_tier: string;
  authority: string;
  dedupe_key: string | null;
  contradicts: string[];
}

/**
 * Provenance of one raw signal folded into a stored record. Dedupe collapses
 * duplicates that share a dedupe_key into a single record, but every source is
 * preserved here — a source is never dropped (the G1 invariant).
 */
export interface SignalSource {
  signal_id: string;
  source: string;
  url: string | null;
  observed_at: string;
  ingested_at: string;
  raw_ref: string | null;
}

/**
 * A stored, deduplicated signal record. `sources` carries one entry per raw
 * signal that merged under a shared dedupe_key. `observed_at` is the canonical
 * event time (earliest across merged sources), used for time ordering.
 */
export interface StoredSignal {
  id: string;
  founder_ids: string[];
  company_ids: string[];
  observed_at: string;
  summary: string;
  trust_tier: string;
  authority: string;
  dedupe_key: string | null;
  contradicts: string[];
  sources: SignalSource[];
}

/** Two contradicting records surfaced side-by-side — never merged into one. */
export interface ContradictionPair {
  a: StoredSignal;
  b: StoredSignal;
}

/** A searchable entity (company / founder / person) with a stable slug. */
export interface Entity {
  slug: string;
  name: string;
  aliases: string[];
}

/** A role assertion for a founder at a company (a VC-shaped ontology fact). */
export interface RoleFact {
  founder_id: string;
  company_id: string;
  role: string;
  valid_from: string;
  source_signal_id: string;
}

/**
 * A stored role fact. Supersession is append-only: a later assertion marks the
 * prior current fact `superseded` but never deletes it (the G3 invariant).
 */
export interface StoredRoleFact {
  founder_id: string;
  company_id: string;
  role: string;
  valid_from: string;
  source_signal_id: string;
  superseded: boolean;
  superseded_by: string | null;
}

/**
 * The owned memory store. Deliberately narrow: everything the five acceptance
 * gates need and nothing else. Any implementation that satisfies this contract
 * can be dropped under the harness — engine-agnostic, keyless, no LLM.
 */
export interface MemoryStore {
  /**
   * Ingest one raw signal, returning the id of the record it created or merged
   * into. Duplicates (same dedupe_key) merge into the existing record and keep
   * BOTH sources' provenance; they never overwrite and never drop a source.
   */
  ingest(signal: Signal): Promise<string>;

  /** Resolve a record by any signal id that created OR merged into it. */
  get(id: string): Promise<StoredSignal | undefined>;

  /**
   * Every record whose company_ids include the opportunity, ordered by
   * observed_at ascending — complete (nothing dropped for arriving late) and
   * chronological (ordered by event time, not ingestion time).
   */
  signalsForOpportunity(opportunityId: string): Promise<StoredSignal[]>;

  /**
   * Every contradiction surfaced as a distinct two-sided pair. Contradictions
   * are first-class: both sides remain independently retrievable, never merged.
   */
  contradictions(): Promise<ContradictionPair[]>;

  /** Register (or replace) a searchable entity. */
  putEntity(entity: Entity): Promise<void>;

  /** True iff a real entity with this slug is registered. */
  hasEntity(slug: string): Promise<boolean>;

  /**
   * Keyword search over registered entities, ranked slugs best-first. MUST only
   * return slugs of entities actually in the index — never a fabricated or
   * guessed slug (the G4 invariant).
   */
  search(query: string): Promise<string[]>;

  /**
   * Assert a role for a founder at a company. A later assertion supersedes the
   * prior current role but never deletes it — history is append-only.
   */
  assertRole(fact: RoleFact): Promise<void>;

  /** Full role history for a founder at a company, oldest-first. */
  roleHistory(founderId: string, companyId: string): Promise<StoredRoleFact[]>;

  /** The single current (latest, non-superseded) role, or undefined. */
  currentRole(founderId: string, companyId: string): Promise<StoredRoleFact | undefined>;
}
