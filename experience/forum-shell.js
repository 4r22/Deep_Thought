// forum-shell.js — the structure-rail + work-field layout, built as PANE HOSTS.
//
// Load-bearing architecture (reachability memo wt-001): a section renders into
// a HOST element passed as a parameter, never into a hardcoded content root.
// The rail and the field are two hosts; each section descriptor carries its own
// `mount(host, fresh)` renderer. Because content only ever knows the host it is
// handed, the stage-2 two-pane field (a second work-field host) is reachable
// later WITHOUT re-refactoring any section renderer — you add a host and mount
// a section into it.
//
// The rail is DATA-DRIVEN: `sections` is a list of descriptors. Adding a
// section (e.g. a coming `counsel` stage) is a data change — push a descriptor,
// no surgery. Two shapes:
//   leaf  : { id, label, badge?, mount(host, fresh) }
//   group : { id, kind: 'group', label, children: [ leaf, … ] }
// A group is a dropdown (chevron ▸/▾) whose children are the selectable leaves —
// this is how each seat exposes its blind pre / post-debate interviews.
import { esc } from './md.js?v=2026-07-21-5';

const railNodeHTML = s => {
  if (s.kind === 'group') {
    return `<div class="rail-group" data-group-of="${esc(s.id)}">
      <button class="rail-node rail-toggle" type="button" data-group="${esc(s.id)}" aria-expanded="false">
        <span class="rail-word">${esc(s.label)}</span><span class="chev" aria-hidden="true">▸</span>
      </button>
      <div class="rail-sub" hidden>${(s.children || []).map(c =>
        `<button class="rail-leaf" type="button" data-sec="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>
    </div>`;
  }
  return `<div class="rail-group">
    <button class="rail-node" type="button" data-sec="${esc(s.id)}">
      <span class="rail-word">${esc(s.label)}</span>${s.badge != null
        ? `<span class="chev" aria-hidden="true">${esc(String(s.badge))}</span>` : ''}
    </button>
  </div>`;
};

// Flatten leaves (top-level leaves + group children) to id → descriptor.
function flatten(sections) {
  const map = new Map();
  for (const s of sections) {
    if (s.kind === 'group') for (const c of s.children || []) map.set(c.id, { ...c, groupId: s.id });
    else map.set(s.id, s);
  }
  return map;
}

function firstSelectable(sections) {
  for (const s of sections) {
    if (s.kind === 'group') { if (s.children?.length) return s.children[0].id; }
    else if (s.mount) return s.id;
  }
  return null;
}

// Mount the rail+field shell into `root` (itself a host handed to us).
// Returns { select } so callers can drive selection programmatically.
export function mountForumShell(root, { title, outcome, sections, initialId, note } = {}) {
  root.innerHTML = `
    <div class="forum-shell">
      <aside class="struct-rail" data-pane="rail" aria-label="room sections">
        <div class="rail-head">
          <span class="sk-label">${esc(title || 'room')}</span>
          ${outcome ? `<span class="sk-chip blue">${esc(outcome)}</span>` : ''}
        </div>
        ${note ? `<p class="axis-notes">${esc(note)}</p>` : ''}
        <nav class="rail-nodes">${sections.map(railNodeHTML).join('')}</nav>
      </aside>
      <section class="work-field" data-pane="field" aria-live="polite"></section>
    </div>`;

  const rail = root.querySelector('.struct-rail');
  const field = root.querySelector('.work-field');
  const flat = flatten(sections);
  let gen = 0;

  const markSelected = id => {
    rail.querySelectorAll('[data-sec]').forEach(n =>
      n.classList.toggle('sel', n.dataset.sec === id));
    // a group is "active" when one of its children is the live section
    const parentId = flat.get(id)?.groupId;
    rail.querySelectorAll('.rail-toggle').forEach(t =>
      t.classList.toggle('active', t.dataset.group === parentId));
  };

  const expandGroup = (groupId, open) => {
    const wrap = rail.querySelector(`.rail-group[data-group-of="${CSS.escape(groupId)}"]`);
    if (!wrap) return;
    const sub = wrap.querySelector('.rail-sub');
    const toggle = wrap.querySelector('.rail-toggle');
    const next = open ?? sub.hidden;
    sub.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    toggle.querySelector('.chev').textContent = next ? '▾' : '▸';
  };

  const select = id => {
    const sec = flat.get(id);
    if (!sec || !sec.mount) return;
    const mine = ++gen;
    markSelected(id);
    if (sec.groupId) expandGroup(sec.groupId, true);
    field.innerHTML = '';
    field.scrollTop = 0;
    const fresh = () => mine === gen;
    // mount(host, fresh): the section renders into the FIELD host it is handed.
    Promise.resolve(sec.mount(field, fresh)).catch(err => {
      if (fresh()) field.innerHTML =
        `<div class="run-card"><p class="muted">could not render this section — ${esc(String(err))}</p></div>`;
    });
  };

  rail.addEventListener('click', e => {
    const toggle = e.target.closest('.rail-toggle');
    if (toggle) { expandGroup(toggle.dataset.group); return; }
    const node = e.target.closest('[data-sec]');
    if (node) select(node.dataset.sec);
  });

  select(initialId && flat.has(initialId) ? initialId : firstSelectable(sections));
  return { select };
}
