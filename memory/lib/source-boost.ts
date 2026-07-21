/**
 * Trust-tier ranking prior (demote-not-exclude).
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/search/source-boost.ts:1-135 (MIT), with the
 * longest-prefix lookup adapted from gbrain
 * src/core/search/sql-ranking.ts:62-84 (buildSourceFactorCase) (MIT).
 *
 * Take [gsig-031] (search-stack steal #2): a slug-prefix -> multiplier map with
 * a "demote-not-exclude" doctrine. gbrain ranks curated content above bulk
 * content without discarding anything; archived content is deliberately NOT
 * hard-excluded ("it holds high-signal historical content users expect to
 * find") — demoted, never hidden. Hard-excludes are only genuine noise
 * (test/, attachments/, .raw/). Overridable via env with zero code.
 *
 * For vc-brain this is exactly "rank by trust_tier / authority without
 * discarding anything" (signal.schema): T1 verified-artifact ranks high, T4
 * claimed ranks low, `authority: subject` is demoted so subject material never
 * dominates its own case — demoted, never excluded (the "nothing discarded"
 * judging criterion expressed as a ranking policy). Per the forum's P2 ruling,
 * a usable slug scheme puts tier x authority BEFORE variable segments, e.g.
 * `signals/verified-artifact/independent/<founder>/…`, because longest-LEADING-
 * prefix match wins.
 *
 * Deviations from the original:
 *   - DEFAULT_SOURCE_BOOSTS is reframed from gbrain's personal-brain layout
 *     (originals/, openclaw/chat/, …) to vc-brain trust_tier / authority
 *     prefixes. The demote-not-exclude doctrine, DEFAULT_HARD_EXCLUDES, and the
 *     env parsers are copied VERBATIM (env var renamed GBRAIN_* -> VCBRAIN_*).
 *   - `resolveBoost(slug, map)` is added: a pure longest-prefix-wins JS lookup,
 *     the standalone equivalent of gbrain's SQL `buildSourceFactorCase`
 *     longest-prefix CASE, since vc-brain has no SQL layer to inject into.
 */

export const DEFAULT_SOURCE_BOOSTS: Record<string, number> = {
  // T1 — primary artifact on file, independently checked. Ranks highest.
  'verified-artifact/': 1.5,
  // T2 — public source fetched and archived.
  'verified-online/': 1.3,
  // The investor's own notes / calls (authority: operator-primary).
  'operator-primary/': 1.2,
  // T3 — reference-class inference, labeled.
  'reconstructed/': 0.8,
  // T4 — subject-supplied and unverified: the weakest tier.
  'claimed/': 0.6,
  // authority: subject — the founder/company's own material. Demoted so it
  // never substantiates (dominates) its own case. Demote-not-exclude: still
  // findable, never hidden.
  'subject/': 0.5,
  // authority: agent-derived — output of this pipeline. Material to argue with,
  // never an authority; demoted accordingly.
  'agent-derived/': 0.5,
  // Archived historical content — findable by default but ranked below curated
  // signals. Deliberately NOT hard-excluded: it holds high-signal history
  // (prior rounds, older diligence) users expect to retrieve. Demote-not-
  // exclude keeps it findable without letting it dominate.
  'archive/': 0.5,
};

/**
 * Hard-excludes — slug prefixes that never enter results (unless explicitly
 * opted back in). Genuine noise only: test fixtures, binary attachments, raw
 * sidecars. `archive/` is deliberately NOT here — it is DEMOTED, not hidden.
 */
export const DEFAULT_HARD_EXCLUDES: string[] = ['test/', 'attachments/', '.raw/'];

/**
 * Parse VCBRAIN_SOURCE_BOOST env var.
 * Format: comma-separated prefix:factor pairs, e.g.
 * "verified-artifact/:1.8,claimed/:0.3". Malformed entries are skipped silently.
 */
export function parseSourceBoostEnv(env: string | undefined): Record<string, number> {
  if (!env) return {};
  const out: Record<string, number> = {};
  for (const pair of env.split(',')) {
    const idx = pair.lastIndexOf(':');
    if (idx <= 0) continue;
    const prefix = pair.slice(0, idx).trim();
    const factor = Number.parseFloat(pair.slice(idx + 1).trim());
    if (!prefix || !Number.isFinite(factor) || factor < 0) continue;
    out[prefix] = factor;
  }
  return out;
}

/**
 * Parse VCBRAIN_SEARCH_EXCLUDE env var. Comma-separated slug prefixes.
 */
export function parseHardExcludesEnv(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Resolve the effective boost map by merging defaults with env override.
 * Env entries override defaults (shallow merge); env-only entries are added.
 */
export function resolveBoostMap(
  envValue: string | undefined = process.env.VCBRAIN_SOURCE_BOOST,
): Record<string, number> {
  const override = parseSourceBoostEnv(envValue);
  return { ...DEFAULT_SOURCE_BOOSTS, ...override };
}

/**
 * Resolve the effective hard-exclude prefix list.
 *   - Defaults union with env-supplied excludes
 *   - Subtract any caller-supplied include prefixes (opt-back-in)
 *   - Caller-supplied exclude prefixes add to the union
 */
export function resolveHardExcludes(
  excludeOpt?: string[],
  includeOpt?: string[],
  envValue: string | undefined = process.env.VCBRAIN_SEARCH_EXCLUDE,
): string[] {
  const envExcludes = parseHardExcludesEnv(envValue);
  const union = new Set<string>([...DEFAULT_HARD_EXCLUDES, ...envExcludes, ...(excludeOpt ?? [])]);
  if (includeOpt?.length) {
    for (const p of includeOpt) union.delete(p);
  }
  return Array.from(union);
}

/**
 * Longest-LEADING-prefix-wins boost lookup — the pure-JS equivalent of gbrain's
 * SQL `buildSourceFactorCase` (longest-prefix CASE). Returns the multiplier for
 * `slug` from `map`, or 1.0 when no prefix matches. Only leading prefixes match
 * (as in the SQL `LIKE 'prefix%'`), so tier x authority must lead the slug.
 */
export function resolveBoost(
  slug: string,
  map: Record<string, number> = DEFAULT_SOURCE_BOOSTS,
): number {
  let best: number | null = null;
  let bestLen = -1;
  for (const prefix of Object.keys(map)) {
    if (prefix.length === 0) continue;
    const factor = map[prefix];
    if (!Number.isFinite(factor) || factor < 0) continue;
    if (slug.startsWith(prefix) && prefix.length > bestLen) {
      best = factor;
      bestLen = prefix.length;
    }
  }
  return best ?? 1.0;
}

/**
 * True when `slug` is hard-excluded by any prefix in `excludes`.
 */
export function isHardExcluded(slug: string, excludes: string[]): boolean {
  return excludes.some((p) => p.length > 0 && slug.startsWith(p));
}
