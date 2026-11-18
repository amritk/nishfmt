#!/usr/bin/env bash
# Builds one language's corpus from the clones in $REPOS: $CORPUS/<lang>/raw
# holds the sources as found, $CORPUS/<lang>/ref the reference tool's output at
# its default settings (Kotlin: ktfmt's --kotlinlang-style; C#: under
# $CORPUS/cs/.editorconfig, CSharpier's defaults with end_of_line = crlf), and
# $CORPUS/<lang>/failed.txt the files it rejected (left out of comparisons).
#
#   mk.sh cpp|java|kt|rb|swift|rust|dart|cs
#
# Tools, each from the environment or PATH: clang-format 18; $GJF and $KTFMT,
# the google-java-format 2.0.0 (run on JDK 21) and ktfmt 0.65
# all-dependencies jars (required for java and kt); rubocop 1.92.3;
# $SWIFTFORMAT (swiftformat 0.64.7); $RUSTFMT (rustfmt 1.10.0, default
# `rustfmt +1.99.1`); $DART (Dart SDK 3.14.1);
# $CSHARPIER (csharpier 1.4.0).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
lang=$1
REPOS=${REPOS:-$here/../work/repos} CORPUS=${CORPUS:-$here/../work/corpus}
GJF=${GJF:-} KTFMT=${KTFMT:-}
SWIFTFORMAT=${SWIFTFORMAT:-swiftformat}
if { [ "$lang" = java ] && [ -z "$GJF" ]; } || { [ "$lang" = kt ] && [ -z "$KTFMT" ]; }; then
  echo "mk.sh: set GJF (java) or KTFMT (kt) to the reference tool's all-dependencies jar" >&2
  exit 2
fi
DART=${DART:-dart}
CSHARPIER=${CSHARPIER:-csharpier}
export RUSTFMT=${RUSTFMT:-rustfmt +1.99.1}
case $lang in
  cpp) pat=(-name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.hpp' -o -name '*.hh' -o -name '*.hxx' -o -name '*.h') ;;
  java) pat=(-name '*.java') ;;
  kt) pat=(-name '*.kt' -o -name '*.kts') ;;
  rb) pat=(-name '*.rb') ;;
  swift) pat=(-name '*.swift') ;;
  rust) pat=(-name '*.rs') ;;
  dart) pat=(-name '*.dart') ;;
  cs) pat=(-name '*.cs') ;;
  *) echo "unknown language $lang" >&2; exit 2 ;;
esac
# C++: files over 250 KB (generated tables, fused single headers) take
# clang-format minutes each, so they are left out.
size=-2M
[ "$lang" = cpp ] && size=-250k
d=$CORPUS/$lang
rm -rf "$d" && mkdir -p "$d/raw"
for r in $(awk -v l="$lang" '$1==l{print $2}' "$here/repos.txt" | tr / _); do
  (cd "$REPOS" && find "$r" -type f \( "${pat[@]}" \) -not -path '*/.*/*' -size $size -print0 | tar --null -cf - -T -) \
    | (cd "$d/raw" && tar xf -)
done
# Ruby: a fixed sample of 2000 files (RuboCop is slow).
if [ "$lang" = rb ]; then
  (cd "$d/raw" && find . -type f | sort > ../all.txt)
  n=$(wc -l < "$d/all.txt"); step=$(( n / 2000 ))
  awk -v s="$step" 'NR % s == 0' "$d/all.txt" | head -2000 > "$d/keep.txt"
  (cd "$d/raw" && grep -vxF -f ../keep.txt ../all.txt | xargs -d '\n' rm -f && find . -type d -empty -delete)
fi
cp -r "$d/raw" "$d/ref"
: > "$d/failed.txt"
cd "$d/ref"
case $lang in
  cpp) find . -type f -print0 | xargs -0 -P"$(nproc)" -I{} sh -c \
         'clang-format -i --style="{BasedOnStyle: LLVM, ColumnLimit: 120}" "$1" 2>/dev/null || echo "$1" >> ../failed.txt' _ {} ;;
  # A batch that fails is redone file by file from the raw copies: neither
  # tool is idempotent on every file, so none may be formatted twice.
  java) find . -type f -print0 | xargs -0 -P"$(nproc)" -n 200 sh -c \
          'java -jar '"$GJF"' --replace "$@" 2>/dev/null || for f; do cp "../raw/$f" "$f"; java -jar '"$GJF"' --replace "$f" 2>/dev/null || echo "$f" >> ../failed.txt; done' _ ;;
  kt) find . -type f -print0 | xargs -0 -P"$(nproc)" -n 300 sh -c \
        'java -jar '"$KTFMT"' --kotlinlang-style "$@" >/dev/null 2>&1 || for f; do cp "../raw/$f" "$f"; java -jar '"$KTFMT"' --kotlinlang-style "$f" >/dev/null 2>&1 || echo "$f" >> ../failed.txt; done' _ ;;
  rb) printf 'AllCops:\n  TargetRubyVersion: 3.3\n' > ../rubocop.yml
      find . -type f -print0 | xargs -0 -P"$(nproc)" -n 100 sh -c \
        'rubocop -a -c ../rubocop.yml --cache false --format quiet "$@" >/dev/null 2>&1; true' _
      # RuboCop exits 1 when offenses remain; a file it cannot parse is a failure.
      find . -type f -print0 | xargs -0 ruby -e 'ARGV.each { |f| system("ruby", "-c", f, out: File::NULL, err: File::NULL) or puts f }' >> ../failed.txt ;;
  swift) "$SWIFTFORMAT" . --quiet 2> ../swiftformat.log; grep -o '[^ ]*\.swift' ../swiftformat.log | sed "s|^$PWD|.|" | sort -u >> ../failed.txt ;;
  # Through stdin, so rustfmt formats only that file, not its out-of-line modules.
  rust) find . -type f -print0 | xargs -0 -P"$(nproc)" -I{} sh -c \
          '$RUSTFMT --edition 2021 < "$1" > "$1.o" 2>/dev/null && mv "$1.o" "$1" || { rm -f "$1.o"; echo "$1" >> ../failed.txt; }' _ {} ;;
  dart) "$DART" format . > /dev/null 2> ../dartformat.log; grep -o '[^ ]*\.dart' ../dartformat.log | sort -u >> ../failed.txt ;;
  # The style's .editorconfig and an empty .git (a .gitignore boundary) sit
  # above ref/, so cmp.sh does not count them; see tools/csharp/NOTES.md.
  cs) printf '%s\n' 'root = true' '[*]' 'indent_style = space' '[*.cs]' 'indent_size = 4' 'tab_width = 4' \
        'end_of_line = crlf' 'insert_final_newline = true' > ../.editorconfig
      mkdir -p ../.git
      "$CSHARPIER" format . > ../csharpier.log 2>&1; grep -o '[^ ]*\.cs\b' ../csharpier.log | sort -u >> ../failed.txt ;;
esac
# Every entry is a path from here, starting "./" as cmp.sh expects.
sed -i -e 's|^\./||' -e 's|^|./|' ../failed.txt
sort -u -o ../failed.txt ../failed.txt
echo "$lang: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
