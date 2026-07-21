import { test } from 'node:test';
import assert from 'node:assert';
import { extractFields, isDuplicate, parseAmount, type TrackerEntry } from './metric-dedupe.ts';

// DEFECT a(2) [gsig-105] — /g-flag capture bug on the amount fallback.
//
// ORIGINAL: the fallback pattern /\$([\d,]+(?:\.\d{1,2})?)/g carried the /g
// flag, so String.match returned full-match strings and `match[1]` was
// undefined -> extractFields returned null for `amount`.
// FIXED: /g removed, so match[1] captures '188.00'.
test('amount fallback captures its group (defect a: /g flag)', () => {
  const r = extractFields('paid $188.00 total to the vendor', { amount: 'currency' });
  assert.strictEqual(r.amount, '188.00');
});

test('extractFields still pulls suffixed MRR/ARR', () => {
  assert.strictEqual(extractFields('Our MRR hit $188K this month', { mrr: 'currency' }).mrr, '188K');
  assert.strictEqual(extractFields('ARR: $2.3M', { arr: 'currency' }).arr, '2.3M');
});

test('parseAmount expands K/M/B suffixes', () => {
  assert.strictEqual(parseAmount('188K'), 188000);
  assert.strictEqual(parseAmount('$2.3M'), 2300000);
  assert.strictEqual(parseAmount('188,000'), 188000);
});

// DEFECT a(2) [gsig-105] — suffix vs stripped-parseFloat mismatch fabricates a
// contradiction.
//
// ORIGINAL: isDuplicate stripped only [$,] then parseFloat, so '188K' -> 188
// while stored '188000' -> 188000; unequal -> type 'different_amount' (a
// fabricated contradiction in signal.contradicts[] terms).
// FIXED: parseAmount makes '188K' === '188000' -> type 'exact'.
test('188K and 188000 are the same amount, not a contradiction (defect a)', () => {
  const existing: TrackerEntry[] = [{ amount: '188000', recipient: 'Ferrite' }];
  const r = isDuplicate(existing, { amount: '188K', recipient: 'Ferrite' }, ['amount', 'recipient']);
  assert.strictEqual(r.type, 'exact');
  assert.strictEqual(r.isDuplicate, true);
});

// DEFECT b(2) [gsig-104] — dead amountTolerance path.
//
// ORIGINAL: within-tolerance amounts still fell through to the string-inequality
// else-if and set amountDiffers, so tolerance had zero effect ('$100' vs '$103'
// -> 'different_amount' for every tolerance value).
// FIXED: within-tolerance amounts are treated as matching -> 'exact'.
test('amountTolerance actually tolerates small differences (defect b2)', () => {
  const existing: TrackerEntry[] = [{ amount: '$100', recipient: 'Ferrite' }];
  const r = isDuplicate(existing, { amount: '$103', recipient: 'Ferrite' }, ['amount', 'recipient'], { amountTolerance: 5 });
  assert.strictEqual(r.type, 'exact');
});

// DEFECT b(3) [gsig-104] — different_amount returned from inside the loop.
//
// ORIGINAL: the different_amount return sat inside the entry-scan loop, so a
// stale earlier row (amount $100) matched first and minted a new
// 'different_amount' on every re-ingest, even though an exact match ($200)
// existed later in the list (non-idempotent).
// FIXED: the decision is deferred until after the full scan, so an exact match
// anywhere wins -> 'exact' (idempotent re-ingest).
test('exact match anywhere in the list wins over a stale amount diff (defect b3)', () => {
  const existing: TrackerEntry[] = [
    { amount: '$100', recipient: 'Ferrite' },
    { amount: '$200', recipient: 'Ferrite' },
  ];
  const r = isDuplicate(existing, { amount: '$200', recipient: 'Ferrite' }, ['amount', 'recipient']);
  assert.strictEqual(r.type, 'exact');
});

// DEFECT b(1) [gsig-104] — the declared 'fuzzy' type was never returned.
//
// ORIGINAL: an entityFuzzy prefix match (first 15 chars equal) with differing
// full strings was reported as 'exact' — the 'fuzzy' branch was prose-only.
// FIXED: prefix-match-but-full-differ returns type 'fuzzy'.
test("entityFuzzy near-match returns 'fuzzy', not 'exact' (defect b1)", () => {
  const existing: TrackerEntry[] = [{ company: 'Acme Industries Inc', amount: '$5M' }];
  const r = isDuplicate(existing, { company: 'Acme Industries LLC', amount: '$5M' }, ['company', 'amount'], { entityFuzzy: true });
  assert.strictEqual(r.type, 'fuzzy');
  assert.strictEqual(r.isDuplicate, true);
});

test('genuinely new entry is classified new', () => {
  const existing: TrackerEntry[] = [{ amount: '$5M', company: 'Ferrite' }];
  const r = isDuplicate(existing, { amount: '$5M', company: 'Zeta' }, ['company']);
  assert.strictEqual(r.type, 'new');
  assert.strictEqual(r.isDuplicate, false);
});
