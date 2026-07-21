#!/usr/bin/env python3
"""Sequential farm-run harness for the intelligence pipeline (bead vc-brain-mau).

Batch-runs `./run.py --worker … pipeline …` over many candidates, strictly one
at a time. Defends against memo-worker out-dir contamination (bead vc-brain-j3n)
by snapshotting intelligence/out/ paths+mtimes around each invocation and
aborting the batch if anything outside the active run dir changes.

Stdlib only. Does not modify run.py.

Usage:
  # Generate 20 mini-applications from memory/founders.json + signals.json
  python3 scripts/farm_run.py generate-first-slice

  # Run a JSON manifest of {application, signals, slug} entries
  python3 scripts/farm_run.py run --manifest memory/farm/manifest.json

  # Or expand a glob of application JSON files (deck campaign shape)
  python3 scripts/farm_run.py run --glob '../memory/farm/application-*.json' \\
      --signals ../memory/signals.json

  # Probe whether this environment can actually execute a pipeline
  python3 scripts/farm_run.py probe
"""
from __future__ import annotations

import argparse
import glob as globmod
import json
import os
import pathlib
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterable, Optional

INTEL = pathlib.Path(__file__).resolve().parent.parent
REPO = INTEL.parent
DEFAULT_THESIS = REPO / "config" / "thesis.example.json"
DEFAULT_OUT_ROOT = INTEL / "out" / "farm"
DEFAULT_SIGNALS = REPO / "memory" / "signals.json"
DEFAULT_FOUNDERS = REPO / "memory" / "founders.json"
GENERATED_APP_DIR = REPO / "memory" / "farm" / "generated"
GENERATED_MANIFEST = REPO / "memory" / "farm" / "first-slice-manifest.json"


# ------------------------------------------------------------------ helpers


def load_json(path: pathlib.Path | str) -> Any:
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slugify(text: str) -> str:
    """Filesystem-safe slug from a company/repo name."""
    s = text.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "candidate"


def repo_slug_from_url(url: str) -> str:
    """owner/repo -> repo; falls back to last path segment."""
    path = url.rstrip("/").split("/")
    if len(path) >= 1:
        return slugify(path[-1])
    return "candidate"


# ---------------------------------------------------------- manifest / input


def normalize_entry(raw: dict, default_signals: Optional[str] = None) -> dict:
    """Normalize one manifest entry to {application, signals, slug} paths/strings."""
    if not isinstance(raw, dict):
        raise ValueError(f"manifest entry must be an object, got {type(raw).__name__}")
    app = raw.get("application")
    slug = raw.get("slug")
    signals = raw.get("signals", default_signals)
    if not app:
        raise ValueError(f"manifest entry missing 'application': {raw!r}")
    if not slug:
        raise ValueError(f"manifest entry missing 'slug': {raw!r}")
    if not signals:
        raise ValueError(f"manifest entry {slug!r} missing 'signals' (pass --signals or set per entry)")
    return {
        "application": str(app),
        "signals": str(signals),
        "slug": str(slug),
    }


def parse_manifest(
    data: Any,
    default_signals: Optional[str] = None,
) -> list[dict]:
    """Parse a manifest JSON value (list or {entries: [...]} or {candidates: [...]})."""
    if isinstance(data, dict):
        if "entries" in data:
            rows = data["entries"]
        elif "candidates" in data:
            rows = data["candidates"]
        else:
            raise ValueError("manifest object needs 'entries' or 'candidates' list")
    elif isinstance(data, list):
        rows = data
    else:
        raise ValueError(f"manifest must be list or object, got {type(data).__name__}")
    return [normalize_entry(r, default_signals=default_signals) for r in rows]


def _repo_rel(path: pathlib.Path) -> str:
    try:
        return path.resolve().relative_to(REPO.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def load_manifest_file(path: pathlib.Path, default_signals: Optional[str] = None) -> list[dict]:
    """Load a manifest, resolving relative paths against the repo root."""
    entries = parse_manifest(load_json(path), default_signals=default_signals)
    resolved = []
    for e in entries:
        app = pathlib.Path(e["application"])
        sig = pathlib.Path(e["signals"])
        if not app.is_absolute():
            app = (REPO / app).resolve()
        if not sig.is_absolute():
            sig = (REPO / sig).resolve()
        resolved.append({
            "application": str(app),
            "signals": str(sig),
            "slug": e["slug"],
        })
    return resolved


def entries_from_application_glob(
    pattern: str,
    signals: str,
    base: Optional[pathlib.Path] = None,
) -> list[dict]:
    """Deck-campaign shape: each application-*.json becomes one entry.

    Slug is derived from the filename: application-foo.json -> foo.
    Paths are absolute strings so the runner is cwd-independent.
    """
    base = base or pathlib.Path.cwd()
    # glob is relative to cwd unless absolute (no root_dir kwarg — the local
    # batch runs on Python 3.9, where glob(root_dir=) does not exist)
    matches = sorted(globmod.glob(pattern))
    if not matches and not os.path.isabs(pattern):
        # also try relative to repo / memory
        matches = sorted(globmod.glob(str((base / pattern).resolve())))
    entries = []
    for m in matches:
        p = pathlib.Path(m).resolve()
        name = p.stem  # application-foo
        if name.startswith("application-"):
            slug = name[len("application-"):]
        else:
            slug = slugify(name)
        entries.append({
            "application": str(p),
            "signals": str(pathlib.Path(signals).resolve()),
            "slug": slug,
        })
    return entries


# ----------------------------------------------- first-slice mini-app generator


def one_liner_from_signal(summary: str) -> str:
    """Pull a short product line from a GitHub signal summary when possible."""
    m = re.search(r'Description:\s*"([^"]+)"', summary)
    if m:
        return m.group(1).strip()
    # Fall back to the first sentence-ish chunk
    cut = summary.split(". ", 1)[0].strip()
    return cut[:200] if cut else "Outbound sourcing candidate (no deck)."


def build_mini_application(founder: dict, signal: dict) -> dict:
    """Build an application-shaped JSON for an outbound GitHub candidate."""
    url = signal.get("url") or ""
    repo = url.rstrip("/").split("/")[-1] if url else founder.get("id", "candidate")
    name = founder.get("name") or (founder.get("aliases") or ["unknown"])[0]
    aliases = founder.get("aliases") or []
    handle = aliases[0] if aliases else name
    location = founder.get("location") or "Unknown (GitHub profile lists none)"
    links = founder.get("links") or {}
    github = links.get("github") or ""
    one_liner = one_liner_from_signal(signal.get("summary") or "")
    sid = signal.get("id", "?")
    return {
        "company_name": f"{repo} (outbound sourcing target — no inbound application exists)",
        "one_liner": one_liner,
        "founder": {
            "name": name,
            "role": "solo open-source author (hypothetical founder — outbound sourcing evaluation)",
            "location": location if isinstance(location, str) else "Unknown",
            "github": github,
            "background_claimed": (
                f"Author of {repo}: public GitHub footprint only "
                f"(handle {handle}). This is an outbound evaluation from Memory "
                f"signals; no deck, no application was submitted. Primary signal: {sid}."
            ),
        },
        "deck_claims": [
            f"(none — no deck exists; all evidence is public GitHub signals in Memory, see {sid})"
        ],
        "ask": (
            "Hypothetical: would we initiate outreach toward a $100K fast check "
            "if this person raised? Outbound sourcing demo — no real ask on the table."
        ),
        "applied_at": signal.get("observed_at") or signal.get("ingested_at") or "2026-07-19T11:45:00Z",
    }


def generate_first_slice_entries(
    founders_path: pathlib.Path = DEFAULT_FOUNDERS,
    signals_path: pathlib.Path = DEFAULT_SIGNALS,
    app_dir: pathlib.Path = GENERATED_APP_DIR,
    manifest_path: pathlib.Path = GENERATED_MANIFEST,
) -> list[dict]:
    """Write 20 mini-applications + a farm manifest; return normalized entries."""
    founders = load_json(founders_path)
    signals = load_json(signals_path)
    by_sid = {s["id"]: s for s in signals}
    app_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    used_slugs: set[str] = set()
    for founder in founders:
        sids = founder.get("signal_ids") or []
        if not sids:
            continue
        signal = by_sid.get(sids[0])
        if not signal:
            continue
        slug = repo_slug_from_url(signal.get("url") or founder["id"])
        # Disambiguate collisions
        base_slug = slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{n}"
            n += 1
        used_slugs.add(slug)
        app = build_mini_application(founder, signal)
        app_path = app_dir / f"application-{slug}.json"
        write_json(app_path, app)
        # Per-candidate signals file: only the signal(s) for this founder
        # (pipeline accepts a full list; filtering keeps context tight)
        cand_signals = [by_sid[s] for s in sids if s in by_sid]
        sig_path = app_dir / f"signals-{slug}.json"
        write_json(sig_path, cand_signals)
        entries.append({
            "application": str(app_path.resolve()),
            "signals": str(sig_path.resolve()),
            "slug": slug,
        })
    # Manifest stores repo-relative paths so it travels; runtime resolves them.
    manifest_entries = [
        {
            "application": _repo_rel(pathlib.Path(e["application"])),
            "signals": _repo_rel(pathlib.Path(e["signals"])),
            "slug": e["slug"],
        }
        for e in entries
    ]
    write_json(manifest_path, {
        "entries": manifest_entries,
        "source": "first-slice",
        "count": len(manifest_entries),
    })
    return entries


# ----------------------------------------------- out/ snapshot (j3n defense)


def snapshot_out_tree(out_root: pathlib.Path) -> dict[str, float]:
    """Map relative path -> mtime for every file under intelligence/out/.

    Relative paths use POSIX separators from `out_root` (typically INTEL/out).
    Missing out_root yields an empty snapshot.
    """
    snap: dict[str, float] = {}
    if not out_root.exists():
        return snap
    for p in out_root.rglob("*"):
        if p.is_file():
            rel = p.relative_to(out_root).as_posix()
            snap[rel] = p.stat().st_mtime
    return snap


def diff_snapshots(
    before: dict[str, float],
    after: dict[str, float],
    active_prefix: str,
) -> list[str]:
    """Return contamination complaints: changes outside active_prefix/.

    `active_prefix` is the relative path under intelligence/out/ for this run
    (e.g. 'farm/some-repo'). Files under that prefix are allowed to appear or
    change; everything else that appears, disappears, or changes mtime is a
    contamination hit (j3n defense).
    """
    prefix = active_prefix.strip("/") + "/"
    allowed = lambda rel: rel == active_prefix.strip("/") or rel.startswith(prefix)

    complaints: list[str] = []
    before_keys = set(before)
    after_keys = set(after)

    for rel in sorted(after_keys - before_keys):
        if not allowed(rel):
            complaints.append(f"NEW outside active dir: {rel}")
    for rel in sorted(before_keys - after_keys):
        if not allowed(rel):
            complaints.append(f"DELETED outside active dir: {rel}")
    for rel in sorted(before_keys & after_keys):
        if before[rel] != after[rel] and not allowed(rel):
            complaints.append(f"MTIME changed outside active dir: {rel}")
    return complaints


class ContaminationError(RuntimeError):
    """Raised when a farm run mutated files outside its own out dir."""


def kill_process_group(proc: "subprocess.Popen") -> None:
    """SIGKILL the child's whole process group (it was started with
    start_new_session=True, so pgid == its pid). Falls back to killing just
    the child if the group is already gone."""
    import signal
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except OSError:
            pass


# -------------------------------------------------------------- run status


def run_is_complete(outdir: pathlib.Path) -> bool:
    """Resume predicate: memo.json and latency.json present AND parseable.
    Presence alone would let a run killed mid-write pass as 'complete' and be
    skipped forever on resume (run.py writes atomically now, but this predicate
    must not trust that every historical dir was written by the atomic path)."""
    for name in ("memo.json", "latency.json"):
        p = outdir / name
        if not p.is_file():
            return False
        try:
            json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return False
    return True


def resolve_worker() -> tuple[str, str]:
    """Pick a worker backend. Returns (worker, reason).

    Mirrors run.py's three backends (api/cursor/claude). A miss here is a
    fact about THIS environment right now, never a claim that some class of
    machine (e.g. cloud VMs) cannot run the batch — see bead vc-brain-mau,
    CORRECTION 2026-07-21.
    """
    if shutil.which("cursor-agent"):
        return "cursor", "cursor-agent found on PATH"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "api", "ANTHROPIC_API_KEY is set"
    if shutil.which("claude"):
        return "claude", "claude CLI found on PATH (subscription auth; needs one-time `claude /login`)"
    return "", ("no worker backend in this environment: cursor-agent not on PATH, "
                "ANTHROPIC_API_KEY unset, claude CLI not on PATH")


# ------------------------------------------------------------- report bits


def forum_fired_and_reason(outdir: pathlib.Path) -> tuple[bool, str]:
    """Did the forum convene? Artifact presence is the ground truth; the gate
    recomputation mirrors the POST-INVERSION run.forum_gate (bead vc-brain-mau:
    the old shape read a forum_trigger key that no longer exists — the room
    convenes for advance AND contested, skipped only on reject or blank crux)."""
    fired = (outdir / "forum-adjudication.json").is_file() or (outdir / "forum-meta.json").is_file()
    screen_path = outdir / "screen.json"
    triage_path = outdir / "triage.json"
    if not (screen_path.is_file() and triage_path.is_file()):
        return fired, "screen/triage missing — cannot recompute gate"
    screen = load_json(screen_path)
    triage = load_json(triage_path)
    # Local copy of run.forum_gate so the report path stays stdlib-pure even if
    # run.py import fails in a bare environment.
    ok, reason = _forum_gate(screen, triage)
    if fired and not ok:
        return True, f"artifacts present but gate would skip: {reason}"
    if not fired and ok:
        return False, f"no artifacts but gate would fire: {reason} — run died pre-forum?"
    return fired, reason


def _forum_gate(screen: dict, triage: dict) -> tuple[bool, str]:
    """Mechanical forum fire conditions — mirrors run.forum_gate (inverted
    pipeline, epic vc-brain-26w): convene unless rejected or blank crux."""
    if screen.get("verdict") == "reject":
        return False, "screen verdict is 'reject'"
    if not (triage.get("crux") or "").strip():
        return False, "triage crux is blank"
    return True, "screen not rejected + non-blank crux"


def summarize_run(slug: str, outdir: pathlib.Path, status: str, error: Optional[str] = None) -> dict:
    """Build one per-run report row from an out dir (or a failed/skipped stub)."""
    row: dict[str, Any] = {
        "slug": slug,
        "status": status,
        "screen_verdict": None,
        "forum_fired": None,
        "forum_gate_reason": None,
        "decision_recommendation": None,
        "conditions_count": None,
        "total_seconds": None,
        "tokens": None,
        "error": error,
        "out": str(outdir),
    }
    if status in ("skipped", "pending", "timeout", "failed", "aborted") and not run_is_complete(outdir):
        # Still try to pull partial screen if present
        screen_path = outdir / "screen.json"
        if screen_path.is_file():
            try:
                row["screen_verdict"] = load_json(screen_path).get("verdict")
            except (json.JSONDecodeError, OSError):
                pass
        return row

    try:
        if (outdir / "screen.json").is_file():
            row["screen_verdict"] = load_json(outdir / "screen.json").get("verdict")
        fired, reason = forum_fired_and_reason(outdir)
        row["forum_fired"] = fired
        row["forum_gate_reason"] = reason
        if (outdir / "memo.json").is_file():
            memo = load_json(outdir / "memo.json")
            decision = memo.get("decision") or {}
            row["decision_recommendation"] = decision.get("recommendation")
            conds = decision.get("conditions") or []
            row["conditions_count"] = len(conds) if isinstance(conds, list) else None
        if (outdir / "latency.json").is_file():
            lat = load_json(outdir / "latency.json")
            row["total_seconds"] = lat.get("total_seconds")
            row["tokens"] = lat.get("tokens")  # null/absent for cursor backend
            if row["decision_recommendation"] is None and lat.get("decision"):
                row["decision_recommendation"] = lat.get("decision")
    except (json.JSONDecodeError, OSError, TypeError, KeyError) as exc:
        row["error"] = f"report parse error: {exc}"
    return row


def aggregate_rows(rows: list[dict]) -> dict:
    """Aggregate gate fire-rate, latency distribution, verdict counts."""
    # Prefer status==ok / skipped(complete) for aggregates
    usable = [r for r in rows if r.get("status") in ("ok", "skipped") and r.get("total_seconds") is not None]
    if not usable:
        usable = [r for r in rows if r.get("total_seconds") is not None]

    verdict_counts: dict[str, int] = {}
    for r in rows:
        v = r.get("screen_verdict")
        if v:
            verdict_counts[v] = verdict_counts.get(v, 0) + 1

    fired_n = sum(1 for r in usable if r.get("forum_fired") is True)
    gate_n = len([r for r in usable if r.get("forum_fired") is not None])
    fire_rate = (fired_n / gate_n) if gate_n else None

    seconds = [r["total_seconds"] for r in usable if isinstance(r.get("total_seconds"), (int, float))]
    latency_dist: dict[str, Any] = {"n": len(seconds)}
    if seconds:
        latency_dist.update({
            "min": min(seconds),
            "max": max(seconds),
            "mean": round(statistics.mean(seconds), 1),
            "median": round(statistics.median(seconds), 1),
        })
        if len(seconds) >= 2:
            latency_dist["stdev"] = round(statistics.stdev(seconds), 1)

    decision_counts: dict[str, int] = {}
    for r in usable:
        d = r.get("decision_recommendation")
        if d:
            decision_counts[d] = decision_counts.get(d, 0) + 1

    status_counts: dict[str, int] = {}
    for r in rows:
        s = r.get("status") or "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

    return {
        "n_rows": len(rows),
        "n_usable": len(usable),
        "status_counts": status_counts,
        "verdict_counts": verdict_counts,
        "decision_counts": decision_counts,
        "forum_fire_rate": fire_rate,
        "forum_fired": fired_n,
        "forum_eligible": gate_n,
        "latency": latency_dist,
    }


def render_report_md(rows: list[dict], aggregates: dict, aborted: Optional[str] = None) -> str:
    """Markdown table + one honest paragraph."""
    lines = ["# Farm run report", ""]
    if aborted:
        lines += [f"**ABORTED:** {aborted}", ""]

    lines += [
        "| slug | status | screen | forum | gate reason | decision | conditions | seconds | tokens |",
        "|---|---|---|---|---|---|---:|---:|---|",
    ]
    for r in rows:
        forum = "—" if r.get("forum_fired") is None else ("yes" if r["forum_fired"] else "no")
        tokens = r.get("tokens")
        if isinstance(tokens, dict):
            tok = f"in={tokens.get('input', '?')} out={tokens.get('output', '?')}"
        else:
            tok = "—"
        reason = (r.get("forum_gate_reason") or "—").replace("|", "/")
        if len(reason) > 60:
            reason = reason[:57] + "…"
        lines.append(
            "| {slug} | {status} | {screen} | {forum} | {reason} | {decision} | {conds} | {secs} | {tok} |".format(
                slug=r.get("slug") or "?",
                status=r.get("status") or "?",
                screen=r.get("screen_verdict") or "—",
                forum=forum,
                reason=reason,
                decision=r.get("decision_recommendation") or "—",
                conds=r.get("conditions_count") if r.get("conditions_count") is not None else "—",
                secs=r.get("total_seconds") if r.get("total_seconds") is not None else "—",
                tok=tok,
            )
        )

    lines += ["", "## Aggregates", ""]
    ag = aggregates
    lines.append(f"- rows: {ag.get('n_rows')} (usable for latency/gate: {ag.get('n_usable')})")
    lines.append(f"- status counts: {json.dumps(ag.get('status_counts') or {})}")
    lines.append(f"- screen verdict counts: {json.dumps(ag.get('verdict_counts') or {})}")
    lines.append(f"- decision counts: {json.dumps(ag.get('decision_counts') or {})}")
    fr = ag.get("forum_fire_rate")
    if fr is None:
        lines.append("- forum gate fire-rate: n/a (no completed runs with gate data)")
    else:
        lines.append(
            f"- forum gate fire-rate: {fr:.0%} "
            f"({ag.get('forum_fired')}/{ag.get('forum_eligible')})"
        )
    lat = ag.get("latency") or {}
    if lat.get("n"):
        lines.append(
            f"- latency seconds: n={lat['n']} min={lat.get('min')} median={lat.get('median')} "
            f"mean={lat.get('mean')} max={lat.get('max')}"
            + (f" stdev={lat['stdev']}" if "stdev" in lat else "")
        )
    else:
        lines.append("- latency seconds: n/a")

    lines += ["", "## Honest read", ""]
    paragraph = _honest_paragraph(rows, aggregates, aborted)
    lines.append(paragraph)
    lines.append("")
    return "\n".join(lines)


def _honest_paragraph(rows: list[dict], aggregates: dict, aborted: Optional[str]) -> str:
    n = len(rows)
    ok = sum(1 for r in rows if r.get("status") == "ok")
    skipped = sum(1 for r in rows if r.get("status") == "skipped")
    failed = sum(1 for r in rows if r.get("status") in ("failed", "timeout", "aborted"))
    fr = aggregates.get("forum_fire_rate")
    lat = aggregates.get("latency") or {}
    parts = [
        f"This farm batch covered {n} candidate(s): {ok} completed this session, "
        f"{skipped} skipped as already complete (resume), {failed} failed/aborted/timed out."
    ]
    if aborted:
        parts.append(f"The batch stopped early: {aborted}")
    if fr is None:
        parts.append("Forum fire-rate and latency distribution are not meaningful yet — too few finished runs.")
    else:
        parts.append(
            f"Among finished runs the mechanical forum gate fired {fr:.0%} of the time; "
            f"median wall-clock was {lat.get('median', 'n/a')}s "
            f"(range {lat.get('min', '?')}–{lat.get('max', '?')}s)."
        )
        parts.append(
            "Screen verdicts and decision recommendations above are whatever the pipeline "
            "wrote; this harness does not re-judge substance — it only sequences runs, "
            "fences out-dir contamination, and tallies outputs."
        )
    return " ".join(parts)


def write_reports(out_root: pathlib.Path, rows: list[dict], aborted: Optional[str] = None) -> dict:
    aggregates = aggregate_rows(rows)
    report = {
        "aborted": aborted,
        "runs": rows,
        "aggregates": aggregates,
    }
    write_json(out_root / "report.json", report)
    (out_root / "REPORT.md").write_text(
        render_report_md(rows, aggregates, aborted=aborted), encoding="utf-8"
    )
    return report


# -------------------------------------------------------------- execution


def build_pipeline_cmd(
    *,
    worker: str,
    application: str,
    thesis: str,
    signals: str,
    out: str,
    forum_mode: str = "2-pole",
    run_py: Optional[pathlib.Path] = None,
) -> list[str]:
    run_py = run_py or (INTEL / "run.py")
    return [
        sys.executable,
        str(run_py),
        "--worker", worker,
        "pipeline",
        "--application", application,
        "--thesis", thesis,
        "--signals", signals,
        "--forum-mode", forum_mode,
        "-o", out,
    ]


def run_one(
    entry: dict,
    *,
    worker: str,
    thesis: str,
    out_root: pathlib.Path,
    intel_out: pathlib.Path,
    timeout: Optional[float],
    forum_mode: str,
    dry_run: bool = False,
    fence_scope: str = "out-tree",
) -> dict:
    """Execute one pipeline invocation with j3n snapshot defense. Returns a report row."""
    slug = entry["slug"]
    outdir = out_root / slug
    # Path relative to intelligence/out/ for the contamination fence
    try:
        active_rel = str(outdir.resolve().relative_to(intel_out.resolve())).replace(os.sep, "/")
    except ValueError:
        # out_root outside intel/out — fence still uses basename under farm/
        active_rel = f"farm/{slug}"

    if run_is_complete(outdir):
        print(f"[skip] {slug}: memo.json + latency.json already present", file=sys.stderr)
        return summarize_run(slug, outdir, "skipped")

    cmd = build_pipeline_cmd(
        worker=worker,
        application=entry["application"],
        thesis=thesis,
        signals=entry["signals"],
        out=str(outdir.relative_to(INTEL)) if outdir.is_relative_to(INTEL) else str(outdir),
        forum_mode=forum_mode,
    )
    # Prefer -o path relative to INTEL cwd
    if outdir.resolve().is_relative_to(INTEL.resolve()):
        cmd[-1] = str(outdir.resolve().relative_to(INTEL.resolve()))

    if dry_run:
        print(f"[dry-run] {' '.join(cmd)}", file=sys.stderr)
        return summarize_run(slug, outdir, "pending")

    outdir.mkdir(parents=True, exist_ok=True)
    before = snapshot_out_tree(intel_out)
    print(f"[run ] {slug}: {' '.join(cmd)}", file=sys.stderr)
    t0 = time.monotonic()
    # start_new_session=True puts run.py AND its worker-CLI grandchildren
    # (claude/cursor-agent subprocesses, up to 6 concurrent in a memo fan-out)
    # in one process group; on timeout the WHOLE group is killed. A plain
    # subprocess.run timeout kills only the direct child — orphaned CLI
    # grandchildren would keep burning subscription quota for up to 1800s
    # each and overlap the next app's run.
    child_env = dict(os.environ)
    if fence_scope == "out-root":
        # The farm fence (scoped to out_root) is the cross-run guard; the
        # pipeline's internal tree-wide fence would false-abort on concurrent
        # neighbor sessions writing elsewhere under intelligence/out/.
        child_env["VCBRAIN_PIPELINE_FENCE"] = "off"
    proc = subprocess.Popen(
        cmd,
        cwd=str(INTEL),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
        env=child_env,
    )
    try:
        out_text, err_text = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_process_group(proc)
        out_text, err_text = proc.communicate()
        after = snapshot_out_tree(intel_out)
        complaints = diff_snapshots(before, after, active_rel)
        if complaints:
            raise ContaminationError(
                f"contamination after timeout on {slug}:\n  " + "\n  ".join(complaints)
            )
        err = f"timeout after {timeout}s"
        print(f"[FAIL] {slug}: {err}", file=sys.stderr)
        if err_text:
            print(err_text[-2000:], file=sys.stderr)
        return summarize_run(slug, outdir, "timeout", error=err)

    after = snapshot_out_tree(intel_out)
    complaints = diff_snapshots(before, after, active_rel)
    if complaints:
        detail = "\n  ".join(complaints)
        raise ContaminationError(
            f"j3n contamination defense: run {slug!r} mutated files outside "
            f"{active_rel}/:\n  {detail}"
        )

    elapsed = round(time.monotonic() - t0, 1)
    if proc.returncode != 0:
        tail = (err_text or out_text or "")[-2000:]
        print(f"[FAIL] {slug}: exit {proc.returncode} ({elapsed}s)\n{tail}", file=sys.stderr)
        return summarize_run(
            slug, outdir, "failed",
            error=f"exit {proc.returncode}: {tail.splitlines()[-1] if tail else 'no output'}",
        )

    if not run_is_complete(outdir):
        return summarize_run(
            slug, outdir, "failed",
            error="pipeline exited 0 but memo.json/latency.json incomplete",
        )

    print(f"[ ok ] {slug}: {elapsed}s", file=sys.stderr)
    return summarize_run(slug, outdir, "ok")


def run_batch(
    entries: list[dict],
    *,
    worker: str,
    thesis: str,
    out_root: pathlib.Path,
    timeout: Optional[float] = 3600.0,
    forum_mode: str = "2-pole",
    dry_run: bool = False,
    intel_out: Optional[pathlib.Path] = None,
    max_consecutive_failures: int = 3,
    fence_scope: str = "out-tree",
) -> dict:
    """Strictly sequential batch. Writes REPORT.md + report.json — ALWAYS, even
    when an unexpected exception kills the loop (try/finally), so an overnight
    crash still leaves an honest partial report. Aborts on contamination, and
    circuit-breaks after `max_consecutive_failures` consecutive failed/timeout
    rows: a systemic outage (subscription cap exhausted, CLI logged out) must
    not grind through every remaining candidate producing a wall of failures.

    fence_scope: "out-tree" (default) snapshots ALL of intelligence/out/ —
    maximal j3n protection, but unsound when OTHER sessions write anywhere
    under out/ concurrently (their writes abort our batch as phantom
    contamination; observed live: a concurrent stage run from another
    session killed the farm on app 1). "out-root" scopes the fence to this
    batch's own out_root — still catches the original j3n bug class (a run
    writing into a sibling slug's dir) while tolerating unrelated neighbors."""
    intel_out = intel_out or (INTEL / "out")
    if fence_scope == "out-root":
        intel_out = out_root
    out_root.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    aborted: Optional[str] = None
    consecutive_failures = 0

    def mark_remaining_pending() -> None:
        seen = {r["slug"] for r in rows}
        for rest in entries:
            if rest["slug"] not in seen:
                rows.append(summarize_run(rest["slug"], out_root / rest["slug"], "pending"))

    try:
        for entry in entries:
            try:
                row = run_one(
                    entry,
                    worker=worker,
                    thesis=thesis,
                    out_root=out_root,
                    intel_out=intel_out,
                    timeout=timeout,
                    forum_mode=forum_mode,
                    dry_run=dry_run,
                    fence_scope=fence_scope,
                )
                rows.append(row)
            except ContaminationError as exc:
                aborted = str(exc)
                print(f"\n!!! ABORT BATCH: {exc}", file=sys.stderr)
                rows.append(summarize_run(entry["slug"], out_root / entry["slug"], "aborted", error=str(exc)))
                mark_remaining_pending()
                break

            if row.get("status") in ("failed", "timeout"):
                consecutive_failures += 1
            elif row.get("status") in ("ok", "skipped"):
                consecutive_failures = 0
            if max_consecutive_failures and consecutive_failures >= max_consecutive_failures:
                aborted = (f"{consecutive_failures} consecutive failed/timeout runs — "
                           "circuit breaker tripped (systemic outage suspected: quota, "
                           "auth, or network); remaining candidates left pending for resume")
                print(f"\n!!! ABORT BATCH: {aborted}", file=sys.stderr)
                mark_remaining_pending()
                break
    finally:
        report = write_reports(out_root, rows, aborted=aborted)
    return report


# -------------------------------------------------------------------- probe


def cmd_probe(args: argparse.Namespace) -> int:
    worker, reason = resolve_worker()
    print(f"cursor-agent on PATH: {'yes' if shutil.which('cursor-agent') else 'no'}")
    print(f"ANTHROPIC_API_KEY set: {'yes' if os.environ.get('ANTHROPIC_API_KEY') else 'no'}")
    print(f"claude CLI on PATH: {'yes' if shutil.which('claude') else 'no'}")
    print(f"selected worker: {worker or '(none)'} — {reason}")
    if not worker:
        # A statement about THIS environment only — never generalize it to
        # "cloud can't run the batch" (bead vc-brain-mau, CORRECTION 2026-07-21).
        print("PROBE: no worker backend in this environment; run from one that "
              "has cursor-agent, ANTHROPIC_API_KEY, or a logged-in claude CLI.")
        print(json.dumps({
            "ok": False,
            "can_run_pipeline": False,
            "reason": reason,
            "cursor_agent": bool(shutil.which("cursor-agent")),
            "anthropic_api_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "claude_cli": bool(shutil.which("claude")),
        }, indent=2))
        return 2

    # The probe is READ-ONLY w.r.t. the repo (R5 fix, bead vc-brain-mau): the
    # throwaway mini-apps go to a temp dir, never the committed memory/farm/
    # generated tree + manifest. Running `probe` must not dirty tracked files.
    gen_dir = pathlib.Path(tempfile.mkdtemp(prefix="farm-probe-gen-"))
    try:
        entries = generate_first_slice_entries(
            app_dir=gen_dir, manifest_path=gen_dir / "first-slice-manifest.json")
        entry = entries[0] if entries else None
        if not entry:
            print("PROBE: no entries generated", file=sys.stderr)
            return 1

        probe_out = INTEL / "out" / "farm-probe"
        if probe_out.exists():
            shutil.rmtree(probe_out)

        thesis = str(pathlib.Path(args.thesis).resolve()) if args.thesis else str(DEFAULT_THESIS.resolve())
        timeout = args.timeout
        before = snapshot_out_tree(INTEL / "out")
        cmd = build_pipeline_cmd(
            worker=worker,
            application=entry["application"],
            thesis=thesis,
            signals=entry["signals"],
            out="out/farm-probe",
            forum_mode=args.forum_mode,
        )
        print(f"PROBE: {' '.join(cmd)} (timeout={timeout}s)", file=sys.stderr)
        try:
            proc = subprocess.run(
                cmd, cwd=str(INTEL), capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            after = snapshot_out_tree(INTEL / "out")
            complaints = diff_snapshots(before, after, "farm-probe")
            result = {
                "ok": False,
                "can_run_pipeline": True,
                "reason": f"timeout after {timeout}s",
                "contamination": complaints,
                "worker": worker,
            }
            print("PROBE_RESULT: " + json.dumps(result, indent=2))
            if probe_out.exists():
                shutil.rmtree(probe_out, ignore_errors=True)
            return 1

        after = snapshot_out_tree(INTEL / "out")
        complaints = diff_snapshots(before, after, "farm-probe")
        ok = proc.returncode == 0 and run_is_complete(probe_out) and not complaints
        result = {
            "ok": ok,
            "can_run_pipeline": True,
            "worker": worker,
            "exit_code": proc.returncode,
            "complete": run_is_complete(probe_out),
            "contamination": complaints,
            "stderr_tail": (proc.stderr or "")[-500:],
        }
        if run_is_complete(probe_out):
            result["summary"] = summarize_run(entry["slug"], probe_out, "ok" if ok else "failed")
        print("PROBE_RESULT: " + json.dumps(result, indent=2, default=str))

        if probe_out.exists():
            shutil.rmtree(probe_out, ignore_errors=True)
            print("PROBE: deleted out/farm-probe/", file=sys.stderr)
        return 0 if ok else 1
    finally:
        shutil.rmtree(gen_dir, ignore_errors=True)


# ----------------------------------------------------------------------- CLI


def cmd_generate(args: argparse.Namespace) -> int:
    entries = generate_first_slice_entries(
        founders_path=pathlib.Path(args.founders),
        signals_path=pathlib.Path(args.signals),
        app_dir=pathlib.Path(args.app_dir),
        manifest_path=pathlib.Path(args.manifest_out),
    )
    print(f"OK: wrote {len(entries)} mini-applications under {args.app_dir}")
    print(f"manifest: {args.manifest_out}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    default_signals = args.signals
    if args.manifest:
        entries = load_manifest_file(pathlib.Path(args.manifest), default_signals=default_signals)
    elif args.glob:
        if not default_signals:
            raise SystemExit("--glob requires --signals (shared signals file for deck campaign apps)")
        entries = entries_from_application_glob(args.glob, signals=default_signals, base=REPO)
        if not entries:
            raise SystemExit(f"no files matched glob: {args.glob}")
    elif args.first_slice:
        entries = generate_first_slice_entries()
    else:
        raise SystemExit("provide --manifest, --glob, or --first-slice")

    if args.limit is not None:
        entries = entries[: args.limit]

    worker = args.worker
    if not worker:
        worker, reason = resolve_worker()
        if not worker:
            if args.dry_run:
                worker = "cursor"  # placeholder — subprocess never launched
                print(f"dry-run: no backend on this host ({reason}); using worker=cursor", file=sys.stderr)
            else:
                raise SystemExit(f"no worker available: {reason}")
        else:
            print(f"auto worker={worker} ({reason})", file=sys.stderr)

    thesis = str(pathlib.Path(args.thesis).resolve())
    out_root = pathlib.Path(args.out_root)
    if not out_root.is_absolute():
        out_root = (INTEL / out_root).resolve()

    report = run_batch(
        entries,
        worker=worker,
        thesis=thesis,
        out_root=out_root,
        timeout=args.timeout,
        forum_mode=args.forum_mode,
        dry_run=args.dry_run,
        max_consecutive_failures=args.max_consecutive_failures,
        fence_scope=args.fence_scope,
    )
    print(f"wrote {out_root / 'REPORT.md'} and {out_root / 'report.json'}")
    if report.get("aborted"):
        return 3
    return 0


def main(argv: Optional[Iterable[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate-first-slice", help="Write 20 mini-apps + manifest from memory/")
    g.add_argument("--founders", default=str(DEFAULT_FOUNDERS))
    g.add_argument("--signals", default=str(DEFAULT_SIGNALS))
    g.add_argument("--app-dir", default=str(GENERATED_APP_DIR))
    g.add_argument("--manifest-out", default=str(GENERATED_MANIFEST))
    g.set_defaults(func=cmd_generate)

    r = sub.add_parser("run", help="Sequential farm batch over a manifest or glob")
    src = r.add_mutually_exclusive_group(required=True)
    src.add_argument("--manifest", help="JSON manifest of {application,signals,slug}")
    src.add_argument("--glob", help="Glob of application-*.json (deck campaign)")
    src.add_argument("--first-slice", action="store_true",
                     help="Generate + run the 20 memory first-slice candidates")
    r.add_argument("--signals", help="Default/shared signals path (required with --glob)")
    r.add_argument("--thesis", default=str(DEFAULT_THESIS))
    r.add_argument("--worker", choices=["api", "cursor", "claude"], default=None)
    r.add_argument("--out-root", default="out/farm")
    r.add_argument("--timeout", type=float, default=3600.0,
                   help="Per-run subprocess timeout seconds (default 3600)")
    r.add_argument("--forum-mode", choices=["2-pole", "seeded"], default="2-pole")
    r.add_argument("--limit", type=int, default=None)
    r.add_argument("--max-consecutive-failures", type=int, default=3,
                   help="Circuit breaker: abort the batch after this many consecutive "
                        "failed/timeout runs (systemic outage protection); 0 disables")
    r.add_argument("--fence-scope", choices=["out-tree", "out-root"], default="out-tree",
                   help="Contamination fence scope: out-tree watches ALL of "
                        "intelligence/out/ (aborts on ANY concurrent writer there); "
                        "out-root watches only this batch's own tree — use when other "
                        "sessions legitimately write under intelligence/out/ in parallel")
    r.add_argument("--dry-run", action="store_true")
    r.set_defaults(func=cmd_run)

    pr = sub.add_parser("probe", help="Check backends; optionally one smoke run")
    pr.add_argument("--thesis", default=str(DEFAULT_THESIS))
    pr.add_argument("--timeout", type=float, default=1800.0)
    pr.add_argument("--forum-mode", choices=["2-pole", "seeded"], default="2-pole")
    pr.set_defaults(func=cmd_probe)

    args = p.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
