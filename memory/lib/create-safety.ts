/**
 * Named-evidence create_safety dedupe contract.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/search/evidence.ts:1-79 (MIT).
 *
 * Take [gsig-034]: born from a real incident — an agent read a single blended
 * score (0.64), decided "no strong match, safe to write a new page," and wrote
 * a duplicate on top of a fully-developed page. The fix: name WHY a result
 * matched (`alias_hit | exact_title_match | high_vector_match | keyword_exact |
 * weak_semantic`) and derive `create_safety: exists | probable | unknown` for
 * the create-vs-update decision, instead of thresholding a blended score.
 *
 * For vc-brain this is the ingest-time merge decision "is this signal already in
 * memory?": exact dedupe_key/URL match -> exists (merge, both timestamps
 * survive); fuzzy summary match -> probable (flag for review); else unknown/new.
 * The portable part is the named-evidence SHAPE (per the forum note, tiers 3-4
 * are themselves base_score floors 0.85/0.6, so evidence is not fully
 * score-free — but the contract of "record a named reason + a conservative
 * action hint, never a bare threshold" is what ports).
 *
 * Deviations from the original:
 *   - Zero imports: the gbrain `SearchResult` type is replaced by a minimal
 *     inlined `MatchResult` carrying only the fields this contract reads
 *     (slug, score, base_score, alias_hit, title_match_boost) plus the two
 *     stamped output fields. classifyEvidence / createSafetyFor / stampEvidence
 *     and the two floor constants are copied VERBATIM.
 */

export type Evidence =
  | 'alias_hit'
  | 'exact_title_match'
  | 'high_vector_match'
  | 'keyword_exact'
  | 'weak_semantic';

export type CreateSafety = 'exists' | 'probable' | 'unknown';

/** Minimal match record the contract reads + stamps. */
export interface MatchResult {
  slug: string;
  score: number;
  /** Pre-boost base score, when available. Falls back to `score`. */
  base_score?: number;
  /** True when the query exactly matched the record's declared canonical name. */
  alias_hit?: boolean;
  /** >1.0 when a title-phrase boost fired. */
  title_match_boost?: number;
  /** Stamped by stampEvidence. */
  evidence?: Evidence;
  /** Stamped by stampEvidence. */
  create_safety?: CreateSafety;
}

/** base_score (pre-boost) at/above this is a confident vector/keyword match. */
export const HIGH_MATCH_FLOOR = 0.85;
/** base_score at/above this is a solid (not weak) match. */
export const SOLID_MATCH_FLOOR = 0.6;

export function classifyEvidence(r: MatchResult): Evidence {
  if (r.alias_hit) return 'alias_hit';
  if (r.title_match_boost && r.title_match_boost > 1.0) return 'exact_title_match';
  const base = typeof r.base_score === 'number' ? r.base_score : r.score;
  if (Number.isFinite(base) && base >= HIGH_MATCH_FLOOR) return 'high_vector_match';
  if (Number.isFinite(base) && base >= SOLID_MATCH_FLOOR) return 'keyword_exact';
  return 'weak_semantic';
}

export function createSafetyFor(evidence: Evidence): CreateSafety {
  switch (evidence) {
    case 'alias_hit':
    case 'exact_title_match':
    case 'high_vector_match':
      return 'exists';
    case 'keyword_exact':
      return 'probable';
    case 'weak_semantic':
      return 'unknown';
  }
}

/**
 * Stamp `evidence` + `create_safety` on every result in place. Idempotent.
 */
export function stampEvidence(results: MatchResult[]): void {
  for (const r of results) {
    const e = classifyEvidence(r);
    r.evidence = e;
    r.create_safety = createSafetyFor(e);
  }
}
