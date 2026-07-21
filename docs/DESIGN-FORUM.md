# Design Forum — taste-anchored visual deliberation

**Status: SPEC, 2026-07-21**

## 0 · The one idea everything hangs on

A named designer or artist is a **compressed reference into visual language
the model already knows**. "Rams-era Braun control plate" or "Tufte's
data-ink ratio" summons a coherent, internally-consistent visual corpus;
free-floating adjectives ("clean", "premium") summon noise. The forum's job
is to force every design position through such anchors.

This is the person-network foundation principle applied to design: a person
as a generative stance — auditable (their published work exists), connected
(their influences and rivals are known), and productive in conflict.

## 1 · What it is (and is not)

A lightweight seeded room that deliberates ONE design crux and emits a
**design spec with checkable acceptance criteria**. It reuses the existing
forum machinery (`intelligence/run.py forum --mode seeded` already runs
arbitrary rooms — the 28 test-adoption rooms prove the room generalizes
beyond deals). It is NOT the diligence forum: fewer debates ("we don't need
that many"), and the default room may end at pre-interviews + adjudication
with no debate at all if positions don't genuinely collide.

The operator remains the taste-gate. The room proposes and argues; the
adjudication crystallizes; the operator ratifies via the existing
visual-review package loop. The house rule stands: agents never self-judge
aesthetics — the room's productive conflict is a *generator* of options and
arguments, not a substitute for the operator's eye.

## 2 · Inputs

1. **The general prompt** — the design crux, stated like a forum decision:
   e.g. "Should the run switcher live in the topbar as a machined selector,
   or is the landing graph the only navigation hub?"
2. **The taste profile** — a citable corpus (`design/taste-signals.json`, not in this repo)
   extracted from where the operator's taste is already written down:
   - the operator's design-notes corpus (machining law, material lab,
     reveal doctrine, skeleton/skin doctrine)
   - vc-brain operator decisions — dark-aluminium lock, "don't restate the
     spec in the product", adjudication-first, favorites-not-choice-fatigue,
     full words over mnemonics (epic vc-brain-toe).
   Each taste signal carries provenance (`file:line` or bead id) and a trust
   tier: `operator-ratified` > `plan-doctrine` > `agent-inference`.
3. **Sketches and captures** — a `references/` dir per room: current-state
   captures via `experience/scripts/shot.mjs`, operator sketches/screenshots,
   and named external references (product names, works, eras).

## 3 · Seats — designers as generative stances

Invitation discipline mirrors seed.md: real named voices whose **published
visual work bears on the crux**, seated via invitations with `invited_by` +
a reason citing a specific work. Abstract lens-seats stay banned. The seat's
generative stance IS the person's known position — examples of the span a
room might need:

- restraint/functionalism (Rams: "as little design as possible")
- material honesty in machined UI (the Braun/Ive lineage)
- information density without chartjunk (Tufte)
- grid absolutism (Vignelli)
- glyph warmth at small sizes (Kare)
- playful machined hardware (Teenage Engineering)

Seats must SPAN the crux (opposed stances), not cluster. Evidence-grounding
adapts: **no reference, no seat** — an invitation must cite a work the model
can actually reason from.

## 4 · The reference-anchoring rule (the room's hard law)

Every position, argument, and adjudication clause MUST be anchored to at
least one of:
(a) a **named existing visual language or work** ("the Bloomberg terminal's
    density model", "Braun SK4's control plate"),
(b) a **taste-profile signal** (cited by id → file:line), or
(c) a **provided sketch/capture** (cited by filename).

Unanchored aesthetic adjectives are lint failures, the design-room analog of
authority laundering. This is what turns the model's latent visual knowledge
into inspectable, arguable positions.

## 5 · Flow (lighter than diligence)

```
taste corpus + references + crux
  → seed (N seats, invitations cite works)
  → blind pre-interviews (each seat: ONE direction + anchors + a sketch-in-
    words concrete enough to implement)
  → gate: do directions genuinely collide on the crux?
      no  → skip debate
      yes → ONE short moderated exchange on the collision only
  → typed adjudication = THE DESIGN SPEC:
      converged: chosen direction, every clause anchored
      acceptance_criteria: concrete, capturable checks — these become the
        visual-review package rubric verbatim
      residual: unresolved taste forks → numbered operator questions
      references: the anchor list (works, taste-signal ids, sketches)
  → implementing agent executes the spec
  → visual-review package (before/after per acceptance criterion)
  → operator taste-gate (existing loop; residual forks are the questions)
```

The acceptance-criteria hand-off is the loop-closer: the room's output is
directly the rubric the capture pipeline verifies and the operator judges.

## 6 · Implementation shape (small)

- `design/taste-signals.json` + `design/TASTE.md` (not in this repo) — the extracted profile.
- A `design-adjudication` schema variant: adjudication + `acceptance_criteria[]`
  + `references[]`; prompts adapted from `docs/{seed,pre-interview,debate,
  adjudication}.md` with the reference-anchoring rule and the skip-debate gate.
- Rooms run via the existing `run.py forum` path (worker-agnostic; pinned
  models per current policy).
- Output lands in `design/rooms/<slug>/` (not in this repo); review packages stay in
  `experience/reports/` (not in this repo).

## 7 · Safety and honesty clauses

- Rooms put **counterfactual positions in real people's mouths** — the same
  class as the gbrain forum. Label every artifact "AI counterfactual
  roundtable reasoned from published work"; these artifacts are internal
  design-process records, never published pages, never presented as real
  endorsements. Prefer historical/canonical figures over living private
  individuals; never seat a private person.
- Taste-profile provenance is honest: `agent-inference` tier signals may not
  outvote `operator-ratified` ones in adjudication.
- The operator gate is structural, not advisory: no design-room adjudication
  ships without a review package passing through the operator.

## 8 · First room (proposed, needs operator go)

Crux candidates from the live backlog, smallest useful first:
1. **The run switcher**: topbar machined selector vs landing-graph-hub
   — the operator explicitly owns this design; the room would *prepare* the
   decision (options + anchored arguments + acceptance criteria), not make it.
2. The aluminum question (flat vs metal-core port).
