// Style/SelfAssignment.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, NT_AND, NT_BEGIN, NT_CVAR, NT_CVASGN, NT_IVAR, NT_IVASGN, NT_LVAR, NT_LVASGN, NT_OR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxInList, ssxIs, ssxMeth, ssxSymText } from "./style_syntax_help";

/** unparenthesized: through `begin` nodes with one child. */
const ssxSaUnparen = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (ssxIs(src, n, NT_BEGIN) && src.a.nKid(n) === 1) {
    n = src.a.kid(n, 0);
  }
  return n;
};

/** n == s(varType, name). */
const ssxSaIsVar = (src: RbSource, n: i32, varType: i32, name: string): boolean =>
  ssxIs(src, n, varType) && src.a.nKid(n) === 1 && ssxSymText(src, src.a.kid(n, 0)) === name;

export class CopStyleSelfAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SelfAssignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let vt = -1;
      if (t === NT_LVASGN) {
        vt = NT_LVAR;
      } else if (t === NT_IVASGN) {
        vt = NT_IVAR;
      } else if (t === NT_CVASGN) {
        vt = NT_CVAR;
      } else {
        continue;
      }
      const expr = a.kid(n, 1);
      if (expr === V_NIL) {
        continue;
      }
      const rhs = ssxSaUnparen(src, expr);
      const name = ssxSymText(src, a.kid(n, 0));
      let op = "";
      let newRhs = V_NIL;
      if (ssxIs(src, rhs, NT_SEND) && a.nKid(rhs) === 3) {
        const m = ssxMeth(src, rhs);
        if (!ssxInList(" + - * ** / % ^ << >> | & ", m) || !ssxSaIsVar(src, a.kid(rhs, 0), vt, name)) {
          continue;
        }
        op = m;
        newRhs = a.kid(rhs, 2);
      } else if (ssxIs(src, rhs, NT_AND) || ssxIs(src, rhs, NT_OR)) {
        const o = src.src(ssxFS(src, rhs, F_OPERATOR), ssxFE(src, rhs, F_OPERATOR));
        if ((o !== "&&" && o !== "||") || !ssxSaIsVar(src, a.kid(rhs, 0), vt, name)) {
          continue;
        }
        op = o;
        newRhs = a.kid(rhs, 1);
      } else {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const os = ssxFS(src, n, F_OPERATOR);
      k.insertBefore(os, ssxFE(src, n, F_OPERATOR), op);
      k.replace(a.exS(expr), a.exE(expr), src.nodeSrc(newRhs));
      this.c.commit(k);
    }
  }
}
