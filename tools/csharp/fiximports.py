#!/usr/bin/env python3
# Rewrites the `import { ... } from "./kinds";` of each src/csharp module to
# exactly the K_, Y_, F_ constants and cs* kind functions it uses (Nish has
# no namespace imports, and the generated kinds module is large).
#
#   fiximports.py src/csharp/*.ts
import re
import sys

kinds = open("src/csharp/kinds.ts").read()
exported = set(re.findall(r"^export const (\w+)", kinds, re.M))

for path in sys.argv[1:]:
    if path.endswith("kinds.ts"):
        continue
    src = open(path).read()
    body = re.sub(r'import\s*\{[^}]*\}\s*from\s*"\./kinds";\n?', "", src)
    used = sorted(set(re.findall(r"\b((?:K|Y|F)_\w+|csKind\w*|csType\w*|csKeyword)\b", body)) & exported)
    # names defined locally are not imported
    local = set(re.findall(r"^(?:export )?const (\w+)", body, re.M))
    used = [u for u in used if u not in local]
    if not used:
        if body != src:
            open(path, "w").write(body)
        continue
    imp = "import {\n" + "".join(f"  {u},\n" for u in used) + '} from "./kinds";\n'
    # insert before the first import, or after the leading comment block
    m = re.search(r"^import ", body, re.M)
    if m:
        body = body[: m.start()] + imp + body[m.start():]
    else:
        lines = body.split("\n")
        i = 0
        while i < len(lines) and (lines[i].startswith("//") or lines[i] == ""):
            i += 1
        body = "\n".join(lines[:i]) + "\n" + imp + "\n".join(lines[i:])
    if body != src:
        open(path, "w").write(body)
