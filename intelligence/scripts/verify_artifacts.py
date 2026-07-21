#!/usr/bin/env python3
"""verify_artifacts.py — mechanical gate over a pipeline out/ directory.

Validates every recognized *.json artifact against its schema (screen / triage
/ axes / memo / adjudication / forum-attendants, matched by filename — the F3
replication under forum-modelb/ validates against the same adjudication
schema; the dispatched memo documents under memo-docs/ are matched by path)
and checks that latency.json carries a non-empty, numeric per-stage list plus a
`total_seconds`. A complete run always writes screen.json, triage.json,
axes.json (the mapping shape), memo.json and latency.json; when a forum
convened, forum-adjudication.json and forum-attendants.json are validated too.
Unrecognized JSON (forum-meta, forum-robustness) is skipped, not failed. Pure
mechanical gate — no model call.

Dual-mode, matching the runner's thesis validator: full `jsonschema` validation
when the package is importable, else a stdlib required-keys walk (reusing the
`_require_keys` idea, recursively). The gate runs with the standard library
alone — no hard dependency.

Usage:  python3 scripts/verify_artifacts.py <out-dir>
Exit 0 = PASS, 1 = FAIL. One line per file; failures list the offending paths.
"""
import json
import pathlib
import sys

SCHEMAS = pathlib.Path(__file__).resolve().parent.parent / "schemas"

# Filename substring -> schema file. Order is stable; first match wins. Matched
# on the lowercased basename, so `forum-adjudication.json` maps to adjudication.
SCHEMA_BY_KEY = [
    ("screen", "screen.schema.json"),
    ("triage", "triage.schema.json"),
    ("counsel", "counsel.schema.json"),
    ("axes", "axes.schema.json"),
    ("adjudication", "adjudication.schema.json"),
    ("memo", "memo.schema.json"),
]

# Artifacts a complete run MUST write — presence is enforced regardless of what
# happened to be on disk, so a partial run that never emitted triage/axes/memo
# fails the gate instead of passing on the strength of the files it did write.
REQUIRED = ("screen.json", "triage.json", "axes.json", "memo.json", "latency.json")


def classify(rel):
    """Return 'latency', a schema filename, or None (skip) for one artifact.

    `rel` is the path RELATIVE to the out dir, so the panel's per-seat pre/ and
    post/ blocks — same basename, different parent — are distinguishable. Panel
    artifacts are matched by path; the flat screen/axes/adjudication/memo ones
    keep the substring-on-basename rule."""
    name = rel.name.lower()
    if name == "latency.json":
        return "latency"
    if name in ("forum-meta.json", "forum-robustness.json"):
        return None                            # runner-assembled records, no schema
    if name == "forum-attendants.json":
        return "forum-seed.schema.json"
    if rel.parent.name.lower() == "memo-docs":  # one dispatched document per file
        return "memo-section.schema.json"
    for key, sch in SCHEMA_BY_KEY:
        if key in name:
            return sch
    return None


def load_jsonschema():
    try:
        import jsonschema
        return jsonschema
    except ImportError:
        return None


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _walk(obj, sch, path, errs):
    """Recursive required-keys walk — the stdlib fallback. Checks object-ness and
    `required` at each object level, descends through `properties` and array
    `items`. Leaf scalars are not type-policed (keeps the gate from false-failing
    on shapes structured outputs already enforced server-side)."""
    if sch.get("type") == "object" or "properties" in sch or "required" in sch:
        if not isinstance(obj, dict):
            errs.append(f"{path or '<root>'}: expected object")
            return
        for key in sch.get("required", []):
            if key not in obj:
                errs.append(f"{path + '.' if path else ''}{key}: missing required key")
        for key, subsch in sch.get("properties", {}).items():
            if key in obj and isinstance(subsch, dict):
                _walk(obj[key], subsch, f"{path}.{key}" if path else key, errs)
    elif sch.get("type") == "array" or "items" in sch:
        if not isinstance(obj, list):
            errs.append(f"{path or '<root>'}: expected array")
            return
        items = sch.get("items")
        if isinstance(items, dict):
            for i, el in enumerate(obj):
                _walk(el, items, f"{path}[{i}]", errs)


def validate(data, sch, js):
    """Return a list of error strings (empty == valid)."""
    if js is not None:
        try:
            js.validate(data, sch)
            return []
        except js.ValidationError as err:
            loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
            return [f"{loc}: {err.message}"]
    errs = []
    _walk(data, sch, "", errs)
    return errs


def check_forum_presence(out):
    """Mirror of run.forum_gate over the artifacts (bead vc-brain-e54 slice):
    the room convenes unless the screen rejected or the crux is blank. A run
    whose gate fires but has no forum record — or whose gate skips yet forum
    artifacts exist — is inconsistent, and a batch audit must not miss it.
    Skipped silently when screen/triage are absent (partial or non-run dirs).
    Returns the number of failures found."""
    screen_p, triage_p = out / "screen.json", out / "triage.json"
    if not (screen_p.is_file() and triage_p.is_file()):
        return 0
    try:
        screen = json.loads(screen_p.read_text())
        triage = json.loads(triage_p.read_text())
    except (json.JSONDecodeError, OSError):
        return 0                        # unparseable files already failed above
    fires = (screen.get("verdict") != "reject"
             and bool((triage.get("crux") or "").strip()))
    has_forum = (out / "forum-adjudication.json").is_file()
    if fires and not has_forum:
        print("FAIL  forum-adjudication.json: absent but the mechanical gate fires "
              f"(verdict={screen.get('verdict')!r}, non-blank crux) — the room "
              "should have convened")
        return 1
    if not fires and has_forum:
        reason = ("screen verdict is 'reject'" if screen.get("verdict") == "reject"
                  else "triage crux is blank")
        print(f"FAIL  forum-adjudication.json: present but the gate skips ({reason})")
        return 1
    return 0


def check_latency(obj):
    """latency.json: a non-empty stages list, each stage numeric, plus a total."""
    errs = []
    if not isinstance(obj, dict):
        return ["<root>: expected object"]
    stages = obj.get("stages")
    if not isinstance(stages, list) or not stages:
        errs.append("stages: must be a non-empty list")
    else:
        for i, st in enumerate(stages):
            if not isinstance(st, dict) or "stage" not in st or "seconds" not in st:
                errs.append(f"stages[{i}]: needs 'stage' and 'seconds'")
            elif not _is_number(st.get("seconds")):
                errs.append(f"stages[{i}].seconds: not numeric")
    if not _is_number(obj.get("total_seconds")):
        errs.append("total_seconds: missing or not numeric")
    return errs


def main(argv):
    if len(argv) != 2:
        print("usage: verify_artifacts.py <out-dir>", file=sys.stderr)
        return 2
    out = pathlib.Path(argv[1])
    if not out.is_dir():
        print(f"FAIL  {out}: not a directory")
        return 1

    js = load_jsonschema()
    print(f"verify_artifacts {out}  "
          f"[{'jsonschema' if js else 'stdlib required-keys walk'}]")

    files = sorted(out.rglob("*.json"))
    checked = failed = 0
    present = set()

    for f in files:
        rel = f.relative_to(out)
        present.add(rel.name.lower())
        kind = classify(rel)
        if kind is None:
            print(f"SKIP  {rel}  (no schema mapping)")
            continue
        try:
            data = json.loads(f.read_text())
        except json.JSONDecodeError as err:
            print(f"FAIL  {rel}  (invalid JSON: {err})")
            checked += 1
            failed += 1
            continue

        if kind == "latency":
            errs = check_latency(data)
            label = "latency"
        else:
            sch = json.loads((SCHEMAS / kind).read_text())
            if isinstance(data, list):          # e.g. panel/post-modelb.json — validate each element
                errs = [f"[{i}] {e}" for i, el in enumerate(data) for e in validate(el, sch, js)]
            else:
                errs = validate(data, sch, js)
            label = kind

        checked += 1
        if errs:
            failed += 1
            print(f"FAIL  {rel}  ({label})")
            for e in errs[:12]:
                print(f"        - {e}")
        else:
            print(f"PASS  {rel}  ({label})")

    for req in REQUIRED:
        if req not in present:
            print(f"FAIL  {req}: absent — a complete run writes "
                  "screen/triage/axes/memo + latency")
            failed += 1

    failed += check_forum_presence(out)

    verdict = "PASS" if failed == 0 else "FAIL"
    print(f"\n{verdict}  {checked} artifact(s) checked, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
