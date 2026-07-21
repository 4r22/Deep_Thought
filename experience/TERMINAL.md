# The terminal — usage + an honest ledger

The `experience/` app has two faces. The **run viewer** (overview / screen /
triage / forum / axes / memo — the forum is skipped only on a reject screen or
a blank crux) renders one pipeline run. The **terminal** turns the
whole corpus — persons, forums, evidence signals, runs, docs — into
addressable entities you navigate by keyboard, Bloomberg-style. This doc
covers the terminal: how to drive it, how it works, and how much of it is
load-bearing engineering versus prototype scaffolding.

There is no video. This is code we wrote; the walkthrough is below and the
live app.

---

## 1. Drive it in 60 seconds

```sh
# from the repo root — no build step, any static server
python3 -m http.server 8617
# open http://localhost:8617/experience/?run=ferrite-inverted

# OR, to also enable the palette's agent register (natural language):
python3 scripts/agent_server.py 8621
```

- **⌘K** / **Ctrl-K** / **`/`** — open the command palette.
- Type an **entity**: `eghbal`, `ferrite-inverted`, `sig-004`. Fuzzy-matched, ranked.
- Type **entity + function**: `eghbal pre`, `ferrite-inverted adj`, `graham post`.
- Type a **global**: `net` (network graph), `help`.
- Type a **sentence** — `what did the room decide about ferrite?` — and the
  last row offers **ask the agent** (bead vc-brain-gg8): an LLM that answers
  by running the SAME grammar (`search` / `execute` / `navigate` over this
  table are its only tools — parity law), rendering every command it runs as
  a clickable chip in a transcript below the results. It can answer in prose,
  or ask you a clarifying question — the input box is the reply field; the
  conversation persists until Esc. Requires `scripts/agent_server.py` (worker
  backends mirror `intelligence/run.py`: cursor CLI / API key / claude CLI);
  under a plain `http.server` the row still appears and fails honestly.
- **↑ ↓** move, **Enter** open, **Esc** close.
- **1–6** switch views (6 = network). **Esc** also closes the settings drawer.

Every `sig-*` chip and every person name anywhere in the app is a link.
That is the whole point (see §3).

Forum persons are AI-simulated personas of public figures — modeled lenses,
not those people's real views or endorsements.

### The grammar

The pattern is Bloomberg's `AAPL US Equity DES` — an **entity key** followed
by a **function mnemonic** — reimplemented over vc-brain's own nouns. No
market data.

| Entity type | Functions (first = default) | Meaning |
|---|---|---|
| **person** | `DES` · `PRE` · `POST` · `NET` | profile · blind pre-interview · post-debate interview · graph |
| **forum** | `DES` · `DEB` · `ADJ` · `NET` | crux + roster · debate transcript · adjudication · graph |
| **signal** | `DES` | evidence: trust tier, raw refs, who cites it |
| **run** | `OPEN` | open the run in the viewer |
| **doc** | `DES` | rendered markdown record |
| _global_ | `NET` · `HELP` | network graph · command reference |

### Deep links

Every page is a URL — bookmarkable, shareable, back/forward-safe:

```
?run=ferrite-inverted&view=entity&e=person:nadia-eghbal&fn=PRE
?run=ferrite-inverted&view=entity&e=forum:ferrite-inverted&fn=ADJ
?run=ferrite-inverted&view=entity&e=signal:sig-004
?run=ferrite-inverted&view=network
```

### The network view (key 6 / `net`)

Force-directed graph: forums (green) · attendants (blue) · suggested
attendants (amber, dashed) · cited evidence signals (faint). Drag to move,
wheel to zoom, click a node to open its page. The **signals** toggle strips
the evidence layer for a cleaner person/forum view.

---

## 2. How it works

Three modules mount on the existing skeleton+skin system; none of them touch
`skeleton.css`.

- **[terminal.js](terminal.js)** — at boot, reads [corpus.json](corpus.json)
  (the manifest) then fetches each forum's `seed.json` / `adjudication.json`
  / `evidence.json` and flattens everything into one in-memory **entity
  index** (`id → entity`, plus a search haystack per entity). Owns the
  palette, the fuzzy scorer, the grammar parser, and the router. Entity ids
  are typed and canonical: `person:nadia-eghbal`, `forum:ferrite-inverted`,
  `signal:sig-004`, `run:ferrite-inverted`.
- **[entity.js](entity.js)** — one renderer per entity type. Person pages
  carry invitation, mandate, opening lean, post-debate movement, and the
  residual position; PRE/POST/DEB tabs lazily fetch the markdown. Signal
  pages show trust tier and back-compute **who cites this** from the seat
  mandates.
- **[graph.js](graph.js)** — a hand-rolled SVG force layout (velocity
  Verlet, pairwise repulsion, spring edges), no library.
- **[corpus.json](corpus.json)** + **[build-corpus.py](build-corpus.py)** —
  the manifest and its stdlib regenerator. `build-corpus.py` scans
  `intelligence/out/*` for runs and `research/*/forum` for forums (a forum =
  a directory with a `seed.json`). Commit the output; rerun after adding a
  run or forum.

Adding a forum is zero-code: drop it under `research/<name>/forum/`, run
`python3 experience/build-corpus.py`, reload. New persons, signals, and the
graph all appear.

---

## 3. Why it's legit

The core is not a mock. The things that make it real:

- **The abstraction is the right one, reimplemented cleanly.** "Everything
  is an addressable entity; every page is entity × function" is exactly what
  a Bloomberg terminal *is*, correctly identified and clean-roomed (no code
  lifted from any terminal — see [research/oss-terminal-sweep/REPORT.md](../research/oss-terminal-sweep/REPORT.md),
  which confirmed no adoptable open frontend exists).
- **The citation spine works end-to-end.** Debate turn → `sig-004` chip →
  signal page → "cited by Nadia Eghbal" → her profile → her pre-interview
  with its own evidence chips. Legitimacy in a terminal is *always being one
  click from the source*; this closes that loop over the pipeline's real
  output, verified in the browser.
- **It's data-driven, not hand-fixtured.** Nothing is hardcoded per forum.
  The index is built from the pipeline's own JSON; the person network is the
  forum's actual invitation/attendance/suggested-attendant graph.
- **Zero dependencies, no build step.** No bundler, no npm tree, no supply
  chain, nothing to rot. It runs off any static server, forever.
- **It survived adversarial review.** A 15-agent review pass produced 9
  confirmed findings (two XSS hardenings, an async-fetch race fixed with a
  render-generation guard, reduced-motion, an rAF leak, a mobile scroll
  trap, blank-page fallbacks); all fixed and re-verified. That is more rigor
  than a prototype usually gets.

The bones — entity model, grammar, router, citation graph — are production
shape.

---

## 4. How it's hacky

Honest debt. None of this is hidden; the trade was "ship a working read
surface today," and these are the corners cut to do it.

- **Prototype, not product, in the flesh.** Where a production build would
  adopt a library, we hand-rolled:
  - The **fuzzy scorer** is ~15 lines. Fine for a small index; not
    fzf-grade. The OSS sweep flagged uFuzzy / fuzzysort as the upgrade.
  - The **force graph** is hand-written physics with **O(n²) repulsion** and
    no real layout algorithm. Great at ~37 nodes; it will get slow and
    hairbally in the hundreds. No quadtree, no clustering.
- **It's terminal-*flavored*, not a full terminal.** Single active view with
  fast keyboard routing — **no linked tiled panes**, which is the signature
  Bloomberg feel (select in one pane, others repaint). That's deliberately
  deferred to vc-brain-2uc (linked-pane bus + tiling).
- **The whole corpus loads client-side at boot and lives in memory.** Fine
  for one small forum (132 entities); it won't scale to a large corpus
  without a real index, pagination, or a server. `corpus.json` is a
  committed, manually-regenerated file — a no-build win that can go stale.
- **Rendering is `innerHTML` string interpolation throughout.** No template
  layer, no vdom. We hardened `esc()` to escape quotes and audited every
  sink, but this model is inherently more error-prone than a framework — the
  `#entity-doc` shared-id race we had to guard is exactly the class of bug a
  component system gives you for free.
- **No tests.** Verification was browser-driven only. There is no regression
  net; changing a renderer can silently break another path.
- **One known open bug:** dragging graph nodes triggers text selection (the
  blue flash) — vc-brain-t04.

---

## 5. The one-line verdict

A **legit prototype**: the architecture is sound and the differentiated
thing — a person-network read surface where every claim is one click from
its evidence — genuinely works. It is hand-rolled where a production version
would adopt libraries, built and verified in a single session, browser-tested
not test-covered, and a flavored read surface rather than a full multi-pane
terminal. The debt is real, tracked in beads, and was a conscious trade for
shipping something that runs today.
