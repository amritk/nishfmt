#!/usr/bin/env bash
# Builds the harder C# corpus $CORPUS/cs2 from $CORPUS/cs/raw: raw is formatted
# with non-default options (an .editorconfig per directory, chosen from a hash
# of the directory's path), which gives cs2/raw; a copy of that formatted with
# the style alone gives cs2/ref. failed.txt lists the files either pass refused.
#
# Both passes run under the style's root $CORPUS/cs2/.editorconfig (CSharpier's
# defaults with end_of_line = crlf, as mk.sh cs writes). The per-directory files
# are not root, so CSharpier merges them with it; a .csharpierrc would replace
# it instead. So pass 1 writes CRLF too, and cs2/raw is CRLF input.
#
#   mkcs2.sh
set -uo pipefail
CORPUS=${CORPUS:-$(cd "$(dirname "$0")/../.." && pwd)/bench/work/corpus} CSHARPIER=${CSHARPIER:-csharpier}
export DOTNET_ROOT=${DOTNET_ROOT:-/usr/lib/dotnet}
d=$CORPUS/cs2
rm -rf "$d" && mkdir -p "$d" && cp -r "$CORPUS/cs/raw" "$d/raw"
# The empty .git is a worktree boundary, so no .gitignore above (this checkout's
# ignores bench/work/) hides the files from CSharpier.
mkdir -p "$d/.git"
printf '%s\n' 'root = true' '[*]' 'indent_style = space' '[*.cs]' 'indent_size = 4' 'tab_width = 4' \
  'end_of_line = crlf' 'insert_final_newline = true' > "$d/.editorconfig"
cd "$d/raw" || exit 1
opts=("max_line_length = 40" "max_line_length = 150" "indent_style = tab" "indent_size = 2")
# Every directory of depth 1 and 3 gets a config; where both apply they merge,
# the closer one winning each setting it sets.
find . -mindepth 1 -maxdepth 3 -type d | while read -r dir; do
  depth=$(echo "$dir" | tr -cd / | wc -c)
  [ "$depth" = 1 ] || [ "$depth" = 3 ] || continue
  h=$(echo "$dir" | cksum | cut -d' ' -f1)
  printf '[*.cs]\n%s\n' "${opts[$((h % 4))]}" > "$dir/.editorconfig"
done
"$CSHARPIER" format . > ../pass1.log 2>&1
find . -name .editorconfig -delete
cp -r "$d/raw" "$d/ref"
cd "$d/ref" || exit 1
if find . -name '.csharpierrc*' -o -name '.editorconfig' | grep -q .; then
  echo "config left in ref" >&2
  exit 1
fi
"$CSHARPIER" format . > ../pass2.log 2>&1
cat ../pass1.log ../pass2.log | grep -o '[^ ]*\.cs\b' | sort -u > ../failed.txt
echo "cs2: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
