# Why This Wins

The short version: **every other way to build an AI analyst averages opinions into a number and writes prose around it. This one builds the argument first, makes the judges read it blind, and forbids the average.** That is not a prompt strategy — it is enforced in code, tested with planted faults, and measured on real data. The differentiating question — the one an actual investment committee, an actual LP, and an actual lawyer would ask — is whether the memo can be **trusted**, and trust is not a tone of voice. It is architecture.

## 1. It runs. At scale. And the proof is published.

The typical hackathon submission demos one happy path, once, with the operator watching. This repo submits a **harness**:

- **25 sourced applications ran end-to-end overnight, unattended, with 0 failures and 0 timeouts** — 9 advance / 15 reject / 1 contested at the screen.
- Latency is published **including the worst case**: min 389 s / median 575 s / mean 702 s / max 1206 s per run. A team confident in its system publishes its max.
- The sourcing gate was measured on **580 real archived repos** (481 → 19 junk / 192 thin / 270 pass; 99 more → 5/27/67) — a measured funnel, not a hand-picked input.
- The fastest measured real run went **public GitHub signals → decision-ready memo in 171 seconds**. The challenge asks for a $100K decision inside 24 hours; the pipeline's unit of latency is minutes.
- The flagship tape (`intelligence/out/ferrite-inverted`, fictional and labelled as such) passes **every** artifact verifier, and the verifier ships in the repo with an exit-code contract. Judges don't have to take our word for anything — `python3 intelligence/scripts/verify_artifacts.py intelligence/out/ferrite-inverted` is the demo.

Robustness is architectural, not accidental: three interchangeable workers (`--worker api|cursor|claude`) mean the pipeline survives any single backend having a bad night — which is exactly how it ran a zero-failure overnight batch.

## 2. A real design contribution: the room comes before the number

Every "AI VC analyst" can emit scores. Scores emitted first are anchors the rest of the run merely rationalizes. This system inverts the order, mechanically:

- A per-deal **forum** builds the reference space first — blind pre-interviews, one debate pressed on a single crux, post-interviews with typed position evolution, typed adjudication. The decision object handed to the room deliberately contains **no scores and no axes**, and a replay test asserts it: no score reaches the room, ever.
- A standing **counsel** of three offices — Founder / Market / Idea-vs-Market — reads the full room record blind and scores **independently, never averaged**; the cross-axis mean deliberately does not exist in any artifact. Each office may introduce no new evidence; every score movement cites seat positions, documents on file, or thesis fields. Deviating from the fund mandate is legal but must be declared — an undeclared deviation is a lint failure that kills the run with the office's name on it.
- Each office also attacks the room itself (`coverage_challenges` — the stacked-room detector) and emits the cheapest decisive next checks, which become memo conditions. This is a tribunal with anti-corruption clauses, not an ensemble.
- The axes artifact survives only as a **mechanical projection** of the counsel record — code, not a model, does the aggregation. The convene/skip decision is a **gate in code, not a prompt**.

The standard LLM failure modes are engineered out, structurally:

| Failure mode | Structural counter |
|---|---|
| Consensus-smoothing, sycophancy | Three counsel offices score **blind** — no office ever sees another; agreement cannot be manufactured |
| Anchoring on scores | The forum deliberates **before** any score exists; the room is score-free by construction |
| False precision | The three axes are **never collapsed** into one number; the cross-axis mean does not exist in artifacts |
| Confabulation | Everything cited in a rating must already be on the record; citing a room that never convened is treated as fabrication and fails the run |
| Silent gap-filling | Gaps are flagged, never filled; memos enumerate their own open questions and what the room failed to test |
| Score laundering | Aggregation and projection are mechanical code — no model call ever computes an average or a disagreement line |

These are code-side invariants with failing checks, not prompt suggestions. That distinction is the whole game.

The discipline is measured, not aesthetic: in a prior private project, stance-style framings (advocate/attack) fed back 0/6 useful, while decision-native moves — named checks, tranche gates, scoping conditions — fed back 8/8. That result is why triage and counsel are forbidden from arguing sides, and why advocacy lives in exactly one place: the forum, where opposed voices are the design.

## 3. Honesty is enforced by machinery, not promised in prose

- **Per-claim Trust Score** on an explicit evidence ladder (`verified-artifact` → `verified-online` → `reconstructed` → `claimed`) — per claim, never per company. Founder-supplied material can never substantiate its own case; laundering it as independent is a named, banned defect.
- **Gaps are flagged, never filled.** Padding counts against the memo. Memos mark their own gaps.
- **Contradictions are first-class** — schema-seeded, carried as evidence-vs-evidence tensions, surfaced with both sides cited.
- **Planted-fault test acceptance**: a harness only counts once its planted fault has been demonstrated caught. 16 clean-room harness specs (`docs/specs/tests/`) encode this; the shipped pipeline suite (18 test modules) drives the real pipeline offline, including the anchoring assertion.
- **Cold start is priced, not punished** — a wide honest band instead of a low point-score for absent history. An unmodified evidence ladder would re-gate exactly the founders a sourcing system exists to find.

For a decision-support system in venture, calibrated honesty *is* the product. This is the only category of submission where "the memo admits what it doesn't know" is a competitive feature, and this repo builds it as architecture.

## 4. Full challenge scope, one contract

Sourcing → Screening → Diligence → Decision, all present and connected: a measured sourcing gate whose "pass" verdict is *defined* as opening the pipeline's input gate (the two cannot drift); a screen/triage/forum/counsel/memo core; a persistent **Founder Score** that follows the person across startups (12 memory modules + a five-gate eval harness, clean-room adapted from MIT-licensed gbrain with attribution); and a zero-dependency terminal-style viewer where every claim is one click from its evidence — headline → three axes → office records → cited positions → the room turns themselves. Three JSON schemas — Founder, Signal, Memo — are the *only* interface between layers, so each layer is independently replaceable.

The brief's editable search criteria are demonstrable in minutes: because the forum is score-free, editing the thesis re-runs only the counsel, and the changed ratings cite the exact mandate fields that moved them.

## 5. The trust posture is deployment-grade

- **Privacy curation as a feature.** A VC brain ingests founders' repos, histories, and reputations. The public repo shows the machinery, the schemas, the verifiers, the fictional labelled tape — and deliberately not the real people. Real-candidate runs are excluded pending consent and anonymization, stated plainly in the README. Shipping a *curated* copy with the curation policy written down is what deploying this class of system responsibly actually looks like.
- **Clean-room legal rigor.** Research drew on external code archives under a documented boundary discipline (`docs/CLEAN-ROOM.md`): facts and behavior transfer, expression never does, enforcement is automated in a pre-commit guard, and a full-repo contamination audit ran clean. The one adapted dependency — Garry Tan's gbrain, MIT — is attributed with full notices. Funds have LPs, auditors, and counsel; a brain they can adopt must arrive with its provenance already defensible.
- **Simulated personas are labelled as simulations everywhere** — the honesty commitments extend to how the system talks about itself.

## 6. The limits are stated — which is why the claims are believable

The public copy says plainly what it is not: no live store, no schedulers, no triggers, no serving API — a static build over committed, verifiable run tapes, with a roadmap (`docs/ROADMAP.md`) that orders the remaining steps as testable slices over machinery that already runs in batch, and names the one part that does not compress (Bloomberg-grade validated data and entity resolution). A team that is this precise about its gaps has earned belief in its claims. That asymmetry — verifiable claims, admitted limits — is rare in a hackathon and priceless in a fund.

## The close

**A VC brain is only investable if its epistemics are auditable.** Not persuasive — auditable. Every design decision here — blind counsel offices, never-collapsed axes, flagged gaps, the mechanical gates, the curated public copy, the human who signs the check — is the same decision made at a different layer. Other entries demonstrate that an LLM can sound like an investor. This one demonstrates the thing a fund would actually pay for: a system whose judgment can be interrogated, whose numbers were measured, whose legal and privacy posture is already written down — and which tells you, unprompted, exactly where it ends.
