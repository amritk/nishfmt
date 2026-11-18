// Style/Attr.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_BLOCK, NT_CLASS, NT_DEF, NT_FALSE, NT_SEND, NT_TRUE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxCommand, ssxDescendants, ssxFE, ssxFS, ssxIs, ssxMeth, ssxSymText } from "./style_syntax_help";

export class CopStyleAttr {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Attr");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || !ssxCommand(src, n, "attr") || a.nKid(n) < 3) {
        continue;
      }
      // allowed_context?
      let cn = src.parent(n);
      while (cn !== V_NIL && a.type(cn) !== NT_CLASS && a.type(cn) !== NT_BLOCK) {
        cn = src.parent(cn);
      }
      if (cn !== V_NIL) {
        const bs = a.kid(cn, 0);
        const classEval =
          a.type(cn) === NT_BLOCK &&
          ssxIs(src, bs, NT_SEND) &&
          a.nKid(bs) === 2 &&
          (ssxMeth(src, bs) === "class_eval" || ssxMeth(src, bs) === "module_eval");
        if (a.type(cn) !== NT_CLASS && !classEval) {
          continue;
        }
        let defines = false;
        for (const d of ssxDescendants(src, cn)) {
          if (a.type(d) === NT_DEF && ssxSymText(src, a.kid(d, 0)) === "attr") {
            defines = true;
            break;
          }
        }
        if (defines) {
          continue;
        }
      }
      const ss = ssxFS(src, n, F_SELECTOR);
      const se = ssxFE(src, n, F_SELECTOR);
      const k = this.c.offense(ss, se);
      if (k === null) {
        continue;
      }
      const last = a.kid(n, -1);
      const lastBool = ssxIs(src, last, NT_TRUE) || ssxIs(src, last, NT_FALSE);
      k.replace(ss, se, lastBool && ssxIs(src, last, NT_TRUE) ? "attr_accessor" : "attr_reader");
      const setter = a.kid(n, 3);
      if (setter !== V_NIL && (ssxIs(src, setter, NT_TRUE) || ssxIs(src, setter, NT_FALSE))) {
        k.remove(a.exE(a.kid(n, 2)), a.exE(setter));
      }
      this.c.commit(k);
    }
  }
}
