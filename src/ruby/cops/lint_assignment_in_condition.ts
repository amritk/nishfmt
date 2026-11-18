// Lint/AssignmentInCondition (AllowSafeAssignment: true). Its correction is
// unsafe, so it only detects.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_OPERATOR,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASGN,
  NT_CSEND,
  NT_CVASGN,
  NT_DEFINED_P,
  NT_GVASGN,
  NT_IF,
  NT_IVASGN,
  NT_LVASGN,
  NT_MASGN,
  NT_NUMBLOCK,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhAssignmentMethod } from "./style_body_help";
import { ssxFE, ssxFS, ssxHas, ssxMeth } from "./style_syntax_help";

/** EQUALS_ASSIGNMENTS. */
const laicEqualsAsgn = (t: i32): boolean =>
  t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN || t === NT_MASGN;

export class CopLintAssignmentInCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/AssignmentInCondition");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) {
        this.traverse(src, a.kid(n, 0));
      }
    }
  }

  private traverse(src: RbSource, n: i32): void {
    const a = src.a;
    if (!a.isNode(n)) {
      return;
    }
    const t = a.type(n);
    if (t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_DEFINED_P) {
      return;
    }
    if (t === NT_BEGIN || laicEqualsAsgn(t) || t === NT_SEND || t === NT_CSEND) {
      if (this.skipChildren(src, n)) {
        return;
      }
      if (!this.allowed(src, n)) {
        this.c.offense(ssxFS(src, n, F_OPERATOR), ssxFE(src, n, F_OPERATOR));
      }
    }
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (k !== V_NIL && a.isNode(k)) {
        this.traverse(src, k);
      }
    }
  }

  private allowed(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (a.type(n) === NT_BEGIN) {
      return true;
    }
    if (!ssxHas(src, n, F_OPERATOR)) {
      return true;
    }
    const p = src.parent(n);
    return p !== V_NIL && a.type(p) === NT_BEGIN && a.nKid(p) > 1;
  }

  private skipChildren(src: RbSource, n: i32): boolean {
    const a = src.a;
    const t = a.type(n);
    if ((t === NT_SEND || t === NT_CSEND) && !sbhAssignmentMethod(ssxMeth(src, n))) {
      return true;
    }
    if (t === NT_BEGIN && a.nKid(n) === 0) {
      return true;
    }
    // safe_assignment?: (begin {equals_asgn? #setter_method?})
    if (t === NT_BEGIN && a.nKid(n) === 1) {
      const k = a.kid(n, 0);
      if (a.isNode(k)) {
        const kt = a.type(k);
        if (laicEqualsAsgn(kt)) {
          return true;
        }
        if ((kt === NT_SEND || kt === NT_CSEND) && ssxHas(src, k, F_OPERATOR)) {
          return true;
        }
      }
    }
    return false;
  }
}
