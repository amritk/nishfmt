#!/usr/bin/env bash
# Clones the corpus repositories into $REPOS (default bench/work/repos), each
# at the commit the list $REPOLIST pins (default bench/corpus/repos.txt; one
# "<lang> <owner/name> <commit>" a line), so a corpus rebuilt anywhere holds
# the same files. A clone already there is left as is.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
REPOS=${REPOS:-$here/../work/repos}
list=$(realpath "${REPOLIST:-$here/repos.txt}") || exit 2
mkdir -p "$REPOS" && cd "$REPOS"
awk '{print $2, $3}' "$list" | xargs -P8 -n2 sh -c '
  d=$(echo "$0" | tr / _)
  [ -d "$d" ] && exit 0
  mkdir "$d" && cd "$d" && git init -q && git remote add origin "https://github.com/$0" &&
    git fetch -q --depth 1 origin "$1" && git checkout -q FETCH_HEAD || { echo "fetch.sh: $0 at $1 failed" >&2; exit 1; }'
