#!/usr/bin/env python3
"""VC Brain — intelligence layer runner.

Drives the reasoning pipeline over one opportunity — persons first,
abstractions on top, scoring last:

    screen -> triage -> forum -> counsel -> memo -> decision

triage sharpens the record into moves (routed checks, evidence-vs-evidence
tensions, and the single non-empirical crux) and seeds the room. The forum
then builds a populated reference space of real named voices; it is skipped
ONLY when the screen rejected the deal or triage left a blank crux — no
scores ever enter the room. The counsel — the standing tribunal across from
the forum — sits AFTER it: three blind ABSTRACT axis offices (Founder /
Market / Idea-vs-Market) each read the full proceedings and project the room
into their one dimension, cognizant of the fund mandate (the number is a
projection of the room, never a vote taken inside it). counsel.json is the
full record; axes.json is its mechanical legacy projection. Only then do the
memo agents run.

The forum is a fixed deliberation structure: blind
pre-interviews -> one moderated debate pressing a single crux ->
post-interviews recording position evolution -> a typed adjudication
block (Converged / Residual / Instrument / Evolution / Suggested
attendants / outcome). Interviews and debates are markdown artifacts;
only the adjudication is structured. The forum stage returns the full
bundle (attendants, pre-interviews, transcript, post-interviews,
adjudication) so the counsel offices can cite it by seat.

After the forum: one dispatched agent per document the judges' brief
specifies (Appendix 1), given the forum results, the axes mapping, and the
ingredients; code assembles the claims ledger; a final decision agent writes
the decision block from the forum's Instruments — or, when no room convened,
from triage's routed checks.

Each stage is also runnable standalone. Every pipeline run writes
latency.json — first-signal-to-decision speed is a product feature,
not an afterthought — and forum-meta.json records the forum's actual
token spend.

Requires ANTHROPIC_API_KEY (or the cursor worker backend).

Usage:
    ./run.py pipeline  --application fixtures/application-ferrite.json \
                       --thesis ../config/thesis.example.json \
                       --signals fixtures/signals-ferrite.json \
                       -o out/ferrite
    ./run.py screen    --application ... --thesis ... [--signals ...]
    ./run.py triage    --application ... --thesis ... [--signals ...] --screen ...
    ./run.py counsel   --application ... --thesis ... --signals ... --screen ... --triage ... [--forum-dir out/x]
    ./run.py axes      (deprecated alias of counsel; returns the legacy axes projection)
    ./run.py memo      --application ... --thesis ... --signals ... --triage ... --axes ... [--counsel ...] [--adjudication ...]
    ./run.py potential --founder <id-or-file> --signals ../memory/signals.json \
                       [--founders ../memory/founders.json] [--thesis ...] \
                       -o out/potential-<slug>
    ./run.py forum     --decision ... --crux "..." [--mode seeded --seats 5] [--signals ...]
    ./run.py interview --pole bull --decision ... --crux "..." --signals ...
    ./run.py debate    --decision ... --crux "..." --bull b.md --bear be.md --signals ...
    ./run.py adjudicate --decision ... --bull b.md --bear be.md --transcript t.md \
                        [--post-bull pb.md --post-bear pe.md]
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
# VCBRAIN_MODEL overrides the primary model for a whole run — e.g. a
# claude-backend batch on claude-sonnet-5 over a Claude Code subscription.
MODEL = os.environ.get("VCBRAIN_MODEL", "claude-opus-4-8")
# F3 robustness: a deliberately different model family from the primary, so a
# divergent debate outcome signals model flavor, not sampling noise. Api
# backend only — call_cursor refuses a non-default model.
ROBUST_MODEL = "claude-sonnet-5"
# The cursor worker's pinned model (operator decision 2026-07-21): never let
# cursor-agent fall through to its account default (`auto` → Composer) — an
# unpinned model is a provenance hole in any tape the run produces.
CURSOR_MODEL = os.environ.get("VCBRAIN_CURSOR_MODEL", "cursor-grok-4.5-high")
# claude backend turn budget. --max-turns 1 was a coin-flip: one stray extra
# turn killed the call with "Reached max turns (1)", non-deterministically,
# and it bit LAST — at forum adjudication, after the whole room's tokens were
# already spent (bead vc-brain-lbe). 8 is headroom, not permission: --tools ''
# in call_claude keeps every turn pure text, so a compliant worker still
# answers in one turn — the two guards are complementary.
CLAUDE_TURNS = os.environ.get("VCBRAIN_CLAUDE_TURNS", "8")

# Worker backends:
#   api    — Anthropic API via the python SDK (needs ANTHROPIC_API_KEY).
#            Structured outputs are enforced server-side.
#   cursor — dispatch each stage as a detached cursor-agent CLI worker
#            (locally authenticated, no API key here).
#            JSON discipline is by prompt convention + local check, like the
#            engine's output contracts.
WORKER = os.environ.get("VCBRAIN_WORKER", "api")


def worker_model():
    """The model the active worker actually runs — provenance, not config.

    The cursor worker ignores MODEL entirely and runs CURSOR_MODEL; recording
    the MODEL config echo in meta/latency would mislabel every cursor-run tape
    (bead vc-brain-ytl).
    """
    return CURSOR_MODEL if WORKER == "cursor" else MODEL

# The legacy 2-pole room — the pilot shape: two opposed, pre-assigned,
# abstract stance-poles. Fallback only (--forum-mode 2-pole): the default is
# the seeded mode, which invites N real named voices — persons are the
# foundation of the room; abstract stances only layer on top of them.
POLES = [
    {"id": "bull", "handle": "Bull pole",
     "lens": "The strongest evidence-backed case FOR writing the $100K check now.",
     "mandate": "Press the record for what genuinely derisks writing now; concede what the evidence forces.",
     "opening_lean": "for"},
    {"id": "bear", "handle": "Bear pole",
     "lens": "The strongest evidence-backed case for passing, or for gating the check behind a condition.",
     "mandate": "Press the record for what the write decision ignores; concede what the evidence forces.",
     "opening_lean": "against"},
]

# ---------------------------------------------------------------- plumbing


def load_json(path):
    return json.loads(pathlib.Path(path).read_text())


def load_text(path):
    return pathlib.Path(path).read_text()


def prompt_template(name):
    return (ROOT / "prompts" / name).read_text()


def schema(name):
    sch = json.loads((ROOT / "schemas" / name).read_text())
    sch.setdefault("_label", name.replace(".schema.json", ""))  # names validation errors
    return sch


_SLOT = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


def fill(template, mapping):
    """Single-pass slot substitution: inserted values are never re-scanned, so
    a value containing {{TOKEN}}-shaped text (templating syntax quoted in a
    transcript, or a hostile application) cannot pull another slot's payload
    into itself. Unknown tokens pass through untouched."""
    return _SLOT.sub(lambda m: mapping.get(m.group(1), m.group(0)), template)


def jdump(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False)


# JSON Schema keywords the structured-outputs endpoint does not accept. They
# stay in the schema files (the single source of truth, honored by local
# jsonschema validation when installed); the wire copy drops them, and the
# load-bearing ones are re-enforced code-side (validate_*_postchecks).
WIRE_UNSUPPORTED = {
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "exclusiveMinimum", "exclusiveMaximum", "minProperties", "maxProperties",
    "multipleOf",
}


def wire_schema(sch):
    """A schema as sent to a backend: private (_-prefixed) annotations and
    endpoint-unsupported constraint keywords dropped, recursively."""
    if isinstance(sch, dict):
        return {k: wire_schema(v) for k, v in sch.items()
                if not k.startswith("_") and k not in WIRE_UNSUPPORTED}
    if isinstance(sch, list):
        return [wire_schema(v) for v in sch]
    return sch


def get_client():
    import anthropic

    return anthropic.Anthropic()


# Actual token spend, accumulated across every api call. forum-meta.json
# snapshots it around the forum block (a stage justified by
# selective spend records what it actually spends). Cursor workers report
# no usage — the meta says null rather than pretending.
TOKENS = {"input": 0, "output": 0}
_TOK_LOCK = threading.Lock()


def tokens_snapshot():
    with _TOK_LOCK:
        return dict(TOKENS)


def tokens_delta(before):
    now = tokens_snapshot()
    return {k: now[k] - before[k] for k in before}


# SystemExit messages from the call seam that mean "the model produced the
# wrong SHAPE" — retryable once, because a fresh sample usually fixes them.
# Environment/config failures (binary missing, not logged in, refusal, backend
# exit codes) never match: retrying those burns a call to fail identically.
_RETRYABLE_CALL_ERRORS = (" invalid: ", "worker returned no JSON object")


def _is_retryable_call_error(err):
    msg = str(err)
    return any(marker in msg for marker in _RETRYABLE_CALL_ERRORS)


def call(prompt_text, json_schema=None, max_tokens=16000, model=None):
    """One model call via the selected worker backend.

    `model` overrides the default MODEL for this one call — the F3 robustness
    slice replicates the debate on a second model family. Only the api
    backend can honor it.

    When json_schema is given the parsed result is validated against it before
    return, so a drifted model output fails loudly at this boundary instead of
    poisoning a downstream stage. The api backend also constrains output
    server-side; validating here additionally covers the cursor backend (whose
    JSON is best-effort extracted) and old SDKs that silently drop the
    constraint.

    Shape failures (unparseable/invalid JSON) retry ONCE with the violation
    named in the reprompt — an unattended overnight batch must not lose a full
    forum's spend to a single malformed sample. Environment failures (missing
    binary, not logged in, refusal) are never retried. Bounded: 2 attempts.
    """
    def attempt(text):
        if WORKER == "cursor":
            result, usage = call_cursor(text, json_schema, model)
        elif WORKER == "claude":
            result, usage = call_claude(text, json_schema, model)
        else:
            result, usage = call_api(text, json_schema, max_tokens, model)
        if json_schema is not None:
            validate(result, json_schema)
        return result, usage

    try:
        return attempt(prompt_text)
    except SystemExit as err:
        if json_schema is None or not _is_retryable_call_error(err):
            raise
        label = json_schema.get("_label", "artifact")
        print(f"[  retry ] {label}: shape failure, one retry ({err})", file=sys.stderr)
        return attempt(
            prompt_text
            + "\n\n## Previous attempt rejected\n\n"
            + f"{err}\n\nCorrect this and return ONLY a valid JSON object per the schema.")


def extract_json(text):
    """Pull the JSON object out of worker text output (fences tolerated)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        text = text.split("\n", 1)[1] if "\n" in text else text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        if start == -1:
            raise SystemExit(f"worker returned no JSON object; tail:\n{text[-800:]}")
        # raw_decode parses the FIRST complete object and ignores trailing
        # prose/objects — workers sometimes append commentary after the JSON
        # (observed: cursor grok-4.5 on axes, 2026-07-21).
        try:
            obj, _ = json.JSONDecoder().raw_decode(text, start)
            return obj
        except json.JSONDecodeError:
            end = text.rfind("}")
            if end <= start:
                raise SystemExit(f"worker returned no JSON object; tail:\n{text[-800:]}")
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError as e:
                # Surface the raw payload — a parse failure with no evidence is
                # undebuggable (observed on live seed runs, 2026-07-21).
                raise SystemExit(
                    f"worker JSON unparseable ({e}); len={len(text)}; "
                    f"head:\n{text[:400]}\n...tail:\n{text[-400:]}")


def call_cursor(prompt_text, json_schema=None, model=None):
    """One stage as a cursor-agent worker (detached worker dispatch).

    Workers run in a disposable temp cwd (bead vc-brain-j3n) so any tool-driven
    file writes cannot land under intelligence/ — the prompts are self-contained
    JSON and require no repo paths. --force retention is vc-brain-bev's scope —
    do not remove here.
    """
    if model and model != CURSOR_MODEL:
        raise SystemExit("cursor backend runs pinned CURSOR_MODEL only; --robustness requires --worker api")
    agent = shutil.which("cursor-agent")
    if not agent:
        raise SystemExit("cursor-agent not found on PATH")
    full = prompt_text
    if json_schema is not None:
        full += _json_suffix(json_schema)
    # Temp cwd contains stray worker writes (vc-brain-j3n); --force kept (bev scope).
    workdir = tempfile.mkdtemp(prefix="vcbrain-cursor-")
    try:
        proc = subprocess.run(
            [agent, "--print", "--force", "--model", CURSOR_MODEL, full],
            capture_output=True, text=True, timeout=1800, cwd=workdir,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    if proc.returncode != 0:
        raise SystemExit(f"cursor-agent exited {proc.returncode}:\n{proc.stderr[-800:]}")
    text = proc.stdout.strip()
    return (extract_json(text) if json_schema is not None else text), None


def _json_suffix(json_schema):
    """The enforced-output-format tail appended to text-CLI worker prompts —
    shared by the cursor and claude backends; JSON discipline is by prompt
    convention + local extract/validate, like the engine's output contracts."""
    return (
        "\n\n## Output format (enforced)\n\n"
        "Return ONLY a single JSON object conforming to this JSON Schema. "
        "No markdown fences, no prose before or after the object:\n\n"
        + jdump(wire_schema(json_schema))
    )


def call_claude(prompt_text, json_schema=None, model=None):
    """One stage as a headless Claude Code CLI call (`claude -p`) — runs on
    the operator's Claude Code subscription, no API key. Unlike call_cursor,
    per-call model overrides are honored, so --robustness works here.

    The child env is scrubbed of the host session's CLAUDE*/ANTHROPIC*
    variables: a nested Claude Code session must authenticate from the CLI's
    own stored login, not inherit this session's plumbing."""
    agent = shutil.which("claude")
    if not agent:
        raise SystemExit("claude CLI not found on PATH")
    full = prompt_text
    if json_schema is not None:
        full += _json_suffix(json_schema)
    env = {k: v for k, v in os.environ.items()
           if not (k.startswith("CLAUDE") or k.startswith("ANTHROPIC") or k == "BAGGAGE")}
    # Every stage here is a pure text-in / JSON-out transform — no file
    # reads. Disable tools so the worker cannot spend turns on tool calls: the adjudication
    # stage died with "Reached max turns (1)" when the model reached for a tool
    # instead of answering directly (bead vc-brain-6w6). CLAUDE_TURNS keeps a
    # small budget on top of that, so a stray extra turn cannot kill the call
    # after its tokens are spent (bead vc-brain-lbe) — complementary guards.
    proc = subprocess.run(
        [agent, "-p", "--model", model or MODEL, "--max-turns", CLAUDE_TURNS,
         "--tools", "", "--output-format", "text"],
        input=full, capture_output=True, text=True, timeout=1800, cwd=str(ROOT),
        env=env,
    )
    if proc.returncode != 0:
        raise SystemExit(f"claude CLI exited {proc.returncode}:\n"
                         f"{proc.stderr[-800:] or proc.stdout[-800:]}")
    text = proc.stdout.strip()
    if text.startswith("Not logged in"):
        raise SystemExit("claude CLI is not logged in — run `claude /login` once, "
                         "then re-run (the batch resumes where it stopped)")
    return (extract_json(text) if json_schema is not None else text), None


def snapshot_out_files(out_root):
    """Map posix-relative path -> mtime_ns for every file under out_root."""
    root = pathlib.Path(out_root)
    if not root.exists():
        return {}
    root = root.resolve()
    snap = {}
    for path in root.rglob("*"):
        if path.is_file():
            snap[path.relative_to(root).as_posix()] = path.stat().st_mtime_ns
    return snap


def allowed_out_prefix(outdir, out_root=None):
    """Relative prefix under out_root for the active -o dir, or None if outside.

    A -o dir OUTSIDE intelligence/out/ yields None => contamination_violations
    treats EVERY out/ mutation as a violation (strict fail). Intended: a run
    that writes elsewhere must not touch the committed out/ tape at all.
    """
    out_root = pathlib.Path(out_root or (ROOT / "out")).resolve()
    try:
        return pathlib.Path(outdir).resolve().relative_to(out_root).as_posix()
    except ValueError:
        return None


def contamination_violations(before, after, allowed_prefix):
    """Pure: paths that appeared, vanished, or changed mtime outside allowed_prefix.

    `before` / `after` are path→mtime snapshots (e.g. from snapshot_out_files).
    `allowed_prefix` is a relative path under the out root (or None/"" when the
    active -o dir is outside out/ and no mutation there is permitted).
    """
    # VCBRAIN_FENCE_ALLOW: comma-separated globs for LEGITIMATE concurrent
    # writers (e.g. "farm-trial-*/*" while a farm batch runs in another
    # session). Default empty = strict. The fence stays fatal for everything
    # else — concurrency is opt-in visible, never silently tolerated.
    import fnmatch
    allow_globs = [g.strip() for g in
                   os.environ.get("VCBRAIN_FENCE_ALLOW", "").split(",") if g.strip()]

    def is_allowed(rel):
        if allowed_prefix and (rel == allowed_prefix or rel.startswith(allowed_prefix + "/")):
            return True
        return any(fnmatch.fnmatch(rel, g) for g in allow_globs)

    violations = []
    for rel in set(before) | set(after):
        if is_allowed(rel):
            continue
        if before.get(rel) != after.get(rel):
            violations.append(rel)
    return sorted(violations)


def assert_out_uncontaminated(before, after, outdir, out_root=None):
    """Fail loudly if intelligence/out/ changed outside the active -o directory."""
    out_root = pathlib.Path(out_root or (ROOT / "out"))
    allowed = allowed_out_prefix(outdir, out_root)
    viols = contamination_violations(before, after, allowed)
    if viols:
        print(
            "ERROR: intelligence/out/ contamination — files changed outside "
            f"active -o dir ({outdir}):\n  " + "\n  ".join(viols),
            file=sys.stderr,
        )
        raise SystemExit(1)


def call_api(prompt_text, json_schema=None, max_tokens=16000, model=None):
    """One model call. With json_schema, the response is constrained to it."""
    client = get_client()
    kwargs = dict(
        model=model or MODEL,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt_text}],
    )
    if json_schema is not None:
        # via extra_body so older SDK versions pass it through on the wire
        kwargs["extra_body"] = {
            "output_config": {"format": {"type": "json_schema", "schema": wire_schema(json_schema)}}
        }
    with client.messages.stream(**kwargs) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise SystemExit("model refused the request (stop_reason=refusal)")
    if msg.stop_reason == "max_tokens":
        raise SystemExit("output truncated (stop_reason=max_tokens) — raise max_tokens")
    with _TOK_LOCK:
        TOKENS["input"] += msg.usage.input_tokens
        TOKENS["output"] += msg.usage.output_tokens
    text = next(b.text for b in msg.content if b.type == "text")
    return (json.loads(text) if json_schema is not None else text), msg.usage


def write_out(path, content):
    """Atomic write: tmp file + os.replace, so a timeout kill mid-write can
    never leave a truncated artifact (a truncated latency.json would make the
    farm's resume predicate skip a corrupt run as 'complete')."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content if isinstance(content, str) else jdump(content))
    os.replace(tmp, path)
    print(f"wrote {path}", file=sys.stderr)


def signals_or_empty(args):
    return jdump(load_json(args.signals)) if args.signals else "[]"


def load_thesis(path):
    """Read + validate the fund thesis, failing fast before any model call —
    the cheapest place to catch a bad config."""
    obj = load_json(path)
    validate_thesis(obj)
    return obj


# ------------------------------------------------------------- input gate

# The screen judges DEALS; this gate judges DATA. A record that is malformed,
# placeholder-filled, or too thin to reason about is refused at load time —
# before a single token is spent — with machine-readable reasons. Judgment
# stays with the screen: a gated-through record with a missing deck or founder
# is the screen's missing_minimums territory, not the gate's. Load-bearing
# checks live here in code (the stdlib validate() fallback cannot carry
# schema keyword constraints), mirroring the wire_schema discipline.

_PLACEHOLDER_FULL = re.compile(
    r"^(?:tbd|todo|n/?a|none|null|nil|test(?:ing)?\d*|asdf\w*|xxx+|foo(?:bar)?|"
    r"placeholder|unknown|untitled|sample|example|your[ -]\w+[ -]here|\?+|[-_.=*#]+)$",
    re.IGNORECASE)

GATE_MIN_ONE_LINER_CHARS = 20
GATE_MIN_ONE_LINER_WORDS = 4
GATE_MIN_SUBSTANCE_CHARS = 280


def informative_len(text):
    """Length of a string after whitespace collapse — 0 for non-strings and
    for placeholder junk (tbd/todo/lorem/asdf/bare punctuation)."""
    if not isinstance(text, str):
        return 0
    t = " ".join(text.split())
    if not t or "lorem ipsum" in t.lower() or _PLACEHOLDER_FULL.match(t.strip(" .,!:;")):
        return 0
    return len(t)


def gate_application(app):
    """Deterministic data-quality verdict for one application record.

    Returns {"verdict": "pass"|"refuse", "reasons": [...], "metrics": {...}}.
    Never raises: schema-shape violations are folded in as refusal reasons so
    batch callers (sourcing) get a verdict per record instead of a crash."""
    if not isinstance(app, dict):
        return {"verdict": "refuse",
                "reasons": ["application is not a JSON object"], "metrics": {}}
    reasons = []
    try:
        validate(app, schema("application.schema.json"), "application")
    except SystemExit as err:
        reasons.append(str(err))

    name = informative_len(app.get("company_name"))
    one = informative_len(app.get("one_liner"))
    founder = app.get("founder") if isinstance(app.get("founder"), dict) else {}
    raw_claims = app.get("deck_claims")
    claims = ([c for c in raw_claims if informative_len(c)]
              if isinstance(raw_claims, list) else [])
    substance = (one + sum(informative_len(c) for c in claims)
                 + informative_len(founder.get("background_claimed"))
                 + informative_len(app.get("ask")))
    metrics = {"company_name_chars": name, "one_liner_chars": one,
               "one_liner_words": len((app.get("one_liner") or "").split())
               if isinstance(app.get("one_liner"), str) else 0,
               "informative_claims": len(claims), "substance_chars": substance}

    if name < 2:
        reasons.append("company_name is missing or placeholder")
    if one < GATE_MIN_ONE_LINER_CHARS or metrics["one_liner_words"] < GATE_MIN_ONE_LINER_WORDS:
        reasons.append(
            f"one_liner is missing, placeholder, or under {GATE_MIN_ONE_LINER_CHARS} chars / "
            f"{GATE_MIN_ONE_LINER_WORDS} words — the record cannot state itself")
    if founder and informative_len(founder.get("name")) < 2:
        reasons.append("founder present but founder.name is missing or placeholder")
    if substance < GATE_MIN_SUBSTANCE_CHARS:
        reasons.append(
            f"total substance {substance} chars < {GATE_MIN_SUBSTANCE_CHARS} "
            "(one_liner + deck_claims + founder background + ask) — too thin to screen honestly")
    return {"verdict": "refuse" if reasons else "pass",
            "reasons": reasons, "metrics": metrics}


def load_application(path):
    """Load + gate an application, failing fast before any model call — bad
    data is refused at the door, not screened. Every stage that reads
    --application loads through here; this is the single input seam."""
    app = load_json(path)
    report = gate_application(app)
    if report["verdict"] != "pass":
        raise SystemExit(
            f"application gate REFUSED {path}:\n  - " + "\n  - ".join(report["reasons"]))
    return app


def validate(obj, sch, label=None):
    """Validate obj against a JSON Schema. Full coverage via jsonschema when it
    is importable; a zero-dependency required-keys walk otherwise. No hard dep.
    Raises SystemExit on any violation. Label defaults to the schema title."""
    label = label or sch.get("_label") or sch.get("title") or "artifact"
    try:
        import jsonschema
        jsonschema.validate(obj, sch)          # full coverage when present
    except ImportError:
        _require_keys(obj, sch, label)          # stdlib fallback
    except Exception as err:                    # jsonschema.ValidationError etc.
        raise SystemExit(f"{label} invalid: {err}")
    return obj


def validate_thesis(obj):
    """Validate the fund thesis against thesis.schema.json."""
    return validate(obj, schema("thesis.schema.json"), "thesis")


def forum_gate(screen, triage):
    """Mechanical forum fire conditions, inverted per epic vc-brain-26w. The
    room builds the reference space BEFORE anything is scored, so it convenes
    for advance AND contested screens alike. It is skipped ONLY when the screen
    rejected the deal or triage produced a blank crux — nothing left to press.
    A mechanical gate, never a prompt-only rule. Returns (ok, reason); the skip
    reason names the failed condition."""
    if screen.get("verdict") == "reject":
        return False, "screen verdict is 'reject'"
    if not (triage.get("crux") or "").strip():
        return False, "triage crux is blank"
    return True, "screen not rejected + non-blank crux"


def escalate_gate(escalate):
    """Mechanical person-level escalate check (bead vc-brain-uid): to_forum=true
    is a request, not a verdict. Escalation stands only when a non-blank
    non-empirical crux about the person is named — selective spend must not
    depend on the model honoring prompt-only rules. Returns (ok, reason).

    NOTE (bead vc-brain-uid, R5 caveat): this DIVERGES from forum_gate by
    design — a to_forum request with a blank crux HARD-fails (stage_potential
    raises SystemExit) rather than soft-skipping the way forum_gate returns a
    skip reason for the pipeline to route around. Kept as-is, not redesigned."""
    if not escalate.get("to_forum"):
        return True, "no forum escalate"
    if not (escalate.get("crux") or "").strip():
        return False, "to_forum true but person-level crux is blank"
    return True, "to_forum + non-blank person-level crux"


def founder_slug(founder):
    """Filesystem-safe slug from founder id (fallback: name)."""
    raw = founder.get("id") or founder.get("name") or "founder"
    slug = re.sub(r"[^a-z0-9]+", "-", str(raw).lower()).strip("-")
    return slug or "founder"


def resolve_founder(founder_arg, founders_path=None):
    """Load one founder: a JSON file path, or an id/name/alias looked up in a
    founders list (default: ../memory/founders.json relative to this package)."""
    arg = pathlib.Path(founder_arg)
    if arg.is_file():
        obj = load_json(arg)
        if isinstance(obj, list):
            raise SystemExit(f"--founder path {founder_arg!r} is a list; pass an id or a single-founder file")
        if not isinstance(obj, dict) or "id" not in obj:
            raise SystemExit(f"--founder path {founder_arg!r} is not a founder object")
        return obj
    path = pathlib.Path(founders_path) if founders_path else (ROOT.parent / "memory" / "founders.json")
    if not path.is_file():
        raise SystemExit(f"founders file not found: {path} (pass --founders or a founder JSON file)")
    founders = load_json(path)
    if not isinstance(founders, list):
        raise SystemExit(f"{path} must be a JSON array of founders")
    key = str(founder_arg).strip().lower()
    for f in founders:
        if str(f.get("id", "")).lower() == key:
            return f
        if str(f.get("name", "")).lower() == key:
            return f
        aliases = f.get("aliases") or []
        if any(str(a).lower() == key for a in aliases):
            return f
    raise SystemExit(f"founder not found: {founder_arg!r} in {path}")


def signals_for_founder(founder, signals):
    """Join a founder to their signals: union of founder.signal_ids and any
    signal whose founder_ids lists this founder. Ordered by observed_at, then id."""
    if not isinstance(signals, list):
        raise SystemExit("signals must be a JSON array")
    want = set(founder.get("signal_ids") or [])
    fid = founder.get("id")
    matched = []
    seen = set()
    for s in signals:
        sid = s.get("id")
        hit = sid in want or (fid and fid in (s.get("founder_ids") or []))
        if hit and sid not in seen:
            matched.append(s)
            seen.add(sid)
    matched.sort(key=lambda s: (s.get("observed_at") or "", s.get("id") or ""))
    return matched


def _require_keys(obj, sch, label):
    """Minimal stdlib schema check: object-ness + top-level required keys. Doubles
    as the dev self-validator for code-assembled artifacts."""
    if sch.get("type") == "object" and not isinstance(obj, dict):
        raise SystemExit(f"{label} invalid: expected object")
    for key in sch.get("required", []):
        if key not in obj:
            raise SystemExit(f"{label} invalid: missing required key '{key}'")


def parallel(fn, items):
    """Map fn over items concurrently, preserving order. Used for independent
    model calls (invariant #6: parallelizable work is parallelized)."""
    with ThreadPoolExecutor(max_workers=min(len(items), 6)) as ex:
        return list(ex.map(fn, items))


def make_timed(latency):
    """Build the per-stage timer bound to one run's latency record. A fan-out
    wrapped in a single timed(...) records one stage = the wall-clock of its
    slowest concurrent call, so sum(stages) still tracks total_seconds."""
    def timed(name, fn):
        start = time.monotonic()
        result = fn()
        elapsed = round(time.monotonic() - start, 1)
        latency["stages"].append({"stage": name, "seconds": elapsed})
        print(f"[{elapsed:7.1f}s] {name}", file=sys.stderr)
        return result
    return timed


# ------------------------------------------------------------------ stages


def stage_screen(args):
    text = fill(prompt_template("screen.md"), {
        "THESIS_JSON": jdump(load_thesis(args.thesis)),
        "APPLICATION_JSON": jdump(load_application(args.application)),
        "SIGNALS_JSON": signals_or_empty(args),
    })
    result, usage = call(text, schema("screen.schema.json"))
    return result


def stage_triage(args, screen):
    """Sharpen the record into moves BEFORE any scoring: route every empirical
    sub-question to its cheapest decisive check, name the evidence-vs-evidence
    tensions, isolate the single crux the room will press. No scores, no
    stances. The crux is always non-blank — it is what seeds the forum."""
    text = fill(prompt_template("triage.md"), {
        "THESIS_JSON": jdump(load_thesis(args.thesis)),
        "APPLICATION_JSON": jdump(load_application(args.application)),
        "SIGNALS_JSON": signals_or_empty(args),
        "SCREEN_JSON": jdump(screen),
    })
    result, usage = call(text, schema("triage.schema.json"))
    validate_triage_postchecks(result)
    return result


def validate_triage_postchecks(triage):
    """Code-side triage invariant the wire schema cannot carry (minItems is
    stripped by wire_schema): every tension side cites at least one signal —
    a side with no evidence is not a side. SystemExit names the tension."""
    for t in triage.get("tensions", []):
        for side in ("side_a", "side_b"):
            if not t.get(side, {}).get("evidence_refs"):
                raise SystemExit(
                    f"triage invalid: tension {t.get('name', '?')!r} {side} has no "
                    "evidence_refs — a side with no evidence is not a side")


# ""=no room; interviews_block renders the seat markdown when a forum ran.
_NO_ROOM = "*(no room convened)*"


# ---------------------------------------------------------------- counsel
# The standing tribunal across from the forum (spec: docs/COUNSEL.md, bead
# vc-brain-gaw). Three ABSTRACT axis offices — no personas: the forum already
# explored the space through named persons; the counsel reads its full
# proceedings blind (each office alone) and renders one dimension each,
# cognizant of the fund mandate. Supersedes the old single-call axes stage:
# counsel.json is the full record; axes.json is a MECHANICAL projection of it
# in the legacy mapping shape, kept as the downstream/back-compat artifact.

COUNSEL_OFFICES = [
    {"key": "founder", "name": "Founder", "schema": "counsel-founder.schema.json",
     "brief": (
         "**Founder** — who they are: traits, track record, execution "
         "evidence. The persistent Founder Score from Memory (if present in "
         "signals) is one input — weigh it, don't copy it. Cold start "
         "(`cold_start: true` when there is no funding or shipped-product "
         "history): score on public footprint honestly, widen the band, and "
         "never treat absence of history as negative evidence.")},
    {"key": "market", "name": "Market", "schema": "counsel-market.schema.json",
     "brief": (
         "**Market** — sizing, competitor clusters, structural why-now. Emit "
         "the categorical `rating` (`bullish | neutral | bearish`, exactly "
         "one) AND the numeric score; they must agree directionally — a "
         "bearish 80 or a bullish 20 is a defect.")},
    {"key": "idea_vs_market", "name": "Idea vs Market",
     "schema": "counsel-idea-vs-market.schema.json",
     "brief": (
         "**Idea vs Market** — does the idea survive scrutiny as-is, or is "
         "the team strong enough to pivot? This dimension deliberately "
         "entangles idea quality with team adaptability; a weak idea with a "
         "strong team is a different verdict from a weak idea with a weak "
         "team. Emit the categorical `verdict` AND the numeric score; they "
         "must agree directionally.")},
]

# Mechanical disagreement rule for the projected axes artifact: with every
# office numeric, divergence is a spread computation, not a model judgment.
# Categorical-vs-numeric clashes are already banned per office (schema note);
# cross-office nuance beyond the spread stays visible in counsel.json.
DISAGREEMENT_SPREAD = 20


def stage_counsel(args, screen, triage, forum_bundle):
    """The counsel sitting: three blind office calls fanned out over the full
    room record, then MECHANICAL assembly. Returns (counsel, axes) where axes
    is the legacy-shape projection of the counsel record. forum_bundle is None
    on the reject/blank-crux path (degraded no-room mode)."""
    if forum_bundle:
        attendants = forum_bundle["attendants"]
        attendants_json = jdump(attendants)
        pre = interviews_block(attendants, forum_bundle["pre_interviews"])
        transcript = forum_bundle["transcript"]
        post = interviews_block(attendants, forum_bundle["post_interviews"])
        adjudication = forum_bundle["adjudication"]
        adjudication_json = jdump(adjudication) if adjudication else "null"
    else:
        attendants_json = "null"
        pre = transcript = post = _NO_ROOM
        adjudication_json = "null"
    convened = forum_bundle is not None
    shared = {
        "THESIS_JSON": jdump(load_thesis(args.thesis)),
        "APPLICATION_JSON": jdump(load_application(args.application)),
        "SIGNALS_JSON": signals_or_empty(args),
        "SCREEN_JSON": jdump(screen),
        "TRIAGE_JSON": jdump(triage),
        "ATTENDANTS_JSON": attendants_json,
        "PRE_INTERVIEWS": pre,
        "TRANSCRIPT": transcript,
        "POST_INTERVIEWS": post,
        "ADJUDICATION_JSON": adjudication_json,
    }

    def one_office(office):
        text = fill(prompt_template("counsel/member.md"), {
            **shared, "AXIS_NAME": office["name"], "AXIS_BRIEF": office["brief"],
        })
        # Heavy-context structured calls (the full proceedings each); adaptive
        # thinking shares the budget, so the default 16000 can truncate here.
        # A postcheck violation (schema-valid but rule-breaking output) retries
        # ONCE with the violation named — the forum's spend upstream of this
        # stage must not be lost to a single bad sample on an unattended run.
        result, _usage = call(text, schema(office["schema"]), max_tokens=32000)
        try:
            validate_counsel_member_postchecks(office["key"], result, convened)
        except SystemExit as err:
            print(f"[  retry ] counsel:{office['key']}: postcheck failure, "
                  f"one retry ({err})", file=sys.stderr)
            retry_text = (text + "\n\n## Previous attempt rejected\n\n"
                          + f"{err}\n\nCorrect this and return ONLY a valid "
                          "JSON object per the schema.")
            result, _usage = call(retry_text, schema(office["schema"]), max_tokens=32000)
            validate_counsel_member_postchecks(office["key"], result, convened)
        return result

    members_list = parallel(one_office, COUNSEL_OFFICES)   # blind => one fan-out
    members = {o["key"]: m for o, m in zip(COUNSEL_OFFICES, members_list)}
    counsel = assemble_counsel(members, convened)
    axes = project_axes(counsel)
    validate_axes_postchecks(axes)                          # belt and braces
    return counsel, axes


def validate_counsel_member_postchecks(axis, m, convened):
    """Code-side per-office invariants structured outputs cannot express.
    Extends the old founder-only band rule to EVERY office (all offices are
    numeric now — the per-axis scores the UI averages), and adds the mandate
    lints. SystemExit names the office and the violation."""
    band = m["band"]
    if not (isinstance(band, list) and len(band) == 2
            and all(isinstance(b, int) and not isinstance(b, bool) for b in band)):
        raise SystemExit(f"counsel {axis} invalid: band must be exactly two integers")
    low, high = band
    score = m["score"]
    if not (0 <= low <= score <= high <= 100):
        raise SystemExit(
            f"counsel {axis} invalid: band/score must satisfy 0<=low<=score<=high<=100 "
            f"(low={low}, score={score}, high={high})")
    if convened and not m.get("position_refs"):
        raise SystemExit(
            f"counsel invalid: room convened but {axis} position_refs is empty — "
            "every office must cite the room")
    if not convened and m.get("position_refs"):
        raise SystemExit(
            f"counsel {axis} invalid: position_refs cite a room that never met")
    dev = m["deviation"]
    if dev["declared"] and not dev["note"].strip():
        raise SystemExit(
            f"counsel {axis} invalid: a declared mandate deviation must carry a note")
    if not dev["declared"] and dev["note"].strip():
        raise SystemExit(
            f"counsel {axis} invalid: deviation note present but not declared — "
            "an undeclared deviation is a defect")


def assemble_counsel(members, convened):
    """MECHANICAL assembly — no model call. The cross-axis mean deliberately
    does not exist here: it is presentational, computed in the Experience
    layer only (operator decision 2026-07-21)."""
    note = ("convened; three axis offices read the full proceedings blind and "
            "projected the room" if convened else
            "skipped; degraded no-room mode — the counsel read screen, triage, "
            "and signals only (wide bands, confidence at most medium)")
    return {
        "room": {"convened": convened, "note": note},
        "members": members,
        "aggregation": {
            "per_axis_scores": {k: members[k]["score"] for k in
                                ("founder", "market", "idea_vs_market")},
            "cross_axis_note": (
                "Per-axis scores only. The cross-axis mean is presentational — "
                "computed in the Experience layer, never persisted in artifacts, "
                "never an input to any stage. The axes are never averaged here; "
                "disagreement is signal."),
        },
    }


def project_axes(counsel):
    """MECHANICAL projection of the counsel record into the legacy axes
    mapping shape (axes.schema.json) — the back-compat artifact the memo
    prompts, verify gate, and viewer already consume. Numeric market/ivm
    scores live only in counsel.json (the legacy shape has none)."""
    m = counsel["members"]

    def shared(mm):
        return {k: mm[k] for k in ("trend", "confidence", "evidence_refs",
                                   "position_refs", "room_effect", "notes")}

    return {
        "room": dict(counsel["room"]),
        "founder": {"score": m["founder"]["score"], "band": list(m["founder"]["band"]),
                    "cold_start": m["founder"]["cold_start"], **shared(m["founder"])},
        "market": {"rating": m["market"]["rating"], **shared(m["market"])},
        "idea_vs_market": {"verdict": m["idea_vs_market"]["verdict"],
                           **shared(m["idea_vs_market"])},
        "disagreement": disagreement_line(m),
    }


def disagreement_line(members):
    """Mechanical cross-office divergence statement for the projected axes
    artifact. Spread > DISAGREEMENT_SPREAD => stated plainly; else empty
    (genuine agreement)."""
    scores = {k: members[k]["score"] for k in ("founder", "market", "idea_vs_market")}
    spread = max(scores.values()) - min(scores.values())
    if spread <= DISAGREEMENT_SPREAD:
        return ""
    f, mk, ivm = members["founder"], members["market"], members["idea_vs_market"]
    return (f"Counsel offices diverge (spread {spread}): "
            f"founder {f['score']} {f['band']}, "
            f"market {mk['score']} {mk['band']} ({mk['rating']}), "
            f"idea-vs-market {ivm['score']} {ivm['band']} ({ivm['verdict']}). "
            "The axes are never averaged in artifacts — divergence is the signal.")


def validate_axes_postchecks(axes):
    """Code-side axes invariants structured outputs cannot express (closes bead
    vc-brain-xsj.17). Runs at the one seam after the axes call; fails with a
    SystemExit naming the violation.

    1. founder.band is exactly two ints ordered 0<=low<=score<=high<=100.
    2. When room.convened, EVERY axis carries at least one position_ref — a
       mapped score must cite the seat that moved it."""
    band = axes["founder"]["band"]
    if not (isinstance(band, list) and len(band) == 2
            and all(isinstance(b, int) and not isinstance(b, bool) for b in band)):
        raise SystemExit("axes invalid: founder.band must be exactly two integers")
    low, high = band
    score = axes["founder"]["score"]
    if not (0 <= low <= score <= high <= 100):
        raise SystemExit(
            "axes invalid: founder band/score must satisfy 0<=low<=score<=high<=100 "
            f"(low={low}, score={score}, high={high})")
    if axes["room"]["convened"]:
        for name in ("founder", "market", "idea_vs_market"):
            if not axes[name].get("position_refs"):
                raise SystemExit(
                    f"axes invalid: room convened but {name}.position_refs is empty — "
                    "every axis must cite the room")


def load_forum_bundle(forum_dir):
    """Reconstruct a forum bundle from a run dir for the standalone axes stage.
    forum-attendants.json present -> seeded seat ids; else forum-bull.md +
    forum-bear.md -> legacy 2-pole; else no forum ran (None)."""
    d = pathlib.Path(forum_dir)
    if (d / "forum-attendants.json").exists():
        attendants = load_json(d / "forum-attendants.json")["attendants"]
    elif (d / "forum-bull.md").exists() and (d / "forum-bear.md").exists():
        attendants = POLES
    else:
        return None
    pres, posts = {}, {}
    for a in attendants:
        pre_p, post_p = d / f"forum-{a['id']}.md", d / f"forum-post-{a['id']}.md"
        pres[a["id"]] = pre_p.read_text() if pre_p.exists() else ""
        posts[a["id"]] = post_p.read_text() if post_p.exists() else ""
    debate_p, adj_p = d / "forum-debate.md", d / "forum-adjudication.json"
    return {"attendants": attendants,
            "pre_interviews": pres,
            "transcript": debate_p.read_text() if debate_p.exists() else "",
            "post_interviews": posts,
            "adjudication": load_json(adj_p) if adj_p.exists() else None}


def stage_potential(founder, person_signals, thesis_obj=None):
    """Deep founder-potential read for one person (bead vc-brain-uid)."""
    text = fill(prompt_template("potential.md"), {
        "THESIS_JSON": jdump(thesis_obj) if thesis_obj is not None else "null",
        "FOUNDER_JSON": jdump(founder),
        "SIGNALS_JSON": jdump(person_signals),
    })
    result, _usage = call(text, schema("potential.schema.json"))
    ok, reason = escalate_gate(result.get("escalate") or {})
    if not ok:
        raise SystemExit(f"potential escalate invalid: {reason}")
    return result


# ------------------------------------------------------------ forum stages
# The forum structure: blind pre-interviews -> one moderated debate
# pressing the single crux -> post-interviews recording position evolution ->
# a typed adjudication block. Interviews and debates are markdown artifacts
# Only the adjudication is structured. No
# scores, no bands, no scoreboard — deliberation structure stays deliberation
# structure; the brief's documents are drafted AFTER, by the memo agents.


def interviews_block(attendants, texts_by_id):
    """Format per-attendant markdown interviews for a prompt slot."""
    parts = []
    for a in attendants:
        body = texts_by_id.get(a["id"], "*(not supplied — hand-staged partial run)*")
        parts.append(f"### {a['id']} — {a['handle']}\n\n{body}")
    return "\n\n".join(parts)


def validate_seed_postchecks(seeds, n):
    """Code-side seed invariant the schema cannot carry: the seat count is a
    runtime parameter (--seats), so "exactly N attendants" cannot live in a
    schema keyword. SystemExit names the violation (seed_count)."""
    got = len(seeds["attendants"])
    if got != n:
        raise SystemExit(
            f"forum seed invalid: seed_count — returned {got} attendants "
            f"for a {n}-seat room; mint exactly {n}")


def stage_forum_seed(thesis_json, decision, crux, sig, n, model=None):
    """Mint exactly N evidence-grounded attendants (seeded mode only).

    A seed_count violation (schema-valid JSON, wrong attendant count — seen
    live: the claude worker returned 6 for a 5-seat room, bead vc-brain-lbe)
    retries ONCE with the violation named, then dies loudly before any
    downstream stage spends tokens on a malformed room.
    """
    text = fill(prompt_template("forum/seed.md"), {
        "THESIS_JSON": thesis_json, "DECISION_JSON": jdump(decision),
        "CRUX": crux, "SIGNALS_JSON": sig, "N_SEATS": str(n),
    })
    seeds, _ = call(text, schema("forum-seed.schema.json"), max_tokens=8000, model=model)
    try:
        validate_seed_postchecks(seeds, n)
    except SystemExit as err:
        print(f"[  retry ] forum-seed: postcheck failure, one retry ({err})",
              file=sys.stderr)
        retry_text = (text + "\n\n## Previous attempt rejected\n\n"
                      + f"{err}\n\nCorrect this and return ONLY a valid "
                      "JSON object per the schema.")
        seeds, _ = call(retry_text, schema("forum-seed.schema.json"),
                        max_tokens=8000, model=model)
        validate_seed_postchecks(seeds, n)
    return seeds


def stage_forum_pre(thesis_json, decision, crux, sig, attendant, model=None):
    """One attendant's blind pre-interview. Markdown out."""
    text = fill(prompt_template("forum/pre-interview.md"), {
        "THESIS_JSON": thesis_json, "DECISION_JSON": jdump(decision), "CRUX": crux,
        "SIGNALS_JSON": sig, "ATTENDANT_JSON": jdump(attendant),
        "ATTENDANT_HANDLE": attendant["handle"],
    })
    result, _ = call(text, max_tokens=8000, model=model)
    return result


def stage_forum_debate(thesis_json, decision, crux, sig, attendants, pres, model=None):
    """One moderated debate pressing the single crux. Markdown out."""
    text = fill(prompt_template("forum/debate.md"), {
        "THESIS_JSON": thesis_json, "DECISION_JSON": jdump(decision), "CRUX": crux,
        "SIGNALS_JSON": sig, "ATTENDANTS_JSON": jdump(attendants),
        "PRE_INTERVIEWS": interviews_block(attendants, pres),
    })
    result, _ = call(text, max_tokens=16000, model=model)
    return result


def stage_forum_post(thesis_json, decision, crux, attendant, pre_md, transcript, model=None):
    """One attendant's independent post-interview: held/refined/conceded with
    turn citations, plus its standing decisive test. Markdown out."""
    text = fill(prompt_template("forum/post-interview.md"), {
        "THESIS_JSON": thesis_json, "DECISION_JSON": jdump(decision), "CRUX": crux,
        "ATTENDANT_JSON": jdump(attendant), "PRE_INTERVIEW": pre_md,
        "TRANSCRIPT": transcript, "ATTENDANT_HANDLE": attendant["handle"],
    })
    result, _ = call(text, max_tokens=8000, model=model)
    return result


def stage_forum_adjudicate(thesis_json, decision, attendants, pres, transcript, posts, model=None):
    """The typed adjudication block — the forum's only structured artifact."""
    text = fill(prompt_template("forum/adjudication.md"), {
        "THESIS_JSON": thesis_json, "DECISION_JSON": jdump(decision),
        "ATTENDANTS_JSON": jdump(attendants),
        "PRE_INTERVIEWS": interviews_block(attendants, pres),
        "TRANSCRIPT": transcript,
        "POST_INTERVIEWS": interviews_block(attendants, posts),
    })
    result, _ = call(text, schema("adjudication.schema.json"), model=model)
    return result


def run_forum(thesis_json, decision, crux, sig, timed, outdir, mode="2-pole",
              seats=5, model=None, label="forum"):
    """One full fixed-structure forum firing. Returns the full bundle:
    {attendants, pre_interviews, transcript, post_interviews, adjudication} —
    the populated reference space the axes mapping projects into dimensions.
    The adjudication is what gets robustness-tagged and written to
    forum-adjudication.json.

    mode "2-pole": attendants are the built-in bull/bear poles (the pilot
    shape). mode "seeded": a seed stage mints N distinct evidence-grounded
    attendants first. Every fan-out is one timed stage = the wall-clock of
    its slowest concurrent interview.
    """
    outdir = pathlib.Path(outdir)
    if mode == "seeded":
        n = max(3, min(7, seats))
        seeds = timed(f"{label}:seed",
                      lambda: stage_forum_seed(thesis_json, decision, crux, sig, n, model=model))
        write_out(outdir / "forum-attendants.json", seeds)
        attendants = seeds["attendants"]
    else:
        attendants = POLES

    pres_list = timed(f"{label}:pre-interviews",     # blind => independent => one fan-out
                      lambda: parallel(lambda a: stage_forum_pre(
                          thesis_json, decision, crux, sig, a, model=model), attendants))
    pres = {a["id"]: t for a, t in zip(attendants, pres_list)}
    for a in attendants:
        write_out(outdir / f"forum-{a['id']}.md", pres[a["id"]])

    transcript = timed(f"{label}:debate",
                       lambda: stage_forum_debate(thesis_json, decision, crux, sig,
                                                  attendants, pres, model=model))
    write_out(outdir / "forum-debate.md", transcript)

    posts_list = timed(f"{label}:post-interviews",   # sees transcript + own pre only
                       lambda: parallel(lambda a: stage_forum_post(
                           thesis_json, decision, crux, a, pres[a["id"]], transcript,
                           model=model), attendants))
    posts = {a["id"]: t for a, t in zip(attendants, posts_list)}
    for a in attendants:
        write_out(outdir / f"forum-post-{a['id']}.md", posts[a["id"]])

    adjudication = timed(f"{label}:adjudicate",
                         lambda: stage_forum_adjudicate(thesis_json, decision, attendants,
                                                        pres, transcript, posts, model=model))
    write_out(outdir / "forum-adjudication.json", adjudication)
    return {"attendants": attendants, "pre_interviews": pres, "transcript": transcript,
            "post_interviews": posts, "adjudication": adjudication}


def run_forum_with_meta(thesis_json, decision, crux, sig, timed, outdir, mode,
                        seats, robustness=False, robust_model=ROBUST_MODEL):
    """The forum firing plus its honest cost record, and the optional F3
    replication: the same debate re-run with attendants on a second model
    family. A flipped outcome demotes the convergence claim (tagged in the
    primary adjudication's authority_note) — confidence drops, authority
    stays agent-derived. Returns the full forum bundle (see run_forum)."""
    outdir = pathlib.Path(outdir)
    before, t0 = tokens_snapshot(), time.monotonic()
    bundle = run_forum(thesis_json, decision, crux, sig, timed, outdir,
                       mode=mode, seats=seats)
    adjudication = bundle["adjudication"]

    if robustness:
        bundle_b = run_forum(thesis_json, decision, crux, sig, timed,
                             outdir / "forum-modelb", mode=mode, seats=seats,
                             model=robust_model, label="forum:modelB")
        adj_b = bundle_b["adjudication"]
        flip = adjudication["outcome"] != adj_b["outcome"]
        rob = {"model_a": MODEL, "model_b": robust_model,
               "outcome_a": adjudication["outcome"], "outcome_b": adj_b["outcome"],
               "convergence_flip": flip,
               "note": ("F3: the debate replicated with attendants on a second model "
                        "family. The two records sit side by side, never merged. A "
                        "flipped outcome demotes the convergence claim — converged "
                        "actions become model-flavor-suspect; confidence drops, "
                        "authority stays agent-derived.")}
        write_out(outdir / "forum-robustness.json", rob)
        if flip:
            adjudication["authority_note"] += (
                " model-flavor-suspect: the outcome flipped on second-model "
                "replication (see forum-robustness.json); weigh converged actions "
                "accordingly.")
            write_out(outdir / "forum-adjudication.json", adjudication)

    meta = {"mode": mode, "model": worker_model(), "worker": WORKER,
            "attendants": 2 if mode == "2-pole" else max(3, min(7, seats)),
            "debates": 1,
            "tokens": tokens_delta(before) if WORKER == "api" else None,
            "seconds": round(time.monotonic() - t0, 1)}
    write_out(outdir / "forum-meta.json", meta)
    return bundle


# ---------------------------------------------------- memo document dispatch
# Only after the forum: one agent per document the judges' brief specifies
# (Appendix 1), each given the forum results and the ingredients. Code — not
# a model — assembles the claims ledger and rewrites inline refs; a final
# decision agent consumes the forum's Instruments as decision conditions.

DOCS = [
    ("snapshot", "Company snapshot",
     "One-paragraph “in a nutshell”: market size, the structural problem, why "
     "it's urgent, and how the product solves it. Required by the brief."),
    ("hypotheses", "Investment hypotheses",
     "The explicit “why we want to invest” bullets — team quality, market "
     "wedge, stickiness / retention mechanics, traction signal, defensibility, "
     "expansion path. Required by the brief."),
    ("swot", "SWOT",
     "Strengths, weaknesses, opportunities, risks — each as short, "
     "evidence-backed bullets. Required by the brief."),
    ("problem_product", "Problem & product",
     "The core problem(s) in plain language, then the step-by-step product / "
     "process solving it. Required by the brief."),
    ("traction", "Traction & KPIs",
     "Customer count, ARR / revenue, growth trajectory, unit economics (CAC, "
     "sales cycle, churn), usage metrics (e.g. DAU). Metrics the record cannot "
     "support are gaps, never estimates presented as data. Required by the brief."),
    ("team_history", "Team & history",
     "Founder background, exec team pedigree, why the fund is comfortable with "
     "any red flags (e.g. single-founder), company timeline from founding to today."),
    ("technology_defensibility", "Technology & defensibility",
     "What's proprietary vs commoditizable, the data moat, model / architecture "
     "choices, why the advantage compounds over time."),
    ("market_sizing", "Market sizing",
     "Top-down and / or bottom-up TAM / SAM / SOM, with the assumptions stated "
     "explicitly."),
    ("competition", "Competition",
     "Named competitor clusters, how each differs from the company, and who "
     "could become a threat later."),
]

_REF = re.compile(r"\[C(\d+)\]")
_PROV = re.compile(r"\[prov: (C\d+) / \S+ / \S+\]")


def stage_memo_doc(thesis_json, application_json, sig, triage_json, axes, adjudication,
                   key, title, spec):
    text = fill(prompt_template("memo/section.md"), {
        "DOC_TITLE": title, "DOC_SPEC": spec,
        "THESIS_JSON": thesis_json, "APPLICATION_JSON": application_json,
        "SIGNALS_JSON": sig, "TRIAGE_JSON": triage_json, "AXES_JSON": jdump(axes),
        "ADJUDICATION_JSON": jdump(adjudication) if adjudication else "null",
    })
    result, _ = call(text, schema("memo-section.schema.json"), max_tokens=8000)
    return result


def assemble_memo(docs_by_key):
    """MECHANICAL assembly — no model call. Claims get global ids C1..Cn in
    document order; inline [C#] refs are rewritten (descending, so a produced
    id is never re-matched); ref integrity is linted, not silently repaired."""
    sections, claims, gaps = {}, [], []
    for key, _title, _spec in DOCS:
        doc = docs_by_key[key]
        body, local = doc["body_md"], doc["claims"]
        base = len(claims)
        for i in range(len(local), 0, -1):
            body = body.replace(f"[C{i}]", f"[C{base + i}]")
        sections[key] = body
        for i, c in enumerate(local, 1):
            claims.append({"id": f"C{base + i}", "section": key, **c})
        gaps += doc["gaps"]
        for n in {int(m) for m in _REF.findall(doc["body_md"])}:
            if n < 1 or n > len(local):
                print(f"[   lint ] {key}: inline ref [C{n}] has no local claim "
                      f"(document has {len(local)})", file=sys.stderr)
    return sections, claims, gaps


def lint_provenance(provenance, claims):
    ids = {c["id"] for c in claims}
    for line in provenance:
        m = _PROV.match(line)
        if not m:
            print(f"[   lint ] provenance line not machine-countable: {line}", file=sys.stderr)
        elif m.group(1) not in ids:
            print(f"[   lint ] provenance cites unknown claim {m.group(1)}: {line}", file=sys.stderr)


def run_memo_dispatch(args, triage, axes, adjudication, timed, docs_dir=None,
                      counsel=None):
    """Dispatch one agent per brief document (parallel), assemble mechanically,
    then the decision agent. triage's routed checks feed diligence open items,
    and — when the adjudication is null (no room) — the decision conditions
    fall back to them. The counsel record (when present) hands the decision
    agent the offices' coverage challenges and open questions as raw material
    for conditions and diligence items. Returns the full memo object,
    validated."""
    thesis_json = jdump(load_thesis(args.thesis))
    application_json = jdump(load_application(args.application))
    sig = signals_or_empty(args)
    triage_json = jdump(triage)

    docs_list = timed("memo:documents",              # independent => one fan-out
                      lambda: parallel(lambda d: stage_memo_doc(
                          thesis_json, application_json, sig, triage_json, axes,
                          adjudication, *d), DOCS))
    docs_by_key = {d[0]: doc for d, doc in zip(DOCS, docs_list)}
    if docs_dir:
        for key, doc in docs_by_key.items():
            write_out(pathlib.Path(docs_dir) / f"{key}.json", doc)

    sections, claims, gaps = assemble_memo(docs_by_key)
    assembled = {"sections": sections, "claims": claims, "gaps": gaps}

    text = fill(prompt_template("memo/decision.md"), {
        "THESIS_JSON": thesis_json, "APPLICATION_JSON": application_json,
        "TRIAGE_JSON": triage_json, "AXES_JSON": jdump(axes),
        "COUNSEL_JSON": jdump(counsel) if counsel else "null",
        "ADJUDICATION_JSON": jdump(adjudication) if adjudication else "null",
        "ASSEMBLED_JSON": jdump(assembled),
    })
    head = timed("memo:decision",
                 lambda: call(text, schema("memo-decision.schema.json"), max_tokens=8000)[0])

    memo = {"company": head["company"], "sections": sections, "claims": claims,
            "gaps": gaps, "diligence_log": head["diligence_log"],
            "decision": head["decision"], "provenance": head["provenance"]}
    _require_keys(memo, schema("memo.schema.json"), "memo")   # code-assembled => self-validate
    lint_provenance(memo["provenance"], claims)
    return memo


# ---------------------------------------------------------------- pipeline


def cmd_pipeline(args):
    outdir = pathlib.Path(args.out or "out/run")
    latency = {"model": worker_model(), "worker": WORKER,
               "stages": [], "started_at": now_iso()}
    t0 = time.monotonic()
    timed = make_timed(latency)
    # Write-fence (bead vc-brain-j3n): snapshot intelligence/out/ and assert after
    # every artifact-writing stage that nothing changed outside the active -o dir.
    # Dispatched workers (cursor-agent) already run in a temp cwd; this is the
    # post-stage detection that covers ALL backends and every stage below.
    out_root = ROOT / "out"
    out_snap = snapshot_out_files(out_root)
    # VCBRAIN_PIPELINE_FENCE=off disables the per-stage tree-wide check: the
    # snapshot fence assumes THIS run owns intelligence/out/, which is false
    # when other sessions write there concurrently (observed 2026-07-21: a
    # neighbor's stage run aborted a farm app as phantom contamination). The
    # farm harness sets this when its own fence is scoped to the batch root —
    # cross-run protection then lives at that layer instead.
    fence_off = os.environ.get("VCBRAIN_PIPELINE_FENCE", "").lower() == "off"

    def check_out_contamination(stage):
        nonlocal out_snap
        if fence_off:
            return
        after = snapshot_out_files(out_root)
        assert_out_uncontaminated(out_snap, after, outdir, out_root)
        out_snap = after

    thesis_json = jdump(load_thesis(args.thesis))    # validate once, fail fast, thread everywhere

    screen = timed("screen", lambda: stage_screen(args))
    write_out(outdir / "screen.json", screen)
    check_out_contamination("screen")

    triage = timed("triage", lambda: stage_triage(args, screen))
    write_out(outdir / "triage.json", triage)
    check_out_contamination("triage")

    # The forum builds the reference space BEFORE scoring — persons first,
    # abstractions on top. It is skipped only on a reject screen or a blank crux.
    forum_bundle = None
    fire_ok, gate_reason = forum_gate(screen, triage)
    if fire_ok:
        crux = triage["crux"]
        decision = {"application": load_application(args.application), "screen": screen, "triage": triage}
        sig = signals_or_empty(args)
        forum_bundle = run_forum_with_meta(
            thesis_json, decision, crux, sig, timed, outdir,
            mode=args.forum_mode, seats=args.seats,
            robustness=args.robustness, robust_model=args.robustness_model)
    else:
        print(f"[   skip ] forum ({gate_reason})", file=sys.stderr)
    check_out_contamination("forum")

    # The counsel sits AFTER the forum: three blind axis offices read the full
    # proceedings and project the room. axes.json is the mechanical legacy
    # projection of counsel.json.
    counsel, axes = timed("counsel:members",
                          lambda: stage_counsel(args, screen, triage, forum_bundle))
    write_out(outdir / "counsel.json", counsel)
    write_out(outdir / "axes.json", axes)
    check_out_contamination("counsel")

    # Only after the forum: the dispatched document agents, then the decision.
    adjudication = forum_bundle["adjudication"] if forum_bundle else None
    memo = run_memo_dispatch(args, triage, axes, adjudication, timed,
                             docs_dir=outdir / "memo-docs", counsel=counsel)
    write_out(outdir / "memo.json", memo)
    check_out_contamination("memo")

    latency["total_seconds"] = round(time.monotonic() - t0, 1)
    latency["finished_at"] = now_iso()
    latency["decision"] = memo["decision"]["recommendation"]
    if WORKER == "api":
        latency["tokens"] = tokens_snapshot()
    write_out(outdir / "latency.json", latency)
    check_out_contamination("latency")
    print(f"\nfirst-signal -> decision: {latency['total_seconds']}s "
          f"({memo['decision']['recommendation']})", file=sys.stderr)


def cmd_forum(args):
    """Standalone fixed-structure forum over a prebuilt decision object — the
    forum at its own granularity, matching the per-stage subcommands."""
    outdir = pathlib.Path(args.out or "out/forum")
    latency = {"model": worker_model(), "worker": WORKER,
               "stages": [], "started_at": now_iso()}
    t0 = time.monotonic()
    timed = make_timed(latency)
    decision = load_json(args.decision)
    thesis_json = jdump(load_thesis(args.thesis)) if args.thesis else "null"
    sig = jdump(load_json(args.signals)) if args.signals else "[]"
    run_forum_with_meta(thesis_json, decision, args.crux, sig, timed, outdir,
                        mode=args.mode, seats=args.seats,
                        robustness=args.robustness, robust_model=args.robustness_model)
    latency["total_seconds"] = round(time.monotonic() - t0, 1)
    latency["finished_at"] = now_iso()
    write_out(outdir / "latency.json", latency)


def cmd_potential(args):
    """Standalone founder-potential deep read (bead vc-brain-uid)."""
    founder = resolve_founder(args.founder, args.founders)
    all_signals = load_json(args.signals)
    person_signals = signals_for_founder(founder, all_signals)
    slug = founder_slug(founder)
    outdir = pathlib.Path(args.out or f"out/potential-{slug}")
    latency = {"model": worker_model(), "worker": WORKER,
               "stages": [], "started_at": now_iso(),
               "founder_id": founder.get("id"), "signal_count": len(person_signals)}
    t0 = time.monotonic()
    timed = make_timed(latency)
    # Write-fence (bead vc-brain-j3n), extended to cmd_potential per step 3: a
    # deep per-person read dispatches the same worker backend, so the same
    # post-write contamination assert guards its writes.
    out_root = ROOT / "out"
    out_snap = snapshot_out_files(out_root)

    def check_out_contamination():
        nonlocal out_snap
        after = snapshot_out_files(out_root)
        assert_out_uncontaminated(out_snap, after, outdir, out_root)
        out_snap = after

    thesis_obj = load_thesis(args.thesis) if args.thesis else None
    result = timed("potential",
                   lambda: stage_potential(founder, person_signals, thesis_obj))
    write_out(outdir / "potential.json", result)
    check_out_contamination()
    latency["total_seconds"] = round(time.monotonic() - t0, 1)
    latency["finished_at"] = now_iso()
    if WORKER == "api":
        latency["tokens"] = tokens_snapshot()
    write_out(outdir / "latency.json", latency)
    check_out_contamination()
    return result


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def pole(pid):
    return next(p for p in POLES if p["id"] == pid)


# --------------------------------------------------------------------- cli


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--worker", choices=["api", "cursor", "claude"],
                   default=os.environ.get("VCBRAIN_WORKER", "api"),
                   help="api: Anthropic SDK (needs ANTHROPIC_API_KEY). "
                        "cursor: dispatch stages as cursor-agent workers (local auth). "
                        "claude: headless Claude Code CLI on the operator's "
                        "subscription (needs a one-time `claude /login`). "
                        "Goes BEFORE the subcommand.")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, *fields):
        if "application" in fields:
            sp.add_argument("--application", required=True)
        if "thesis" in fields:
            sp.add_argument("--thesis", required=True)
        if "signals" in fields:
            sp.add_argument("--signals")
        sp.add_argument("-o", "--out")

    def forum_flags(sp):
        sp.add_argument("--seats", type=int, default=5,
                        help="seeded-mode attendants, clamped 3-7")
        sp.add_argument("--robustness", action="store_true",
                        help="F3: replicate the debate on a second model family; a flipped "
                             "outcome tags the convergence model-flavor-suspect. api backend only.")
        sp.add_argument("--robustness-model", default=ROBUST_MODEL)

    sp = sub.add_parser("screen")
    common(sp, "application", "thesis", "signals")

    sp = sub.add_parser("triage")
    common(sp, "application", "thesis", "signals")
    sp.add_argument("--screen", required=True)

    def counsel_flags(sp):
        common(sp, "application", "thesis", "signals")
        sp.add_argument("--screen", required=True)
        sp.add_argument("--triage", required=True)
        sp.add_argument("--forum-dir",
                        help="a run dir to load the forum bundle from: forum-attendants.json "
                             "-> seeded ids, else forum-bull.md/forum-bear.md -> legacy poles, "
                             "else no forum. Omit for degraded no-room mapping.")

    sp = sub.add_parser("counsel",
                        help="The standing tribunal: three blind axis offices over the room. "
                             "Prints/writes the full counsel record.")
    counsel_flags(sp)

    sp = sub.add_parser("axes",
                        help="Deprecated alias: runs the counsel sitting and returns the "
                             "legacy axes projection of it.")
    counsel_flags(sp)

    sp = sub.add_parser("memo")
    common(sp, "application", "thesis", "signals")
    sp.add_argument("--triage", required=True)
    sp.add_argument("--axes", required=True)
    sp.add_argument("--counsel",
                    help="counsel.json from a run — hands the decision agent the offices' "
                         "coverage challenges and open questions")
    sp.add_argument("--adjudication")

    sp = sub.add_parser("interview")
    sp.add_argument("--pole", choices=["bull", "bear"], required=True)
    sp.add_argument("--decision", required=True)
    sp.add_argument("--crux", required=True)
    sp.add_argument("--thesis")            # optional; injected as "null" when absent
    sp.add_argument("--signals")
    sp.add_argument("-o", "--out")

    sp = sub.add_parser("debate")
    sp.add_argument("--decision", required=True)
    sp.add_argument("--crux", required=True)
    sp.add_argument("--bull", required=True)
    sp.add_argument("--bear", required=True)
    sp.add_argument("--thesis")            # optional; injected as "null" when absent
    sp.add_argument("--signals")
    sp.add_argument("-o", "--out")

    sp = sub.add_parser("adjudicate")
    sp.add_argument("--decision", required=True)
    sp.add_argument("--bull", required=True)
    sp.add_argument("--bear", required=True)
    sp.add_argument("--transcript", required=True)
    sp.add_argument("--post-bull", help="bull post-interview markdown (forum structure; optional for hand-staged runs)")
    sp.add_argument("--post-bear", help="bear post-interview markdown (forum structure; optional for hand-staged runs)")
    sp.add_argument("--thesis")            # optional; injected as "null" when absent
    sp.add_argument("-o", "--out")

    sp = sub.add_parser("gate")
    sp.add_argument("--application", required=True)
    sp.add_argument("-o", "--out")

    sp = sub.add_parser("pipeline")
    common(sp, "application", "thesis", "signals")
    sp.add_argument("--forum-mode", choices=["2-pole", "seeded"], default="seeded",
                    help="seeded (default): a seed stage invites N real named voices — "
                         "persons are the foundation; abstract stances only layer on top. "
                         "2-pole: legacy abstract bull/bear poles, the pilot shape.")
    forum_flags(sp)

    sp = sub.add_parser("forum")
    sp.add_argument("--decision", required=True)
    sp.add_argument("--crux", required=True)
    sp.add_argument("--mode", choices=["2-pole", "seeded"], default="seeded")
    sp.add_argument("--thesis")            # optional; injected as "null" when absent
    sp.add_argument("--signals")
    forum_flags(sp)
    sp.add_argument("-o", "--out")

    sp = sub.add_parser("potential",
                        help="Deep founder-potential read for one person from their signals")
    sp.add_argument("--founder", required=True,
                    help="Founder id / name / alias, or path to a single-founder JSON file")
    sp.add_argument("--signals", required=True,
                    help="Signals JSON array (e.g. ../memory/signals.json)")
    sp.add_argument("--founders",
                    help="Founders JSON array for id lookup (default: ../memory/founders.json)")
    sp.add_argument("--thesis",
                    help="Optional fund thesis JSON — injected as lens when present")
    sp.add_argument("-o", "--out",
                    help="Output directory (default: out/potential-<slug>); writes potential.json")

    args = p.parse_args()

    global WORKER
    WORKER = args.worker

    if args.cmd == "gate":
        # Verdict-only entry: no model, no key. Exit 0 pass / 2 refuse, so
        # batch sourcing can gate thousands of records without a crash-per-item.
        report = gate_application(load_json(args.application))
        if args.out:
            write_out(args.out, report)
        else:
            print(jdump(report))
        sys.exit(0 if report["verdict"] == "pass" else 2)

    if args.cmd == "pipeline":
        cmd_pipeline(args)
        return

    if args.cmd == "forum":
        cmd_forum(args)
        return

    if args.cmd == "potential":
        cmd_potential(args)
        return

    if args.cmd == "screen":
        result = stage_screen(args)
    elif args.cmd == "triage":
        result = stage_triage(args, load_json(args.screen))
    elif args.cmd in ("counsel", "axes"):
        forum_bundle = load_forum_bundle(args.forum_dir) if args.forum_dir else None
        counsel, axes = stage_counsel(args, load_json(args.screen),
                                      load_json(args.triage), forum_bundle)
        result = counsel if args.cmd == "counsel" else axes
    elif args.cmd == "memo":
        adj = load_json(args.adjudication) if args.adjudication else None
        latency = {"model": worker_model(), "worker": WORKER, "stages": []}
        result = run_memo_dispatch(args, load_json(args.triage), load_json(args.axes),
                                   adj, make_timed(latency),
                                   counsel=load_json(args.counsel) if args.counsel else None)
    elif args.cmd == "interview":
        thesis_json = jdump(load_thesis(args.thesis)) if args.thesis else "null"
        result = stage_forum_pre(thesis_json, load_json(args.decision), args.crux,
                                 jdump(load_json(args.signals)) if args.signals else "[]",
                                 pole(args.pole))
    elif args.cmd == "debate":
        thesis_json = jdump(load_thesis(args.thesis)) if args.thesis else "null"
        result = stage_forum_debate(thesis_json, load_json(args.decision), args.crux,
                                    jdump(load_json(args.signals)) if args.signals else "[]",
                                    POLES,
                                    {"bull": load_text(args.bull), "bear": load_text(args.bear)})
    elif args.cmd == "adjudicate":
        thesis_json = jdump(load_thesis(args.thesis)) if args.thesis else "null"
        posts = {}
        if args.post_bull:
            posts["bull"] = load_text(args.post_bull)
        if args.post_bear:
            posts["bear"] = load_text(args.post_bear)
        result = stage_forum_adjudicate(thesis_json, load_json(args.decision), POLES,
                                        {"bull": load_text(args.bull), "bear": load_text(args.bear)},
                                        load_text(args.transcript), posts)

    if args.out:
        write_out(args.out, result)
    else:
        print(result if isinstance(result, str) else jdump(result))


if __name__ == "__main__":
    main()
