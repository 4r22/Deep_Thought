import { test } from 'node:test';
import assert from 'node:assert';
import { classifyQuery, classifyQueryIntent } from './query-intent.ts';

test('VC event patterns classify funding language as event/high-detail', () => {
  for (const q of ['Ferrite raised $5M seed', 'their funding round', 'the IPO filing', 'the acquisition by BigCo']) {
    assert.strictEqual(classifyQueryIntent(q), 'event', q);
    assert.strictEqual(classifyQuery(q).suggestedDetail, 'high', q);
  }
});

test('entity/canonical query: recency + salience both off', () => {
  const s = classifyQuery('who is Renée the founder');
  assert.strictEqual(s.intent, 'entity');
  assert.strictEqual(s.suggestedDetail, 'low');
  assert.strictEqual(s.suggestedRecency, 'off');
  assert.strictEqual(s.suggestedSalience, 'off');
});

test('explicit temporal bound overrides the canonical off-rule', () => {
  // "who is X" is canonical (recency off), but "this week" is an explicit
  // temporal bound that flips recency back on (narrow D6 exception).
  const s = classifyQuery('who is the founder this week');
  assert.strictEqual(s.suggestedRecency, 'on');
});

test('"what\'s going on with X" turns on both recency and salience', () => {
  const s = classifyQuery("what's going on with Ferrite");
  assert.strictEqual(s.suggestedRecency, 'on');
  assert.strictEqual(s.suggestedSalience, 'on');
});

test('"today\'s news" is strong recency, salience off', () => {
  const s = classifyQuery("today's news");
  assert.strictEqual(s.suggestedRecency, 'strong');
  assert.strictEqual(s.suggestedSalience, 'off');
  assert.strictEqual(s.intent, 'event');
});
