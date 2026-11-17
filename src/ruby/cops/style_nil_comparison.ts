// Style/NilComparison (EnforcedStyle: predicate).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_EFLIPFLOP,
  NT_ERANGE,
  NT_IF,
  NT_IFLIPFLOP,
  NT_IRANGE,
  NT_NIL,
  NT_OR,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAssignment, ssxFE, ssxFS, ssxHas, ssxIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

/** operator_expression? */
const ssxNcOperatorExpression = (src: RbSource, n: i32): boolean => {
  if (n === V_NIL) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_SEND) {
    const m = ssxMeth(src, n);
    if (ssxOperatorName(m) && m !== "[]" && m !== "[]=") {
      return true;
    }
  }
  if (t === NT_AND || t === NT_OR) {
    return true;
  }
  if (t === NT_IF && ssxHas(src, n, F_QUESTION)) {
    return true;
  }
  return t === NT_IRANGE || t === NT_ERANGE || t === NT_IFLIPFLOP || t === NT_EFLIPFLOP || ssxAssignment(src, n);
};

export class CopStyleNilComparison {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NilComparison");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      const recv = a.kid(n, 0);
      if ((m !== "==" && m !== "===") || recv === V_NIL || !ssxIs(src, a.kid(n, 2), NT_NIL)) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (k === null) {
        continue;
      }
      if (ssxNcOperatorExpression(src, recv)) {
        k.replace(a.exS(n), a.exE(n), `(${src.nodeSrc(recv)}).nil?`);
      } else {
        k.replace(a.exE(recv), a.exE(n), ".nil?");
      }
      this.c.commit(k);
    }
  }
}
