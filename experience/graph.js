// Corpus graph — the gallery grammar port (bead vc-brain-u2w, spec
// design/graph-grammar.md). Hand-rolled force layout on SVG, zero-dependency.
// Four mechanisms ported near-verbatim from the operator's own gallery graph
// (the author's private gallery graph — operator-approved structure;
// citationgraph.org lineage, idea + algorithm only, never the sigma.js stack):
//   1. buildEdges(mode) + clusterKeyFor — modes are re-layouts of the SAME
//      graph: resting room-field (all relationship edges, center gravity,
//      no lit button) vs seeded cluster modes (by kind / by time / by deal,
//      soft boundary walls, spokes). (gallery :416-441, :531-538, :753-764)
//   2. beginLayoutTransition — invisible re-sim to the new equilibrium, then
//      one 750ms easeInOutCubic lerp old→new; layoutChanged fires exactly
//      once at completion. Nothing ever pops. (gallery :1720-1750)
//   3. The highlight law — facet chips scale matches 1.45×/full opacity,
//      non-matches 0.65×/10%; positions NEVER change on a filter. Multi-
//      select across facet groups (type AND deal), single-select within
//      deal; clicking a non-matching node clears the facets. (gallery
//      :1958-1977, :2297-2306; multi-select is our recorded departure)
//   4. Demand-driven frame loop — frames render only while something is
//      dirty (transition, easing, drag-heat); otherwise the loop parks.
//      (gallery :1753-1808)
// Two-press zoom: first press selects + swells, second press commits (a RUN
// node switches the viewer — taste-096 the graph stays the run-switching
// hub; every other node opens its entity page). Size = scoring + effort
// (sizeBy 'record', operator ruling settling graph R4) behind a ?sizeby=
// probe; coefficients are v0 and ride the probe until an operator tick.
import { esc } from './md.js?v=2026-07-21-5';

const W = 1180, H = 700;
const LAYOUT_TRANSITION_MS = 750;
const easeInOutCubic = t =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const MODES = [
  { key: 'kind', label: 'by kind' },
  { key: 'time', label: 'by time' },
  { key: 'deal', label: 'by deal' },
];
const TYPES = ['run', 'forum', 'person', 'suggested', 'signal'];

// deal = the company a run argues about: run-name prefix before the layout
// suffix (ferrite-inverted → ferrite). Research forums with no run cluster
// under their own key (gbrain stays its own pocket).
const dealOfRun = run => (run || '').split('-')[0] || null;

/* ── node + edge construction ─────────────────────────────────────────── */

function buildNodes(corpus) {
  const nodes = [], byId = new Map();
  const add = n => { byId.set(n.id, n); nodes.push(n); };

  const runs = corpus.entities.filter(e => e.type === 'run');
  runs.forEach((r, i) => add({
    id: r.id, label: r.name, kind: 'run', baseR: 22,
    deal: dealOfRun(r.name), timeRank: i, run: r.name,
    x: W / 2 + (i - (runs.length - 1) / 2) * 240, y: 130,
  }));

  corpus.forums.forEach((f, i) => add({
    id: f.id, label: f.key || f.name, kind: 'forum', baseR: 16,
    deal: f.run ? dealOfRun(f.run) : (f.key || f.name),
    run: f.run || null,
    seats: (f.roster?.length || 0) + (f.suggested?.length || 0),
    x: W / 2 + i * 60, y: H / 2,
  }));

  const persons = corpus.entities.filter(e => e.type === 'person');
  const citesReceived = new Map();
  for (const s of corpus.entities) {
    if (s.type !== 'signal') continue;
    for (const slug of s.cited_by || [])
      citesReceived.set(slug, (citesReceived.get(slug) || 0) + 1);
  }
  persons.forEach((p, i) => {
    const host = byId.get(p.forum);
    const a = (i / Math.max(1, persons.length)) * Math.PI * 2;
    add({
      id: p.id, label: p.name, kind: p.suggested ? 'suggested' : 'person',
      baseR: p.suggested ? 8 : 11,
      deal: host?.deal || null, run: host?.run || null,
      turns: p.movement_turns || 0, cites: citesReceived.get(p.slug) || 0,
      x: W / 2 + Math.cos(a) * 240, y: H / 2 + Math.sin(a) * 200,
    });
  });

  const cited = corpus.entities.filter(e => e.type === 'signal' && e.cited_by?.length);
  cited.forEach((s, i) => {
    const host = byId.get(s.forum);
    const a = (i / Math.max(1, cited.length)) * Math.PI * 2;
    add({
      id: s.id, label: s.sid, kind: 'signal', baseR: 4,
      deal: host?.deal || null, run: host?.run || null,
      trust: s.trust_tier, cites: s.cited_by.length, cited_by: s.cited_by,
      x: W / 2 + Math.cos(a) * 380, y: H / 2 + Math.sin(a) * 300,
    });
  });

  for (const n of nodes) { n.scale = 1; n.opacity = 1; n.targetScale = 1; n.targetOpacity = 1; }
  return { nodes, byId };
}

// Mechanism 1 — the edge set is a function of the mode (gallery buildEdges).
// resting: ALL relationship edges, weighted — the room field. Cluster modes:
// cohesion within the cluster key. Departure from the gallery's full pairwise
// same-key edges, recorded: within a group each node links to 3 ring
// neighbours (i+1, i+2, i+5) — same pocket physics, O(3n) edges instead of
// O(n²) DOM lines (our clusters are 30+ nodes, the gallery's were ~4).
function buildEdges(mode, nodes, byId, corpus) {
  const edges = [];
  const rel = () => {
    for (const f of corpus.forums) {
      if (f.run && byId.has(`run:${f.run}`))
        edges.push({ a: `run:${f.run}`, b: f.id, kind: 'runroom', len: 150, w: 1.6 });
      for (const pid of f.roster || [])
        if (byId.has(pid)) edges.push({ a: f.id, b: pid, kind: 'attends', len: 210, w: 1 });
      for (const pid of f.suggested || [])
        if (byId.has(pid)) edges.push({ a: f.id, b: pid, kind: 'suggested', len: 260, w: 0.7 });
    }
    for (const n of nodes) {
      if (n.kind !== 'signal') continue;
      for (const slug of n.cited_by || [])
        if (byId.has(`person:${slug}`))
          edges.push({ a: `person:${slug}`, b: n.id, kind: 'cites', len: 90, w: 0.8 });
    }
  };
  if (mode === 'resting' || mode === 'time') rel();
  else {
    const groups = new Map();
    for (const n of nodes) {
      const k = clusterKeyFor(n, mode);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    for (const g of groups.values()) {
      for (let i = 0; i < g.length; i++) {
        for (const step of [1, 2, 5]) {
          if (g.length <= step) break;
          const j = (i + step) % g.length;
          if (i < j) edges.push({ a: g[i].id, b: g[j].id, kind: 'cluster', len: 110, w: 1.2 });
        }
      }
    }
  }
  for (const e of edges) { e.na = byId.get(e.a); e.nb = byId.get(e.b); }
  return edges.filter(e => e.na && e.nb);
}

// gallery clusterKeyFor :531-538, typed-corpus analogue.
function clusterKeyFor(n, mode) {
  if (mode === 'kind') return n.kind === 'suggested' ? 'person' : n.kind;
  if (mode === 'deal') return n.deal || 'unattributed';
  if (mode === 'time') return n.run || 'research';
  return n.deal || 'field';
}

/* ── size = scoring + effort (sizeBy 'record', v0 coefficients) ───────── */

function applySizing(nodes, sizeBy) {
  if (sizeBy !== 'record') { for (const n of nodes) n.r = n.baseR; return; }
  const norm = (vals, v) => {
    const max = Math.max(1, ...vals);
    return v / max;
  };
  const runDegree = new Map();
  for (const n of nodes) if (n.run) runDegree.set(n.run, (runDegree.get(n.run) || 0) + 1);
  const rd = [...runDegree.values()];
  const pw = nodes.filter(n => n.kind === 'person' || n.kind === 'suggested')
    .map(n => 1 + n.turns + 2 * n.cites);
  const fw = nodes.filter(n => n.kind === 'forum').map(n => n.seats || 1);
  const sw = nodes.filter(n => n.kind === 'signal')
    .map(n => (4 - Math.min(3, n.trust || 3)) * (1 + n.cites));
  for (const n of nodes) {
    let k = 1;
    if (n.kind === 'run') k = 0.75 + 0.6 * norm(rd, runDegree.get(n.run) || 1);
    else if (n.kind === 'person' || n.kind === 'suggested')
      k = 0.75 + 0.6 * norm(pw, 1 + n.turns + 2 * n.cites);
    else if (n.kind === 'forum') k = 0.75 + 0.6 * norm(fw, n.seats || 1);
    else if (n.kind === 'signal')
      k = 0.75 + 0.9 * norm(sw, (4 - Math.min(3, n.trust || 3)) * (1 + n.cites));
    n.r = n.baseR * Math.max(0.72, Math.min(1.5, k));
  }
}

/* ── mount ────────────────────────────────────────────────────────────── */

export function mountGraph(root, corpus, { onOpen, onHold, focus, chrome } = {}) {
  const sizeBy = new URLSearchParams(location.search).get('sizeby') || 'record';
  const { nodes, byId } = buildNodes(corpus);
  applySizing(nodes, sizeBy);
  let mode = 'resting';
  let edges = buildEdges(mode, nodes, byId, corpus);
  const selectedTypes = new Set(TYPES);
  let dealFacet = null;
  let selectedId = null;
  const deals = [...new Set(nodes.map(n => n.deal).filter(Boolean))];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const modesHtml = `<span id="net-modes" class="axis-chips" role="group" aria-label="Layout mode">
      ${MODES.map(m => `<button class="sk-btn" data-mode="${m.key}" aria-pressed="false">${m.label}</button>`).join('')}
    </span>`;
  const facetsHtml = `<span id="net-facets" class="axis-chips" role="group" aria-label="Facets">
      <span class="sk-chip blue net-run-chip net-facet on" data-type="run" role="button" tabindex="0" aria-pressed="true">run</span>
      <span class="sk-chip ok net-facet on" data-type="forum" role="button" tabindex="0" aria-pressed="true">forum</span>
      <span class="sk-chip blue net-facet on" data-type="person" role="button" tabindex="0" aria-pressed="true">person</span>
      <span class="sk-chip warn net-facet on" data-type="suggested" role="button" tabindex="0" aria-pressed="true">suggested</span>
      <span class="sk-chip net-facet on" data-type="signal" role="button" tabindex="0" aria-pressed="true">signal</span>
      ${deals.map(d => `<span class="sk-chip net-facet net-deal" data-deal="${esc(d)}" role="button" tabindex="0" aria-pressed="false">${esc(d)}</span>`).join('')}
    </span>`;
  const svgHtml = `<svg id="net-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Corpus network graph">
      <g id="net-root">
        <g id="net-edges"></g>
        <g id="net-nodes">${nodes.map((n, i) => `
          <g class="net-node net-${n.kind} ${n.id === focus ? 'focus' : ''}" data-i="${i}" data-id="${esc(n.id)}">
            <circle r="${n.r}"></circle>
            ${n.kind === 'signal' ? `<title>${esc(n.label)}</title>`
              : `<text dy="${-n.r - 5}">${esc(n.label)}</text>`}
          </g>`).join('')}</g>
      </g>
    </svg>`;

  // chrome 'hub' (the landing cover, vc-brain-ib1): the graph is a panel
  // inside the hub's list·graph·detail grid — a slim mode/facet strip, no
  // card wrapper, no header. Default chrome is the network view's full card.
  root.innerHTML = chrome === 'hub' ? `
    <div class="net-hub">
      <div class="net-hub-strip">
        ${modesHtml}${facetsHtml}
        <span class="sk-label">size = scoring + effort</span>
      </div>
      ${svgHtml}
    </div>` : `
    <div class="run-card net-card">
      <div class="card-head"><span class="sk-label">network — the corpus field</span><span class="rule"></span>
        <span class="sk-chip">${nodes.length} nodes</span>
        ${modesHtml}
      </div>
      <div class="net-legend">
        ${facetsHtml}
        <span class="sk-label">size = scoring + effort · press once to hold, twice to enter · drag move · wheel zoom</span>
      </div>
      ${svgHtml}
    </div>`;

  const svg = root.querySelector('#net-svg');
  const edgeHost = root.querySelector('#net-edges');
  const nodeEls = [...root.querySelectorAll('.net-node')];
  let lineEls = [];

  const renderEdgeDom = () => {
    edgeHost.innerHTML = edges.map((e, i) =>
      `<line class="net-edge net-e-${e.kind}" data-i="${i}"></line>`).join('');
    lineEls = [...edgeHost.querySelectorAll('.net-edge')];
  };
  renderEdgeDom();

  /* ── physics (synchronous, invisible — the display never sees a tick) ── */
  // resting/time: center or axis gravity; cluster modes: soft boundary walls
  // (gallery :746-764). Pairwise repulsion is O(n²) per iteration — fine at
  // corpus scale (~100 nodes); the Barnes-Hut port waits until it isn't.
  const PAD = 55, PAD_TOP = 90;
  const runAxisX = n => {
    const ranked = nodes.filter(x => x.kind === 'run');
    const rr = ranked.find(x => x.run === n.run);
    if (!rr) return PAD + 60;
    const span = W - 2 * (PAD + 60);
    return PAD + 60 + (ranked.length < 2 ? span / 2
      : (rr.timeRank / (ranked.length - 1)) * span);
  };

  function simulate(iterations) {
    for (let it = 0; it < iterations; it++) {
      const alpha = Math.max(0.05, 1 - it / iterations);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          const small = a.kind === 'signal' || b.kind === 'signal';
          const f = (small ? 1300 : 5600) / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx = (a.vx || 0) + dx * f; a.vy = (a.vy || 0) + dy * f;
          b.vx = (b.vx || 0) - dx * f; b.vy = (b.vy || 0) - dy * f;
        }
      }
      for (const e of edges) {
        let dx = e.nb.x - e.na.x, dy = e.nb.y - e.na.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - e.len) * 0.0004 * d * (e.w || 1);
        dx /= d; dy /= d;
        e.na.vx = (e.na.vx || 0) + dx * f; e.na.vy = (e.na.vy || 0) + dy * f;
        e.nb.vx = (e.nb.vx || 0) - dx * f; e.nb.vy = (e.nb.vy || 0) - dy * f;
      }
      for (const n of nodes) {
        if (n.pin) { n.vx = n.vy = 0; continue; }
        if (mode === 'resting') {
          n.vx = (n.vx || 0) + (W / 2 - n.x) * 0.0012;
          n.vy = (n.vy || 0) + (H / 2 - n.y) * 0.0012;
        } else if (mode === 'time') {
          n.vx = (n.vx || 0) + (runAxisX(n) - n.x) * (n.kind === 'run' ? 0.02 : 0.004);
          n.vy = (n.vy || 0) + ((n.kind === 'run' ? H / 3 : H / 2) - n.y) * (n.kind === 'run' ? 0.02 : 0.0008);
        } else {
          const zone = 80, str = 0.5;
          const dl = n.x - PAD, dr = (W - PAD) - n.x;
          const dt = n.y - PAD_TOP, db = (H - PAD) - n.y;
          if (dl < zone) n.vx = (n.vx || 0) + str * (1 - dl / zone);
          if (dr < zone) n.vx = (n.vx || 0) - str * (1 - dr / zone);
          if (dt < zone) n.vy = (n.vy || 0) + str * (1 - dt / zone);
          if (db < zone) n.vy = (n.vy || 0) - str * (1 - db / zone);
        }
        n.vx = (n.vx || 0) * 0.6 * alpha; n.vy = (n.vy || 0) * 0.6 * alpha;
        n.x = Math.max(PAD, Math.min(W - PAD, n.x + n.vx));
        n.y = Math.max(PAD_TOP, Math.min(H - PAD, n.y + n.vy));
      }
    }
  }

  // Seed positions by cluster group — angular spokes (gallery initPositions);
  // by-time seeds runs on the recency axis instead (the revived timeline).
  function seedPositions() {
    if (mode === 'resting') return; // resting re-springs from wherever it is
    if (mode === 'time') {
      for (const n of nodes) {
        if (n.pin) continue;
        n.x = runAxisX(n) + (Math.random() - 0.5) * 60;
        n.y = (n.kind === 'run' ? H / 3 : H / 2) + (Math.random() - 0.5) * 120;
      }
      return;
    }
    const groups = new Map();
    for (const n of nodes) {
      const k = clusterKeyFor(n, mode);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    const keys = [...groups.keys()];
    keys.forEach((key, gi) => {
      const angle = (gi / keys.length) * 2 * Math.PI - Math.PI / 2;
      const dist = Math.min(W, H) * 0.30;
      const cx = W / 2 + Math.cos(angle) * dist;
      const cy = H / 2 + Math.sin(angle) * dist * 0.8;
      const spread = Math.max(80, groups.get(key).length * 14);
      for (const n of groups.get(key)) {
        if (n.pin) continue;
        n.x = Math.max(PAD, Math.min(W - PAD, cx + (Math.random() - 0.5) * spread));
        n.y = Math.max(PAD_TOP, Math.min(H - PAD, cy + (Math.random() - 0.5) * spread));
      }
    });
  }

  /* ── mechanism 2: the layout transition (gallery :1731-1750) ─────────── */
  let transitioning = false, transitionStart = 0, onTransitionDone = null;

  function beginLayoutTransition(simRunner, onComplete) {
    for (const n of nodes) { n._fx = n.x; n._fy = n.y; }
    simRunner(); // invisible — mutates x/y to the new equilibrium
    for (const n of nodes) { n._tx = n.x; n._ty = n.y; n.x = n._fx; n.y = n._fy; }
    if (REDUCED) { // reduced motion: land at once, still fire layoutChanged once
      for (const n of nodes) { n.x = n._tx; n.y = n._ty; n._fx = undefined; }
      draw();
      root.dispatchEvent(new CustomEvent('graph:layoutchanged'));
      onComplete?.();
      return;
    }
    transitionStart = performance.now();
    transitioning = true;
    onTransitionDone = onComplete || null;
    startAnim();
  }

  function relayout(nextMode) {
    mode = nextMode;
    edges = buildEdges(mode, nodes, byId, corpus);
    renderEdgeDom();
    beginLayoutTransition(() => { seedPositions(); simulate(300); });
  }

  /* ── mechanism 3: the highlight law (gallery :1958-1977) ─────────────── */
  const matches = n =>
    selectedTypes.has(n.kind) && (!dealFacet || n.deal === dealFacet);

  function applyFacets() {
    const allOn = selectedTypes.size === TYPES.length && !dealFacet;
    for (const n of nodes) {
      const m = allOn || matches(n);
      n.targetScale = allOn ? 1 : (m ? 1.45 : 0.65);
      n.targetOpacity = allOn ? 1 : (m ? 1 : 0.1);
      n.filterMatch = m;
    }
    startAnim();
  }

  /* ── mechanism 4: demand-driven frame loop (gallery :1753-1808) ──────── */
  let animId = null, dragAlpha = 0;

  function animLoop() {
    let dirty = false;
    if (transitioning) {
      const t = Math.min(1, (performance.now() - transitionStart) / LAYOUT_TRANSITION_MS);
      const k = easeInOutCubic(t);
      for (const n of nodes) if (n._fx !== undefined) {
        n.x = n._fx + (n._tx - n._fx) * k;
        n.y = n._fy + (n._ty - n._fy) * k;
      }
      dirty = true;
      if (t >= 1) {
        for (const n of nodes) if (n._fx !== undefined) {
          n.x = n._tx; n.y = n._ty;
          n._fx = n._fy = n._tx = n._ty = undefined;
        }
        transitioning = false;
        root.dispatchEvent(new CustomEvent('graph:layoutchanged'));
        const cb = onTransitionDone; onTransitionDone = null;
        try { cb?.(); } catch (e) { console.error(e); }
      }
    }
    if (dragAlpha > 0.02) { // drag reheat: live sim in resting physics
      simulate(1);
      dragAlpha *= 0.97;
      dirty = true;
    }
    for (const n of nodes) {
      const ds = n.targetScale - n.scale;
      if (Math.abs(ds) > 0.004) { n.scale += ds * 0.14; dirty = true; } else n.scale = n.targetScale;
      const dop = n.targetOpacity - n.opacity;
      if (Math.abs(dop) > 0.004) { n.opacity += dop * 0.12; dirty = true; } else n.opacity = n.targetOpacity;
    }
    if (dirty) { draw(); animId = requestAnimationFrame(animLoop); } else animId = null;
  }
  const startAnim = () => { if (!animId) animId = requestAnimationFrame(animLoop); };

  function draw() {
    edges.forEach((e, i) => {
      const l = lineEls[i];
      if (!l) return;
      l.setAttribute('x1', e.na.x); l.setAttribute('y1', e.na.y);
      l.setAttribute('x2', e.nb.x); l.setAttribute('y2', e.nb.y);
      const dim = e.na.opacity < 1 || e.nb.opacity < 1;
      l.style.opacity = dim ? Math.min(e.na.opacity, e.nb.opacity) : '';
    });
    nodes.forEach((n, i) => {
      const el = nodeEls[i];
      el.setAttribute('transform', `translate(${n.x},${n.y}) scale(${n.scale})`);
      el.style.opacity = n.opacity === 1 ? '' : n.opacity;
      el.classList.toggle('sel', n.id === selectedId);
    });
  }

  /* ── boot: settle the resting field, no visible explosion ────────────── */
  if (focus) {
    const fn = nodes.find(n => n.id === focus);
    if (fn) { fn.x = W / 2; fn.y = H / 2; fn.pin = true; }
  }
  simulate(220);
  draw();

  /* ── mode strip: push to select, push again to rest (gallery :2360) ──── */
  root.querySelectorAll('#net-modes .sk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode === mode ? 'resting' : btn.dataset.mode;
      root.querySelectorAll('#net-modes .sk-btn').forEach(b => {
        const on = b.dataset.mode === next;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      relayout(next);
    });
  });

  /* ── facet chips ─────────────────────────────────────────────────────── */
  const facetEls = [...root.querySelectorAll('.net-facet')];
  const syncFacetDom = () => facetEls.forEach(el => {
    const on = el.dataset.type ? selectedTypes.has(el.dataset.type)
      : dealFacet === el.dataset.deal;
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', String(on));
  });
  const clearFacets = () => {
    TYPES.forEach(t => selectedTypes.add(t));
    dealFacet = null;
    syncFacetDom(); applyFacets();
  };
  facetEls.forEach(el => {
    const toggle = () => {
      if (el.dataset.type) {
        const t = el.dataset.type;
        if (selectedTypes.has(t) && selectedTypes.size === 1) selectedTypes.add(t); // never empty
        else if (selectedTypes.has(t)) selectedTypes.delete(t);
        else selectedTypes.add(t);
      } else {
        dealFacet = dealFacet === el.dataset.deal ? null : el.dataset.deal;
      }
      syncFacetDom(); applyFacets();
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  /* ── pan / zoom / drag / two-press select ────────────────────────────── */
  const vb = { x: 0, y: 0, w: W, h: H };
  const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const toWorld = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return [vb.x + (cx - r.left) / r.width * vb.w, vb.y + (cy - r.top) / r.height * vb.h];
  };
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    vb.w = Math.min(Math.max(vb.w * k, W / 8), W * 3);
    vb.h = vb.w * (H / W);
    vb.x = wx - (wx - vb.x) * k; vb.y = wy - (wy - vb.y) * k;
    applyVB();
  }, { passive: false });

  let drag = null, moved = 0;
  svg.addEventListener('pointerdown', e => {
    // bead vc-brain-t04: suppress the native text-selection gesture.
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const g = e.target.closest('.net-node');
    moved = 0;
    if (g) {
      const n = nodes[+g.dataset.i];
      n.pin = true;
      drag = { node: n };
    } else {
      drag = { pan: true, sx: e.clientX, sy: e.clientY, ox: vb.x, oy: vb.y };
    }
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (drag.node) {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      drag.node.x = wx; drag.node.y = wy;
      if (REDUCED) draw(); else { dragAlpha = Math.max(dragAlpha, 0.3); startAnim(); }
    } else {
      const r = svg.getBoundingClientRect();
      vb.x = drag.ox - (e.clientX - drag.sx) / r.width * vb.w;
      vb.y = drag.oy - (e.clientY - drag.sy) / r.height * vb.h;
      applyVB();
    }
  });
  svg.addEventListener('pointerup', () => {
    if (drag?.node) {
      const n = drag.node;
      n.pin = n.id === focus;
      if (moved < 5) {
        // Two-press commit (gallery :1833-1848): first press holds the node
        // (select + swell), second press enters. A press on a node the
        // facets exclude clears the facets instead of selecting (:2297).
        if (!n.filterMatch && (selectedTypes.size !== TYPES.length || dealFacet)) {
          clearFacets();
        } else if (selectedId === n.id) {
          selectedId = null;
          draw();
          onOpen?.(n.id);
        } else {
          selectedId = n.id;
          draw();
          onHold?.(n.id);
        }
      } else if (REDUCED) { simulate(120); draw(); }
    } else if (drag?.pan && moved < 5 && selectedId) {
      selectedId = null; // press on the field lets go of the held node
      draw();
      onHold?.(null);
    }
    drag = null;
  });

  // External selection seam — the landing hub's run list holds nodes from
  // outside the canvas through the same two-press state.
  return {
    select(id) {
      selectedId = byId.has(id) ? id : null;
      draw();
      onHold?.(selectedId);
    },
  };
}
