import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAtomic } from './write-atomic.ts';

test('writes body and leaves no tmp file behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcb-atomic-'));
  try {
    const target = join(dir, 'founder-0001.json');
    writeAtomic(target, '{"id":"fndr-0001"}');
    assert.strictEqual(readFileSync(target, 'utf8'), '{"id":"fndr-0001"}');
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp.'));
    assert.deepStrictEqual(leftovers, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomically overwrites an existing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcb-atomic-'));
  try {
    const target = join(dir, 'signals.json');
    writeFileSync(target, 'OLD');
    writeAtomic(target, 'NEW');
    assert.strictEqual(readFileSync(target, 'utf8'), 'NEW');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('throws an IO_ERROR-coded error for an unwritable path', () => {
  const bad = join(tmpdir(), 'vcb-does-not-exist-dir', 'nested', 'x.json');
  assert.throws(
    () => writeAtomic(bad, 'x'),
    (e: unknown) => (e as { code?: string }).code === 'IO_ERROR',
  );
});
