#!/usr/bin/env bash
# Builds nishfmt: `bash build.sh [out]`, by default to dist/nishfmt. The
# compiler is $NISH, else the pinned one in .nish/ (scripts/fetch-nish.sh),
# else nish on PATH. The compiler's log goes to <out>.log; on an error its
# lines are printed and the build fails.
set -euo pipefail
cd "$(dirname "$0")"
if [ -z "${NISH:-}" ]; then
  if [ -x .nish/bin/nish ]; then NISH=.nish/bin/nish; else NISH=nish; fi
fi
out=${1:-dist/nishfmt}
mkdir -p "$(dirname "$out")"
if ! command -v "$NISH" >/dev/null 2>&1; then
  echo "build.sh: no nish compiler; run scripts/fetch-nish.sh or set NISH" >&2
  exit 1
fi
# Every module but src/main.ts is held to no panic by package.json's
# nish.noPanic (scripts/no-panic-list.mjs keeps it whole); --allow-panics
# leaves main.ts out of that scope for the calls no proof removes.
if ! "$NISH" src/main.ts --allow-panics --link "$out" > "$out.log" 2>&1; then
  grep -B1 -A4 "error" "$out.log" | head -40 || tail -20 "$out.log"
  exit 1
fi
echo "built $out"
