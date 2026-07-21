#!/usr/bin/env python3
"""Regenerate experience/corpus.json — the terminal's entity manifest.

Scans intelligence/out/* for runs, design/rooms/* for design rooms, and
research/*/forum for person-seeded forums (a forum = a directory holding
seed.json). Founder entities (bead vc-brain-toe.12) come from
memory/founders.json merged with the application behind each corpus run.
The generated file is committed so the viewer needs no build step; rerun
after adding a run, a forum, or a founder. Stdlib only.
"""
import json
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "corpus.json"


def _read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _norm_company(name):
    """'Acme (outbound sourcing target — …)' and 'Acme' both → 'acme'."""
    return (name or "").split(" (")[0].strip().lower()


def _norm_url(url):
    return (url or "").strip().rstrip("/").lower()


def _slug(s):
    out = "".join(c if c.isalnum() else "-" for c in (s or "").lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def find_application(root, company):
    """The application JSON behind a run, located by company name.

    Search order mirrors provenance strength: pipeline fixtures, farm-generated
    applications, the hand-built one-off applications, then sourcing-batch
    applications. First company_name match wins.
    """
    want = _norm_company(company)
    if not want:
        return None
    candidates = [
        *sorted(root.glob("intelligence/fixtures/application-*.json")),
        *sorted(root.glob("memory/farm/generated/application-*.json")),
        *sorted(root.glob("intelligence/out/sourcing-*/applications/*.json")),
    ]
    for path in candidates:
        app = _read_json(path)
        if app and _norm_company(app.get("company_name")) == want:
            return app
    return None


def build_founders(root, runs):
    """Founder entities (bead vc-brain-toe.12): memory/founders.json is the
    directory of sourced founders; each corpus run contributes its applicant
    (matched by GitHub URL when the founder is already in the directory).
    Emits the demo slice only — application summary, screen verdict, run link;
    full graph presence stays in bead vc-brain-mmw."""
    directory = _read_json(root / "memory" / "founders.json") or []
    founders = []
    by_github = {}
    for f in directory:
        links = f.get("links") or {}
        score = f.get("founder_score") or {}
        history = score.get("history") or []
        entry = {
            "id": f.get("id") or f"fndr-{_slug(f.get('name'))}",
            "name": f.get("name"),
            "aliases": f.get("aliases") or [],
            "links": {k: links.get(k) for k in ("github", "linkedin", "twitter", "site")},
            "location": f.get("location"),
            "score": {
                "value": score.get("value"),
                "band": score.get("band"),
                "confidence": score.get("confidence"),
                "cold_start": score.get("cold_start", False),
                "reason": history[-1].get("reason") if history else None,
            } if score else None,
            "sourced": f.get("notes"),
            "run": None, "company": None, "one_liner": None, "verdict": None,
            "role": None, "background": None, "ask": None,
        }
        founders.append(entry)
        gh = _norm_url(links.get("github"))
        if gh:
            by_github[gh] = entry

    # Merge each corpus run's application onto its founder (or mint a new one).
    for run in runs:
        run_dir = root / "intelligence" / "out" / run
        memo = _read_json(run_dir / "memo.json") or {}
        screen = _read_json(run_dir / "screen.json") or {}
        company = (memo.get("company") or {}).get("name")
        app = find_application(root, company)
        if not app:
            continue
        applicant = app.get("founder") or {}
        entry = by_github.get(_norm_url(applicant.get("github")))
        if entry is None:
            entry = {
                "id": f"fndr-app-{_slug(applicant.get('name') or company)}",
                "name": applicant.get("name"),
                "aliases": [],
                "links": {"github": applicant.get("github"), "linkedin": None,
                          "twitter": None, "site": None},
                "location": applicant.get("location"),
                "score": None,
                "sourced": f"Inbound applicant — arrived through the application on run {run}.",
                "run": None, "company": None, "one_liner": None, "verdict": None,
                "role": None, "background": None, "ask": None,
            }
            founders.append(entry)
            gh = _norm_url(applicant.get("github"))
            if gh:
                by_github[gh] = entry  # a second run by the same applicant merges
        entry.update({
            "run": run,
            "company": company,
            "one_liner": (memo.get("company") or {}).get("one_liner")
                or app.get("one_liner"),
            "verdict": screen.get("verdict"),
            "role": applicant.get("role"),
            "background": applicant.get("background_claimed"),
            "ask": app.get("ask"),
        })
        if entry.get("location") is None:
            entry["location"] = applicant.get("location")

    # Run-linked founders lead (they carry a verdict and a run door), then the
    # rest of the directory alphabetically.
    founders.sort(key=lambda f: (f["run"] is None, (f["name"] or "").lower()))
    return founders


def build(root):
    # A run is corpus-worthy only once it reaches a memo — incomplete runs
    # (no memo.json) are excluded so the viewer never lists a half-finished dir.
    # Underscore-prefixed dirs (_counsel-disagree-probe, _precounsel-probe, …)
    # are session probe tapes — internal instruments, reachable by direct
    # ?run= URL but never listed in the product corpus or the run switcher.
    run_dirs = sorted(
        (p for p in (root / "intelligence" / "out").iterdir()
         if p.is_dir() and not p.name.startswith("_")
         and (p / "memo.json").exists()),
        key=lambda p: p.name,
    )

    # Era gate (bead vc-brain-toe.4): the inverted pipeline writes triage.json;
    # pre-inversion tapes do not. The corpus run list —
    # and thus the graph's run-switching hub — carries only same-structure (triaged)
    # runs, so the switcher never mixes eras. Legacy tapes stay reachable by direct
    # ?run=<name> URL, where the viewer's overview shows a legacy-tape notice.
    runs = [p.name for p in run_dirs if (p / "triage.json").exists()]

    forums = []

    # Real-deal run rooms: a run whose forum was seeded writes forum-attendants.json
    # (the SAME seed schema as a research forum — crux_restatement / attendants /
    # room_note — only the filenames differ). Emitting them as forums makes each run
    # attendant a first-class person entity in the network, exactly parallel to
    # research-forum persons, with per-seat pre/post interview pages.
    for p in run_dirs:
        if (p / "forum-attendants.json").exists():
            forums.append({
                "id": p.name,
                "title": p.name,
                "path": f"../intelligence/out/{p.name}",
                "layout": "run",
                "run": p.name,
                "docs": [],
            })

    # Design rooms (beads vc-brain-4h4, vc-brain-toe.10 corpus gate): taste-anchored
    # visual deliberation. A room lives in design/rooms/<slug>/ and writes the SAME
    # forum-*.json artifacts as a run dir, so it reuses the run person model
    # wholesale. Design rooms are internal instruments, NOT product content — they
    # are emitted under "design_rooms", never "forums", so the product search
    # surface (palette, search bar, corpus graph) stays clean. The viewer still
    # registers them (tagged internal) so design-session entity-page URLs —
    # ?view=entity&e=forum:<slug> — keep resolving.
    design_rooms = []
    for att in sorted(root.glob("design/rooms/*/forum-attendants.json")):
        room_dir = att.parent
        slug = room_dir.name
        title = slug
        meta = room_dir / "forum-meta.json"
        if meta.exists():
            title = json.loads(meta.read_text()).get("title", slug)
        design_rooms.append({
            "id": slug,
            "title": title,
            "path": f"../design/rooms/{slug}",
            "layout": "design",
            "docs": [],
        })

    for seed in sorted(root.glob("research/*/forum/seed.json")):
        forum_dir = seed.parent
        research_dir = forum_dir.parent
        name = research_dir.name
        docs = []
        for fname, label in [("README.md", "research README"), ("RECORD.md", "decision RECORD")]:
            if (research_dir / fname).exists():
                docs.append({
                    "id": f"{name}-{fname.split('.')[0].lower()}",
                    "title": f"{name} — {label}",
                    "path": f"../research/{name}/{fname}",
                })
        if (research_dir / "evidence" / "README.md").exists():
            docs.append({
                "id": f"{name}-evidence-readme",
                "title": f"{name} — evidence README",
                "path": f"../research/{name}/evidence/README.md",
            })
        entry = {
            "id": name,
            "title": name,
            "path": f"../research/{name}/forum",
            "docs": docs,
        }
        # Title from the seed's decision id when the debate header carries one
        debate = forum_dir / "debate.md"
        if debate.exists():
            first = debate.read_text().splitlines()[0]
            if first.startswith("#"):
                entry["title"] = f"{name} — {first.split('—')[-1].strip().split('(')[0].strip()}" \
                    if "—" in first else name
        evidence = research_dir / "evidence" / "evidence.json"
        if evidence.exists():
            entry["evidence"] = f"../research/{name}/evidence/evidence.json"
        forums.append(entry)

    return {
        "generated": datetime.date.today().isoformat(),
        "runs": runs,
        "forums": forums,
        "design_rooms": design_rooms,
        "founders": build_founders(root, runs),
    }


if __name__ == "__main__":
    manifest = build(ROOT)
    OUT.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} — {len(manifest['runs'])} runs, "
          f"{len(manifest['forums'])} forums, {len(manifest['design_rooms'])} design rooms, "
          f"{len(manifest['founders'])} founders")
