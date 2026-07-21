/**
 * Recency half-life weighting (trend-over-time).
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/search/recency-decay.ts (map + parsers) and
 * src/core/search/hybrid.ts:261-298 (the applyRecencyBoost TS twin) (MIT).
 *
 * Take [gsig-033] (search-stack steal #3): a per-prefix hyperbolic decay,
 *
 *   recencyComponent = coefficient x halflife / (halflife + days_old)
 *   factor           = 1 + strengthMul x recencyComponent
 *
 *   halflife = 0 => evergreen (no decay). At days_old = halflife the component
 *   is coefficient/2. This is the right shape for weighting founder evidence by
 *   `observed_at` (signal.schema): commits / social posts decay in weeks;
 *   registry filings / papers are evergreen. Note the gbrain discipline that
 *   temporal ("trend") queries BYPASS the trust prior so a trend query still
 *   surfaces low-trust (T4) signals.
 *
 * Deviations from the original:
 *   - DEFAULT_RECENCY_DECAY is reframed from gbrain's slug prefixes
 *     (daily/, media/x/, …) to vc-brain signal source types (github/, social/,
 *     registry/, …), keyed on `observed_at`. The formula, evergreen short-
 *     circuit, and env/parse discipline are copied VERBATIM.
 *   - `RecencyDecayParseError` is rewritten WITHOUT a TypeScript parameter
 *     property (`public readonly source`) because node's erasable-syntax type
 *     stripping rejects parameter properties. The `source` field is assigned in
 *     the constructor body instead — behavior identical.
 *   - `recencyFactor(daysOld, cfg, strength)` extracts the per-item scalar the
 *     gbrain `applyRecencyBoost` loop computes, as a pure standalone function
 *     (no SearchResult[] mutation, since vc-brain has no SearchResult).
 */

export interface RecencyDecayConfig {
  /** Days at which the recency component is halved. 0 = no decay (evergreen). */
  halflifeDays: number;
  /** Max recency boost contribution at days_old = 0. Must be >= 0. */
  coefficient: number;
}

export type RecencyDecayMap = Record<string, RecencyDecayConfig>;

/** Per-signal-source decay, keyed on `observed_at`. Longest-prefix wins. */
export const DEFAULT_RECENCY_DECAY: RecencyDecayMap = {
  // Evergreen: filings, patents, published papers stay relevant indefinitely.
  'registry/': { halflifeDays: 0, coefficient: 0 },
  'paper/': { halflifeDays: 0, coefficient: 0 },
  // Shipping / launch cadence: freshness is the signal; decays in weeks.
  'github/': { halflifeDays: 30, coefficient: 1.0 },
  'launch/': { halflifeDays: 30, coefficient: 1.0 },
  'hackathon/': { halflifeDays: 90, coefficient: 0.5 },
  // Social: strongest decay, biggest coefficient.
  'social/': { halflifeDays: 7, coefficient: 1.5 },
  'press/': { halflifeDays: 90, coefficient: 0.5 },
  // Subject-supplied: a stale deck is worth less than a fresh one.
  'deck/': { halflifeDays: 180, coefficient: 0.5 },
  'application/': { halflifeDays: 180, coefficient: 0.5 },
  'interview/': { halflifeDays: 180, coefficient: 0.5 },
};

/** Fallback applied to slugs that don't match any default or override prefix. */
export const DEFAULT_FALLBACK: RecencyDecayConfig = {
  halflifeDays: 90,
  coefficient: 0.5,
};

/** Sentinel error thrown by parsers. */
export class RecencyDecayParseError extends Error {
  // NOTE: not a TS parameter property — assigned in the body so node's
  // erasable-syntax type stripping accepts the file.
  readonly source: 'env' | 'yaml' | 'caller';
  constructor(message: string, source: 'env' | 'yaml' | 'caller') {
    super(message);
    this.name = 'RecencyDecayParseError';
    this.source = source;
  }
}

/**
 * Parse the VCBRAIN_RECENCY_DECAY env var. Comma-separated
 * `prefix:halflifeDays:coefficient` triples, e.g. "social/:7:1.5,registry/:0:0".
 * Refuses LOUD on parse error so misconfiguration surfaces at startup rather
 * than silently degrading rankings.
 */
export function parseRecencyDecayEnv(env: string | undefined): RecencyDecayMap {
  if (!env) return {};
  const out: RecencyDecayMap = {};
  const triples = env.split(',').map((s) => s.trim()).filter(Boolean);
  for (const triple of triples) {
    // Prefix may contain `/` but NOT `:` — split on the last two colons.
    const lastIdx = triple.lastIndexOf(':');
    if (lastIdx <= 0) {
      throw new RecencyDecayParseError(
        `Invalid VCBRAIN_RECENCY_DECAY entry "${triple}": expected prefix:halflife:coefficient`,
        'env',
      );
    }
    const beforeLast = triple.slice(0, lastIdx);
    const middleIdx = beforeLast.lastIndexOf(':');
    if (middleIdx <= 0) {
      throw new RecencyDecayParseError(
        `Invalid VCBRAIN_RECENCY_DECAY entry "${triple}": expected prefix:halflife:coefficient`,
        'env',
      );
    }
    const prefix = triple.slice(0, middleIdx).trim();
    const halflifeRaw = triple.slice(middleIdx + 1, lastIdx).trim();
    const coefficientRaw = triple.slice(lastIdx + 1).trim();
    const halflife = Number.parseFloat(halflifeRaw);
    const coefficient = Number.parseFloat(coefficientRaw);
    if (!prefix) {
      throw new RecencyDecayParseError(`Empty prefix in VCBRAIN_RECENCY_DECAY entry "${triple}"`, 'env');
    }
    if (!Number.isFinite(halflife) || halflife < 0) {
      throw new RecencyDecayParseError(
        `Invalid halflifeDays "${halflifeRaw}" in VCBRAIN_RECENCY_DECAY (must be number >= 0; 0 = evergreen)`,
        'env',
      );
    }
    if (!Number.isFinite(coefficient) || coefficient < 0) {
      throw new RecencyDecayParseError(
        `Invalid coefficient "${coefficientRaw}" in VCBRAIN_RECENCY_DECAY (must be number >= 0)`,
        'env',
      );
    }
    out[prefix] = { halflifeDays: halflife, coefficient };
  }
  return out;
}

/**
 * Merge defaults + env + caller-supplied overrides into the effective decay
 * map. Later sources win.
 */
export function resolveRecencyDecayMap(opts: {
  envValue?: string;
  caller?: RecencyDecayMap;
} = {}): RecencyDecayMap {
  const fromEnv = parseRecencyDecayEnv(opts.envValue ?? process.env.VCBRAIN_RECENCY_DECAY);
  return {
    ...DEFAULT_RECENCY_DECAY,
    ...fromEnv,
    ...(opts.caller ?? {}),
  };
}

/** Longest-prefix-wins config lookup for a slug. */
export function resolveDecayConfig(
  slug: string,
  map: RecencyDecayMap = DEFAULT_RECENCY_DECAY,
  fallback: RecencyDecayConfig = DEFAULT_FALLBACK,
): RecencyDecayConfig {
  const prefixes = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    if (slug.startsWith(p)) return map[p];
  }
  return fallback;
}

/**
 * Per-item recency multiplier — the scalar gbrain's applyRecencyBoost loop
 * computes. Copied verbatim from hybrid.ts:291-293:
 *
 *   evergreen (halflife 0 or coefficient 0) -> factor 1.0 (no boost)
 *   else recencyComponent = coefficient x halflife / (halflife + days_old)
 *        factor           = 1 + strengthMul x recencyComponent
 *
 * strength 'on' => strengthMul 1.0; 'strong' => 1.5.
 */
export function recencyFactor(
  daysOld: number,
  cfg: RecencyDecayConfig,
  strength: 'on' | 'strong' = 'on',
): number {
  const strengthMul = strength === 'strong' ? 1.5 : 1.0;
  const days = Math.max(0, daysOld);
  if (cfg.halflifeDays === 0 || cfg.coefficient === 0) return 1.0; // evergreen
  const recencyComponent = (cfg.coefficient * cfg.halflifeDays) / (cfg.halflifeDays + days);
  return 1.0 + strengthMul * recencyComponent;
}

/**
 * Convenience: resolve the config for `slug` and return its recency multiplier
 * given the signal's `observed_at` age in days.
 */
export function recencyFactorForSlug(
  slug: string,
  daysOld: number,
  opts: {
    map?: RecencyDecayMap;
    fallback?: RecencyDecayConfig;
    strength?: 'on' | 'strong';
  } = {},
): number {
  const cfg = resolveDecayConfig(slug, opts.map ?? DEFAULT_RECENCY_DECAY, opts.fallback ?? DEFAULT_FALLBACK);
  return recencyFactor(daysOld, cfg, opts.strength ?? 'on');
}
