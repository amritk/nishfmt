#!/usr/bin/env bash
# Runs the formatter's regression cases.
#
#   tests/run.sh [nishfmt-binary]
#
# Each tests/cases/<name>.cpp with a <name>.expected (clang-format 23.1.5, LLVM
# style, ColumnLimit 120) must format to it, and formatting the expected file
# must leave it unchanged. unbalanced.cpp and each tests/cases/<lang>/skip_*
# (a file the reference tool rejects) must be skipped and left untouched, and
# each tests/cases/<lang>/fault_* (a file a formatter is known to write wrong
# code for) reported as a formatter fault and left untouched.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-$here/../dist/nishfmt}
bin=$(cd "$(dirname "$bin")" && pwd)/$(basename "$bin")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail=0 pass=0

# limited <cmd>...: runs it with a minute to finish, where timeout(1) exists
# (macOS has none), so a formatter that never ends fails its case rather than
# stalling the run.
limited() {
  if command -v timeout > /dev/null 2>&1; then
    timeout 60 "$@"
  else
    "$@"
  fi
}

for src in "$here"/cases/*.cpp; do
  name=$(basename "$src" .cpp)
  expected="$here/cases/$name.expected"
  [ -f "$expected" ] || continue
  if limited "$bin" "$src" > "$work/out" && cmp -s "$work/out" "$expected"; then
    pass=$((pass + 1))
  else
    echo "FAIL $name: output differs from $name.expected"
    diff "$work/out" "$expected" | head -20
    fail=$((fail + 1))
  fi
  # Idempotence: the expected output is already formatted.
  cp "$expected" "$work/idem.cpp"
  if ! limited "$bin" --check -q "$work/idem.cpp" > /dev/null; then
    echo "FAIL $name: formatting $name.expected changes it"
    fail=$((fail + 1))
  fi
done

# Other languages: each tests/cases/<lang>/<name>.<ext> with a <name>.expected
# must format to it, and formatting the expected file must leave it unchanged.
for src in "$here"/cases/*/*; do
  [ -f "$src" ] || continue
  file=$(basename "$src")
  case "$file" in *.expected) continue ;; esac
  dir=$(dirname "$src")
  name=${file%.*}
  ext=${file##*.}
  expected="$dir/$name.expected"
  [ -f "$expected" ] || continue
  label="$(basename "$dir")/$name"
  if "$bin" "$src" > "$work/out" && cmp -s "$work/out" "$expected"; then
    pass=$((pass + 1))
  else
    echo "FAIL $label: output differs from $name.expected"
    diff "$work/out" "$expected" | head -20
    fail=$((fail + 1))
  fi
  cp "$expected" "$work/idem.$ext"
  if ! "$bin" --check -q "$work/idem.$ext" > /dev/null; then
    echo "FAIL $label: formatting $name.expected changes it"
    fail=$((fail + 1))
  fi
done

# Dart projects: each tests/cases/dart/pkg-<name>/ is copied to a scratch
# directory, where nishfmt formats each <f>.dart inside it by a relative path,
# so that it reads the copy's package config and analysis_options.yaml. A
# <f>.expected beside it (dart format 3.14.1's output in the copy) must match,
# and formatting it must change nothing; a <f>.untouched beside it means the
# file must be skipped and left as it is.
for pkg in "$here"/cases/dart/pkg-*/; do
  [ -d "$pkg" ] || continue
  pname=$(basename "$pkg")
  rm -rf "$work/pkg" && cp -r "$pkg" "$work/pkg"
  while IFS= read -r rel; do
    rel=${rel#./}
    base=${rel%.dart}
    label="dart/$pname/$rel"
    if [ -f "$work/pkg/$base.untouched" ]; then
      cp "$work/pkg/$rel" "$work/orig"
      msg=$(cd "$work/pkg" && "$bin" -i "$rel" 2>&1)
      skipped=0
      case $msg in *"nishfmt: skipped $rel "*) skipped=1 ;; esac
      if [ "$skipped" -eq 1 ] && cmp -s "$work/pkg/$rel" "$work/orig"; then
        pass=$((pass + 1))
      else
        echo "FAIL $label: not left untouched"
        fail=$((fail + 1))
      fi
      continue
    fi
    [ -f "$work/pkg/$base.expected" ] || continue
    if (cd "$work/pkg" && "$bin" "$rel") > "$work/out" && cmp -s "$work/out" "$work/pkg/$base.expected"; then
      pass=$((pass + 1))
    else
      echo "FAIL $label: output differs from $base.expected"
      diff "$work/out" "$work/pkg/$base.expected" | head -20
      fail=$((fail + 1))
    fi
    # Idempotence, in the same directory and so the same project.
    cp "$work/pkg/$base.expected" "$work/pkg/$base.idem.dart"
    if ! (cd "$work/pkg" && "$bin" --check -q "$base.idem.dart" > /dev/null); then
      echo "FAIL $label: formatting $base.expected changes it"
      fail=$((fail + 1))
    fi
    rm -f "$work/pkg/$base.idem.dart"
  done < <(cd "$work/pkg" && find . -name '*.dart' -type f | sort)
done

# State one file leaves for the next: the files of each
# tests/cases/worker/<name>/ go, in name order, through one worker (-j 1) in
# one run, and each must become its .expected, as it does when formatted alone.
for dir in "$here"/cases/worker/*/; do
  [ -d "$dir" ] || continue
  label="worker/$(basename "$dir")"
  rm -rf "$work/seq" && mkdir "$work/seq"
  files=()
  for src in "$dir"*; do
    case $src in *.expected) continue ;; esac
    cp "$src" "$work/seq/"
    files+=("$work/seq/${src##*/}")
  done
  "$bin" -i -q -j 1 "${files[@]}" > /dev/null 2>&1
  ok=1
  for f in "${files[@]}"; do
    file=${f##*/}
    if ! cmp -s "$f" "$dir${file%.*}.expected"; then
      ok=0
      echo "FAIL $label: $file differs from ${file%.*}.expected after the files before it"
      diff "$f" "$dir${file%.*}.expected" | head -20
    fi
  done
  if [ "$ok" -eq 1 ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
  fi
done

# Unbalanced input is skipped, not mangled.
cp "$here/cases/unbalanced.cpp" "$work/unbalanced.cpp"
"$bin" -i -q "$work/unbalanced.cpp" > /dev/null 2>&1
if cmp -s "$work/unbalanced.cpp" "$here/cases/unbalanced.cpp"; then
  pass=$((pass + 1))
else
  echo "FAIL unbalanced: an unbalanced file was rewritten"
  fail=$((fail + 1))
fi

# Files the reference tool rejects are skipped, not formatted: each
# tests/cases/<lang>/skip_<name>.<ext>, which has no .expected, must be
# reported skipped by -i as not parsing, or, a C++ case named
# skip_never_settles*, as not settling (a formatter that crashes on it does
# not count), and left byte for byte as it is, and --check must find nothing
# to change.
for src in "$here"/cases/*/skip_*; do
  [ -f "$src" ] || continue
  file=${src##*/}
  label=${src#"$here"/cases/}
  label=${label%.*}
  cp "$src" "$work/$file"
  msg=$("$bin" -i "$work/$file" 2>&1)
  # (A case named for a file that never settles must say so; any other, that
  # it does not parse.)
  reason="does not parse"
  case $file in *never_settles*) reason="does not settle" ;; esac
  case $msg in
    *"nishfmt: skipped $work/$file ($reason)"*) skipped=1 ;;
    *) skipped=0 ;;
  esac
  if [ "$skipped" -eq 1 ] && cmp -s "$work/$file" "$src" && "$bin" --check -q "$work/$file" > /dev/null 2>&1; then
    pass=$((pass + 1))
  else
    echo "FAIL $label: not skipped and left untouched"
    fail=$((fail + 1))
  fi
done

# A file on which a formatter is known to write different code, which the
# check of the code it keeps (src/cpp/samecode.ts) must catch: each
# tests/cases/<lang>/fault_<name>.<ext> must be reported as a formatter fault
# and left byte for byte as it is. Once the formatter is fixed, the case
# becomes an ordinary one with an .expected.
for src in "$here"/cases/*/fault_*; do
  [ -f "$src" ] || continue
  file=${src##*/}
  label=${src#"$here"/cases/}
  label=${label%.*}
  cp "$src" "$work/$file"
  msg=$("$bin" -i "$work/$file" 2>&1)
  case $msg in
    *"nishfmt: skipped $work/$file (formatter fault)"*) faulted=1 ;;
    *) faulted=0 ;;
  esac
  if [ "$faulted" -eq 1 ] && cmp -s "$work/$file" "$src"; then
    pass=$((pass + 1))
  else
    echo "FAIL $label: not caught as a fault and left untouched"
    fail=$((fail + 1))
  fi
done

# A directory is walked whatever its name: a Kotlin case under a package
# directory named like a JSON file (kotest's `io.kotest.assertions.json`),
# formatted by -i on the tree above it, must become its .expected.
mkdir -p "$work/walk/io.example.json"
cp "$here/cases/kotlin/type_two_modifier_lists.kt" "$work/walk/io.example.json/T.kt"
"$bin" -i -q "$work/walk" > /dev/null 2>&1
if cmp -s "$work/walk/io.example.json/T.kt" "$here/cases/kotlin/type_two_modifier_lists.expected"; then
  pass=$((pass + 1))
else
  echo "FAIL walk-dotted-dir: a file under io.example.json/ was not formatted"
  fail=$((fail + 1))
fi

# `// nishfmt off` keeps a region verbatim (clang-format has no such pragma).
printf 'int   a=1;\n// nishfmt off\nint   b =  2 ;\n// nishfmt on\nint   c=3;\n' > "$work/off.cpp"
printf 'int a = 1;\n// nishfmt off\nint   b =  2 ;\n// nishfmt on\nint c = 3;\n' > "$work/off.expected"
if "$bin" "$work/off.cpp" | cmp -s - "$work/off.expected"; then
  pass=$((pass + 1))
else
  echo "FAIL nishfmt-off: region not kept verbatim"
  "$bin" "$work/off.cpp" | diff - "$work/off.expected"
  fail=$((fail + 1))
fi

# A file a formatter panics on takes down only the worker formatting it: the
# rest of its chunk is still formatted, the file is left untouched and counted
# as skipped (and crashed), and the run prints its summary with the exit
# status it would have had. No formatter panics on any input (every module but
# src/main.ts is held to no panic), so the worker is taken down on purpose:
# NISHFMT_TEST_CRASH=.cs makes it panic on each file whose path ends in .cs,
# before formatting it. The other files are Rust.
crash_src='class S { string e {= $"x"; }\n'
good_src='fn  main( ) { let x=1; }\n'
good_out='fn main() {\n    let x = 1;\n}\n'
printf "$good_out" > "$work/good.expected"
# crash_tree <dir> <good files>: a.cs and g05z.cs panic, g01.rs ... format.
crash_tree() {
  rm -rf "$1" && mkdir -p "$1"
  printf "$crash_src" > "$1/a.cs"
  printf "$crash_src" > "$1/g05z.cs"
  for i in $(seq -w 1 "$2"); do printf "$good_src" > "$1/g$i.rs"; done
}
# crash_check <label> <dir> <good files> <stderr> <exit> <want exit> <want summary>
crash_check() {
  local ok=1 f
  case $4 in *"nishfmt: skipped $2/a.cs (formatter crashed)"*) ;; *) ok=0; echo "FAIL $1: no crash reported for a.cs" ;; esac
  case $4 in *"nishfmt: skipped $2/g05z.cs (formatter crashed)"*) ;; *) ok=0; echo "FAIL $1: no crash reported for g05z.cs" ;; esac
  case $4 in *"$7"*) ;; *) ok=0; echo "FAIL $1: no summary \"$7\"" ;; esac
  [ "$5" -eq "$6" ] || { ok=0; echo "FAIL $1: exit $5, want $6"; }
  for f in a g05z; do
    printf "$crash_src" | cmp -s - "$2/$f.cs" || { ok=0; echo "FAIL $1: $f.cs was rewritten"; }
  done
  local bad=0 want=$work/good.expected
  [ "$6" -eq 1 ] && { want=$work/good.src; printf "$good_src" > "$want"; }
  for i in $(seq -w 1 "$3"); do
    cmp -s "$2/g$i.rs" "$want" || bad=$((bad + 1))
  done
  [ "$bad" -eq 0 ] || { ok=0; echo "FAIL $1: $bad of the $3 other files not as expected"; }
  if [ "$ok" -eq 1 ]; then
    pass=$((pass + 1))
  else
    echo "$4" | head -20
    fail=$((fail + 1))
  fi
}
# Few files (one worker, one chunk) and many (chunks, several workers).
for run in "8 -i" "70 -i -j 1" "70 -i -j 3" "8 --check" "70 --check -j 2"; do
  set -- $run
  n=$1
  shift
  d=$work/crash
  crash_tree "$d" "$n"
  msg=$(NISHFMT_TEST_CRASH=.cs "$bin" "$@" "$d" 2>&1)
  st=$?
  want=0 verb=reformatted
  [ "$1" = --check ] && want=1 verb="would reformat"
  crash_check "crash ($run)" "$d" "$n" "$msg" "$st" "$want" \
    "nishfmt: $((n + 2)) files, $verb $n, skipped 2 (2 crashed);"
done
# One file to stdout: printed as it is.
printf "$crash_src" > "$work/crash1.cs"
out=$(NISHFMT_TEST_CRASH=.cs "$bin" "$work/crash1.cs" 2> "$work/err")
st=$?
if [ "$st" -eq 0 ] && [ "$out" = "$(printf "$crash_src")" ] && grep -qF "skipped $work/crash1.cs (formatter crashed)" "$work/err"; then
  pass=$((pass + 1))
else
  echo "FAIL crash (stdout): exit $st, $(cat "$work/err" | head -5)"
  fail=$((fail + 1))
fi

# A file whose formatter faults (src/core/fault.ts) is a nishfmt bug, as a
# crash is: it is left untouched, reported as `formatter fault` even under -q
# and to stdout, and counted as skipped (and faulted). No input is known to
# fault a formatter, so NISHFMT_TEST_FAULT=_fault.rs faults each file whose
# path ends with it, after its formatter ran. Those files would format
# (good_src), so a binary that ignores the fault rewrites them.
# fault_tree <dir> <good files>: a_fault.rs and g05_fault.rs fault, g01.rs ... format.
fault_tree() {
  rm -rf "$1" && mkdir -p "$1"
  printf "$good_src" > "$1/a_fault.rs"
  printf "$good_src" > "$1/g05_fault.rs"
  for i in $(seq -w 1 "$2"); do printf "$good_src" > "$1/g$i.rs"; done
}
# fault_check <label> <dir> <good files> <stderr> <exit> <want exit> <want summary or "">
fault_check() {
  local ok=1 f
  for f in a_fault g05_fault; do
    case $4 in *"nishfmt: skipped $2/$f.rs (formatter fault)"*) ;; *) ok=0; echo "FAIL $1: no fault reported for $f.rs" ;; esac
    printf "$good_src" | cmp -s - "$2/$f.rs" || { ok=0; echo "FAIL $1: $f.rs was rewritten"; }
  done
  if [ -n "$7" ]; then
    case $4 in *"$7"*) ;; *) ok=0; echo "FAIL $1: no summary \"$7\"" ;; esac
  fi
  [ "$5" -eq "$6" ] || { ok=0; echo "FAIL $1: exit $5, want $6"; }
  local bad=0 want=$work/good.expected
  [ "$6" -eq 1 ] && { want=$work/good.src; printf "$good_src" > "$want"; }
  for i in $(seq -w 1 "$3"); do
    cmp -s "$2/g$i.rs" "$want" || bad=$((bad + 1))
  done
  [ "$bad" -eq 0 ] || { ok=0; echo "FAIL $1: $bad of the $3 other files not as expected"; }
  if [ "$ok" -eq 1 ]; then
    pass=$((pass + 1))
  else
    echo "$4" | head -20
    fail=$((fail + 1))
  fi
}
for run in "8 -i" "70 -i -j 3" "8 --check" "8 -i -q"; do
  set -- $run
  n=$1
  shift
  d=$work/fault
  fault_tree "$d" "$n"
  msg=$(NISHFMT_TEST_FAULT=_fault.rs "$bin" "$@" "$d" 2>&1)
  st=$?
  want=0 verb=reformatted summary=
  [ "$1" = --check ] && want=1 verb="would reformat"
  [ "${2:-}" = -q ] || summary="nishfmt: $((n + 2)) files, $verb $n, skipped 2 (2 faulted);"
  fault_check "fault ($run)" "$d" "$n" "$msg" "$st" "$want" "$summary"
done
# A crash and a fault in one run: both counted.
d=$work/fault
fault_tree "$d" 8
printf "$crash_src" > "$d/a.cs"
msg=$(NISHFMT_TEST_CRASH=.cs NISHFMT_TEST_FAULT=_fault.rs "$bin" -i "$d" 2>&1)
st=$?
fault_check "fault and crash" "$d" 8 "$msg" "$st" 0 "nishfmt: 11 files, reformatted 8, skipped 3 (1 crashed, 2 faulted);"
# One file to stdout: printed as it is, the fault on stderr.
printf "$good_src" > "$work/one_fault.rs"
out=$(NISHFMT_TEST_FAULT=_fault.rs "$bin" "$work/one_fault.rs" 2> "$work/err")
st=$?
if [ "$st" -eq 0 ] && [ "$out" = "$(printf "$good_src")" ] && grep -qF "skipped $work/one_fault.rs (formatter fault)" "$work/err"; then
  pass=$((pass + 1))
else
  echo "FAIL fault (stdout): exit $st, $(cat "$work/err" | head -5)"
  fail=$((fail + 1))
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
