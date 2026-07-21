#!/usr/bin/env sh
# Clean-room commit guard — see docs/CLEAN-ROOM.md (Enforcement).
# Inspects STAGED content only; exits non-zero to block the commit.

fail=0

for f in $(git diff --cached --name-only --diff-filter=ACM); do
  # The guard and the discipline doc name the marker literally; skip them.
  case "$f" in
    scripts/cleanroom-check.sh|docs/CLEAN-ROOM.md) continue ;;
  esac

  case "$f" in
    research/competitor-review/*)
      # Reviews describe archive code; they never carry code blocks.
      n=$(git show ":$f" 2>/dev/null | grep -c '^```')
      if [ "${n:-0}" -ge 2 ]; then
        echo "clean-room: $f stages a fenced code block — reviews describe and cite, they don't transcribe (docs/CLEAN-ROOM.md)" >&2
        fail=1
      fi
      ;;
  esac

  if git show ":$f" 2>/dev/null | grep -q 'DO-NOT-COMMIT'; then
    echo "clean-room: $f carries a DO-NOT-COMMIT marker" >&2
    fail=1
  fi
done

exit $fail
