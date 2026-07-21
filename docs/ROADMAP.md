# Roadmap — the distance to the terminal

**Written 2026-07-21.** The destination: a terminal in the Bloomberg sense — live feeds
in, analysis running whether or not anyone is watching, and a login that shows the
current, dynamically-updating state of every founder we track.

Two framing corrections drive this version of the map:

1. **Call things by their names.** The demo is a static build over committed run tapes.
   Nothing on the page updates until we rebuild and recommit. We say that plainly and
   let the built machinery speak for itself.
2. **We are further along than a naive inventory suggests, and we move at AI speed.**
   The always-on ingredients already exist as *batch* machinery — what's missing between
   here and a live terminal is mostly scheduling, storage, and serving, which is
   agent-driven engineering measured in days-to-weeks, not quarters. One part does not
   compress, and it is named at the bottom.

## What is already built (the under-credited inventory)

- **The inverted pipeline with a standing counsel** — screen → triage → forum → counsel
  → memo (`intelligence/run.py`), fund thesis injected at every stage. The forum seats
  real named voices on the crux; the counsel's three offices (Founder / Market /
  Idea-vs-Market) blindly cross-examine the room record and score only after it; `axes`
  is a mechanical projection of the counsel record. `intelligence/out/ferrite-inverted`
  is the first tape green on every artifact verifier. Spec: `docs/COUNSEL.md`.
- **A measured sourcing gate** — `intelligence/sourcing.py`: harvest → junk/thin/pass,
  with "pass" *defined* as opening the pipeline input gate (`./run.py gate`), so the two
  gates cannot drift. Measured on 580 real archived repos (481 → 19/192/270;
  99 → 5/27/67).
- **A batch farm runner** — `intelligence/scripts/farm_run.py`: the full pipeline over
  any glob of sourced applications, three interchangeable workers (`api`, `cursor`,
  headless `claude` on subscription auth), proven in cloud agent environments as well as
  locally. A 25-run person-seeded overnight trial was completed (runs excluded from
  this public copy).
- **Speed as evidence** — a real outbound candidate went from public GitHub signals to
  a decision-ready memo in 171 seconds (run excluded from this public copy), forum
  fired by a mechanical gate (code, not a prompt).
- **The honesty substrate** — schema validation at one seam, planted-fault harnesses,
  per-claim trust tiers, a ledger of known gaps. This is what keeps
  an always-on system *honest* rather than merely busy, and it exists first.

## What it is not yet

- **No live store.** Memory is flat JSON in git; the persistent store is in progress
  (`vc-brain-1ad.3`).
- **No schedule.** Sourcing has only ever run on demand against archives — no live
  collectors, no per-source watermarks, no delta detection.
- **No triggers.** Analysis runs when invoked (or when a script invokes it overnight);
  nothing reacts to a signal changing.
- **No server.** The Experience viewer is a static Pages build over `corpus.json`; no
  API, no auth, no live queries, no alerts.

## The path — rigid order, weeks-scale steps

Each step unblocks the next; the order is not negotiable, the pace is. Every step is
days-to-a-week of focused agent-driven work on machinery that already runs in batch.

1. **Store** — finish the persistent store as the *single read/write path* (the frozen
   Founder/Signal/Memo schemas are already the language-neutral interface). Pipeline
   reads from and writes into it; tapes become views of the store.
   *Exit test:* delete `intelligence/out/` and rebuild the Experience corpus entirely
   from the store.
2. **Harvesters** — turn one-shot sourcing into scheduled collectors (GitHub first),
   each with a last-seen watermark, writing raw payloads to an archive and candidate
   signals through the *existing* gate. A harvester's real output is deltas — "what
   changed since last look" — stored as events with provenance.
   *Exit test:* touch nothing for a week; the store has visibly grown, every new signal
   carrying provenance.
3. **Triggers** — a tiered reaction ladder with a budget governor: deterministic
   delta scoring on every event (no tokens) → LLM triage only on threshold-crossers →
   full forum + counsel only on material change. Every stored analysis carries a
   staleness contract ("computed as-of X from signals up to Y"); re-analysis fires on
   staleness × materiality. The farm runner is the execution substrate; the planted-fault
   harnesses become its CI.
   *Exit test:* a tracked candidate's repo spikes overnight; by morning the store holds
   fresh triage (and a room, if material) untouched by human hands.
4. **Serving** — a thin authenticated API over the store; the viewer switches from
   build-time `corpus.json` to live fetch (the static build survives as the offline
   demo artifact). Polling first, push later. Watchlists and alerts land here — the
   single most terminal-defining feature, and cheap once 2–3 exist.
   *Exit test:* log in from a phone and see a signal harvested an hour ago on a
   candidate page.

## The one honest long game

**Bloomberg-grade validated data does not compress into weeks.** Entity resolution
across sources (is this GitHub handle that HN poster that ex-Stripe engineer?), licensed
commercial feeds, and data-validation ops are Bloomberg's actual moat and will be ours
only with sustained work — the person network is the resolution spine, and it is why
persons were made the foundational primitive. The cheap insurance we buy *now*: from
step 2 onward, no signal enters the store without a provenance record and a (possibly
tentative) person link, so the moat is built by accretion, not rework.

## Standing risks

- **LLM cost without tiering** — always-on is only viable if ~99% of deltas never touch
  a model. The budget governor ships inside step 3, not after the first scary bill.
- **Entity-resolution debt** — accrues silently in every step before the long game;
  the provenance-plus-person-link rule is the mitigation.
- **Trust decay** — automation pressure pushes toward silently filling gaps. Staleness
  contracts, fatal honesty lints, and the verifier harnesses are the counterweight; they
  are not optional polish.

## Carried next-steps (unchanged, folded into the steps above)

Fatal honesty lints; a fresh demo corpus (fund / reject / contested, each replayable);
the dual-register terminal (an agent driving the same command grammar, NL query as one
of its skills, `xsj.8`); inbound deck ingest (`xsj.15`); televised-pitch backtest.
Deliberate cuts (hosted DBs, submission platforms, breadth-over-depth channels) remain
cuts, not gaps.
