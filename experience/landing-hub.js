// Landing cover hub (vc-brain-ib1, landing verdict A): the living corpus
// graph as the landing's first viewport, in the Connected Papers
// list·graph·detail grammar. The graph face is the SAME engine the network
// view mounts (graph.js, the gallery grammar) — chrome 'hub', resting mode.
//
// This module loads the corpus in ROOT page context: terminal.js's loader
// fetches page-relative ('./corpus.json', '../intelligence/…') and only
// works under experience/; the landing lives at the repo root, so paths here
// are normalized root-relative. terminal.js stays the canonical loader —
// this is the landing's thin analogue, seating only what the graph draws
// (forums, roster + suggested persons, cited signals; founders and design
// rooms never surface on the landing — corpus gate, bead vc-brain-toe.10).
import { esc } from './md.js?v=2026-07-21-5';
import { mountGraph } from './graph.js?v=2026-07-21-12';

const fetchJSON = async path => {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch { return null; }
};

// corpus.json paths are written for experience/ pages: '../intelligence/…'.
// From the root landing that prefix simply drops.
const rootPath = p => p.replace(/^\.\.\//, '');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function loadLandingCorpus() {
  const manifest = await fetchJSON('experience/corpus.json') || { runs: [], forums: [] };
  const corpus = { entities: [], byId: new Map(), forums: [] };
  const add = e => { corpus.entities.push(e); corpus.byId.set(e.id, e); };

  for (const runName of manifest.runs || [])
    add({ id: `run:${runName}`, type: 'run', name: runName });

  await Promise.all((manifest.forums || []).map(async f => {
    const path = rootPath(f.path);
    const runFiles = f.layout === 'run';
    const [seed, adjudication, evidence] = await Promise.all([
      fetchJSON(`${path}/${runFiles ? 'forum-attendants.json' : 'seed.json'}`),
      fetchJSON(`${path}/${runFiles ? 'forum-adjudication.json' : 'adjudication.json'}`),
      f.evidence ? fetchJSON(rootPath(f.evidence)) : null,
    ]);
    if (!seed) return;
    const forum = {
      id: `forum:${f.id}`, type: 'forum', key: f.id, name: f.title || f.id,
      run: f.run || null, crux: seed.crux_restatement,
      adjudication, roster: [], suggested: [],
    };
    corpus.forums.push(forum);
    add(forum);
    for (const a of seed.attendants || []) {
      add({
        id: `person:${a.slug}`, type: 'person', slug: a.slug, name: a.handle,
        forum: forum.id, lens: a.lens, evidence_refs: a.evidence_refs || [],
      });
      forum.roster.push(`person:${a.slug}`);
    }
    for (const s of adjudication?.suggested_attendants || []) {
      const slug = slugify(s.handle);
      if (corpus.byId.has(`person:${slug}`)) continue;
      add({
        id: `person:${slug}`, type: 'person', slug, name: s.handle,
        forum: forum.id, suggested: true, named_gap: s.named_gap,
      });
      forum.suggested.push(`person:${slug}`);
    }
    for (const sig of evidence?.signals || []) {
      add({
        id: `signal:${sig.id}`, type: 'signal', sid: sig.id, name: sig.id,
        forum: forum.id, summary: sig.summary, trust_tier: sig.trust_tier,
        cited_by: (seed.attendants || [])
          .filter(a => (a.evidence_refs || []).includes(sig.id)).map(a => a.slug),
      });
    }
  }));
  return corpus;
}

/* ── detail panel gloss per node type — tape-true strings only ─────────── */

// Run-list annotations: tape-true strings only.
const RUN_NOTES = {
  'ferrite-inverted': 'contested showcase · fictional deal, labelled',
};

function detailFor(corpus, id) {
  const e = corpus.byId.get(id);
  if (!e) return null;
  const openHref = e.type === 'run'
    ? `experience/?run=${encodeURIComponent(e.name)}&view=overview`
    : `experience/?view=entity&e=${encodeURIComponent(e.id)}`;
  if (e.type === 'run') {
    const room = corpus.forums.find(f => f.run === e.name);
    const voices = (room?.roster || [])
      .map(pid => corpus.byId.get(pid)?.name).filter(Boolean);
    return {
      name: e.name, kind: 'run · pipeline tape', openHref,
      openLabel: 'Open this run →',
      lines: [
        room?.crux ? `<strong>The crux the room argued:</strong> ${esc(room.crux)}` : `A saved end-to-end analysis — screen, triage, forum, counsel, memo.`,
        voices.length ? `${voices.length} named voices sat the crux: ${esc(voices.join(', '))} (AI-simulated personas of public figures) — the <strong>room</strong> that argued this deal before any number was scored.` : '',
      ].filter(Boolean),
    };
  }
  if (e.type === 'forum') return {
    name: e.name, kind: 'forum · the room at work', openHref,
    openLabel: 'Read the room →',
    lines: [e.crux ? `<strong>Crux:</strong> ${esc(e.crux)}` : 'Blind interviews, one moderated debate, a typed verdict.'],
  };
  if (e.type === 'person') return {
    name: e.name, kind: e.suggested ? 'suggested voice' : 'voice · seated in a room', openHref,
    openLabel: 'Open their record →',
    lines: [e.lens ? esc(e.lens) : (e.named_gap ? `Named for a gap: ${esc(e.named_gap)}` : '')].filter(Boolean),
  };
  return {
    name: e.sid || e.name, kind: 'signal · evidence under contest', openHref,
    openLabel: 'Open the signal →',
    lines: [e.summary ? esc(e.summary) : ''].filter(Boolean),
  };
}

/* ── mount ────────────────────────────────────────────────────────────── */

export async function mountLandingHub() {
  const listEl = document.querySelector('#hub-list');
  const graphEl = document.querySelector('#hub-graph-mount');
  const detailEl = document.querySelector('#hub-detail');
  if (!listEl || !graphEl || !detailEl) return;

  const corpus = await loadLandingCorpus();
  const runs = corpus.entities.filter(e => e.type === 'run');
  const DEFAULT = corpus.byId.has('run:ferrite-inverted')
    ? 'run:ferrite-inverted' : runs[0]?.id;

  const renderList = held => {
    listEl.innerHTML = `<span class="panel-label">runs · corpus</span>` +
      runs.map(r => `
        <button class="run-item ${r.id === held ? 'on' : ''}" data-id="${esc(r.id)}">
          <span class="rn">${esc(r.name)}</span>
          <span class="rk">${esc(RUN_NOTES[r.name] || 'pipeline tape')}${r.id === held ? ' · held' : ''}</span>
        </button>`).join('');
  };

  const renderDetail = id => {
    const d = detailFor(corpus, id || DEFAULT);
    if (!d) { detailEl.innerHTML = ''; return; }
    detailEl.innerHTML = `
      <span class="panel-label">${id ? 'held' : 'origin'}</span>
      <div class="detail-name">${esc(d.name)}</div>
      <span class="detail-kind">${esc(d.kind)}</span>
      ${d.lines.map(l => `<p class="detail-line">${l}</p>`).join('')}
      <div class="detail-open"><a class="sk-btn" data-skin="btn" href="${d.openHref}">${esc(d.openLabel)}</a></div>`;
  };

  const route = id => {
    const e = corpus.byId.get(id);
    location.href = e?.type === 'run'
      ? `experience/?run=${encodeURIComponent(e.name)}&view=overview`
      : `experience/?view=entity&e=${encodeURIComponent(id)}`;
  };

  const api = mountGraph(graphEl, corpus, {
    chrome: 'hub',
    onOpen: route,
    onHold: id => { renderList(id); renderDetail(id); },
  });

  listEl.addEventListener('click', e => {
    const item = e.target.closest('.run-item');
    if (item) api.select(item.dataset.id);
  });

  renderList(null);
  renderDetail(null);
}

mountLandingHub();
