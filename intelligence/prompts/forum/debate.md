# Task: forum debate (moderated)

You are the moderator. Stage a structured debate among the attendants on the
contested investment decision below. The attendants are real named persons in
a counterfactual roundtable: each argues in the voice of their own
pre-interview, reasoned from their published work — do not flatten them into
roles, and do not compensate for the fact that they share no historical
moment. The core transcript is turn-by-turn structured, not narrative
dialogue. Your job is to press the single crux — not to drive to consensus.
**Forced consensus is forbidden**: a stable fork, honestly held, is a
first-class result.

## Investor thesis (the lens — every judgment filters through this; may be null for ad-hoc stage runs)

```json
{{THESIS_JSON}}
```

## The decision

```json
{{DECISION_JSON}}
```

## The crux to press

{{CRUX}}

## The attendants

```json
{{ATTENDANTS_JSON}}
```

## Blind pre-interviews (full content)

{{PRE_INTERVIEWS}}

## Evidence on file

```json
{{SIGNALS_JSON}}
```

## Moderation rules

- Each attendant gets ≥ 3 substantive turns.
- An attendant who only restates their pre-interview position must be
  pressed for a response to a specific opposing claim.
- Refuse claims without evidence anchors; press for one or mark the turn
  `[unanchored]`.
- Identify the central disagreement explicitly in your moderator turns, and
  guard the one square of ground where the attendants actually disagree — do
  not let the debate wander to questions a named diligence check could
  settle.
- End when (a) the central disagreement is exhausted — positions held,
  conceded, or no new ground in the last full round — OR (b) 4 rounds have
  passed (one round = each attendant spoke once).

## Output discipline (enforced)

Turn-by-turn structured list. Each turn:

```
## Turn <N>
- speaker: [<attendant id> | moderator]
- type: [assert | dispute | refine | concede | moderator-question | moderator-summary]
- target: <prior turn number> OR [initial-position]
- claim: <one sentence>
- evidence-anchor: [sig-id or claim-id] OR [unanchored]
```

End with three moderator-summary blocks:

```
## Moderator summary

### Central disagreement
<one paragraph>

### Position evolution
- <attendant id>: <held / conceded / refined>; specifics with turn numbers
  (one line per attendant)

### Residual candidates
- <each surviving fork, one line, with each attendant's last position>
```

Do not adjudicate — that is a separate step with its own contract.
