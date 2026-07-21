// Copyright (c) 2026 Garry Tan
// Adapted from gbrain src/eval/retrieval-quality/harness.ts (MIT) — top-K
// scoring and the hard-negative "pass iff no forbidden slug in top-3"
// inversion (G4) and the pass/breach gate shape — and from gbrain
// src/eval/chronicle/harness.ts (MIT) — the planted-fault check(id, ok, detail)
// pattern that scores a seeded corpus against a known gold spec.
//
// gates.ts — the five acceptance gates the thin owned store must clear, as pure
// functions over any MemoryStore. Each gate reads the store through the
// interface only (engine-agnostic) and returns a structured result whose
// `detail` surfaces exactly why it failed. Zero runtime imports; no LLM, no
// keys, no I/O.

import type { MemoryStore } from './store-interface.ts';

/**
 * The gold expectations for a planted-fault corpus. Owned by the corpus module
 * so the gates stay corpus-agnostic (a different corpus can drive the same
 * gates by supplying its own spec).
 */
export interface GateSpec {
  /** G1: two signal ids sharing a dedupe_key but differing in `source`. */
  duplicateSignalIds: [string, string];
  /** G1: both `source` values that must survive the merge. */
  duplicateExpectedSources: string[];
  /** G2: the seeded contradiction pair (two signal ids). */
  contradictionSignalIds: [string, string];
  /** G3: the role-supersession chain to verify. */
  supersession: { founderId: string; companyId: string; oldRole: string; newRole: string };
  /** G4: a query whose near-miss name tempts a fabricated slug. */
  fabricationBaitQuery: string;
  /** G4: the fabricated near-miss slug that must NOT appear in top-3. */
  forbiddenSlug: string;
  /** G4: the real entity that SHOULD rank (so the gate has teeth). */
  expectedTargetSlug: string;
  /** G5: the opportunity whose complete time-ordered set is required. */
  opportunityId: string;
  /** G5: the size of that complete set (records, post-dedupe). */
  expectedOpportunitySignalCount: number;
  /**
   * G5: the exact record ids the complete set must contain (post-dedupe, so the
   * merged duplicate is one id). Set MEMBERSHIP, not just cardinality: a store
   * that drops a late signal and leaks a decoy company's signal returns a
   * different set of the same size — cardinality alone would miss both bugs.
   */
  expectedOpportunitySignalIds: string[];
}

export interface GateResult {
  gate: string;
  name: string;
  pass: boolean;
  detail: string;
}

const TOP_K = 3;

function ok(gate: string, name: string, detail: string): GateResult {
  return { gate, name, pass: true, detail };
}
function fail(gate: string, name: string, detail: string): GateResult {
  return { gate, name, pass: false, detail };
}

/**
 * G1 — dedupe-includes-source. Two signals that share a dedupe_key but differ
 * only by source must collapse to one record whose provenance still carries
 * BOTH sources. Dedup that drops a source loses independent corroboration.
 */
export async function gate1DedupeIncludesSource(store: MemoryStore, spec: GateSpec): Promise<GateResult> {
  const g = 'G1', name = 'dedupe-includes-source';
  const [idA, idB] = spec.duplicateSignalIds;
  const ra = await store.get(idA);
  const rb = await store.get(idB);
  if (!ra || !rb) return fail(g, name, `a duplicate is missing: get(${idA})=${!!ra} get(${idB})=${!!rb}`);
  if (ra.id !== rb.id) return fail(g, name, `duplicates not merged: ${idA}->${ra.id} vs ${idB}->${rb.id}`);
  const sources = new Set(ra.sources.map((s) => s.source));
  const missing = spec.duplicateExpectedSources.filter((s) => !sources.has(s));
  if (missing.length) return fail(g, name, `dedupe dropped source(s) ${JSON.stringify(missing)}; kept ${JSON.stringify([...sources])}`);
  const provIds = new Set(ra.sources.map((s) => s.signal_id));
  if (!provIds.has(idA) || !provIds.has(idB)) return fail(g, name, `provenance dropped a signal id; kept ${JSON.stringify([...provIds])}`);
  return ok(g, name, `record ${ra.id} kept sources ${JSON.stringify([...sources])} from signals ${JSON.stringify([...provIds])}`);
}

/**
 * G2 — contradiction surfaced side-by-side, never merged. A seeded contradiction
 * pair must remain two distinct records AND appear as a pair from
 * contradictions(). A store that "resolves" the conflict by merging or dropping
 * a side buries the disagreement the memo is supposed to flag.
 */
export async function gate2ContradictionSideBySide(store: MemoryStore, spec: GateSpec): Promise<GateResult> {
  const g = 'G2', name = 'contradiction-side-by-side';
  const [x, y] = spec.contradictionSignalIds;
  const rx = await store.get(x);
  const ry = await store.get(y);
  if (!rx || !ry) return fail(g, name, `a contradiction side is missing: get(${x})=${!!rx} get(${y})=${!!ry}`);
  if (rx.id === ry.id) return fail(g, name, `contradiction sides merged into one record ${rx.id}`);
  const pairs = await store.contradictions();
  const found = pairs.some((p) => {
    const ids = new Set([p.a.id, p.b.id]);
    return p.a.id !== p.b.id && ids.has(rx.id) && ids.has(ry.id);
  });
  if (!found) return fail(g, name, `pair {${rx.id},${ry.id}} not surfaced; contradictions()=${JSON.stringify(pairs.map((p) => [p.a.id, p.b.id]))}`);
  return ok(g, name, `pair {${rx.id},${ry.id}} surfaced as two distinct records`);
}

/**
 * G3 — append-only supersession. When a person changes role, the old fact must
 * remain in history (marked superseded), not be destroyed. Overwriting history
 * erases the trend that valid-time diligence depends on.
 */
export async function gate3AppendOnlySupersession(store: MemoryStore, spec: GateSpec): Promise<GateResult> {
  const g = 'G3', name = 'append-only-supersession';
  const { founderId, companyId, oldRole, newRole } = spec.supersession;
  const hist = await store.roleHistory(founderId, companyId);
  if (hist.length < 2) return fail(g, name, `history not append-only: expected >=2 facts, got ${hist.length} (old fact destroyed)`);
  const old = hist.find((f) => f.role === oldRole);
  if (!old) return fail(g, name, `superseded role '${oldRole}' no longer present; history=${JSON.stringify(hist.map((f) => f.role))}`);
  if (!old.superseded) return fail(g, name, `old role '${oldRole}' not marked superseded`);
  const cur = await store.currentRole(founderId, companyId);
  if (!cur || cur.role !== newRole) return fail(g, name, `current role wrong: got '${cur ? cur.role : undefined}', expected '${newRole}'`);
  if (cur.superseded) return fail(g, name, `current role '${cur.role}' wrongly marked superseded`);
  return ok(g, name, `history kept '${oldRole}'(superseded) -> '${newRole}'(current); ${hist.length} facts retained`);
}

/**
 * G4 — no fabricated slug in keyword-search top-3. Adapts gbrain's hard-negative
 * family: pass iff the forbidden near-miss slug is absent from top-3 AND every
 * returned slug resolves to a real registered entity (the fabrication guard).
 * The real target must also rank, so the gate is not trivially satisfied by
 * empty results.
 */
export async function gate4NoFabricatedSlug(store: MemoryStore, spec: GateSpec): Promise<GateResult> {
  const g = 'G4', name = 'no-fabricated-slug';
  const ranked = await store.search(spec.fabricationBaitQuery);
  const top3 = ranked.slice(0, TOP_K);
  if (top3.includes(spec.forbiddenSlug)) return fail(g, name, `fabricated slug '${spec.forbiddenSlug}' in top-3 ${JSON.stringify(top3)}`);
  const realFlags = await Promise.all(top3.map((s) => store.hasEntity(s)));
  const unreal = top3.filter((_, i) => !realFlags[i]);
  if (unreal.length) return fail(g, name, `top-3 contains non-entity (fabricated) slug(s) ${JSON.stringify(unreal)}`);
  if (!top3.includes(spec.expectedTargetSlug)) return fail(g, name, `real target '${spec.expectedTargetSlug}' missing from top-3 ${JSON.stringify(top3)}`);
  return ok(g, name, `top-3 ${JSON.stringify(top3)} all real; target present; no fabricated slug`);
}

/**
 * G5 — complete time-ordered signal set for an opportunity (the surviving
 * workload requirement from bead vc-brain-1ad.1). The returned set must be the
 * EXACT expected record ids (membership, not just cardinality — so dropping a
 * late signal while leaking a same-count decoy is caught), ordered by
 * observed_at ascending — including a late-ingested signal whose event time
 * precedes ones already stored.
 */
export async function gate5CompleteTimeOrdered(store: MemoryStore, spec: GateSpec): Promise<GateResult> {
  const g = 'G5', name = 'complete-time-ordered';
  const sigs = await store.signalsForOpportunity(spec.opportunityId);
  if (sigs.length !== spec.expectedOpportunitySignalCount) {
    return fail(g, name, `incomplete set: got ${sigs.length}, expected ${spec.expectedOpportunitySignalCount} (late/duplicate signal mishandled)`);
  }
  const gotIds = new Set(sigs.map((s) => s.id));
  const expected = new Set(spec.expectedOpportunitySignalIds);
  const missing = [...expected].filter((id) => !gotIds.has(id));
  const leaked = [...gotIds].filter((id) => !expected.has(id));
  if (missing.length || leaked.length) {
    return fail(g, name, `wrong set: missing ${JSON.stringify(missing)}, leaked ${JSON.stringify(leaked)} (dropped a real signal and/or included a decoy)`);
  }
  for (let i = 1; i < sigs.length; i++) {
    if (sigs[i - 1].observed_at > sigs[i].observed_at) {
      return fail(g, name, `not time-ordered at index ${i}: ${sigs[i - 1].observed_at} > ${sigs[i].observed_at} (ordered by ingestion, not observed_at)`);
    }
  }
  return ok(g, name, `${sigs.length} records ordered by observed_at ${sigs[0].observed_at}..${sigs[sigs.length - 1].observed_at}`);
}

/** Run all five gates against a loaded store. */
export async function runAllGates(store: MemoryStore, spec: GateSpec): Promise<GateResult[]> {
  return [
    await gate1DedupeIncludesSource(store, spec),
    await gate2ContradictionSideBySide(store, spec),
    await gate3AppendOnlySupersession(store, spec),
    await gate4NoFabricatedSlug(store, spec),
    await gate5CompleteTimeOrdered(store, spec),
  ];
}
