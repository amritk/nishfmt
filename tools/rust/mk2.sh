#!/usr/bin/env bash
# Builds the second Rust corpus, $CORPUS/rust2: every file of rust/raw is
# formatted with one of five non-default rustfmt configurations (chosen by a
# checksum of its path) to make rust2/raw, then rust2/ref is the default
# rustfmt over that. Files either pass rejects go in rust2/failed.txt. The
# reference is $RUSTFMT, rustfmt 1.10.0 (default `rustfmt +1.99.1`).
#
#   mk2.sh [jobs]
set -uo pipefail
CORPUS=${CORPUS:-$(cd "$(dirname "$0")/../.." && pwd)/bench/work/corpus} J=${1:-2}
export RUSTFMT=${RUSTFMT:-rustfmt +1.99.1}
src=$CORPUS/rust/raw d=$CORPUS/rust2
rm -rf "$d" && mkdir -p "$d" && cp -r "$src" "$d/raw"
: > "$d/failed.txt"
cd "$d/raw"
find . -type f -print0 | xargs -0 -P"$J" -I{} sh -c '
  f=$1
  case $(( $(printf %s "$f" | cksum | cut -d" " -f1) % 5 )) in
    0) c="max_width=60,tab_spaces=2,use_small_heuristics=Max,fn_params_layout=Vertical,hard_tabs=true" ;;
    1) c="max_width=140,tab_spaces=8,use_small_heuristics=Off,match_block_trailing_comma=true" ;;
    2) c="max_width=80,use_small_heuristics=Max,fn_params_layout=Compressed,match_arm_leading_pipes=Always,newline_style=Windows" ;;
    3) c="max_width=45,tab_spaces=3,reorder_imports=false,reorder_modules=false,force_explicit_abi=false" ;;
    *) c="max_width=120,hard_tabs=true,chain_width=30,fn_call_width=30,struct_lit_width=0,array_width=20,remove_nested_parens=false" ;;
  esac
  $RUSTFMT --edition 2021 --config "$c" < "$f" > "$f.o" 2>/dev/null && mv "$f.o" "$f" || { rm -f "$f.o"; echo "$f" >> ../failed.txt; }
' _ {}
cp -r "$d/raw" "$d/ref"
cd "$d/ref"
find . -type f -print0 | xargs -0 -P"$J" -I{} sh -c '
  $RUSTFMT --edition 2021 < "$1" > "$1.o" 2>/dev/null && mv "$1.o" "$1" || { rm -f "$1.o"; echo "$1" >> ../failed.txt; }
' _ {}
sort -u -o ../failed.txt ../failed.txt
echo "rust2: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
