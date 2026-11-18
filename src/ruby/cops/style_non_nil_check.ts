// Style/NonNilCheck (IncludeSemanticChanges: false; Style/NilComparison: predicate).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BEGIN,
  NT_DEF,
  NT_DEFS,
  NT_EFLIPFLOP,
  NT_ERANGE,
  NT_IF,
  NT_IFLIPFLOP,
  NT_IRANGE,
  NT_NIL,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnOperatorKeyword, scnTernary } from "./style_cond_help";
import { ssxAssignment, ssxDefBody, ssxDefName, ssxIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

export class CopStyleNonNilCheck {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NonNilCheck");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const ignored = new Set<i32>();
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        const body = ssxDefBody(src, n);
        if (ssxDefName(src, n).endsWith("?") && body !== V_NIL) {
          ignored.add(ssxIs(src, body, NT_BEGIN) ? a.kid(body, -1) : body);
        }
        continue;
      }
      if (t !== NT_SEND || ignored.has(n)) {
        continue;
      }
      // not_equal_to_nil?: (send _ :!= nil)
      if (ssxMeth(src, n) !== "!=" || a.nKid(n) !== 3 || !ssxIs(src, a.kid(n, 2), NT_NIL)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const r = a.kid(n, 0);
      const rs = this.operatorExpression(src, r) ? `(${src.nodeSrc(r)})` : src.nodeSrc(r);
      k.replace(a.exS(n), a.exE(n), `!${rs}.nil?`);
      this.c.commit(k);
    }
  }

  /** operator_expression? */
  private operatorExpression(src: RbSource, n: i32): boolean {
    if (!src.a.isNode(n)) {
      return false;
    }
    const t = src.a.type(n);
    if (scnOperatorKeyword(src, n) || (t === NT_SEND && ssxOperatorName(ssxMeth(src, n)))) {
      return true;
    }
    if (t === NT_IF && scnTernary(src, n)) {
      return true;
    }
    if (t === NT_IRANGE || t === NT_ERANGE || t === NT_IFLIPFLOP || t === NT_EFLIPFLOP) {
      return true;
    }
    return ssxAssignment(src, n);
  }
}
