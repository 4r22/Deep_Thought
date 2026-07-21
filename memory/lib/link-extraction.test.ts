import { test } from 'node:test';
import assert from 'node:assert';
import { inferLinkType } from './link-extraction.ts';

test('per-edge verbs: founded / invested_in / advises / works_at', () => {
  assert.strictEqual(inferLinkType('person', 'she co-founded Ferrite in 2024'), 'founded');
  assert.strictEqual(inferLinkType('person', 'led the seed round for the company'), 'invested_in');
  assert.strictEqual(inferLinkType('person', 'wrote a check into their pre-seed'), 'invested_in');
  assert.strictEqual(inferLinkType('person', 'a portfolio company of the fund'), 'invested_in');
  assert.strictEqual(inferLinkType('person', 'serves as an advisor to the team'), 'advises');
  assert.strictEqual(inferLinkType('person', 'works at Ferrite as staff engineer'), 'works_at');
});

test('precedence: founded outranks invested_in in the same window', () => {
  const ctx = 'he co-founded the company after he invested in two others';
  assert.strictEqual(inferLinkType('person', ctx), 'founded');
});

test('page-role prior fires only for person -> companies/ links', () => {
  assert.strictEqual(
    inferLinkType('person', 'mentioned alongside Ferrite', 'General Partner, venture partner at the fund', 'companies/ferrite'),
    'invested_in',
  );
  // No global role context -> falls through to mentions.
  assert.strictEqual(
    inferLinkType('person', 'mentioned alongside Ferrite', undefined, 'companies/ferrite'),
    'mentions',
  );
});

test('media pages and unmatched context default to mentions', () => {
  assert.strictEqual(inferLinkType('media', 'founded and invested in'), 'mentions');
  assert.strictEqual(inferLinkType('person', 'grabbed coffee with them last week'), 'mentions');
});
