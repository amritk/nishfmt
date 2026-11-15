// Lint/UnreachableCode (no correction): statements after a return, next,
// break, retry, redo, raise, fail, throw, exit, exit! or abort (or an if/case
// whose every branch ends in one), unless that method is redefined earlier or
// the code is inside an instance_eval block.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEF,
  NT_DEFS,
  NT_IF,
  NT_KWBEGIN,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_REDO,
  NT_RETRY,
  NT_RETURN,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhNilOrKernel } from "./lint_detect_help";
import { ssxDefName, ssxMeth } from "./style_syntax_help";

/** redefinable_flow_method?. */
const lucRedefinable = (m: string): boolean => m === "raise" || m === "fail" || m === "throw" || m === "exit" || m === "exit!" || m === "abort";

export class CopLintUnreachableCode {
  c: RbCop;
  redefined: string[];
  instanceEval: i32 = 0;

  constructor() {
    this.c = new RbCop("Lint/UnreachableCode");
    this.redefined = [];
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    this.redefined = [];
    this.instanceEval = 0;
    if (src.root !== V_NIL && src.a.isNode(src.root)) {
      this.walk(src, src.root);
    }
  }

  private instanceEvalBlock(src: RbSource, n: i32): boolean {
    return ssxMeth(src, src.a.kid(n, 0)) === "instance_eval";
  }

  private walk(src: RbSource, n: i32): void {
    const a = src.a;
    const t = a.type(n);
    if ((t === NT_BLOCK || t === NT_NUMBLOCK) && this.instanceEvalBlock(src, n)) {
      this.instanceEval = this.instanceEval + 1;
    }
    if (t === NT_BEGIN || t === NT_KWBEGIN) {
      let reached = false;
      const k = a.nKid(n);
      for (let i = 0; i < k; i++) {
        const e = a.kid(n, i);
        if (reached) {
          this.c.offense(a.exS(e), a.exE(e));
        } else if (i < k - 1 && this.flowExpression(src, e)) {
          reached = true;
        }
      }
    }
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (a.isNode(k)) {
        this.walk(src, k);
      }
    }
    // after_block (there is no after_numblock)
    if (t === NT_BLOCK && this.instanceEvalBlock(src, n)) {
      this.instanceEval = this.instanceEval - 1;
    }
  }

  /** flow_command?. */
  private flowCommand(src: RbSource, n: i32): boolean {
    const t = src.a.type(n);
    if (t === NT_RETURN || t === NT_NEXT || t === NT_BREAK || t === NT_RETRY || t === NT_REDO) {
      return true;
    }
    return t === NT_SEND && ldhNilOrKernel(src, src.a.kid(n, 0)) && lucRedefinable(ssxMeth(src, n));
  }

  /** report_on_flow_command?. */
  private report(src: RbSource, n: i32): boolean {
    if (src.a.type(n) !== NT_SEND || src.a.kid(n, 0) !== V_NIL) {
      return true;
    }
    if (this.instanceEval > 0) {
      return false;
    }
    const m = ssxMeth(src, n);
    for (const r of this.redefined) {
      if (r === m) {
        return false;
      }
    }
    return true;
  }

  /** flow_expression?. */
  private flowExpression(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (!a.isNode(n)) {
      return false;
    }
    if (this.flowCommand(src, n)) {
      return this.report(src, n);
    }
    const t = a.type(n);
    if (t === NT_BEGIN || t === NT_KWBEGIN) {
      for (let i = 0; i < a.nKid(n); i++) {
        if (this.flowExpression(src, a.kid(n, i))) {
          return true;
        }
      }
      return false;
    }
    if (t === NT_IF) {
      const x = a.kid(n, 1);
      const y = a.kid(n, 2);
      return x !== V_NIL && y !== V_NIL && this.flowExpression(src, x) && this.flowExpression(src, y);
    }
    if (t === NT_CASE || t === NT_CASE_MATCH) {
      const e = a.kid(n, -1);
      if (e === V_NIL || !this.flowExpression(src, e)) {
        return false;
      }
      for (let i = 1; i < a.nKid(n) - 1; i++) {
        const body = a.kid(a.kid(n, i), -1);
        if (body === V_NIL || !this.flowExpression(src, body)) {
          return false;
        }
      }
      return true;
    }
    if (t === NT_DEF || t === NT_DEFS) {
      const m = ssxDefName(src, n);
      if (lucRedefinable(m)) {
        this.redefined.push(m);
      }
    }
    return false;
  }
}
