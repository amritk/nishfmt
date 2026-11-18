#!/bin/bash
# Regenerates/checks Dart regression cases in tests/cases/dart.
# usage: cases.sh <nishfmt-dart-bin> [--regen]
# With --regen, writes each NAME.expected from `dart format < NAME.dart`
# (dart is $DART, else dart on PATH: Dart SDK 3.14.1).
# Then checks that the binary formats NAME.dart to NAME.expected and leaves
# NAME.expected unchanged.
#
# Each pkg-<name>/ directory is a project: it is copied to a scratch
# directory and every NAME.dart in it is formatted there by a relative path,
# so that both tools read the copy's package config and analysis options.
# With --regen, NAME.expected is `dart format` of the copy, except where a
# NAME.untouched marker says nishfmt must leave the file alone (there dart
# format must have warned). The binary may be tools/dev/dart.ts's (which
# prints the file, or exits 1 when it leaves it alone) or nishfmt.
DART=${DART:-dart}
bin=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
dir=$(cd "$(dirname "$0")/../../tests/cases/dart" && pwd)
tmp=$(mktemp)
fail=0
for f in "$dir"/*.dart; do
  n=${f%.dart}
  if [ "$2" = "--regen" ]; then
    "$DART" format < "$f" > "$n.expected" || { echo "dart format failed: $f"; fail=1; }
  fi
  "$bin" "$f" > "$tmp"
  if cmp -s "$tmp" "$n.expected"; then echo "PASS $(basename "$n")"; else
    echo "FAIL $(basename "$n")"; diff "$tmp" "$n.expected" | head -20; fail=1; fi
  "$bin" "$n.expected" > "$tmp"
  cmp -s "$tmp" "$n.expected" || { echo "NOT IDEMPOTENT $(basename "$n")"; fail=1; }
done
for pkg in "$dir"/pkg-*/; do
  [ -d "$pkg" ] || continue
  pname=$(basename "$pkg")
  work=$(mktemp -d)
  cp -r "$pkg" "$work/p"
  if [ "$2" = "--regen" ]; then
    cp -r "$pkg" "$work/r"
    (cd "$work/r" && "$DART" format -o write . > /dev/null 2>&1)
  fi
  while IFS= read -r rel; do
    rel=${rel#./}
    n=${rel%.dart}
    if [ -f "$work/p/$n.untouched" ]; then
      if [ "$2" = "--regen" ] && ! grep -q preserve "$work/p/$n.untouched" && ! (cd "$work/p" && "$DART" format -o none "$rel" 2>&1 >/dev/null) | grep -qi "warning\|could not\|error"; then
        echo "dart format did not warn: $pname/$rel"; fail=1
      fi
      if (cd "$work/p" && "$bin" "$rel" > "$tmp" 2>/dev/null) && ! cmp -s "$tmp" "$work/p/$rel"; then
        echo "FAIL $pname/$n: formatted, not left untouched"; fail=1
      else echo "PASS $pname/$n (untouched)"; fi
      continue
    fi
    if [ "$2" = "--regen" ]; then
      cp "$work/r/$rel" "$pkg/$n.expected"
    fi
    [ -f "$pkg/$n.expected" ] || continue
    (cd "$work/p" && "$bin" "$rel") > "$tmp"
    if cmp -s "$tmp" "$pkg/$n.expected"; then echo "PASS $pname/$n"; else
      echo "FAIL $pname/$n"; diff "$tmp" "$pkg/$n.expected" | head -20; fail=1; fi
    cp "$pkg/$n.expected" "$work/p/$n.idem.dart"
    (cd "$work/p" && "$bin" "$n.idem.dart") > "$tmp"
    cmp -s "$tmp" "$pkg/$n.expected" || { echo "NOT IDEMPOTENT $pname/$n"; fail=1; }
    rm -f "$work/p/$n.idem.dart"
  done < <(cd "$work/p" && find . -name '*.dart' -type f | sort)
  rm -rf "$work"
done
rm -f "$tmp"
exit $fail
