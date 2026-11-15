#!/usr/bin/env python3
"""Rewrite `rbAt(TABLE, expr)` as `TABLE_D[expr]` (the decoded module storage)
in the given TypeScript files, and import the `_D` names they now use.

    python3 direct.py lexer_tmpl.ts parser_tmpl.ts ../../src/ruby/lexer.ts ...
"""
import re
import sys

for path in sys.argv[1:]:
    s = open(path).read()
    out = []
    i = 0
    used = set()
    while True:
        j = s.find("rbAt(", i)
        if j < 0:
            out.append(s[i:])
            break
        m = re.match(r"rbAt\((R[LSP]_[A-Z_]+), ", s[j:])
        if not m:
            out.append(s[i:j + 5])
            i = j + 5
            continue
        name = m.group(1)
        k = j + m.end()
        depth = 1
        p = k
        while depth:
            c = s[p]
            depth += (c == "(") - (c == ")")
            p += 1
        out.append(s[i:j] + f"{name}_D[{s[k:p - 1]}]")
        used.add(name + "_D")
        i = p
    s = "".join(out)
    if used:
        # Add the names to the import list from ./tables (multi-line form).
        m = re.search(r"import \{\n([^{}]*?)\n\} from \"\./tables\";", s)
        names = set(x.strip().rstrip(",") for x in m.group(1).split("\n") if x.strip())
        names |= used
        names.add("rbTablesInit")
        body = "\n".join(f"  {n}," for n in sorted(names))
        s = s[: m.start()] + "import {\n" + body + "\n} from \"./tables\";" + s[m.end():]
    open(path, "w").write(s)
    print(path, len(used))
