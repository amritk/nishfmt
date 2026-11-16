#!/usr/bin/env bash
# Compares fastfmt's Dart parser with the analyzer over a corpus directory.
#
#   astcmp.sh <dartdev-binary> <dir> [workdir]
#
# Needs /work/out-dart/astdump (dart compile exe tools/dart/astdump.dart).
set -uo pipefail
bin=$1 dir=$2 w=${3:-/work/out-dart/ast}
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$w"
(cd "$dir" && find . -name '*.dart' -type f | sort) > "$w/files.txt"
if [ ! -s "$w/theirs.txt" ] || [ "$w/files.txt" -nt "$w/theirs.txt" ]; then
  (cd "$dir" && xargs -d '\n' -n 200 /work/out-dart/astdump < "$w/files.txt") > "$w/theirs.txt"
fi
(cd "$dir" && while read -r f; do FFDTDUMP=ast "$bin" "$f"; done < "$w/files.txt") > "$w/mine.txt" 2>/dev/null
python3 "$here/astcmp.py" "$w/theirs.txt" "$w/mine.txt" > "$w/report.txt"
tail -1 "$w/report.txt"
