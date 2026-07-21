import { md, inline, esc, parseDebate } from './md.js?v=2026-07-21-2';
import { bootTerminal } from './terminal.js?v=2026-07-21-2';

// Run context is session-sticky (bead vc-brain-toe.1): a runless entry —
// e.g. the landing's gBrain corpus link (?view=entity&e=forum:gbrain) — must
// NOT silently reset to the default run when the top menu is used next. The
// URL param wins when present; otherwise the last run this tab saw is kept.
export const RUN = (() => {
  const fromUrl = new URLSearchParams(location.search).get('run');
  let r = fromUrl;
  if (!r) { try { r = sessionStorage.getItem('vcbrain-run:v1'); } catch { /* private mode */ } }
  r = r || 'ferrite-inverted';
  try { sessionStorage.setItem('vcbrain-run:v1', r); } catch { /* private mode */ }
  return r;
})();
const OUT = `../intelligence/out/${RUN}`;

const $ = sel => document.querySelector(sel);
const show = el => el.removeAttribute('hidden');

const VERDICT_CLS = { advance: 'ok', contested: 'warn', reject: 'bad' };
const TREND = { improving: '↗', declining: '↘', flat: '→', stable: '→' };

const state = {};

async function fetchText(path) {
  try { const r = await fetch(path); return r.ok ? await r.text() : null; }
  catch { return null; }
}

async function fetchRun() {
  const files = {
    screen: 'screen.json', triage: 'triage.json', axes: 'axes.json', memo: 'memo.json',
    attendants: 'forum-attendants.json',
    adjudication: 'forum-adjudication.json', latency: 'latency.json',
    bull: 'forum-bull.md', bear: 'forum-bear.md', debate: 'forum-debate.md',
    postBull: 'forum-post-bull.md', postBear: 'forum-post-bear.md',
  };
  await Promise.all(Object.entries(files).map(async ([key, name]) => {
    try {
      const res = await fetch(`${OUT}/${name}`);
      if (!res.ok) return;
      state[key] = name.endsWith('.json') ? await res.json() : await res.text();
    } catch { /* file absent in this run — section stays hidden */ }
  }));
  // Seeded room (bead vc-brain-2o9): per-seat interviews are named by seat id —
  // forum-<id>.md (blind pre) and forum-post-<id>.md (post-debate). Legacy
  // 2-pole tapes have no attendants manifest and keep the bull/bear files above.
  if (state.attendants?.attendants?.length) {
    state.pre = {}; state.post = {};
    await Promise.all(state.attendants.attendants.flatMap(a => [
      fetchText(`${OUT}/forum-${a.id}.md`).then(t => { if (t) state.pre[a.id] = t; }),
      fetchText(`${OUT}/forum-post-${a.id}.md`).then(t => { if (t) state.post[a.id] = t; }),
    ]));
  }
}

/* ── hero: company identity only — the decision lives in #recommendation ── */
function renderHero() {
  const co = state.memo?.company;
  const verdict = state.screen?.verdict || state.latency?.decision;
  const name = co?.name || RUN;
  $('#hero').innerHTML = `
    <div class="hero-row">
      <span class="hero-name">${esc(name)}</span>
      ${verdict ? `<span class="sk-chip hero-verdict ${VERDICT_CLS[verdict] || ''}">${esc(verdict)}</span>` : ''}
      ${state.screen ? `<span class="sk-chip">confidence ${esc(state.screen.confidence)}</span>` : ''}
    </div>
    ${co ? `<p class="hero-oneliner">${esc(co.one_liner)}</p>` : ''}`;
}

/* ── overview: the concise product face — one card per view, click to go ── */
function renderOverview() {
  const s = state.screen, t = state.triage, a = state.axes, adj = state.adjudication;
  const seeded = state.attendants?.attendants?.length;
  const serious = (s?.red_flags || []).filter(f => f.severity === 'serious');
  const cards = [];
  if (s) cards.push(`
    <button class="over-card" id="ov-screen" data-view="screen">
      <div class="ov-head"><span class="sk-label">screen</span>
        <span class="sk-chip ${VERDICT_CLS[s.verdict] || ''}">${esc(s.verdict)}</span></div>
      <div class="ov-big">${(s.red_flags || []).length} flags</div>
      <p>${serious.length ? `${serious.length} serious — ${esc(serious[0].flag.slice(0, 90))}…` : 'no serious flags'}</p>
    </button>`);
  if (t) cards.push(`
    <button class="over-card" id="ov-triage" data-view="triage">
      <div class="ov-head"><span class="sk-label">triage</span>
        ${t.confidence ? `<span class="sk-chip">conf ${esc(t.confidence)}</span>` : ''}</div>
      <div class="ov-big">${(t.routed_checks || []).length} checks</div>
      <p>${(t.tensions || []).length} tension(s) · one crux named</p>
    </button>`);
  if (adj || seeded) cards.push(`
    <button class="over-card" id="ov-forum" data-view="forum">
      <div class="ov-head"><span class="sk-label">forum</span>
        ${adj ? `<span class="sk-chip blue">${esc(adj.outcome)}</span>` : ''}</div>
      <div class="ov-big">${seeded ? `${state.attendants.attendants.length} seats` : `${(adj?.converged || []).length} converged`}</div>
      <p>${adj ? `${(adj.residual || []).length} residual fork(s) · ` : ''}the room that argued the crux</p>
    </button>`);
  if (a) {
    const roomBadge = a.room
      ? (a.room.convened ? '<span class="sk-chip blue">room convened</span>' : '<span class="sk-chip">room skipped</span>')
      : (a.forum_trigger?.fire ? (state.screen?.verdict === 'contested'
          ? '<span class="sk-chip bad">forum fired</span>'
          : '<span class="sk-chip">forum gated off</span>') : '');
    cards.push(`
    <button class="over-card" id="ov-axes" data-view="axes">
      <div class="ov-head"><span class="sk-label">three axes — founder · market · idea-vs-market</span>${roomBadge}</div>
      <div class="ov-big">${a.founder.score}<span class="of muted">/100</span> · ${esc(a.market.rating)}</div>
      <p>idea vs market: ${esc(a.idea_vs_market.verdict)}</p>
    </button>`);
  }
  $('#overview-grid').innerHTML = cards.join('');
  document.querySelectorAll('.over-card').forEach(c =>
    c.addEventListener('click', () => setView(c.dataset.view)));
}

/* ── recommendation: the decision, summarised — below the metrics, above
      the noise. Agent drafts, the human gate decides (design commitment). ── */
function renderRecommendation() {
  const dec = state.memo?.decision;
  if (!dec) return;
  const cls = VERDICT_CLS[dec.recommendation] || 'blue';
  $('#recommendation').innerHTML = `
    <div class="card-head"><span class="sk-label">recommendation — agent drafts, human decides</span>
      <span class="rule"></span>
      <span class="sk-chip ${cls}">${esc(dec.recommendation)}</span></div>
    <div class="rec-row">
      <div class="rec-call">
        <span class="rec-word ${cls}">${esc(dec.recommendation)}</span>
        <span class="rec-check mono muted">$${(dec.check_usd / 1000).toFixed(0)}k fast check</span>
        ${dec.conditions?.length ? `<span class="sk-chip warn">${dec.conditions.length} conditions before wire</span>` : ''}
      </div>
      <div class="rec-body">
        <p>${inline(dec.rationale)}</p>
        <div class="rec-foot">
          <button class="sk-btn" id="rec-memo-btn">full memo →</button>
        </div>
      </div>
    </div>`;
  $('#rec-memo-btn').addEventListener('click', () => setView('memo'));
  show($('#recommendation'));
}

/* ── run metadata: latency stays in the chrome (topbar chip + settings),
      off the decision surface — the overview is about the company ──────── */
function renderRunMeta() {
  const lat = state.latency;
  if (!lat) return;
  const chip = $('#latency-chip');
  chip.textContent = `run ${Math.round(lat.total_seconds)}s`;
  chip.title = 'total pipeline latency';
  show(chip);
  show($('#replay-btn'));
  $('#settings-meta').textContent =
    `${lat.model} · ${lat.total_seconds.toFixed(1)}s · decision: ${lat.decision}`;
}

/* ── screen ───────────────────────────────────────────────────────────── */
function renderScreen() {
  const s = state.screen;
  if (!s) return;
  const flags = (s.red_flags || []).map(f => `
    <li><span class="sk-chip ${f.severity === 'serious' ? 'bad' : 'warn'}">${esc(f.severity)}</span>
      <span>${inline(f.flag)} <span class="ref plain">${esc(f.evidence_ref)}</span></span></li>`).join('');
  const fit = s.thesis_fit;
  $('#screen').innerHTML = `
    <div class="card-head"><span class="sk-label">screen</span><span class="rule"></span>
      <span class="sk-chip ${VERDICT_CLS[s.verdict] || ''}">${esc(s.verdict)}</span></div>
    <div class="axis-chips">
      <span class="sk-chip ${fit?.in_scope ? 'ok' : 'bad'}">${fit?.in_scope ? 'in thesis scope' : 'out of scope'}</span>
      ${(fit?.mismatches || []).map(m => `<span class="sk-chip bad">${esc(m)}</span>`).join('')}
      ${(s.missing_minimums || []).map(m => `<span class="sk-chip warn">missing: ${esc(m)}</span>`).join('')}
    </div>
    <p>${inline(s.rationale)}</p>
    ${flags ? `<div class="sk-label">red flags</div><ul class="flag-list">${flags}</ul>` : ''}`;
  show($('#screen'));
}

/* ── triage: moves before the debate — route the empirical, name the crux,
      surface the evidence-vs-evidence tensions the room must cover ───────── */
const sigRef = r => `<span class="ref sig-ref" data-sig="${esc(r)}">${esc(r)}</span>`;

function renderTriage() {
  const t = state.triage;
  if (!t) {
    // Legacy tape: pre-inversion runs have no triage.json — say so rather
    // than leaving a nav tab that goes nowhere.
    $('#triage').innerHTML = `
    <div class="card-head"><span class="sk-label">triage</span><span class="rule"></span></div>
    <div class="memo-body"><p>No triage on this tape — the run predates the inverted pipeline, so
      no <code>triage.json</code> was written. Its check-routing lives inside the legacy axes
      stage (<code>forum_trigger.routed_checks</code>), shown on the axes view.</p></div>`;
    show($('#triage'));
    return;
  }
  const tensions = (t.tensions || []).map(tn => `
    <div class="tension">
      <div class="sk-label">${esc(tn.name)}</div>
      <div class="poles">
        <div class="pole"><span class="sk-chip">side A</span>
          <p>${inline(tn.side_a?.claim || '')}</p>
          <div class="axis-chips">${(tn.side_a?.evidence_refs || []).map(sigRef).join(' ')}</div></div>
        <div class="pole"><span class="sk-chip">side B</span>
          <p>${inline(tn.side_b?.claim || '')}</p>
          <div class="axis-chips">${(tn.side_b?.evidence_refs || []).map(sigRef).join(' ')}</div></div>
      </div>
    </div>`).join('');
  $('#triage').innerHTML = `
    <div class="card-head"><span class="sk-label">triage — routed checks · one crux · tensions</span>
      <span class="rule"></span>
      ${t.confidence ? `<span class="sk-chip">conf ${esc(t.confidence)}</span>` : ''}</div>
    <div class="disagreement" style="border-top:0;margin-top:0;padding-top:0">
      <span class="sk-label">crux — the judgment fork no routed check can settle</span>
      <p>${inline(t.crux || '')}</p>
    </div>
    ${t.routed_checks?.length ? `<div class="sk-label">routed checks</div>
      <ol class="routed">${t.routed_checks.map(c => `<li>${inline(c)}</li>`).join('')}</ol>` : ''}
    ${tensions ? `<div class="sk-label" style="margin-top:14px">tensions in the record — evidence vs evidence</div>${tensions}` : ''}
    ${t.room_brief ? `<div class="sk-label" style="margin-top:14px">room brief — what the forum must cover</div>
      <p class="axis-notes">${inline(t.room_brief)}</p>` : ''}`;
  show($('#triage'));
}

/* ── axes ─────────────────────────────────────────────────────────────── */
function axisChips(a, extra = '') {
  return `<div class="axis-chips">
    ${a.trend ? `<span class="sk-chip">${TREND[a.trend] || ''} ${esc(a.trend)}</span>` : ''}
    ${a.confidence ? `<span class="sk-chip">conf ${esc(a.confidence)}</span>` : ''}
    ${extra}
    ${(a.evidence_refs || []).map(r => `<span class="ref sig-ref" data-sig="${esc(r)}">${esc(r)}</span>`).join(' ')}
  </div>`;
}

// position_refs cite the room: "seat-N/pre|post", "debate", "adjudication",
// or "bull/pre" for 2-pole rooms — optionally with a "#fragment". Seat/pole
// interview refs link to that person's interview page when the room is in the
// corpus; everything else renders as a plain provenance chip.
function positionRefChip(ref) {
  const m = String(ref).match(/^(seat-\d+|bull|bear)\/(pre|post)/);
  const seats = state.attendants?.attendants;
  if (m && seats) {
    const seat = seats.find(x => x.id === m[1] || x.slug === m[1]);
    if (seat) return `<button class="ref sig-ref entity-link" data-entity="person:${esc(seat.slug)}" data-fn="${m[2].toUpperCase()}">${esc(ref)}</button>`;
  }
  return `<span class="ref plain">${esc(ref)}</span>`;
}

function axisRoom(a) {
  const prefs = a.position_refs || [];
  return `
    ${a.room_effect ? `<p class="axis-notes"><strong>room effect:</strong> ${inline(a.room_effect)}</p>` : ''}
    ${prefs.length ? `<div class="axis-chips"><span class="sk-label">seats</span>${prefs.map(positionRefChip).join(' ')}</div>` : ''}`;
}

/* ── axes = dimension mapping: the room projected into three dimensions,
      scored last, never inside the forum. New-contract shape. ───────────── */
function renderAxesMapped(a) {
  const f = a.founder, m = a.market, im = a.idea_vs_market;
  const [lo, hi] = f.band || [f.score, f.score];
  const room = a.room || {};
  const roomBadge = room.convened
    ? '<span class="sk-chip blue">room convened</span>'
    : '<span class="sk-chip">room skipped — degraded no-room mapping</span>';
  $('#axes').innerHTML = `
    <div class="card-head"><span class="sk-label">three axes — founder · market · idea-vs-market</span>
      <span class="rule"></span>${roomBadge}</div>
    ${room.note ? `<p class="axis-notes">${inline(room.note)}</p>` : ''}
    <div class="axes-grid">
      <div class="axis">
        <div class="axis-head"><span class="sk-label">founder</span>
          <span class="axis-value">${f.score}<span class="of">/100</span></span></div>
        <div class="band-track">
          <div class="band-range" style="left:${lo}%;width:${hi - lo}%"></div>
          <div class="band-marker" style="left:${f.score}%"></div>
        </div>
        <div class="band-scale"><span>0</span><span>band ${lo}–${hi}</span><span>100</span></div>
        ${axisChips(f, f.cold_start ? '<span class="sk-chip blue">cold start</span>' : '')}
        ${axisRoom(f)}
        <p class="axis-notes">${inline(f.notes)}</p>
      </div>
      <div class="axis">
        <div class="axis-head"><span class="sk-label">market</span>
          <span class="axis-word">${esc(m.rating)}</span></div>
        ${axisChips(m)}
        ${axisRoom(m)}
        <p class="axis-notes">${inline(m.notes)}</p>
      </div>
      <div class="axis">
        <div class="axis-head"><span class="sk-label">idea vs market</span>
          <span class="axis-word">${esc(im.verdict)}</span></div>
        ${axisChips(im)}
        ${axisRoom(im)}
        <p class="axis-notes">${inline(im.notes)}</p>
      </div>
    </div>
    <div class="disagreement">
      <span class="sk-label">disagreement is signal</span>
      <p>${inline(a.disagreement)}</p>
    </div>`;
  show($('#axes'));
}

function renderAxes() {
  const a = state.axes;
  if (!a) return;
  // Feature-detect: new-contract axes carry a room + per-axis position_refs;
  // legacy tapes carry forum_trigger and no room. Never crash on either.
  if (a.room !== undefined || a.founder?.position_refs !== undefined) return renderAxesMapped(a);
  const f = a.founder, m = a.market, im = a.idea_vs_market;
  const [lo, hi] = f.band || [f.score, f.score];
  const ft = a.forum_trigger;
  $('#axes').innerHTML = `
    <div class="card-head"><span class="sk-label">three axes — founder · market · idea-vs-market</span><span class="rule"></span></div>
    <div class="axes-grid">
      <div class="axis">
        <div class="axis-head"><span class="sk-label">founder</span>
          <span class="axis-value">${f.score}<span class="of">/100</span></span></div>
        <div class="band-track">
          <div class="band-range" style="left:${lo}%;width:${hi - lo}%"></div>
          <div class="band-marker" style="left:${f.score}%"></div>
        </div>
        <div class="band-scale"><span>0</span><span>band ${lo}–${hi}</span><span>100</span></div>
        ${axisChips(f, f.cold_start ? '<span class="sk-chip blue">cold start</span>' : '')}
        <p class="axis-notes">${inline(f.notes)}</p>
      </div>
      <div class="axis">
        <div class="axis-head"><span class="sk-label">market</span>
          <span class="axis-word">${esc(m.rating)}</span></div>
        ${axisChips(m)}
        <p class="axis-notes">${inline(m.notes)}</p>
      </div>
      <div class="axis">
        <div class="axis-head"><span class="sk-label">idea vs market</span>
          <span class="axis-word">${esc(im.verdict)}</span></div>
        ${axisChips(im)}
        <p class="axis-notes">${inline(im.notes)}</p>
      </div>
    </div>
    <div class="disagreement">
      <span class="sk-label">disagreement is signal</span>
      <p>${inline(a.disagreement)}</p>
      ${ft?.fire ? `
        <div class="axis-chips"><span class="sk-chip ${state.screen?.verdict === 'contested' ? 'bad' : ''}">${
          state.screen?.verdict === 'contested' ? 'forum fired' : 'forum trigger fired — gated off (screen not contested)'}</span></div>
        <div class="poles">
          ${ft.opposed_poles.map(p => `<div class="pole">
            <span class="sk-chip ${p.pole === 'advance' ? 'ok' : 'bad'}">${esc(p.pole)}</span>
            <p>${inline(p.strongest_argument)}</p>
            ${(p.evidence_refs || []).map(r => `<span class="ref sig-ref" data-sig="${esc(r)}">${esc(r)}</span>`).join(' ')}
          </div>`).join('')}
        </div>
        <p class="axis-notes"><strong>Non-empirical crux:</strong> ${inline(ft.non_empirical_crux)}</p>
        ${ft.routed_checks?.length ? `<div class="sk-label">routed diligence checks</div>
          <ol class="routed">${ft.routed_checks.map(c => `<li>${inline(c)}</li>`).join('')}</ol>` : ''}` : ''}
    </div>`;
  show($('#axes'));
}

/* ── forum ────────────────────────────────────────────────────────────── */
const MOVE_CLS = { conceded: 'ok', refined: 'warn', held: '' };

// A collapsed section (native details/summary) inside the forum skeleton.
// `open` starts it expanded — used only when there is no adjudication to lead
// with, so the primary content is never hidden behind a closed toggle.
const forumCollapse = (open, summary, inner) =>
  `<details class="forum-collapse"${open ? ' open' : ''}>
     <summary class="sk-label">${summary}</summary>
     <div class="forum-collapse-body">${inner}</div></details>`;

// Forum hierarchy (bead vc-brain-toe.7): the typed adjudication — the room's
// verdict — renders FIRST and expanded. The pre-interviews, debate transcript
// and post-interviews drop into collapsed sections the reader opens. Nothing
// is deleted; everything stays reachable.
function renderForum() {
  // Seeded room (new contract): persons seated first, per-seat pre/post.
  if (state.attendants?.attendants?.length) return renderSeededForum();
  // Legacy 2-pole tape: bull/bear case + debate + post files + adjudication.
  const has = {
    bull: !!state.bull, bear: !!state.bear, debate: !!state.debate,
    postBull: !!state.postBull, postBear: !!state.postBear, adj: !!state.adjudication,
  };
  if (!has.adj && !has.bull && !has.bear && !has.debate && !has.postBull && !has.postBear)
    return renderNoForum();
  const secDefs = [
    has.bull && ['bull case — blind pre-interview', md(state.bull)],
    has.bear && ['bear case — blind pre-interview', md(state.bear)],
    has.debate && ['debate transcript', `<div class="memo-body">${forumPanel('debate')}</div>`],
    has.postBull && ['bull — post-debate interview', md(state.postBull)],
    has.postBear && ['bear — post-debate interview', md(state.postBear)],
  ].filter(Boolean);
  // With no adjudication to lead, open the first section so the view is never
  // just a header over closed toggles.
  const sections = secDefs.map(([s, inner], i) => forumCollapse(!has.adj && i === 0, s, inner)).join('');
  $('#forum').innerHTML = `
    <div class="card-head"><span class="sk-label">forum — adjudication first; interviews &amp; debate below</span>
      <span class="rule"></span>${has.adj ? `<span class="sk-chip blue">${esc(state.adjudication.outcome)}</span>` : ''}</div>
    ${has.adj ? `<div class="forum-adj memo-body">${forumPanel('adjudication')}</div>` : ''}
    ${sections}`;
  show($('#forum'));
}

// The room now convenes for every advancing screen with a live crux — it is the
// reference space the axes later project. Only a reject screen or a blank triage
// crux skips it (mechanical gate); there is no "reserved for contested" story.
function renderNoForum() {
  const s = state.screen, t = state.triage;
  const hasCrux = t ? !!(t.crux || '').trim() : undefined;
  const reason = s?.verdict === 'reject'
    ? 'the screen returned a <strong>reject</strong> verdict — a reject skips the room.'
    : hasCrux === false
      ? 'triage returned a <strong>blank crux</strong> — with no judgment fork to press, the room is skipped.'
      : 'no forum artifacts were written for this run.';
  $('#forum').innerHTML = `
    <div class="card-head"><span class="sk-label">forum</span><span class="rule"></span>
      <span class="sk-chip">room not convened</span></div>
    <div class="memo-body"><p>The forum seats named voices on the crux, then adjudicates. It convenes
      for every advancing screen with a live crux; here, ${reason}</p></div>`;
  show($('#forum'));
}

function renderSeededForum() {
  const seed = state.attendants, adj = state.adjudication;
  const evByHandle = new Map((adj?.evolution || []).map(e => [e.attendant, e]));
  const roster = (seed.attendants || []).map(a => {
    const ev = evByHandle.get(a.handle);
    const leanCls = { for: 'ok', against: 'bad', 'genuinely-split': 'warn' }[a.opening_lean] || '';
    return `<button class="over-card entity-link" data-entity="person:${esc(a.slug)}">
      <div class="ov-head"><span class="sk-label">${esc(a.id)}</span>
        ${ev?.movement ? `<span class="sk-chip ${MOVE_CLS[ev.movement] ?? ''}">${esc(ev.movement)}</span>`
          : a.opening_lean ? `<span class="sk-chip ${leanCls}">lean ${esc(a.opening_lean)}</span>` : ''}</div>
      <div class="roster-name">${esc(a.handle)}</div>
      <p>${esc(a.lens || '')}</p>
    </button>`;
  }).join('');
  // The room's per-seat blind pre / post interviews live on each seat's entity
  // page (reached by clicking a seat). Here the typed adjudication leads; the
  // seat roster and the debate transcript collapse below it.
  const roomBlock = `
    <div class="sk-label">the room — click a seat for its invitation, mandate, and blind pre / post-debate interviews</div>
    <div class="roster-grid">${roster}</div>
    ${seed.room_note ? `<p class="axis-notes">${inline(seed.room_note)}</p>` : ''}`;
  $('#forum').innerHTML = `
    <div class="card-head"><span class="sk-label">forum — adjudication first; the room &amp; debate below</span>
      <span class="rule"></span>${adj ? `<span class="sk-chip blue">${esc(adj.outcome)}</span>` : ''}</div>
    <p class="axis-notes">seats are AI-simulated counterfactual personas of public figures — not their real views or participation</p>
    ${seed.crux_restatement ? `<div class="sk-label">crux the room pressed</div>
      <p>${inline(seed.crux_restatement)}</p>` : ''}
    ${adj ? `<div class="forum-adj memo-body">${forumPanel('adjudication')}</div>` : ''}
    ${forumCollapse(!adj, 'the room — seats &amp; interviews', roomBlock)}
    ${state.debate ? forumCollapse(false, 'debate transcript', `<div class="memo-body">${forumPanel('debate')}</div>`) : ''}`;
  show($('#forum'));
}

function forumPanel(id) {
  if (id !== 'debate' && id !== 'adjudication') return md(state[id]);
  if (id === 'debate') {
    // seeded rooms speak as seat-N — resolve to the person's handle + a link to
    // their interview pages; legacy 2-pole rooms speak as bull/bear (no seat map).
    const seatMap = new Map((state.attendants?.attendants || []).map(a => [a.id, a]));
    const { turns } = parseDebate(state.debate);
    return turns.map(t => {
      const seat = seatMap.get(t.speaker);
      const speaker = seat
        ? `<button class="sk-chip blue entity-link" data-entity="person:${esc(seat.slug)}">${esc(seat.handle)}</button>`
        : `<span class="sk-chip speaker-${esc(t.speaker)}">${esc(t.speaker)}</span>`;
      return `
      <div class="turn">
        <div class="turn-side">
          ${speaker}
          <span class="turn-n">turn ${t.n}${seat ? ` · ${esc(t.speaker)}` : ''} · ${esc(t.type)}</span>
        </div>
        <div>
          <p class="turn-claim">${inline(t.claim)}</p>
          <div class="turn-meta">
            ${t.target ? `<span class="ref plain">→ ${esc(t.target)}</span>` : ''}
            ${t.anchor ? inline(t.anchor) : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }
  const adj = state.adjudication;
  // residual positions: current runs carry positions[]; older runs carry
  // bull_position / bear_position — render either.
  const positions = r => r.positions ||
    [{ attendant: 'bull', position: r.bull_position }, { attendant: 'bear', position: r.bear_position }];
  const MOVE_CLS = { conceded: 'ok', refined: 'warn', held: '' };
  return `
    <div class="axis-chips"><span class="sk-chip blue">${esc(adj.outcome)}</span></div>
    <h4>Converged actions</h4>
    <ul class="adj-list">${adj.converged.map(c =>
      `<li><span class="sk-chip ok">turn ${c.turn}</span><span>${inline(c.action)}</span></li>`).join('')}</ul>
    ${adj.residual?.length ? `<h4>Residual fork</h4>${adj.residual.map(r => `
      <p>${inline(r.fork)}</p>
      <div class="poles">${positions(r).map(p => `
        <div class="pole"><span class="sk-chip speaker-${esc(p.attendant)}">${esc(p.attendant)}</span><p>${inline(p.position)}</p></div>`).join('')}
      </div>`).join('')}` : ''}
    ${adj.instrument?.length ? `<h4>Instrument</h4><ul class="adj-list">${adj.instrument.map(i =>
      `<li><span>${inline(i.move)}</span></li>`).join('')}</ul>` : ''}
    ${adj.evolution?.length ? `<h4>Position evolution</h4><ul class="adj-list">${adj.evolution.map(e => {
      const who = e.attendant || e.pole;   // pole: pre-restructure runs
      return `<li><span class="sk-chip speaker-${esc(who)}">${esc(who)}</span>
       <span class="sk-chip ${MOVE_CLS[e.movement] ?? ''}">${esc(e.movement)}</span>
       <span class="ref plain">${(e.turns || []).map(t => `turn ${t}`).join(', ')}</span></li>`;
    }).join('')}</ul>` : ''}
    ${adj.suggested_attendants?.length ? `<h4>Suggested attendants</h4><ul class="adj-list">${adj.suggested_attendants.map(s =>
      `<li><span class="sk-chip">${esc(s.handle)}</span><span>${inline(s.named_gap)}</span></li>`).join('')}</ul>` : ''}
    ${adj.authority_note ? `<p class="axis-notes">${inline(adj.authority_note)}</p>` : ''}`;
}

/* ── memo ─────────────────────────────────────────────────────────────── */
const SECTION_TITLES = {
  snapshot: 'Snapshot', hypotheses: 'Hypotheses', swot: 'SWOT',
  problem_product: 'Problem & Product', traction: 'Traction',
  team_history: 'Team & History', technology_defensibility: 'Technology & Defensibility',
  market_sizing: 'Market Sizing', competition: 'Competition',
};

function renderMemo() {
  const memo = state.memo;
  if (!memo) return;
  const sections = Object.entries(memo.sections || {}).map(([key, text]) => `
    <div class="memo-section">
      <h3><span class="sk-label">${esc(SECTION_TITLES[key] || key)}</span></h3>
      ${md(text)}
    </div>`).join('');
  const claims = (memo.claims || []).map(c => `
    <div class="claim-card" id="claim-${esc(c.id)}">
      <div class="claim-head">
        <span class="sk-chip blue">${esc(c.id)}</span>
        <span class="sk-chip">${esc(c.section)}</span>
        <span class="sk-chip">${esc(c.trust.tier)}</span>
        <span class="sk-chip">${esc(c.trust.authority)}</span>
        <span class="sk-chip ${{ high: 'ok', medium: 'warn', low: 'bad' }[c.trust.confidence] || ''}">conf ${esc(c.trust.confidence)}</span>
        ${c.contradictions?.length ? `<span class="sk-chip bad">contradicted</span>` : ''}
      </div>
      <div>${inline(c.text)}</div>
      ${(c.evidence || []).map(e => `<blockquote class="claim-quote" data-sig-src="${esc(e.signal_id)}">
        ${esc(e.signal_id)} — “${esc(e.quote)}”</blockquote>`).join('')}
    </div>`).join('');
  const dec = memo.decision;
  $('#memo').innerHTML = `
    <div class="card-head"><span class="sk-label">memo — every claim priced, gaps flagged</span><span class="rule"></span></div>
    <div class="memo-body">${sections}
      <h3><span class="sk-label">Claim ledger — per-claim trust</span></h3>
      <div class="claims-grid">${claims}</div>
      <h3><span class="sk-label">Gaps — flagged, never silently filled</span></h3>
      <ul class="gap-list">${(memo.gaps || []).map(g =>
        `<li><span class="sk-chip warn">${esc(g.field)}</span><span>${inline(g.note)}</span></li>`).join('')}</ul>
      <h3><span class="sk-label">Diligence log</span></h3>
      <ul class="dil-list">${(memo.diligence_log || []).map(d =>
        `<li><span class="sk-chip ${d.status === 'done' ? 'ok' : ''}">${esc(d.status)}</span>
         <span>${inline(d.item)} <span class="ref plain">${esc(d.instrument)}</span></span></li>`).join('')}</ul>
      ${dec ? `<div class="decision-box">
        <div class="card-head"><span class="sk-label">decision</span><span class="rule"></span>
          <span class="sk-chip blue">${esc(dec.recommendation)}</span></div>
        <span class="amount">$${dec.check_usd.toLocaleString('en-US')}</span>
        <p>${inline(dec.rationale)}</p>
        ${dec.conditions?.length ? `<div class="sk-label">conditions</div>
          <ol class="routed">${dec.conditions.map(c => `<li>${inline(c)}</li>`).join('')}</ol>` : ''}
      </div>` : ''}
    </div>`;
  show($('#memo'));
}

/* ── ref navigation ───────────────────────────────────────────────────── */
function wireRefs() {
  document.addEventListener('click', e => {
    const ref = e.target.closest('.ref');
    if (!ref) return;
    let target = null;
    if (ref.dataset.claim) target = document.getElementById(`claim-${ref.dataset.claim}`);
    else if (ref.dataset.sig)
      target = document.querySelector(`[data-sig-src="${ref.dataset.sig}"]`)?.closest('.claim-card');
    if (!target) return;
    setView('memo');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1600);
  });
}

/* ── view-state machine (gallery nav.js precedent): body[data-view-state]
      carries the state, CSS swaps content, View Transitions slide ─────── */
const VIEW_ORDER = { overview: 0, screen: 1, triage: 2, forum: 3, axes: 4, memo: 5, network: 6, entity: 7 };

function setView(next, { push = true, animate = true, params } = {}) {
  if (!(next in VIEW_ORDER)) next = 'overview';
  const prev = document.body.dataset.viewState;
  const changed = prev !== next;
  // same view + new params (entity → entity): URL still moves, no transition
  if (!changed && !params && push) return;
  const apply = () => {
    document.body.dataset.viewState = next;
    document.querySelectorAll('.view-tab').forEach(t =>
      t.setAttribute('aria-selected', String(t.dataset.view === next)));
  };
  const root = document.documentElement;
  const canTransition = animate && typeof document.startViewTransition === 'function'
    && prev && changed;
  if (!canTransition) { if (changed) apply(); }
  else {
    const dir = (VIEW_ORDER[next] ?? 0) >= (VIEW_ORDER[prev] ?? 0) ? 'forward' : 'back';
    root.dataset.vtDir = dir;
    let transition;
    try { transition = document.startViewTransition(apply); }
    catch { apply(); delete root.dataset.vtDir; }
    transition?.finished.finally(() => {
      if (root.dataset.vtDir === dir) delete root.dataset.vtDir;
    });
  }
  if (push) {
    const url = new URL(location);
    url.searchParams.set('run', RUN);
    url.searchParams.set('view', next);
    url.searchParams.delete('e');
    url.searchParams.delete('fn');
    url.searchParams.delete('net'); // network scope is explicit-per-nav (toe.2)
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
    history.pushState({ view: next }, '', url);
  }
  scrollTo(0, 0);
}

addEventListener('popstate', () =>
  setView(new URLSearchParams(location.search).get('view') || 'overview', { push: false }));

document.querySelectorAll('.view-tab').forEach(t =>
  t.addEventListener('click', () => setView(t.dataset.view)));

addEventListener('keydown', e => {
  if (e.target.closest('input,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const views = Object.keys(VIEW_ORDER).filter(v => v !== 'entity'); // entity needs an id
  if (e.key >= '1' && e.key <= String(views.length)) setView(views[+e.key - 1]);
  if (e.key === 'Escape') closeSettings();
});

/* ── settings drawer ──────────────────────────────────────────────────── */
function openSettings() {
  show($('#settings'));
  $('#settings-btn').setAttribute('aria-expanded', 'true');
}
function closeSettings() {
  $('#settings').setAttribute('hidden', '');
  $('#settings-btn').setAttribute('aria-expanded', 'false');
}
$('#settings-btn').addEventListener('click', () =>
  $('#settings').hidden ? openSettings() : closeSettings());
$('#settings-close').addEventListener('click', closeSettings);

/* ── skin/theme are LOCKED to dark aluminium (bead vc-brain-toe.5): stamped
      unconditionally in the index.html head, no switching UI, no persistence.
      skins/*.css stay on disk (decisions ledger); glass-driver never mounts. ── */

/* ── scroll progress → --scroll (drives the band flash) ─────────────────── */
{
  let ticking = false;
  const write = () => {
    ticking = false;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    document.documentElement.style.setProperty('--scroll',
      String(Math.min(1, Math.max(0, scrollY / max))));
  };
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(write); }
  }, { passive: true });
}

/* ── replay: overview cards re-reveal on the run's own clock; stage
      progress narrates through the topbar latency chip, not a card ──────── */
const STAGE_CARD = stage =>
  stage.startsWith('screen') ? '#ov-screen'
  : stage.startsWith('triage') ? '#ov-triage'
  : stage.startsWith('forum') ? '#ov-forum'
  : stage.startsWith('axes') ? '#ov-axes'
  : stage.startsWith('memo') ? '#recommendation'
  : null;

async function replay() {
  const lat = state.latency;
  if (!lat) return;
  setView('overview');
  closeSettings();
  const btn = $('#replay-btn');
  btn.disabled = true;
  const chip = $('#latency-chip');
  const scale = 9 / lat.total_seconds;
  document.querySelectorAll('#view-overview .over-card, #view-overview .run-card')
    .forEach(c => c.classList.add('veiled'));
  for (const s of lat.stages) {
    chip.textContent = `▸ ${s.stage} — ${s.seconds.toFixed(1)}s`;
    await new Promise(r => setTimeout(r, Math.max(s.seconds * scale * 1000, 350)));
    $(STAGE_CARD(s.stage))?.classList.remove('veiled');
  }
  // stages a run never ran (e.g. no forum) leave no veil behind
  document.querySelectorAll('#view-overview .veiled').forEach(c => c.classList.remove('veiled'));
  chip.textContent = `run ${Math.round(lat.total_seconds)}s · ${lat.decision}`;
  btn.disabled = false;
}
$('#replay-btn').addEventListener('click', replay);

/* ── boot ─────────────────────────────────────────────────────────────── */
$('#run-chip').textContent = `run: ${RUN}`;

await fetchRun();
if (!Object.keys(state).length) {
  $('#load-error').textContent =
    `no run output found at intelligence/out/${RUN}/ — serve from the repo root ` +
    `(python3 -m http.server) and pass ?run=<dir name>`;
  show($('#load-error'));
} else {
  renderHero(); renderRunMeta(); renderScreen(); renderTriage();
  renderForum(); renderAxes(); renderMemo();
  renderOverview(); renderRecommendation();
  wireRefs();
}
bootTerminal({ setView, run: RUN });
setView(new URLSearchParams(location.search).get('view') || 'overview', { push: false, animate: false });
