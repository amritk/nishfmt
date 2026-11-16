#!/usr/bin/env python3
"""Compares two AST dumps (tools/dart/astdump.dart vs fastfmt's FFDTDUMP=ast).

    astcmp.py theirs.txt mine.txt

Prints one line per file that differs: the path and the first differing line
of each side, then a summary.
"""
import sys


def read(path):
    files = {}
    cur = None
    lines = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("FILE "):
                if cur is not None:
                    files[cur] = lines
                cur = line[5:]
                lines = []
            else:
                lines.append(line)
    if cur is not None:
        files[cur] = lines
    return files


def main():
    theirs = read(sys.argv[1])
    mine = read(sys.argv[2])
    same = differ = their_err = my_err = 0
    for path in sorted(theirs):
        a = theirs[path]
        b = mine.get(path)
        if b is None:
            continue
        if a == ["ERROR"]:
            their_err += 1
            if b != ["ERROR"]:
                print(f"{path}: analyzer rejects, we accept")
            continue
        if b == ["ERROR"]:
            my_err += 1
            print(f"{path}: we reject")
            continue
        if a == b:
            same += 1
            continue
        differ += 1
        for i in range(max(len(a), len(b))):
            x = a[i] if i < len(a) else "<end>"
            y = b[i] if i < len(b) else "<end>"
            if x != y:
                print(f"{path}:{i}: analyzer `{x}` ours `{y}`")
                break
    print(f"same {same}, differ {differ}, we reject {my_err}, analyzer rejects {their_err}")


main()
