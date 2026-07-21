#!/usr/bin/env python3
"""Regenerate experience/corpus.json — the terminal's entity manifest.

Scans intelligence/out/* for runs and research/*/forum for person-seeded
forums (a forum = a directory holding seed.json). The generated file is
committed so the viewer needs no build step; rerun after adding a run or
a forum. Stdlib only.
"""
import json
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "corpus.json"

# A run is corpus-worthy only once it reaches a memo — incomplete runs
# (no memo.json) are excluded so the viewer never lists a half-finished dir.
run_dirs = sorted(
    (p for p in (ROOT / "intelligence" / "out").iterdir()
     if p.is_dir() and (p / "memo.json").exists()),
    key=lambda p: p.name,
)
runs = [p.name for p in run_dirs]

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

for seed in sorted(ROOT.glob("research/*/forum/seed.json")):
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

OUT.write_text(json.dumps({
    "generated": datetime.date.today().isoformat(),
    "runs": runs,
    "forums": forums,
}, indent=2) + "\n")
print(f"wrote {OUT.relative_to(ROOT)} — {len(runs)} runs, {len(forums)} forums")
