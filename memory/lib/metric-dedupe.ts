/**
 * Financial-metric extraction + amount dedupe.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/data-research.ts:56-260 (MIT).
 *
 * Purpose: pull structured financial metrics (MRR, ARR, growth, runway,
 * headcount, amount) out of raw signal text, and decide whether an incoming
 * metric duplicates one already recorded — or genuinely differs. In vc-brain
 * terms an "amount differs" verdict is a candidate contradiction (signal.schema
 * `contradicts[]`), so a spurious differ verdict FABRICATES a contradiction.
 *
 * DEFECT FIX [gsig-105] (defect a) — /g-flag capture bug + suffix/parse mismatch:
 *   (1) The amount fallback pattern in gbrain is /\$([\d,]+(?:\.\d{1,2})?)/g.
 *       Under the /g flag, String.match returns FULL-match strings, so
 *       `match[1]` is the second `$`-prefixed amount or undefined — the fallback
 *       never yields its capture group, so `amount` extraction silently fails.
 *       Fix: drop the /g flag so `match[1]` captures the first amount.
 *   (2) extractFields returns suffix-bearing strings ('188K') while gbrain's
 *       isDuplicate strips only [$,] before parseFloat, so '188K' -> 188 while a
 *       stored '188000' -> 188000, composing into a spurious different_amount.
 *       Fix: parseAmount() expands K/M/B suffixes so '188K' === '188000' compare
 *       equal and no phantom contradiction is minted.
 *
 * DEFECT FIX [gsig-104] (defect b) — three isDuplicate defects:
 *   (1) DedupResult declares type 'fuzzy' but gbrain never returns it (dead
 *       branch). Fix: an entityFuzzy prefix match whose full strings differ now
 *       returns type:'fuzzy' (a real duplicate, flagged as approximate).
 *   (2) amountTolerance was dead: within-tolerance amounts still fell through to
 *       the string-inequality else-if and set amountDiffers, so every tolerance
 *       behaved identically. Fix: within-tolerance (or numerically-equal)
 *       amounts are treated as matching and never set amountDiffers.
 *   (3) the different_amount return sat INSIDE the entry-scan loop, so
 *       re-ingesting an already-recorded correction matched a stale earlier row
 *       and minted a new different_amount every run (non-idempotent). Fix: defer
 *       the different_amount decision until after the full scan, so an exact
 *       match anywhere in the list wins and re-ingest is idempotent.
 *   See metric-dedupe.test.ts (defects a + b).
 *
 * Deviations from the original:
 *   - Zero imports. Only METRIC_PATTERNS, extractFields, isDuplicate, and the
 *     types they need are kept (recipe validation / tracker parsing omitted).
 *   - `parseAmount` is added (the fix). Extraction regexes are otherwise
 *     verbatim except: the amount fallback /g removal (defect a1), and the two
 *     amount contexts 'Total Charged'/'receipt for your' — gbrain-operator
 *     receipt/personal-finance patterns — replaced by VC funding contexts
 *     ('raised $', 'round of $'). That swap is a domain reframe, not a fix.
 */

export interface TrackerEntry {
  [key: string]: string | number | string[];
}

export interface DedupConfig {
  amountTolerance?: number; // e.g. 5 for $5 tolerance
  dateExact?: boolean;
  entityFuzzy?: boolean; // fuzzy entity-name matching (first 15 chars)
}

export interface DedupResult {
  isDuplicate: boolean;
  type: 'exact' | 'fuzzy' | 'different_amount' | 'new';
  matchedEntry?: TrackerEntry;
}

/** Common financial-metric regex patterns. */
export const METRIC_PATTERNS: Record<string, RegExp[]> = {
  mrr: [
    /MRR[:\s]+(?:of\s+)?\$?([\d,]+\.?\d*\s*[KkMm]?)/i,
    /MRR\s+(?:hit|is|at|reached|now|of)\s+\$?([\d,]+\.?\d*\s*[KkMm]?)/i,
    /\$([\d,]+\.?\d*\s*[KkMm])\s*MRR/i,
  ],
  arr: [
    /ARR[:\s]+(?:of\s+)?\$?([\d,]+\.?\d*\s*[KkMmBb]?)/i,
    /ARR\s+(?:hit|is|at|reached|now|of)\s+\$?([\d,]+\.?\d*\s*[KkMmBb]?)/i,
    /\$([\d,]+\.?\d*\s*[KkMmBb])\s*ARR/i,
  ],
  growth_mom: [
    /(\+?-?\d+\.?\d*%)\s*(?:MoM|month[ -]over[ -]month)/i,
    /(?:grew|growth|increased|up)\s+(?:by\s+)?(\+?\d+\.?\d*%)/i,
  ],
  runway_months: [
    /runway[:\s]+(?:of\s+)?(?:about\s+)?(\d+)\s*(?:months?|mo)/i,
    /(\d+)\s*(?:months?|mo)\s*(?:of\s+)?runway/i,
  ],
  headcount: [
    /(\d+)\s*(?:employees?|team members?|people|headcount|FTEs?)/i,
    /team\s+(?:of|size[:\s]+)\s*(\d+)/i,
  ],
  customers: [
    /(\d[\d,]*)\s*(?:customers?|clients?|users?|accounts?)/i,
  ],
  amount: [
    // VC funding-signal contexts (replacing gbrain's receipt-domain fallbacks:
    // 'Total Charged'/'receipt for your' were operator personal-finance patterns
    // with no place in a funding-signal store — a domain reframe, not a fix).
    /raised\s+(?:a\s+)?\$([\d,]+(?:\.\d{1,2})?\s*[KkMmBb]?)/i,
    /round\s+of\s+\$([\d,]+(?:\.\d{1,2})?\s*[KkMmBb]?)/i,
    // Defect a(1) fix: /g flag removed so `match[1]` captures the first amount.
    /\$([\d,]+(?:\.\d{1,2})?)/,
  ],
};

/** Extract structured fields from raw text using the built-in regex patterns. */
export function extractFields(
  rawText: string,
  schema: Record<string, string>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const [field, type] of Object.entries(schema)) {
    const patterns = METRIC_PATTERNS[field];
    if (patterns) {
      let matched = false;
      for (const pattern of patterns) {
        const match = rawText.match(pattern);
        if (match && match[1]) {
          result[field] = match[1].trim();
          matched = true;
          break;
        }
      }
      if (!matched) result[field] = null;
    } else if (type === 'date') {
      const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
      result[field] = dateMatch ? dateMatch[1] : null;
    } else {
      result[field] = null;
    }
  }

  return result;
}

/**
 * Parse a money string to a number, expanding K/M/B suffixes.
 * Defect a(2) fix: '188K' -> 188000, '$2.3M' -> 2300000, '188,000' -> 188000.
 * Returns NaN for non-numeric strings (caller falls back to string compare).
 */
export function parseAmount(raw: string): number {
  const s = raw.trim().replace(/[$,\s]/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)([KkMmBb])?$/);
  if (!m) return parseFloat(s); // may be NaN
  let n = parseFloat(m[1]);
  const suffix = m[2]?.toLowerCase();
  if (suffix === 'k') n *= 1e3;
  else if (suffix === 'm') n *= 1e6;
  else if (suffix === 'b') n *= 1e9;
  return n;
}

/** Check whether `candidate` duplicates an existing tracker entry. */
export function isDuplicate(
  existing: TrackerEntry[],
  candidate: TrackerEntry,
  keyFields: string[],
  config?: DedupConfig,
): DedupResult {
  const tolerance = config?.amountTolerance || 0;
  // Defect b(3) fix: defer the different_amount decision until the whole list
  // is scanned so an exact match anywhere wins (idempotent re-ingest).
  let amountDiffMatch: TrackerEntry | undefined;

  for (const entry of existing) {
    let allMatch = true;
    let nonAmountFieldsMatch = true;
    let amountDiffers = false;
    let fuzzyMatched = false; // defect b(1): an approximate (prefix) entity match

    for (const key of keyFields) {
      const existingVal = String(entry[key] ?? '');
      const candidateVal = String(candidate[key] ?? '');

      if (key === 'amount') {
        const existingNum = parseAmount(existingVal);
        const candidateNum = parseAmount(candidateVal);
        const bothNumeric = Number.isFinite(existingNum) && Number.isFinite(candidateNum);
        // Defect a(2): numeric equality catches '188K' === '188000'.
        const numericEqual = bothNumeric && existingNum === candidateNum;
        // Defect b(2): within-tolerance amounts count as matching.
        const withinTolerance = bothNumeric && tolerance > 0 && Math.abs(existingNum - candidateNum) <= tolerance;
        if (numericEqual || withinTolerance) {
          // amounts match — do NOT fall through to string inequality.
        } else if (bothNumeric) {
          amountDiffers = true;
          allMatch = false;
        } else if (existingVal.toLowerCase() !== candidateVal.toLowerCase()) {
          // non-numeric amount strings — fall back to string compare.
          amountDiffers = true;
          allMatch = false;
        }
      } else if (config?.entityFuzzy && (key === 'recipient' || key === 'company')) {
        const ePre = existingVal.slice(0, 15).toLowerCase();
        const cPre = candidateVal.slice(0, 15).toLowerCase();
        if (ePre !== cPre) {
          allMatch = false;
          nonAmountFieldsMatch = false;
        } else if (existingVal.toLowerCase() !== candidateVal.toLowerCase()) {
          // Defect b(1): prefixes match but full strings differ -> fuzzy dup.
          fuzzyMatched = true;
        }
      } else {
        if (existingVal.toLowerCase() !== candidateVal.toLowerCase()) {
          allMatch = false;
          nonAmountFieldsMatch = false;
        }
      }
    }

    if (allMatch) {
      return {
        isDuplicate: true,
        type: fuzzyMatched ? 'fuzzy' : 'exact',
        matchedEntry: entry,
      };
    }
    if (amountDiffers && nonAmountFieldsMatch && !amountDiffMatch) {
      amountDiffMatch = entry;
    }
  }

  if (amountDiffMatch) {
    return { isDuplicate: false, type: 'different_amount', matchedEntry: amountDiffMatch };
  }
  return { isDuplicate: false, type: 'new' };
}
