# Spec: the re-skin similarity guard

**Status:** spec-ready · **Effort:** S · **Seam:** `intelligence/sourcing.py` (sourcing gate)
**Provenance:** pattern observed during a survey of other Hack-Nation submissions;
behavior re-specified from scratch (see docs/CLEAN-ROOM.md). No archive access needed
or permitted.

## Why (vc-brain terms)

Our own sourcing campaign kept discovering copies *by accident*: one submission was a
byte-identical copy of another under a different author (caught only because a verifier
happened to diff them), plus four near-verbatim clones of an external project, plus one
author double-submitting the same repo under two names. Deal-flow has the same failure
mode: the same pitch resubmitted with the company and founder names swapped. Byte hashes
catch none of the interesting cases. The guard we want is *gaming-resistant similarity*:
strip the identifying names FIRST, then compare — so a find-and-replace re-skin scores
as the duplicate it is.

## Behavioral contract

1. **Neutralization.** A pure function that, given an assembled application record (the
   `sourcing.py` output shape: `company_name`, `one_liner`, `founder.name`,
   `deck_claims[]`), produces a token stream in which identifying terms are replaced by a
   single placeholder token. Identifying terms = at minimum: the record's own
   `company_name` and `founder.name` (case-insensitive, word-boundary), plus capitalized
   multi-token proper-noun runs. Numbers survive neutralization (a re-skin usually keeps
   the fake metrics).
2. **Similarity.** Overlap of fixed-length word shingles (recommended n=8; document the
   chosen n) between two neutralized streams, scored by Jaccard similarity. Deterministic,
   stdlib-only, O(n) memory per record.
3. **Thresholds.** Two named constants, `WARN` and `FAIL` (suggested 0.20 / 0.40 — tune
   against the acceptance corpus, document the tuning): `FAIL`-or-above marks the pair a
   duplicate; `WARN`-band emits a warning entry. Thresholds are code constants, not
   config.
4. **Gate integration.** `sourcing.py gate` gains a pairwise pass over the batch's
   PASS-tier applications: each new record is compared against all prior ones; a
   `FAIL`-level match adds `"duplicate_of": "<owner/repo>"` + the score to the gate
   record (verdict stays `pass` — flagging, not suppression; the funnel's consumers
   decide). The report summary counts duplicate pairs.
5. **Symmetry + self.** `sim(a,b) == sim(b,a)`; `sim(a,a) == 1.0`; records too short to
   form one shingle score `0.0` against everything and are counted `too-short`, never
   crash.

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Planted fault A — byte-copy: two identical records → score 1.0, flagged FAIL.
- Planted fault B — the re-skin: two records identical except company name, founder name,
  and two location/proper-noun swaps → MUST still score ≥ FAIL. An implementation that
  compares raw (un-neutralized) text and therefore misses this MUST fail the test.
- Planted fault C — false positive control: two genuinely different applications that
  share domain vocabulary ("AI", "pipeline", "founders") → MUST score below WARN.
- Threshold semantics: a WARN-band pair warns but does not set `duplicate_of`; a
  FAIL-band pair sets it. Both asserted.
- Determinism: same inputs, same scores, across two runs.

## Non-goals

- No embeddings, no LLM similarity, no external services.
- No cross-batch persistence in v1 (compare within one gate run only; a persistent
  fingerprint store is a separate future decision).
- Not a plagiarism verdict — output is a flag with a score, and the authority note is
  the sourcing report's existing register (mechanical signal, operator judges).

## Integration points

- `intelligence/sourcing.py` (new pure module + hook in `cmd_gate`),
  `intelligence/tests/test_sourcing_gate.py` conventions for the new test file. If the
  similarity logic lands as a *sibling* module imported by `sourcing.py`, the
  import-boundary spec's `sourcing-stdlib-only` allowlist — a snapshot of sourcing.py's
  import set (`argparse`, `json`, `pathlib`, `re`, `subprocess`, `sys`, plus `run`) — must
  gain that module's name in the same PR, or the new import trips that gate. Keeping the
  logic inline in `sourcing.py` (functions in the same file, no new import) needs no
  allowlist change.
- Documentation: one paragraph in `intelligence/README.md`'s sourcing-gate section.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
