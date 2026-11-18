// Style/RedundantAssignment.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_END,
  F_KEYWORD,
  F_QUESTION,
  NT_BEGIN,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_IF,
  NT_KWBEGIN,
  NT_LVAR,
  NT_LVASGN,
  NT_RESBODY,
  NT_RESCUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxCommentsInLines, ssxHas, ssxLocIs } from "./style_syntax_help";

/** Style/RedundantAssignment. */
export class CopStyleRedundantAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantAssignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF) {
        this.check(src, a.kid(n, 2));
      } else if (t === NT_DEFS) {
        this.check(src, a.kid(n, 3));
      }
    }
  }

  /** check_branch. */
  private check(src: RbSource, n: i32): void {
    const a = src.a;
    if (n === V_NIL || !a.isNode(n)) {
      return;
    }
    const t = a.type(n);
    const k = a.nKid(n);
    if (t === NT_CASE || t === NT_CASE_MATCH) {
      for (let i = 1; i < k - 1; i++) {
        this.check(src, a.kid(a.kid(n, i), -1));
      }
      this.check(src, a.kid(n, k - 1));
    } else if (t === NT_IF) {
      const modifier =
        (ssxLocIs(src, n, F_KEYWORD, "if") || ssxLocIs(src, n, F_KEYWORD, "unless")) && !ssxHas(src, n, F_END);
      if (modifier || ssxHas(src, n, F_QUESTION)) {
        return;
      }
      const unless = ssxLocIs(src, n, F_KEYWORD, "unless");
      this.check(src, unless ? a.kid(n, 2) : a.kid(n, 1));
      this.check(src, unless ? a.kid(n, 1) : a.kid(n, 2));
    } else if (t === NT_RESCUE || t === NT_RESBODY) {
      for (let i = 0; i < k; i++) {
        if (a.isNode(a.kid(n, i))) {
          this.check(src, a.kid(n, i));
        }
      }
    } else if (t === NT_ENSURE) {
      this.check(src, a.kid(n, 1));
    } else if (t === NT_BEGIN || t === NT_KWBEGIN) {
      this.checkBegin(src, n);
    }
  }

  private checkBegin(src: RbSource, n: i32): void {
    const a = src.a;
    const k = a.nKid(n);
    // (... $(lvasgn _name _expression) (lvar _name))
    if (k >= 2) {
      const asg = a.kid(n, k - 2);
      const ref = a.kid(n, k - 1);
      if (
        a.isNode(asg) &&
        a.type(asg) === NT_LVASGN &&
        a.nKid(asg) === 2 &&
        a.isNode(ref) &&
        a.type(ref) === NT_LVAR &&
        a.nKid(ref) === 1 &&
        a.text(a.kid(asg, 0)) === a.text(a.kid(ref, 0))
      ) {
        const o = this.c.offense(a.exS(asg), a.exE(asg));
        if (o !== null) {
          if (!ssxCommentsInLines(src, src.line(a.exS(asg)), src.line(a.exS(ref)))) {
            const e = a.kid(asg, 1);
            o.replace(a.exS(asg), a.exE(asg), src.nodeSrc(e));
            o.remove(a.exS(ref), a.exE(ref));
          }
          this.c.commit(o);
        }
        return;
      }
    }
    if (k > 0) {
      this.check(src, a.kid(n, k - 1));
    }
  }
}
