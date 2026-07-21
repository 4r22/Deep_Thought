# Task: forum seed (N-attendant room)

Seat an N-attendant room to press one contested investment decision. **Every
chair is a person**: a real, named voice — historical or contemporary,
established or fringe — whose published work bears on the crux. You are
issuing invitations, not casting roles, and not deliberating. **The room must
SPAN the disagreement**: people whose documented positions genuinely pull
apart on evidence in the record. A room that all leans one way is a seeding
failure.

## Investor thesis (the lens — every judgment filters through this; may be null for ad-hoc stage runs)

```json
{{THESIS_JSON}}
```

## The decision (application + screen + triage; `triage.crux` and `triage.room_brief` are raw material — NO scores enter the room)

```json
{{DECISION_JSON}}
```

## The crux (what this room presses)

{{CRUX}}

## Evidence on file

```json
{{SIGNALS_JSON}}
```

## Seat the room

- **Invite people, not lenses.** Each attendant is a real named voice
  (`handle` = their actual name, `slug` = kebab-case). The `invitation`
  records why they are in the room: `invited_by` (what surfaced them — e.g.
  `evidence-record`, `primary-references`, `operator`) and `reason` citing a
  specific published work, essay, talk, or artifact of theirs that bears on
  the crux. In interviews and debate they are reasoned FROM their published
  work — a counterfactual roundtable, never a caricature. Invented persons
  and composite archetypes are banned; if no real voice covers a needed
  pole, say so in `room_note` rather than fabricating one.
- **Seed from evidence, not a cast.** Each attendant's `lens` and `mandate`
  name the signals that birthed the invitation. A mandate that could fit any
  deal is banned — no signal behind it, no seat. The person's documented
  stance seeds `opening_lean`; the evidence record decides who gets a chair.
- **Contradictions and gaps each earn a seat.** A seeded contradiction
  (e.g. deck install-count vs registry downloads) earns a commercial-integrity
  seat; a flagged gap earns a seat that presses it. The tension *is* the chair.
- **Cold start earns a durability seat, never a punitive one.** Its job is to
  price thin evidence honestly — wide, named uncertainty, never a quiet
  penalty for absence of history. The system exists to see exactly these
  founders.
- **Widen the 2-pole tension into N distinct lenses; do not clone bull and
  bear.** Two attendants sharing an evidence set and a question are one
  attendant. Each `decisive_question` is distinct from every other's.
- **At least one attendant must be able to argue against the majority.** Name
  it in `room_note`. A stacked room is a failure.
- **The crux is copied, not reinvented.** `crux_restatement` carries the
  substance of `triage.crux` in one sentence; `triage.room_brief` guides who
  gets a chair.
- Each attendant's `opening_lean` is the pole-seeding judgment — `for`,
  `against`, or `genuinely-split` on the decision — held BEFORE its own
  interview, not a verdict. The interview and debate may move it.

## Output

Return JSON per the provided schema. Emit **exactly {{N_SEATS}} attendants**,
ids `seat-1 … seat-{{N_SEATS}}` in array order, each a named person with
`handle` (their real name), `slug`, an `invitation` (invited_by + reason
citing their relevant work), a lens, a mandate that names its signals,
`evidence_refs`, a distinct decisive question, and an opening lean derived
from their documented stance. Close with a one-line `room_note` on how the
attendants cover the crux without redundancy and which one can argue the
minority side.
