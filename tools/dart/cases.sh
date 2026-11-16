#!/bin/bash
# Regenerates/checks Dart regression cases in tests/cases/dart.
# usage: cases.sh <fastfmt-dart-bin> [--regen]
# With --regen, writes each NAME.expected from `dart format < NAME.dart`.
# Then checks that the binary formats NAME.dart to NAME.expected and leaves
# NAME.expected unchanged.
bin=$1
dir=$(cd "$(dirname "$0")/../../tests/cases/dart" && pwd)
tmp=$(mktemp)
fail=0
for f in "$dir"/*.dart; do
  n=${f%.dart}
  if [ "$2" = "--regen" ]; then
    dart format < "$f" > "$n.expected" || { echo "dart format failed: $f"; fail=1; }
  fi
  "$bin" "$f" > "$tmp"
  if cmp -s "$tmp" "$n.expected"; then echo "PASS $(basename "$n")"; else
    echo "FAIL $(basename "$n")"; diff "$tmp" "$n.expected" | head -20; fail=1; fi
  "$bin" "$n.expected" > "$tmp"
  cmp -s "$tmp" "$n.expected" || { echo "NOT IDEMPOTENT $(basename "$n")"; fail=1; }
done
rm -f "$tmp"
exit $fail
