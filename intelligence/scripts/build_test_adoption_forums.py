#!/usr/bin/env python3
"""Test-adoption forums — builder + batch runner (bead vc-brain-9m7).

Dogfooding: the forum evaluates OUR engineering decisions the same way it
evaluates deals. For each distinct adoptable test/harness surfaced by a
test-adoption survey, this script assembles a standalone seeded-forum input
set — decision.json, signals.json, crux — and (with --run and an
ANTHROPIC_API_KEY) convenes the rooms via `run.py forum`.

Seat policy, carried in triage.room_brief so the seed
stage honors it: every chair is a real named voice whose published work bears
on the specific discipline the test addresses — (a) recognized practitioners
of that discipline, (b) engineers who have built such harnesses, (c) veterans
of large test corpora on shipped, successful software products. The room must
span adopt-vs-skip, and at least one seat must be able to argue that
vc-brain's existing replay/planted-fault discipline already prices the risk.

Signal honesty (the trust ladder is real here too):
  - exemplar signals   trust_tier=verified-artifact, authority=independent —
    third-party code, locally archived (raw_ref) AND re-checked by an
    independent verifier during the deep-dive campaign;
  - our-side signals   trust_tier=verified-artifact, authority=operator-primary —
    facts about our own repo, checkable in place;
  - assessment signal  trust_tier=reconstructed, authority=agent-derived —
    the deep-dive's own recommendation: material to argue with, never an
    authority (the room may overturn it; that is the point).

The screen block is synthesized by this builder (mechanical, no model call,
verdict=contested) because every registry entry already survived the
deep-dive's verification pass — the contested question is fit and cost, which
is exactly what the room presses. No scores enter the room.

Usage:
    ./build_test_adoption_forums.py --registry \
        path/to/test-adoption-registry.json \
        (a JSON list of entries, each carrying the REQUIRED_ENTRY_KEYS below)
        [-o ../out/adoption-forums] [--date 2026-07-20] [--seats 5]
        [--only slug1,slug2] [--run]

Without --run: builds and validates all input sets, prints the forum command
per room. With --run: convenes each room sequentially (a forum is internally
parallel across seats), SKIPPING any room whose forum-meta.json already
exists — the batch is resumable after an interruption.
"""
import argparse
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run as intelligence_run  # noqa: E402  (validate + schema: one seam)

REQUIRED_ENTRY_KEYS = {
    "slug", "name", "pattern_area", "what_it_is", "adoption_in_vcbrain",
    "effort", "deepdive_recommendation", "crux", "exemplars", "our_side_facts",
}
ARCHIVE_OBSERVED_AT = "2026-07-19T00:00:00Z"   # archive collection date

ROOM_BRIEF = (
    "Seat persons whose PUBLISHED WORK bears on {area}: (a) recognized "
    "practitioners of the specific discipline this test addresses; (b) engineers "
    "who have built such harnesses and could build this one; (c) veterans of "
    "large test corpora on shipped, successful software products with a strong "
    "testing culture. Documented positions must span adopt-vs-skip, and at least "
    "one seat must be able to argue that vc-brain's existing replay/planted-fault "
    "discipline already prices this risk without the new harness."
)


def build_signals(entry, build_date):
    slug = entry["slug"]
    signals = []
    for i, ex in enumerate(entry["exemplars"], 1):
        signals.append({
            "id": f"sig-tst-{slug}-e{i}",
            "source": "github",
            "url": ex.get("github_url"),
            "observed_at": ARCHIVE_OBSERVED_AT,
            "ingested_at": build_date,
            "summary": (f"{ex['repo']} ({ex.get('lines', 'n/a')}): {ex['why_good']} "
                        f"[verification: {ex.get('verification_note', 'per deep-dive')}]"),
            "raw_ref": ex.get("local_path"),
            "trust_tier": "verified-artifact",
            "authority": "independent",
            "dedupe_key": ex.get("github_url"),
            "contradicts": [],
        })
    for i, fact in enumerate(entry["our_side_facts"], 1):
        signals.append({
            "id": f"sig-tst-{slug}-o{i}",
            "source": "manual",
            "url": None,
            "observed_at": build_date,
            "ingested_at": build_date,
            "summary": f"vc-brain current state: {fact}",
            "raw_ref": None,
            "trust_tier": "verified-artifact",
            "authority": "operator-primary",
            "dedupe_key": None,
            "contradicts": [],
        })
    signals.append({
        "id": f"sig-tst-{slug}-a1",
        "source": "manual",
        "url": None,
        "observed_at": build_date,
        "ingested_at": build_date,
        "summary": (f"Deep-dive assessment (agent-derived, arguable): "
                    f"{entry['deepdive_recommendation']} Effort: {entry['effort']}."),
        "raw_ref": entry.get("assessment_ref"),
        "trust_tier": "reconstructed",
        "authority": "agent-derived",
        "dedupe_key": None,
        "contradicts": [],
    })
    return signals


def build_decision(entry, signals):
    exemplar_ids = [s["id"] for s in signals if s["authority"] == "independent"]
    our_ids = [s["id"] for s in signals if s["authority"] == "operator-primary"]
    return {
        "kind": "internal-engineering-adoption",
        "application": {
            "proposal": entry["name"],
            "slug": entry["slug"],
            "area": entry["pattern_area"],
            "what_it_is": entry["what_it_is"],
            "adoption_in_vcbrain": entry["adoption_in_vcbrain"],
            "effort": entry["effort"],
            "context": ("Internal engineering decision for the vc-brain repo itself — "
                        "one funnel, same room discipline: adopting a test/eval harness "
                        "is an investment of scarce solo-operator attention under a "
                        "stdlib/zero-dep, mechanical-gates-over-prompt-rules philosophy."),
        },
        "screen": {
            "verdict": "contested",
            "rationale": ("Synthesized by the builder, no model call: every candidate in "
                          "this batch survived the survey's verification pass, so "
                          "existence is settled; fit and cost are contested — the room, "
                          "not a score, is the evaluator."),
        },
        "triage": {
            "crux": entry["crux"],
            "room_brief": ROOM_BRIEF.format(area=entry["pattern_area"]),
            "routed_checks": [
                (f"Build cost: time-box an {entry['effort']}-effort spike of the harness "
                 "at the seam named in adoption_in_vcbrain — empirical, not for the room"),
                "Detection value: run the spike against seeded faults / historical tapes "
                "and count catches — empirical, not for the room",
            ],
            "tensions": [{
                "name": "field evidence vs local fit",
                "side_a": {
                    "claim": (f"{len(exemplar_ids)} independently verified competitor "
                              "implementation(s) show this test working in code"),
                    "evidence_refs": exemplar_ids,
                },
                "side_b": {
                    "claim": ("vc-brain's existing discipline may already price this risk, "
                              "and every adopted harness taxes a solo operator"),
                    "evidence_refs": our_ids,
                },
            }],
        },
    }


def load_registry(path):
    entries = json.loads(pathlib.Path(path).read_text())
    if not isinstance(entries, list) or not entries:
        raise SystemExit("registry must be a non-empty JSON array")
    slugs = set()
    for e in entries:
        missing = REQUIRED_ENTRY_KEYS - set(e)
        if missing:
            raise SystemExit(f"registry entry {e.get('slug', '?')!r} missing keys: {sorted(missing)}")
        if e["slug"] in slugs:
            raise SystemExit(f"duplicate slug {e['slug']!r}")
        if not e["exemplars"]:
            raise SystemExit(f"entry {e['slug']!r} has no exemplars — nothing to argue from")
        slugs.add(e["slug"])
    return entries


def cmd_build(args):
    entries = load_registry(args.registry)
    if args.only:
        keep = set(args.only.split(","))
        entries = [e for e in entries if e["slug"] in keep]
        if not entries:
            raise SystemExit(f"--only matched nothing: {sorted(keep)}")
    outroot = pathlib.Path(args.out)
    sig_schema = intelligence_run.schema("signal.schema.json")
    built = []
    for e in entries:
        outdir = outroot / e["slug"]
        outdir.mkdir(parents=True, exist_ok=True)
        signals = build_signals(e, args.date)
        for s in signals:
            intelligence_run.validate(s, sig_schema, f"signal {s['id']}")
        decision = build_decision(e, signals)
        (outdir / "signals.json").write_text(json.dumps(signals, indent=2, ensure_ascii=False))
        (outdir / "decision.json").write_text(json.dumps(decision, indent=2, ensure_ascii=False))
        (outdir / "crux.txt").write_text(e["crux"] + "\n")
        built.append(e)
        print(f"[built] {e['slug']}: {len(signals)} signals "
              f"({len(e['exemplars'])} exemplars, {len(e['our_side_facts'])} our-side, 1 assessment)")

    runner = pathlib.Path(INTEL / "run.py")
    failed = []
    print(f"\n{len(built)} room(s) ready under {outroot}/")
    for e in built:
        outdir = outroot / e["slug"]
        cmd = [str(runner), "forum",
               "--decision", str(outdir / "decision.json"),
               "--crux", e["crux"],
               "--mode", "seeded", "--seats", str(args.seats),
               "--signals", str(outdir / "signals.json"),
               "-o", str(outdir)]
        if not args.run:
            print("  " + " ".join(f"'{c}'" if " " in c else c for c in cmd))
            continue
        if (outdir / "forum-meta.json").exists():
            print(f"[skip ] {e['slug']}: forum-meta.json exists (already convened)")
            continue
        print(f"[forum] {e['slug']} — convening ({args.seats} seats)…", flush=True)
        proc = subprocess.run([sys.executable] + cmd)
        if proc.returncode != 0:
            # A failed room must not sink the batch: log it, move on, report at
            # the end. Re-running with --run resumes exactly the failed set
            # (completed rooms carry forum-meta.json and are skipped).
            failed.append(e["slug"])
            print(f"[fail ] {e['slug']} (exit {proc.returncode}) — continuing", flush=True)
        else:
            print(f"[done ] {e['slug']}", flush=True)
    if not args.run:
        print("\n(no --run: rooms NOT convened. Set ANTHROPIC_API_KEY — or "
              "VCBRAIN_WORKER=cursor/claude — and re-run with --run.)")
    elif failed:
        raise SystemExit(f"{len(failed)} room(s) failed: {', '.join(failed)} — "
                         "re-run with --run to retry just those")
    else:
        print("\nall requested rooms convened.")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--registry", required=True)
    p.add_argument("-o", "--out", default=str(INTEL / "out" / "adoption-forums"))
    p.add_argument("--date", default="2026-07-20",
                   help="ingested_at stamp for built signals (ISO date)")
    p.add_argument("--seats", type=int, default=5)
    p.add_argument("--only", help="comma-separated slugs to build/run")
    p.add_argument("--run", action="store_true",
                   help="convene each room via run.py forum (needs ANTHROPIC_API_KEY); "
                        "resumable — rooms with forum-meta.json are skipped")
    cmd_build(p.parse_args())


if __name__ == "__main__":
    main()
