import { test } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_SOURCE_BOOSTS,
  resolveBoost,
  resolveBoostMap,
  parseSourceBoostEnv,
  resolveHardExcludes,
  isHardExcluded,
} from './source-boost.ts';

test('trust-tier ranks verified-artifact above claimed/subject', () => {
  assert.ok(DEFAULT_SOURCE_BOOSTS['verified-artifact/'] > DEFAULT_SOURCE_BOOSTS['claimed/']);
  assert.ok(DEFAULT_SOURCE_BOOSTS['claimed/'] > DEFAULT_SOURCE_BOOSTS['subject/'] - 1e-9);
  // authority: subject demoted so subject material never dominates its own case.
  assert.ok(DEFAULT_SOURCE_BOOSTS['subject/'] < 1.0);
});

test('longest-leading-prefix wins', () => {
  assert.strictEqual(resolveBoost('verified-artifact/independent/fndr-1/sig-9'), 1.5);
  assert.strictEqual(resolveBoost('claimed/subject/fndr-1/sig-2'), 0.6);
  // Unmatched slug -> neutral 1.0.
  assert.strictEqual(resolveBoost('signals/unknown/x'), 1.0);
});

test('demote-not-exclude: archive/ is demoted but never hard-excluded', () => {
  assert.strictEqual(resolveBoost('archive/2024/round-a'), 0.5);
  const excludes = resolveHardExcludes(undefined, undefined, undefined);
  assert.strictEqual(isHardExcluded('archive/2024/round-a', excludes), false);
  assert.strictEqual(isHardExcluded('test/fixture', excludes), true);
  assert.strictEqual(isHardExcluded('attachments/x.pdf', excludes), true);
});

test('env override merges over defaults with zero code', () => {
  const parsed = parseSourceBoostEnv('verified-artifact/:1.8,claimed/:0.3,broken');
  assert.deepStrictEqual(parsed, { 'verified-artifact/': 1.8, 'claimed/': 0.3 });
  const map = resolveBoostMap('verified-artifact/:1.8');
  assert.strictEqual(map['verified-artifact/'], 1.8);
  assert.strictEqual(map['claimed/'], DEFAULT_SOURCE_BOOSTS['claimed/']);
});

test('include opt re-admits a hard-excluded prefix', () => {
  const excludes = resolveHardExcludes(undefined, ['test/'], undefined);
  assert.strictEqual(isHardExcluded('test/fixture', excludes), false);
});
