// Style/MixinUsage (detection only: no correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CONST, NT_DEF, NT_IF, NT_KWBEGIN, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** in_top_level_scope?: the root, or inside kwbegin/begin/if/def nodes that are. */
const rbMixinUsageTopLevel = (src: RbSource, n: i32): boolean => {
  let x = n;
  while (true) {
    const p = src.parent(x);
    if (p === V_NIL) {
      return true;
    }
    const t = src.a.type(p);
    if (t !== NT_KWBEGIN && t !== NT_BEGIN && t !== NT_IF && t !== NT_DEF) {
      return false;
    }
    x = p;
  }
};

export class CopStyleMixinUsage {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MixinUsage");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || a.kid(n, 0) !== V_NIL) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "include" && m !== "extend" && m !== "prepend") {
        continue;
      }
      // (send nil? {...} const+)
      if (a.nKid(n) < 3) {
        continue;
      }
      let allConst = true;
      for (let i = 2; i < a.nKid(n); i++) {
        if (!ssxIs(src, a.kid(n, i), NT_CONST)) {
          allConst = false;
        }
      }
      if (allConst && rbMixinUsageTopLevel(src, n)) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
