import { test } from 'node:test';
import assert from 'node:assert';
import { dedupeKey, canonicalJson } from './dedupe-key.ts';

test('object key order does not change the key', () => {
  const a = dedupeKey({ founder: 'fndr-1', source: 'github', observed_at: '2026-07-15' });
  const b = dedupeKey({ observed_at: '2026-07-15', source: 'github', founder: 'fndr-1' });
  assert.strictEqual(a, b);
});

test('nested key order does not change the key', () => {
  const a = dedupeKey({ meta: { url: 'x', tier: 'claimed' }, id: 'sig-1' });
  const b = dedupeKey({ id: 'sig-1', meta: { tier: 'claimed', url: 'x' } });
  assert.strictEqual(a, b);
});

test('different values produce different keys', () => {
  const a = dedupeKey({ url: 'github.com/example/ferrite' });
  const b = dedupeKey({ url: 'github.com/example/other' });
  assert.notStrictEqual(a, b);
});

test('key is exactly 8 lowercase hex chars and stable across runs', () => {
  const k = dedupeKey({ url: 'github.com/example/ferrite' });
  assert.match(k, /^[0-9a-f]{8}$/);
  assert.strictEqual(k, dedupeKey({ url: 'github.com/example/ferrite' }));
});

test('array order is preserved (order is meaningful)', () => {
  assert.notStrictEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.strictEqual(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});
