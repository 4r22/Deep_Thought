# Spec: the untrusted-input channel

**Status:** spec-ready · **Effort:** M · **Seam:** `run.call` (run.py:207) + `fill` (run.py:137) + every stage prompt build
**Provenance:** per-call-site untrusted marking with a justified allowlist — pattern
observed during a survey of other Hack-Nation submissions; behavior re-specified from
scratch (see docs/CLEAN-ROOM.md). Adoption-room
verdict SPIKE-FIRST (`ast-untrusted-input-wrapper-gate`) with an explicit sequencing
order: the wrapper channel ships first with one behavioral proof; the AST enforcement
harness is a later, separate decision. Directly serves open bead vc-brain-bev (fencing
applicant prompt data).

## Why (vc-brain terms)

Third-party text flows into our prompts by design: sourced applications carry verbatim
README-derived fields (`intelligence/sourcing.py` adapter), signals carry quotes,
transcripts carry whatever the room said. Today the only structural defense is
`fill()`'s single-pass substitution (a hostile value cannot pull another slot's
payload — pinned by `test_sourcing_gate.py` `test_injection_shaped_readme_flows_as_data`).
That prevents *slot* injection but does nothing to help the model distinguish data from
instructions: the prompt text and an application's hostile "ignore all previous
instructions" arrive as the same undifferentiated string. The channel this spec builds:
untrusted payloads are **explicitly delimited as data at the prompt layer**, so every
stage prompt can (and then must) tell the model what is quoted material.

## Behavioral contract

1. **Wrapper primitive.** A pure function that takes a payload string and returns it
   enclosed in fixed sentinel delimiters (an opening line naming the block as untrusted
   quoted data + a closing line; exact tokens are the implementer's choice but MUST be
   single-line, uppercase-distinctive, and committed as named constants). **Collision
   rule:** if the payload itself contains the closing sentinel, the wrapper must
   neutralize it (documented transformation, e.g. an escaping insertion) such that the
   first genuine closing sentinel after the payload is unambiguous; the transformation
   must be visible in the output (no silent deletion).
2. **Channel through fill.** The stage prompt builders mark which slots carry
   third-party payloads. Minimum untrusted set (from reading the current builders):
   `APPLICATION_JSON` (whenever the application carries `source: "sourced-github:*"` —
   and unconditionally is acceptable v1), `SIGNALS_JSON`, `TRANSCRIPT`,
   `PRE_INTERVIEW`/`PRE_INTERVIEWS`, `POST_INTERVIEWS`, and `DECISION_JSON`.
   `DECISION_JSON` is CONTRACTUAL because it is the *only* carrier of the applicant
   text into the forum stages: no forum prompt has an `APPLICATION_JSON` slot, and the
   five `stage_forum_*` builders each thread `"DECISION_JSON": jdump(decision)` where
   `decision = {"application": load_application(...), "screen": ..., "triage": ...}`
   (assembled in `cmd_pipeline`, run.py ~1357, 2026-07-21). For `DECISION_JSON` the
   third-party payload is the `application` sub-object; the `screen`/`triage`
   sub-objects are our own machine-generated artifacts. Wrap the `application` value at
   forum mapping-build time (cleanest — preserves the trust distinction inside the
   object), or wrap the whole serialized `DECISION_JSON` string as a simpler v1. These
   two paths render differently: the sub-object wrap serializes the wrapped string through
   `jdump` (`json.dumps(indent=2, ensure_ascii=False)`, run.py:145), which escapes the
   wrapper's newlines to a literal `\n` (backslash-n) — the sentinels are then *not*
   physical lines; only the whole-string wrap (jdump the decision first, then wrap the
   result) keeps the sentinels on their own lines. Pick the assertion style (item 4)
   knowingly against this.
   Trusted-by-construction slots (`THESIS_JSON` — operator-validated at load, run.py
   `load_thesis`) stay unwrapped. Implementation shape is free (wrap at mapping-build
   time is simplest); what is CONTRACTUAL is which slots are wrapped, recorded in one
   committed table.
3. **Prompt acknowledgment.** Each prompt template whose body includes an untrusted
   slot gains one line stating that delimited blocks are quoted data, not instructions.
   (One line; this is register, not a new prompt design — the existing prompt structure is
   untouched.)
4. **Behavioral proof in replay.** The replay suite asserts, on the contested seeded
   path (the forum fires, so the application reaches every forum prompt through
   `DECISION_JSON`): every rendered prompt that contains the application payload —
   whether via the `APPLICATION_JSON` slot or via the `application` sub-object inside
   `DECISION_JSON` — shows it inside the delimiters; the sentinel constants never
   appear *unpaired*; and a hostile payload containing the literal closing sentinel
   arrives neutralized (the collision rule observable in the captured prompt). Because
   the sub-object wrap flattens the sentinels off their own lines (item 2), these
   pairing/visibility assertions — and the acceptance faults below that exercise them —
   MUST be substring/token-based over the captured prompt string, never line-anchored: a
   line-anchored check would pass the whole-string wrap yet spuriously fail the equally
   valid sub-object wrap.
5. **Slot-table tripwire.** A contract test asserts the committed untrusted-slot table
   (item 2) matches the *actual wrapped slots* both ways. "Actual wrapped slots" is a
   runtime property of the values `fill()` receives — invisible in prompt-file text, so
   it is NOT the static `test_stage_contracts.py` EXPECTED_SLOTS token scan. Derive it
   from the replay capture (`CannedModel` records every prompt it receives in `.calls` —
   but only as `{stage, prompt, label}`, the flat rendered string with no slot→value map;
   `test_pipeline_replay.py:190,194`), by one of two committed seams. **Marker seam**
   (works from `.calls` alone): seed each untrusted fixture value (application
   one_liner/fields, signals, the canned transcript and pre/post-interview outputs) with a
   distinctive marker string, then assert on each captured prompt that every seeded marker
   appears enclosed by a paired open/close sentinel *and* every delimited region encloses a
   known-untrusted marker — the two directions give the both-ways match without ever
   reconstructing a slot→value mapping from the flat string. **Recorded-slot seam**
   (permitted by item 2's free implementation shape): have the wrapper record the slot
   names it wraps at wrap-time and compare that recorded set to the committed table
   directly. The test states which seam it uses. The both-ways match is a table-integrity check: it
   fires when a listed slot stops being wrapped (item 2's remove-wrapper fault) or when
   a wrapped slot is missing from the table. It does NOT, on its own, catch a brand-new
   *unlisted* slot that is also left unwrapped (absent from both sides → passes); that
   gap is closed by the review the item-2 table forces and by the remove-wrapper fault,
   not by the table match.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Sentinel-collision fault: application one_liner containing the closing sentinel →
  captured prompt shows neutralization; an implementation that passes it through raw
  fails the test.
- Unwrapped-slot fault: remove the wrapper from `SIGNALS_JSON` in a copy → slot-table
  tripwire fails.
- Unpaired-sentinel fault: inject a stray opening sentinel into a template copy →
  pairing assertion fails.
- Existing injection pin still green (`test_injection_shaped_readme_flows_as_data`) —
  the channel composes with, never replaces, single-pass fill.
- Prompt-slot registry (`test_stage_contracts.py`) updated and green.

## Non-goals (room-sequenced)

- NO AST enforcement gate in this spec — that is the explicitly deferred second phase
  (its future shape: every `call()` site declares trust, stale allowlists fail; cite
  the provenance exemplar when that spec is written).
- No model-behavior claims (whether the model *obeys* the register is untestable
  offline; the contract is that the register exists and is structurally correct).
- No changes to forum structure or prompt content beyond the one acknowledgment line
  per affected template.

## Integration points

- `intelligence/run.py` (wrapper + stage builders), `intelligence/prompts/**` (one
  line each where affected), `intelligence/tests/` (replay assertions + slot-table
  test). Update `test_stage_contracts.py` EXPECTED_SLOTS as needed.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
