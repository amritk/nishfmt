// Layout/MultilineOperationIndentation (EnforcedStyle: aligned).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, sub32 } from "../../core/arr";
import { F_DOT, F_SELECTOR, NT_AND, NT_OR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import {
  rmxArgumentInMethodCall,
  rmxCorrectIndentation,
  rmxIndentation,
  rmxKwNode,
  rmxLeftHandSide,
  rmxNotForThisCop,
  rmxOperatorMethod,
  rmxPartOfAssignmentRhs,
} from "./layout_multiline_expr_help";
import {
  RmlAlignCorr,
  rmlBeginsItsLine,
  rmlDefModifier,
  rmlExtractRhs,
  rmlFirstArg,
  rmlIsCall,
} from "./layout_multiline_help";

export class CopLayoutMultilineOperationIndentation {
  c: RbCop;
  corr: RmlAlignCorr | null = null;

  constructor() {
    this.c = new RbCop("Layout/MultilineOperationIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.corr = new RmlAlignCorr(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_AND || t === NT_OR) {
        const rhs = a.kid(n, 1);
        this.check(src, n, a.kid(n, 0), a.exS(rhs), a.exE(rhs));
      } else if (rmlIsCall(src, n)) {
        // MultilineExpressionIndentation#on_send
        const recv = a.kid(n, 0);
        if (recv === V_NIL || rnMethod(src, n) === "[]") {
          continue;
        }
        // relevant_node?
        if (t === NT_SEND && this.unary(src, n)) {
          continue;
        }
        if (rnHas(src, n, F_DOT)) {
          continue;
        }
        const lhs = rmxLeftHandSide(src, recv);
        const fa = rmlFirstArg(src, n);
        if (fa === V_NIL) {
          continue;
        }
        this.check(src, n, lhs, a.exS(fa), a.exE(fa));
      }
    }
  }

  /** SendNode#unary_operation? */
  private unary(src: RbSource, n: i32): boolean {
    if (!rnHas(src, n, F_SELECTOR)) {
      return false;
    }
    return rmxOperatorMethod(rnMethod(src, n)) && src.a.exS(n) === rnS(src, n, F_SELECTOR);
  }

  /** offending_range and the offense it gives. */
  private check(src: RbSource, n: i32, lhs: i32, rs: i32, re: i32): void {
    if (!rmlBeginsItsLine(src, rs) || rmxNotForThisCop(src, n)) {
      return;
    }
    const col = this.shouldAlign(src, n, rs, re)
      ? src.column(src.a.exS(n))
      : add32(rmxIndentation(src, lhs), rmxCorrectIndentation(src, n));
    const delta = sub32(col, src.column(rs));
    if (delta === 0) {
      return;
    }
    const k = this.c.offense(rs, re);
    const corr = this.corr;
    if (k !== null && corr !== null) {
      corr.correct(k, rs, re, delta);
      this.c.commit(k);
    }
  }

  /** should_align? with the aligned style. */
  private shouldAlign(src: RbSource, n: i32, rs: i32, re: i32): boolean {
    const asg = rmxPartOfAssignmentRhs(src, n, rs, re);
    if (asg !== V_NIL) {
      const r = rmlExtractRhs(src, asg);
      if (r !== V_NIL && rmlBeginsItsLine(src, src.a.exS(r))) {
        return true;
      }
    }
    if (rmxKwNode(src, n) !== V_NIL || asg !== V_NIL) {
      return true;
    }
    const m = rmxArgumentInMethodCall(src, n, false);
    return m !== V_NIL && rmlDefModifier(src, m) === V_NIL;
  }
}
