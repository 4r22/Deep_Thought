# Task: founder-potential deep read

Produce a thorough, deep **founder-potential** analysis of one person from
their actual signal set. This stage exists because "contested + go verify"
is a shrug, not a read — every incoming signal, including from people who
have not founded anything yet, gets this treatment.

This is a read of the **person**, not a deal score and not a copy of
Memory's Founder Score. The persistent Founder Score on the record (if
present) is one prior to weigh, never a substitute.

## Fund thesis (lens; optional — may be `null`)

```json
{{THESIS_JSON}}
```

## Founder record

```json
{{FOUNDER_JSON}}
```

## This person's signals (joined; chronological)

```json
{{SIGNALS_JSON}}
```

## What to produce

1. **potential** (integer 0–100) with a **`[low, high]` band** and
   **confidence**. The band carries honesty: thin evidence means a wide
   band, never a silently precise point. Depth ≠ fake precision.
2. **trajectory** — what the signal *timeline* implies, judged from
   `observed_at` / `ingested_at` timestamps (cadence, acceleration,
   one-off spike vs sustained motion). If timestamps are too thin to
   support a trajectory claim, set `trend` to `too-thin` and say so —
   do not invent a story from a single snapshot.
3. **comparables** — named people from world knowledge whose *early*
   trajectories rhyme with this signal set. Each needs a scoped
   `why`: what the comparison protects against reading wrong, and where
   it breaks. Invented composites are banned. Vague vibe-matches
   ("another technical founder") are banned.
4. **strengths[]** and **unknowns[]** — every claim evidence-anchored.
   Cite signal ids as `[sig-…]` in the claim text where natural, and
   list them in `evidence_refs`. Speculation must be labeled
   `[unanchored]` and belongs in `unknowns`, not `strengths`.
5. **watch_signals[]** — the named **next** signals that would move the
   band, each with `where_to_look` and `band_effect`. Prefer concrete
   observables (a second channel, a shipping artifact, a customer
   conversation) over "do more diligence."
6. **escalate** — `{to_forum, crux}`. `to_forum: true` **only** when a
   genuine non-empirical fork about *this person* remains after every
   empirical question has a named watch_signal. A contested *deal* is
   not automatic person-level escalation. Default `false` with empty
   `crux`.
7. **authority_note** — this read is agent-derived. Say so.

Set `cold_start: true` when the read rests on public footprint only (no
funding history, no shipped-product company history on the record). Cold
start widens the band; **absence of founding history is never negative
evidence**. The system exists to see exactly these people.

## Discipline

- **Emit moves, not stances.** Advocacy for or against this person is
  noise. What earns its place: a named next signal that would move the
  band, a scoped comparable, a gate worth setting, a false binary
  caught (e.g. "no company yet ⇒ low potential"). If you find yourself
  arguing a side, convert it into the check or watch-signal that would
  decide it.
- **Cold-start honesty.** Wide band, never punished. Do not launder
  "we haven't seen a company" into a low point estimate.
- **Evidence anchors.** Every strength / unknown / trajectory claim
  grounded in `[sig-id]` or explicitly `[unanchored]`. No evidence, no
  score movement off the cold-start prior.
- **Pattern-matches must be scoped.** "Infra founders need systems DNA"
  conventions: state what the convention protects against, whether
  those conditions hold *here*, and the cost of honoring it.
  "Pattern says so" is banned as a verdict in either direction.
- **Authority.** This artifact is agent-derived material for the
  operator to argue with. It does not authorize a check, settle its
  own case, or overwrite Memory.

Return JSON per the provided schema.
