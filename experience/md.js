// Minimal markdown renderer for the subset the pipeline emits:
// ## headings, numbered/bulleted lists, **bold**, *italic*, paragraphs,
// and the pipeline's bracket tokens — [C1] claim refs, [sig-xxx] signal
// refs, [high|medium|low] confidence tags, [anything else] neutral chips.

export function esc(s) {
  // quotes too — esc() is also the guard in attribute position
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function bracketChip(content) {
  const c = content.trim();
  if (/^C\d+$/.test(c)) return `<span class="ref claim-ref" data-claim="${c}">${c}</span>`;
  if (/^g?sig-[\w.-]+$/.test(c)) return `<span class="ref sig-ref" data-sig="${c}">${c}</span>`;
  if (/^(high|medium|low)$/.test(c)) return `<span class="ref conf-${c}">${c}</span>`;
  // comma-separated list where every part is a ref → one chip per part
  const parts = c.split(/,\s*/);
  if (parts.length > 1 && parts.every(p => /^(C\d+|g?sig-[\w.-]+)$/.test(p)))
    return parts.map(bracketChip).join(' ');
  return `<span class="ref plain">${c}</span>`;
}

export function inline(s) {
  let out = esc(s);
  out = out.replace(/\[([^\]\[]+)\]/g, (_, c) => bracketChip(c));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code class="mono">$1</code>');
  return out;
}

export function md(src) {
  const lines = (src || '').split('\n');
  const html = [];
  let list = null; // 'ul' | 'ol' | null
  let para = [];

  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  const flushPara = () => {
    if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);

    // Blank lines flush paragraphs but do NOT close lists — the pipeline's
    // markdown separates numbered items with blank lines, and closing here
    // would restart <ol> numbering at every item.
    if (!line.trim()) { flushPara(); continue; }
    if (h) {
      flushPara(); closeList();
      const level = Math.min(h[1].length + 2, 5); // demote: md ## → h4 inside cards
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (ol) {
      flushPara();
      if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
      html.push(`<li>${inline(ol[1])}</li>`);
    } else if (ul) {
      flushPara();
      if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
      html.push(`<li>${inline(ul[1])}</li>`);
    } else {
      if (list && !para.length) closeList(); // plain prose ends an open list
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  return html.join('\n');
}

// The debate transcript is rigidly structured markdown:
//   ## Turn N
//   - speaker: bull|bear|moderator
//   - type: assert|dispute|refine|moderator-question|…
//   - target: …
//   - claim: …
//   - evidence-anchor: [sig-a, sig-b]
export function parseDebate(src) {
  const turns = [];
  const title = (src.match(/^#\s+(.*)/m) || [])[1] || 'Debate';
  for (const block of src.split(/^## Turn (\d+)\s*$/m).slice(1).reduce((acc, cur, i, arr) => {
    if (i % 2 === 0) acc.push({ n: cur, body: arr[i + 1] || '' });
    return acc;
  }, [])) {
    const field = name => {
      const m = block.body.match(new RegExp(`^- ${name}:\\s*(.*)$`, 'm'));
      return m ? m[1].trim() : '';
    };
    turns.push({
      n: Number(block.n),
      speaker: field('speaker'),
      type: field('type'),
      target: field('target'),
      claim: field('claim'),
      anchor: field('evidence-anchor'),
    });
  }
  return { title, turns };
}
