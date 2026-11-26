#!/usr/bin/env bash
# Trains pgo/nishfmt.profdata, the profile build.sh optimises the Linux
# binary with: links a --pgo-generate nishfmt, formats every tenth file of
# each language's corpus with it, and merges the runs with llvm-profdata.
#
#   scripts/pgo-train.sh
#
# Needs the corpora (bench/corpus/fetch.sh and mk.sh, or $CORPUS) and
# llvm-profdata from LLVM 18, the version the Linux builds link with (as
# llvm-profdata or llvm-profdata-18). Retrain after changes that move the
# formatters' hot paths, and after a nish upgrade that changes its LLVM: a
# function whose code changed is optimised without the profile.
set -euo pipefail
cd "$(dirname "$0")/.."
NISH=${NISH:-}
if [ -z "$NISH" ]; then
  if [ -x .nish/bin/nish ]; then NISH=.nish/bin/nish; else NISH=nish; fi
fi
CORPUS=${CORPUS:-bench/work/corpus}
profdata=$(command -v llvm-profdata || command -v llvm-profdata-18 || true)
[ -n "$profdata" ] || { echo "pgo-train.sh: no llvm-profdata (LLVM 18) on PATH" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/train" "$work/raw" pgo
n=0
for d in "$CORPUS"/*/raw; do
  lang=$(basename "$(dirname "$d")")
  mkdir -p "$work/train/$lang"
  (cd "$d" && find . -type f | LC_ALL=C sort | awk 'NR % 10 == 0' > "$work/$lang.list" &&
    tar cf - -T "$work/$lang.list") | (cd "$work/train/$lang" && tar xf -)
  n=$((n + $(wc -l < "$work/$lang.list")))
done
[ "$n" -gt 0 ] || { echo "pgo-train.sh: no corpus under $CORPUS" >&2; exit 1; }
"$NISH" src/main.ts --allow-panics --pgo-generate --link "$work/nishfmt" > "$work/link.log" 2>&1 ||
  { tail -20 "$work/link.log" >&2; exit 1; }
LLVM_PROFILE_FILE="$work/raw/%p.profraw" "$work/nishfmt" -i -q "$work/train" > /dev/null 2>&1 || true
"$profdata" merge -o pgo/nishfmt.profdata "$work"/raw/*.profraw
echo "pgo-train.sh: pgo/nishfmt.profdata from $n files ($(du -h pgo/nishfmt.profdata | cut -f1))"
