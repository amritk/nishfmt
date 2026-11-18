// Style/MethodDefParentheses (EnforcedStyle: require_parentheses).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_NAME, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxFE, ssxLocIs } from "./style_syntax_help";

export class CopStyleMethodDefParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MethodDefParentheses");
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
      // arguments_without_parentheses?
      if (a.nKid(args) === 0 || ssxLocIs(src, args, F_END, ")")) {
        continue;
      }
      const s = a.exS(args);
      const e = a.exE(args);
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      // range_before_arguments: from the name to the arguments, cut at the last line break.
      const ns = ssxFE(src, n, F_NAME);
      let re = s;
      for (let p = s - 1; p >= ns; p--) {
        if (src.at(p) === 10) {
          re = p;
          break;
        }
      }
      k.replace(ns, re, "(");
      k.insertAfter(s, e, ")");
      this.c.commit(k);
    }
  }
}
