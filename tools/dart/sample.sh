#!/usr/bin/env bash
# Formats every Nth corpus file with the Dart dev driver and compares it with
# the reference output.
#
#   sample.sh <dartdev-binary> [corpus-dir] [step] [workdir]
#
# Writes the differing files to $w/differ.txt, skipped ones to $w/skipped.txt.
set -uo pipefail
bin=$1 d=${2:-/work/c/dart} step=${3:-1} w=${4:-/work/out-dart/sample}
mkdir -p "$w"
: > "$w/differ.txt"
: > "$w/skipped.txt"
same=0 differ=0 skipped=0 crashed=0
cd "$d/raw"
while read -r f; do
  if grep -qxF "$f" "$d/failed.txt"; then continue; fi
  "$bin" "$f" > "$w/out.dart" 2> "$w/err.txt"
  rc=$?
  if [ $rc -eq 1 ]; then
    skipped=$((skipped + 1)); echo "$f" >> "$w/skipped.txt"
  elif [ $rc -ne 0 ]; then
    crashed=$((crashed + 1)); echo "$f CRASH $rc" >> "$w/differ.txt"
  elif cmp -s "$w/out.dart" "$d/ref/$f"; then
    same=$((same + 1))
  else
    differ=$((differ + 1)); echo "$f" >> "$w/differ.txt"
  fi
done < <(find . -name '*.dart' -type f | sort | awk -v s="$step" 'NR % s == 0')
echo "same $same, differ $differ, skipped $skipped, crashed $crashed"
