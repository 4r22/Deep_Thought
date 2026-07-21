# vc-brain Frontend Sourcing Synthesis

## 1. Direct answer: is there a Bloomberg-terminal frontend worth adapting wholesale?

**No.** There is no open-source Bloomberg-style *terminal shell* that drops into a zero-dependency vanilla-JS no-build SPA. Every candidate that actually implements the full read surface (command grammar + tiled panes + entity pages) is a React/TypeScript/Vite project requiring a build step, and every candidate that is genuinely no-build is either a *single-purpose library* (a grid, a graph renderer, a fuzzy matcher, a docking layer) or a Go/Rust/Python **terminal TUI with no web frontend at all**. The terminal shell itself — the thing that ties command bar, function grammar, linked panes, and entity routing together — must be assembled by you from libraries plus hand-ported logic. What *does* exist and is worth taking is a very good crop of (a) one React command-grammar parser worth translating, and (b) a deep bench of MIT/Apache/BSD no-build libraries for the individual panes (graph, grid, docking, fuzzy search).

Two structural facts dominate the whole field:
- **The best interaction designs are locked in React** (OpenTerminalUI, gloomberg, FlexLayout, Lumino, kbar, cmdk) or in **terminal-cell TUIs** (k9s, cointop, mop, OpenBB CLI) — study-only, because neither render target maps to the DOM.
- **The best no-build code is all single-slice** — it solves one pane, never the shell.

---

## 2. Ranked shortlist by verdict

### ADOPT — vendor a prebuilt file, use as-is (all license + no-build verified)

**Fuzzy search / command-bar ranking (pick 1–2):**
| Lib | License | Why | Repo |
|---|---|---|---|
| **uFuzzy** | MIT | Best-in-class matcher, single IIFE `dist/uFuzzy.iife.min.js` (~15KB raw/~7.6KB gz), transparent overridable stats-based ranking + match ranges for highlighting — ideal to tune entity-vs-function priority | github.com/leeoniya/uFuzzy |
| **fuzzysort** | MIT | ~5KB UMD `window.fuzzysort`, weighted multi-key + `result.highlight()`, Sublime-palette heritage maps to "ENTITY FUNCTION" grammar; better-maintained than uFuzzy | github.com/farzher/fuzzysort |
| **Fuse.js** | Apache-2.0 | Weighted multi-field, but v7.5.0 is **ESM-only** (`fuse.min.mjs`, no UMD global) — load via `<script type=module>` | github.com/krisk/Fuse |
| **fzy.js** | MIT | 195-line ES6 module, `score`/`positions`/`hasMatch`, fzf-style consecutive/word-start scoring | github.com/jhawthorn/fzy.js |
| **MiniSearch** | MIT | UMD `window.MiniSearch` (~6KB gz), BM25 + `autoSuggest()` — use when indexing full brief/debate *bodies*, not just titles | github.com/lucaong/MiniSearch |
| **quick-score** | MIT | Quicksilver algo, prebuilt ESM `quick-score.esm.min.js`; **dormant since 2022** but complete | github.com/fwextensions/quick-score |
| **FlexSearch** | Apache-2.0 | UMD `window.FlexSearch`; overkill until 100k+ docs — keep in reserve | github.com/nextapps-de/flexsearch |

> Recommendation: **one command-string matcher (uFuzzy or fuzzysort) + optionally MiniSearch** for full-text over brief bodies. Do not stack more than two.

**Network graph (pick 1 — this is the required viz):**
| Lib | License | Size / entry | Notes | Repo |
|---|---|---|---|---|
| **Cytoscape.js** | MIT | `dist/cytoscape.min.js` UMD, ~342KB/106KB gz, zero deps | Best all-rounder: graph algorithms (shortest-path/BFS/centrality) for relationship queries, canvas OK to ~10k nodes | github.com/cytoscape/cytoscape.js |
| **force-graph** (vasturiano) | MIT | single self-contained UMD `dist/force-graph.min.js`, 178KB/58KB gz | Canvas2D, `nodeCanvasObject`/`onNodeClick` for terminal-styled nodes + pane linking; deps bundled | github.com/vasturiano/force-graph |
| **vis-network** | Apache-2.0 OR MIT | standalone UMD 632KB/150KB gz | Physics + clustering + events; canvas-themed via options API (won't inherit skin CSS) | github.com/visjs/vis-network |
| **cosmos.gl** | MIT | UMD ~652KB, WebGL2/GPU | Fastest at scale; heavy + needs GPU | github.com/cosmosgl/graph |
| **AntV G6** | MIT | UMD `window.G6`, ~1MB+ | Batteries-included (force/dagre/circular + behaviors) but heaviest | github.com/antvis/G6 |

> Recommendation: **Cytoscape.js** if you want built-in graph *algorithms* (relationship queries between persons/forums); **force-graph** if you want the lightest self-contained canvas renderer and will drive layout via d3-force semantics.

**Graph layout math (if hand-rolling the graph renderer instead):**
- **d3-force** (ISC, github.com/d3/d3-force) — *correction on the dossier:* the UMD does **not** bundle its 3 deps; vendor **4 files in order**: d3-dispatch → d3-quadtree → d3-timer → d3-force (~17.4KB total). Pure position math, you draw.
- **ngraph.forcelayout2d** + **ngraph.graph** (BSD-3-Clause, github.com/anvaka/ngraph.forcelayout) — 23.2KB + 4.5KB UMD, deps inlined; tiniest force sim.
- **WebCola** (MIT, github.com/tgdwyer/WebCola) — `cola.min.js` ~80KB, **constraint-based** layout (alignment/non-overlap/flow tiers) → readable terminal-grade graphs instead of a hairball; d3 sub-deps bundled.
- **VivaGraphJS** (BSD-3-Clause, github.com/anvaka/VivaGraphJS) — `vivagraph.min.js` 62KB, SVG+WebGL renderers; dormant/frozen but stable.

**Pane docking / tiling (pick 1):**
| Lib | License | Entry | Scope | Repo |
|---|---|---|---|---|
| **Dockview (dockview-core)** | MIT | `main.esm.mjs` ~807KB, zero runtime/peer deps, `<script type=module>` | Split/tab/group/**float/popout** + `toJSON()/fromJSON()` layout persistence; JS-exported themes + colored tab accents | github.com/mathuo/dockview |
| **Gridstack.js** | MIT | `gridstack-all.js` ~85KB + CSS | Drag/resize **grid-of-cards** + `save()/load()` JSON; dashboard paradigm, not docking tree | github.com/gridstack/gridstack.js |
| **dock-spawn-ts** | MIT | `lib/es5/dock-spawn-ts.js` global, or ESM modules; zero deps | VS-Code-style docking + `DockGraphSerializer`; ships own CSS to re-skin | github.com/node-projects/dock-spawn-ts |
| **Split.js** | MIT | `split.min.js` ~4.8KB UMD `window.Split` | Resize-gutter primitive only — pair with your own tiling | github.com/nathancahill/split |
| **WinBox.js** | Apache-2.0 | `winbox.bundle.min.js` ~16KB | Floating/popout windows only; frozen since 2023 | github.com/nextapps-de/winbox |
| **Golden Layout** | MIT | vendor `dist/esm/` tree + CSS (no single-file bundle in npm 2.6.0) | Full docking + serializable LayoutConfig; frozen 2022, awkward no-build | github.com/golden-layout/golden-layout |

> Recommendation: **Dockview** for the pane shell (drag-split, tabs, popout, JSON persistence) if you accept ~807KB; or **Split.js + hand-rolled tiling** if you want to stay lean. Gridstack if you prefer a saveable card grid over a docking tree.

**Data grid / blotter panes (pick 1, optional):**
| Lib | License | Entry | Notes | Repo |
|---|---|---|---|---|
| **regular-table** (FINOS) | Apache-2.0 | `dist/esm/regular-table.js` ~23KB, zero deps, self-registers `<regular-table>` | Virtual-scroll, async `setDataListener` viewport model, plain-CSS skinnable — cleanest fit for skin system (strip its Google-Fonts `@import` for offline) | github.com/finos/regular-table |
| **Tabulator** | MIT | `tabulator.min.js` ~400KB/120KB gz, zero deps | Tree/grouped data (forum→attendant→evidence), formatters for entity chips + click-to-link, CSS-var theming | github.com/olifolkerd/tabulator |
| **AG Grid Community** | MIT | UMD `agGrid.createGrid` ~900KB | Heaviest; use `theme="legacy"` to coexist with skin CSS; grouping/pivot are paid Enterprise | github.com/ag-grid/ag-grid |

> Recommendation: **regular-table** — Apache-2.0, ~23KB, zero-dep, styles a real `<table>` with your skin CSS. Tabulator if you need built-in tree/group/sort/export without writing it.

**Charts (optional, "no market data" slice):**
- **Apache ECharts** (Apache-2.0, github.com/apache/echarts) — UMD `echarts.min.js` ~1MB/335KB gz; **also has `series.type:'graph'` force layout** if you'd rather not add a dedicated graph lib. Themes are JS objects, not CSS.
- **Chart.js** (MIT, github.com/chartjs/Chart.js) — `chart.umd.min.js` ~65KB gz; simple score/distribution panes; no network graph.
- **Frappe Charts** (MIT, github.com/frappe/charts) — UMD, GitHub-style contribution **heatmap** for activity/coverage panes; dormant but stable.

### ADAPT — port a self-contained piece into vanilla JS

| Source | License | What to hand-port | Repo |
|---|---|---|---|
| **OpenTerminalUI** | MIT | **The crown jewel:** `frontend/src/components/layout/commanding.ts` (~750 lines) — the entity+function command-grammar parser ("AAPL DES"), 35+ function codes with aliases, regex tokenization + lookup maps, and a self-contained `fuzzyScore()`. Near-zero React coupling → translates cleanly to vanilla JS. This is the single most directly-relevant artifact in the entire field. | github.com/OpenTerminalUI |
| **cmdk** | MIT | `src/command-score.ts` (~140 lines, pure ES6, zero imports) — strip export/TS types for a vanilla fuzzy scorer with reference-grade weights (contiguous 1.0, word-boundary 0.9/0.8, gap ×0.999, distance ×0.9, case penalty) | github.com/pacocoursey/cmdk |
| **react-grid-layout** | MIT | Pure `src/core/` algorithms: `collision.ts`, `compactors.ts`, `layout.ts`, `position.ts` (framework-free, MIT) for auto-packing panes on an x/y grid | github.com/react-grid-layout/react-grid-layout |
| **match-sorter** | MIT | `src/index.ts` (~500 lines) ranking ladder (CASE_SENSITIVE_EQUAL > EQUAL > STARTS_WITH > WORD_STARTS_WITH > CONTAINS > ACRONYM > MATCHES); drop `remove-accents` for `String.normalize('NFD')` — deterministic prefix-first ranking suits command grammar | github.com/kentcdodds/match-sorter |
| **microfuzz** | MIT | Tiny ordered-subsequence matcher w/ highlight ranges; strip Flow types, inline `impl`/`normalizeText` into one ESM file | github.com/Nozbe/microfuzz |
| **fzf-for-js** | BSD-3-Clause | `dist/fzf.es.js` — fzf ranking model (prefix/word/camelCase bonuses, tiebreaks) + `.positions`; frozen 2023 | github.com/ajitid/fzf-for-js |
| **Springy** | MIT | `springy.js` core physics (~650 lines, zero-dep force sim); **reimplement its jQuery `springyui.js` renderer** in vanilla | github.com/dhotson/springy |

### REFERENCE — study the design, write your own (React/TUI/copyleft — nothing liftable)

**Command-grammar / palette design:**
- **gloomberg** (MIT, github.com/vincelwt/gloomberg) — `<FUNCTION> [ENTITY]` mnemonics by category, plugin registry (panes/tabs/columns/commands), vi-nav + Ctrl+P; but React@OpenTUI terminal-cell render — study `PLUGINS.md`.
- **k9s** (Apache-2.0, github.com/derailed/k9s) — colon-command alias router, `/` live fuzzy filter, Ctrl-A palette, context-sensitive keybinding legend, breadcrumb drill-down. Exceptionally documented (k9scli.io) — the best *command-bar + view-router* spec in the field.
- **kbar** (MIT, github.com/timc1/kbar) — action-registry architecture: declarative `{id,name,shortcut,keywords,section,perform,parent}` self-assembling palette; nested/child actions for entity→function drill-down.
- **OpenBB Legacy CLI** (MIT, github.com/OpenBB-finance) & **OpenBB Terminal** (AGPL-3.0) — filesystem-style menu-path grammar (`/equity/price`), uniform `--arg value` flags — informs entity→function→arguments routing.
- **cointop** (Apache-2.0, archived) / **mop** (MIT) / **ticker** (GPL) — vim-modal `:`/`/` grammar over dense tables (design only, all Go TUIs).

**Pane docking / linked-pane design:**
- **FlexLayout** (MIT, github.com/caplin/FlexLayout) — from a real trading-software vendor; JSON-tree layout model + border-docking/tab-overflow/maximize/popout. Best docking *design* reference; React-only.
- **Lumino** (BSD-3-Clause, github.com/jupyterlab/lumino) — `DockPanel` drag-to-split/drop-zone geometry + `CommandRegistry` (IDs + keybindings + CommandPalette). Framework buy-in, but top-tier patterns.
- **react-mosaic** (Apache-2.0, github.com/nomcopter/react-mosaic) — the canonical **layout-as-a-tree** data model (`MosaicNode`, `getNodeAtPath`, `updateTree`, `createBalancedTreeFromLeaves`) — the spec to reimplement for serializable tiled panes.
- **rc-dock** (Apache-2.0) — float/popout patterns; alpha, React-bound.

**Linked-pane "color channel" bus (Bloomberg linked-group metaphor):**
- **FDC3 standard** (Apache-2.0 code / Community Spec License prose, github.com/finos/FDC3) — colored **User Channels** (`joinUserChannel`/`broadcast`/`addContextListener`) + Intents+resolver → model panes as per-color channels with per-channel current-context fan-out, and DES/GP/GRAPH functions as resolvable intents. The formalized spec behind Bloomberg's colored linking groups. Implement in ~20 lines of vanilla pub/sub or `BroadcastChannel` — **do not import any @finos package** (all need bundlers). Also: morganstanley/fdc3-web, finos/fdc3-desktop-agent (archived) for the color-channel picker UI concept only.

**Entity-graph data model:**
- **flowsint** (Apache-2.0, github.com/reconurge/flowsint) — closest match to persons/forums/evidence as nodes/edges + enricher pattern (auto-expand a node's relationships); React/XYFlow, study the node/edge schema + enricher UX.
- **arbor.js** (MIT, github.com/samizdatco/arbor) — the *web-worker-offloaded layout* pattern (keep main thread responsive); abandoned 2012, jQuery — pattern only.

**Terminal aesthetic / no-build single-file reference:**
- **jmrothberg/bloomberg-terminal** (MIT-in-README, no LICENSE file — legally soft) — genuine zero-build single `index.html`; port its tiled-pane grid + pull-down tray CSS (~L112–162) and SVG micro-charts (`renderSparkline` L6285, `squarifiedTreemap` L6095). Ignore its entire market-data layer.

---

## 3. The specific subset for a zero-dependency vanilla-JS terminal

**Hand-port (translate source into your own vanilla `.js` — these are the load-bearing borrowings):**
1. **OpenTerminalUI `commanding.ts`** → your command-bar grammar parser + function registry. This is the highest-value port in the whole exercise; it is exactly the "AAPL Equity DES" grammar vc-brain wants.
2. **cmdk `command-score.ts`** (or **match-sorter** ladder) → the vanilla fuzzy scorer, if you want a ~140-line owned matcher instead of a vendored lib.
3. **react-mosaic tree model / react-grid-layout `core/`** → the serializable pane-layout data structure + collision/compaction, if you build your own tiler rather than adopting Dockview.
4. **FDC3 channel model** (~20 lines) → the colored linked-pane context bus.

**Script-tag / vendor-as-file (adopt, no porting):**
- **Fuzzy search:** uFuzzy or fuzzysort (+ MiniSearch for full-text bodies).
- **Network graph:** Cytoscape.js *or* force-graph (single decision — this is your required viz).
- **Panes:** Dockview (full docking) *or* Split.js + your own tiler (lean).
- **Grid panes:** regular-table (recommended) or Tabulator.
- **Optional charts:** Frappe Charts (heatmap) / Chart.js.

**Merely study (design spec, port nothing):**
- k9s + gloomberg + OpenBB CLI for command-grammar/keymap/router UX.
- FlexLayout + Lumino + react-mosaic for docking interaction and layout-tree serialization.
- flowsint for the entity-graph node/edge schema + enricher pattern.
- jmrothberg single-file for pane-tray CSS + SVG micro-chart recipes.

**Minimal viable stack (leanest path):** hand-ported `commanding.ts` grammar + uFuzzy (script tag) + Cytoscape.js (script tag) + Split.js + your own tiler + regular-table + a 20-line FDC3-style channel bus. Total vendored weight is dominated by the one graph lib.

---

## 4. What does NOT exist in open source — the gap you must build

1. **A no-build vanilla-JS terminal shell.** No project ties command bar + function grammar + linked tiled panes + entity routing together without React/a build step. The *shell orchestration* is yours to write. (Every full-featured candidate — OpenTerminalUI, gloomberg, feremabraz, Neuberg, FlexLayout — is React/Vite.)

2. **A command-grammar parser as a reusable no-build library.** The grammar exists only as (a) React-embedded source to port (OpenTerminalUI `commanding.ts`), or (b) TUI design specs (k9s, gloomberg, OpenBB). There is no drop-in JS package for "ENTITY FUNCTION" parsing — you port and own it.

3. **Bloomberg colored linked-pane behavior as code.** FDC3 defines the *pattern* (channels/broadcast/context), but every implementation is a bundler-dependent @finos package or a React component. The in-app context bus is ~20 lines you write yourself.

4. **Entity pages / research-corpus routing** (persons/forums/evidence/briefs). No open-source terminal models this domain; all are market-data-shaped (tickers/quotes/portfolios). The entity page IA, tabs, and cross-pane linking are bespoke. flowsint's node/edge schema is the closest *conceptual* prior art, not code.

5. **A network graph pre-styled as a terminal.** Every graph lib (Cytoscape/force-graph/vis-network/cosmos.gl) is a generic renderer; the Bloomberg-terminal node/edge aesthetic, hit-testing-to-pane-linking, and skin-CSS integration are yours. Canvas/WebGL libs also can't inherit your skin CSS (theme via their options API) — d3-force/SVG-rendered graphs *can*.

6. **The integration glue generally.** Every adoptable library is single-slice; nothing wires fuzzy-search results → command dispatch → pane spawn → entity load → graph focus. That orchestration layer is the actual product and has no open-source precedent at your constraints.

**Bottom line:** open source hands you excellent *parts* — a graph engine, a grid, a docking layer, a fuzzy matcher (all MIT/Apache/BSD, all script-tag-able) — plus one React grammar parser worth translating and a rich bench of TUI/React *design specs*. It does not hand you a terminal. The command shell, the entity domain model, the linked-pane bus, and all the glue are the build.