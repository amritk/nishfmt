#!/usr/bin/env bash
# Builds a language-versioned Dart corpus from $CORPUS/dart/raw: every file
# gets a `// @dart=x.y` first line, chosen by a hash of its path, which gives
# <name>/raw; <name>/ref is `dart format` of that, and <name>/failed.txt
# lists the files it rejects (an old version disables newer syntax).
#
#   mk3.sh dart3   # 2.19 for a quarter of the files, 3.6 for the rest (short style)
#   mk3.sh dart4   # 3.7, 3.8 or 3.12 (the older tall styles)
set -uo pipefail
name=${1:-dart3}
CORPUS=${CORPUS:-$(cd "$(dirname "$0")/../.." && pwd)/bench/work/corpus} DART=${DART:-dart}
src=$CORPUS/dart/raw d=$CORPUS/$name
rm -rf "$d" && mkdir -p "$d"
cp -r "$src" "$d/raw"
cd "$d/raw"
find . -name '*.dart' -type f | sort > ../all.txt
while IFS= read -r f; do
  h=$(printf '%s' "$f" | cksum | awk '{print $1}')
  if [ "$name" = dart3 ]; then
    if [ $((h % 4)) -eq 0 ]; then v=2.19; else v=3.6; fi
  else
    case $((h % 3)) in 0) v=3.7 ;; 1) v=3.8 ;; *) v=3.12 ;; esac
  fi
  { printf '// @dart=%s\n' "$v"; cat "$f"; } > "$f.tmp" && mv "$f.tmp" "$f"
done < ../all.txt
cp -r "$d/raw" "$d/ref"
cd "$d/ref"
"$DART" format . > /dev/null 2> ../dartformat.log
sed -n -e 's/^line [0-9]*, column [0-9]* of \(.*\.dart\): .*/\1/p' \
  -e 's/^Hit a bug in the formatter when formatting \(.*\.dart\)\.$/\1/p' ../dartformat.log \
  | sed -e 's|^\./||' -e 's|^|./|' | sort -u > ../failed.txt
echo "$name: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
