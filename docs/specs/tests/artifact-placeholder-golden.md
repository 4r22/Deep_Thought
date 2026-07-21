# Spec: rendered-artifact placeholder golden

**Status:** spec-ready · **Effort:** S · **Seam:** committed tapes + built experience/landing HTML + `verify_artifacts.py`
**Provenance:** pattern observed during a survey of other Hack-Nation submissions;
behavior re-specified from scratch (see docs/CLEAN-ROOM.md).
Adoption-room verdict SPIKE-FIRST (`rendered-artifact-placeholder-golden`).

## Why (vc-brain terms)

The failure class is *placeholder leakage into shipped bytes*: an unfilled `{{TOKEN}}`
surviving `fill()` (run.py:137 — unknown tokens deliberately pass through untouched, so
a stage that forgets a mapping key ships the literal token), a skeleton/"lorem"/"TODO"
string in a committed tape, or the experience viewer rendering an empty section
header over nothing. We already have a mechanical tape gate
(`intelligence/scripts/verify_artifacts.py` — schema walk + forum presence + latency
checks) and a corpus index (`experience/corpus.json`); neither scans *rendered content*
for placeholder debris. History says this bites: the post-sprint audit found committed
tapes failing their own verifier, and the landing/site pipeline stages HTML by hand.

## Behavioral contract

1. **Token-leak scan (corpus tapes).** The **scan set** is exactly the tapes named in
   `experience/corpus.json`'s `runs` array, each resolved to `intelligence/out/<name>`
   (day-one in this public copy: `ferrite-inverted`; the working repo adds `ferrite-full`) — the same set point 4
   walks; it is *not* "every committed `out/` dir". Extend the `verify_artifacts.py`
   walk (or a sibling test): for each tape in the scan set, every string value in every
   JSON artifact — including `memo.json` and the `memo-docs/*.json` (memo artifacts are
   JSON, covered by this string-value scan, not Markdown) — and every committed `.md`
   artifact (`forum-*.md`, `forum-debate.md`), MUST NOT match the unfilled-slot pattern
   `\{\{[A-Z0-9_]+\}\}`. The `fill()` single-pass design makes `{{TOKEN}}`-shaped text
   *inside hostile input values* legitimate — which is precisely *why* the scan set is
   the curated corpus runs (our own showcase fixtures) and not the adversarial/sourcing
   corpora (e.g. an internal adoption-forum corpus and sourcing tapes, not in this
   repo), which carry legitimate `{{TOKEN}}` payloads and placeholder prose in seat
   debates and applicant JSON, and are **out of scope** (as are any
   committed-but-unindexed tapes — point 4: staging is legal). The scan reports the
   artifact + JSON-path/line.
2. **Placeholder-vocabulary scan.** Same surfaces (tape JSON + `.md`) over the **same
   scan set as point 1**, word-boundary, case-insensitive: `lorem ipsum`, `TODO`, `TBD`,
   `PLACEHOLDER`, `xxx`, `CHANGEME`, `skeleton`. The list is a named constant (the HTML
   golden in point 3 applies it **minus `skeleton`** — see there). An allowlist entry
   identifies a legitimate occurrence by **path + word + expected count** (plus a
   free-text reason); the scan requires *exactly* that many word-boundary matches of the
   word in that file — **fewer** means an allowlisted occurrence is gone and the entry is
   **stale (fails)**, **more** means a new, un-allowlisted occurrence (**real leakage,
   fails**). Day-one the only allowlisted occurrences are `ferrite-inverted`'s four
   "placeholder classes" hits (two entries, one per file — see acceptance); e.g. a
   debate that genuinely discusses a `TODO` would earn its own count-keyed entry. This
   per-occurrence-count staleness matches the import-boundary spec's discipline.
3. **Built-page golden (experience + landing).** A test that reads the committed HTML
   entry points (`index.html`, `experience/index.html`, `experience/howto.html`) and
   asserts, static reads only (no server, no browser):
   - **Title.** The **first `<title>` in document order** — the document/head title —
     equals an exact committed golden string held in the test. SVG `<title>`
     accessibility labels inside diagram blocks are out of scope: `index.html` carries
     two such SVG titles ("how a decision flows", "the technical structure") besides its
     head title, so a single-title or list-equality assertion would break — pin only the
     first (head) title.
   - **Vocabulary.** No placeholder-vocabulary matches and no unfilled-slot pattern
     (`\{\{[A-Z0-9_]+\}\}`) in each page's **visible text nodes** — the text content
     between tags, never `src=`/`href=` attribute values, nor `<script>`/`<style>`
     bodies, nor comments. The HTML vocab list is the point-2 named constant **minus
     `skeleton`** (see reconciliation below). A per-file **path + word + expected count**
     allowlist (same shape as point 2's) covers any remaining legitimate visible-text
     occurrence; stale entries fail.

     *Reconciliation (`skeleton` is load-bearing repo vocabulary):* `skeleton.css` is
     the repo's no-JS fallback skin, referenced as a stylesheet asset by all three entry
     points (`index.html`, `experience/index.html`, `experience/howto.html`), and
     `experience/howto.html` compares against a `'skeleton'` skin name in its inline
     script — legitimate design vocabulary, not debris. Both defenses apply together:
     dropping `skeleton` from the HTML list clears the asset/skin references, and the
     visible-text scoping keeps every attribute value, script body, and comment out of
     scope regardless. (`skeleton` never appears in the committed tapes, so point 2's
     tape scan keeps it.)
   - **Local references resolve.** For **asset-bearing elements only** —
     `<link rel="stylesheet">` `href` and `<script>` `src` — each reference that is not
     `http(s):` or `data:` resolves to a committed file. **Strip any `?query` and
     `#fragment` first**: the committed pages ship cache-busters
     (`experience/app.css?v=2026-07-21-2`, `experience/index.html`'s
     `app.js?v=2026-07-21-2`, `landing.css?v=2026-07-19-1`). `<a href>` navigation links
     are **excluded** from this check — directory refs (`./`, `../`) and SPA routes
     (`?run=ferrite-full&view=overview`) are not asset paths and do not resolve to files.
4. **Corpus index integrity.** `experience/corpus.json` has two distinct shapes and the
   check operates on both explicitly:
   - The **`runs`** array is a list of bare run-name strings
     (e.g. `["ferrite-full", "ferrite-inverted"]`). Resolve each to
     `intelligence/out/<name>`, which MUST exist and pass (1) and (2). The uniqueness
     check applies to these `runs` entries.
   - The **`forums`** array holds objects with a relative `path` field. Validate a
     `forums[].path` for existence **only when it points under `intelligence/out/`**
     (e.g. `../intelligence/out/ferrite-inverted`). Paths outside that tree — the
     `research/`-prefixed research forums and their `docs` (`../research/gbrain/forum`,
     `../research/gbrain/*.md`) — are **out of scope** for this existence check.

   (Directional: index → disk. Unindexed tapes are allowed — staging is legal.)

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Plant `{{APPLICATION_JSON}}` in a copy of a tape's memo doc JSON (`memo-docs/*.json`)
  → scan fails naming file + location.
- Plant `TODO` in a tape artifact copy → fails; add an allowlist entry (path + word
  `TODO` + expected count 1) → passes; remove the occurrence but keep the entry →
  stale-allowlist failure (actual count 0 < expected 1).
- Break a local `<script src>`/`<link rel="stylesheet">` reference in an HTML fixture
  copy → resolution check fails.
- Change a golden `<title>` in the test → fails against the committed page (proving the
  golden bites), restore.
- Every tape in the scan set (the corpus `runs`) and every entry-point page pass at
  merge time. Two known-legitimate collisions are *not* leakage to "fix" — allowlisting
  a legitimate word is distinct from fixing real leakage:
  1. The flagship `ferrite-inverted` tape uses the word *placeholder* four times as
     substantive category analysis — two occurrences each in `memo.json` (lines 15,
     2208) and `memo-docs/competition.json` (lines 2, 148): "Reconstructed placeholder
     classes only", "Body placeholder classes … are reconstructed, not evidenced".
     Because the four occurrences live in only two files, they ship as **two day-one
     allowlist entries** — one per file: path + word `placeholder` + expected count 2 +
     reason — covering all four occurrences, not a code fix.
  2. The three entry points reference `skeleton.css` (and howto's inline skin
     comparison). These need **no allowlist entry** — they are handled by design: the
     point-3 HTML list is the constant minus `skeleton`, and the vocab scan reads
     visible text nodes only.

  Any *other* non-passing surface is real leakage; fixing it is in scope for the
  implementation — report what was found.

## Non-goals

- No HTTP serving, no headless browser, no screenshot diffing (the visual-review skill
  covers pixels; this spec covers bytes).
- No prose-quality judgment — vocabulary list only.
- No gating of *uncommitted* out/ dirs (work-in-progress tapes are legal until staged).

## Integration points

- `intelligence/scripts/verify_artifacts.py` (extend classify/walk — see its
  `classify(rel)`/`_walk` structure) or a sibling `intelligence/tests/test_artifact_hygiene.py`;
  HTML goldens in the same module.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
