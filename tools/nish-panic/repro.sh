#!/usr/bin/env bash
# Builds the Rust dev driver (tools/dev/rust.ts) and tools/nish-panic/reduced.ts
# under each nish build mode, runs the inputs the plan reported, and prints
# each outcome. It also builds a copy of the Rust driver with a one-line guard
# in RsParser.parseWhereInto, the proposed fix, to show that guard is enough.
# It exits non-zero when an outcome differs from the one NOTES.md records:
# every build panics the same way, and the guarded build skips cleanly.
#   bash tools/nish-panic/repro.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
root=$PWD
NISH=${NISH:-.nish/bin/nish}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$NISH" --version 2>&1 | head -1

# The plan's inputs. On the first, parseGenerics fails but still answers its
# node (2), not -1, so it skips cleanly; the other three panic.
printf 'fn f<T: Clone,,>() {}\n' > "$work/in0.rs"
printf 'fn f<T: Clone,, U:, V>() {}\n' > "$work/in1.rs"
printf 'fn foo<T: T![], T: T!, T: T!{}>() -> Box<T! + T!{}> {}\n' > "$work/in2.rs"
printf "fn foo<T: for<'a> [const] async Trait>() {}\n" > "$work/in3.rs"
# The same failed-generics path through the other items that reach it.
printf 'enum E<T: T!> {}\n' > "$work/in4.rs"
printf 'trait Tr<T: T!> = Clone;\n' > "$work/in5.rs"
printf 'type A<T: T!> = u8;\n' > "$work/in6.rs"
inputs="in0 in1 in2 in3 in4 in5 in6"
panics="in1 in2 in3 in4 in5 in6"
msg='index out of range: 18446744073709551615 >= 64'

bad=0
# check <label> <want: panic|skip> <exit> <stderr file>
check() {
  local got=skip
  if grep -qF "$msg" "$4"; then got=panic; elif [ "$3" -ne 1 ]; then got="exit $3"; fi
  local mark=ok
  if [ "$got" != "$2" ]; then mark=UNEXPECTED; bad=1; fi
  printf '  %-28s exit %d  %-5s (want %s) %s\n' "$1" "$3" "$got" "$2" "$mark"
}
want() {
  case " $panics " in *" $1 "*) echo panic ;; *) echo skip ;; esac
}

build() { # build <out> <src.ts> <flags...>
  local out=$1 src=$2
  shift 2
  if ! "$NISH" "$src" --link "$out" "$@" > "$out.log" 2>&1; then
    echo "build failed: $NISH $src $*" >&2
    tail -5 "$out.log" >&2
    exit 2
  fi
}

# The Rust driver, natively, under each mode.
for mode in speed size debug g; do
  case $mode in
    g) flags=(-g) ;;
    *) flags=(--profile "$mode") ;;
  esac
  build "$work/rust-$mode" tools/dev/rust.ts "${flags[@]}"
  echo "rust driver, ${flags[*]}:"
  for f in $inputs; do
    "$work/rust-$mode" "$work/$f.rs" > /dev/null 2> "$work/err"
    rc=$?
    check "$f ($(head -c 40 "$work/$f.rs" | tr -d '\n'))" "$(want "$f")" "$rc" "$work/err"
  done
done

# The Rust driver as TypeScript under Node (22.18 or newer strips types).
node_ok=0
if command -v node > /dev/null 2>&1; then
  "$NISH" tools/dev/rust.ts --emit-ts "$work/ts" > "$work/ts.log" 2>&1 || {
    echo "--emit-ts failed" >&2
    exit 2
  }
  mkdir -p "$work/ts/node_modules/nish"
  ln -s "$root/.nish/runtime" "$work/ts/node_modules/nish/runtime"
  printf '{"name":"nish","type":"module","exports":{"./runtime":"./runtime/core.mjs","./runtime/node":"./runtime/node.mjs"}}\n' \
    > "$work/ts/node_modules/nish/package.json"
  printf '{"type":"module"}\n' > "$work/ts/package.json"
  node_ok=1
  echo "rust driver, --emit-ts under node $(node --version):"
  for f in $inputs; do
    node "$work/ts/entry.ts" "$work/$f.rs" > /dev/null 2> "$work/err"
    rc=$?
    check "$f" "$(want "$f")" "$rc" "$work/err"
  done
else
  echo "rust driver, --emit-ts: no node on PATH, not run"
fi

# The proposed workaround: parseWhereInto returns on a failed generics node.
mkdir -p "$work/guard"
cp -r src tools "$work/guard/"
sed -i 's/^  parseWhereInto(g: i32): void {$/&\n    if (g < 0) {\n      return;\n    }/' \
  "$work/guard/src/rust/parser.ts"
if cmp -s src/rust/parser.ts "$work/guard/src/rust/parser.ts"; then
  echo "the guard did not apply: parseWhereInto's signature moved" >&2
  exit 2
fi
build "$work/rust-guard" "$work/guard/tools/dev/rust.ts"
echo "rust driver with the parseWhereInto guard, speed:"
for f in $inputs; do
  "$work/rust-guard" "$work/$f.rs" > /dev/null 2> "$work/err"
  rc=$?
  check "$f" skip "$rc" "$work/err"
done

# The reduced program: the same unchecked -1, in every mode.
echo "tools/nish-panic/reduced.ts:"
for mode in speed size debug; do
  build "$work/red-$mode" tools/nish-panic/reduced.ts --profile "$mode"
  "$work/red-$mode" > /dev/null 2> "$work/err"
  rc=$?
  check "--profile $mode" panic "$rc" "$work/err"
done
build "$work/red-g" tools/nish-panic/reduced.ts -g
"$work/red-g" > /dev/null 2> "$work/err"
rc=$?
check "-g" panic "$rc" "$work/err"
if [ "$node_ok" = 1 ]; then
  "$NISH" tools/nish-panic/reduced.ts --emit-ts "$work/rts" > "$work/rts.log" 2>&1
  cp -r "$work/ts/node_modules" "$work/ts/package.json" "$work/rts/"
  node "$work/rts/entry.ts" > /dev/null 2> "$work/err"
  rc=$?
  check "--emit-ts, node" panic "$rc" "$work/err"
fi

if [ "$bad" = 0 ]; then
  echo "every outcome as recorded in tools/nish-panic/NOTES.md"
else
  echo "an outcome differs from tools/nish-panic/NOTES.md" >&2
fi
exit "$bad"
