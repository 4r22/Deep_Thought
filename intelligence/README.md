# Intelligence layer

The reasoning layer of VC Brain: screen → triage → forum → counsel →
memo → human gate. A transplant of a deliberation discipline measured in a prior private project before being adopted here.

The load-bearing inversion: **the room comes before the number.** The forum
builds a populated reference space of named voices first; the counsel — the
standing tribunal across from the forum — projects that room into the three
axes, computed last and citing the seat positions each score rests on. Scores
never enter the forum in any form.

## Pipeline

```
application + signals + thesis
        │
        │  ── INPUT GATE (mechanical, in code) ────────────────────────
        │     the screen judges DEALS; this gate judges DATA. Every
        │     --application loads through load_application(): schema
        │     shape (schemas/application.schema.json) + content
        │     sufficiency (placeholders, one-liner floor, substance
        │     floor) — refusal with named reasons BEFORE any token is
        │     spent. `./run.py gate --application x.json` gives the
        │     verdict standalone (exit 0 pass / 2 refuse).
        ▼
   SCREEN            fast, cheap. advance | reject | contested
        │
   TRIAGE            routes every empirical sub-question to its cheapest
        │            decisive check; surfaces evidence-vs-evidence tensions
        │            (no bull/bear); names the one crux no check can settle;
        │            writes a room_brief for seating. Emits moves, not stances.
        │
        │  ── GATE (mechanical, in code) ──────────────────────────────
        │     the room convenes for advance AND contested. It is SKIPPED
        │     only when screen.verdict == "reject" OR triage.crux is blank.
        │     A skip names the failed condition; nothing else stops the room.
        ▼
   FORUM             the reference-space builder. A fixed deliberation structure,
        │            verbatim: N real named voices seeded from their
        │            published work (persons are the foundation) → blind
        │            pre-interviews → one moderated debate pressing the
        │            single crux → post-interviews (held / refined /
        │            conceded, turn citations) → typed adjudication.
        │            The decision object handed to the room is
        │            {application, screen, triage} — NO axes, NO scores.
        │            --forum-mode 2-pole falls back to legacy bull/bear poles.
        │
   COUNSEL           the standing tribunal across from the forum. Three
        │            blind ABSTRACT axis offices — Founder / Market /
        │            Idea-vs-Market, no personas (the room already explored
        │            the space through persons) — each read the FULL
        │            proceedings and render their one dimension: numeric
        │            score + band, cognizant of the fund mandate
        │            (mandate_refs; deviations allowed but declared), plus
        │            coverage_challenges (what the room failed to test) and
        │            open_questions (cheapest decisive checks → memo
        │            conditions). Independent, never averaged in artifacts —
        │            the cross-axis mean is presentational, Experience-layer
        │            only. Introduces NO new evidence; every movement cites
        │            evidence_refs and (when the room convened)
        │            position_refs into the seats. counsel.json is the full
        │            record; axes.json is its mechanical legacy projection.
        │            Degraded no-room mode on the reject path: wide bands,
        │            confidence ≤ medium, stated plainly in room.note.
        │
   MEMO DISPATCH     one agent per document the judges' brief specifies
        │            (Appendix 1), each given the forum results, the axes
        │            projection, and the ingredients; triage's routed checks
        │            feed the diligence log's open items; code assembles the
        │            claims ledger; a decision agent turns the forum's
        │            Instruments into tranche conditions (falling back to
        │            triage.routed_checks when no room convened) and folds
        │            the counsel's open questions and coverage challenges
        │            into conditions and the diligence log.
        │
   HUMAN GATE        the investor decides. Everything above is
                     agent-derived input, and says so.
```

Run it: `./run.py pipeline --application fixtures/application-ferrite.json
--thesis ../config/thesis.example.json --signals fixtures/signals-ferrite.json
-o out/ferrite` (needs `ANTHROPIC_API_KEY`). Every run writes `latency.json`
— first-signal-to-decision speed is instrumented per stage (`screen`,
`triage`, `forum:*`, `counsel:members`, `memo:documents`, `memo:decision`).

## Design commitments, and where they were earned

**Moves, not stances.** In an earlier pilot, framings that produced a *stance
about* the object (advocate / attack / deflate) fed back 0/6; framings that
produced a *decision-native move* (a named experiment, a scoping condition, a
gate, a false-binary catch) fed back 8/8. So triage and the counsel are
forbidden from arguing sides — they emit named diligence checks, tranche
gates, and scoping conditions. Advocacy lives in exactly one place: the
forum, where opposed voices are the design.

**The trust ladder** (per claim, never per company):

| tier | meaning |
|---|---|
| `verified-artifact` | primary artifact on file, independently checked (repo read, payment-processor export, signed contract) |
| `verified-online` | public source fetched **and archived** — archiving is the promotion mechanism |
| `reconstructed` | reference-class inference, labeled substantiated / reconstructed / extrapolated |
| `claimed` | founder-supplied, unverified. Weakest, no matter how detailed the deck |

**Authority split, orthogonal to the ladder:** `subject` (the founder's own
material — never substantiates its own case), `independent`, `operator-primary`
(the investor's notes), `agent-derived` (this pipeline's outputs — material to
argue with, never authorities). Citing subject or agent-derived material as if
independent is **authority laundering**, a named defect the memo prompt bans.
The measured basis: in that pilot, the weakest evidence tier fed back 0/7 while
disciplined reconstructions earned keep — the ladder shows up in outcomes.

**Contradictions are first-class.** Seeded into the Signal contract
(`contradicts[]`), surfaced in memos (`verification: contradicted`, both sides
cited), carried by triage as evidence-vs-evidence `tensions` (each side
evidence-backed, no bull/bear enum), and used as forum seats. Never smoothed
over.

**The thesis is the lens, validated once.** The fund thesis
(`schemas/thesis.schema.json`, draft-07) loads and validates before any model
call — a malformed config fails fast, at the cheapest point — then injects into
every stage: screen, triage, **the forum**, counsel, memo. The deliberation now
filters through this fund's mandate, not a generic one; injection is additive
context and changes no output contract.

**Triage routes before it debates.** Between the screen and the room, triage
does the cheap work first: every empirical sub-question is paired with the
*named cheapest decisive check* that would settle it (`routed_checks`), because
checks outrank debates on questions checks can answer. What survives routing —
a posture, risk-tolerance, or conviction fork no check can close — becomes the
single `crux`. The crux is **always non-blank**: for a clean record it is the
dominant what-would-have-to-be-true. Triage carries the record's tensions as
evidence-vs-evidence pairs and a `room_brief` telling the seed stage what the
room must cover (contradictions, gaps, cold-start, wedge). No scores, no
stances — moves only.

**The gate is mechanical, not prompted.** `forum_gate(screen, triage)` is code,
not a model judgment. The room convenes for **advance and contested** alike;
it is skipped in exactly two cases — `screen.verdict == "reject"`, or a blank
triage crux — and the skip reason names the failed condition. Every fire/skip
decision the structured outputs cannot express is enforced here, at the one
seam, per the mechanical-gates-over-prompt-rules doctrine.

**The forum is the reference-space builder — persons first, abstractions on
top, scoring last, and never inside the room.** It does not adjudicate a
scoreboard; it *populates the space the score will later read from*. Real named
voices are seeded from their published work (the seeded room is the default);
each is a lens the record genuinely pulls apart — a commercial-integrity
auditor born of a deck↔registry contradiction, a cold-start durability seat, a
market-wedge seat — never a VC archetype. The room must span the disagreement
and name which voice can argue the minority side; a stacked room is a seeding
failure. Then every voice walks a fixed deliberation structure, **verbatim and untouched**:
blind pre-interviews (kills consensus-smoothing) → one moderated debate
pressing the single crux → post-interviews recording each attendant's own held
/ refined / conceded with turn citations → the typed adjudication block.
Interviews and debates are markdown artifacts; only the adjudication is
structured. **No scores, bands, or scoreboards enter the forum in any form** —
that is the de-anchoring: the decision object handed to the room is
`{application, screen, triage}`, deliberately withholding the axes so the room
reasons from evidence, not from a number it would only rationalize. **Forced consensus is forbidden**; every debate ends
typed (`converged` / `action-converged-plus-residual` /
`stable-fork-plus-instrument` / `degenerate`). The **Instrument** — the
concrete move that would collapse the surviving fork — is the convergence
product, and flows into the memo's decision conditions (usually a tranche
gate).

`--forum-mode 2-pole` falls back to the legacy bull/bear stance-poles for the
same deliberation stages — a mechanically-unchanged compatibility path, not the
default. The optional `--robustness` slice (F3) replicates the debate on a
second model family (`--robustness-model`, default `claude-sonnet-5`); the two
records sit side by side in `forum-modelb/`, never merged, and a flipped
adjudication outcome tags the primary block's `authority_note`
**model-flavor-suspect** (confidence drops; authority stays agent-derived).
api backend only — `call_cursor` refuses a model override. Measured basis: the
forum pilot produced a real position concession and a decision where
stance framings produced neither.

**The score is a projection of the room, rendered by the counsel.** The
counsel (spec: `docs/COUNSEL.md`) sits *after* the forum and reads the full
proceedings as its primary input — the tribunal watching the room argue it
out, mechanically: the artifacts ARE the proceedings, and the seats never see
the judges. Three **abstract axis offices** — deliberately not personas; the
forum already explored the space through named persons, and the bench needs
no more preframing — each read the record **blind** (no office sees another)
and render one dimension with a numeric score and band. The thesis is each
office's **charter**: ratings cite `mandate_refs` (thesis field names), and
rating against the mandate's grain is allowed but must be **declared**
(`deviation.declared` + note — an undeclared deviation is a code-side
defect). Each office also cross-examines the room's coverage
(`coverage_challenges`: what the room failed to test — the stacked-room
detector) and lists `open_questions` no document on file settles, phrased as
cheapest decisive checks; the memo's decision agent folds both into
conditions and the diligence log. The offices may introduce **no new
evidence** — every movement off the prior cites `evidence_refs`, and when the
room convened, ≥1 `position_ref` naming the seat it rests on (`seat-N/pre`,
`seat-N/post`, `debate`, `adjudication`, optionally with a `debate#turn-11`
fragment; `bull/pre` etc. for legacy 2-pole rooms). Position evolution in the
post-interviews (held / refined / conceded) is the strongest movement signal.
An unresolved residual fork touching a dimension caps that office's
confidence at `medium` and widens its band.

Assembly and aggregation are **mechanical code, never a model**: per-axis
scores land in `counsel.json`; the **cross-axis mean deliberately does not
exist in artifacts** — it is presentational, computed in the Experience layer
only, and disconfabulates on click into offices → citations → room turns
(operator decision 2026-07-21). `axes.json` is a mechanical projection of the
counsel record in the legacy mapping shape — the back-compat artifact memo
prompts, the verify gate, and the viewer consume; its `disagreement` line is
computed from score spread, not judged. Code-side post-checks enforce what
structured outputs cannot, now on **every** office: bands are exactly two
ints with `0 ≤ low ≤ score ≤ high ≤ 100`,
position_refs required iff a room convened (citing a room that never met is
fabrication), and the deviation lints — a violation is a `SystemExit` naming
the office. The editable-mandate dividend: because the forum is score-free,
editing `config/thesis.example.json` re-runs only the counsel, never the
deliberation.

**Degraded no-room mode is explicit.** On the reject path (or a blank crux)
the room does not convene, and the counsel record says so plainly in
`room.note`: wide bands, confidence at most `medium`, and an empty
`room_effect` on every office. The absence of a room is stated, never
silently papered over.

**Cold start is priced, not punished.** A founder with no funding history and
no network gets scored on public footprint with an honest wide band
(`cold_start: true`), never a low point-score for absence of history; the room
seats a durability voice to price that thin evidence rather than penalize it.
An unmodified trust ladder would re-gate exactly the founders this system
exists to see; the width of the band is where the honesty lives.

**The brief's documents are drafted after the deliberation, by dispatched
agents.** One agent per Appendix-1 document (snapshot, hypotheses, SWOT,
problem & product, traction, team & history, technology & defensibility,
market sizing, competition), dispatched in parallel once the forum has
returned, each given the forum results, the axes map, and the ingredients
(application, signals, thesis, triage). Assembly is mechanical — code
renumbers each document's claims into the global ledger and rewrites inline
refs; a final decision agent writes the diligence log, decision block, and
provenance lines. Its conditions consume the adjudication's Instruments when a
room convened, and fall back to `triage.routed_checks` when none did (a defined fallback).

**Gaps are flagged, never filled.** "Cap table: not disclosed" beats a
plausible invention. Padding counts against the memo.

**The human is the gate.** The decision block is a recommendation into a
human read. Investor accept/override verdicts should be recorded per artifact
(which claims fed the decision, which were withheld, which were wrong) — that
record is the future automation's training set, and the reason no gate is
automated now.

## Sourcing gate (outbound funnel)

Inbound applications and outbound-sourced opportunities arrive at the same
door (one funnel, per `prompts/screen.md`). For sourced GitHub repos,
`sourcing.py` is the preprocessing stage in front of that door:

```bash
./sourcing.py gate --archive ~/archives/sourced-repos \
    -o out/sourcing-run --emit-applications
```

Per repo it computes deterministic metrics (README words, code files/lines,
commits — read-only; never executes untrusted archive content) and issues a
ladder verdict: **junk** (nothing to analyze, never enters the pipeline),
**thin** (below the analyzable bar, held until more data arrives), **pass**.
Pass is *defined* as "the assembled application record opens
`gate_application` in run.py" — the sourcing gate and the pipeline's input
gate cannot drift apart. First full run (2026-07-19 archives): Claude
481 repos → 19 junk / 192 thin / 270 pass; Grok 99 → 5 / 27 / 67.

## Standalone stages

Each stage runs on its own over prebuilt inputs:

```bash
./run.py triage  --application … --thesis … [--signals …] --screen out/x/screen.json
./run.py forum   --decision … --crux … [--mode 2-pole] [--thesis …] [--signals …]
./run.py counsel --application … --thesis … --signals … --screen … --triage … \
                 [--forum-dir out/x]
./run.py memo    … --triage … [--counsel out/x/counsel.json]
```

`counsel --forum-dir` loads the room bundle from a run dir:
`forum-attendants.json` present → seeded ids; else `forum-bull.md` /
`forum-bear.md` → legacy poles; else no room (degraded mode). `axes` is a
deprecated alias that runs the same sitting and returns the legacy projection.
`forum --decision --crux` runs the room over a prebuilt decision object.

## Files

```
schemas/   founder, signal          — memory-layer contracts (draft-07)
           application              — pipeline INPUT contract (draft-07; shape
                                       only — load-bearing content checks live
                                       code-side in gate_application)
           thesis, memo             — locally-validated contracts (draft-07)
           counsel                  — the assembled counsel.json artifact
                                       (code-assembled; verify-gate schema)
           axes                     — the legacy projection artifact shape
           screen, triage,
           counsel-founder, counsel-market,
           counsel-idea-vs-market,
           adjudication, forum-seed,
           memo-section,
           memo-decision            — LLM output schemas (structured-outputs strict)
prompts/   screen.md, triage.md (routing + tensions + crux, no scores),
           counsel/member.md (one blind office read; axis brief injected)
           forum/seed.md, pre-interview.md, debate.md,
                 post-interview.md, adjudication.md  (fixed deliberation structure, verbatim)
           memo/section.md (one call per dispatched document), decision.md
fixtures/  application-ferrite.json, signals-ferrite.json
           (fictional; contradiction seeded between sig-001 and sig-004
            so the contested/forum path is demoable)
run.py     pipeline runner (claude-opus-4-8, adaptive thinking, structured
           outputs). forum_gate is the mechanical fire/skip gate; the
           counsel per-office band/position_ref/deviation invariants are
           code-side post-checks and assembly + the axes projection are
           plain code; memo
           assembly + ref renumbering is plain code in assemble_memo
           (invariant #3)
sourcing.py  outbound preprocessing gate: archived repo → junk/thin/pass →
           application assembly (see "Sourcing gate" above)
scripts/   verify_artifacts.py — mechanical schema gate over an out/ dir
           (screen, triage, counsel, axes, memo, latency always; adjudication +
           attendants when forum artifacts are present)
tests/     test_assembly.py         — mechanical memo assembly (claim
                                       renumbering, ref rewrite, provenance lint)
           test_forum_gate.py       — the mechanical convene/skip gate
           test_stage_contracts.py  — prompt-slot registry (every {{SLOT}} in
                                       prompts/**/*.md must appear in its
                                       stage's fill() mapping, both directions)
                                       + the legacy axes post-checks
           test_counsel.py          — per-office post-checks, mechanical
                                       assembly/projection, disagreement rule
           test_pipeline_replay.py  — the REAL cmd_pipeline driven end-to-end
                                       with a canned model: artifact set + order,
                                       the anchoring assertion (no scores reach
                                       the room), gate paths, 2-pole legacy
           test_input_gate.py       — the data door: real fixtures pass;
                                       placeholder/thin records refuse with
                                       named reasons, BEFORE any model call
           test_sourcing_gate.py    — repo verdict ladder, adapter output
                                       opens the pipeline door, untrusted
                                       README text stays inert data
           test_sourced_replay.py   — a sourced application drives the REAL
                                       cmd_pipeline offline; thin sourced
                                       record refused with zero calls
           test_wire_and_fill.py    — wire_schema strips endpoint-unsupported
                                       constraint keywords; fill() is single-pass;
                                       triage tension postcheck
```

The Founder/Signal schemas are the **integration surface with the Memory
track** — change them only by agreement between both tracks.
