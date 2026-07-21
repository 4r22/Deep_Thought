/**
 * Prompt-injection sanitizer for signal text fed into an LLM.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/think/sanitize.ts:22-74 (MIT).
 *
 * Purpose: a signal's `summary` can contain subject-supplied or third-party
 * text. When that text is placed into an LLM system prompt (memo drafting,
 * forum debate), known jailbreak phrasing must be neutralized. Structural
 * framing (wrapping each signal in a data envelope the model is told to treat
 * as DATA) is the primary defense; this pattern-strip is the secondary layer.
 *
 * DEFECT FIX [gsig-086] — mutating sanitizer:
 *   The gbrain original mutates LEGITIMATE technical text. Two patterns are the
 *   culprits, both REMOVED here:
 *     - 'eval-shell'      /\b(?:eval|exec|system|shell)\s*\(/gi -> '[redacted]('
 *       Fires on any signal quoting code ("we replaced exec() with posix_spawn").
 *       The text is DATA inside an envelope, never executed — redacting it
 *       silently corrupts the quote the model reads.
 *     - 'xml-attr-inject' /\s+(entity|metric|event_type|kind)\s*=\s*"[^"]*"/gi
 *       Fires ANYWHERE ("the deal kind=\"seed\"", a config snippet metric="mrr").
 *       Attribute injection onto the wrapper tag is prevented by escaping the
 *       envelope attributes at render time, not by stripping attribute-looking
 *       substrings out of arbitrary content.
 *   Both are dropped from INJECTION_PATTERNS. The genuine jailbreak / tag-close
 *   patterns are kept verbatim, so real injections are still neutralized while
 *   dev-tool-heavy VC signal quotes pass through UNCHANGED. See
 *   sanitize.test.ts (defect c). The 500-char prompt-budget cap is retained
 *   (a length guard, not a content rewrite).
 *
 * Deviations from the original:
 *   - The two content-mutating patterns above are removed (the fix).
 *   - Zero imports; the two <trajectory>-wrapper patterns are kept (they only
 *     neutralize literal `</trajectory>` / `<trajectory ...>` envelope-break
 *     attempts, which is legitimate). `sanitizeTakeForPrompt` is renamed
 *     `sanitizeSignalText`; the take-rendering helper (renderTakesBlock) is
 *     not part of this take and is omitted.
 */

export interface InjectionPattern {
  name: string;
  rx: RegExp;
  replacement: string;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  // System / instruction overrides
  { name: 'ignore-prior', rx: /ignore\s+(?:all\s+)?(?:prior|previous|above|earlier)\s+(?:instructions?|prompts?|messages?)/gi, replacement: '[redacted]' },
  { name: 'forget-everything', rx: /forget\s+(?:everything|all\s+(?:of\s+)?the\s+above)/gi, replacement: '[redacted]' },
  { name: 'disregard', rx: /disregard\s+(?:all\s+)?(?:prior|previous|above|earlier)\s+(?:instructions?|prompts?)/gi, replacement: '[redacted]' },
  { name: 'new-instructions', rx: /(?:new|updated|revised)\s+instructions?:/gi, replacement: '[redacted]:' },
  { name: 'system-prompt', rx: /system\s*:\s*(?:you\s+are|you\s+must|never|always)/gi, replacement: '[redacted]' },
  { name: 'role-jailbreak', rx: /you\s+are\s+(?:now|actually|really)\s+(?:a|an)\s+\w+/gi, replacement: '[redacted]' },
  { name: 'do-anything-now', rx: /\b(?:DAN|do\s+anything\s+now|developer\s+mode\s+enabled?)\b/gi, replacement: '[redacted]' },
  // Tag injection — try to close a structural data-envelope wrapper
  { name: 'close-take', rx: /<\s*\/\s*take\s*>/gi, replacement: '&lt;/take&gt;' },
  { name: 'open-system', rx: /<\s*system\s*>/gi, replacement: '&lt;system&gt;' },
  { name: 'open-instructions', rx: /<\s*instructions?\s*>/gi, replacement: '&lt;instructions&gt;' },
  { name: 'close-trajectory', rx: /<\s*\/\s*trajectory\s*>/gi, replacement: '&lt;/trajectory&gt;' },
  { name: 'open-trajectory', rx: /<\s*trajectory\b[^>]*>/gi, replacement: '&lt;trajectory&gt;' },
  // Output exfiltration
  { name: 'print-system', rx: /(?:print|output|reveal|show)\s+(?:your\s+)?(?:system\s+prompt|instructions?|hidden)/gi, replacement: '[redacted]' },
  { name: 'verbatim', rx: /(?:repeat|echo)\s+(?:back|verbatim)/gi, replacement: '[redacted]' },
  // NOTE: gbrain's 'eval-shell' and 'xml-attr-inject' patterns are DELETED here
  // (defect [gsig-086]): they mutated legitimate technical signal text.
];

/**
 * Sanitize a single signal text before embedding into a model prompt. Returns
 * the cleaned text + the list of patterns that matched (for telemetry).
 */
export function sanitizeSignalText(text: string): { text: string; matched: string[] } {
  let out = text;
  const matched: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.rx.test(out)) {
      matched.push(p.name);
      out = out.replace(p.rx, p.replacement);
    }
  }
  // Final safety: cap absurdly long text to keep one bad row from hogging the
  // prompt budget. A length guard, not a content rewrite.
  if (out.length > 500) {
    out = out.slice(0, 497) + '...';
    matched.push('length-cap');
  }
  return { text: out, matched };
}
