// Style/CombinableLoops (unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_FOR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { rbNodeReceiver } from "./style_float_division";
import { ssxIs, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** The block's method name ("" when its send is no call). */
const rbClMethod = (src: RbSource, n: i32): string =>
  ssxIsCall(src, src.a.kid(n, 0)) ? ssxMeth(src, src.a.kid(n, 0)) : "";

export class CopStyleCombinableLoops {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CombinableLoops");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const blk = ssxIsAnyBlock(src, n);
      const isFor = ssxIs(src, n, NT_FOR);
      if (!blk && !isFor) {
        continue;
      }
      const p = src.parent(n);
      if (!ssxIs(src, p, NT_BEGIN)) {
        continue;
      }
      // left_sibling
      let sib = V_NIL;
      for (let i = 1; i < a.nKid(p); i++) {
        if (a.kid(p, i) === n) {
          sib = a.kid(p, i - 1);
        }
      }
      if (blk) {
        const m = rbClMethod(src, n);
        if (!(m.startsWith("each") || m.endsWith("_each"))) {
          continue;
        }
        if (sib === V_NIL || !ssxIsAnyBlock(src, sib) || rbClMethod(src, sib) !== m) {
          continue;
        }
        if (!vfSameNode(src, rbNodeReceiver(src, sib), rbNodeReceiver(src, n))) {
          continue;
        }
        // send_node.arguments ==
        const s1 = a.kid(sib, 0);
        const s2 = a.kid(n, 0);
        if (a.nKid(s1) !== a.nKid(s2)) {
          continue;
        }
        let same = true;
        for (let i = 2; i < a.nKid(s1); i++) {
          if (!vfSameNode(src, a.kid(s1, i), a.kid(s2, i))) {
            same = false;
          }
        }
        if (!same || a.kid(n, 2) === V_NIL || a.kid(sib, 2) === V_NIL) {
          continue;
        }
        this.c.offense(a.exS(n), a.exE(n));
      } else {
        if (!ssxIs(src, sib, NT_FOR) || !vfSameNode(src, a.kid(n, 1), a.kid(sib, 1))) {
          continue;
        }
        if (a.kid(n, 2) === V_NIL || a.kid(sib, 2) === V_NIL) {
          continue;
        }
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
