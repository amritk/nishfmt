#!/usr/bin/env bash
# Builds nishfmt: `bash build.sh [out]`, by default to dist/nishfmt. The
# compiler is $NISH, else the pinned one in .nish/ (scripts/fetch-nish.sh),
# else nish on PATH. The compiler's log goes to <out>.log; on an error its
# lines are printed and the build fails.
#
# On Linux the link is profile-guided, with pgo/nishfmt.profdata
# (scripts/pgo-train.sh trains it): LLVM 18, which the Linux builds link
# with, reads the profile, and nish needs its llvm-profdata to. macOS links
# with Xcode's clang, which may not read an LLVM 18 profile, so it builds
# without one, as does NISHFMT_PGO=0.
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
pgo=()
if [ "${NISHFMT_PGO:-1}" != 0 ] && [ "$(uname -s)" = Linux ] && [ -f pgo/nishfmt.profdata ]; then
  if ! command -v llvm-profdata >/dev/null 2>&1; then
    # Ubuntu's llvm-18 package installs it only as llvm-profdata-18.
    if command -v llvm-profdata-18 >/dev/null 2>&1; then
      tools=$(mktemp -d)
      trap 'rm -rf "$tools"' EXIT
      ln -s "$(command -v llvm-profdata-18)" "$tools/llvm-profdata"
      export PATH="$tools:$PATH"
    fi
  fi
  if command -v llvm-profdata >/dev/null 2>&1; then
    pgo=(--pgo-use pgo/nishfmt.profdata)
  else
    echo "build.sh: no llvm-profdata (LLVM 18) on PATH: linking without the profile" >&2
  fi
fi
# Every module but src/main.ts is held to no panic by package.json's
# nish.noPanic (scripts/no-panic-list.mjs keeps it whole); --allow-panics
# leaves main.ts out of that scope for the calls no proof removes.
if ! "$NISH" src/main.ts --allow-panics ${pgo[@]+"${pgo[@]}"} --link "$out" > "$out.log" 2>&1; then
  grep -B1 -A4 "error" "$out.log" | head -40 || tail -20 "$out.log"
  exit 1
fi
echo "built $out${pgo[*]:+ (profile-guided)}"
