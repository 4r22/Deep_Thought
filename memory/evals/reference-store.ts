// Copyright (c) 2026 Garry Tan
// Adapted from gbrain src/eval/chronicle/harness.ts (MIT) — the store the
// planted-fault harness exercises, and the idea of deliberately broken variants
// that a correct gate must reject. The in-memory implementation itself is
// original (gbrain's engines are pglite/postgres); no gbrain code is copied.
//
// reference-store.ts — a deliberately simple, dependency-free in-memory
// MemoryStore. One factory, `createStore(policy)`, expresses both the honest
// reference (which passes all five gates) and five broken variants, each a
// single flipped policy flag. That one-flag deviation is what makes the
// harness self-test crisp: each broken variant must fail exactly its gate.
//
// Zero runtime imports (the type-only import erases under type-stripping). No
// engine, no I/O, no LLM, no keys — runtime-neutral (also runs under bun).

import type {
  Signal,
  SignalSource,
  StoredSignal,
  ContradictionPair,
  Entity,
  RoleFact,
  StoredRoleFact,
  MemoryStore,
} from './store-interface.ts';

type DedupePolicy = 'append-sources' | 'overwrite';
type ContradictionPolicy = 'keep-both' | 'suppress';
type SupersedePolicy = 'append-history' | 'overwrite';
type SearchPolicy = 'honest' | 'fabricate';
type OrderPolicy = 'observed_at' | 'ingestion';

export interface StorePolicy {
  dedupe: DedupePolicy;
  contradiction: ContradictionPolicy;
  supersede: SupersedePolicy;
  search: SearchPolicy;
  order: OrderPolicy;
}

export const CORRECT_POLICY: StorePolicy = {
  dedupe: 'append-sources',
  contradiction: 'keep-both',
  supersede: 'append-history',
  search: 'honest',
  order: 'observed_at',
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function sourceOf(sig: Signal): SignalSource {
  return {
    signal_id: sig.id,
    source: sig.source,
    url: sig.url,
    observed_at: sig.observed_at,
    ingested_at: sig.ingested_at,
    raw_ref: sig.raw_ref,
  };
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

function roleKey(founderId: string, companyId: string): string {
  return founderId + '|' + companyId;
}

/**
 * Build a MemoryStore whose behavior is governed by `policy`. The honest
 * reference is `createStore(CORRECT_POLICY)`; each broken variant flips one flag.
 */
export function createStore(policy: StorePolicy): MemoryStore {
  const records = new Map<string, StoredSignal>();      // recordId -> record
  const idToRecord = new Map<string, string>();         // signalId -> recordId
  const dedupeToRecord = new Map<string, string>();     // dedupe_key -> recordId
  const insertionIndex = new Map<string, number>();     // recordId -> first-seen order
  const entities = new Map<string, Entity>();           // slug -> entity
  const roleChains = new Map<string, StoredRoleFact[]>(); // founder|company -> facts
  let counter = 0;

  function newRecord(sig: Signal): string {
    const rec: StoredSignal = {
      id: sig.id,
      founder_ids: [...sig.founder_ids],
      company_ids: [...sig.company_ids],
      observed_at: sig.observed_at,
      summary: sig.summary,
      trust_tier: sig.trust_tier,
      authority: sig.authority,
      dedupe_key: sig.dedupe_key,
      contradicts: [...sig.contradicts],
      sources: [sourceOf(sig)],
    };
    records.set(sig.id, rec);
    idToRecord.set(sig.id, sig.id);
    if (sig.dedupe_key) dedupeToRecord.set(sig.dedupe_key, sig.id);
    insertionIndex.set(sig.id, counter++);
    return sig.id;
  }

  async function ingest(sig: Signal): Promise<string> {
    // Dedupe by shared key.
    if (sig.dedupe_key && dedupeToRecord.has(sig.dedupe_key)) {
      const rid = dedupeToRecord.get(sig.dedupe_key)!;
      const rec = records.get(rid)!;
      if (policy.dedupe === 'overwrite') {
        // Broken (G1): last-write-wins drops the prior source's provenance.
        rec.sources = [sourceOf(sig)];
        rec.observed_at = sig.observed_at;
      } else {
        // Correct: keep every source; canonical observed_at is the earliest.
        rec.sources.push(sourceOf(sig));
        if (sig.observed_at < rec.observed_at) rec.observed_at = sig.observed_at;
        rec.contradicts = uniq([...rec.contradicts, ...sig.contradicts]);
      }
      idToRecord.set(sig.id, rid);
      return rid;
    }

    return newRecord(sig);
  }

  async function get(id: string): Promise<StoredSignal | undefined> {
    const rid = idToRecord.get(id);
    return rid ? records.get(rid) : undefined;
  }

  async function signalsForOpportunity(opportunityId: string): Promise<StoredSignal[]> {
    const recs = [...records.values()].filter((r) => r.company_ids.includes(opportunityId));
    if (policy.order === 'ingestion') {
      // Broken (G5): insertion order misplaces a late-ingested earlier event.
      recs.sort((a, b) => insertionIndex.get(a.id)! - insertionIndex.get(b.id)!);
    } else {
      // Correct: chronological by event time, ties broken by id for stability.
      recs.sort((a, b) =>
        a.observed_at < b.observed_at ? -1 :
        a.observed_at > b.observed_at ? 1 :
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
    }
    return recs;
  }

  async function contradictions(): Promise<ContradictionPair[]> {
    // Broken (G2): both records survive ingestion (nothing is destroyed, so the
    // opportunity set stays complete for G5), but the pair is never surfaced —
    // the store silently buries the disagreement. Isolates the fault to G2's
    // "pair not surfaced" path without disturbing any other gate's invariant.
    if (policy.contradiction === 'suppress') return [];
    const seen = new Set<string>();
    const pairs: ContradictionPair[] = [];
    for (const rec of records.values()) {
      for (const cid of rec.contradicts) {
        const other = records.get(idToRecord.get(cid) ?? '');
        if (!other || other.id === rec.id) continue;
        const key = [rec.id, other.id].sort().join('::');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a: rec, b: other });
      }
    }
    return pairs;
  }

  async function putEntity(entity: Entity): Promise<void> {
    entities.set(entity.slug, { slug: entity.slug, name: entity.name, aliases: [...entity.aliases] });
  }

  async function hasEntity(slug: string): Promise<boolean> {
    return entities.has(slug);
  }

  async function search(query: string): Promise<string[]> {
    const qtokens = tokenize(query);
    const scored: { slug: string; score: number }[] = [];
    for (const e of entities.values()) {
      const etokens = new Set(tokenize(e.name + ' ' + e.aliases.join(' ')));
      let score = 0;
      for (const t of qtokens) if (etokens.has(t)) score++;
      if (score > 0) scored.push({ slug: e.slug, score });
    }
    scored.sort((a, b) => (b.score - a.score) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const result = scored.map((s) => s.slug);
    if (policy.search === 'fabricate') {
      // Broken (G4): synthesize a plausible slug from the query — never indexed.
      result.push('companies/' + qtokens.join('-'));
    }
    return result;
  }

  async function assertRole(fact: RoleFact): Promise<void> {
    const key = roleKey(fact.founder_id, fact.company_id);
    const chain = roleChains.get(key) ?? [];
    const stored: StoredRoleFact = {
      founder_id: fact.founder_id,
      company_id: fact.company_id,
      role: fact.role,
      valid_from: fact.valid_from,
      source_signal_id: fact.source_signal_id,
      superseded: false,
      superseded_by: null,
    };
    if (policy.supersede === 'overwrite') {
      // Broken (G3): destroy history — only the latest fact survives.
      roleChains.set(key, [stored]);
      return;
    }
    // Correct: mark prior current facts (valid_from <= new) superseded; keep all.
    for (const f of chain) {
      if (!f.superseded && f.valid_from <= stored.valid_from) {
        f.superseded = true;
        f.superseded_by = stored.source_signal_id;
      }
    }
    chain.push(stored);
    roleChains.set(key, chain);
  }

  async function roleHistory(founderId: string, companyId: string): Promise<StoredRoleFact[]> {
    const chain = roleChains.get(roleKey(founderId, companyId)) ?? [];
    return [...chain].sort((a, b) =>
      a.valid_from < b.valid_from ? -1 : a.valid_from > b.valid_from ? 1 : 0,
    );
  }

  async function currentRole(founderId: string, companyId: string): Promise<StoredRoleFact | undefined> {
    const chain = roleChains.get(roleKey(founderId, companyId)) ?? [];
    let best: StoredRoleFact | undefined;
    for (const f of chain) {
      if (f.superseded) continue;
      if (!best || f.valid_from > best.valid_from) best = f;
    }
    return best;
  }

  return {
    ingest,
    get,
    signalsForOpportunity,
    contradictions,
    putEntity,
    hasEntity,
    search,
    assertRole,
    roleHistory,
    currentRole,
  };
}

/** The honest reference store — passes all five gates. */
export function createReferenceStore(): MemoryStore {
  return createStore(CORRECT_POLICY);
}

// ── Broken variants: one flipped flag each, named by the gate they must fail ──

/** G1: drops a source on dedupe (last-write-wins). */
export function createOverwriteDedupeStore(): MemoryStore {
  return createStore({ ...CORRECT_POLICY, dedupe: 'overwrite' });
}

/** G2: keeps both records but never surfaces the contradiction pair (buries it). */
export function createSuppressingContradictionStore(): MemoryStore {
  return createStore({ ...CORRECT_POLICY, contradiction: 'suppress' });
}

/** G3: overwrites role history instead of appending (supersession destroys the past). */
export function createOverwriteRoleStore(): MemoryStore {
  return createStore({ ...CORRECT_POLICY, supersede: 'overwrite' });
}

/** G4: fabricates a slug from the query that no entity backs. */
export function createFabricatingSearchStore(): MemoryStore {
  return createStore({ ...CORRECT_POLICY, search: 'fabricate' });
}

/** G5: orders an opportunity's signals by ingestion, not observed_at. */
export function createIngestionOrderStore(): MemoryStore {
  return createStore({ ...CORRECT_POLICY, order: 'ingestion' });
}
