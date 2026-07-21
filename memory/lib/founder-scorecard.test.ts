import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeFounderScorecard,
  detectRegressions,
  type TrajectoryPoint,
  type Take,
} from './founder-scorecard.ts';

function pt(metric: string, value: number, iso: string): TrajectoryPoint {
  return { metric, value, valid_from: new Date(iso), embedding: null };
}

// MRR 100 -> 120 (+20%) -> 60 (-50%). One regression (>=10% drop), growth down,
// consistency = 1 - 2 changes / 3 typed facts.
const points: TrajectoryPoint[] = [
  pt('mrr', 100, '2026-01-01'),
  pt('mrr', 120, '2026-02-01'),
  pt('mrr', 60, '2026-03-01'),
];

const takes: Take[] = [
  { claim: 'Will hit $1M ARR by Q4', resolved_outcome: false },
  { claim: 'Shipped v1 on time', resolved_outcome: true },
];

test('claim_accuracy counts resolved takes only', () => {
  const sc = computeFounderScorecard({
    entitySlug: 'companies/ferrite', windowSince: null, windowUntil: null, points, takes,
  });
  assert.strictEqual(sc.claim_accuracy.predicted, 2);
  assert.strictEqual(sc.claim_accuracy.accurate, 1);
  assert.strictEqual(sc.claim_accuracy.pct, 0.5);
});

test('consistency normalizes metric changes by typed facts', () => {
  const sc = computeFounderScorecard({
    entitySlug: 'companies/ferrite', windowSince: null, windowUntil: null, points, takes,
  });
  assert.strictEqual(sc.consistency.typed_facts, 3);
  assert.strictEqual(sc.consistency.metric_changes, 2);
  assert.ok(Math.abs(sc.consistency.score! - (1 - 2 / 3)) < 1e-9);
});

test('growth_trajectory reports latest delta direction', () => {
  const sc = computeFounderScorecard({
    entitySlug: 'companies/ferrite', windowSince: null, windowUntil: null, points, takes,
  });
  assert.strictEqual(sc.growth_trajectory.length, 1);
  assert.strictEqual(sc.growth_trajectory[0].metric, 'mrr');
  assert.strictEqual(sc.growth_trajectory[0].direction, 'down');
  assert.ok(Math.abs(sc.growth_trajectory[0].latest_delta_pct - -0.5) < 1e-9);
});

test('red_flags surface regression + missed prediction', () => {
  const sc = computeFounderScorecard({
    entitySlug: 'companies/ferrite', windowSince: null, windowUntil: null, points, takes,
  });
  const kinds = sc.red_flags.map((r) => r.kind).sort();
  assert.deepStrictEqual(kinds, ['missed_prediction', 'regression']);
});

test('detectRegressions is per-metric (no cross-metric false positive)', () => {
  const mixed: TrajectoryPoint[] = [
    pt('mrr', 100, '2026-01-01'),
    pt('headcount', 5, '2026-01-15'), // interleaved, unrelated
    pt('mrr', 98, '2026-02-01'), // -2%, below threshold
  ];
  assert.strictEqual(detectRegressions(mixed).length, 0);
});

test('zero-LLM: empty trajectory + no takes yields nulls not throws', () => {
  const sc = computeFounderScorecard({
    entitySlug: 'companies/empty', windowSince: null, windowUntil: null, points: [], takes: [],
  });
  assert.strictEqual(sc.claim_accuracy.pct, null);
  assert.strictEqual(sc.consistency.score, null);
  assert.deepStrictEqual(sc.growth_trajectory, []);
  assert.deepStrictEqual(sc.red_flags, []);
  assert.strictEqual(sc.schema_version, 1);
});
