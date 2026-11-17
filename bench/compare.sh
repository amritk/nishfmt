#!/usr/bin/env bash
# Formats a copy of an unformatted corpus with nishfmt and compares it with
# clang-format's output for the same input.
#
#   bench/compare.sh <nishfmt-binary> <raw-dir> <clang-dir> [work-dir]
#
# Prints the wall time, the files that differ, and a sample diff.
set -euo pipefail
bin=$1 raw=$2 clang=$3 work=${4:-$(mktemp -d)}
rm -rf "$work/out" && cp -r "$raw" "$work/out"
start=$(date +%s.%N)
"$bin" -i "$work/out" || true
end=$(date +%s.%N)
echo "wall: $(echo "$end - $start" | bc) s"
total=$(cd "$clang" && find . -name '*.hpp' -o -name '*.cpp' -o -name '*.h' -o -name '*.cc' | wc -l)
diff -r -q "$work/out" "$clang" | grep -v '^Only in' | awk '{print $2}' > "$work/differ.txt" || true
nd=$(wc -l < "$work/differ.txt")
echo "identical: $((total - nd)) / $total"
diff -r "$work/out" "$clang" > "$work/all.diff" || true
echo "diff lines: $(grep -c '^[<>]' "$work/all.diff" || true)"
