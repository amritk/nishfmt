#!/usr/bin/env python3
# Moves every `import { ... } from "<m>";` of a module to its top and merges
# the imports of each module (other than ./kinds, which fiximports.py owns).
#
#   hoistimports.py src/csharp/*.ts
import re
import sys

pat = re.compile(r'^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";\n?', re.M)
for path in sys.argv[1:]:
    src = open(path).read()
    mods = {}
    order = []
    for m in pat.finditer(src):
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        mod = m.group(2)
        if mod not in mods:
            mods[mod] = []
            order.append(mod)
        for n in names:
            if n not in mods[mod]:
                mods[mod].append(n)
    if not order:
        continue
    body = pat.sub("", src)
    lines = body.split("\n")
    i = 0
    while i < len(lines) and (lines[i].startswith("//") or lines[i] == ""):
        i += 1
    head = "\n".join(lines[:i]).rstrip("\n") + "\n\n"
    imps = ""
    for mod in order:
        imps += "import {\n" + "".join(f"  {n},\n" for n in mods[mod]) + f'}} from "{mod}";\n'
    out = head + imps + "\n" + "\n".join(lines[i:]).lstrip("\n")
    if out != src:
        open(path, "w").write(out)
