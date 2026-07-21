// Copyright (c) 2026 Garry Tan
// Adapted from gbrain test/eval-retrieval-quality.test.ts (MIT) — the pattern
// of asserting a gate FAILS on a store with a planted fault (a gate that passes
// a broken store is a bug in the gate).
//
// harness-selftest.test.ts — proves each gate has teeth AND that faults are
// isolated. For every broken store variant we assert three things:
//   (a) the honest reference PASSES the matching gate,
//   (b) the matching gate CATCHES its planted fault (broken store fails it),
//   (c) every OTHER gate still PASSES the broken store (the fault is isolated
//       to one gate — no cross-contamination). Assertion (c) is what proves the
//       per-gate isolation claim: a broken-X store that also tripped gate Y
//       would mean the gates are not independent probes.
// This is what makes the green result in gates.test.ts meaningful rather than
// vacuous.
//
// Run: node --test memory/evals/*.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReferenceStore,
  createOverwriteDedupeStore,
  createSuppressingContradictionStore,
  createOverwriteRoleStore,
  createFabricatingSearchStore,
  createIngestionOrderStore,
} from './reference-store.ts';
import { loadCorpus, SPEC } from './corpus.ts';
import {
  gate1DedupeIncludesSource,
  gate2ContradictionSideBySide,
  gate3AppendOnlySupersession,
  gate4NoFabricatedSlug,
  gate5CompleteTimeOrdered,
} from './gates.ts';
import type { MemoryStore } from './store-interface.ts';
import type { GateResult } from './gates.ts';

type Gate = (store: MemoryStore, spec: typeof SPEC) => Promise<GateResult>;

async function withCorpus(make: () => MemoryStore): Promise<MemoryStore> {
  const store = make();
  await loadCorpus(store);
  return store;
}

/** The five gates, keyed by label — the full set every broken store is run against. */
const GATES: { label: string; gate: Gate }[] = [
  { label: 'G1 dedupe-includes-source', gate: gate1DedupeIncludesSource },
  { label: 'G2 contradiction-side-by-side', gate: gate2ContradictionSideBySide },
  { label: 'G3 append-only-supersession', gate: gate3AppendOnlySupersession },
  { label: 'G4 no-fabricated-slug', gate: gate4NoFabricatedSlug },
  { label: 'G5 complete-time-ordered', gate: gate5CompleteTimeOrdered },
];

/** For each gate: the broken store whose single flipped flag it must catch. */
const CASES: { label: string; broken: () => MemoryStore }[] = [
  { label: 'G1 dedupe-includes-source', broken: createOverwriteDedupeStore },
  { label: 'G2 contradiction-side-by-side', broken: createSuppressingContradictionStore },
  { label: 'G3 append-only-supersession', broken: createOverwriteRoleStore },
  { label: 'G4 no-fabricated-slug', broken: createFabricatingSearchStore },
  { label: 'G5 complete-time-ordered', broken: createIngestionOrderStore },
];

for (const c of CASES) {
  const target = GATES.find((g) => g.label === c.label)!;

  test(`${c.label}: passes honest reference`, async () => {
    const r = await target.gate(await withCorpus(createReferenceStore), SPEC);
    assert.ok(r.pass, `expected pass on reference, got fail: ${r.detail}`);
  });

  test(`${c.label}: CATCHES its planted fault (broken store fails)`, async () => {
    const r = await target.gate(await withCorpus(c.broken), SPEC);
    assert.equal(r.pass, false, `gate wrongly passed a broken store — the gate has no teeth: ${r.detail}`);
  });

  test(`${c.label}: fault is ISOLATED (every other gate still passes)`, async () => {
    const store = await withCorpus(c.broken);
    for (const g of GATES) {
      if (g.label === c.label) continue;
      const r = await g.gate(store, SPEC);
      assert.ok(r.pass, `broken '${c.label}' store wrongly tripped ${g.label} — the fault is not isolated: ${r.detail}`);
    }
  });
}
