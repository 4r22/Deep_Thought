/**
 * Founder cold-start scoring.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/commands/whoknows.ts (MIT).
 *
 * Take [gsig-112]: gbrain's whoknows ranking spec, verbatim formula and
 * cold-start floor. The one-line spec, kept exactly:
 *
 *   score = expertise x max(0.1, recency_decay) x (0.5 + 0.5 x salience)
 *
 *   expertise     = log1p(footprint)              // sub-linear; one big signal can't dominate
 *   recency_decay = exp(-days / 180)              // ~6-month half-life
 *                   floored at 0.1                // cold-start people don't multiplicative-zero out
 *   salience      = value in 0..1, centered 0.5   // missing = neutral
 *
 * Deviations from the original:
 *   - Domain reframe: this is FOUNDER cold-start scoring, not expert routing.
 *     gbrain's caller (findExperts + hybridSearch over person/company pages)
 *     does not exist here. Candidate field `raw_match` -> `footprint` (evidence
 *     strength proxy), `days_since_effective` -> `days_since_last_signal`,
 *     `salience_raw` -> `salience`. The scoring math is UNCHANGED.
 *   - Design decision [gsig-098] (NOT a defect fix to copied code): gbrain's
 *     whoknows.rankCandidates — the adapted source — has NO notability gate; it
 *     already scores and returns every candidate. The notability gate exists
 *     only as a PROSE convention in gbrain skills/conventions/quality.md:5-44
 *     ("A 400-follower person who tweeted once is not notable. When in doubt,
 *     DON'T create."), never in the scoring code (gsig-098 is a docs source;
 *     gsig-112 above is the code). A founder-facing pipeline that honored that
 *     convention would REFUSE to represent thin-footprint cold-start founders.
 *     This take deliberately does NOT implement that gate: per the
 *     founder.schema contract ("Cold-start founders get a wide band, not a low
 *     value.") a cold-start founder is ALWAYS scored and returned; absence of
 *     funding/company history WIDENS the confidence band, it never lowers the
 *     value and never excludes the founder. The band/confidence machinery in
 *     scoreFounders() below is therefore net-new builder-authored logic, not a
 *     modification of copied behavior. founder-cold-start.test.ts asserts it
 *     diverges from a reference scorer that DOES apply the quality.md gate.
 *   - Zero imports (removed the BrainEngine/hybridSearch/config/mcp-client
 *     imports; only the pure ranking core is kept).
 */

const DEFAULT_LIMIT = 5;
const RECENCY_HALF_LIFE_DAYS = 180; // 6 months
const RECENCY_FLOOR = 0.1;
const SALIENCE_CENTER = 0.5; // missing salience = neutral

export interface FounderCandidate {
  id: string;
  name: string;
  /** Evidence-strength proxy (was whoknows raw_match). Higher = stronger public footprint. */
  footprint: number;
  /** Days since the most recent signal, or null when unknown (cold-start on recency). */
  days_since_last_signal: number | null;
  /** 0..1 salience; null = neutral. */
  salience: number | null;
  /**
   * True when the score rests on public footprint only — no funding history,
   * no shipped-product history (founder.schema `cold_start`). NEVER a reason
   * to lower the value or exclude the founder; only widens the band.
   */
  cold_start: boolean;
}

export type ScoreConfidence = 'high' | 'medium' | 'low' | 'speculative';

export interface FounderScore {
  id: string;
  name: string;
  score: number;
  /** [low, high] confidence band. Cold-start / thin evidence => wide band. */
  band: [number, number];
  confidence: ScoreConfidence;
  cold_start: boolean;
  factors: {
    expertise: number;
    recency_decay: number;
    recency_factor: number;
    salience: number;
    salience_factor: number;
    days_since_last_signal: number | null;
    footprint: number;
  };
}

/**
 * Pure ranking core. The formula and cold-start floor are copied verbatim from
 * whoknows.rankCandidates; the band/confidence derivation is net-new builder-
 * authored logic implementing the founder.schema cold-start contract [gsig-098]
 * (a design decision, not a fix to copied code — rankCandidates never gated).
 */
export function scoreFounders(
  candidates: FounderCandidate[],
  limit: number = DEFAULT_LIMIT,
): FounderScore[] {
  const ranked = candidates.map((c) => {
    // expertise: sub-linear via log(1 + footprint). Clamp to 0 to defend
    // against negative-score producers; log(1+0)=0.
    const safeRaw = Math.max(0, Number.isFinite(c.footprint) ? c.footprint : 0);
    const expertise = Math.log1p(safeRaw);

    // recency_decay: exp(-days/180). Floor at 0.1 so a founder with no dated
    // signal doesn't multiplicative-zero out.
    let recency_decay: number;
    if (c.days_since_last_signal == null || !Number.isFinite(c.days_since_last_signal)) {
      recency_decay = RECENCY_FLOOR;
    } else {
      const days = Math.max(0, c.days_since_last_signal);
      recency_decay = Math.exp(-days / RECENCY_HALF_LIFE_DAYS);
    }
    const recency_factor = Math.max(RECENCY_FLOOR, recency_decay);

    // salience: linear, centered at 0.5. NaN / out-of-range -> 0.5 neutral.
    let salience = c.salience == null ? SALIENCE_CENTER : c.salience;
    if (!Number.isFinite(salience)) salience = SALIENCE_CENTER;
    salience = Math.min(1, Math.max(0, salience));
    const salience_factor = 0.5 + 0.5 * salience;

    const rawScore = expertise * recency_factor * salience_factor;
    const score = Number.isFinite(rawScore) ? rawScore : 0;

    // Design decision [gsig-098] — no notability gate (rankCandidates never had
    // one). A cold-start founder is scored and returned like any other; absence
    // of history only widens the band. Band half-width grows with cold_start and
    // with thin footprint, so a thin-evidence founder is reported with honest
    // uncertainty, never a silently-precise low number and never dropped.
    const coldPenalty = c.cold_start ? 0.5 : 0;
    const thinPenalty = safeRaw < 1 ? 0.25 : 0; // very little footprint => wider band
    const halfWidth = 0.15 + coldPenalty * score + thinPenalty * Math.max(score, 0.5);
    const band: [number, number] = [
      Math.max(0, score - halfWidth),
      score + halfWidth,
    ];

    // Confidence is downgraded (not the value) when evidence is thin/cold-start.
    let confidence: ScoreConfidence;
    if (c.cold_start && safeRaw < 1) confidence = 'speculative';
    else if (c.cold_start) confidence = 'low';
    else if (safeRaw < 1) confidence = 'medium';
    else confidence = 'high';

    return {
      id: c.id,
      name: c.name,
      score,
      band,
      confidence,
      cold_start: c.cold_start,
      factors: {
        expertise,
        recency_decay,
        recency_factor,
        salience,
        salience_factor,
        days_since_last_signal: c.days_since_last_signal,
        footprint: c.footprint,
      },
    };
  });

  // Sort by score DESC; tie-break by id alphabetical for determinism.
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return ranked.slice(0, Math.max(1, limit));
}
