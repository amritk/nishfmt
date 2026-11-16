#!/usr/bin/env bash
# Counts the instructions the Dart dev driver spends on a few heavy corpus
# files (valgrind), a measure that the machine's load doesn't disturb.
#
#   ir.sh <dartdev-binary>
set -uo pipefail
bin=$1
r=/work/c/dart/raw/flutter_packages/packages
total=0
for f in "$r/material_ui/test/text_field_test.dart" \
  "$r/google_fonts/lib/src/google_fonts_parts/part_n.dart" \
  "$r/pigeon/platform_tests/shared_test_plugin_code/lib/src/generated/native_interop_tests.native_interop.gen.dart" \
  "$r/go_router/test/go_router_test.dart"; do
  ir=$(valgrind --tool=callgrind --callgrind-out-file=/dev/null "$bin" "$f" 2>&1 >/dev/null | awk '/Collected/{gsub(",","",$4); print $4}')
  printf '%14d %s\n' "$ir" "$(basename "$f")"
  total=$((total + ir))
done
printf '%14d total\n' "$total"
