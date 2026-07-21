/**
 * Founder scorecard rollup.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/commands/founder-scorecard.ts (MIT), with the
 * trajectory-stats helpers adapted from gbrain src/core/trajectory.ts (MIT).
 *
 * Take [gsig-095]: computeFounderScorecard is a zero-LLM, pure aggregation over
 * a founder's typed-claim trajectory + resolved-take outcomes into four
 * evaluation metrics: claim accuracy, consistency, growth trajectory, red
 * flags. "Zero new schema. Zero LLM calls."
 *
 * Deviations from the original:
 *   - Zero imports: the two engine calls and the CLI harness (runFounder,
 *     parseArgs, HELP, thin-client path) are dropped — only the pure
 *     computeFounderScorecard is kept, which the gbrain header explicitly marks
 *     as separable ("Exported for tests so the rollup math is exercised without
 *     a DB round trip").
 *   - computeTrajectoryStats / detectRegressions / computeDriftScore / cosineSim
 *     are copied verbatim from src/core/trajectory.ts and inlined here so this
 *     module has no cross-module import. TrajectoryPoint / Take types are
 *     inlined to their used fields.
 *   - resolveRegressionThreshold reads process.env (a global, not an import);
 *     kept verbatim. Callers may pass an explicit threshold.
 */

export const TRAJECTORY_SCHEMA_VERSION = 1;
export const DEFAULT_REGRESSION_THRESHOLD = 0.1;

/** One dated typed-claim data point on a founder/company trajectory. */
export interface TrajectoryPoint {
  metric: string | null;
  value: number | null;
  valid_from: Date;
  embedding: Float32Array | null;
}

/** A resolved (or unresolved) prediction/claim on the founder. */
export interface Take {
  claim: string;
  resolved_outcome: boolean | null;
}

export interface TrajectoryRegression {
  metric: string;
  from_value: number;
  from_date: string; // YYYY-MM-DD
  to_value: number;
  to_date: string;
  delta_pct: number; // negative for a drop
}

export interface TrajectoryStats {
  regressions: TrajectoryRegression[];
  drift_score: number | null;
}

export interface FounderScorecard {
  schema_version: number;
  entity_slug: string;
  window: { since: string | null; until: string | null };
  claim_accuracy: {
    predicted: number;
    accurate: number;
    pct: number | null;
  };
  consistency: {
    score: number | null;
    metric_changes: number;
    typed_facts: number;
  };
  growth_trajectory: Array<{
    metric: string;
    direction: 'up' | 'down' | 'flat';
    latest_delta_pct: number;
  }>;
  red_flags: Array<{
    kind: 'regression' | 'narrative_drift' | 'missed_prediction';
    metric?: string;
    text: string;
  }>;
}

// ── trajectory stats (adapted verbatim from src/core/trajectory.ts) ──

function resolveRegressionThreshold(): number {
  const raw = process.env.GBRAIN_TRAJECTORY_REGRESSION_THRESHOLD;
  if (!raw) return DEFAULT_REGRESSION_THRESHOLD;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return DEFAULT_REGRESSION_THRESHOLD;
  return n;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function detectRegressions(
  points: TrajectoryPoint[],
  threshold: number = DEFAULT_REGRESSION_THRESHOLD,
): TrajectoryRegression[] {
  const out: TrajectoryRegression[] = [];
  const byMetric = new Map<string, TrajectoryPoint[]>();
  for (const p of points) {
    if (p.metric === null || p.value === null) continue;
    if (!Number.isFinite(p.value)) continue;
    if (!byMetric.has(p.metric)) byMetric.set(p.metric, []);
    byMetric.get(p.metric)!.push(p);
  }

  for (const [metric, series] of byMetric) {
    for (let i = 1; i < series.length; i++) {
      const older = series[i - 1];
      const newer = series[i];
      const oldVal = older.value!;
      const newVal = newer.value!;
      if (oldVal === 0) continue;
      const delta = (newVal - oldVal) / oldVal;
      if (delta <= -threshold) {
        out.push({
          metric,
          from_value: oldVal,
          from_date: toISODate(older.valid_from),
          to_value: newVal,
          to_date: toISODate(newer.valid_from),
          delta_pct: delta,
        });
      }
    }
  }
  return out;
}

export function computeDriftScore(points: TrajectoryPoint[]): number | null {
  const withEmb = points.filter((p) => p.embedding !== null && p.embedding.length > 0);
  if (withEmb.length < 3) return null;
  let sumCos = 0;
  let pairs = 0;
  for (let i = 1; i < withEmb.length; i++) {
    sumCos += cosineSim(withEmb[i - 1].embedding!, withEmb[i].embedding!);
    pairs += 1;
  }
  if (pairs === 0) return null;
  const meanCos = sumCos / pairs;
  const drift = 1 - meanCos;
  if (drift < 0) return 0;
  if (drift > 1) return 1;
  return drift;
}

export function computeTrajectoryStats(
  points: TrajectoryPoint[],
  opts: { threshold?: number } = {},
): TrajectoryStats {
  const threshold = opts.threshold ?? resolveRegressionThreshold();
  return {
    regressions: detectRegressions(points, threshold),
    drift_score: computeDriftScore(points),
  };
}

// ── scorecard rollup (verbatim from founder-scorecard.ts) ──

/**
 * Pure data function — given a sorted trajectory + takes window, compute the
 * scorecard. Copied verbatim from gbrain computeFounderScorecard.
 */
export function computeFounderScorecard(args: {
  entitySlug: string;
  windowSince: string | null;
  windowUntil: string | null;
  points: TrajectoryPoint[];
  takes: Take[];
  driftThresholdRedFlag?: number;
}): FounderScorecard {
  const driftRedFlag = args.driftThresholdRedFlag ?? 0.5;
  const { regressions, drift_score } = computeTrajectoryStats(args.points);

  // claim_accuracy — over resolved takes only.
  const resolved = args.takes.filter((t) => t.resolved_outcome !== null);
  const accurate = resolved.filter((t) => t.resolved_outcome === true).length;
  const accuracyPct = resolved.length > 0 ? accurate / resolved.length : null;

  // consistency — count consecutive value changes per metric. A 'change' is a
  // pair where the relative delta is >=5%. The score normalizes by total typed
  // facts so a long-stable trajectory scores 1.0.
  const byMetric = new Map<string, TrajectoryPoint[]>();
  for (const p of args.points) {
    if (p.metric === null || p.value === null) continue;
    if (!byMetric.has(p.metric)) byMetric.set(p.metric, []);
    byMetric.get(p.metric)!.push(p);
  }
  let metricChanges = 0;
  let typedFacts = 0;
  for (const series of byMetric.values()) {
    typedFacts += series.length;
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1].value!;
      const b = series[i].value!;
      if (a === 0) continue;
      if (Math.abs(b - a) / Math.abs(a) >= 0.05) metricChanges += 1;
    }
  }
  const consistencyScore = typedFacts > 0
    ? Math.max(0, Math.min(1, 1 - metricChanges / typedFacts))
    : null;

  // growth_trajectory — per metric, the most recent delta direction.
  const growth: FounderScorecard['growth_trajectory'] = [];
  for (const [metric, series] of byMetric) {
    if (series.length < 2) continue;
    const latest = series[series.length - 1].value!;
    const prior = series[series.length - 2].value!;
    if (prior === 0) continue;
    const delta = (latest - prior) / prior;
    const dir: 'up' | 'down' | 'flat' =
      Math.abs(delta) < 0.01 ? 'flat' : (delta > 0 ? 'up' : 'down');
    growth.push({ metric, direction: dir, latest_delta_pct: delta });
  }
  growth.sort((a, b) => a.metric.localeCompare(b.metric));

  // red_flags — regressions, big narrative drift, missed predictions.
  const redFlags: FounderScorecard['red_flags'] = [];
  for (const r of regressions) {
    const pct = Math.abs(r.delta_pct * 100).toFixed(1);
    redFlags.push({
      kind: 'regression',
      metric: r.metric,
      text: `${r.metric} fell ${pct}% (${r.from_date} -> ${r.to_date})`,
    });
  }
  if (drift_score !== null && drift_score >= driftRedFlag) {
    redFlags.push({
      kind: 'narrative_drift',
      text: `Narrative drift score ${drift_score.toFixed(2)} — claims are diverging rapidly`,
    });
  }
  const missed = args.takes.filter((t) => t.resolved_outcome === false);
  for (const m of missed) {
    redFlags.push({
      kind: 'missed_prediction',
      text: `Missed prediction: ${truncate(m.claim, 200)}`,
    });
  }

  return {
    schema_version: TRAJECTORY_SCHEMA_VERSION,
    entity_slug: args.entitySlug,
    window: { since: args.windowSince, until: args.windowUntil },
    claim_accuracy: {
      predicted: resolved.length,
      accurate,
      pct: accuracyPct,
    },
    consistency: {
      score: consistencyScore,
      metric_changes: metricChanges,
      typed_facts: typedFacts,
    },
    growth_trajectory: growth,
    red_flags: redFlags,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 3) + '...';
}
