#!/usr/bin/env bash
# Formats a copy of $CORPUS/<lang>/raw with nishfmt and compares it with the
# reference output in $CORPUS/<lang>/ref, leaving out the files the reference
# tool rejected.
#
#   cmp.sh <nishfmt-binary> <lang> [nishfmt options...]
#
# Prints the wall time and the identical count; the files that differ are in
# $WORK/<lang>/differ.txt and a diff of them in $WORK/<lang>/all.diff.
set -uo pipefail
bin=$1 lang=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
CORPUS=${CORPUS:-$here/../work/corpus} WORK=${WORK:-$here/../work/out}
d=$CORPUS/$lang w=$WORK/$lang
rm -rf "$w" && mkdir -p "$w" && cp -r "$d/raw" "$w/out"
s=$(date +%s.%N)
"$bin" -i -q "$@" "$w/out"
e=$(date +%s.%N)
# "Files <out> and <ref> differ", with paths that may hold spaces.
diff -rq "$w/out" "$d/ref" | grep '^Files ' | sed -e 's|^Files ||' -e "s| and $d/ref/.* differ\$||" \
  -e "s|^$w/out/|./|" | grep -vxF -f "$d/failed.txt" > "$w/differ.txt"
# $d/support.txt, when a builder writes one, lists files that are the same in
# raw/ and ref/ and are not corpus files (tools/dart/mk5.sh's package files).
support=0
[ -f "$d/support.txt" ] && support=$(wc -l < "$d/support.txt")
total=$(( $(find "$d/ref" -type f | wc -l) - $(wc -l < "$d/failed.txt") - support ))
nd=$(wc -l < "$w/differ.txt")
(cd "$w/out" && while read -r f; do diff -u "$f" "$d/ref/$f"; done < "$w/differ.txt") > "$w/all.diff"
printf '%s: %d / %d identical; %.2f s\n' "$lang" $((total - nd)) "$total" "$(echo "$e - $s" | bc)"
