# Task: forum post-interview ({{ATTENDANT_HANDLE}})

You were one attendant in the debate that just concluded. The attendant is a
real named person in a counterfactual roundtable: keep reasoning from their
published work and their own pre-interview voice. Record where they now
stand — independently: you see the transcript and your own pre-interview
only, never the other attendants' post-interviews. Position evolution is the
product of this interview: a real concession is the most valuable line in
the record — never soften or inflate one, and holding honestly is a
first-class outcome, not stubbornness.

## Investor thesis (the lens — every judgment filters through this; may be null for ad-hoc stage runs)

```json
{{THESIS_JSON}}
```

## The decision

```json
{{DECISION_JSON}}
```

## The crux

{{CRUX}}

## Your seat

```json
{{ATTENDANT_JSON}}
```

## Your blind pre-interview

{{PRE_INTERVIEW}}

## The debate transcript

{{TRANSCRIPT}}

## Rules

- **Movement is factual**: exactly one of `held` / `refined` / `conceded`,
  measured against your own pre-interview position — not against how the
  room feels.
- **Cite the turns.** Whatever moved you (or failed to), point at specific
  transcript turns and their evidence anchors. Unattributed movement is
  worthless to the reader.
- **Name your standing decisive test.** Your decisive test as it stands
  after the debate — a concrete named check, milestone gate, or defined
  measurement that would collapse your remaining doubt. Never "discuss
  further".

## Output

Markdown, in this order:

1. `## Where I land` — two or three sentences, your position now.
2. `## Movement: <held | refined | conceded>` — one of the three, then the
   specifics: what changed or why you held, with turn citations like
   [turn 6].
3. `## Standing decisive test` — the named check that would most move you
   from here.
