// The generative field — the run's first face (bead vc-brain-ixz, nature
// verdict B, organism camp). The stranger opens the run into the executing
// person–claim–room graph: the room is the strong center, the seats and the
// evidence signals are the organs around it. Evidence is the organ of
// SELECTION — pressing a node fills the detail well with its cited record;
// pressing it again enters its own surface (room → forum, seat → entity
// page). The familiar overview wells demote to edge meters (app.js renders
// those; this module owns the field + detail well).
//
// Encoding is BINDING from first paint (nature R2, size = scoring + effort
// ruling): node radius = evidence weight (trust tier × citing seats) for
// signals, cites + debate turns for seats; an in-graph scale legend keys
// radius → weight; per-node measure glyphs carry tier/verification and cite
// counts; triage tensions render as explicit ⚔ edges. Everything shown is
// read from the tape — nothing hand-set.
import { esc } from './md.js?v=2026-07-21-5';

const W = 820, H = 640, PAD = 55;

const TIER_W = {
  'verified-online': 3, verified: 3, grounded: 3,
  'verified-offline': 2.4, reconstructed: 1.6, derived: 1.6,
  claimed: 1, unverified: 1,
};
const tierWeight = t => TIER_W[t] || 1;
const isVerified = t => tierWeight(t) >= 2.4;

/* ── build the field from the run tape ────────────────────────────────── */

export function buildField(state, run) {
  const seats = state.attendants?.attendants || [];
  const adj = state.adjudication || {};
  const memoClaims = state.memo?.claims || [];
  const tensions = state.triage?.tensions || [];

  const evoBySeat = new Map((adj.evolution || []).map(e => [e.attendant, e]));
  const poleBySeat = new Map();
  for (const r of adj.residual || [])
    for (const p of r.positions || []) {
      const m = /^\s*(write|wait)\b/i.exec(p.position || '');
      if (m) poleBySeat.set(p.attendant, m[1].toUpperCase());
    }

  const nodes = [], edges = [], byId = new Map();
  const add = n => { byId.set(n.id, n); nodes.push(n); };

  const co = state.memo?.company;
  add({
    id: 'room', kind: 'room', r: 32, pin: true, x: W / 2, y: H / 2 - 10,
    name: co?.name || run,
    sub: `the room · run ${Math.round(state.latency?.total_seconds || 0)}s`,
    meas: [state.screen?.verdict, adj.outcome?.replace(/-/g, ' ')]
      .filter(Boolean).join(' · '),
  });

  // Seats — radius grows with cites + debate turns (effort in the room).
  seats.forEach((a, i) => {
    const evo = evoBySeat.get(a.id);
    const cites = (a.evidence_refs || []).length;
    const turns = evo?.turns?.length || 0;
    add({
      id: `seat:${a.id}`, kind: 'seat', seat: a, slug: a.slug,
      r: Math.min(20, 11 + cites * 1.4 + turns * 0.5),
      name: a.handle,
      meas: [`${a.id}`, `cites ${cites}`, evo?.movement].filter(Boolean).join(' · '),
      pole: poleBySeat.get(a.id) || null,
      i,
    });
    edges.push({ a: 'room', b: `seat:${a.id}`, kind: 'attends', len: 225 });
  });

  // Signals — the union of what the seats cite; measures aggregated from the
  // memo's claim ledger (tier = strongest tier among claims citing the
  // signal; quote = that claim's cited quote for this signal).
  const sigIds = [...new Set(seats.flatMap(a => a.evidence_refs || []))];
  for (const sid of sigIds) {
    const citedBy = seats.filter(a => (a.evidence_refs || []).includes(sid));
    const claims = memoClaims.filter(c => (c.evidence || []).some(e => e.signal_id === sid));
    // Tier comes from PURE claims (evidence = this signal alone) — a mixed
    // claim's trust belongs to the composite, and letting the deck inherit
    // 'verified-online' from a claim that also cites the registry would
    // falsify the encoding. Mixed claims are the fallback only.
    const pure = claims.filter(c => (c.evidence || []).length === 1);
    let best = null;
    for (const c of (pure.length ? pure : claims))
      if (!best || tierWeight(c.trust?.tier) > tierWeight(best.trust?.tier)) best = c;
    const tier = best?.trust?.tier || 'claimed';
    const verification = best?.trust?.verification || 'unverified';
    const confidence = best?.trust?.confidence;
    const quote = best?.evidence?.find(e => e.signal_id === sid && e.quote)?.quote
      || claims.flatMap(c => c.evidence || []).find(e => e.signal_id === sid && e.quote)?.quote;
    const weight = tierWeight(tier) * (1 + citedBy.length);
    add({
      id: `sig:${sid}`, kind: 'signal', sid,
      r: Math.max(9, Math.min(24, 6 + 3.4 * Math.sqrt(weight))),
      name: sid, tier, verification, confidence, quote,
      claims, citedBy: citedBy.map(a => a),
      meas: `${claims.length} claims · ${citedBy.length} seats`,
    });
    for (const a of citedBy)
      edges.push({ a: `seat:${a.id}`, b: `sig:${sid}`, kind: 'cites', len: 160 });
  }

  // Tensions (triage) — explicit ⚔ edges between the two sides' lead signals.
  const tensionEdges = [];
  tensions.forEach((t, ti) => {
    const sa = (t.side_a?.evidence_refs || [])[0];
    const sb = (t.side_b?.evidence_refs || [])[0];
    if (sa && sb && byId.has(`sig:${sa}`) && byId.has(`sig:${sb}`) && sa !== sb) {
      tensionEdges.push({ a: `sig:${sa}`, b: `sig:${sb}`, kind: 'tension', len: 340, t, ti });
      byId.get(`sig:${sa}`).tension = t; byId.get(`sig:${sb}`).tension = t;
    }
  });
  edges.push(...tensionEdges);

  for (const e of edges) { e.na = byId.get(e.a); e.nb = byId.get(e.b); }
  return { nodes, edges: edges.filter(e => e.na && e.nb), byId };
}

/* ── layout: pole-aware seeding + a short synchronous relax ───────────── */

function layoutField({ nodes, edges }) {
  const seats = nodes.filter(n => n.kind === 'seat');
  const write = seats.filter(s => s.pole === 'WRITE');
  const wait = seats.filter(s => s.pole === 'WAIT');
  const rest = seats.filter(s => !s.pole);
  const place = (group, a0, a1) => group.forEach((s, i) => {
    const a = a0 + (a1 - a0) * ((i + 1) / (group.length + 1));
    s.x = W / 2 + Math.cos(a) * 205;
    s.y = H / 2 - 10 + Math.sin(a) * 195;
  });
  place(write, -Math.PI / 2.6, Math.PI / 2.6);          // right arc
  place(wait, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6); // left arc
  place(rest, Math.PI / 2.2, Math.PI - Math.PI / 2.2);  // bottom arc

  for (const n of nodes) {
    if (n.kind !== 'signal') continue;
    const anchors = edges.filter(e => e.kind === 'cites' && e.nb === n).map(e => e.na);
    const ax = anchors.length ? anchors.reduce((s, a) => s + a.x, 0) / anchors.length : W / 2;
    const ay = anchors.length ? anchors.reduce((s, a) => s + a.y, 0) / anchors.length : H / 2;
    const dx = ax - W / 2, dy = ay - (H / 2 - 10);
    const d = Math.hypot(dx, dy) || 1;
    n.x = W / 2 + (dx / d) * 300 + (Math.random() - 0.5) * 40;
    n.y = H / 2 - 10 + (dy / d) * 260 + (Math.random() - 0.5) * 40;
  }

  for (let it = 0; it < 160; it++) {
    const alpha = Math.max(0.08, 1 - it / 160);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 1;
        const f = 9500 / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        if (!a.pin) { a.vx = (a.vx || 0) + dx * f; a.vy = (a.vy || 0) + dy * f; }
        if (!b.pin) { b.vx = (b.vx || 0) - dx * f; b.vy = (b.vy || 0) - dy * f; }
      }
    }
    for (const e of edges) {
      if (e.kind === 'tension') continue; // tension is a mark, not a spring
      let dx = e.nb.x - e.na.x, dy = e.nb.y - e.na.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - e.len) * 0.018;
      dx /= d; dy /= d;
      if (!e.na.pin) { e.na.vx = (e.na.vx || 0) + dx * f * 2; e.na.vy = (e.na.vy || 0) + dy * f * 2; }
      if (!e.nb.pin) { e.nb.vx = (e.nb.vx || 0) - dx * f * 2; e.nb.vy = (e.nb.vy || 0) - dy * f * 2; }
    }
    for (const n of nodes) {
      if (n.pin) { n.vx = n.vy = 0; continue; }
      n.vx = (n.vx || 0) * 0.55 * alpha; n.vy = (n.vy || 0) * 0.55 * alpha;
      n.x = Math.max(PAD + 20, Math.min(W - PAD - 20, n.x + n.vx));
      n.y = Math.max(PAD + 15, Math.min(H - PAD - 25, n.y + n.vy));
    }
  }

  // Overlap resolution: every node carries a label block below it, so the
  // clearance is radius + label room, not just radius (gallery's post-sim
  // overlap pass, label-aware).
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        // The room's label block runs two lines deep below its circle —
        // pairs touching it need more clearance than label-under-node pairs.
        const min = a.r + b.r + (a.kind === 'room' || b.kind === 'room' ? 92 : 52);
        if (d >= min) continue;
        const push = (min - d) / 2;
        dx /= d; dy /= d;
        if (!a.pin) {
          a.x = Math.max(PAD + 20, Math.min(W - PAD - 20, a.x - dx * push));
          a.y = Math.max(PAD + 15, Math.min(H - PAD - 25, a.y - dy * push));
        }
        if (!b.pin) {
          b.x = Math.max(PAD + 20, Math.min(W - PAD - 20, b.x + dx * push));
          b.y = Math.max(PAD + 15, Math.min(H - PAD - 25, b.y + dy * push));
        }
      }
    }
  }
}

/* ── render ───────────────────────────────────────────────────────────── */

function nodeSvg(n, i) {
  const cls = n.kind === 'room' ? 'net-forum' : n.kind === 'seat' ? 'net-person' : 'net-signal';
  const lines = [];
  if (n.kind === 'room') {
    lines.push(`<text class="n-label" y="${n.r + 19}" text-anchor="middle" style="font-size:11px;font-weight:700">${esc(n.sub)}</text>`);
    if (n.meas) lines.push(`<text class="n-meas" y="${n.r + 32}" text-anchor="middle">${esc(n.meas)}</text>`);
  } else if (n.kind === 'seat') {
    lines.push(`<text class="n-meas" y="${n.r + 14}" text-anchor="middle">${esc(n.meas)}</text>`);
    if (n.pole) lines.push(`<text class="pole-mark" y="${n.r + 26}" text-anchor="middle">${esc(n.pole)}</text>`);
  } else {
    lines.push(`<text class="${isVerified(n.tier) ? 'n-tier-verified' : 'n-tier-claimed'}" y="${n.r + 14}" text-anchor="middle">${esc(n.tier)} · ${esc(n.confidence || n.verification)}</text>`);
    lines.push(`<text class="n-meas" y="${n.r + 26}" text-anchor="middle">${esc(n.meas)}</text>`);
  }
  return `
    <g class="net-node fld-node ${cls}" data-i="${i}" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})">
      <circle r="${n.r}"></circle>
      <text class="n-label" y="${n.kind === 'room' ? 5 : -n.r - 9}" text-anchor="middle"
        style="font-size:${n.kind === 'room' ? 12 : 11}px">${esc(n.name)}</text>
      ${lines.join('')}
    </g>`;
}

function fieldSvg(data) {
  const { nodes, edges } = data;
  const edgeSvg = edges.map(e => e.kind === 'tension' ? `
      <line class="edge-tension" x1="${e.na.x}" y1="${e.na.y}" x2="${e.nb.x}" y2="${e.nb.y}"></line>
      <text class="tension-mark" x="${(e.na.x + e.nb.x) / 2}" y="${(e.na.y + e.nb.y) / 2 - 3}" text-anchor="middle">⚔</text>
      <text class="n-meas" x="${(e.na.x + e.nb.x) / 2}" y="${(e.na.y + e.nb.y) / 2 + 11}" text-anchor="middle">tension</text>`
    : `<line class="net-edge net-e-${e.kind === 'attends' ? 'attends' : 'cites'}" x1="${e.na.x}" y1="${e.na.y}" x2="${e.nb.x}" y2="${e.nb.y}"></line>`
  ).join('');
  return `
    <svg id="field" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="The run's field: the room at center, seats and evidence signals around it">
      <g fill="none">${edgeSvg}</g>
      ${nodes.map(nodeSvg).join('')}
      <g transform="translate(40,${H - 74})">
        <text class="scale-cap" x="0" y="-16" text-anchor="start">node size = evidence weight</text>
        <circle class="scale-ring" cx="8" cy="8" r="6"></circle>
        <text class="scale-lab" x="20" y="11">claimed · uncleared</text>
        <circle class="scale-ring" cx="8" cy="34" r="12"></circle>
        <text class="scale-lab" x="26" y="37">verified</text>
      </g>
    </svg>`;
}

/* ── detail well — the selected node's cited record ───────────────────── */

function detailHtml(state, data, id) {
  const n = data.byId.get(id);
  if (!n) return '';
  const adj = state.adjudication || {};
  const call = state.latency?.decision || state.screen?.verdict || '';
  const check = state.memo?.decision?.check_usd;
  const foot = `
    <div class="d-foot">
      <span class="sk-label">the call</span>
      <span class="call-word">${esc(call)}</span>
      ${check ? `<span class="sk-chip warn" style="font-size:10px">$${Math.round(check / 1000)}k fast check</span>` : ''}
      ${(adj.residual || []).length ? `<span class="sk-chip" style="font-size:10px">write vs wait · unblended</span>` : ''}
    </div>`;

  if (n.kind === 'room') {
    const conds = state.memo?.decision?.conditions || [];
    return `
      <div><div class="d-sel">selected node · the room</div>
        <div class="d-head"><span class="d-title">${esc(n.name)}</span>
          <span class="sk-chip blue" style="font-size:10px">${esc(adj.outcome || 'room')}</span></div></div>
      <div class="d-block"><span class="sk-label">the crux the room argued</span>
        <p class="d-crux">${esc(state.triage?.crux || '')}</p></div>
      ${conds.length ? `<div class="d-block"><span class="sk-label">${conds.length} conditions before wire</span>
        <p class="d-quote">${esc(conds[0])}</p></div>` : ''}
      <div class="d-block"><span class="sk-label">press again</span>
        <p class="d-crux">opens the forum — the room at work.</p></div>
      ${foot}`;
  }

  if (n.kind === 'seat') {
    const a = n.seat;
    return `
      <div><div class="d-sel">selected node · seat</div>
        <div class="d-head"><span class="d-title">${esc(a.handle)}</span>
          <span class="sk-chip" style="font-size:10px">${esc(a.id)}</span>
          ${n.pole ? `<span class="sk-chip ${n.pole === 'WRITE' ? 'ok' : 'warn'}" style="font-size:10px">${esc(n.pole.toLowerCase())}</span>` : ''}</div></div>
      <div class="d-block"><span class="sk-label">lens</span>
        <p class="d-crux">${esc(a.lens || '')}</p></div>
      ${a.decisive_question ? `<div class="d-block"><span class="sk-label">decisive question</span>
        <p class="d-quote">${esc(a.decisive_question)}</p></div>` : ''}
      <div class="d-block"><span class="sk-label">cites</span>
        <div class="d-cited">${(a.evidence_refs || []).map(s => `<span class="sk-chip" style="font-size:10px">${esc(s)}</span>`).join('')}</div></div>
      <div class="d-block"><span class="sk-label">press again</span>
        <p class="d-crux">opens their record — invitation, mandate, interviews.</p></div>
      ${foot}`;
  }

  const t = n.tension;
  const contra = t ? (
    (t.side_a?.evidence_refs || []).includes(n.sid) ? t.side_b : t.side_a) : null;
  const contraSid = contra ? (contra.evidence_refs || [])[0] : null;
  return `
    <div><div class="d-sel">selected node · signal</div>
      <div class="d-head"><span class="d-title">${esc(n.sid)}</span>
        <span class="sk-chip ${isVerified(n.tier) ? 'ok' : 'warn'}" style="font-size:10px">${esc(n.tier)}</span></div>
      <div class="measbar" style="margin-top:6px">
        <span class="tier ${isVerified(n.tier) ? 'v' : 'c'}">verification · ${esc(n.verification)}</span>
        ${n.confidence ? `<span class="tier">confidence · ${esc(n.confidence)}</span>` : ''}
        <span class="tier">${esc(n.meas)}</span>
      </div></div>
    ${n.quote ? `<div class="d-block"><span class="sk-label">the record</span>
      <p class="d-quote">${esc(n.quote)}</p></div>` : ''}
    ${contra ? `<div class="d-contra"><span class="sk-label">⚔ contradicts${contraSid ? ` · ${esc(contraSid)}` : ''}</span>
      <p class="d-quote">${esc(contra.claim || '')}</p></div>` : ''}
    ${t ? `<div class="d-block"><span class="sk-label">the tension this node holds</span>
      <p class="d-crux">${esc(t.name || '')}</p></div>` : ''}
    <div class="d-block"><span class="sk-label">cited by</span>
      <div class="d-cited">${n.citedBy.map(a => `<span class="sk-chip" style="font-size:10px">${esc(a.handle)} · ${esc(a.id)}</span>`).join('')}</div></div>
    ${foot}`;
}

/* ── mount ────────────────────────────────────────────────────────────── */

export function mountField(fieldHost, detailHost, state, run, { onEnterForum } = {}) {
  const data = buildField(state, run);
  if (!data.nodes.some(n => n.kind === 'seat')) return null; // legacy tape
  layoutField(data);

  fieldHost.innerHTML = `
    <div class="field-wrap">
      <div class="field-tag">graph runtime · settled</div>
      <div class="field-legend">
        <div class="k-forum">room</div>
        <div class="k-person">seat</div>
        <div class="k-signal">signal</div>
      </div>
      ${fieldSvg(data)}
    </div>`;

  let selected = 'room';
  const renderDetail = () => {
    detailHost.innerHTML = detailHtml(state, data, selected);
    fieldHost.querySelectorAll('.fld-node').forEach(el =>
      el.classList.toggle('sel', el.dataset.id === selected));
  };

  fieldHost.querySelector('#field').addEventListener('click', e => {
    const g = e.target.closest('.fld-node');
    if (!g) return;
    const id = g.dataset.id;
    if (id === selected) {
      // second press — enter the node's own surface
      const n = data.byId.get(id);
      if (n.kind === 'room') onEnterForum?.();
      else if (n.kind === 'seat')
        location.href = `?run=${encodeURIComponent(run)}&view=entity&e=person:${encodeURIComponent(n.slug)}`;
      return; // signals have no separate surface yet — the well IS the record
    }
    selected = id;
    renderDetail();
  });

  renderDetail();

  // External selection seam — the memo's marginal Source marks open a
  // signal's record here, in the well that already IS the evidence surface
  // (nature B: evidence is the organ of selection). Returns false when the
  // id is not on this field, so the caller can fall back honestly.
  return {
    select(id) {
      if (!data.byId.has(id)) return false;
      selected = id;
      renderDetail();
      fieldHost.querySelector(`.fld-node[data-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    },
  };
}
