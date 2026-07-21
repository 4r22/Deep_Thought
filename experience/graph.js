// Person-network graph — hand-rolled force layout on SVG, zero-dependency
// (velocity Verlet, pairwise repulsion, spring edges). Nodes: forums,
// persons (seated + suggested), evidence signals cited in seat mandates.
// Click a node to open its entity page; drag repositions; wheel zooms.
import { esc } from './md.js?v=2026-07-21-2';

const W = 1180, H = 700;

function buildData(corpus, { signals = true } = {}) {
  const nodes = [], edges = [], byId = new Map();
  const add = n => { byId.set(n.id, n); nodes.push(n); };

  corpus.forums.forEach((f, i) => add({
    id: f.id, label: f.key || f.name, kind: 'forum', r: 16,
    x: W / 2 + i * 60, y: H / 2,
  }));

  const persons = corpus.entities.filter(e => e.type === 'person');
  persons.forEach((p, i) => {
    const a = (i / Math.max(1, persons.length)) * Math.PI * 2;
    add({
      id: p.id, label: p.name, kind: p.suggested ? 'suggested' : 'person',
      r: p.suggested ? 8 : 11,
      x: W / 2 + Math.cos(a) * 240, y: H / 2 + Math.sin(a) * 200,
    });
    if (p.forum) edges.push({ a: p.forum, b: p.id, kind: p.suggested ? 'suggested' : 'attends', len: p.suggested ? 260 : 210 });
  });

  if (signals) {
    const cited = corpus.entities.filter(e => e.type === 'signal' && e.cited_by?.length);
    cited.forEach((s, i) => {
      const a = (i / Math.max(1, cited.length)) * Math.PI * 2;
      add({
        id: s.id, label: s.sid, kind: 'signal', r: 4,
        x: W / 2 + Math.cos(a) * 380, y: H / 2 + Math.sin(a) * 300,
      });
      for (const slug of s.cited_by) {
        if (byId.has(`person:${slug}`)) edges.push({ a: `person:${slug}`, b: s.id, kind: 'cites', len: 90 });
      }
    });
  }

  for (const e of edges) { e.na = byId.get(e.a); e.nb = byId.get(e.b); }
  return { nodes, edges: edges.filter(e => e.na && e.nb) };
}

export function mountGraph(root, corpus, { onOpen, focus } = {}) {
  let showSignals = true;

  const build = () => {
    const { nodes, edges } = buildData(corpus, { signals: showSignals });
    root.innerHTML = `
      <div class="run-card net-card">
        <div class="card-head"><span class="sk-label">network — persons · forums · evidence</span><span class="rule"></span>
          <span class="sk-chip">${nodes.length} nodes</span>
          <button id="net-signals" class="sk-btn" aria-pressed="${String(showSignals)}">signals</button>
        </div>
        <div class="net-legend">
          <span class="sk-chip ok">forum</span><span class="sk-chip blue">person</span>
          <span class="sk-chip warn">suggested</span><span class="sk-chip">signal</span>
          <span class="sk-label">drag move · wheel zoom · click open</span>
        </div>
        <svg id="net-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Person network graph">
          <g id="net-root">
            <g id="net-edges">${edges.map((e, i) =>
              `<line class="net-edge net-e-${e.kind}" data-i="${i}"></line>`).join('')}</g>
            <g id="net-nodes">${nodes.map((n, i) => `
              <g class="net-node net-${n.kind} ${n.id === focus ? 'focus' : ''}" data-i="${i}" data-id="${esc(n.id)}">
                <circle r="${n.r}"></circle>
                ${n.kind === 'signal' ? `<title>${esc(n.label)}</title>`
                  : `<text dy="${-n.r - 5}">${esc(n.label)}</text>`}
              </g>`).join('')}</g>
          </g>
        </svg>
      </div>`;

    root.querySelector('#net-signals').addEventListener('click', () => {
      showSignals = !showSignals;
      build();
    });

    const svg = root.querySelector('#net-svg');
    const lineEls = [...root.querySelectorAll('.net-edge')];
    const nodeEls = [...root.querySelectorAll('.net-node')];

    /* physics — repulsion + springs + soft centring, cooled by alpha */
    let alpha = 1;
    if (focus) {
      const fn = nodes.find(n => n.id === focus);
      if (fn) { fn.x = W / 2; fn.y = H / 2; fn.pin = true; }
    }
    const tick = () => {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 1;
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
        const f = (d - e.len) * 0.02;
        dx /= d; dy /= d;
        e.na.vx = (e.na.vx || 0) + dx * f * d * 0.02; e.na.vy = (e.na.vy || 0) + dy * f * d * 0.02;
        e.nb.vx = (e.nb.vx || 0) - dx * f * d * 0.02; e.nb.vy = (e.nb.vy || 0) - dy * f * d * 0.02;
      }
      for (const n of nodes) {
        if (n.pin) { n.vx = n.vy = 0; continue; }
        n.vx = ((n.vx || 0) + (W / 2 - n.x) * 0.0012) * 0.6 * alpha;
        n.vy = ((n.vy || 0) + (H / 2 - n.y) * 0.0012) * 0.6 * alpha;
        n.x += n.vx; n.y += n.vy;
      }
      alpha *= 0.985;
    };
    const draw = () => {
      edges.forEach((e, i) => {
        const l = lineEls[i];
        l.setAttribute('x1', e.na.x); l.setAttribute('y1', e.na.y);
        l.setAttribute('x2', e.nb.x); l.setAttribute('y2', e.nb.y);
      });
      nodes.forEach((n, i) =>
        nodeEls[i].setAttribute('transform', `translate(${n.x},${n.y})`));
    };
    // Reduced motion → settle synchronously, no animated drift. Otherwise
    // the loop runs only while warm (alpha) and stops when cool — kick()
    // restarts it when a drag reheats the sim.
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let running = false;
    const loop = () => {
      if (!svg.isConnected || alpha <= 0.02) { running = false; return; }
      tick(); draw();
      requestAnimationFrame(loop);
    };
    const kick = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(loop);
    };
    const settle = () => { // synchronous cool-down, capped
      for (let i = 0; alpha > 0.02 && i < 600; i++) tick();
      draw();
    };
    for (let i = 0; i < 60; i++) tick(); // warm start — no visible explosion
    draw();
    if (REDUCED) settle(); else kick();

    /* pan / zoom / drag / click */
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

    let drag = null; // {node} | {pan:true, sx, sy, ox, oy}; moved = px travelled
    let moved = 0;
    svg.addEventListener('pointerdown', e => {
      // bead vc-brain-t04: suppress the native text-selection gesture a drag
      // would otherwise start (blue flash). preventDefault + clear any live
      // selection at drag start; app.css also marks the surface non-selectable.
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
        alpha = Math.max(alpha, 0.25);
        if (REDUCED) draw(); else kick();
      } else {
        const r = svg.getBoundingClientRect();
        vb.x = drag.ox - (e.clientX - drag.sx) / r.width * vb.w;
        vb.y = drag.oy - (e.clientY - drag.sy) / r.height * vb.h;
        applyVB();
      }
    });
    svg.addEventListener('pointerup', e => {
      if (drag?.node) {
        drag.node.pin = drag.node.id === focus;
        if (moved < 5) onOpen?.(drag.node.id);
        else if (REDUCED) settle(); // reduced motion: land the layout at once
      }
      drag = null;
    });
  };

  build();
}
