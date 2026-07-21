# Curation ledger — what this public copy excludes, and why

This repository is a deliberately curated copy of a larger working repo. Nothing here
is missing by accident, and nothing was trimmed to hide weakness — the measured
results in the README all survived curation. What follows is the actual decision
ledger: each exclusion, the rule behind it, and the reasoning, stated so you can
judge the judgment. A system whose pitch is evidence discipline owes you its own.

## 1. The flagship tape is fictional, and labelled

**Decision:** the end-to-end demo tape (`intelligence/out/ferrite-inverted`) is an
invented deal — fictional company, fictional founder — labelled as such in its
fixtures and everywhere it renders.

**Why:** it demonstrates every mechanism (screen, triage, seeded forum, counsel,
memo, verifiers) with zero risk to a real person, and it can be regenerated,
inspected, and verified by anyone without anyone's consent being at stake. The
mechanical artifact verifier passes on it; that proof does not need a real subject.

## 2. Batch results ship as aggregates, never as named runs

**Decision:** the overnight batch — 25 sourced applications end-to-end, 0 failures,
9 advance / 15 reject / 1 contested, full latency distribution — is published as
numbers only. The per-company tapes stay private.

**Why:** the batch subjects are largely fellow participants of the same hackathon.
Publishing AI-generated *reject* verdicts attached to named individuals' work —
where they and the judges will read them — is a harm our own honesty commitments
forbid, and it would prove nothing the aggregates don't already prove. The
capability claim is carried by the numbers, the machinery in this repo, and the
verifiable fictional tape.

## 3. Real outbound candidates stay private pending consent

**Decision:** runs over real founders discovered from public signals (the 794 s and
171 s runs cited in the README) are excluded until the subject consents, or the
tape is anonymized.

**Why:** analyzing public GitHub data is ordinary, lawful research — that is not
the issue. Publishing a scored profile of an identifiable, unconsenting person is a
different act: it fails the same trust discipline this pipeline enforces on its own
memos, and under EU data-protection law a scored profile of an identifiable person
is personal data under processing. The tapes are intact in the private repo;
consent flips a run public without rework. We would rather ship smaller numbers
you can trust than bigger ones someone else paid for.

## 4. Forum personas are simulations, and say so everywhere

**Decision:** forum seats are AI-simulated counterfactual personas of public
figures, reasoned from their published work. Every surface that shows them — the
landing, the viewer, the tape artifacts themselves — carries the label.

**Why:** the persona device is genuinely useful (it stress-tests a deal against
well-documented bodies of thought), and it is genuinely dangerous if a reader
mistakes it for real participation or endorsement. The label is the price of the
device, paid everywhere, without exception.

## 5. Development process stays private

**Decision:** internal working artifacts — session records, review write-ups,
agent-orchestration machinery, issue-tracker data — are excluded. (Issue tracking
via beads; that one line is the whole story.)

**Why:** how we work is not the product, and the product must stand without it.
The one process document that *does* ship is [`CLEAN-ROOM.md`](CLEAN-ROOM.md) — the
boundary discipline for reading external code — because for anyone evaluating
whether this system could touch real money, that discipline is part of the product.

## Enforcement, and reversibility

These rules are enforced mechanically, not by intention: every publish runs a leak
scanner built from a roster of every real name and handle known to the private
repo's excluded data, plus a set of banned tokens, and a separate zero-hit sweep of
the founder directory. A red scan blocks the push. And every exclusion above is
reversible by its stated condition — consent publishes a run, anonymization
publishes a tape — because the private originals are intact.
