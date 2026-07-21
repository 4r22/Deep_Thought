#!/usr/bin/env python3
"""Handrolled forum — file-bridge driver (bead vc-brain-9m7).

Runs one seeded forum through run.py's REAL stage functions with the single
model seam (run.call) replaced by a file bridge: every model call becomes a
prompt file the operator (or an orchestrating agent) answers out-of-band —
e.g. by dispatching each prompt to an Anthropic-model subagent — and drops
back as a response file. Byte-identical prompts, identical artifact set,
identical schema validation; only the transport differs. Built for the F3
robustness comparison of a cursor-convened room against Anthropic models.

Protocol:
    ./handroll_forum.py step --room <dir> [--seats 5]
      Attempts seed -> pre-interviews -> debate -> post-interviews ->
      adjudication using responses found in <room>/handroll/responses/.
      For every call still unanswered it writes
      <room>/handroll/prompts/<key>.txt and a manifest line, then stops at
      that phase. Answer each prompt into
      <room>/handroll/responses/<key>.txt (raw model output; JSON stages may
      include fences — extraction is tolerant) and run `step` again.
      When all phases complete it writes the standard forum artifacts +
      forum-meta.json and prints DONE.

The room dir must contain decision.json, signals.json, crux.txt (as built by
build_test_adoption_forums.py). Response keys are sha256(prompt)[:16] — the
same prompt always maps to the same response file, so `step` is idempotent.
"""
import argparse
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
INTEL = HERE.parent
sys.path.insert(0, str(INTEL))

import run as R  # noqa: E402


class Pending(Exception):
    pass


class FileBridge:
    """Stands at run.call: answered prompts return (validated) responses;
    unanswered prompts are written out and raise Pending."""

    def __init__(self, room, label_hint):
        self.prompts = room / "handroll" / "prompts"
        self.responses = room / "handroll" / "responses"
        self.manifest = room / "handroll" / "manifest.jsonl"
        self.prompts.mkdir(parents=True, exist_ok=True)
        self.responses.mkdir(parents=True, exist_ok=True)
        self.label_hint = label_hint          # mutable: current stage label
        self.missing = []

    def __call__(self, prompt_text, json_schema=None, max_tokens=16000, model=None):
        key = hashlib.sha256(prompt_text.encode()).hexdigest()[:16]
        resp = self.responses / f"{key}.txt"
        if resp.exists():
            text = resp.read_text().strip()
            if json_schema is not None:
                obj = R.extract_json(text)
                R.validate(obj, json_schema)
                return obj, None
            return text, None
        full = prompt_text
        if json_schema is not None:
            full += R._json_suffix(json_schema)
        (self.prompts / f"{key}.txt").write_text(full)
        with open(self.manifest, "a") as f:
            f.write(json.dumps({"key": key, "stage": self.label_hint[0],
                                "schema": (json_schema or {}).get("_label")}) + "\n")
        self.missing.append((self.label_hint[0], key))
        raise Pending(key)


def step(args):
    room = pathlib.Path(args.room)
    decision = json.loads((room / "decision.json").read_text())
    signals = (room / "signals.json").read_text()
    crux = (room / "crux.txt").read_text().strip()
    thesis_json = "null"
    n = max(3, min(7, args.seats))

    bridge = FileBridge(room, ["?"])
    original = R.call
    R.call = bridge
    try:
        # ---- phase 1: seed
        bridge.label_hint[0] = "seed"
        try:
            seeds = R.stage_forum_seed(thesis_json, decision, crux, signals, n)
        except Pending:
            return finish_step(bridge, "seed")
        R.write_out(room / "forum-attendants.json", seeds)
        attendants = seeds["attendants"]

        # ---- phase 2: blind pre-interviews (collect ALL pending before stopping)
        bridge.label_hint[0] = "pre"
        pres = {}
        for a in attendants:
            try:
                pres[a["id"]] = R.stage_forum_pre(thesis_json, decision, crux,
                                                  signals, a)
            except Pending:
                continue
        if len(pres) < len(attendants):
            return finish_step(bridge, "pre-interviews")
        for a in attendants:
            R.write_out(room / f"forum-{a['id']}.md", pres[a["id"]])

        # ---- phase 3: debate
        bridge.label_hint[0] = "debate"
        try:
            transcript = R.stage_forum_debate(thesis_json, decision, crux, signals,
                                              attendants, pres)
        except Pending:
            return finish_step(bridge, "debate")
        R.write_out(room / "forum-debate.md", transcript)

        # ---- phase 4: post-interviews
        bridge.label_hint[0] = "post"
        posts = {}
        for a in attendants:
            try:
                posts[a["id"]] = R.stage_forum_post(thesis_json, decision, crux, a,
                                                    pres[a["id"]], transcript)
            except Pending:
                continue
        if len(posts) < len(attendants):
            return finish_step(bridge, "post-interviews")
        for a in attendants:
            R.write_out(room / f"forum-post-{a['id']}.md", posts[a["id"]])

        # ---- phase 5: adjudication
        bridge.label_hint[0] = "adjudicate"
        try:
            adjudication = R.stage_forum_adjudicate(thesis_json, decision, attendants,
                                                    pres, transcript, posts)
        except Pending:
            return finish_step(bridge, "adjudication")
        R.write_out(room / "forum-adjudication.json", adjudication)
        R.write_out(room / "forum-meta.json", {
            "mode": "seeded", "model": args.model_note, "attendants": n,
            "debates": 1, "tokens": None,
            "transport": "handroll file bridge (see handroll/manifest.jsonl)"})
        print("DONE — full artifact set written.")
    finally:
        R.call = original


def finish_step(bridge, phase):
    print(f"PENDING at {phase}: {len(bridge.missing)} prompt(s) need responses:")
    for stage, key in bridge.missing:
        print(f"  [{stage}] handroll/prompts/{key}.txt -> answer to handroll/responses/{key}.txt")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("step")
    sp.add_argument("--room", required=True)
    sp.add_argument("--seats", type=int, default=5)
    sp.add_argument("--model-note", default="handrolled",
                    help="recorded in forum-meta.json, e.g. 'claude-opus-4-8 via Claude Code subagents'")
    args = p.parse_args()
    if args.cmd == "step":
        step(args)


if __name__ == "__main__":
    main()
