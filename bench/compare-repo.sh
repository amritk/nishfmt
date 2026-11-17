#!/usr/bin/env bash
# Formats a copy of a repository's C++ sources with clang-format and with
# nishfmt, at the same style, and reports how many files come out identical.
#
#   bench/compare-repo.sh <nishfmt-binary> <repo-dir> <work-dir>
#
# The repository's own .clang-format is ignored: both tools use LLVM style
# with a 120-column limit. <work-dir>/differ.txt lists the files that differ.
set -uo pipefail
bin=$1 repo=$2 work=$3
style='{BasedOnStyle: LLVM, ColumnLimit: 120}'
rm -rf "$work" && mkdir -p "$work/raw"
(cd "$repo" && find . -type f \( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.hpp' -o -name '*.hh' \
  -o -name '*.hxx' -o -name '*.h' \) -not -path './.git/*' -print0 | tar --null -cf - -T -) | (cd "$work/raw" && tar xf -)
cp -r "$work/raw" "$work/clang"
s=$(date +%s.%N)
# One file per run: clang-format can run out of memory on a huge file, and a
# failed run must not leave other files unformatted. Failures are listed and
# left out of the comparison.
: > "$work/clang-failed.txt"
(cd "$work/clang" && find . -type f -print0 | xargs -0 -P"$(nproc)" -I{} sh -c \
  'clang-format -i --style="$1" "$2" 2>/dev/null || echo "$2" >> "$3"' _ "$style" {} "$work/clang-failed.txt")
e=$(date +%s.%N)
clang=$(echo "$e - $s" | bc)
cp -r "$work/raw" "$work/ff"
s=$(date +%s.%N)
"$bin" -i -q "$work/ff"
e=$(date +%s.%N)
ff=$(echo "$e - $s" | bc)
total=$(find "$work/raw" -type f | wc -l)
failed=$(wc -l < "$work/clang-failed.txt")
diff -rq "$work/ff" "$work/clang" | grep -v '^Only' | awk '{print $2}' | sed "s|$work/ff/|./|" \
  | grep -vxF -f "$work/clang-failed.txt" > "$work/differ.txt"
nd=$(wc -l < "$work/differ.txt")
total=$((total - failed))
echo "$(basename "$repo"): $((total - nd)) / $total identical (clang-format failed on $failed);" \
  "clang-format ${clang}s, nishfmt ${ff}s"
