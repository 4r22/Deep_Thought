# Spec: rendered-figure provenance gate

**Status:** spec-ready · **Effort:** M · **Seam:** memo assembly + provenance lint
**Provenance:** the gap was confirmed by our own adoption room
`deterministic-ai-honesty-audit` and then verified against the code: `lint_provenance`
checks provenance lines against claim ids only, never scans rendered prose, and only
warns. Figure-audit ideas were observed during a survey of other Hack-Nation
submissions; behavior re-specified from scratch (see docs/CLEAN-ROOM.md). No archive
access needed.

## Why (vc-brain terms)

An investment memo's numbers are its most load-bearing sentences. Today a model-written
`body_md` can contain "$18k MRR growing 40% m/m" with no citation at all — verified
directly: nothing in assembly or lint reads prose, and even the existing provenance lint
is advisory (prints to stderr, never fails). The gate this spec builds: **no figure in
rendered memo prose without a cited claim standing behind it** — and the lints stop
being advisory.

## Behavioral contract

1. **Figure detection.** A deterministic scanner over every assembled `body_md` and the
   decision rationale that extracts *material figures*: currency amounts, percentages,
   multipliers ("10x"), and scale-suffixed counts ("3,100 installs", "240 orgs", "18k").
   A named allowlist of non-material numerics is excluded: ISO dates, years, section/
   claim/signal reference tokens (`C3`, `sig-…`), version strings, list indices. The
   regex set and allowlist are named code constants with a comment per class. This gate
   OWNS the numeric extraction/normalization machinery — the figure regex set plus the
   normalization rules of contract 3 (strip separators, resolve k/M suffixes) — and those
   constants live in `intelligence/registers.py` (the shared-constants module owned by
   the import-boundary spec, created by whichever registers.py spec lands first). The
   claim-provenance-completeness spec imports them from
   there for its duplicate-citation-divergence check; it layers its own quantity-KIND
   extraction on top (which figure is an MRR vs a growth rate). Value normalization is
   shared; that kind logic is not.
2. **Citation binding.** For each material figure, the *sentence* containing it MUST
   contain at least one claim citation token (the assembly's `[C#]` form). Sentence
   boundaries: the same splitting rule the assembly already uses for claims, or a
   documented simple rule (period/newline) — pick one, document it.
3. **Figure-faithfulness.** For each cited sentence, the figure MUST appear (numerically
   equal after normalization: strip separators, resolve k/M suffixes) in the cited
   claim's own text or its evidence quotes. A figure whose sentence cites `[C2]` but
   which appears nowhere in C2 is a violation ("citation laundering").
4. **Fatality.** Violations of 2 or 3 raise at assembly (house SystemExit); additionally
   the existing `lint_provenance` warnings become fatal in the same pass (aligning with
   open bead vc-brain-oth). Making `lint_provenance` fatal is a shared work item with the
   claim-provenance-completeness spec — implement it once, whichever spec lands first, and
   state in the PR which landed it. Error messages name the section, sentence, figure, and —
   for 3 — the cited claim id.
5. **Report.** On success, the lint emits a one-line summary (figures checked, sections
   scanned) to stderr so tapes record that the gate ran.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Planted fault A — unsourced figure: a canned section with "$2.4M ARR" and no citation
  in the sentence → assembly refuses, naming the sentence.
- Planted fault B — citation laundering: "revenue grew 40% [C1]" where C1's text and
  evidence contain no 40% → refuse, naming C1.
- Planted fault C — advisory rot: a provenance line citing an unknown claim id MUST now
  fail assembly (was warn-only).
- Allowlist sanity: a section containing "2026-07-21", "seat-3", "[C2]", and "v1.4.0"
  and no material figures → passes with zero figures counted.
- Normalization: "18k" in prose matches "18,000" in the claim; "10x" matches "10×".
- Full replay suite green after integration (canned bodies in existing tests may need
  citations added — that churn is in scope and is itself evidence the gate bites).

## Non-goals

- No verification that the claim itself is *true* (that is the trust ladder's job).
- No qualitative overclaim policing ("massive growth") — bounded out by the room.
- No LLM re-checking.

## Integration points

- `intelligence/run.py`: beside `lint_provenance` / inside `assemble_memo`.
- Tests beside `test_assembly.py`; replay-path coverage via the CannedModel harness.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
