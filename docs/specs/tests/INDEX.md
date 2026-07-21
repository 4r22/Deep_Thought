# Clean-room test-harness specs

**Wave 1:** 2026-07-21 · bead vc-brain-b3w (six resonance picks).
**Wave 2:** 2026-07-21 · bead vc-brain-7bn (the full improved-suite contract set).

## The clean-room contract

These specs are written for **completely isolated implementers** — instances spawned
from this repo with no archive access, instructed not to consult other implementations
including public GitHub. Per [docs/CLEAN-ROOM.md](../../CLEAN-ROOM.md): behavior, facts,
measurements, thresholds, and `path:line` citations transfer freely and densely;
expression does not. Provenance lines record where a pattern was observed during a
survey of other Hack-Nation submissions; behavior was re-specified from scratch. They
are audit-trail receipts, never reading assignments for the implementer.

Implementer ground rules, all specs:

- Stdlib-only tests in the house style (`unittest`, `intelligence/tests/` conventions;
  JS/TS pieces follow the zero-dep `experience/` and `memory/lib/` conventions). No new
  dependencies, no network, no live model calls — every acceptance criterion is
  verifiable inside the VM with the repo alone.
- Every harness ships with its own falsification: the planted faults in each spec's
  acceptance criteria MUST be demonstrated caught (and the no-fault path green) before
  the harness counts. A gate that has never seen its fault fire is theater.
- Respect each spec's *Non-goals* — several encode adoption-room skip verdicts and
  sequencing decisions; they are boundaries, not suggestions.
- Every spec ends with the escape hatch. Use it: a spec bug filed beats an
  improvised interpretation.

## Wave 1 — the resonance picks

| spec | one-line pitch | effort | seam |
|---|---|---|---|
| [confidently-wrong-meter.md](confidently-wrong-meter.md) | Calibration from operator feedback: the trust ladder's own error rate | M | memo claims + feedback record |
| [rank-order-retrieval-regression.md](rank-order-retrieval-regression.md) | Golden cases pinning ranking *order*, not presence | M | terminal search |
| [reskin-similarity-guard.md](reskin-similarity-guard.md) | Name-swapped resubmissions caught by neutralized shingles | S | sourcing gate |
| [rationale-gate-fidelity.md](rationale-gate-fidelity.md) | Memo prose may not cite machinery that never ran | S | memo assembly |
| [rendered-figure-provenance-gate.md](rendered-figure-provenance-gate.md) | No number in rendered prose without a cited claim; lints go fatal | M | memo assembly + lint |
| [detection-delta-harness.md](detection-delta-harness.md) | Plant a fault, run the suite, report catch/miss — the SPIKE-FIRST evidence tool | M | tests meta-tooling |

## Wave 2 — the improved-suite contract set

> **STATUS 2026-07-21 (bead vc-brain-qot): verification findings APPLIED — wave-2
> specs are spec-ready.** Round 1 (9 of 11 reports; 1 blocker + 21 major + 18 minor)
> applied in full. A fresh
> 11-agent round 2 over the fixed specs (2 blockers + 16 major + 25 minor, incl. the
> first-ever reviews of replay-field-mutation and the cross-spec consistency map)
> applied in full. Targeted round 3 re-verified the redesigned replay-field-mutation
> and the cross-spec map; its residuals are applied. Line cites carry dated
> `(run.py:N, 2026-07-21)` anchors — function names are authoritative on drift;
> re-grep before implementing.

| spec | one-line pitch | effort | seam |
|---|---|---|---|
| [both-ways-postcheck-pairs.md](both-ways-postcheck-pairs.md) | Every postcheck rule gets a violating + minimally-compliant pair, with a coverage tripwire | S | all code-side postchecks |
| [verbatim-span-citation-gate.md](verbatim-span-citation-gate.md) | Every evidence quote is a literal span of its cited signal; gate-zero characterization first | S | memo claims |
| [import-boundary-scan-gate.md](import-boundary-scan-gate.md) | Static word-boundary scans for our real architectural bans (SDK containment, zero-dep, register) | S | source tree |
| [replay-byte-determinism.md](replay-byte-determinism.md) | Same inputs → byte-identical artifacts, across processes and PYTHONHASHSEED | S | replay + assembly |
| [artifact-placeholder-golden.md](artifact-placeholder-golden.md) | No unfilled tokens or placeholder debris in tapes and shipped HTML | S | tapes + verify_artifacts + pages |
| [claim-provenance-completeness.md](claim-provenance-completeness.md) | Both-directions claim/evidence integrity: resolution, contradictions, one-receipt-one-figure | M | memo assembly |
| [honesty-closed-oracle-scan.md](honesty-closed-oracle-scan.md) | Disclosure present, tier-faithful language, no score-laundering vocabulary in output | M | rendered memo |
| [untrusted-channel-wrapper.md](untrusted-channel-wrapper.md) | Third-party payloads delimited as data at the prompt layer, with a slot-table tripwire | M | run.call + fill + prompts |
| [verdict-rubric-clamp.md](verdict-rubric-clamp.md) | Mechanical facts bound the permissible recommendation set; thin ≠ confirmed-weak pinned at counsel | M | decision + counsel postchecks |
| [replay-field-mutation.md](replay-field-mutation.md) | ≥10 one-field replay mutants with recorded caught/missed expectations | S | detection-delta registry |

## Coverage map (adoption ledger → specs)

From the internal adoption ledger (28 rooms): the 1 ADOPT-NOW and 12 of 14 SPIKE-FIRST
items are covered above — `structured-output-contract-tests` → both-ways-postcheck-pairs
(closure walker excluded: the 2026-07-21 spike found it vacuous);
`verbatim-quote-fidelity-gate` → verbatim-span-citation-gate (numeric variant deferred
per its room); `forbidden-term-source-scan-gate` → import-boundary-scan-gate;
`ci-gated-byte-identical-replay` + `cross-run-determinism-idempotence` →
replay-byte-determinism (merged, one seam); `rendered-artifact-placeholder-golden` →
artifact-placeholder-golden; `claim-provenance-completeness-validators` →
claim-provenance-completeness; `deterministic-ai-honesty-audit` →
honesty-closed-oracle-scan + rendered-figure-provenance-gate;
`ast-untrusted-input-wrapper-gate` → untrusted-channel-wrapper (AST phase deferred per
its room's sequencing); `output-hygiene-publish-gate` → artifact-placeholder-golden +
honesty-closed-oracle-scan (publish-refusal semantics land with those two; a separate
deploy-time gate remains an operator decision); `golden-verdict-rubric-llm-cannot-override`
→ verdict-rubric-clamp; `phantom-gate-hallucinated-justification` →
rationale-gate-fidelity (wave 1); `anti-fabrication-mutation-over-replay` →
replay-field-mutation.

**Deliberately not specced:** `anti-shortcut-fame-not-signal` and
`homonym-word-sense-grounding` — both require observing live scorer/grounder behavior,
which the no-model-call VM cannot do; the homonym concern's mechanical half (right
words, wrong receipt) is an acceptance case inside verbatim-span-citation-gate, and the
fame spike stays a live-run task for the operator side. All 12 CONDITIONAL items stay
conditional (their tripwires are recorded in the ledger), and the SKIP-NOW stays
skipped.
