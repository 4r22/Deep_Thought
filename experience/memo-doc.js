// The memo as a woven document (bead vc-brain-4sg, memo verdict A).
// The operator retired the claim-ledger fork: the memo body is the real
// document — cited prose in a lawful measure — and every price (trust tier,
// authority, source) lives OUT of the measure in one fixed marginal channel,
// aligned line-for-line with the prose it prices. No inline claim pills.
//
// The weave is possible because the tape already writes both halves: the
// section narrative is bullet-per-claim with a [C#] key on each line, and
// each claim carries its own trust record and cited evidence. So a prose
// block resolves to the claims it cites, and those claims become its mark:
// the block is priced at its WEAKEST cited claim (a paragraph is only as
// good as the softest statement in it) and flagged when any cited claim is
// contradicted. The [C#] keys leave the measure entirely — the margin is
// the citation apparatus (no ornamental numbers, acceptance ac-1/ac-4).
import { esc, inline } from './md.js?v=2026-07-21-5';

const SECTION_TITLES = {
  snapshot: 'Snapshot', hypotheses: 'Hypotheses', swot: 'SWOT',
  problem_product: 'Problem & Product', traction: 'Traction',
  team_history: 'Team & History', technology_defensibility: 'Technology & Defensibility',
  market_sizing: 'Market Sizing', competition: 'Competition',
};

// Tier vocabulary — typographic weight only, never a resting hue (ac-8).
// Rank doubles as the "weakest wins" ordering for a multi-claim block.
const TIERS = {
  claimed: { rank: 0, cls: 'tier-claim', glyph: '○', word: 'claim' },
  reconstructed: { rank: 1, cls: 'tier-derived', glyph: '◐', word: 'derived' },
  'verified-offline': { rank: 2, cls: 'tier-verified', glyph: '●', word: 'verified' },
  'verified-online': { rank: 2, cls: 'tier-verified', glyph: '●', word: 'verified' },
  verified: { rank: 2, cls: 'tier-verified', glyph: '●', word: 'verified' },
};
const tierOf = t => TIERS[t] || TIERS.claimed;

// The source word names what the evidence IS, in full words (taste-086).
const sourceWord = sid => (sid === 'application' ? 'application' : sid);

/* ── the tape's markdown → prose blocks, each carrying its claim keys ──── */

// The measure carries prose only. inline() renders ANY [bracket] as a chip,
// which is right in the forum's idiom and wrong here: the tape's prose also
// brackets non-citations (an [`agent-derived`] aside, a [58, 80] band), and
// a chip mid-sentence is exactly the inline pill this fork retired. Hold
// every bracket aside, render the sentence, then put its content back as
// plain ink (acceptance ac-1/ac-2). Citation stays the margin's job.
function proseHtml(text) {
  // The placeholder is private-use Unicode, not spaced digits: prose numbers
  // ("weekly releases for 20 weeks") must never be mistaken for an index.
  // esc() passes these code points through untouched.
  const held = [];
  const masked = text.replace(/\[([^\]\[]+)\]/g, (_, c) => `\uE000${held.push(c) - 1}\uE001`);
  return inline(masked).replace(/\uE000(\d+)\uE001/g, (_, i) => inline(held[+i]));
}

function blocksOf(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const keys = [...line.matchAll(/\[(C\d+)\]/g)].map(m => m[1]);
    const body = line.replace(/\s*\[C\d+\]/g, '');
    if (/^#{1,6}\s/.test(body)) {
      out.push({ kind: 'head', text: body.replace(/^#{1,6}\s*/, ''), keys: [] });
    } else if (/^[-*]\s/.test(body)) {
      out.push({ kind: 'bullet', text: body.replace(/^[-*]\s*/, ''), keys });
    } else {
      out.push({ kind: 'para', text: body, keys });
    }
  }
  return out;
}

// A block's mark: the weakest tier among its cited claims, the contested
// flag if any of them is contradicted, and one Source link per distinct
// piece of evidence those claims stand on.
function markOf(keys, claimById) {
  const claims = keys.map(k => claimById.get(k)).filter(Boolean);
  if (!claims.length) return null;
  let weakest = null;
  for (const c of claims) {
    const t = tierOf(c.trust?.tier);
    if (!weakest || t.rank < weakest.rank) weakest = t;
  }
  const contested = claims.some(c => c.contradictions?.length);
  const agentDerived = claims.some(c => c.trust?.authority === 'agent-derived');
  const sources = [...new Set(claims.flatMap(c => (c.evidence || []).map(e => e.signal_id)))];
  return { tier: weakest, contested, agentDerived, sources, claims };
}

function markHtml(mark) {
  if (!mark) return '<div class="mark"></div>';
  const flags = [
    mark.agentDerived && mark.tier.word !== 'derived' ? 'agent-derived' : null,
    mark.contested ? 'contested' : null,
  ].filter(Boolean);
  const srcs = mark.sources.map(sid =>
    `<a class="src" href="#" data-evidence="${esc(sid)}">Source ▸ ${esc(sourceWord(sid))}</a>`).join('');
  return `
    <div class="mark">
      <span class="tier ${mark.tier.cls}"><span class="glyph">${mark.tier.glyph}</span> ${mark.tier.word}${
        flags.length ? ` <span class="flag">· ${esc(flags.join(' · '))}</span>` : ''}</span>
      ${srcs}
    </div>`;
}

/* ── the document ─────────────────────────────────────────────────────── */

function pageHtml(memo) {
  const claimById = new Map((memo.claims || []).map(c => [c.id, c]));
  const parts = [];
  for (const [key, text] of Object.entries(memo.sections || {})) {
    parts.push(`<h3 class="sec-head">${esc(SECTION_TITLES[key] || key)}</h3>`);
    for (const b of blocksOf(text)) {
      if (b.kind === 'head') {
        parts.push(`<h4 class="sub-head">${esc(b.text)}</h4>`);
        continue;
      }
      const mark = markOf(b.keys, claimById);
      const anchors = b.keys.map(k => `id="claim-${esc(k)}"`).join(' ');
      parts.push(`
        <div class="blk">
          ${markHtml(mark)}
          <p class="prose${b.kind === 'bullet' ? ' prose-item' : ''}" ${anchors}>${proseHtml(b.text)}</p>
        </div>`);
    }
  }
  return parts.join('');
}

// Gaps and the diligence log stay on the page — flagged, never silently
// dropped — in the document's own idiom: the margin names the kind, the
// measure carries the sentence.
function appendixHtml(memo) {
  const parts = [];
  if ((memo.gaps || []).length) {
    parts.push(`<h3 class="sec-head">Gaps</h3>`);
    for (const g of memo.gaps) parts.push(`
      <div class="blk">
        <div class="mark"><span class="tier tier-claim"><span class="glyph">◇</span> gap</span>
          <span class="src-plain">${esc(g.field)}</span></div>
        <p class="prose">${proseHtml(g.note)}</p>
      </div>`);
  }
  if ((memo.diligence_log || []).length) {
    parts.push(`<h3 class="sec-head">Diligence log</h3>`);
    for (const d of memo.diligence_log) parts.push(`
      <div class="blk">
        <div class="mark"><span class="tier ${d.status === 'done' ? 'tier-verified' : 'tier-derived'}">
          <span class="glyph">${d.status === 'done' ? '●' : '◐'}</span> ${esc(d.status)}</span>
          <span class="src-plain">${esc(d.instrument || '')}</span></div>
        <p class="prose">${proseHtml(d.item)}</p>
      </div>`);
  }
  return parts.join('');
}

function decisionBandHtml(memo, screen) {
  const dec = memo.decision;
  if (!dec) return '';
  const conds = (dec.conditions || []).length;
  return `
    <div class="decision-band">
      <div class="db-call">
        <span class="sk-label">recommendation</span>
        <span class="db-word">${esc(dec.recommendation)}</span>
        ${dec.check_usd ? `<span class="sk-chip">$${dec.check_usd.toLocaleString('en-US')} fast check</span>` : ''}
        ${conds ? `<span class="sk-chip warn">${conds} conditions before wire</span>` : ''}
      </div>
      <div>
        <p class="db-why">${proseHtml(dec.rationale || '')}</p>
        <div class="db-foot">
          <span class="sk-label">${screen?.confidence ? `confidence ${esc(screen.confidence)} · ` : ''}the fund decides — this memo is agent-derived input</span>
        </div>
      </div>
    </div>`;
}

/* ── render ───────────────────────────────────────────────────────────── */

// onEvidence(signalId) — the marginal Source mark's one-click target (ac-4).
export function renderMemoDoc(host, state, { onEvidence } = {}) {
  const memo = state.memo;
  if (!memo) return false;
  const name = memo.company?.name || '';
  const dec = memo.decision;

  host.innerHTML = `
    <div class="card-head">
      <span class="sk-label">${esc(name ? `${name} — investment memo` : 'investment memo')}</span>
      <span class="rule"></span>
      ${dec ? `<span class="sk-chip warn">${esc(dec.recommendation)}${
        dec.check_usd ? ` · $${Math.round(dec.check_usd / 1000)}k` : ''}</span>` : ''}
    </div>
    <div class="memo-body">
      ${decisionBandHtml(memo, state.screen)}
      <div class="page">
        ${pageHtml(memo)}
        ${appendixHtml(memo)}
      </div>
    </div>`;

  host.addEventListener('click', e => {
    const src = e.target.closest('.src');
    if (!src) return;
    e.preventDefault();
    onEvidence?.(src.dataset.evidence);
  });
  return true;
}
