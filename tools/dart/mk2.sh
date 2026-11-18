#!/usr/bin/env bash
# Builds the harder Dart corpus $CORPUS/dart2 from $CORPUS/dart/raw, with
# Dart SDK 3.14.1 ($DART): each file is first reformatted with non-default
# settings, chosen by a hash of its path (page width 40, page width 120, or
# the short style of language 3.6), which gives dart2/raw; dart2/ref is then
# plain `dart format` of that, and dart2/failed.txt lists the files it rejects.
#
#   mk2.sh
set -uo pipefail
CORPUS=${CORPUS:-$(cd "$(dirname "$0")/../.." && pwd)/bench/work/corpus} DART=${DART:-dart}
src=$CORPUS/dart/raw d=$CORPUS/dart2
rm -rf "$d" && mkdir -p "$d"
cp -r "$src" "$d/raw"
cd "$d/raw"
find . -name '*.dart' -type f | sort > ../all.txt
: > ../b0.txt; : > ../b1.txt; : > ../b2.txt
while read -r f; do
  h=$(printf '%s' "$f" | cksum | awk '{print $1 % 3}')
  echo "$f" >> "../b$h.txt"
done < ../all.txt
xargs -d '\n' -n 500 "$DART" format --page-width 40 < ../b0.txt > /dev/null 2>&1
xargs -d '\n' -n 500 "$DART" format --page-width 120 < ../b1.txt > /dev/null 2>&1
xargs -d '\n' -n 500 "$DART" format --language-version=3.6 < ../b2.txt > /dev/null 2>&1
cp -r "$d/raw" "$d/ref"
cd "$d/ref"
"$DART" format . > /dev/null 2> ../dartformat.log
grep -o '[^ ]*\.dart' ../dartformat.log | sort -u > ../failed.txt
echo "dart2: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
