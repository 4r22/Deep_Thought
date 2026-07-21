# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

## Issue tracking

This project uses **bd (beads)** for issue tracking. Run `bd prime` for workflow
context and commands (`bd ready`, `bd show <id>`, `bd update <id> --claim`,
`bd close <id>`).

## Research discipline

Research uses read-only external archives under clean-room discipline; see
`docs/CLEAN-ROOM.md`.

## Build & Test

```bash
# Intelligence pipeline tests
cd intelligence && python3 -m unittest discover -s tests

# Run the pipeline on the fictional demo fixture
cd intelligence && ./run.py --help
```

## Architecture Overview

Three layers — Memory, Intelligence, Experience — with three JSON schemas
(Founder, Signal, Memo) as the only contract between them. See `README.md`
and `docs/COUNSEL.md`.
