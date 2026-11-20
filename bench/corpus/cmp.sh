#!/usr/bin/env bash
# Formats a copy of $CORPUS/<lang>/raw with nishfmt and compares it with the
# reference output in $CORPUS/<lang>/ref, leaving out the files the reference
# tool rejected.
#
#   cmp.sh <nishfmt-binary> <lang> [nishfmt options...]
#
# Prints the wall time and the identical count; the files that differ are in
# $WORK/<lang>/differ.txt and a diff of them in $WORK/<lang>/all.diff. For C++
# it also counts the files identical to clang-format's settled output
# (mk.sh's ref-settled/), and lists the others in differ-settled.txt.
set -uo pipefail
bin=$1 lang=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
CORPUS=${CORPUS:-$here/../work/corpus} WORK=${WORK:-$here/../work/out}
CORPUS=$(cd "$CORPUS" && pwd) && mkdir -p "$WORK" && WORK=$(cd "$WORK" && pwd) || exit 2
d=$CORPUS/$lang w=$WORK/$lang
rm -rf "$w" && mkdir -p "$w" && cp -r "$d/raw" "$w/out"
s=$(date +%s.%N)
"$bin" -i -q "$@" "$w/out"
e=$(date +%s.%N)
# Lists the files of out/ that differ from $1, leaving out those $2 lists.
differ() {
  # "Files <out> and <ref> differ", with paths that may hold spaces.
  diff -rq "$w/out" "$1" | grep '^Files ' | sed -e 's|^Files ||' -e "s| and $1/.* differ\$||" \
    -e "s|^$w/out/|./|" | grep -vxF -f "$2"
}
differ "$d/ref" "$d/failed.txt" > "$w/differ.txt"
# $d/support.txt, when a builder writes one, lists files that are the same in
# raw/ and ref/ and are not corpus files (tools/dart/mk5.sh's package files).
support=0
[ -f "$d/support.txt" ] && support=$(wc -l < "$d/support.txt")
total=$(( $(find "$d/ref" -type f | wc -l) - $(wc -l < "$d/failed.txt") - support ))
nd=$(wc -l < "$w/differ.txt")
(cd "$w/out" && while read -r f; do diff -u "$f" "$d/ref/$f"; done < "$w/differ.txt") > "$w/all.diff"
t=$(echo "$e - $s" | bc)
# C++: files that never settle, or that clang-format rejects on a rerun, have
# no settled output and are left out of the settled count.
if [ -d "$d/ref-settled" ]; then
  cat "$d/failed.txt" "$d/unsettled.txt" "$d/settle-failed.txt" > "$w/no-settled.txt"
  differ "$d/ref-settled" "$w/no-settled.txt" > "$w/differ-settled.txt"
  ns=$(( total - $(wc -l < "$d/unsettled.txt") - $(wc -l < "$d/settle-failed.txt") ))
  printf '%s: %d / %d identical to one run, %d / %d to the settled output (%d never settle); %.2f s\n' "$lang" \
    $((total - nd)) "$total" $((ns - $(wc -l < "$w/differ-settled.txt"))) "$ns" "$(wc -l < "$d/unsettled.txt")" "$t"
else
  printf '%s: %d / %d identical; %.2f s\n' "$lang" $((total - nd)) "$total" "$t"
fi
