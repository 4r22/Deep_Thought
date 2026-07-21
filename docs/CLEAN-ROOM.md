# Clean-room discipline — working with external repo archives

This repo's research process reads a lot of other people's code: the hackathon
submission archives (`<external-archive>/submissions`, `<external-archive>/track-archive`),
gbrain (`<external-archive>/gbrain`), and whatever gets archived next. That reading is
normal, productive, and legally protected. What this document defines is the **boundary
discipline**: what may cross from those archives into this repository (and its beads
database, which syncs to the same GitHub remote), and in what form.

The point of the discipline is not caution — it is **freedom with a paper trail**. Done
right, we can study everything, extract maximum value, and prove afterward that nothing
shipped here contains anyone else's protected expression. Done wrong, contamination is
nearly irreversible: once copied expression lands in git history it propagates into
specs, implementations, and downstream agents, and unwinding it means rewriting from
scratch (see *Altai*, below — the rewrite is the expensive branch).

*(General statements of U.S. law for working discipline; not legal advice.)*

## The map

| Zone | Where | What lives there |
|---|---|---|
| **Archives** (outside the repo) | `<external-archive>/submissions`, `<external-archive>/gbrain`, etc. | The actual third-party code. Read-only. Never copied, moved, or symlinked into the repo. |
| **Airlock** (in repo) | `research/` reviews, evidence files, deep-dives | Our own prose *about* the archives: facts, measurements, architecture descriptions, `path:line` citations, sub-line quotes. |
| **Clean side** (in repo) | specs, `intelligence/`, `experience/`, everything else | Our own code and pattern-level specs. Implementable without archive access. |

## What crosses freely — use these without hesitation

Copyright protects **expression**, not ideas (17 U.S.C. §102(b)). You cannot
"accidentally steal" any of the following, because none of it is ownable:

- **Facts and measurements**: file counts, line counts, thresholds, benchmark numbers,
  what a test asserts, what a function does.
- **Ideas, methods, algorithms, architectures**: "they run a 6-round tool loop with
  local-daemon-first fallback" is a fact about a method. Describe it, adopt it, improve it.
- **Behavior and interfaces**: what inputs produce what outputs; error handling shape;
  data-model semantics (*Lotus v. Borland*: a method of operation is not copyrightable).
- **Citations**: `path/file.ts:120-140` pointers into an archive are receipts, not copies.

Reviews and specs should be *dense* with all of the above. Thin, vague specs are the
failure mode this document is designed to prevent as much as leakage is.

## What never crosses (from unlicensed sources)

The hackathon archives carry no licenses — default is all-rights-reserved. From them,
never commit:

- **Code**, in any quantity beyond a quoted identifier. Not "just this helper."
- **Prompt text** — system prompts are expression, same as code.
- **Comments, README prose, marketing copy** beyond a one-line quote.
- **Their arbitrary naming carried into our code.** Names of *their* invention
  (product codenames, cutesy module names) are the tell that expression, not ideas,
  crossed. Behavior transfers; their vocabulary doesn't.

**The quote rule:** at most one line, in quotation marks, with the source named. That
covers taglines, error strings, and single regexes used as evidence. If you're tempted
to quote two lines, describe the second one instead.

## Licensed material has its own lane

MIT/BSD/Apache code (gbrain, the OSS libraries in `research/oss-terminal-sweep/`) may be
adapted or vendored — **per the license terms**, which for MIT means: keep the copyright
notice, and mark adapted code with a header (`Adapted from gbrain <path> (MIT)` — the
convention `research/gbrain/specs/store-organ.md` already mandates). License compliance
is mechanical; do it at the moment of copying, not later.

## Writing specs (the airlock → clean side transfer)

A spec derived from archive study must pass one test: **a fresh agent with no archive
access can implement it, and nothing in the result would match the source beyond what
function dictates.** Concretely:

- Specify behavior, contracts, data semantics, and acceptance tests — not their code shape.
- Carry over facts and scars ("their v122 migration exists because X collapsed") with citations.
- Don't embed their code "for reference." If an implementer needs the reference, the spec
  isn't finished.
- Scratch files that *do* transcribe archive material while you work must stay out of the
  repo: keep them in the session scratchpad, or mark the file `DO-NOT-COMMIT` on any line —
  the pre-commit guard blocks it.

## Why the edge is safe ground — the precedents

The discipline above is not timidity; it is exactly how the most aggressive successful
reverse engineering in the industry was done. The defendants who won did **more** reading
and copying during study than we ever do — and won because the *shipped artifact* was clean:

- **Phoenix/Compaq vs. the IBM BIOS (1980s).** The original two-room clean room: one team
  read IBM's code and wrote a functional spec; a separate team that had never seen the code
  implemented from the spec. Result: the entire PC-clone industry, functionally identical
  to IBM's product, never successfully challenged. The spec wall — our airlock — is what
  made total functional cloning defensible.
- **Sega v. Accolade (9th Cir. 1992).** Accolade *disassembled Sega's game code wholesale*
  to learn the console interface. Held fair use: intermediate copying to get at
  unprotectable ideas is legitimate when the shipped product contains none of the
  source's expression.
- **Sony v. Connectix (9th Cir. 2000).** Connectix copied the PlayStation BIOS *repeatedly,
  in full* while building its emulator. Fair use — the final emulator contained no Sony
  code and competed directly with the PlayStation. Study depth was never the problem.
- **Computer Associates v. Altai (2d Cir. 1992).** The cautionary one, both directions. An
  engineer secretly copied ~30% of CA's code → infringement, damages. Altai then rewrote
  from a spec using programmers who had never seen CA's code → the rewrite was held
  **non-infringing**. The clean-room rewrite saved the product; needing one cost them the
  lawsuit. This is the "can't be undone cheaply" scenario this document exists to avoid.
- **Google v. Oracle (S. Ct. 2021).** Google reimplemented the Java API surface (11,500
  declaring lines) with all implementing code written fresh; fair use. Even
  interface-level reuse survived — but it took a decade of litigation. Reimplementing
  *behavior* in your own code is the lane that never gets sued in the first place.
- **EU parallel:** Software Directive 2009/24/EC arts. 5(3) and 6 make observing, studying,
  and testing a program to determine its underlying ideas a *right* that contracts cannot
  waive.

The pattern across all of them: **read maximally, ship nothing of theirs.** The losers
copied expression into the product; the winners put a documented wall between study and
implementation. This repo — public-facing git history with prose-only reviews and
implementable specs — *is* that documentation.

## Enforcement (what's automated)

- **Per-turn reminder** (`.claude/settings.json` PreToolUse hook): any tool call touching
  an archive path injects a one-line pointer to this discipline into the agent's context.
- **Commit guard** (`scripts/cleanroom-check.sh`, called from the pre-commit hook):
  blocks staged fenced code blocks under `research/competitor-review/` (a working-repo
  directory not shipped in this public copy), and blocks any
  staged file containing a `DO-NOT-COMMIT` marker.
- **The audit precedent:** a full-repo contamination audit ran 2026-07-21 (clean — zero
  multi-line verbatim reproductions across 100 review files). Re-run one after any
  large archive-mining campaign.
