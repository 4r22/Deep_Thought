import { test } from 'node:test';
import assert from 'node:assert';
import {
  recencyFactor,
  recencyFactorForSlug,
  resolveDecayConfig,
  parseRecencyDecayEnv,
  RecencyDecayParseError,
  DEFAULT_RECENCY_DECAY,
} from './recency-decay.ts';

test('half-life formula: 1 + coeff*halflife/(halflife+days_old)', () => {
  const cfg = { halflifeDays: 30, coefficient: 1.0 };
  assert.strictEqual(recencyFactor(0, cfg), 2.0); // component = coefficient at day 0
  assert.strictEqual(recencyFactor(30, cfg), 1.5); // component halved at half-life
});

test('evergreen (halflife 0 or coeff 0) yields factor 1.0', () => {
  assert.strictEqual(recencyFactor(0, { halflifeDays: 0, coefficient: 5 }), 1.0);
  assert.strictEqual(recencyFactor(100, { halflifeDays: 30, coefficient: 0 }), 1.0);
});

test("'strong' strength multiplies the recency component by 1.5", () => {
  const cfg = { halflifeDays: 30, coefficient: 1.0 };
  assert.strictEqual(recencyFactor(30, cfg, 'strong'), 1 + 1.5 * 0.5); // 1.75
});

test('registry/paper signals are evergreen; social decays fast', () => {
  assert.strictEqual(recencyFactorForSlug('registry/filing-2026', 400), 1.0);
  assert.ok(recencyFactorForSlug('social/launch-post', 0) > 1.0);
});

test('longest-prefix config lookup', () => {
  assert.strictEqual(resolveDecayConfig('registry/x'), DEFAULT_RECENCY_DECAY['registry/']);
  // Unmatched -> fallback (90d / 0.5).
  assert.strictEqual(resolveDecayConfig('unknown/x').halflifeDays, 90);
});

test('env parser fails loud on malformed input, parses valid triples', () => {
  assert.deepStrictEqual(
    parseRecencyDecayEnv('social/:7:1.5,registry/:0:0'),
    { 'social/': { halflifeDays: 7, coefficient: 1.5 }, 'registry/': { halflifeDays: 0, coefficient: 0 } },
  );
  assert.throws(() => parseRecencyDecayEnv('social/:notanumber:1'), RecencyDecayParseError);
});

// The RecencyDecayParseError rewrite (no TS parameter property) must still carry
// its `source` field — verifies node's erasable-syntax stripping kept it.
test('parse error carries its source field', () => {
  const e = new RecencyDecayParseError('x', 'env');
  assert.strictEqual(e.source, 'env');
  assert.strictEqual(e.name, 'RecencyDecayParseError');
});
