#!/usr/bin/env bash
# Clones the corpus repositories (repos.txt: "<lang> <owner/name>") into $REPOS
# (default /work/repos), one shallow clone each, and records their commits.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
REPOS=${REPOS:-/work/repos}
mkdir -p "$REPOS" && cd "$REPOS"
awk '{print $2}' "$here/repos.txt" | xargs -P8 -I{} sh -c \
  'd=$(echo {} | tr / _); [ -d "$d" ] || git clone -q --depth 1 https://github.com/{} "$d"'
for r in */; do (cd "$r" && echo "${r%/} $(git rev-parse HEAD)"); done > COMMITS.txt
