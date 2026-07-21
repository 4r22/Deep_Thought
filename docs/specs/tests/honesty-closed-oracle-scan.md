# Spec: closed-oracle honesty scan

**Status:** spec-ready · **Effort:** M · **Seam:** rendered memo + decision artifacts at assembly
**Provenance:** deterministic honesty audit and refuse-to-publish forbidden-substring
gate — patterns observed during a survey of other Hack-Nation submissions; behavior
re-specified from scratch (see docs/CLEAN-ROOM.md). Adoption-room verdict
SPIKE-FIRST (`deterministic-ai-honesty-audit`), with the room's explicit bound: general
"never overstate certainty" policing is OUT of mechanical reach and must not ship.

## Why (vc-brain terms)

Three honesty properties of our rendered output are *closed-oracle* — checkable by
deterministic scan because the ground truth is structural, not semantic:

1. **Authority disclosure.** The system's own doctrine says agent output must declare
   itself: the adjudication schema requires an `authority_note` ("agent-derived —
   material… never an authority"), and the memo decision block carries the same
   register. Nothing asserts the rendered memo actually *ships* a disclosure.
2. **Tier-faithful language.** A claim whose `trust.verification` is `unverified`
   must not be narrated with verification vocabulary. The trust ladder
   is our headline strength; a memo sentence saying "verified" over a claimed-tier
   receipt launders the ladder in prose.
3. **Register bans in output.** The score-laundering vocabulary banned from prompts by
   the import-boundary spec must also be absent from *rendered* artifacts: no
   `composite score`/`blended score`/`overall score` phrasing (the *score* sense only —
   bare `composite`/`blended` stay legitimate register vocabulary) in memo prose or
   decision rationale (three axes are never averaged — `docs/COUNSEL.md` doctrine).

## Behavioral contract

1. **Disclosure check.** The assembled memo MUST contain, in its decision block or a
   memo section body, at least one sentence matching a committed disclosure pattern
   (case-insensitive, word-boundary regex — or normalize the scanned surface to
   lowercase before matching). The pattern list is a named constant whose seeded entries are
   phrasing actually present in the register: `agent-derived`
   (`intelligence/prompts/memo/decision.md` — the triage/axes/forum headers and the
   decision rule "You are agent-derived input"; also the `authority` enum in
   `memo-section.schema.json`) and the decision-rationale mandate "agent-derived input,
   and says so" (`memo.schema.json` → `decision.rationale` description). An implementer
   MAY add further disclosure phrasings (e.g. "AI-generated", "input, not a decision"),
   but those are implementer-chosen alternatives, not seeded from the register.
   Case-insensitivity is load-bearing: the committed replay fixture's decision rationale
   ships the capitalized "Agent-derived input; the human investor is the gate."
   (`test_pipeline_replay.py:169`), which the lowercase-seeded `agent-derived` entry
   matches only case-insensitively — so the replay baseline stays green. Absence
   fails assembly.
2. **Tier-faithful language check.** For every claim: if `trust.verification` is
   `unverified`, then the claim's `text` and any memo sentence citing that claim's id
   MUST NOT contain a word-boundary `verified|confirmed|proven|validated` match in
   positive position. A match sits in negative (permitted) position when, within the
   same sentence, it is preceded by an enumerated negator cue — `not`, `not yet`, `no`,
   `cannot`, or `could not` — or the matched word itself carries a `un-` prefix (already
   excluded by word-boundary matching, so "unverified" never matches `\bverified\b`);
   thus "not verified", "not yet verified", and "cannot be confirmed" pass. This
   predicate is applied through a generic, cue-agnostic helper
   `is_negated(sentence, matched_span, cues)` that the rationale-gate-fidelity spec
   exposes. The two specs MUST share that helper implementation; each supplies its own
   cue list (this spec's cues are the negators above — rationale-gate-fidelity's are its
   machinery phrases). Sharing the helper is the MUST — the cue lists stay per-spec.
3. **Output register ban.** Word-boundary scan of all rendered `body_md` + decision
   rationale for the laundering list — the *score* sense only
   (`composite[_ ]?score|blended[_ ]?score|overall[_ ]score`; bare `composite`/`blended`
   stay legitimate). That list is the same constant the import-boundary spec's
   `no-score-laundering` rule owns; it lives in a neutral module,
   `intelligence/registers.py` (created at implementation time), that no scan rule's
   globs cover — the runtime honesty gate imports it there, and so does the
   import-boundary test module. It MUST NOT be defined in `intelligence/run.py` (the
   sibling scan reads run.py identifiers code-only, so the literal there would self-trip
   `no-score-laundering`) nor in `intelligence/prompts/**` (the same scan bans it there).
   Discussing the ban itself in a memo is not a real use case — no allowlist; if one ever
   appears legitimately, that is a spec-bug filing.
4. **Fatality + reporting.** Violations raise at assembly naming the check, section,
   sentence, and (for 2) the claim id and its recorded verification value. On success
   the pass emits a one-line stderr summary (checks run, sentences scanned) so tapes
   record the gate ran — same convention as the rendered-figure gate spec.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Strip the disclosure sentence from a canned decision → check 1 fails.
- A canned section says "verified 40% growth [C2]" while C2 carries
  `verification: "unverified"` → check 2 fails naming C2; change the sentence to
  "claimed 40% growth [C2]" → passes; "not yet verified [C2]" → passes (the "not yet"
  negator cue precedes the match in-sentence).
- Plant "blended score of 73" in a canned rationale → check 3 fails.
- Full replay suite green after integration; committed tapes pass or are regenerated
  (report which, if any, failed which check — that report is adoption evidence).

## Non-goals (room-bounded)

- No paraphrase detection, no certainty-calibration policing, no sentiment analysis.
- No real-person-name scanning (privacy gating lives in the pages-deploy path and the
  publish-gate decision, not here).
- No n-audit (numbers-without-sample-size) — the rendered-figure gate owns numeric
  discipline; cross-reference, don't duplicate.

## Integration points

- `intelligence/run.py` assembly seam beside `lint_provenance`. The laundering-list
  constant (score sense only) is owned by the import-boundary spec and imported from a
  neutral `intelligence/registers.py` (created at implementation time — not `run.py`,
  not `prompts/**`, so no sibling scan self-trips); check 2's negator predicate is
  applied through the shared `is_negated` helper the rationale-gate-fidelity spec
  exposes, with this spec's own cue list. Tests beside `test_assembly.py`.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
