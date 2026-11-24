// Lint/SelfAssignment (AllowRBSInlineAnnotation: false; no correction):
// `x = x`, `@x = @x`, `A = A`, `a, b = a, b`, `x ||= x`, `foo.bar = foo.bar`,
// `h[k] = h[k]`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_AND_ASGN,
  NT_ARRAY,
  NT_CASGN,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_CVASGN,
  NT_GVAR,
  NT_GVASGN,
  NT_IVAR,
  NT_IVASGN,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_OR_ASGN,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { ldhAssignmentMethod, ldhType } from "./lint_detect_help";
import { ssxIsCall, ssxMeth } from "./style_syntax_help";

/** ASSIGNMENT_TYPE_TO_RHS_TYPE, or -1. */
const lsaRhsType = (t: i32): i32 => {
  if (t === NT_LVASGN) {
    return NT_LVAR;
  }
  if (t === NT_IVASGN) {
    return NT_IVAR;
  }
  if (t === NT_CVASGN) {
    return NT_CVAR;
  }
  if (t === NT_GVASGN) {
    return NT_GVAR;
  }
  return -1;
};

/** `==` on two handles that may be nil. */
const lsaEq = (src: RbSource, x: i32, y: i32): boolean => {
  if (x === V_NIL || y === V_NIL) {
    return x === y;
  }
  return vfSameNode(src, x, y);
};

/** Whether two argument lists (kids from `from`) are equal, element by element. */
const lsaArgsEq = (src: RbSource, x: i32, xe: i32, y: i32): boolean => {
  const a = src.a;
  if (xe !== a.nKid(y)) {
    return false;
  }
  for (let i = 2; i < xe; i++) {
    if (!lsaEq(src, a.kid(x, i), a.kid(y, i))) {
      return false;
    }
  }
  return true;
};

/** Whether none of x's kids in [2, xe) is a call. */
const lsaNoCalls = (src: RbSource, x: i32, xe: i32): boolean => {
  for (let i = 2; i < xe; i++) {
    if (ssxIsCall(src, src.a.kid(x, i))) {
      return false;
    }
  }
  return true;
};

/** rhs_matches_lhs?. */
const lsaRhsMatches = (src: RbSource, rhs: i32, lhs: i32): boolean => {
  const a = src.a;
  if (!a.isNode(rhs) || !a.isNode(lhs)) {
    return false;
  }
  const want = lsaRhsType(a.type(lhs));
  return want >= 0 && a.type(rhs) === want && lsaEq(src, a.kid(rhs, 0), a.kid(lhs, 0));
};

/** The same constant: namespace == namespace and the same short name. */
const lsaSameConst = (src: RbSource, lhs: i32, rhs: i32): boolean =>
  ldhType(src, rhs) === NT_CONST &&
  lsaEq(src, src.a.kid(lhs, 0), src.a.kid(rhs, 0)) &&
  src.a.text(src.a.kid(lhs, 1)) === src.a.text(src.a.kid(rhs, 1));

export class CopLintSelfAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SelfAssignment");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let hit = false;
      if (t === NT_SEND || t === NT_CSEND) {
        hit = this.send(src, n);
      } else if (lsaRhsType(t) >= 0) {
        const rhs = a.kid(n, 1);
        if (a.isNode(rhs) && a.type(rhs) === lsaRhsType(t)) {
          hit = src.src(a.exS(rhs), a.exE(rhs)) === a.text(a.kid(n, 0));
        }
      } else if (t === NT_CASGN) {
        const rhs = a.kid(n, 2);
        hit = ldhType(src, rhs) === NT_CONST && lsaSameConst(src, n, rhs);
      } else if (t === NT_MASGN) {
        const lhs = a.kid(n, 0);
        const rhs = a.kid(n, 1);
        if (ldhType(src, rhs) === NT_ARRAY && a.nKid(lhs) === a.nKid(rhs)) {
          hit = true;
          for (let i = 0; i < a.nKid(lhs); i++) {
            if (!lsaRhsMatches(src, a.kid(rhs, i), a.kid(lhs, i))) {
              hit = false;
            }
          }
        }
      } else if (t === NT_OR_ASGN || t === NT_AND_ASGN) {
        const lhs = a.kid(n, 0);
        const rhs = a.kid(n, 1);
        const lt = ldhType(src, lhs);
        if (lt === NT_CASGN) {
          hit = lsaSameConst(src, lhs, rhs);
        } else if (lt === NT_SEND || lt === NT_CSEND) {
          // reader_self_assignment?
          hit =
            ldhType(src, rhs) === lt &&
            ssxMeth(src, lhs) === ssxMeth(src, rhs) &&
            lsaEq(src, a.kid(lhs, 0), a.kid(rhs, 0)) &&
            lsaArgsEq(src, lhs, a.nKid(lhs), rhs) &&
            lsaNoCalls(src, lhs, a.nKid(lhs));
        } else {
          hit = lsaRhsMatches(src, rhs, lhs);
        }
      }
      if (hit) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }

  /** on_send: handle_key_assignment / handle_attribute_assignment. */
  private send(src: RbSource, n: i32): boolean {
    const a = src.a;
    const m = ssxMeth(src, n);
    const k = a.nKid(n);
    if (m === "[]=") {
      if (k < 3) {
        return false;
      }
      const v = a.kid(n, -1);
      return (
        ssxIsCall(src, v) &&
        ssxMeth(src, v) === "[]" &&
        lsaEq(src, a.kid(n, 0), a.kid(v, 0)) &&
        lsaNoCalls(src, n, k - 1) &&
        lsaArgsEq(src, n, k - 1, v)
      );
    }
    if (!ldhAssignmentMethod(m) || k !== 3) {
      return false;
    }
    const f = a.kid(n, 2);
    if (!ssxIsCall(src, f) || a.nKid(f) !== 2) {
      return false;
    }
    return lsaEq(src, a.kid(n, 0), a.kid(f, 0)) && ssxMeth(src, f) === m.substring(0, toI32(m.length) - 1);
  }
}
