# Task: forum adjudication

Read the completed forum record — blind pre-interviews, the moderated
debate, and each attendant's post-interview — and produce the adjudication
block. You are not a judge of who won — you are recording what the debate
settled, what survived it, and what concrete move would settle the rest.

## Investor thesis (the lens — every judgment filters through this; may be null for ad-hoc stage runs)

```json
{{THESIS_JSON}}
```

## The decision

```json
{{DECISION_JSON}}
```

## The attendants

```json
{{ATTENDANTS_JSON}}
```

## Blind pre-interviews

{{PRE_INTERVIEWS}}

## Debate transcript

{{TRANSCRIPT}}

## Post-interviews (each attendant's independent landing)

{{POST_INTERVIEWS}}

## Rules

- **Every debate ends typed** — exactly one of: `converged` /
  `action-converged-plus-residual` / `stable-fork-plus-instrument` /
  `degenerate`. Forced consensus is forbidden; a stable fork with a named
  instrument is a first-class outcome, not a failure. `degenerate` means no
  movement AND no new residual — the debate produced nothing.
- **Converged actions cite the turn that produced them.** An action no
  attendant endorsed on the record does not belong in Converged.
- **Residuals carry each attendant's last position** — from its
  post-interview, or its final debate turn where the post-interview is
  silent.
- **The Instrument is the deliverable.** For each residual: the concrete
  move that would collapse it — a named diligence check ("request the
  payment-processor export"), a milestone gate ("tranche 2 on 3 paying
  logos"), a defined measurement. "Discuss further" is not an instrument.
  Draw on the attendants' own standing decisive tests before inventing one.
- **Evolution is factual**: held / refined / conceded per attendant, with
  turn citations only, consistent with that attendant's own post-interview.
  A real concession is the most valuable line in the record — never soften
  or inflate one.
- **Suggested attendants carry a named gap.** If the debate exposed a
  missing voice, record it with the specific gap it would fill. Suggestions
  are recorded, never auto-spawned. Empty list when the room sufficed.
- **Authority**: this block is agent-derived. Say so in `authority_note`.
  It informs the investor's decision; it never settles its own case.

Return JSON per the provided schema.
