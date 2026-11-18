#!/usr/bin/env bash
# Builds the package Dart corpus $CORPUS/dart5 from $CORPUS/dart/raw, with
# Dart SDK 3.14.1 ($DART): each top-level repository directory becomes a
# package, with a pubspec.yaml at `sdk: ^3.8.0` (no dependencies) and the
# .dart_tool/package_config.json and pubspec.lock that `dart pub get
# --offline` writes for it, so every file is at language version 3.8 by its
# package config rather than by a `// @dart=` comment. That gives dart5/raw;
# dart5/ref is `dart format .` run inside each package directory, and
# dart5/failed.txt lists the files it rejects.
#
# The package files are the same in raw/ and ref/; cmp.sh leaves pubspec.yaml,
# pubspec.lock and .dart_tool/ out of its total, and so does the count here.
#
#   mk5.sh
set -uo pipefail
CORPUS=${CORPUS:-$(cd "$(dirname "$0")/../.." && pwd)/bench/work/corpus} DART=${DART:-dart}
src=$CORPUS/dart/raw d=$CORPUS/dart5
rm -rf "$d" && mkdir -p "$d"
cp -r "$src" "$d/raw"
cd "$d/raw"
for p in */; do
  p=${p%/}
  # A package name is lower-case letters, digits and underscores.
  name=$(printf '%s' "$p" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9_' _)
  printf 'name: %s\nenvironment:\n  sdk: ^3.8.0\n' "$name" > "$p/pubspec.yaml"
  (cd "$p" && "$DART" pub get --offline > /dev/null) || { echo "mk5.sh: pub get failed in $p" >&2; exit 1; }
done
cp -r "$d/raw" "$d/ref"
cd "$d/ref"
: > ../dartformat.log; : > ../failed.txt
for p in */; do
  p=${p%/}
  (cd "$p" && "$DART" format . > /dev/null 2> ../../dartformat.$p.log)
  # Paths in the log are relative to the package directory.
  sed -n -e 's/^line [0-9]*, column [0-9]* of \(.*\.dart\): .*/\1/p' \
    -e 's/^Hit a bug in the formatter when formatting \(.*\.dart\)\.$/\1/p' "../dartformat.$p.log" \
    | sed -e 's|^\./||' -e "s|^|./$p/|" >> ../failed.txt
  cat "../dartformat.$p.log" >> ../dartformat.log && rm "../dartformat.$p.log"
done
sort -u -o ../failed.txt ../failed.txt
n=$(find . -type f -not -path '*/.dart_tool/*' -not -name pubspec.yaml -not -name pubspec.lock | wc -l)
echo "dart5: $n files, reference failed on $(wc -l < ../failed.txt)"
