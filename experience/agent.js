// Terminal agent — the client-side agentic loop of the dual-register palette
// (bead vc-brain-gg8). A sentence that falls through the command register lands
// here; the model's ONLY powers are the terminal grammar's own verbs
// (search/execute/navigate from terminal.js — parity law), dispatched locally
// in this loop. The server (scripts/agent_server.py) does inference only, with
// the system prompt and action registry pinned server-side.
import { esc } from './md.js?v=2026-07-21-2';
// MUST match the version app.js loads terminal.js at — a version skew here
// loads a SECOND terminal module whose corpus is empty (never booted), and
// the agent's search/execute silently return nothing.
import { searchEntities, executeCommand, navigateCommand } from './terminal.js?v=2026-07-21-12';

const MAX_HOPS = 8;
let messages = [];
let busy = false;
let wired = false;

const clip = (s, n = 12000) => s.length > n ? s.slice(0, n) + ' …[truncated]' : s;
const panel = () => document.querySelector('#agent-panel');

export function isActive() { return messages.length > 0; }

export function reset() {
  messages = [];
  busy = false;
  const p = panel();
  if (p) { p.hidden = true; p.innerHTML = ''; }
}

function addTurn(cls, html) {
  const p = panel();
  p.hidden = false;
  const div = document.createElement('div');
  div.className = `agent-turn ${cls}`;
  div.innerHTML = html;
  p.appendChild(div);
  p.scrollTop = p.scrollHeight;
  return div;
}

async function post(msgs) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: msgs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ||
    `agent endpoint unreachable (${res.status}) — serve via scripts/agent_server.py, not a plain http.server`);
  return data.content || [];
}

async function runTool(tool) {
  try {
    if (tool.name === 'search') return await searchEntities(tool.input.query || '');
    if (tool.name === 'execute') return await executeCommand(tool.input.command || '');
    if (tool.name === 'navigate') return await navigateCommand(tool.input.command || '');
    return { error: `unknown tool ${tool.name}` };
  } catch (err) { return { error: String(err) }; }
}

export async function ask(text) {
  if (busy || !text) return;
  busy = true;
  if (!wired) { // command chips in the transcript re-run their command
    wired = true;
    panel().addEventListener('click', e => {
      const chip = e.target.closest('.agent-chip[data-cmd]');
      if (chip) navigateCommand(chip.dataset.cmd);
    });
  }
  messages.push({ role: 'user', content: [{ type: 'text', text }] });
  addTurn('agent-you', `<span class="sk-label">you</span><span>${esc(text)}</span>`);
  const status = addTurn('agent-status', `<span class="sk-label">agent</span><span>thinking…</span>`);
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const content = await post(messages);
      messages.push({ role: 'assistant', content });
      const tool = content.find(b => b.type === 'tool_use');
      if (!tool) {
        const t = content.find(b => b.type === 'text');
        status.remove();
        addTurn(t?.clarify ? 'agent-clarify' : 'agent-answer',
          `<span class="sk-label">agent</span><span>${esc(t?.text || '(no answer)')}</span>`);
        return;
      }
      const arg = tool.input.command ?? tool.input.query ?? '';
      addTurn('agent-cmd', `<span class="sk-label">ran</span>
        <button class="sk-chip blue agent-chip" data-cmd="${esc(arg)}"
                title="run this command">› ${esc(tool.name)} ${esc(arg)}</button>`);
      panel().appendChild(status); // status line stays last
      status.querySelector('span:last-child').textContent = 'reading result…';
      const result = await runTool(tool);
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: clip(JSON.stringify(result)) }] });
    }
    status.remove();
    addTurn('agent-error', `<span class="sk-label">agent</span><span>stopped after ${MAX_HOPS} steps without a final answer — try narrowing the question.</span>`);
  } catch (err) {
    status.remove();
    addTurn('agent-error', `<span class="sk-label">agent</span><span>${esc(String(err.message || err))}</span>`);
  } finally {
    busy = false;
    document.querySelector('#palette-input')?.focus();
  }
}
