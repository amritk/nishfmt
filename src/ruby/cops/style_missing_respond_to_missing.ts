// Style/MissingRespondToMissing (no project index; detection only: no
// correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CLASS, NT_DEF, NT_DEFS, NT_MODULE, NT_SCLASS, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefName, ssxDescendants } from "./style_syntax_help";

/** enclosing_scope: the nearest class, module or sclass ancestor (V_NIL when none). */
const rbMrtmScope = (src: RbSource, n: i32): i32 => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = src.a.type(p);
    if (t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
      return p;
    }
    p = src.parent(p);
  }
  return V_NIL;
};

export class CopStyleMissingRespondToMissing {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MissingRespondToMissing");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      if ((t !== NT_DEF && t !== NT_DEFS) || ssxDefName(src, n) !== "method_missing") {
        continue;
      }
      const scope = rbMrtmScope(src, n);
      const root = scope !== V_NIL ? scope : src.parent(n);
      let found = false;
      if (root !== V_NIL) {
        for (const d of ssxDescendants(src, root)) {
          if (a.type(d) === t && ssxDefName(src, d) === "respond_to_missing?" && rbMrtmScope(src, d) === scope) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
