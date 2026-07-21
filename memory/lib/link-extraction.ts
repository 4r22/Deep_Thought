/**
 * Zero-LLM typed-edge extraction.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/link-extraction.ts:597-724 (MIT).
 *
 * Take [gsig-050]: the "self-wiring knowledge graph" relationship-type
 * inference — deterministic regex, zero LLM. Per-edge verb rules
 * (FOUNDED_RE > INVESTED_RE > ADVISES_RE > WORKS_AT_RE) with page-role priors
 * (partner/advisor/employee) as a fallback. Precedence:
 * founded > invested_in > advises > works_at > role prior > mentions. The
 * INVESTED_RE / PARTNER_ROLE_RE patterns are already VC-shaped ("led the seed",
 * "wrote a check", "portfolio company", "term sheet for", "venture partner").
 *
 * Deviations from the original:
 *   - Zero imports: `PageType` (a `string` alias in gbrain) is inlined; the
 *     `excerpt`/`ensureWellFormed` helpers and the frontmatter-extraction code
 *     that follow inferLinkType in the source are not part of this take and are
 *     omitted. The regexes and inferLinkType are copied VERBATIM.
 */

export type PageType = string;

// Employment context: position + at/of, or explicit work verbs.
const WORKS_AT_RE = /\b(?:CEO of|CTO of|COO of|CFO of|CMO of|CRO of|VP at|VP of|VPs? Engineering|VPs? Product|works at|worked at|working at|employed by|employed at|joined as|joined the team|engineer at|engineer for|director at|director of|head of|heads up .{0,20} at|leads engineering|leads product|leads the .{0,20} (?:team|org) at|manages engineering at|manages product at|running (?:engineering|product|design) at|currently at|previously at|previously worked at|spent .* (?:years|months) at|stint at|stint as|tenure at|tenure as|role at|position at|(?:senior|staff|principal|lead|backend|frontend|full-?stack|ML|data|security) engineer at|promoted to (?:senior|staff|principal|lead) .{0,20} at|(?:his|her|their|my) time at)\b/i;

// Investment context. Order patterns most-specific to least.
const INVESTED_RE = /\b(?:invested in|invests in|investing in|invest in|investment in|investments in|backed by|funding from|funded by|raised from|led the (?:seed|Series|round|investment|round)|led .{0,30}(?:Series [A-Z]|seed|round|investment)|participated in (?:the )?(?:seed|Series|round)|wrote (?:a |the )?check|first check|early investor|portfolio (?:company|includes)|board seat (?:at|in|on)|term sheet for)\b/i;

// Founded patterns (incl. noun-form "founder of" / "founders include").
const FOUNDED_RE = /\b(?:founded|co-?founded|started the company|incorporated|founder of|founders? (?:include|are)|the founder|is a co-?founder|is one of the founders)\b/i;

// Advise context: must be rooted in "advisor"/"advise".
const ADVISES_RE = /\b(?:advises|advised|advisor (?:to|at|for|of)|advisory (?:board|role|position|capacity|engagement|partnership|contract|relationship|work)|board advisor|on .{0,20} advisory board|joined .{0,20} advisory board|in an? advisory (?:capacity|role|position)|as an? (?:advisor|security advisor|technical advisor|strategic advisor|industry advisor|product advisor|board advisor|senior advisor)|(?:strategic|technical|security|product|industry|senior|board) advisor (?:to|at|for|of)|consults for|consulting role (?:at|with))\b/i;

// Page-role prior: page-level description implies the person IS an investor.
const PARTNER_ROLE_RE = /\b(?:partner at|partner of|venture partner|VC partner|invested early|investor at|investor in|portfolio|venture capital|early-stage investor|seed investor|fund [A-Z]|invests across|backs companies)\b/i;

// Page-role prior: page-level description implies the person IS an advisor.
const ADVISOR_ROLE_RE = /\b(?:full-time advisor|professional advisor|advises (?:multiple|several|various)|is an? (?:advisor|security advisor|technical advisor|strategic advisor|industry advisor|product advisor|senior advisor)|took on advisory roles|(?:her|his|their) advisory (?:work|role|engagement|portfolio)|serves as (?:an )?advisor)\b/i;

// Page-role prior: page-level description implies the person IS an employee.
const EMPLOYEE_ROLE_RE = /\b(?:is an? (?:senior|staff|principal|lead|backend|frontend|full-?stack|ML|data|security|DevOps|platform)? ?engineer at|is an? (?:senior|staff|principal|lead)? ?(?:developer|designer|product manager|engineering manager|director|VP) (?:at|of)|holds? the (?:CTO|CEO|CFO|COO|CMO|CRO|VP) (?:role|position|seat|title) at|is the (?:CTO|CEO|CFO|COO|CMO|CRO) of|employee at|on the team at|works on .{0,30} at)\b/i;

/**
 * Infer link_type from page context. Deterministic regex heuristics, no LLM.
 *
 * Two layers:
 *   1. Per-edge: verb window around the slug mention (FOUNDED/INVESTED/ADVISES/WORKS_AT).
 *   2. Page-role prior: when per-edge falls through, use the SOURCE page's
 *      role description (partner/advisor/employee) for person -> company links.
 *
 * Precedence: founded > invested_in > advises > works_at > role prior > mentions.
 */
export function inferLinkType(
  pageType: PageType,
  context: string,
  globalContext?: string,
  targetSlug?: string,
): string {
  if (pageType === 'media') {
    return 'mentions';
  }
  if ((pageType as string) === 'image') return 'image_of';
  if ((pageType as string) === 'meeting') return 'attended';
  // Per-edge verb rules.
  if (FOUNDED_RE.test(context)) return 'founded';
  if (INVESTED_RE.test(context)) return 'invested_in';
  if (ADVISES_RE.test(context)) return 'advises';
  if (WORKS_AT_RE.test(context)) return 'works_at';
  // Page-role prior: only fires for person -> company links.
  // Precedence within priors: investor > advisor > employee.
  if (pageType === 'person' && globalContext && targetSlug?.startsWith('companies/')) {
    if (PARTNER_ROLE_RE.test(globalContext)) return 'invested_in';
    if (ADVISOR_ROLE_RE.test(globalContext)) return 'advises';
    if (EMPLOYEE_ROLE_RE.test(globalContext)) return 'works_at';
  }
  return 'mentions';
}
