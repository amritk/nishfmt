#!/usr/bin/env bash
# Times formatting one language's corpus in place, as the README's table does:
# nishfmt and the reference tool, on all cores and pinned to core 0, each run
# on a fresh copy of $CORPUS/<corpus>/raw (the copy is not timed).
#
#   time.sh <nishfmt-binary> <corpus> [runs]
#
# <corpus> is a directory under $CORPUS (cpp java kt rb swift rust dart cs, or
# a derived one such as dart3). nishfmt runs <runs> times on each side
# (default 5), interleaved, and prints the median and the min-max; the
# reference tool runs once on each side, as mk.sh invokes it, unless REF=0.
# REF1=0 skips only the reference's one-core run. The tools are found as
# mk.sh finds them.
set -uo pipefail
bin=$(cd "$(dirname "$1")" && pwd)/$(basename "$1") corpus=$2 runs=${3:-5}
here=$(cd "$(dirname "$0")" && pwd)
CORPUS=${CORPUS:-$here/../work/corpus} WORK=${WORK:-$here/../work/time}
CORPUS=$(cd "$CORPUS" && pwd) && mkdir -p "$WORK/$corpus" && WORK=$(cd "$WORK" && pwd) || exit 2
src=$CORPUS/$corpus/raw w=$WORK/$corpus
[ -d "$src" ] && [ -x "$bin" ] || { echo "time.sh: no $src or $bin" >&2; exit 2; }
GJF=${GJF:-} KTFMT=${KTFMT:-} SWIFTFORMAT=${SWIFTFORMAT:-swiftformat} DART=${DART:-dart} CSHARPIER=${CSHARPIER:-csharpier}
RUSTFMT=${RUSTFMT:-rustfmt +1.99.1}
lang=$corpus
case $corpus in dart*) lang=dart ;; rust*) lang=rust ;; cs*) lang=cs ;; esac
# C#: the style's .editorconfig and an empty .git sit above the copy, as mk.sh
# puts them above ref/.
[ "$lang" = cs ] && cp "$CORPUS/$corpus/.editorconfig" "$w/.editorconfig" && mkdir -p "$w/.git"
[ "$lang" = rb ] && printf 'AllCops:\n  TargetRubyVersion: 3.3\n' > "$w/rubocop.yml"

fresh() { rm -rf "$w/t" && cp -r "$src" "$w/t"; }
now() { date +%s.%N; }

# The reference tool over $w/t with $1 processes at a time where it takes
# file batches; run under taskset for the one-core side.
ref() {
  local p=$1
  cd "$w/t" || return 1
  case $lang in
    cpp) find . -type f -print0 | xargs -0 -P"$p" -n 50 clang-format -i --style="{BasedOnStyle: LLVM, ColumnLimit: 120}" 2>/dev/null ;;
    java) find . -type f -print0 | xargs -0 -s 1900000 java -jar "$GJF" --replace 2>/dev/null ;;
    kt) find . -type f -print0 | xargs -0 -P"$p" -n 300 java -jar "$KTFMT" --kotlinlang-style >/dev/null 2>&1 ;;
    rb) LC_ALL=C.UTF-8 rubocop -a -c ../rubocop.yml --cache false --format quiet --parallel . >/dev/null 2>&1 ;;
    swift) "$SWIFTFORMAT" . --quiet 2>/dev/null ;;
    rust) find . -type f -print0 | xargs -0 -P"$p" -n 100 $RUSTFMT --edition 2024 --config style_edition=2024,max_width=120 2>/dev/null ;;
    dart) "$DART" format . >/dev/null 2>&1 ;;
    cs) "$CSHARPIER" format . --no-cache >/dev/null 2>&1 ;;
  esac
  cd - >/dev/null
}

# Median and range of the numbers on stdin.
stats() { sort -g | awk '{a[NR]=$1} END {m = NR % 2 ? a[(NR+1)/2] : (a[NR/2] + a[NR/2+1]) / 2;
  printf "%.2f s (%.2f-%.2f, n=%d)", m, a[1], a[NR], NR}'; }

: > "$w/n4" && : > "$w/n1"
for _ in $(seq "$runs"); do
  fresh; s=$(now); "$bin" -i -q "$w/t"; e=$(now); echo "$e - $s" | bc >> "$w/n4"
  fresh; s=$(now); taskset -c 0 "$bin" -i -q -j 1 "$w/t"; e=$(now); echo "$e - $s" | bc >> "$w/n1"
done
echo "$corpus: $(find "$src" -type f | wc -l) files"
echo "  nishfmt, $(nproc) cores: $(stats < "$w/n4")"
echo "  nishfmt, 1 core:  $(stats < "$w/n1")"
if [ "${REF:-1}" != 0 ]; then
  fresh; s=$(now); ref "$(nproc)"; e=$(now)
  printf '  reference, %d cores: %.2f s\n' "$(nproc)" "$(echo "$e - $s" | bc)"
  if [ "${REF1:-1}" != 0 ]; then
    fresh; s=$(now); export -f ref; export w lang GJF KTFMT SWIFTFORMAT DART CSHARPIER RUSTFMT
    taskset -c 0 bash -c 'ref 1'; e=$(now)
    printf '  reference, 1 core:  %.2f s\n' "$(echo "$e - $s" | bc)"
  fi
fi
rm -rf "$w/t"
