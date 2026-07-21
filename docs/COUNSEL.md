# The Counsel — a standing tribunal across from the forum

Status: spec + v1 implemented 2026-07-21.

## 0 · The one idea everything hangs on

The project brief's fixed elements — bull case, bear case, the three axes —
turned out to be **bad forum inputs but good standing projections**. The forum
deliberately killed them as inputs (2-pole demoted to legacy, axes pushed
after the room). The counsel is the institution made of exactly those
elements, facing the room:

- **The forum is per-deal and emergent.** Real named persons, seeded fresh
  from what this record pulls apart. It explores and reveals the space of
  important thinking. It is memoryless and score-free.
- **The counsel is permanent and mandate-shaped.** Its bench is fixed and
  **abstract**: the three axes themselves — Founder, Market, Idea-vs-Market —
  as offices, not personas. The room already explored the space through
  persons; the bench adds no preframing. It does not deliberate the deal — it
  **cross-examines the room** and renders the scores.

Forum populates; counsel judges. Scores exist only downstream of the room,
exactly as the de-anchoring doctrine already requires.

## 1 · The bench (v1, as built)

Three offices, one per axis, defined in code (`run.py COUNSEL_OFFICES`) with
a per-axis brief injected into a shared prompt
(`intelligence/prompts/counsel/member.md`). Offices are organs of the
pipeline — like screen/triage/memo agents — so the persons-first rule and the
abstract-lens-seat ban (which govern *forum seats*) do not apply to them.
Every office is numeric now: score 0–100 + band on all three axes (the
legacy shape scored only Founder), because the UI's averaging needs numbers.

## 2 · Flow (v1, as built)

```
forum record (pre-interviews, debate, post-interviews, adjudication)
  → three BLIND office reads, one fan-out ("watching the room" IS the
    record; the seats never see the judges — no scores enter the room)
    each office returns, per its one dimension:
      score + band + trend + confidence
      evidence_refs + position_refs into the seats (required iff room convened)
      mandate_refs — thesis fields that shaped the rating (the charter)
      deviation {declared, note} — against-the-grain ratings allowed,
        but declared; undeclared deviation = code-side defect
      coverage_challenges — what the room failed to test (stacked-room detector)
      open_questions — cheapest decisive checks the record can't answer
  → MECHANICAL assembly (code, no model):
      counsel.json  — the full tribunal record + per-axis scores
      axes.json     — legacy-shape projection (back-compat for memo prompts,
                      verify gate, viewer); disagreement line computed from
                      score spread (> 20 ⇒ stated; else empty)
  → memo decision agent receives the counsel record: open_questions fold
    into conditions/diligence items; coverage_challenges and declared
    deviations surface in the rationale
```

Code-side post-checks (SystemExit naming the office): band ordering
`0 ≤ low ≤ score ≤ high ≤ 100` on every office; position_refs required when
the room convened and **forbidden** when it didn't (citing a room that never
met is fabrication); declared ⟺ note on deviations. Degraded no-room mode
carries over: wide bands, confidence ≤ medium, stated in `room.note`.

## 3 · Scoring and aggregation rules

- **In artifacts:** per-office scores and bands in `counsel.json`. Axes are
  NEVER collapsed across each other in any intelligence artifact — the
  cross-axis mean deliberately does not exist there
  (`aggregation.cross_axis_note` says so in every record).
- **In the UI only:** the Experience layer MAY display the cross-axis grand
  mean as the headline number (operator decision 2026-07-21: per-axis
  average, then average over the axes, as a UI/UX-facing thing). It is
  computed in view code, labeled presentational, never persisted, never an
  input to any stage. One click disconfabulates it: grand mean → three axes
  → office records → position_refs / mandate_refs / deviations → the room
  turns themselves.

## 4 · Anti-corruption clauses (the "less corrupt Council of Ricks")

- Offices read blind — no office sees another; consensus-smoothing between
  judges is structurally impossible.
- Everything cited in a rating must be **on the record**: a room position, a
  document on file, or a mandate field. No new evidence, ever.
- Mandate deviations are permitted only when declared; an undeclared
  deviation is a lint defect, not an opinion.
- Aggregation and assembly are mechanical code. No office, and no model
  call, computes averages or the disagreement line.

## 5 · The editable-mandate dividend

Because the forum is score-free, **editing the standing frame re-runs only
the counsel, not the deliberation**: change `config/thesis.example.json`,
re-run `./run.py counsel --forum-dir out/<run>`, and the ratings shift with
cited `mandate_refs`. This is the brief's editable-search-criteria
requirement made demonstrable in minutes, for the cost of three calls.

## 6 · Relation to existing stages

The counsel **absorbed and superseded the axes stage** (2026-07-21): same
position in the pipeline, same projection discipline, grown from one mapping
call into three blind offices. `axes.json` remains as the mechanical legacy
projection; `./run.py axes` is a deprecated alias of `./run.py counsel`. The
memo decision agent consumes the counsel record alongside the projection;
Instruments and routed-check fallbacks are unchanged.

## 7 · Deferred / open items

1. **Brief-compliance review gates deploy** — the original challenge brief
   is not in the repo.
2. **Live interrogation round** — offices asking bounded questions answered
   *in a named seat's voice* (constrained to established positions). v1
   ships `open_questions` → memo conditions instead; live seat answers and
   any bounded re-convene (one iteration, named missing seat) stay deferred.
3. **Bull-of-record / bear-of-record** — cited extractions of the strongest
   opposing cases from seat positions as memo appendices (the brief's
   bull/bear reborn as outputs). Not in v1.
4. **Experience layer** — the disconfabulatable headline (grand mean →
   drill-down) is a viewer feature over `counsel.json`; not yet built.
5. Whether the design forum later gets the same treatment (a taste-counsel
   over design rooms). Prove it on diligence first.
