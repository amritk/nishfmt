#!/usr/bin/env bash
# Builds fastfmt with the nish compiler on PATH (or $NISH). Fails on any error.
set -euo pipefail
cd "$(dirname "$0")"
NISH=${NISH:-nish}
out=${1:-build/fastfmt}
mkdir -p "$(dirname "$out")" build
if ! "$NISH" src/main.ts --link "$out" > build/log.txt 2>&1; then
  grep -B1 -A4 "error" build/log.txt | head -40
  exit 1
fi
echo "built $out"
