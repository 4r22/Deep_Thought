import { test } from 'node:test';
import assert from 'node:assert';
import {
  classifyEvidence,
  createSafetyFor,
  stampEvidence,
  type MatchResult,
} from './create-safety.ts';

test('evidence precedence: strongest signal wins', () => {
  assert.strictEqual(classifyEvidence({ slug: 's', score: 0.1, alias_hit: true }), 'alias_hit');
  assert.strictEqual(classifyEvidence({ slug: 's', score: 0.1, title_match_boost: 1.25 }), 'exact_title_match');
  assert.strictEqual(classifyEvidence({ slug: 's', score: 0.9, base_score: 0.9 }), 'high_vector_match');
  assert.strictEqual(classifyEvidence({ slug: 's', score: 0.7, base_score: 0.7 }), 'keyword_exact');
  assert.strictEqual(classifyEvidence({ slug: 's', score: 0.3, base_score: 0.3 }), 'weak_semantic');
});

test('create_safety derives from evidence, not a raw score', () => {
  assert.strictEqual(createSafetyFor('alias_hit'), 'exists');
  assert.strictEqual(createSafetyFor('high_vector_match'), 'exists');
  assert.strictEqual(createSafetyFor('keyword_exact'), 'probable');
  assert.strictEqual(createSafetyFor('weak_semantic'), 'unknown');
});

// The founding incident: an agent read a blended score of 0.64, concluded "no
// strong match, safe to create," and wrote a duplicate. Under the named-evidence
// contract a 0.64 base_score is `keyword_exact` -> `probable` ("prefer updating
// over creating"), NOT a create-safe "unknown".
test('the 0.64 incident: score maps to probable, not create-safe', () => {
  const e = classifyEvidence({ slug: 'concepts/x', score: 0.64, base_score: 0.64 });
  assert.strictEqual(e, 'keyword_exact');
  assert.strictEqual(createSafetyFor(e), 'probable');
});

test('stampEvidence mutates in place and is idempotent', () => {
  const results: MatchResult[] = [
    { slug: 'a', score: 0.9, base_score: 0.9 },
    { slug: 'b', score: 0.2, base_score: 0.2 },
  ];
  stampEvidence(results);
  stampEvidence(results); // idempotent
  assert.strictEqual(results[0].evidence, 'high_vector_match');
  assert.strictEqual(results[0].create_safety, 'exists');
  assert.strictEqual(results[1].evidence, 'weak_semantic');
  assert.strictEqual(results[1].create_safety, 'unknown');
});
