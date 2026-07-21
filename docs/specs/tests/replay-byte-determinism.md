# Spec: replay byte-determinism and hash-seed invariance

**Status:** spec-ready · **Effort:** S · **Seam:** replay harness + deterministic assembly/gate code
**Provenance:** PYTHONHASHSEED subprocess sweeps (seeds 0/1/12345 vs an in-process
reference), byte-identical replay checks, and retry-identity contrasts are patterns
observed during a survey of other Hack-Nation submissions; behavior re-specified from
scratch (see docs/CLEAN-ROOM.md). Adoption-room verdicts SPIKE-FIRST
(`ci-gated-byte-identical-replay`, `cross-run-determinism-idempotence`) — merged here
because they share one seam and one fixture set; session-ledger linkage is pending (no
ledger row cites this spec or either verdict slug yet).

## Why (vc-brain terms)

Our replay suite proves the pipeline *runs* offline; it never asserts the run is
*deterministic*. Everything outside the model seam claims to be mechanical — assembly
(`assemble_memo`, run.py:1235, 2026-07-21), the gates, `intelligence/sourcing.py`, the corpus build
(`experience/build-corpus.py`) — but dict-iteration order, set ordering, or an
accidental timestamp can silently make two identical replays differ, which would poison
tape diffing, the detection-delta harness's caught/miss comparisons, and any future
CI gate. The contract: **same inputs → byte-identical artifacts**, proven across
processes and hash seeds, with the nondeterministic fields enumerated rather than
hand-waved.

## Behavioral contract

1. **Timestamp inventory.** A committed list (named constant in the test module) of
   every artifact field that is *legitimately* run-dependent. Known today:
   `latency.json` (top-level `started_at`, `finished_at`, `total_seconds` — there is no
   top-level `seconds` — plus `tokens` when `VCBRAIN_WORKER=api`, the default
   (run.py:1386-1387, 2026-07-21; deterministic under the canned model but enumerate it),
   and per-stage `seconds` in `stages[]`),
   `forum-meta.json` `seconds`/`tokens`, signal `ingested_at` when the builder stamps
   build-date. The determinism assertions compare artifacts after masking exactly these
   fields — a new unlisted differing field is a FAILURE (that is the point).
2. **Double-replay byte identity.** Drive the full canned pipeline
   (`test_pipeline_replay.py` harness, contested seeded path) twice into two temp
   outdirs; every written artifact must be byte-identical after masking (1). Masking
   procedure — spelled out because the inventory fields cannot be blanked without
   parsing: for each JSON artifact, `json.loads` it, overwrite *exactly* the inventory
   fields (1) with a constant sentinel (every other key left untouched and in its
   original position), then re-serialize with the *same* serializer `write_out` uses —
   `jdump` = `json.dumps(obj, indent=2, ensure_ascii=False)` with **no** `sort_keys`
   (run.py:145, applied at run.py:461, 2026-07-21) — and compare the resulting BYTES.
   Do NOT collapse this to `json.loads(a) == json.loads(b)`: that ignores key order and
   defeats the whole point of the test. Because `json.dumps` emits keys in insertion
   order, key-order drift in any *unmasked* field still surfaces as a byte difference —
   which is exactly what we want to catch. (A non-JSON artifact, or one carrying no
   inventory field, is compared as raw bytes with no round-trip.)
3. **Cross-process hash-seed sweep.** Run the deterministic subset — the sourcing gate
   over a *test-constructed* fixture repo set (no sourcing fixture is committed — only
   `application-ferrite.json` and `signals-ferrite.json` — and the real archive lives
   outside the repo, so build temp dirs holding a `README.md` above
   `THIN_MIN_README_WORDS`=120 plus ≥`THIN_MIN_CODE_FILES`=5 code files over
   `THIN_MIN_CODE_LINES`=200 lines, with an optional `<owner>__<repo>.json` meta, and
   call `assess_repo(repo_dir, meta, archive_label)` (sourcing.py:178, 2026-07-21)
   directly rather than reconstructing `cmd_gate`'s `work/`+`meta/` archive layout — note
   `commit_count` returns `None` off a git repo (sourcing.py:134), so the
   `THIN_MIN_COMMITS` check is skipped there), `assemble_memo` over canned docs, the
   adoption-forum builder
   (`intelligence/scripts/build_test_adoption_forums.py`, build step only) — in
   subprocesses with `PYTHONHASHSEED` 0, 1, and 12345; outputs must equal the
   in-process reference byte-for-byte. (Python sets/dicts make this the strongest
   cheap nondeterminism probe.)
4. **Retry-identity contrast.** Two replay runs with different out-dir names must
   differ ONLY in self-referential path strings (if any artifact embeds its own path,
   list it in the inventory with a mask rule; if none do, assert none do).

## Acceptance criteria (planted faults — all MUST be demonstrated)

- Planted fault A — dict-order leak: iterate a `set()` of hash-randomized elements
  (strings — `PYTHONHASHSEED` only reorders `str`/`bytes`/`datetime`, so a set of
  ints/floats would iterate value-stable and pass vacuously) when writing one artifact
  list in a copy of the assembly path. Do NOT lean on the memo's own `C1`..`Cn` claim
  ids as the set: that id set is small — on the order of the nine `DOCS` entries
  (run.py:1187, 2026-07-21) — and a set of only ~9 short strings does not *reliably*
  reorder across seeds, so the fault could pass vacuously on a given run. Plant a large
  set instead (≥ ~50 distinct hash-randomized strings) so at least one seed reorders
  with high probability, AND assert the failure by comparing the three fixed-seed
  children {0, 1, 12345} against EACH OTHER — not only against the unpinned in-process
  reference — enlarging the planted set further if a run shows no reordering. The
  hash-seed sweep MUST then fail on at least one seed (or seed pairing).
- Planted fault B — timestamp leak: add a *per-run-unique* field (`time.time_ns()`,
  `time.monotonic()`, or `uuid4()`) to a masked-exempt artifact in a copy; double-replay
  identity MUST fail naming the artifact and field. Do NOT use `now_iso()` for the
  planted value: it returns `isoformat(timespec="seconds")` (run.py:1449-1450,
  2026-07-21), so two fast back-to-back replays land in the same wall-clock second and
  produce an identical timestamp — the fault would silently pass. (If a wall-clock field
  is nonetheless required, enforce a >1s gap between the two replays.)
- Mask discipline: adding the leaked field to the inventory makes it pass again —
  demonstrating the inventory is load-bearing, then remove both.
- Runtime bound: the full determinism module completes in under ~2 minutes on the
  repo's suite baseline (the replay harness is fast; three subprocess sweeps are the
  cost — keep the deterministic-subset fixtures small).

## Non-goals

- No CI workflow file (the ledger's CI question is a separate operator decision; this
  spec makes the assertion exist and run under `unittest discover`).
- No determinism claims about live model output (out of scope by definition).
- No masking framework beyond the field list — if the inventory grows past ~a dozen
  entries, that is a design smell to surface, not accommodate.

## Integration points

- New: `intelligence/tests/test_determinism.py`, reusing `CannedModel` and `_Replay`
  from `test_pipeline_replay.py`; subprocess entry points via `sys.executable -c` or a
  tiny `if __name__ == "__main__"` hook in the test module itself.

If this spec is not implementable from its own text plus the repo, file a spec bug in
your PR description; do not look anywhere else.
