import { md, inline, esc, parseDebate } from './md.js?v=2026-07-21-5';
import { bootTerminal } from './terminal.js?v=2026-07-21-12';
import { mountForumShell } from './forum-shell.js?v=2026-07-21-5';
import { mountField } from './field.js?v=2026-07-21-14';
import { renderMemoDoc } from './memo-doc.js?v=2026-07-21-14';

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

// The forum shell mounts once at boot and returns { select }. The counsel view
// lives in the axes slot, so its "debate#turn-N" / "adjudication" position-refs
// jump across views by flipping to the forum and selecting a rail section.
let forumNav = null;
// The field mounts once with the overview and returns { select } — the memo's
// marginal Source marks steer it (bead vc-brain-4sg, acceptance ac-4).
let fieldNav = null;

async function fetchText(path) {
  try { const r = await fetch(path); return r.ok ? await r.text() : null; }
  catch { return null; }
}

async function fetchRun() {
  const files = {
    screen: 'screen.json', triage: 'triage.json', axes: 'axes.json', memo: 'memo.json',
    counsel: 'counsel.json',
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
  const c = state.counsel;
  if (c?.members) {
    // Operator verdict A (design/rooms/counsel-surface-mockups/operator-verdict.json):
    // the counsel overview card is the whisker card — presentational mean, then the
    // same band-first vocabulary the counsel view behind the click speaks.
    const CARD_NAME = { founder: 'founder', market: 'market', idea_vs_market: 'idea' };
    const convened = c.room?.convened !== false;
    const roomBadge = convened
      ? '<span class="sk-chip blue">room convened</span>'
      : '<span class="sk-chip warn">no room</span>';
    const mean = counselMean(c);
    const rows = OFFICE_ORDER.filter(k => c.members[k]).map(k => {
      const o = c.members[k];
      const [lo, hi] = o.band || [o.score, o.score];
      return `<div class="cc-row"><span class="cc-name">${CARD_NAME[k]}</span>
        <div class="whisker"><div class="whisker-track">
          <div class="whisker-band" style="left:${lo}%;width:${Math.max(0, hi - lo)}%"></div>
          <div class="whisker-dot" style="left:${o.score}%"></div></div></div>
        <span class="cc-score">${o.score}</span></div>`;
    }).join('');
    cards.push(`
    <button class="over-card" id="ov-axes" data-view="axes">
      <div class="ov-head"><span class="sk-label">the counsel</span>${roomBadge}</div>
      ${mean != null ? `<div class="cc-mean"><span class="cc-num">${mean}</span><span class="cc-of">/100</span>
        <span class="cc-cap">mean · presentational</span></div>` : ''}
      <div class="cc-rows">${rows}</div>
    </button>`);
  } else if (a) {
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

/* ── the generative field — the run's first face (bead vc-brain-ixz, nature
      verdict B). The overview wells demote to edge meters; the executing
      person-claim-room graph is the center; the detail well carries the
      selected node's cited record (field.js). Legacy 2-pole tapes have no
      seeded room, so they keep the card overview (renderOverview). ──────── */
function renderFieldOverview() {
  const s = state.screen, t = state.triage, adj = state.adjudication;
  const seeded = state.attendants?.attendants?.length;
  if (!seeded) { renderOverview(); return; }

  const serious = (s?.red_flags || []).filter(f => f.severity === 'serious');
  const c = state.counsel;
  const meters = [];
  if (s) meters.push(`
    <button class="meter" id="ov-screen" data-view="screen">
      <div class="m-name">screen</div>
      <div class="m-val" style="color:var(--${VERDICT_CLS[s.verdict] === 'warn' ? 'warn' : VERDICT_CLS[s.verdict] === 'ok' ? 'ok' : 'ink'})">${esc(s.verdict)}</div>
      <div class="m-sub">${(s.red_flags || []).length} flags · ${serious.length} serious</div>
    </button>`);
  if (t) meters.push(`
    <button class="meter" id="ov-triage" data-view="triage">
      <div class="m-name">triage</div>
      <div class="m-val">${(t.routed_checks || []).length} checks</div>
      <div class="m-sub">${(t.tensions || []).length} tensions · one crux</div>
    </button>`);
  meters.push(`
    <button class="meter" id="ov-forum" data-view="forum">
      <div class="m-name">forum</div>
      <div class="m-val">${seeded} seats</div>
      <div class="m-sub">${adj ? esc(adj.outcome || '') : 'the room'}</div>
    </button>`);
  if (c?.members) {
    const f = c.members.founder;
    const [lo, hi] = f?.band || [f?.score, f?.score];
    meters.push(`
    <button class="meter" id="ov-axes" data-view="axes">
      <div class="m-name">counsel</div>
      <div class="m-val">founder ${f?.score ?? '—'}</div>
      ${f ? `<span class="band-track"><span class="band-range" style="left:${lo}%;right:${100 - hi}%"></span><span class="band-marker" style="left:${f.score}%"></span></span>
      <div class="m-axis"><span>0</span><span>100</span></div>` : ''}
      <div class="m-sub" style="margin-top:5px">market ${c.members.market?.score ?? '—'} · idea ${c.members.idea_vs_market?.score ?? '—'}</div>
    </button>`);
  } else if (state.axes) {
    meters.push(`
    <button class="meter" id="ov-axes" data-view="axes">
      <div class="m-name">axes</div>
      <div class="m-val">founder ${state.axes.founder.score}</div>
      <div class="m-sub">${esc(state.axes.market.rating)} · ${esc(state.axes.idea_vs_market.verdict)}</div>
    </button>`);
  }
  const dec = state.memo?.decision;
  if (dec) meters.push(`
    <button class="meter" id="ov-memo" data-view="memo">
      <div class="m-name">memo</div>
      <div class="m-val" style="color:var(--${VERDICT_CLS[dec.recommendation] === 'warn' ? 'warn' : 'ink'})">${esc(dec.recommendation)}</div>
      <div class="m-sub">${(dec.conditions || []).length} conditions before wire</div>
    </button>`);

  $('#overview-grid').innerHTML = `
    <div class="runtime">
      <aside class="meters" aria-label="Overview meters">
        <div class="meters-cap">overview · meters</div>
        ${meters.join('')}
      </aside>
      <div id="field-mount"></div>
      <aside class="detail" id="field-detail" aria-label="Selected node record"></aside>
    </div>`;
  document.querySelectorAll('#overview-grid .meter').forEach(m =>
    m.addEventListener('click', () => setView(m.dataset.view)));

  fieldNav = mountField($('#field-mount'), $('#field-detail'), state, RUN,
    { onEnterForum: () => setView('forum') });
  if (!fieldNav) renderOverview();
}

/* ── legacy-tape notice (bead vc-brain-toe.4): the inverted pipeline writes
      triage.json; a pre-inversion tape does not, so
      it is gated out of the run-switcher and the corpus graph by build-corpus.py.
      The only way onto its overview is a direct ?run= link — so say plainly that
      this is a legacy tape rather than let it masquerade as a current run. ──── */
function renderLegacyNotice() {
  const host = $('#view-overview');
  host.querySelector('#legacy-notice')?.remove();
  if (state.triage) return; // inverted tape — nothing to flag
  const el = document.createElement('div');
  el.id = 'legacy-notice';
  el.className = 'legacy-notice';
  el.innerHTML = `<span class="sk-chip warn">legacy tape</span>
    <p><code class="mono">${esc(RUN)}</code> predates the inverted pipeline — it wrote no
      <code class="mono">triage.json</code>, so it is kept out of the run-switcher and the
      corpus graph. You reached it by direct link; its surfaces render from the tape as recorded.</p>`;
  host.insertBefore(el, host.firstChild);
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

/* ── counsel: the disconfabulation ladder as UI ──────────────────────────
   Replaces the axes card whenever a counsel.json is on the tape (COUNSEL.md
   §7.4); the axes view stays the fallback for tapes without one. Rung 1 is the
   presentational grand mean, computed HERE in view code (never persisted, never
   fed back — COUNSEL.md §3). Rung 2 is three band-first office readouts. Rung 3
   is each office's own record, one click down. Offices are read blind, so a
   disagreement line is manufactured only when they genuinely split. */
const OFFICE_ORDER = ['founder', 'market', 'idea_vs_market'];
const OFFICE_LABEL = { founder: 'Founder', market: 'Market', idea_vs_market: 'Idea vs Market' };

const counselScores = c => OFFICE_ORDER
  .map(k => c.members?.[k]?.score).filter(n => typeof n === 'number');
// The UI grand mean: per-office scores are already one-per-axis, so this is the
// mean over the three offices (COUNSEL.md §3 "average over the axes"). Rounded
// for display only.
const counselMean = c => {
  const s = counselScores(c);
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
};
const counselSpread = c => {
  const s = counselScores(c);
  return s.length ? Math.max(...s) - Math.min(...s) : 0;
};

// Open-question dedupe (counsel-audit finding). Each office's open_questions is
// marked "already a condition" (dims) when it near-duplicates a memo
// decision.condition, else "new ask" (full weight). HEURISTIC, stated plainly:
// lowercase, strip punctuation, drop short/stopword tokens, then take the max
// over conditions of  |question ∩ condition| / |question|  — the share of the
// question's content words already present in some condition. ≥ 0.30 ⇒ restated.
// On the real ferrite tape this separates cleanly (new asks ≤ 0.11, restatements
// ≥ 0.35), but it is a token-overlap PROXY, not semantic matching: a heavily
// reworded condition can still read as new, and a new ask that happens to share
// vocabulary can read as restated. Low-drama and auditable by design.
const OQ_STOP = new Set(('a an the of to for and or with on in into is are be as that this these those it '
  + 'its their whether two three per any not no if under over from at by one').split(' '));
const oqTokens = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter(w => w.length > 2 && !OQ_STOP.has(w));
const OQ_DUP_THRESHOLD = 0.30;
function oqProvenance(question, conditions) {
  const q = new Set(oqTokens(question));
  if (!q.size) return { dup: false, score: 0 };
  let best = 0;
  for (const c of conditions || []) {
    const ct = new Set(oqTokens(c));
    let hit = 0;
    for (const w of q) if (ct.has(w)) hit++;
    best = Math.max(best, hit / q.size);
  }
  return { dup: best >= OQ_DUP_THRESHOLD, score: best };
}

// position_refs cite the room. Resolution table:
//   seat-N/pre   → that seat's blind pre-interview page (entity view, PRE)
//   seat-N/post  → that seat's post-debate interview page (entity view, POST)
//   debate#turn-N → the forum's debate section, scrolled to that turn
//   debate       → the forum's debate section
//   adjudication → the forum's adjudication section
//   anything else → a plain, unlinked provenance chip
function counselPositionRef(ref) {
  const r = String(ref);
  const seat = r.match(/^(seat-\d+)\/(pre|post)$/);
  if (seat) {
    const s = (state.attendants?.attendants || []).find(x => x.id === seat[1] || x.slug === seat[1]);
    if (s) return `<button class="ref sig-ref entity-link" data-entity="person:${esc(s.slug)}" data-fn="${seat[2].toUpperCase()}">${esc(r)}</button>`;
    return `<span class="ref plain">${esc(r)}</span>`;
  }
  const deb = r.match(/^debate(?:#turn-(\d+))?$/);
  if (deb) return `<button class="ref counsel-goto" data-sec="debate"${deb[1] ? ` data-turn="${esc(deb[1])}"` : ''}>${esc(r)}</button>`;
  if (r === 'adjudication') return `<button class="ref counsel-goto" data-sec="adjudication">${esc(r)}</button>`;
  return `<span class="ref plain">${esc(r)}</span>`;
}

function officeChips(o) {
  return `<div class="axis-chips">
    ${o.trend ? `<span class="sk-chip">${TREND[o.trend] || ''} ${esc(o.trend)}</span>` : ''}
    ${o.confidence ? `<span class="sk-chip">conf ${esc(o.confidence)}</span>` : ''}
    ${o.cold_start ? '<span class="sk-chip blue">cold start</span>' : ''}
  </div>`;
}

// The band whisker — the PRIMARY readout (band first); the score is a
// subordinate diamond and a small secondary number.
function officeWhisker(o) {
  const [lo, hi] = o.band || [o.score, o.score];
  return `<div class="whisker">
    <div class="whisker-track">
      <div class="whisker-band" style="left:${lo}%;width:${Math.max(0, hi - lo)}%"></div>
      <div class="whisker-dot" style="left:${o.score}%"></div>
    </div>
    <div class="whisker-scale"><span class="w-band">band ${lo}–${hi}</span><span class="w-score">score ${o.score}</span></div>
  </div>`;
}

// The office record (rung 3), shared by the counsel view's expanded office and
// the forum rail's counsel leaves.
function officeRecord(o, conditions) {
  const prov = o.position_refs || [];
  const oqs = (o.open_questions || []).map(q => {
    const { dup } = oqProvenance(q, conditions);
    return `<li class="oq ${dup ? 'oq-dup' : ''}">
      <span class="oq-mark ${dup ? 'is-dup' : 'is-new'}">${dup ? 'already a condition' : 'new ask'}</span>
      <span class="oq-body">${inline(q)}</span></li>`;
  }).join('');
  const dev = o.deviation || {};
  return `
    ${o.room_effect ? `<div class="rec-block"><span class="sk-label">room effect — what the seats did to this rating</span>
      <p>${inline(o.room_effect)}</p></div>` : ''}
    ${(o.evidence_refs || []).length ? `<div class="rec-block"><span class="sk-label">evidence on the record</span>
      <div class="axis-chips">${o.evidence_refs.map(r => `<span class="ref sig-ref" data-sig="${esc(r)}">${esc(r)}</span>`).join(' ')}</div></div>` : ''}
    ${prov.length ? `<div class="rec-block"><span class="sk-label">where in the room — seats, debate turns, the verdict</span>
      <div class="prov-links">${prov.map(counselPositionRef).join(' ')}</div></div>` : ''}
    ${(o.mandate_refs || []).length ? `<div class="rec-block"><span class="sk-label">mandate fields that shaped it</span>
      <div class="axis-chips">${o.mandate_refs.map(m => `<span class="sk-chip">${esc(m)}</span>`).join(' ')}</div></div>` : ''}
    <div class="rec-block"><span class="sk-label">mandate deviation</span>
      ${dev.declared
        ? `<div class="axis-chips"><span class="sk-chip warn">declared deviation</span></div><p>${inline(dev.note || '')}</p>`
        : '<p class="axis-notes">rated in line with the mandate — no declared deviation.</p>'}</div>
    ${(o.coverage_challenges || []).length ? `<div class="rec-block"><span class="sk-label">what the room did not test</span>
      <ul class="chall-list">${o.coverage_challenges.map(c => `<li>${inline(c)}</li>`).join('')}</ul></div>` : ''}
    ${oqs ? `<div class="rec-block"><span class="sk-label">open questions — the cheapest decisive checks</span>
      <ul class="oq-list">${oqs}</ul></div>` : ''}
    ${o.notes ? `<div class="rec-block"><span class="sk-label">how the office read it</span><p class="axis-notes">${inline(o.notes)}</p></div>` : ''}`;
}

// Forum rail descriptor: the counsel as a dropdown group, one leaf per office.
function counselRailSection() {
  const c = state.counsel;
  const conditions = state.memo?.decision?.conditions || [];
  const children = OFFICE_ORDER.filter(k => c.members?.[k]).map(k => {
    const o = c.members[k];
    const [lo, hi] = o.band || [o.score, o.score];
    return {
      id: `counsel/${k}`, label: OFFICE_LABEL[k],
      mount: h => {
        h.innerHTML = fieldCard(
          `counsel · ${esc(OFFICE_LABEL[k])} office — score ${o.score}/100, band ${lo}–${hi}`,
          o.confidence ? `<span class="sk-chip">conf ${esc(o.confidence)}</span>` : '',
          `<div class="office-record" style="border-top:0;margin-top:0;padding-top:0">${officeRecord(o, conditions)}</div>`);
      },
    };
  });
  return { id: 'counsel', kind: 'group', label: 'Counsel — three offices', children };
}

function renderCounsel() {
  const c = state.counsel;
  if (!c?.members) return;
  const conditions = state.memo?.decision?.conditions || [];
  const room = c.room || {};
  const convened = room.convened !== false;
  const mean = counselMean(c);
  const spread = counselSpread(c);
  const offices = OFFICE_ORDER.filter(k => c.members[k]).map(k => {
    const o = c.members[k];
    return `<details class="office" data-office="${k}">
      <summary>
        <div class="office-head"><span class="office-name">${esc(OFFICE_LABEL[k])}</span>
          <span class="office-score"><b>${o.score}</b>/100</span></div>
        ${officeWhisker(o)}
        ${officeChips(o)}
        <span class="office-open-cue"></span>
      </summary>
      <div class="office-record">${officeRecord(o, conditions)}</div>
    </details>`;
  }).join('');
  const roomBadge = convened
    ? '<span class="sk-chip blue">room convened</span>'
    : '<span class="sk-chip warn">room not convened — degraded reading</span>';
  // Disagreement line renders ONLY when the offices genuinely split (score
  // spread > 20). Ferrite's spread is 17, so it stays silent — the mean is
  // honest here and we do not manufacture a disagreement to look rigorous.
  const scores = counselScores(c);
  const disagree = convened && spread > 20 ? `
    <div class="disagreement"><span class="sk-label">the offices disagree — the mean hides it</span>
      <p>The three offices span ${Math.min(...scores)}–${Math.max(...scores)} — a ${spread}-point spread. Read the bands, not the average.</p></div>` : '';
  $('#axes').innerHTML = `
    <div class="card-head"><span class="sk-label">the counsel — three offices, read blind</span>
      <span class="rule"></span>${roomBadge}</div>
    ${!convened ? `<div class="counsel-degraded"><span class="sk-chip warn">no room</span>
      <p>${room.note ? inline(room.note) : 'No room convened — the offices projected the record alone. Read the bands wide; confidence is capped.'}</p></div>` : ''}
    ${convened && room.note ? `<p class="axis-notes" style="margin-bottom:16px">${inline(room.note)}</p>` : ''}
    ${mean != null ? `<div class="counsel-mean">
      <span class="mean-num">${mean}<span class="of">/100</span></span>
      <div><div class="sk-label">counsel mean — presentational</div>
        <p class="mean-cap">The average of the three office scores, shown for the eye only — it is never saved and never fed back into the pipeline. Open any office below for its band, its record, and the seats it rests on.</p></div>
    </div>` : ''}
    <div class="office-grid">${offices}</div>
    ${disagree}`;
  show($('#axes'));
}

/* ── forum ────────────────────────────────────────────────────────────── */
const MOVE_CLS = { conceded: 'ok', refined: 'warn', held: '' };
const LEAN_CLS = { for: 'ok', against: 'bad', 'genuinely-split': 'warn' };

// A work-field cell: a titled slab wrapping one section's content. Prose sits
// in a milled inlay (skins/alu quiet-cavity law, taste-043), never a plate.
const fieldCard = (label, chip, inner) => `
  <div class="run-card">
    <div class="card-head"><span class="sk-label">${label}</span><span class="rule"></span>
      ${chip || ''}</div>
    ${inner}</div>`;

// Forum view (taste-097 structure rail). The room's sections become a
// DATA-DRIVEN rail (forum-shell.js); selecting one mounts it into the work
// field host. Adjudication is the resting section (taste-085); the debate
// transcript and each seat's blind pre / post-debate interviews are rail nodes,
// collapsed until chosen. Adding a section (a coming `counsel` stage) is a data
// change here — push a descriptor — never a re-layout (memo wt-001).
function renderForum() {
  const host = $('#view-forum');
  // Seeded room (new contract): persons seated first, per-seat pre/post.
  if (state.attendants?.attendants?.length) return renderSeededForum(host);
  // Legacy 2-pole tape: bull/bear case + debate + post files + adjudication.
  const has = {
    bull: !!state.bull, bear: !!state.bear, debate: !!state.debate,
    postBull: !!state.postBull, postBear: !!state.postBear, adj: !!state.adjudication,
  };
  if (!has.adj && !has.bull && !has.bear && !has.debate && !has.postBull && !has.postBear)
    return renderNoForum(host);
  const sections = [];
  if (has.adj) sections.push({ id: 'adjudication', label: 'Adjudication',
    mount: h => { h.innerHTML = fieldCard('adjudication — the room’s typed verdict',
      `<span class="sk-chip blue">${esc(state.adjudication.outcome)}</span>`,
      `<div class="forum-adj memo-body">${forumPanel('adjudication')}</div>`); } });
  if (has.bull) sections.push({ id: 'bull', label: 'Bull case',
    mount: h => { h.innerHTML = fieldCard('bull case — blind pre-interview', '',
      `<div class="memo-body">${md(state.bull)}</div>`); } });
  if (has.bear) sections.push({ id: 'bear', label: 'Bear case',
    mount: h => { h.innerHTML = fieldCard('bear case — blind pre-interview', '',
      `<div class="memo-body">${md(state.bear)}</div>`); } });
  if (has.debate) sections.push({ id: 'debate', label: 'Debate transcript',
    badge: parseDebate(state.debate).turns.length,
    mount: h => { h.innerHTML = fieldCard('debate transcript — the moderated record', '',
      `<div class="memo-body">${forumPanel('debate')}</div>`); } });
  if (has.postBull) sections.push({ id: 'post-bull', label: 'Bull — post-debate',
    mount: h => { h.innerHTML = fieldCard('bull — post-debate interview', '',
      `<div class="memo-body">${md(state.postBull)}</div>`); } });
  if (has.postBear) sections.push({ id: 'post-bear', label: 'Bear — post-debate',
    mount: h => { h.innerHTML = fieldCard('bear — post-debate interview', '',
      `<div class="memo-body">${md(state.postBear)}</div>`); } });
  forumNav = mountForumShell(host, {
    title: `${RUN} — forum`, outcome: state.adjudication?.outcome, sections,
    initialId: has.adj ? 'adjudication' : undefined,
  });
}

// The room now convenes for every advancing screen with a live crux — it is the
// reference space the axes later project. Only a reject screen or a blank triage
// crux skips it (mechanical gate); there is no "reserved for contested" story.
function renderNoForum(host) {
  const s = state.screen, t = state.triage;
  const hasCrux = t ? !!(t.crux || '').trim() : undefined;
  const reason = s?.verdict === 'reject'
    ? 'the screen returned a <strong>reject</strong> verdict — a reject skips the room.'
    : hasCrux === false
      ? 'triage returned a <strong>blank crux</strong> — with no judgment fork to press, the room is skipped.'
      : 'no forum artifacts were written for this run.';
  host.innerHTML = `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">forum</span><span class="rule"></span>
        <span class="sk-chip">room not convened</span></div>
      <div class="memo-body"><p>The forum seats named voices on the crux, then adjudicates. It convenes
        for every advancing screen with a live crux; here, ${reason}</p></div></div>`;
}

function renderSeededForum(host) {
  const seed = state.attendants, adj = state.adjudication;
  const evByHandle = new Map((adj?.evolution || []).map(e => [e.attendant, e]));
  const sections = [];
  if (adj) sections.push({ id: 'adjudication', label: 'Adjudication',
    mount: h => { h.innerHTML = fieldCard('adjudication — the room’s typed verdict',
      `<span class="sk-chip blue">${esc(adj.outcome)}</span>`,
      `${seed.crux_restatement ? `<div class="sk-label">crux the room pressed</div>
        <p class="field-lede">${inline(seed.crux_restatement)}</p>` : ''}
       <div class="forum-adj memo-body">${forumPanel('adjudication')}</div>`); } });
  // Counsel rides the rail between the verdict and the transcript — judgment
  // downstream of the room, weeds (the seats) last (memo wt-001: a data push,
  // not a re-layout). Three offices as a dropdown group, one leaf each.
  if (state.counsel?.members) sections.push(counselRailSection());
  if (state.debate) sections.push({ id: 'debate', label: 'Debate transcript',
    badge: parseDebate(state.debate).turns.length,
    mount: h => { h.innerHTML = fieldCard('debate transcript — the moderated record', '',
      `<div class="memo-body">${forumPanel('debate')}</div>`); } });
  // Each seat is a dropdown group; its blind pre / post-debate interviews are
  // the selectable leaves that mount into the field.
  for (const a of seed.attendants) {
    const ev = evByHandle.get(a.handle);
    const children = [];
    if (state.pre?.[a.id]) children.push({ id: `${a.id}/pre`, label: 'blind pre-interview',
      mount: h => { h.innerHTML = fieldCard(`${esc(a.handle)} · ${esc(a.id)} — blind pre-interview`,
        a.opening_lean ? `<span class="sk-chip ${LEAN_CLS[a.opening_lean] || ''}">lean ${esc(a.opening_lean)}</span>` : '',
        `<div class="memo-body">${md(state.pre[a.id])}</div>`); } });
    if (state.post?.[a.id]) children.push({ id: `${a.id}/post`, label: 'post-debate interview',
      mount: h => { h.innerHTML = fieldCard(`${esc(a.handle)} · ${esc(a.id)} — post-debate interview`,
        ev?.movement ? `<span class="sk-chip ${MOVE_CLS[ev.movement] ?? ''}">${esc(ev.movement)}</span>` : '',
        `<div class="memo-body">${md(state.post[a.id])}</div>`); } });
    if (children.length) sections.push({ id: a.id, kind: 'group', label: `${a.handle} · ${a.id}`, children });
  }
  forumNav = mountForumShell(host, {
    title: `${RUN} — forum`, outcome: adj?.outcome, sections,
    initialId: adj ? 'adjudication' : undefined,
    note: 'seats are AI-simulated counterfactual personas of public figures — not their real views or participation',
  });
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
      <div class="turn" id="debate-turn-${t.n}">
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
// Memo verdict A (bead vc-brain-4sg, design/rooms/memo-surface/operator-
// verdict.json): the body is the woven document — cited prose in a lawful
// measure, every price in one fixed marginal channel, decision band opening,
// deal-named header. The claim-ledger fork (B) is retired. memo-doc.js owns
// the weave; a marginal Source mark steers the overview field to that
// signal's record, which is where the evidence surface already lives.
function renderMemo() {
  const ok = renderMemoDoc($('#memo'), state, {
    onEvidence: sid => {
      if (fieldNav?.select(`sig:${sid}`)) { setView('overview'); return; }
      // Evidence with no node on the field (the application itself) is read
      // where it was screened — never a dead link, never a silent no-op.
      setView('screen');
    },
  });
  if (ok) show($('#memo'));
}

/* ── ref navigation ───────────────────────────────────────────────────── */
function wireRefs() {
  document.addEventListener('click', e => {
    const ref = e.target.closest('.ref');
    if (!ref) return;
    // A signal ref goes to that signal's record on the field — the same
    // target the memo's marginal Source marks use (bead vc-brain-4sg). The
    // claim-card grid it used to scroll to is gone with memo verdict A.
    if (ref.dataset.sig) {
      if (fieldNav?.select(`sig:${ref.dataset.sig}`)) setView('overview');
      return;
    }
    const target = ref.dataset.claim
      ? document.getElementById(`claim-${ref.dataset.claim}`) : null;
    if (!target) return;
    setView('memo');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1600);
  });
}

/* ── counsel room-jumps: a debate/adjudication position-ref flips to the forum
      view and selects that rail section (scrolling to the cited turn). Seat
      refs are entity-links, routed by the terminal delegate instead. ─────── */
function wireCounselNav() {
  document.addEventListener('click', e => {
    const go = e.target.closest('.counsel-goto');
    if (!go) return;
    setView('forum');
    forumNav?.select(go.dataset.sec);
    if (go.dataset.turn) {
      // the shell mounts the debate synchronously; let the view swap settle,
      // then bring the cited turn into view.
      setTimeout(() => document.getElementById(`debate-turn-${go.dataset.turn}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    }
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
  document.querySelectorAll('#view-overview .over-card, #view-overview .run-card, #view-overview .meter')
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
  // renderForum first so the shell's { select } is captured before the counsel
  // view's room-jumps can use it. Counsel supersedes axes when on the tape.
  renderForum();
  if (state.counsel?.members) renderCounsel(); else renderAxes();
  renderMemo();
  renderFieldOverview(); renderLegacyNotice(); renderRecommendation();
  wireRefs(); wireCounselNav();
}
bootTerminal({ setView, run: RUN });
setView(new URLSearchParams(location.search).get('view') || 'overview', { push: false, animate: false });
