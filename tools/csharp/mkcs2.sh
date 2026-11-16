#!/usr/bin/env bash
# Builds the harder C# corpus $CORPUS/cs2 from $CORPUS/cs/raw: raw is formatted
# with non-default options (a .csharpierrc per directory, chosen from a hash of
# the directory's path), which gives cs2/raw; a copy of that formatted with the
# default options gives cs2/ref. failed.txt lists the files either pass refused.
#
#   mkcs2.sh
set -uo pipefail
CORPUS=${CORPUS:-/work/c} CSHARPIER=${CSHARPIER:-csharpier}
export DOTNET_ROOT=${DOTNET_ROOT:-/usr/lib/dotnet}
d=$CORPUS/cs2
rm -rf "$d" && mkdir -p "$d" && cp -r "$CORPUS/cs/raw" "$d/raw"
cd "$d/raw" || exit 1
opts=("printWidth: 40" "printWidth: 150" "useTabs: true" "indentSize: 2")
# Every directory of depth 1 and 3 gets a config; the closest one wins.
find . -mindepth 1 -maxdepth 3 -type d | while read -r dir; do
  depth=$(echo "$dir" | tr -cd / | wc -c)
  [ "$depth" = 1 ] || [ "$depth" = 3 ] || continue
  h=$(echo "$dir" | cksum | cut -d' ' -f1)
  echo "${opts[$((h % 4))]}" > "$dir/.csharpierrc"
done
"$CSHARPIER" format . > ../pass1.log 2>&1
find . -name .csharpierrc -delete
cp -r "$d/raw" "$d/ref"
cd "$d/ref" || exit 1
if find . -name '.csharpierrc' -o -name '.editorconfig' | grep -q .; then
  echo "config left in ref" >&2
  exit 1
fi
"$CSHARPIER" format . > ../pass2.log 2>&1
cat ../pass1.log ../pass2.log | grep -o '[^ ]*\.cs\b' | sort -u > ../failed.txt
echo "cs2: $(find . -type f | wc -l) files, reference failed on $(wc -l < ../failed.txt)"
