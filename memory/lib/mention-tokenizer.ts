/**
 * Mention-scan tokenizer (Unicode-aware).
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/by-mention.ts:106-142 (MIT).
 *
 * Purpose: split body text into `[token, offset]` runs for entity gazetteer
 * matching (auto-linking founder / company names mentioned in a page).
 *
 * DEFECT FIX [gsig-053] — ASCII-only tokenizer dropping accented names:
 *   The gbrain original uses `TOKEN_RE = /[a-zA-Z0-9]+/g`, with an in-source
 *   comment that "Non-ASCII (CJK, accented) is deliberately not tokenized in
 *   v1." Under that regex an accented founder name breaks apart —
 *   'Renée' -> ['ren','e'], 'Müller' -> ['m','ller'] — so the full-name token
 *   never appears and the founder is silently never matched in body-text
 *   auto-linking. A VC entity catalog is full of accented names (Renée, Müller,
 *   François, Søren, Nguyễn), so this is a correctness bug here.
 *
 *   Fix: TOKEN_RE = /[\p{L}\p{N}]+/gu — Unicode letters + numbers with the `u`
 *   flag. 'Renée' -> ['renée'], 'Müller' -> ['müller'] survive as single
 *   tokens. See mention-tokenizer.test.ts (defect d). ASCII names are
 *   unaffected. `\p{L}` covers CJK too, so a future CJK catalog also works.
 *
 * Deviations from the original:
 *   - TOKEN_RE widened from `/[a-zA-Z0-9]+/g` to `/[\p{L}\p{N}]+/gu` (the fix).
 *   - Zero imports; `.toLowerCase()` (which case-folds accented + CJK letters
 *     correctly) and the possessive-`'s` split behavior are unchanged. Only the
 *     two pure tokenizer functions are kept.
 */

// Unicode letters + numbers. The `u` flag is required for `\p{...}`.
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export interface ScannedToken {
  text: string; // lowercase
  offset: number; // index in source
  length: number; // original length (for span tracking)
}

/** Returns `[token, offset, length]` triples for every Unicode letter/number run. */
export function tokenizeForScan(text: string): ScannedToken[] {
  const out: ScannedToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.push({ text: m[0].toLowerCase(), offset: m.index, length: m[0].length });
  }
  return out;
}

/** Returns lowercase token strings for a title (order preserved). */
export function tokenizeTitle(title: string): string[] {
  const tokens: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(title)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}
