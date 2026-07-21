// Entity pages — one renderer per entity type, each page an entity×function.
// Every gsig-* chip, person name, and forum reference is a link (delegated
// in terminal.js); citations must stay one click from their evidence.
import { md, inline, esc, parseDebate } from './md.js?v=2026-07-21-2';

const LEAN_CLS = { for: 'ok', against: 'bad', 'genuinely-split': 'warn' };
const MOVE_CLS = { conceded: 'ok', refined: 'warn', held: '' };

const chip = (text, cls = '') => `<span class="sk-chip ${cls}">${esc(text)}</span>`;
const personLink = (name, slug) =>
  `<button class="sk-chip blue entity-link" data-entity="person:${esc(slug)}">${esc(name)}</button>`;
const sigChip = sid => `<span class="ref sig-ref" data-sig="${esc(sid)}">${esc(sid)}</span>`;

async function fetchText(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

function tabs(entity, fns, active) {
  return `<div class="tab-row">${fns.map(f =>
    `<button class="sk-btn tab-btn" data-entity="${esc(entity.id)}" data-fn="${f}"
             aria-pressed="${String(f === active)}">${f}</button>`).join('')}</div>`;
}

// Render generation — an awaited doc fetch must not write into a page that
// a later navigation has already replaced (#entity-doc is a shared id).
let gen = 0;

/* ── person ───────────────────────────────────────────────────────────── */
async function personPage(root, p, fn, corpus, fresh) {
  const forum = corpus.byId.get(p.forum);
  const head = `
    <div class="entity-head">
      <div class="hero-row">
        <span class="hero-name">${esc(p.name)}</span>
        ${p.seat ? chip(p.seat) : ''}
        ${p.suggested ? chip('suggested attendant', 'warn') : ''}
        ${p.opening_lean ? chip(`lean ${p.opening_lean}`, LEAN_CLS[p.opening_lean] ?? '') : ''}
        ${p.movement ? chip(p.movement, MOVE_CLS[p.movement] ?? '') : ''}
      </div>
      ${p.lens ? `<p class="hero-oneliner">${esc(p.lens)}</p>` : ''}
      ${p.seat ? `<p class="axis-notes">AI-simulated counterfactual persona of a public figure — not their real views or participation</p>` : ''}
      <div class="axis-chips">
        ${forum ? `<button class="sk-chip ok entity-link" data-entity="${esc(forum.id)}">${esc(forum.name)}</button>` : ''}
        ${(p.evidence_refs || []).map(sigChip).join(' ')}
      </div>
    </div>`;

  if (p.suggested) {
    root.innerHTML = `${head}
      <div class="run-card">
        <div class="card-head"><span class="sk-label">named gap — why the room wants this voice</span><span class="rule"></span></div>
        <p>${inline(p.named_gap || '')}</p>
        <p class="axis-notes">Proposed in the adjudication's suggested-attendants block; not yet seated, no interviews on record.</p>
      </div>`;
    return;
  }

  const body = fn === 'DES' ? `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">invitation — ${esc(p.invitation?.invited_by || '')}</span><span class="rule"></span></div>
      <p>${inline(p.invitation?.reason || '')}</p>
    </div>
    <div class="run-card">
      <div class="card-head"><span class="sk-label">mandate</span><span class="rule"></span></div>
      <p>${inline(p.mandate || '')}</p>
      ${p.decisive_question ? `<div class="sk-label">decisive question</div><p>${inline(p.decisive_question)}</p>` : ''}
      ${p.residual ? `<div class="sk-label">residual position</div>
        <p class="axis-notes">${inline(p.residual.fork)}</p><p>${inline(p.residual.position)}</p>` : ''}
      ${p.movement ? `<div class="axis-chips">
          ${chip(`post-debate: ${p.movement}`, MOVE_CLS[p.movement] ?? '')}
          ${(p.movement_turns || []).map(t => chip(`turn ${t}`)).join('')}
        </div>` : ''}
    </div>` : `
    <div class="run-card"><div id="entity-doc" class="memo-body">
      <p class="sk-label">loading ${fn === 'PRE' ? 'pre-interview' : 'post-interview'}…</p>
    </div></div>`;

  root.innerHTML = head + tabs(p, ['DES', 'PRE', 'POST'], fn) + body;

  if (fn === 'PRE' || fn === 'POST') {
    const text = await fetchText(fn === 'PRE' ? p.pre : p.post);
    if (!fresh()) return; // navigated away while the fetch was in flight
    const doc = root.querySelector('#entity-doc');
    if (doc) doc.innerHTML = text ? md(text)
      : `<p class="muted">no ${fn.toLowerCase()}-interview on record for ${esc(p.name)}</p>`;
  }
}

/* ── forum ────────────────────────────────────────────────────────────── */
async function forumPage(root, f, fn, corpus, fresh) {
  const adj = f.adjudication;
  const head = `
    <div class="entity-head">
      <div class="hero-row">
        <span class="hero-name">${esc(f.name)}</span>
        ${adj ? chip(adj.outcome, 'blue') : ''}
      </div>
      <p class="hero-oneliner">${esc((f.crux || '').slice(0, 220))}</p>
    </div>`;

  let body = '';
  if (fn === 'DES') {
    body = `
      <div class="run-card">
        <div class="card-head"><span class="sk-label">crux</span><span class="rule"></span>
          ${f.run ? `<button class="sk-chip blue entity-link" data-entity="run:${esc(f.run)}" data-fn="OPEN">open run ${esc(f.run)} →</button>` : ''}</div>
        <p>${inline(f.crux || '')}</p>
        ${f.room_note ? `<div class="sk-label">room note</div><p class="axis-notes">${inline(f.room_note)}</p>` : ''}
      </div>
      <div class="run-card">
        <div class="card-head"><span class="sk-label">attendants — seated via invitation, evidence-grounded</span><span class="rule"></span></div>
        <div class="roster-grid">${f.roster.map(id => {
          const p = corpus.byId.get(id);
          return `<button class="over-card entity-link" data-entity="${esc(p.id)}">
            <div class="ov-head"><span class="sk-label">${esc(p.seat || '')}</span>
              ${p.movement ? chip(p.movement, MOVE_CLS[p.movement] ?? '') : ''}</div>
            <div class="roster-name">${esc(p.name)}</div>
            <p>${esc(p.lens || '')}</p>
          </button>`;
        }).join('')}</div>
        ${f.suggested.length ? `<div class="sk-label" style="margin-top:14px">suggested attendants</div>
          <div class="axis-chips">${f.suggested.map(id => {
            const p = corpus.byId.get(id);
            return personLink(p.name, p.slug);
          }).join('')}</div>` : ''}
      </div>
      ${f.docs.length ? `<div class="run-card">
        <div class="card-head"><span class="sk-label">record</span><span class="rule"></span></div>
        <div class="axis-chips">${f.docs.map(d =>
          `<button class="sk-chip entity-link" data-entity="doc:${esc(d.id)}">${esc(d.title)}</button>`).join('')}
        </div></div>` : ''}`;
  } else if (fn === 'DEB') {
    body = `<div class="run-card"><div id="entity-doc" class="memo-body">
      <p class="sk-label">loading debate…</p></div></div>`;
  } else if (fn === 'ADJ') {
    body = adj ? `<div class="run-card"><div class="memo-body">${adjudicationHTML(adj, f, corpus)}</div></div>`
      : `<div class="run-card"><p class="muted">no adjudication on record</p></div>`;
  }

  root.innerHTML = head + tabs(f, ['DES', 'DEB', 'ADJ'], fn) + body;

  if (fn === 'DEB') {
    const text = await fetchText(f.debate || `${f.path}/debate.md`);
    if (!fresh()) return; // navigated away while the fetch was in flight
    const doc = root.querySelector('#entity-doc');
    if (!doc) return;
    if (!text) { doc.innerHTML = '<p class="muted">no debate transcript on record</p>'; return; }
    const bySeat = new Map(f.roster.map(id => {
      const p = corpus.byId.get(id);
      return [p.seat, p];
    }));
    const { turns } = parseDebate(text);
    doc.innerHTML = turns.map(t => {
      const p = bySeat.get(t.speaker);
      const who = p
        ? personLink(p.name, p.slug)
        : chip(t.speaker, t.speaker === 'moderator' ? '' : 'blue');
      return `
      <div class="turn">
        <div class="turn-side">${who}<span class="turn-n">turn ${t.n} · ${esc(t.type)}</span></div>
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
}

function adjudicationHTML(adj, f, corpus) {
  const byHandle = new Map(f.roster.map(id => corpus.byId.get(id)).map(p => [p.name, p]));
  const who = handle => byHandle.has(handle)
    ? personLink(handle, byHandle.get(handle).slug) : chip(handle);
  return `
    <div class="axis-chips">${chip(adj.outcome, 'blue')}</div>
    <h4>Converged actions</h4>
    <ul class="adj-list">${(adj.converged || []).map(c =>
      `<li>${chip(`turn ${c.turn}`, 'ok')}<span>${inline(c.action)}</span></li>`).join('')}</ul>
    ${adj.residual?.length ? `<h4>Residual fork</h4>${adj.residual.map(r => `
      <p>${inline(r.fork)}</p>
      <div class="poles">${(r.positions || []).map(p => `
        <div class="pole">${who(p.attendant)}<p>${inline(p.position)}</p></div>`).join('')}
      </div>`).join('')}` : ''}
    ${adj.instrument?.length ? `<h4>Instrument</h4><ul class="adj-list">${adj.instrument.map(i =>
      `<li>${i.for_fork ? chip(i.for_fork.slice(0, 60)) : ''}<span>${inline(i.move)}</span></li>`).join('')}</ul>` : ''}
    ${adj.evolution?.length ? `<h4>Position evolution</h4><ul class="adj-list">${adj.evolution.map(e =>
      `<li>${who(e.attendant)}${chip(e.movement, MOVE_CLS[e.movement] ?? '')}
        <span class="ref plain">${(e.turns || []).map(t => `turn ${t}`).join(', ')}</span></li>`).join('')}</ul>` : ''}
    ${adj.suggested_attendants?.length ? `<h4>Suggested attendants</h4><ul class="adj-list">${adj.suggested_attendants.map(s =>
      `<li>${who(s.handle)}<span>${inline(s.named_gap)}</span></li>`).join('')}</ul>` : ''}
    ${adj.authority_note ? `<p class="axis-notes">${inline(adj.authority_note)}</p>` : ''}`;
}

/* ── signal ───────────────────────────────────────────────────────────── */
function signalPage(root, s, corpus) {
  const forum = corpus.byId.get(s.forum);
  const citers = (s.cited_by || [])
    .map(slug => corpus.byId.get(`person:${slug}`)).filter(Boolean);
  root.innerHTML = `
    <div class="entity-head">
      <div class="hero-row">
        <span class="hero-name mono">${esc(s.sid)}</span>
        ${chip(s.trust_tier || 'unrated')}
        ${chip(s.authority || '')}
        ${s.pull && s.pull !== 'neutral' ? chip(`pull ${s.pull}`, s.pull === 'for' ? 'ok' : 'bad') : ''}
      </div>
    </div>
    <div class="run-card">
      <div class="card-head"><span class="sk-label">signal — ${esc(s.source || '')}${s.observed_at ? ` · observed ${esc(s.observed_at)}` : ''}</span><span class="rule"></span></div>
      <p>${inline(s.summary || '')}</p>
      ${s.raw_refs.length ? `<div class="sk-label">raw refs</div>
        <ul class="dil-list">${s.raw_refs.map(r => `<li><code class="mono">${esc(r)}</code></li>`).join('')}</ul>` : ''}
      ${s.merged_from.length ? `<div class="axis-chips">${s.merged_from.map(m => chip(`merged: ${m}`)).join('')}</div>` : ''}
    </div>
    <div class="run-card">
      <div class="card-head"><span class="sk-label">cited by — seats whose mandate leans on this signal</span><span class="rule"></span></div>
      ${citers.length ? `<div class="axis-chips">${citers.map(p => personLink(p.name, p.slug)).join('')}</div>`
        : '<p class="muted">not load-bearing in any seat’s mandate — cited only inside interview or debate text</p>'}
      ${forum ? `<p class="axis-notes" style="margin-top:10px">forum:
        <button class="sk-chip ok entity-link" data-entity="${esc(forum.id)}">${esc(forum.name)}</button></p>` : ''}
    </div>`;
}

/* ── doc ──────────────────────────────────────────────────────────────── */
async function docPage(root, d, fresh) {
  root.innerHTML = `
    <div class="entity-head"><div class="hero-row">
      <span class="hero-name">${esc(d.name)}</span></div>
      <p class="hero-oneliner mono">${esc(d.sub || '')}</p></div>
    <div class="run-card"><div id="entity-doc" class="memo-body">
      <p class="sk-label">loading…</p></div></div>`;
  const text = await fetchText(d.path);
  if (!fresh()) return; // navigated away while the fetch was in flight
  const doc = root.querySelector('#entity-doc');
  if (doc) doc.innerHTML = text ? md(text) : '<p class="muted">document unavailable</p>';
}

/* ── run ──────────────────────────────────────────────────────────────── */
function runPage(root, r) {
  root.innerHTML = `
    <div class="entity-head"><div class="hero-row">
      <span class="hero-name mono">${esc(r.name)}</span>${chip('pipeline run')}</div>
      <p class="hero-oneliner">${esc(r.sub || '')}</p></div>
    <div class="run-card">
      <p>Runs open in the viewer itself — screen, triage, forum, axes, memo on this run's outputs.</p>
      <div class="axis-chips"><button class="sk-chip blue entity-link"
        data-entity="${esc(r.id)}" data-fn="OPEN">OPEN ${esc(r.name)}</button></div>
    </div>`;
}

/* ── dispatch ─────────────────────────────────────────────────────────── */
export function renderEntity(root, entity, fn, corpus) {
  fn = fn || 'DES';
  const g = ++gen;
  const fresh = () => g === gen;
  if (entity.type === 'person') return personPage(root, entity, fn, corpus, fresh);
  if (entity.type === 'forum') return forumPage(root, entity, fn, corpus, fresh);
  if (entity.type === 'signal') return signalPage(root, entity, corpus);
  if (entity.type === 'doc') return docPage(root, entity, fresh);
  if (entity.type === 'run') return runPage(root, entity);
  root.innerHTML = `<div class="run-card"><p class="muted">no page for entity type
    <code class="mono">${esc(entity.type)}</code></p></div>`;
}
