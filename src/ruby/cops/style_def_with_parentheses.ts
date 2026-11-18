// Style/DefWithParentheses.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxEndless, ssxSingleLine } from "./style_syntax_help";

export class CopStyleDefWithParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/DefWithParentheses");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (a.nKid(args) !== 0 || a.exS(args) < 0) {
        continue;
      }
      const s = a.exS(args);
      const e = a.exE(args);
      // parentheses_required?
      const after = src.at(e);
      if (after !== 59) {
        if (ssxSingleLine(src, n) && !ssxEndless(src, n)) {
          continue;
        }
        if (after === 61) {
          continue;
        }
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(s, e);
        this.c.commit(k);
      }
    }
  }
}
