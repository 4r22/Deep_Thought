// Terminal layer: universal entity index + ⌘K palette + Bloomberg-style
// <entity> <FUNCTION> command grammar + router. The grammar is a clean-room
// reimplementation of the terminal interaction *pattern* (entity keys ×
// function mnemonics); entities here are vc-brain's own corpus — persons,
// forums, evidence signals, runs, docs — never market data.
import { esc } from './md.js?v=2026-07-21-2';
import { renderEntity } from './entity.js?v=2026-07-21-2';
import { mountGraph } from './graph.js?v=2026-07-21-2';

const $ = sel => document.querySelector(sel);

/* ── function mnemonics per entity type; first = default ──────────────── */
const FUNCS = {
  person: ['DES', 'PRE', 'POST', 'NET'],
  forum: ['DES', 'DEB', 'ADJ', 'NET'],
  signal: ['DES'],
  run: ['OPEN'],
  doc: ['DES'],
};
const FUNC_WORDS = new Set(Object.values(FUNCS).flat().concat(['NET', 'HELP']));
const FUNC_HELP = [
  ['DES', 'describe — the entity profile page'],
  ['PRE', 'person — blind pre-interview document'],
  ['POST', 'person — post-debate interview document'],
  ['DEB', 'forum — moderated debate transcript'],
  ['ADJ', 'forum — typed adjudication'],
  ['NET', 'network graph (global, or centred on the entity)'],
  ['OPEN', 'run — open the pipeline run in the viewer'],
  ['HELP', 'this page'],
];

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ── corpus load: manifest → forum seeds/adjudications/evidence → index ── */
export const corpus = { entities: [], byId: new Map(), forums: [], ready: null };

async function fetchJSON(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function fetchText(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

function addEntity(e) {
  corpus.entities.push(e);
  corpus.byId.set(e.id, e);
}

async function loadCorpus() {
  const manifest = await fetchJSON('./corpus.json')
    || { runs: [], forums: [] };

  for (const runName of manifest.runs || []) {
    addEntity({
      id: `run:${runName}`, type: 'run', name: runName,
      sub: 'pipeline run — screen · triage · forum · axes · memo',
      hay: `${runName} run pipeline`,
    });
  }

  await Promise.all((manifest.forums || []).map(addForum));
}

// Load one forum (research or run layout) into the corpus. Returns the forum
// entity, or null when no seed manifest is on disk. Factored out of loadCorpus
// so the network view can lazily register the CURRENT run's room on demand
// (bead vc-brain-toe.2) using the exact same person model.
async function addForum(f) {
    // Two forum layouts, one person model. Research forums live under
    // research/<name>/forum with seed.json / adjudication.json / pre|post/<slug>.md.
    // Real-deal run rooms (bead vc-brain-26w) live in a run's out dir with
    // forum-attendants.json / forum-adjudication.json / forum-<seat>.md — the
    // seed schema is identical, only the filenames differ.
    const runLayout = f.layout === 'run';
    const [seed, adjudication, evidence] = await Promise.all([
      fetchJSON(`${f.path}/${runLayout ? 'forum-attendants.json' : 'seed.json'}`),
      fetchJSON(`${f.path}/${runLayout ? 'forum-adjudication.json' : 'adjudication.json'}`),
      f.evidence ? fetchJSON(f.evidence) : null,
    ]);
    if (!seed) return null;
    const forum = {
      id: `forum:${f.id}`, type: 'forum', key: f.id, name: f.title || f.id,
      path: f.path, crux: seed.crux_restatement, room_note: seed.room_note,
      adjudication, roster: [], suggested: [], docs: f.docs || [],
      layout: runLayout ? 'run' : 'research', run: f.run || null,
      debate: `${f.path}/${runLayout ? 'forum-debate.md' : 'debate.md'}`,
      sub: (seed.crux_restatement || '').slice(0, 110),
      hay: `${f.id} ${f.title || ''} ${f.run || ''} forum crux debate room`,
    };
    corpus.forums.push(forum);
    addEntity(forum);

    const evolutionByHandle = new Map((adjudication?.evolution || [])
      .map(ev => [ev.attendant, ev]));
    const residualByHandle = new Map((adjudication?.residual || [])
      .flatMap(r => (r.positions || []).map(p => [p.attendant, { fork: r.fork, position: p.position }])));

    for (const a of seed.attendants || []) {
      const ev = evolutionByHandle.get(a.handle);
      addEntity({
        id: `person:${a.slug}`, type: 'person', slug: a.slug, name: a.handle,
        seat: a.id, forum: forum.id, lens: a.lens, mandate: a.mandate,
        invitation: a.invitation, evidence_refs: a.evidence_refs || [],
        decisive_question: a.decisive_question, opening_lean: a.opening_lean,
        movement: ev?.movement, movement_turns: ev?.turns,
        residual: residualByHandle.get(a.handle),
        pre: runLayout ? `${f.path}/forum-${a.id}.md` : `${f.path}/pre/${a.slug}.md`,
        post: runLayout ? `${f.path}/forum-post-${a.id}.md` : `${f.path}/post/${a.slug}.md`,
        sub: a.lens, hay: `${a.handle} ${a.slug} ${a.lens} person attendant`,
      });
      forum.roster.push(`person:${a.slug}`);
    }

    for (const s of adjudication?.suggested_attendants || []) {
      const slug = slugify(s.handle);
      if (corpus.byId.has(`person:${slug}`)) continue;
      addEntity({
        id: `person:${slug}`, type: 'person', slug, name: s.handle,
        forum: forum.id, suggested: true, named_gap: s.named_gap,
        sub: `suggested attendant — ${s.named_gap.slice(0, 90)}`,
        hay: `${s.handle} ${slug} suggested attendant person`,
      });
      forum.suggested.push(`person:${slug}`);
    }

    for (const sig of evidence?.signals || []) {
      addEntity({
        id: `signal:${sig.id}`, type: 'signal', sid: sig.id, name: sig.id,
        forum: forum.id, summary: sig.summary, trust_tier: sig.trust_tier,
        authority: sig.authority, pull: sig.pull, source: sig.source,
        raw_refs: sig.raw_refs || [], observed_at: sig.observed_at,
        merged_from: sig.merged_from || [],
        cited_by: (seed.attendants || [])
          .filter(a => (a.evidence_refs || []).includes(sig.id)).map(a => a.slug),
        sub: sig.summary.slice(0, 110),
        hay: `${sig.id} ${sig.summary} signal evidence`,
      });
    }

    for (const d of f.docs || []) {
      addEntity({
        id: `doc:${d.id}`, type: 'doc', name: d.title, path: d.path,
        forum: forum.id, sub: d.path.replace('../', ''),
        hay: `${d.title} ${d.id} doc reference`,
      });
    }
    return forum;
}

/* ── run-scoped network (bead vc-brain-toe.2) ─────────────────────────────
   The corpus graph is corpus-wide (the gBrain research forum). The network
   TAB, though, must speak for the CURRENT run — so it shows that run's own
   room when the run wrote one to disk, and an honest empty state (never a
   silent gBrain substitution) when it did not. The corpus graph stays one
   click away, clearly labelled. */
function currentRun() {
  return new URLSearchParams(location.search).get('run') || hooks.run || 'ferrite-full';
}

// Register the current run's out-dir room as a forum, once. Null when the run
// wrote no forum-attendants.json (most tapes) — the caller shows an empty state.
async function ensureRunForum(run) {
  const existing = corpus.forums.find(x => x.run === run && x.layout === 'run');
  if (existing) return existing;
  return addForum({
    id: `run-${run}`, layout: 'run', run,
    title: `${run} — room`, path: `../intelligence/out/${run}`, docs: [],
  });
}

// A corpus view narrowed to a single forum's own nodes, for graph.js.
function scopeCorpusToForum(f) {
  const entities = corpus.entities.filter(e => e.id === f.id || e.forum === f.id);
  return { forums: [f], entities, byId: corpus.byId };
}

function renderNetworkEmpty(host, run) {
  host.innerHTML = `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">network — persons · forums · evidence</span>
        <span class="rule"></span><span class="sk-chip">room not on disk</span></div>
      <p>This run's room has no attendants on disk — the run
        <code class="mono">${esc(run)}</code> wrote no
        <code class="mono">forum-attendants.json</code>, so there is no per-run
        person network to draw. (Two-pole tapes argue bull vs bear rather than a
        seated room; a seeded room's network appears here once the run writes one.)</p>
      <div class="axis-chips" style="margin-top:14px">
        <button class="sk-btn" id="net-browse-corpus" data-skin="btn">browse the corpus network (gBrain research forum)</button>
      </div>
    </div>`;
  host.querySelector('#net-browse-corpus')?.addEventListener('click', () => openNetwork(null));
}

// Single mount authority for #view-network. Scope is derived from the URL so it
// survives popstate/reload: ?net=corpus or a focus ?e=<id> → corpus graph;
// otherwise the current run's room (or its empty state).
async function mountNetworkView() {
  const host = document.querySelector('#view-network');
  if (!host) return;
  const p = new URLSearchParams(location.search);
  const focusId = p.get('e');
  const corpusMode = p.get('net') === 'corpus' || !!focusId;

  if (corpusMode) {
    const key = 'corpus' + (focusId ? `:${focusId}` : '');
    if (host.dataset.netScope === key) return;
    host.dataset.netScope = key;
    const focus = focusId ? corpus.byId.get(focusId) : null;
    return mountGraph(host, corpus, { onOpen: id => route(id), focus: focus?.id });
  }

  const run = currentRun();
  const key = `run:${run}`;
  if (host.dataset.netScope === key) return;
  host.dataset.netScope = key;
  const runForum = await ensureRunForum(run);
  if (host.dataset.netScope !== key) return; // navigated away mid-fetch
  if (runForum) mountGraph(host, scopeCorpusToForum(runForum), { onOpen: id => route(id) });
  else renderNetworkEmpty(host, run);
}

/* ── fuzzy: fzf-style subsequence score — boundary/consecutive bonuses ── */
export function fuzzy(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let score = 0, ti = 0, streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found === -1) return -1;
    const boundary = found === 0 || /[\s\-_.:]/.test(t[found - 1]);
    streak = found === ti ? streak + 1 : 1;
    score += 1 + streak * 2 + (boundary ? 8 : 0) - Math.min(found - ti, 6) * 0.5;
    ti = found + 1;
  }
  return score - t.length * 0.01;
}

/* ── grammar: "<entity words> <FUNC>" | "<FUNC>" | "<entity words>" ───── */
function parse(input) {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { query: '', fn: null };
  const last = tokens[tokens.length - 1].toUpperCase();
  if (FUNC_WORDS.has(last))
    return { query: tokens.slice(0, -1).join(' '), fn: last };
  return { query: tokens.join(' '), fn: null };
}

function matches(input) {
  const { query, fn } = parse(input);
  const globals = [];
  if (!query) {
    if (!fn || fn === 'NET') globals.push({ global: 'NET', name: 'network', sub: 'the person network — attendants, forums, citations' });
    if (!fn || fn === 'HELP') globals.push({ global: 'HELP', name: 'help', sub: 'command grammar and function mnemonics' });
  }
  let pool = corpus.entities;
  if (fn && fn !== 'NET' && fn !== 'HELP')
    pool = pool.filter(e => FUNCS[e.type]?.includes(fn));
  let ranked;
  if (!query) {
    const ORDER = { forum: 0, person: 1, run: 2, doc: 3, signal: 4 };
    ranked = [...pool].sort((a, b) =>
      (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || a.name.localeCompare(b.name));
  } else {
    ranked = pool.map(e => ({ e, s: fuzzy(query, e.hay) }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.e);
  }
  return { rows: [...globals, ...ranked.slice(0, 24)], fn };
}

/* ── router ───────────────────────────────────────────────────────────── */
let hooks = { setView: () => {} };

export function route(target, fn) {
  if (target === 'NET' || (fn === 'NET' && target?.type)) return openNetwork(target?.type ? target : null);
  if (target === 'HELP' || target === 'help') return openHelp();
  const e = typeof target === 'string' ? corpus.byId.get(target) : target;
  if (!e) return;
  if (e.type === 'run') {
    const url = new URL(location);
    url.searchParams.set('run', e.name);
    url.searchParams.set('view', 'overview');
    url.searchParams.delete('e'); url.searchParams.delete('fn');
    location.href = url; // RUN is bound at module load — full reload is the contract
    return;
  }
  const f = fn && fn !== 'NET' && FUNCS[e.type]?.includes(fn) ? fn : FUNCS[e.type][0];
  hooks.setView('entity', { params: { e: e.id, fn: f } });
  renderEntity($('#view-entity'), e, f, corpus);
}

// Terminal NET / <entity> NET open the corpus graph explicitly (?net=corpus,
// or centred on a focus entity). The top-menu network TAB does not pass through
// here — it lands in mountNetworkView run-scoped via the view observer.
function openNetwork(focus) {
  hooks.setView('network', { params: focus ? { e: focus.id } : { net: 'corpus' } });
  corpus.ready?.then(mountNetworkView);
}

function openHelp() {
  hooks.setView('entity', { params: { e: 'help', fn: 'HELP' } });
  $('#view-entity').innerHTML = `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">terminal — command grammar</span><span class="rule"></span></div>
      <p>Everything in the corpus is an <strong>entity</strong>; every page is an
        <strong>entity × function</strong>. Type an entity to fuzzy-match it, optionally
        followed by a function mnemonic: <code class="mono">eghbal pre</code>,
        <code class="mono">ferrite-inverted adj</code>, <code class="mono">gurley</code>,
        <code class="mono">net</code>.</p>
      <ul class="adj-list">${FUNC_HELP.map(([f, d]) =>
        `<li><span class="sk-chip blue">${f}</span><span>${esc(d)}</span></li>`).join('')}</ul>
      <p class="axis-notes">keys: <code class="mono">⌘K</code> or <code class="mono">/</code> palette ·
        <code class="mono">1–7</code> views · <code class="mono">esc</code> close ·
        entity pages: every <code class="mono">gsig-*</code> chip and person name is a link.</p>
    </div>`;
}

/* ── agent tool surface (bead vc-brain-gg8) ───────────────────────────────
   The dual-register agent's ONLY powers. Parity law: these wrap the same
   parse/matches/route the keyboard drives — one grammar, no drift. execute is
   the read-back channel: the data a page shows, returned as JSON, zero DOM. */
const clip = (s, n = 6000) =>
  s && s.length > n ? s.slice(0, n) + ' …[truncated]' : s;

export async function searchEntities(query) {
  await corpus.ready;
  const { rows } = matches(query);
  return rows.slice(0, 10).map(r => r.global
    ? { command: r.global, sub: r.sub }
    : { id: r.id, type: r.type, name: r.name, sub: r.sub, functions: FUNCS[r.type] });
}

function resolveCommand(input) {
  const { rows, fn } = matches(input);
  const row = rows.find(r => !r.global) || rows[0];
  return { row, fn };
}

export async function executeCommand(input) {
  await corpus.ready;
  const { row, fn } = resolveCommand(input);
  if (!row) return { error: 'no entity matches — try search', input };
  if (row.global) return { command: row.global, note: row.sub };
  const e = row;
  const f = fn && FUNCS[e.type]?.includes(fn) ? fn : FUNCS[e.type][0];
  const base = { id: e.id, type: e.type, name: e.name, function: f };
  if (e.type === 'person') {
    const data = { ...base, lens: e.lens, mandate: e.mandate,
      opening_lean: e.opening_lean, decisive_question: e.decisive_question,
      movement: e.movement, residual: e.residual,
      suggested: e.suggested, named_gap: e.named_gap };
    if (f === 'PRE' || f === 'POST')
      data.document = clip(await fetchText(f === 'PRE' ? e.pre : e.post)) || '(not on disk)';
    return data;
  }
  if (e.type === 'forum') {
    const data = { ...base, crux: e.crux, room_note: e.room_note,
      roster: e.roster, run: e.run };
    if (f === 'DEB') data.document = clip(await fetchText(e.debate)) || '(not on disk)';
    if (f === 'ADJ') data.adjudication = e.adjudication || '(not on disk)';
    return data;
  }
  if (e.type === 'signal')
    return { ...base, summary: e.summary, trust_tier: e.trust_tier,
      authority: e.authority, pull: e.pull, source: e.source,
      cited_by: e.cited_by, observed_at: e.observed_at };
  if (e.type === 'doc')
    return { ...base, document: clip(await fetchText(e.path)) || '(not on disk)' };
  if (e.type === 'run')
    return { ...base, note: 'a pipeline run — use navigate with OPEN to switch the viewer to it (full page reload)' };
  return base;
}

export async function navigateCommand(input) {
  await corpus.ready;
  const { row, fn } = resolveCommand(input);
  if (!row) return { error: 'no entity matches — try search', input };
  route(row.global || row, row.global ? null : fn);
  return { opened: row.global || `${row.name} ${fn && FUNCS[row.type]?.includes(fn) ? fn : FUNCS[row.type][0]}` };
}

/* ── palette ──────────────────────────────────────────────────────────── */
let sel = 0;
let lastRows = [];
let agentMod = null; // lazy ./agent.js — loaded on first ask, held for isActive/reset

function paletteHTML() {
  return `
    <div class="palette-box sk-panel" data-skin="face" role="dialog" aria-label="Terminal">
      <div class="palette-input-row">
        <span class="sk-label">›</span>
        <input id="palette-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="entity · entity FUNC · net · help" aria-label="Command">
      </div>
      <div id="palette-results" role="listbox"></div>
      <div id="agent-panel" hidden></div>
      <div class="palette-foot sk-label">↑↓ move · enter open · esc close</div>
    </div>`;
}

const TYPE_CLS = { person: 'blue', forum: 'ok', signal: '', run: 'warn', doc: '', ask: 'blue' };

function renderResults() {
  const input = $('#palette-input').value;
  let { rows, fn } = matches(input);
  // Dual-register fall-through (vc-brain-gg8): a sentence or a non-match
  // offers the agent; during an active conversation the reply comes first so
  // Enter continues it.
  const q = input.trim();
  const talking = agentMod?.isActive();
  if (q && (talking || rows.length === 0 || q.split(/\s+/).length >= 3)) {
    const ask = { ask: true, name: q, sub: talking ? 'reply to the agent' : 'ask the agent — it runs the same commands' };
    rows = talking ? [ask, ...rows] : [...rows, ask];
  }
  lastRows = rows;
  sel = Math.min(sel, Math.max(0, rows.length - 1));
  $('#palette-results').innerHTML = rows.map((r, i) => {
    const type = r.global ? 'cmd' : r.ask ? 'ask' : r.type;
    const mnem = r.ask ? 'ASK' : r.global || (fn && FUNCS[r.type]?.includes(fn) ? fn : FUNCS[r.type]?.[0] || '');
    return `
    <div class="palette-row ${i === sel ? 'sel' : ''}" role="option"
         aria-selected="${i === sel}" data-i="${i}">
      <span class="sk-chip ${TYPE_CLS[type] || ''}">${type}</span>
      <span class="palette-name">${esc(r.name)}</span>
      <span class="palette-sub">${esc(r.sub || '')}</span>
      <span class="palette-fn mono">${mnem}</span>
    </div>`;
  }).join('') || `<div class="palette-empty sk-label">no match — try HELP</div>`;
}

function openPalette(prefill = '') {
  const pal = $('#palette');
  pal.hidden = false;
  const input = $('#palette-input');
  input.value = prefill;
  sel = 0;
  renderResults();
  input.focus();
}

function closePalette() {
  $('#palette').hidden = true;
  agentMod?.reset(); // conversation persists until esc/close (gg8 answer-box design)
}

function acceptSelection() {
  const row = lastRows[sel];
  if (!row) return;
  if (row.ask) {
    const text = $('#palette-input').value.trim();
    $('#palette-input').value = '';
    sel = 0;
    renderResults();
    import('./agent.js?v=2026-07-21-2').then(m => { agentMod = m; m.ask(text); });
    return; // palette stays open — the transcript renders in #agent-panel
  }
  const { fn } = parse($('#palette-input').value);
  closePalette();
  route(row.global || row, row.global ? null : fn);
}

/* ── boot ─────────────────────────────────────────────────────────────── */
export function bootTerminal(h) {
  hooks = h;
  const pal = document.createElement('div');
  pal.id = 'palette';
  pal.hidden = true;
  pal.innerHTML = paletteHTML();
  document.body.appendChild(pal);
  pal.addEventListener('click', e => {
    if (e.target === pal) return closePalette();
    const row = e.target.closest('.palette-row');
    if (row) { sel = +row.dataset.i; acceptSelection(); }
  });
  $('#palette-input').addEventListener('input', () => { sel = 0; renderResults(); });
  $('#palette-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, lastRows.length - 1); renderResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); renderResults(); }
    else if (e.key === 'Enter') acceptSelection();
    else if (e.key === 'Escape') { e.stopPropagation(); closePalette(); }
  });

  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#palette').hidden ? openPalette() : closePalette();
    } else if (e.key === 'Escape' && !$('#palette').hidden) {
      // input-focused Escape is handled (and stopped) by the input's own
      // listener; this catches Escape after focus left the input
      closePalette();
    } else if (e.key === '/' && $('#palette').hidden
               && !e.target.closest('input,textarea') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openPalette();
    }
  });
  $('#terminal-btn')?.addEventListener('click', () => openPalette());

  // Entity-page + network delegation: gsig chips, person/entity links
  document.addEventListener('click', e => {
    const jump = e.target.closest('[data-entity]');
    if (jump) return route(jump.dataset.entity, jump.dataset.fn || null);
    const sig = e.target.closest('.ref[data-sig]');
    if (sig && corpus.byId.has(`signal:${sig.dataset.sig}`))
      return route(`signal:${sig.dataset.sig}`);
  });

  // The network view builds lazily — whatever flips the view state (tab
  // click, key 6, popstate) lands here, not only the NET command. Mount
  // waits for the corpus; a pre-corpus mount would show an empty graph.
  new MutationObserver(() => {
    if (document.body.dataset.viewState !== 'network') return;
    corpus.ready?.then(() => {
      if (document.body.dataset.viewState === 'network') mountNetworkView();
    });
  }).observe(document.body, { attributes: true, attributeFilter: ['data-view-state'] });

  const fromURL = () => {
    const p = new URLSearchParams(location.search);
    if (p.get('view') !== 'entity') return;
    const id = p.get('e');
    if (id === 'help') return openHelp();
    if (id && corpus.byId.has(id))
      return renderEntity($('#view-entity'), corpus.byId.get(id), p.get('fn') || null, corpus);
    // stale bookmark / hand-edited e= — never strand a blank entity view
    $('#view-entity').innerHTML = `
      <div class="run-card">
        <div class="card-head"><span class="sk-label">terminal</span><span class="rule"></span></div>
        <p class="muted">no entity for <code class="mono">${esc(id || '(none)')}</code> —
          press <code class="mono">⌘K</code>, or
          <button class="sk-chip blue entity-link" data-entity="help">HELP</button></p>
      </div>`;
  };
  addEventListener('popstate', fromURL);

  corpus.ready = loadCorpus().then(fromURL);
  return corpus.ready;
}
