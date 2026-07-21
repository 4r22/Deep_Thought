// Copyright (c) 2026 Garry Tan
// Adapted from gbrain test/eval-chronicle.test.ts (MIT) — score a seeded
// synthetic corpus against gold and surface which task failed — and
// test/eval-retrieval-quality.test.ts (MIT) — the pass/breach gate assertions.
//
// gates.test.ts — the acceptance gate. Loads the planted-fault corpus into the
// honest reference store and asserts all five gates are green. This is the CI
// bar the thin owned store (bead vc-brain-1ad.3) must clear.
//
// Run: node --test memory/evals/*.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceStore } from './reference-store.ts';
import { loadCorpus, SPEC } from './corpus.ts';
import {
  runAllGates,
  gate1DedupeIncludesSource,
  gate2ContradictionSideBySide,
  gate3AppendOnlySupersession,
  gate4NoFabricatedSlug,
  gate5CompleteTimeOrdered,
} from './gates.ts';

async function loaded() {
  const store = createReferenceStore();
  await loadCorpus(store);
  return store;
}

test('reference store: all five gates are green', async () => {
  const results = await runAllGates(await loaded(), SPEC);
  const failed = results.filter((r) => !r.pass).map((r) => `${r.gate} ${r.name}: ${r.detail}`);
  assert.deepEqual(failed, []);
  assert.equal(results.length, 5);
  assert.ok(results.every((r) => r.pass));
});

test('G1 dedupe-includes-source: both sources survive the merge', async () => {
  const r = await gate1DedupeIncludesSource(await loaded(), SPEC);
  assert.ok(r.pass, r.detail);
});

test('G2 contradiction-side-by-side: pair surfaced, not merged', async () => {
  const r = await gate2ContradictionSideBySide(await loaded(), SPEC);
  assert.ok(r.pass, r.detail);
});

test('G3 append-only-supersession: old role retained, current correct', async () => {
  const r = await gate3AppendOnlySupersession(await loaded(), SPEC);
  assert.ok(r.pass, r.detail);
});

test('G4 no-fabricated-slug: top-3 all real, target present', async () => {
  const r = await gate4NoFabricatedSlug(await loaded(), SPEC);
  assert.ok(r.pass, r.detail);
});

test('G5 complete-time-ordered: full set in observed_at order', async () => {
  const r = await gate5CompleteTimeOrdered(await loaded(), SPEC);
  assert.ok(r.pass, r.detail);
});
