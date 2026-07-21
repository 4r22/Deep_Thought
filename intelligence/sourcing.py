#!/usr/bin/env python3
"""VC Brain — sourcing preprocessing gate.

Turns a raw sourced repository (an archived working copy + GitHub metadata
snapshot) into either a pipeline-ready application record or an explicit
refusal, BEFORE any token is spent. This is the data-quality gate the funnel
was missing: the screen judges deals, this judges whether there is enough
data to judge at all.

Verdict ladder (deterministic, reasons always named):

    junk  — nothing to analyze: no code and no real README, or an
            empty/stub repo. Never enters the pipeline; not worth an
            analyst's minute either.
    thin  — something exists but below the analyzable bar (stub README,
            a handful of files, <=2 commits), OR the assembled application
            record itself fails the pipeline's entry gate. Held out of the
            pipeline until more data arrives.
    pass  — substantive repo AND its assembled application record clears
            run.gate_application. The emitted record is what the pipeline
            actually accepts — the two gates cannot drift apart, because
            pass is defined as "the pipeline's own door opens".

Safety posture: archives are UNTRUSTED
code from strangers. This module only ever READS files; it never executes,
installs, or imports repo content. README text is treated as data — it flows
into application JSON verbatim (truncated), where the prompt layer's
single-pass fill() already fences it. Secrets hygiene: .env* files are never
read, and dotfiles never count as code.

Usage:
    ./sourcing.py gate --archive ~/archives/sourced-repos \
        [--work-subdir work] [--meta-subdir meta] \
        [--only names.txt] -o out/sourcing-claude [--emit-applications]

Writes <out>/gate-report.jsonl (one verdict per repo), <out>/summary.json,
and with --emit-applications, <out>/applications/<owner>__<repo>.json for
every pass-tier repo.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run as intelligence_run  # gate_application: the pipeline's own door

# Thresholds — the analyzable bar. Named so the gate report can cite them.
JUNK_MAX_README_WORDS = 30      # below this a README is a stub
JUNK_MAX_CODE_LINES = 30        # below this there is no implementation
THIN_MIN_README_WORDS = 120
THIN_MIN_CODE_FILES = 5
THIN_MIN_CODE_LINES = 200
THIN_MIN_COMMITS = 3

CODE_EXTS = {
    ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".rb",
    ".java", ".kt", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".php",
    ".scala", ".clj", ".ex", ".exs", ".erl", ".lua", ".r", ".jl", ".zig",
    ".html", ".css", ".scss", ".vue", ".svelte", ".sql", ".sh", ".ipynb",
}
SKIP_DIRS = {
    ".git", "node_modules", "vendor", "dist", "build", "out", "target",
    "__pycache__", ".next", ".venv", "venv", "env", ".mypy_cache", ".cache",
    "site-packages", "bower_components", ".idea", ".vscode",
}
_MD_NOISE = re.compile(
    r"!\[[^\]]*\]\([^)]*\)"      # images / badges
    r"|<[^>]+>"                   # html tags
    r"|\[([^\]]*)\]\([^)]*\)"     # links -> keep text via sub below
)
_FENCE = re.compile(r"```.*?```", re.DOTALL)
MAX_FILE_BYTES = 512 * 1024       # per-file read cap; repos can be huge
MAX_CODE_FILES_COUNTED = 4000     # walk cap; beyond this the answer is "big"


def readme_text(repo_dir):
    """Text of the largest root-level README*, '' when absent."""
    candidates = [p for p in repo_dir.iterdir()
                  if p.is_file() and p.name.lower().startswith("readme")]
    if not candidates:
        return ""
    best = max(candidates, key=lambda p: p.stat().st_size)
    try:
        return best.read_bytes()[:MAX_FILE_BYTES].decode("utf-8", errors="replace")
    except OSError:
        return ""


def readme_words(text):
    """Word count after stripping fences, badges, html, and link targets —
    a wall of badges is not documentation."""
    text = _FENCE.sub(" ", text)
    text = _MD_NOISE.sub(lambda m: m.group(1) or " ", text)
    return len(text.split())


def code_stats(repo_dir):
    """(code_files, code_lines) over the working tree, skipping vendored and
    generated dirs, dotfiles (never .env*), binaries, and giant files."""
    files = 0
    lines = 0
    stack = [repo_dir]
    while stack:
        d = stack.pop()
        try:
            entries = sorted(d.iterdir())
        except OSError:
            continue
        for p in entries:
            if p.name.startswith("."):
                continue                      # dotfiles: includes .env* — never read
            if p.is_dir():
                if p.name not in SKIP_DIRS:
                    stack.append(p)
                continue
            if p.suffix.lower() not in CODE_EXTS:
                continue
            files += 1
            if files > MAX_CODE_FILES_COUNTED:
                return files, lines
            try:
                blob = p.read_bytes()[:MAX_FILE_BYTES]
            except OSError:
                continue
            if b"\x00" in blob[:4096]:
                continue                      # binary masquerading as code
            lines += blob.count(b"\n")
    return files, lines


def commit_count(repo_dir):
    """`git rev-list --count HEAD` — read-only, no hooks execute. None when
    the tree is not a usable git repo."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_dir), "rev-list", "--count", "HEAD"],
            capture_output=True, text=True, timeout=30)
        return int(proc.stdout.strip()) if proc.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def first_paragraph(md):
    """First substantive prose line of a README — skips headings, badges,
    fences, and one-word lines. '' when none exists."""
    md = _FENCE.sub("", md)
    for raw in md.splitlines():
        line = _MD_NOISE.sub(lambda m: m.group(1) or " ", raw).strip()
        if not line or line.startswith(("#", ">", "|", "---", "===")):
            continue
        line = " ".join(line.split())
        if len(line) >= 20 and len(line.split()) >= 4:
            return line[:300]
    return ""


def bullet_claims(md, limit=8):
    """Bullet / numbered lines from a README as deck-claim stand-ins —
    deterministic extraction, verbatim data, truncated."""
    md = _FENCE.sub("", md)
    claims = []
    for raw in md.splitlines():
        stripped = raw.strip()
        if not re.match(r"^(?:[-*+]|\d+[.)])\s+\S", stripped):
            continue
        text = _MD_NOISE.sub(lambda m: m.group(1) or " ", stripped)
        text = " ".join(re.sub(r"^(?:[-*+]|\d+[.)])\s+", "", text).split())
        if intelligence_run.informative_len(text) >= 15:
            claims.append(text[:300])
        if len(claims) >= limit:
            break
    return claims


def assess_repo(repo_dir, meta=None, archive_label="unknown"):
    """One repo -> gate record: metrics, verdict, reasons, and (pass tier)
    the assembled application. Pure function of the tree + metadata."""
    meta = meta or {}
    name = repo_dir.name  # owner__repo
    full_name = meta.get("full_name") or name.replace("__", "/", 1)
    rm_text = readme_text(repo_dir)
    rm_words = readme_words(rm_text)
    files, lines = code_stats(repo_dir)
    commits = commit_count(repo_dir)
    desc = meta.get("description") or ""

    metrics = {"readme_words": rm_words, "code_files": files,
               "code_lines": lines, "commits": commits,
               "has_description": bool(desc.strip())}
    reasons = []

    if files == 0 and rm_words < JUNK_MAX_README_WORDS:
        reasons.append(f"junk: no code files and README under {JUNK_MAX_README_WORDS} words")
    elif lines < JUNK_MAX_CODE_LINES and rm_words < JUNK_MAX_README_WORDS:
        reasons.append(f"junk: under {JUNK_MAX_CODE_LINES} code lines and README under "
                       f"{JUNK_MAX_README_WORDS} words")
    if reasons:
        return {"repo": full_name, "dir": name, "archive": archive_label,
                "verdict": "junk", "reasons": reasons, "metrics": metrics}

    if rm_words < THIN_MIN_README_WORDS:
        reasons.append(f"README {rm_words} words < {THIN_MIN_README_WORDS}")
    if files < THIN_MIN_CODE_FILES:
        reasons.append(f"{files} code files < {THIN_MIN_CODE_FILES}")
    if lines < THIN_MIN_CODE_LINES:
        reasons.append(f"{lines} code lines < {THIN_MIN_CODE_LINES}")
    if commits is not None and commits < THIN_MIN_COMMITS:
        reasons.append(f"{commits} commits < {THIN_MIN_COMMITS}")

    application = to_application(full_name, meta, rm_text, archive_label)
    door = intelligence_run.gate_application(application)
    if door["verdict"] != "pass":
        reasons.append("assembled application fails the pipeline entry gate: "
                       + "; ".join(door["reasons"]))

    verdict = "thin" if reasons else "pass"
    rec = {"repo": full_name, "dir": name, "archive": archive_label,
           "verdict": verdict, "reasons": reasons, "metrics": metrics}
    if verdict == "pass":
        rec["application"] = application
    return rec


def to_application(full_name, meta, rm_text, archive_label):
    """Deterministic repo -> application record. README text is untrusted
    data and flows through verbatim (truncated) — never interpreted."""
    owner = meta.get("owner")
    if not isinstance(owner, dict):
        # some metadata snapshots store owner as a bare login string
        owner = {"login": owner} if isinstance(owner, str) else {}
    owner_login = owner.get("login") or full_name.split("/")[0]
    one_liner = " ".join((meta.get("description") or "").split())[:300]
    if intelligence_run.informative_len(one_liner) < 20 or len(one_liner.split()) < 4:
        one_liner = first_paragraph(rm_text)
    claims = bullet_claims(rm_text)
    if not claims:
        # fall back to prose: first sentences of the README as claim stand-ins
        para = first_paragraph(rm_text)
        claims = [para] if para and para != one_liner else []
    return {
        "company_name": full_name.split("/", 1)[1] if "/" in full_name else full_name,
        "one_liner": one_liner,
        "founder": {
            "name": owner_login,
            "github": owner.get("html_url") or f"https://github.com/{owner_login}",
        },
        "deck_claims": claims,
        "applied_at": meta.get("pushed_at") or meta.get("created_at") or "",
        "source": f"sourced-github:{archive_label}",
        "repo": meta.get("html_url") or f"https://github.com/{full_name}",
    }


def cmd_gate(args):
    archive = pathlib.Path(args.archive).expanduser()
    work = archive / args.work_subdir
    meta_dir = archive / args.meta_subdir
    if not work.is_dir():
        raise SystemExit(f"no work dir at {work}")
    only = None
    if args.only:
        only = {line.strip() for line in pathlib.Path(args.only).read_text().splitlines()
                if line.strip()}

    outdir = pathlib.Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    app_dir = outdir / "applications"
    counts = {"junk": 0, "thin": 0, "pass": 0}
    records = []
    repos = sorted(p for p in work.iterdir() if p.is_dir())
    for repo_dir in repos:
        if only and repo_dir.name not in only:
            continue
        meta_path = meta_dir / f"{repo_dir.name}.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        rec = assess_repo(repo_dir, meta, archive_label=archive.name)
        counts[rec["verdict"]] += 1
        records.append(rec)
        if rec["verdict"] == "pass" and args.emit_applications:
            app_dir.mkdir(exist_ok=True)
            (app_dir / f"{repo_dir.name}.json").write_text(
                json.dumps(rec["application"], indent=2, ensure_ascii=False))
        print(f"[{rec['verdict']:>4}] {rec['repo']}", file=sys.stderr)

    with open(outdir / "gate-report.jsonl", "w") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    summary = {"archive": str(archive), "repos_gated": len(records), "counts": counts,
               "thresholds": {
                   "junk_max_readme_words": JUNK_MAX_README_WORDS,
                   "junk_max_code_lines": JUNK_MAX_CODE_LINES,
                   "thin_min_readme_words": THIN_MIN_README_WORDS,
                   "thin_min_code_files": THIN_MIN_CODE_FILES,
                   "thin_min_code_lines": THIN_MIN_CODE_LINES,
                   "thin_min_commits": THIN_MIN_COMMITS}}
    (outdir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary["counts"]))
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("gate")
    sp.add_argument("--archive", required=True,
                    help="archive root containing work/ + meta/ (archive layout: "
                         "work/ per-repo working copies + meta/ GitHub metadata snapshots)")
    sp.add_argument("--work-subdir", default="work")
    sp.add_argument("--meta-subdir", default="meta")
    sp.add_argument("--only", help="file with one <owner>__<repo> dir name per line")
    sp.add_argument("--emit-applications", action="store_true")
    sp.add_argument("-o", "--out", required=True)
    args = p.parse_args()
    if args.cmd == "gate":
        cmd_gate(args)


if __name__ == "__main__":
    main()
