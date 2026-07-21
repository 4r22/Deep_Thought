// Entity pages — one renderer per entity type, each page an entity×function.
// Every signal chip, person name, and forum reference is a link (delegated
// in terminal.js); citations must stay one click from their evidence.
import { md, inline, esc, parseDebate } from './md.js?v=2026-07-21-5';
import { mountForumShell } from './forum-shell.js?v=2026-07-21-5';

const LEAN_CLS = { for: 'ok', against: 'bad', 'genuinely-split': 'warn' };
const MOVE_CLS = { conceded: 'ok', refined: 'warn', held: '' };
const VERDICT_CLS = { advance: 'ok', contested: 'warn', reject: 'bad' };

const chip = (text, cls = '') => `<span class="sk-chip ${cls}">${esc(text)}</span>`;
const personLink = (name, slug) =>
  `<button class="sk-chip blue entity-link" data-entity="person:${esc(slug)}">${esc(name)}</button>`;
const sigChip = sid => `<span class="ref sig-ref" data-sig="${esc(sid)}">${esc(sid)}</span>`;

// Context trail (routing review 2026-07-21): one wayfinding chip in the
// entity-head that links back UP — a person's room, a forum's run. Full words,
// one chip, no breadcrumb bar (taste-086 obviousness-in-the-chrome).
const contextTrail = (label, name, id) =>
  `<div class="context-trail"><button class="sk-chip ctx-up entity-link"
     data-entity="${esc(id)}">${esc(label)}: ${esc(name)} →</button></div>`;

// Visible tab labels are full words (taste-086); the DES/PRE/POST/DEB/ADJ codes
// stay internal (data-fn) so ⌘K grammar and ?fn= deep links keep working. DES
// reads differently per surface, so the word map is passed in per entity type.
const PERSON_TAB_WORDS = { DES: 'Profile', PRE: 'Pre-interview', POST: 'Post-interview' };
const FORUM_TAB_WORDS = { DES: 'Overview', DEB: 'Debate', ADJ: 'Adjudication' };

async function fetchText(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

function tabs(entity, fns, active, words) {
  return `<div class="tab-row">${fns.map(f =>
    `<button class="sk-btn tab-btn" data-entity="${esc(entity.id)}" data-fn="${f}"
             aria-pressed="${String(f === active)}">${esc(words[f] || f)}</button>`).join('')}</div>`;
}

// Render generation — an awaited doc fetch must not write into a page that
// a later navigation has already replaced (#entity-doc is a shared id).
let gen = 0;

/* ── person ───────────────────────────────────────────────────────────── */
async function personPage(root, p, fn, corpus, fresh) {
  const forum = corpus.byId.get(p.forum);
  const refs = (p.evidence_refs || []).map(sigChip).join(' ');
  const head = `
    <div class="entity-head">
      ${forum ? contextTrail('in room', forum.name, forum.id) : ''}
      <div class="hero-row">
        <span class="hero-name">${esc(p.name)}</span>
        ${p.seat ? chip(p.seat) : ''}
        ${p.suggested ? chip('suggested attendant', 'warn') : ''}
        ${p.opening_lean ? chip(`lean ${p.opening_lean}`, LEAN_CLS[p.opening_lean] ?? '') : ''}
        ${p.movement ? chip(p.movement, MOVE_CLS[p.movement] ?? '') : ''}
      </div>
      ${p.lens ? `<p class="hero-oneliner">${esc(p.lens)}</p>` : ''}
      ${p.seat ? `<p class="axis-notes">AI-simulated counterfactual persona of a public figure — not their real views or participation</p>` : ''}
      ${refs ? `<div class="axis-chips">${refs}</div>` : ''}
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

  root.innerHTML = head + tabs(p, ['DES', 'PRE', 'POST'], fn, PERSON_TAB_WORDS) + body;

  if (fn === 'PRE' || fn === 'POST') {
    const text = await fetchText(fn === 'PRE' ? p.pre : p.post);
    if (!fresh()) return; // navigated away while the fetch was in flight
    const doc = root.querySelector('#entity-doc');
    if (doc) doc.innerHTML = text ? md(text)
      : `<p class="muted">no ${fn.toLowerCase()}-interview on record for ${esc(p.name)}</p>`;
  }
}

/* ── design-spec panel (bead vc-brain-4h4) ──────────────────────────────────
   A design room is a forum whose adjudication carries acceptance_criteria[] and
   references[]. On top of the standing adjudication-first layout, the design DES
   page leads with this panel: the criteria as a checkable list (the operator's
   own review rubric) and the anchors as chips. Full words, no spec-speak. */
const REF_CLS = { work: '', 'taste-signal': 'blue', sketch: 'ok', sketch_capture: 'ok' };

function designSpecPanel(f) {
  const crits = f.acceptance_criteria || [];
  const refs = f.references || [];
  const checks = crits.length
    ? `<ul class="crit-list">${crits.map((c, i) => {
        const id = `crit-${esc(f.key)}-${i}`;
        return `<li class="crit-item">
          <input type="checkbox" class="crit-box" id="${id}">
          <label for="${id}">${inline(c.check || c.text || '')}${c.capture_hint ? ` <span class="muted">· capture: ${inline(c.capture_hint)}</span>` : ''}</label>
        </li>`;
      }).join('')}</ul>`
    : '<p class="muted">no acceptance criteria on record</p>';
  const chips = refs.length
    ? `<div class="axis-chips">${refs.map(r =>
        chip([r.ref || r.label || r.id, r.note].filter(Boolean).join(' — '), REF_CLS[r.kind] ?? '')).join('')}</div>`
    : '<p class="muted">no references on record</p>';
  return `
    <div class="run-card design-spec">
      <div class="card-head"><span class="sk-label">design spec — check each as the work lands</span><span class="rule"></span></div>
      <div class="sk-label">acceptance criteria</div>
      ${checks}
      <div class="sk-label" style="margin-top:18px">references — the works, taste signals, and sketches every position is anchored to</div>
      ${chips}
    </div>`;
}

// Debate transcript → turns HTML. Seat speakers resolve to the person's handle
// and a link to their interview pages. Shared by the non-design DEB tab and the
// design room's rail debate section.
function debateHTML(text, f, corpus) {
  const bySeat = new Map(f.roster.map(id => {
    const p = corpus.byId.get(id);
    return [p.seat, p];
  }));
  const { turns } = parseDebate(text);
  return turns.map(t => {
    const p = bySeat.get(t.speaker);
    const who = p ? personLink(p.name, p.slug) : chip(t.speaker, t.speaker === 'moderator' ? '' : 'blue');
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

// A design room's sections, as a DATA-DRIVEN rail (taste-097 / memo wt-001).
// Each descriptor's mount(host, fresh) renders into the FIELD host it is
// handed — never a hardcoded root. Adding a section (a coming `counsel` stage)
// is a push here, not a re-layout. Seats are dropdown groups exposing blind
// pre / post-debate interviews. Async sections guard against a later selection
// overwriting them via fresh().
function designSections(f, adj, corpus) {
  const sections = [];
  if (f.acceptance_criteria?.length || f.references?.length)
    sections.push({ id: 'design-spec', label: 'Design spec',
      mount: h => { h.innerHTML = designSpecPanel(f); } });
  if (adj) sections.push({ id: 'adjudication', label: 'Adjudication',
    mount: h => { h.innerHTML = `<div class="run-card">
      <div class="card-head"><span class="sk-label">adjudication — the room’s chosen direction</span><span class="rule"></span></div>
      <div class="memo-body">${adjudicationHTML(adj, f, corpus)}</div></div>`; } });
  sections.push({ id: 'debate', label: 'Debate transcript',
    mount: async (h, fresh) => {
      const text = await fetchText(f.debate || `${f.path}/debate.md`);
      if (!fresh()) return;
      h.innerHTML = text
        ? `<div class="run-card"><div class="card-head"><span class="sk-label">debate transcript — the moderated record</span><span class="rule"></span></div><div class="memo-body">${debateHTML(text, f, corpus)}</div></div>`
        : `<div class="run-card"><p class="muted">no debate transcript on record</p></div>`;
    } });
  for (const id of f.roster) {
    const p = corpus.byId.get(id);
    if (!p) continue;
    const interview = (kind, label, path) => ({ id: `${id}/${kind}`, label,
      mount: async (h, fresh) => {
        const t = await fetchText(path);
        if (!fresh()) return;
        h.innerHTML = t
          ? `<div class="run-card"><div class="card-head"><span class="sk-label">${esc(p.name)}${p.seat ? ` · ${esc(p.seat)}` : ''} — ${label}</span><span class="rule"></span></div><div class="memo-body">${md(t)}</div></div>`
          : `<div class="run-card"><p class="muted">no ${label} on record for ${esc(p.name)}</p></div>`;
      } });
    sections.push({ id, kind: 'group',
      label: p.seat ? `${p.name} · ${p.seat}` : p.name,
      children: [interview('pre', 'blind pre-interview', p.pre), interview('post', 'post-debate interview', p.post)] });
  }
  return sections;
}

/* ── forum ────────────────────────────────────────────────────────────── */
async function forumPage(root, f, fn, corpus, fresh) {
  const adj = f.adjudication;
  const design = f.layout === 'design';
  const head = `
    <div class="entity-head">
      ${f.run ? contextTrail('in run', f.run, `run:${f.run}`) : ''}
      <div class="hero-row">
        <span class="hero-name">${esc(f.name)}</span>
        ${adj ? chip(adj.outcome, 'blue') : ''}
      </div>
      ${design ? `<div class="roundtable-banner">
        <span class="sk-chip warn">AI counterfactual roundtable</span>
        <span class="roundtable-sub">reasoned from published work — an internal design record, never a real endorsement</span>
      </div>` : ''}
      <p class="hero-oneliner">${esc((f.crux || '').slice(0, 220))}</p>
    </div>`;

  // Design rooms render as the SAME structure rail as the run-viewer forum
  // (taste-097 one-nav-model parity): design-spec, adjudication, debate, and
  // each seat's pre/post as rail nodes. The deep-link function selects the
  // resting section; the rail drives everything after.
  if (design) {
    const sections = designSections(f, adj, corpus);
    const initialId = fn === 'DEB' ? 'debate' : fn === 'ADJ' ? 'adjudication'
      : sections.some(s => s.id === 'design-spec') ? 'design-spec' : undefined;
    root.innerHTML = head;
    const shellHost = document.createElement('div');
    root.appendChild(shellHost);
    mountForumShell(shellHost, { title: `${f.name} — room`, outcome: adj?.outcome, sections, initialId });
    return;
  }

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

  root.innerHTML = head + tabs(f, ['DES', 'DEB', 'ADJ'], fn, FORUM_TAB_WORDS) + body;

  if (fn === 'DEB') {
    const text = await fetchText(f.debate || `${f.path}/debate.md`);
    if (!fresh()) return; // navigated away while the fetch was in flight
    const doc = root.querySelector('#entity-doc');
    if (!doc) return;
    if (!text) { doc.innerHTML = '<p class="muted">no debate transcript on record</p>'; return; }
    doc.innerHTML = debateHTML(text, f, corpus);
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

/* ── founder (bead vc-brain-toe.12) ───────────────────────────────────────
   The minimal founder profile: who they are, what they submitted (or how we
   sourced them), what the screen said, and the door to their run. The full
   graph presence and rich profile stay in bead vc-brain-mmw. */
function founderPage(root, f) {
  const links = f.links || {};
  const aka = (f.aliases || []).filter(a => a && a !== f.name);
  const score = f.score || null;
  const [lo, hi] = score?.band || [score?.value, score?.value];
  // an application's "Unknown (…)" location is a gap, not a fact — no chip
  // for it (taste-090: nothing in the chrome that reads as garbage)
  const location = f.location && !/^unknown/i.test(f.location) ? f.location : null;

  const channels = [
    ['github', links.github], ['linkedin', links.linkedin],
    ['twitter', links.twitter], ['site', links.site],
  ].filter(([, url]) => url);

  const runCard = f.run ? `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">on the record — ${esc(f.company || f.run)}</span>
        <span class="rule"></span>
        ${f.verdict ? chip(`screen: ${f.verdict}`, VERDICT_CLS[f.verdict] || '') : ''}</div>
      ${f.one_liner ? `<p>${inline(f.one_liner)}</p>` : ''}
      ${f.ask ? `<p class="axis-notes">${inline(f.ask)}</p>` : ''}
      <div class="axis-chips" style="margin-top:10px">
        <button class="sk-chip blue entity-link" data-entity="run:${esc(f.run)}"
          data-fn="OPEN">open run ${esc(f.run)} →</button>
      </div>
    </div>` : '';

  const applicationCard = (f.background || f.role) ? `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">background — as claimed, unverified</span><span class="rule"></span></div>
      ${f.role ? `<div class="axis-chips">${chip(f.role)}</div>` : ''}
      ${f.background ? `<p>${inline(f.background)}</p>` : ''}
    </div>` : '';

  const sourcedCard = f.sourced ? `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">how we found them</span><span class="rule"></span></div>
      <p class="axis-notes">${inline(f.sourced)}</p>
    </div>` : '';

  const scoreCard = score && score.value != null ? `
    <div class="run-card">
      <div class="card-head"><span class="sk-label">founder score — ${esc(score.confidence || 'unrated')}${score.cold_start ? ' · cold-start prior' : ''}</span><span class="rule"></span></div>
      <div class="band-track">
        <div class="band-range" style="left:${lo}%;width:${Math.max(0, hi - lo)}%"></div>
        <div class="band-marker" style="left:${score.value}%"></div>
      </div>
      <div class="band-scale"><span>0</span><span>band ${lo}–${hi} · value ${score.value}</span><span>100</span></div>
      ${score.reason ? `<p class="axis-notes">${inline(score.reason)}</p>` : ''}
    </div>` : '';

  root.innerHTML = `
    <div class="entity-head">
      ${f.run ? contextTrail('in run', f.run, `run:${f.run}`) : ''}
      <div class="hero-row">
        <span class="hero-name">${esc(f.name)}</span>
        ${chip('founder')}
        ${f.verdict ? chip(`screen: ${f.verdict}`, VERDICT_CLS[f.verdict] || '') : ''}
        ${score?.cold_start ? chip('cold start', 'blue') : ''}
        ${location ? chip(location) : ''}
      </div>
      ${f.one_liner ? `<p class="hero-oneliner">${esc(f.one_liner)}</p>` : ''}
      ${aka.length ? `<p class="hero-oneliner muted">also known as ${aka.map(esc).join(' · ')}</p>` : ''}
    </div>
    ${runCard}
    ${applicationCard}
    ${scoreCard}
    ${sourcedCard}
    ${channels.length ? `<div class="run-card">
      <div class="card-head"><span class="sk-label">public channels</span><span class="rule"></span></div>
      <div class="axis-chips">${channels.map(([name, url]) =>
        `<a class="sk-chip" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)} ↗</a>`).join('')}</div>
    </div>` : ''}`;
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
  if (entity.type === 'founder') return founderPage(root, entity);
  if (entity.type === 'forum') return forumPage(root, entity, fn, corpus, fresh);
  if (entity.type === 'signal') return signalPage(root, entity, corpus);
  if (entity.type === 'doc') return docPage(root, entity, fresh);
  if (entity.type === 'run') return runPage(root, entity);
  root.innerHTML = `<div class="run-card"><p class="muted">no page for entity type
    <code class="mono">${esc(entity.type)}</code></p></div>`;
}
