# Spec: import-boundary and forbidden-term source scans

**Status:** spec-ready · **Effort:** S · **Seam:** repository source tree (static tests)
**Provenance:** pattern observed during a survey of other Hack-Nation submissions
(word-boundary term scans — so "mit" cannot match "commit" — import-boundary CI gates,
and tool-binding line scans); behavior re-specified from scratch (see
docs/CLEAN-ROOM.md). Adoption-room verdict SPIKE-FIRST
(`forbidden-term-source-scan-gate`).

## Why (vc-brain terms)

Some architectural bans cannot be asserted behaviorally because the banned thing, when
present, *works fine* — it just violates the design. Ours, today, enforced by nothing:

- **Network/SDK containment:** the `anthropic` SDK must be imported in exactly one
  place — inside `get_client()` (`intelligence/run.py`, the lazy import) — and nowhere
  else in `intelligence/` or its tests. The offline replay suite's promise ("no API key
  exists and none is needed", `test_pipeline_replay.py` docstring) is only structural
  if no test module can import a network client.
- **Zero-dep experience:** `experience/**/*.js` (top-level modules and `skins/`) must
  contain no `import`/`require` of package-manager modules and no CDN/script-src URLs —
  the zero-dependency claim is a
  documented strength ("Zero-dependency Experience layer") with no test.
- **Stdlib-only sourcing:** `intelligence/sourcing.py` imports only stdlib + `run` (its
  documented posture against untrusted archives).
- **Register bans:** the deliberation register bans scoreboard-laundering vocabulary —
  no `composite_score`/`blended_score`/`overall_score` identifier or prompt phrase in
  `intelligence/prompts/**` or the counsel/axes code paths (the three-axes-never-
  averaged doctrine, `docs/COUNSEL.md`). Bare `composite`/`blended` are legitimate
  register words (persona composition) and are *not* the target — see the rule below.

## Behavioral contract

1. **Scanner.** A stdlib test module that walks a declared file set (glob list, a named
   constant per rule) and applies word-boundary regex checks. Word-boundary is
   mandatory (the "mit"≠"commit" discipline). Each rule declares: id, file globs,
   pattern, an allowlist of exempt path:reason pairs (e.g. `run.py get_client` for the
   `anthropic` import), and a one-line rationale. The core matcher takes an injectable
   root (or explicit file list) rather than hard-coding the repo root, so each acceptance
   case can run a rule over a tempdir fixture holding the planted fault — the tracked tree
   is never mutated. Run against the real repo root, every rule is green (see baseline
   case under Acceptance). **Self-exclusion (mandatory):** the scanner removes its own
   module file (`intelligence/tests/test_source_boundaries.py`) from *every* rule's file
   set before matching. It necessarily spells out the very tokens it bans — the
   `no-network-libs-in-tests` literals and the `anthropic-containment` fixture — and both
   `intelligence/tests/**` (the `no-network-libs-in-tests` glob) and `intelligence/**/*.py`
   (the `anthropic-containment` glob) would otherwise cover it and turn the baseline red.
   As a second belt, every planted-fault fixture string is assembled by concatenation
   (`"import " + "anthropic"`, `"overall" + "_score"`, `"composite" + "_score"`) so that no
   literal banned token sits in the scanned tree even should a future rule reach this file —
   the same green-baseline hygiene `no-score-laundering` earns by housing its constant in
   `registers.py`.
2. **Rules (minimum set):**
   - `anthropic-containment`: `import anthropic` / `from anthropic` matches only at
     the allowlisted `get_client` site (`run.py:172` today, the sole match) across
     `intelligence/**/*.py` — a glob that also covers this scan module (self-excluded, per
     the Scanner clause) and `registers.py` (which carries no network/SDK import).
   - `no-network-libs-in-tests`: network imports banned in `intelligence/tests/**`
     (Python) and `memory/**/*.test.ts` (TypeScript). Python pattern:
     `requests|httpx|urllib\.request|socket`. TS pattern (enumerated — do not extrapolate
     "equivalents"): `fetch\(|\baxios\b|node:(net|http|https|dgram|tls)|(import|require)\s*\(?['"]https?`.
     Both halves are green on the clean tree — no `intelligence/tests/**` file (the scan
     module itself, which spells the literals, is self-excluded — see the Scanner clause)
     and none of the `memory/**/*.test.ts` files (14 today) match.
   - `experience-zero-dep`: in `experience/**/*.js` (recursive — top-level modules plus
     `experience/skins/*.js`, e.g. `skins/glass-driver.js`, which is clean today so the
     widened glob keeps the baseline green and closes the gap where a future bare import
     under `skins/` would escape a top-level-only scan), ban `require(`, bare-specifier ES
     imports — `^import .* from ['"](?![./])` (a specifier that does *not* start with `./`
     or `../`) — and remote script/style URLs (`https?://.*\.(js|css)`). Same-dir relative
     ES imports are exempt: `import … from './x.js'`, including `?query` cache-buster
     suffixes such as `'./md.js?v=2026-07-21-2'` — these are the module graph's own edges,
     not a package-manager dependency (all 9 `.js` imports across `experience/**/*.js`
     today are of this form; `skins/glass-driver.js` declares none). In committed
     `experience/*.html`, ban the same remote-URL pattern; `data:`
     URIs and same-dir relative `<script>`/`<link>` refs are exempt. The three font
     `<link>`s in each of `experience/index.html` and `howto.html` (`fonts.googleapis.com`
     preconnect, `fonts.gstatic.com` preconnect, and the `css2` stylesheet) carry no
     `.js`/`.css` path suffix — the `css2` stylesheet URL ends `/css2?family=…`, no dotted
     suffix, and both preconnects likewise — and so fall outside `https?://.*\.(js|css)` by
     construction — do not widen the pattern to a bare `https?://` or the baseline turns
     red.
   - `no-score-laundering`: word-boundary `composite[_ ]?score|blended[_ ]?score|overall[_ ]score`
     — the *score* sense only — banned in `intelligence/prompts/**` and, `code-only`, in
     `intelligence/run.py`. Narrowed deliberately: bare `composite`/`blended` are
     legitimate register vocabulary — `intelligence/prompts/forum/seed.md:42` ("composite
     archetypes are banned") and `intelligence/prompts/potential.md:43` ("Invented
     composites are banned") are about persona composition, not scores, and MUST stay green
     with *no* allowlist entry. The laundering pattern itself is a shared constant that
     lives in a neutral module `intelligence/registers.py`, which no scan rule's globs
     cover — deliberately *not* in `run.py` (this rule scans run.py code-only and would
     flag the definition) and *not* in `prompts/**`. **This spec's implementation bead is
     the named creator/owner of `intelligence/registers.py`** — the repo's shared-constants
     module. Sibling specs (`honesty-closed-oracle-scan`, `claim-provenance-completeness`,
     `verbatim-span-citation-gate`, `rendered-figure-provenance-gate`,
     `rationale-gate-fidelity` — owner of the `gate_record` + `is_negated` helpers placed
     there — and `verdict-rubric-clamp`, a `gate_record` consumer) import from or extend
     it under a *first-to-land creates, others extend* rule; whichever ships first stands up
     the module, but this spec is the designated owner of its shape. This test module imports
     the laundering constant from `registers.py`; the runtime honesty gate
     (`honesty-closed-oracle-scan`) imports the same constant from the same place. run.py
     is green today (no match).
   - `sourcing-stdlib-only`: import lines in `intelligence/sourcing.py` must name a stdlib
     module or `run`. Assert against a committed allowlist hand-authored in the test — do
     *not* call `sys.stdlib_module_names` (added in Python 3.10; this interpreter is
     3.9.6). The allowlist need only cover sourcing.py's actual import set — `argparse`,
     `json`, `pathlib`, `re`, `subprocess`, `sys` (`sourcing.py:40-45`, 2026-07-21) — plus
     `run` (imported as `intelligence_run`, `sourcing.py:48`); any import outside that set
     fails. This allowlist is a snapshot of sourcing.py's import set at 2026-07-21: the
     `reskin-similarity-guard` spec adds a sibling module and hook to `sourcing.py`, and any
     new stdlib import it introduces is added to this allowlist *with that spec* (the
     reciprocal note lives in `reskin-similarity-guard.md`).
3. **Failure output** names rule id, file, line number, and matched text. Allowlist
   entries that no longer match anything are themselves failures (stale-allowlist
   discipline, per an exemplar observed in the submissions survey).
4. **Comment/docstring awareness:** rules default to scanning all lines; a rule may
   declare `code-only`. Implement it at line/regex level (no AST, per Non-goals): strip
   `#`-comments (unquoted `#` to end of line), then strip triple-quoted blocks via a
   `"""`/`'''` open/close toggle across lines. The cross-line docstring strip is
   explicitly best-effort — the acceptance bar is only the `#`-comment path (below); an
   open-and-close-on-one-line or nested triple-quote need not be handled robustly. The
   `no-score-laundering` rule on run.py is the only `code-only` rule.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Plant `import anthropic` in a test-module fixture → `anthropic-containment` fails
  naming the line; remove → green.
- Plant a remote `<script src="https://cdn.example.com/x.js">` in an `experience` HTML
  fixture → `experience-zero-dep` fails. Separately, a `.js` fixture whose only import is
  `import { x } from './y.js?v=1'` (same-dir relative, cache-buster suffix) PASSES —
  proving the narrowed rule does not flag the module graph's own edges.
- Plant `overall_score` as an identifier in a run.py fixture → `no-score-laundering`
  fails; the same word inside a `#`-comment passes (code-only rule proven).
- Stale allowlist: point an allowlist entry at a nonexistent site → fails.
- "mit"≠"commit": a file containing only "commit" does NOT trip a word-boundary rule
  for "mit" (regression-pin the boundary semantics).
- No self-trip: the scanner's own module (`intelligence/tests/test_source_boundaries.py`),
  run through *every* rule over the real repo root, stays green — even though it spells the
  banned literals and holds the planted-fault fixtures. This pins both halves of the
  Scanner's self-exclusion mechanism (own-file exclusion + concatenation-built fixtures),
  mirroring the `registers.py` relocation that keeps `no-score-laundering` from flagging its
  own definition.
- Whole-repo baseline: every rule run over the real repo root, with no planted fault, is
  green — the "remove → green" end state, pinning the corrected patterns against drift.

## Non-goals

- No CI wiring in this spec (separate chore; the test must simply be part of the
  standard `unittest discover` run).
- No AST parsing — line/regex level only (the AST untrusted-wrapper gate is its own
  spec with its own room verdict).
- No pedigree-term ban: vc-brain's prompts legitimately discuss founders' backgrounds;
  the fame/volume concern is a scorer-behavior question the rooms routed to a live
  spike, not a vocabulary ban.

## Integration points

- New: `intelligence/tests/test_source_boundaries.py` (rules + scanner in one module).
- New (this spec is the named owner): `intelligence/registers.py`, the repo's
  shared-constants module — created here holding the `no-score-laundering` pattern; sibling
  specs extend it (first-to-land creates, others extend).

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
