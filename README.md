# VC Brain

**A deliberation engine for venture decisions. The room comes before the number.**

Built for the Hack-Nation × MIT Global AI Hackathon, Challenge 02 (Maschmeyer Group): an AI venture analyst covering **Sourcing → Screening → Diligence → Decision**, taking a candidate from first signal to a decision-ready memo — and a deployable $100K check — inside 24 hours. Downstream fund operations are out of scope by design.

**Live demo:** <https://4r22.github.io/Deep_Thought/> — landing page with the full architecture rundown; run viewer at [`/experience/`](https://4r22.github.io/Deep_Thought/experience/). The full case: [`docs/WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md).

---

## The core architectural claim

Most AI-analyst designs ask a model to score a deal, then generate prose to justify the score. VC Brain inverts that, structurally, so the inversion cannot be skipped. Two funnels, connected:

```
580 archived repos → SOURCING GATE (deterministic, read-only; junk | thin | pass —
                     "pass" is DEFINED as opening the pipeline's input gate)
                        ↓
application + signals + thesis
   → INPUT GATE   mechanical, in code — refuses thin data before any token is spent
   → SCREEN       advance | reject | contested
   → TRIAGE       routes every checkable question to its cheapest decisive check;
                  what survives becomes the single crux
   → FORUM GATE   mechanical, in code — convenes for advance AND contested
   → FORUM        a per-deal deliberation room, built FIRST, score-free
   → COUNSEL      three standing offices cross-examine the room — blind,
                  independent, never averaged
   → MEMO         dispatched document agents + a mechanical claims ledger
   → HUMAN GATE   the investor decides
```

Four properties make this a different machine, not a different prompt:

1. **Forum before counsel — de-anchoring by construction.** The forum builds a populated reference space first: named seats, blind pre-interviews, one moderated debate pressing the single crux, post-interviews recording each seat's *held / refined / conceded* with turn citations, and a typed adjudication. **No scores, bands, or scoreboards enter the room in any form** — the axes are deliberately withheld so the room reasons from evidence rather than rationalizing a number. Forced consensus is forbidden; a surviving fork must produce an **Instrument** — the concrete move that would collapse it — which flows into the memo's decision conditions.
2. **A standing counsel that judges the room — and is never averaged.** Three offices — **Founder**, **Market**, **Idea-vs-Market** — each read the full proceedings blind (no office sees another) and render one dimension: score, band, trend, confidence. Every movement must cite the record; new evidence is banned; an undeclared deviation from the fund mandate is a code-side defect that halts the run. **The cross-axis mean deliberately does not exist in any artifact.** Spec: [`docs/COUNSEL.md`](docs/COUNSEL.md).
3. **An evidence ladder, per claim — never per company.** Every claim carries a trust tier: `verified-artifact` → `verified-online` → `reconstructed` → `claimed`. An orthogonal authority split makes "authority laundering" — citing the founder's own material, or the pipeline's own outputs, as if independent — a named, banned defect. Contradictions are first-class and surfaced with both sides cited, never smoothed over.
4. **Mechanical everything that must not be vibes.** The input gate, forum convene/skip gate, counsel assembly, axes projection, memo claim-ledger, and artifact verification are **plain code, not model judgments**. Post-checks enforce what schemas cannot — band ordering, citations required iff a room convened, declared-iff-noted deviations — and a violation is a `SystemExit` naming the office.

A dividend of the score-free forum: **editing the fund mandate re-runs only the counsel, never the deliberation** — change [`config/thesis.example.json`](config/thesis.example.json), re-run `./run.py counsel`, and the ratings shift with cited `mandate_refs`, in minutes.

## Three layers, one contract

The system is three independently-buildable layers whose **only** interface is a set of frozen JSON Schemas — **Founder, Signal, Memo** ([`intelligence/schemas/`](intelligence/schemas/); 17 schemas ship in total, covering every stage's I/O):

- **Memory** ([`memory/`](memory/)) — 12 zero-dependency modules plus a six-file eval harness with a five-gate acceptance discipline. Includes a **persistent Founder Score that follows the person across startups**, with an explicit cold-start method: a founder with no funding history is scored on public footprint with an honest wide band (`cold_start: true`), never a low point-score for absence of history. Adapted from Garry Tan's **gbrain** (MIT; attribution in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)) via the spec-extraction discipline in [`docs/CLEAN-ROOM.md`](docs/CLEAN-ROOM.md).
- **Intelligence** ([`intelligence/`](intelligence/)) — the pipeline above ([`run.py`](intelligence/run.py), 11 prompt templates), plus the outbound sourcing gate ([`sourcing.py`](intelligence/sourcing.py)): deterministic, read-only repo metrics issuing junk / thin / pass verdicts.
- **Experience** ([`experience/`](experience/), [`index.html`](index.html)) — a zero-dependency, hand-rolled run viewer and keyboard-first terminal (entity keys × function mnemonics, ⌘K palette, evidence network graph). The hand-roll was justified by a license-verified OSS survey ([`research/oss-terminal-sweep/`](research/oss-terminal-sweep/)). Every scored claim is one click from its evidence.

## Measured, not promised

- **End-to-end works**, with three interchangeable workers (`--worker api|cursor|claude`) — the same pipeline runs on an API key, detached CLI workers, or subscription auth.
- **The flagship tape ships in this repo.** [`intelligence/out/ferrite-inverted/`](intelligence/out/ferrite-inverted/) — a fictional deal, clearly labelled — passes every artifact verifier and carries per-stage instrumentation (746.9 s end-to-end on the contested path, the most deliberation-heavy route).
- **Batch scale, on real data:** an overnight trial ran **25 sourced applications end-to-end with 0 failures and 0 timeouts** — screen verdicts 9 advance / 15 reject / 1 contested; latency min 389 s / median 575 s / mean 702 s / max 1206 s. (The runs are excluded from this public copy pending consent and anonymization.)
- **Sourcing at volume:** the gate processed **580 real archived repos**: 481 → 19 junk / 192 thin / 270 pass; a further 99 → 5 / 27 / 67.
- **Speed as evidence:** fastest real outbound run, public GitHub signals → decision-ready memo in **171 seconds** (run excluded from this copy).
- **Test discipline:** the pipeline suite ([`intelligence/tests/`](intelligence/tests/), 18 modules) ships and passes — including a canned-model replay of the *real* pipeline asserting no score ever reaches the room. [`docs/specs/tests/`](docs/specs/tests/) adds 16 implementable harness specs under a planted-fault acceptance rule: a gate that has never seen its fault fire does not count.

## Honesty commitments

- Every claim traces to evidence at a stated confidence tier; **gaps are flagged, never filled** — "cap table: not disclosed" beats a plausible invention, and padding counts against the memo.
- The three axes are **never collapsed into one number** in any artifact.
- Cold start is priced, not punished — the width of the band is where the honesty lives.
- Degraded modes are explicit: when no room convenes, the counsel record says so plainly, with wide bands and capped confidence.
- **One human holds the gate.** The decision block is agent-derived input into an investor's read, and says so.

## Simulated personas — read this

Forum seats are **AI-simulated counterfactual personas** of public figures, reasoned from their published work. They are clearly labelled as simulations everywhere they appear — in artifacts, in the viewer, and in memos. **No real person participated in, reviewed, endorsed, or is quoted by any deliberation in this repository.** The personas are lenses over a public record, not statements by the people named.

## This is a curated public copy

Real-candidate runs, sourcing archives, and internal process records are **deliberately excluded** from this repository. That is not missing polish — it is the same privacy discipline the pipeline itself enforces: real people's data does not ship without consent and anonymization. Everything needed to evaluate the architecture — code, schemas, prompts, tests, specs, and a fully-verified fictional tape — is here.

## What this repo is not (yet)

Called by its name, per [`docs/ROADMAP.md`](docs/ROADMAP.md): the live demo is a **static build over committed run tapes** — nothing updates until it is rebuilt. There is no live store (memory is flat JSON in git), no scheduler, no signal-driven triggers, no server. The roadmap to an always-on terminal — Store → Harvesters → Triggers → Serving, each with a named exit test — is designed and sequenced, not built, on top of machinery that already runs in batch ([`intelligence/scripts/farm_run.py`](intelligence/scripts/farm_run.py)).

## Quickstart

```sh
# Viewer, locally (static — no build step, no dependencies)
python3 -m http.server 8617      # then open http://localhost:8617/

# Verify the flagship tape (stdlib-only, no model calls)
python3 intelligence/scripts/verify_artifacts.py intelligence/out/ferrite-inverted

# Run the full pipeline on the fictional fixture (needs ANTHROPIC_API_KEY)
cd intelligence
./run.py pipeline --application fixtures/application-ferrite.json \
  --thesis ../config/thesis.example.json \
  --signals fixtures/signals-ferrite.json -o out/ferrite

# Run the tests (offline, canned-model replays)
cd intelligence && python3 -m unittest discover -s tests
```

## Repo map

| Path | What it is |
|---|---|
| [`intelligence/`](intelligence/) | Pipeline runner, sourcing gate, prompts, schemas, tests, verified demo tape |
| [`memory/`](memory/) | Founder/Signal memory modules + eval harness (gbrain-adapted, MIT) |
| [`experience/`](experience/) | Zero-dependency run viewer + keyboard terminal |
| [`docs/`](docs/) | [`WHY-THIS-WINS.md`](docs/WHY-THIS-WINS.md) · [`COUNSEL.md`](docs/COUNSEL.md) · [`ROADMAP.md`](docs/ROADMAP.md) · [`CLEAN-ROOM.md`](docs/CLEAN-ROOM.md) · [`DESIGN-FORUM.md`](docs/DESIGN-FORUM.md) · [`specs/tests/`](docs/specs/tests/) |
| [`research/`](research/) | gbrain spec extraction, OSS terminal survey |
| [`config/`](config/) | Example fund thesis (the editable mandate) |

Issue tracking via beads. License: source-available, all rights reserved — see [`LICENSE`](LICENSE); gbrain-derived files in `memory/` remain MIT per [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
