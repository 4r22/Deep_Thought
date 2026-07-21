#!/usr/bin/env python3
"""preflight.py — offline readiness gate for an unattended farm batch.

Zero model calls, zero tokens. Verifies everything that CAN be verified
before burning a night (stress-audit follow-up, 2026-07-21; complements —
does not replace — `farm_run.py probe`, which needs a live worker):

  1. jsonschema importable — on the claude/cursor workers local validate()
     is the ONLY schema enforcement; without jsonschema it silently degrades
     to a required-keys walk (audit finding F2).
  2. Worker backend present (binary on PATH / API key set). Login state is
     NOT checkable offline — stated, not assumed.
  3. Every application in the glob passes the pipeline's own input gate
     (run.gate_application) — a refused app is a guaranteed failed row.
  4. signals + thesis parse and validate.
  5. Batch log placement: a log inside intelligence/out/ trips the j3n
     contamination fence and aborts the whole batch (audit finding F1).
  6. Out-root resume state: complete / partial run counts.
  7. Timeout sanity vs the per-call CLI cap, caffeinate, disk headroom.
  8. The offline unit suite (optional --skip-tests).

Usage:
  python3 scripts/preflight.py \
    --glob 'out/sourcing/applications/*.json' \
    --signals ../memory/signals.json --worker claude \
    --out-root out/farm --limit 25 --timeout 3600 \
    --log ../farm.log

Exit 0 = READY (no FAIL lines), 1 = NOT READY.
"""
import argparse
import glob as globmod
import json
import os
import pathlib
import shutil
import subprocess
import sys

SCRIPTS = pathlib.Path(__file__).resolve().parent
INTEL = SCRIPTS.parent
REPO = INTEL.parent
sys.path.insert(0, str(INTEL))
sys.path.insert(0, str(SCRIPTS))

PER_CALL_CLI_TIMEOUT = 1800   # subprocess timeout inside run.py call_claude/call_cursor


class Checklist:
    def __init__(self):
        self.failed = 0
        self.warned = 0

    def ok(self, msg):
        print(f"PASS  {msg}")

    def warn(self, msg):
        self.warned += 1
        print(f"WARN  {msg}")

    def fail(self, msg):
        self.failed += 1
        print(f"FAIL  {msg}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--glob", required=True, help="application JSON glob (relative to intelligence/)")
    ap.add_argument("--signals", required=True)
    ap.add_argument("--thesis", default=str(REPO / "config" / "thesis.example.json"))
    ap.add_argument("--worker", choices=["api", "cursor", "claude"], required=True)
    ap.add_argument("--out-root", required=True, help="farm out root (relative to intelligence/)")
    ap.add_argument("--log", help="batch log path the runner will append to (relative to intelligence/)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--timeout", type=float, default=3600.0)
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args(argv)

    c = Checklist()
    os.chdir(INTEL)

    # 1. jsonschema — the only schema enforcement on text-CLI workers.
    try:
        import jsonschema  # noqa: F401
        c.ok("jsonschema importable — validate() runs full schema coverage")
    except ImportError:
        if args.worker == "api":
            c.warn("jsonschema missing — api backend still constrains server-side, "
                   "but local validation degrades to required-keys")
        else:
            c.fail(f"jsonschema NOT importable — on the {args.worker} worker local "
                   "validate() is the ONLY schema enforcement and it would degrade "
                   "to a required-keys walk. pip install jsonschema first.")

    # 2. Worker backend.
    if args.worker == "claude":
        if shutil.which("claude"):
            c.ok("claude CLI on PATH (login state not checkable offline — a logged-out "
                 "CLI fails fast on app 1 and the circuit breaker stops the batch)")
        else:
            c.fail("claude CLI not on PATH")
    elif args.worker == "cursor":
        if shutil.which("cursor-agent"):
            c.ok("cursor-agent on PATH")
        else:
            c.fail("cursor-agent not on PATH")
    else:
        if os.environ.get("ANTHROPIC_API_KEY"):
            c.ok("ANTHROPIC_API_KEY set")
        else:
            c.fail("ANTHROPIC_API_KEY not set")

    # 3. Applications through the real input gate — zero model calls.
    import run as runmod
    matches = sorted(globmod.glob(args.glob))
    if not matches:
        c.fail(f"glob matched no files: {args.glob}")
    else:
        batch = matches[: args.limit] if args.limit else matches
        refused = []
        unreadable = []
        for m in batch:
            try:
                report = runmod.gate_application(runmod.load_json(m))
            except (json.JSONDecodeError, OSError, SystemExit) as exc:
                unreadable.append((m, str(exc)))
                continue
            if report["verdict"] != "pass":
                refused.append((m, report.get("reasons")))
        note = f"glob matched {len(matches)} file(s); batch head = {len(batch)}"
        if args.limit and len(matches) > args.limit:
            note += f" (--limit {args.limit} takes the alphabetical head, not a sample)"
        c.ok(note)
        if unreadable:
            c.fail(f"{len(unreadable)} application(s) unreadable: "
                   + "; ".join(f"{m}: {e[:80]}" for m, e in unreadable[:3]))
        if refused:
            c.fail(f"{len(refused)}/{len(batch)} application(s) REFUSED by the input "
                   "gate (each = a guaranteed failed row): "
                   + "; ".join(pathlib.Path(m).name for m, _ in refused[:5]))
        if not unreadable and not refused and batch:
            c.ok(f"input gate: {len(batch)}/{len(batch)} applications pass")

    # 4. signals + thesis.
    try:
        sig = runmod.load_json(args.signals)
        size = pathlib.Path(args.signals).stat().st_size
        msg = f"signals parse: {len(sig)} signal(s), {size/1024:.1f} KB"
        if size > 65536:
            c.warn(msg + " — injected verbatim into EVERY call; consider per-candidate slicing")
        else:
            c.ok(msg)
    except (json.JSONDecodeError, OSError) as exc:
        c.fail(f"signals unreadable: {exc}")
    try:
        runmod.load_thesis(args.thesis)
        c.ok("thesis validates")
    except SystemExit as exc:
        c.fail(f"thesis invalid: {exc}")

    # 5. Log placement vs the contamination fence.
    if args.log:
        log_p = pathlib.Path(args.log).resolve()
        out_tree = (INTEL / "out").resolve()
        try:
            rel = log_p.relative_to(out_tree)
            c.fail(f"batch log {rel} is INSIDE intelligence/out/ — the j3n fence "
                   "will see its mtime change and ABORT the whole batch on app 1 "
                   "(audit finding F1). Move it outside intelligence/out/.")
        except ValueError:
            c.ok(f"batch log outside the fence tree: {log_p}")
    else:
        c.warn("no --log given — if the runner redirects into intelligence/out/, "
               "the fence aborts the batch (audit finding F1)")

    # 6. Out-root resume state.
    from farm_run import run_is_complete
    out_root = pathlib.Path(args.out_root)
    if not out_root.is_absolute():
        out_root = INTEL / out_root
    if out_root.exists():
        subdirs = [d for d in sorted(out_root.iterdir()) if d.is_dir()]
        complete = [d.name for d in subdirs if run_is_complete(d)]
        partial = [d.name for d in subdirs if not run_is_complete(d)]
        if partial:
            c.warn(f"out-root has {len(complete)} complete + {len(partial)} PARTIAL "
                   f"run dir(s) — partial dirs re-run from scratch over stale "
                   f"artifacts: {', '.join(partial[:5])}")
        else:
            c.ok(f"out-root: {len(complete)} complete run dir(s), no partial state")
    else:
        c.ok("out-root does not exist yet — fresh start")

    # 7. Timeout, caffeinate, disk.
    if args.timeout < PER_CALL_CLI_TIMEOUT:
        c.fail(f"--timeout {args.timeout:.0f}s < the per-call CLI cap "
               f"({PER_CALL_CLI_TIMEOUT}s) — one slow call would eat the whole app budget")
    elif args.timeout < 3000:
        c.warn(f"--timeout {args.timeout:.0f}s is tight: the seeded pipeline runs "
               "~11 sequential call-waves and a single call may take up to "
               f"{PER_CALL_CLI_TIMEOUT}s on a slow night")
    else:
        c.ok(f"per-app timeout {args.timeout:.0f}s")
    if sys.platform == "darwin":
        if shutil.which("caffeinate"):
            c.ok("caffeinate present")
        else:
            c.warn("caffeinate not found — the machine may sleep mid-batch")
    free_gb = shutil.disk_usage(str(INTEL)).free / 1e9
    if free_gb < 2:
        c.fail(f"only {free_gb:.1f} GB free disk")
    else:
        c.ok(f"disk free: {free_gb:.0f} GB")

    # 8. The offline unit suite.
    if args.skip_tests:
        c.warn("unit suite skipped (--skip-tests)")
    else:
        proc = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
            cwd=str(INTEL), capture_output=True, text=True, timeout=600)
        tail = (proc.stderr or "").strip().splitlines()
        verdict = tail[-1] if tail else "?"
        if proc.returncode == 0:
            c.ok(f"offline unit suite: {verdict}")
        else:
            c.fail(f"offline unit suite FAILED: {verdict}")
            for line in tail[-30:]:      # the actual failure, not just the count
                print(f"      | {line}")

    print()
    if c.failed:
        print(f"NOT READY — {c.failed} FAIL, {c.warned} WARN")
        return 1
    print(f"READY — 0 FAIL, {c.warned} WARN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
