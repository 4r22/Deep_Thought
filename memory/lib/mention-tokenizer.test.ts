import { test } from 'node:test';
import assert from 'node:assert';
import { tokenizeForScan, tokenizeTitle } from './mention-tokenizer.ts';

// DEFECT d [gsig-053] — ASCII-only tokenizer dropping accented names.
//
// ORIGINAL behavior (gbrain by-mention.ts, TOKEN_RE = /[a-zA-Z0-9]+/g):
//   'Renée'  -> ['ren', 'e']     (the two 'é' break the run)
//   'Müller' -> ['m', 'ller']
// so the full-name tokens 'renée' / 'müller' NEVER appear and those founders
// are silently never matched in body-text auto-linking.
//
// FIXED behavior (TOKEN_RE = /[\p{L}\p{N}]+/gu): accented names survive as
// single tokens. These asserts fail against the ASCII regex and pass against
// the fix.
test('accented founder names survive tokenization (defect d)', () => {
  assert.deepStrictEqual(tokenizeTitle('Renée Müller'), ['renée', 'müller']);
  assert.deepStrictEqual(tokenizeTitle('François Nguyễn'), ['françois', 'nguyễn']);
});

test('ASCII names are unaffected', () => {
  assert.deepStrictEqual(tokenizeTitle('Jane Smith'), ['jane', 'smith']);
});

test('CJK names are now tokenized (\\p{L} covers them)', () => {
  assert.deepStrictEqual(tokenizeTitle('田中太郎'), ['田中太郎']);
});

test('tokenizeForScan reports lowercase text with source offsets', () => {
  const toks = tokenizeForScan('met Renée at YC');
  assert.deepStrictEqual(toks.map((t) => t.text), ['met', 'renée', 'at', 'yc']);
  const renee = toks[1];
  assert.strictEqual(renee.offset, 4); // "met " = 4 chars
  assert.strictEqual(renee.length, 5); // "Renée" is 5 code units
});
