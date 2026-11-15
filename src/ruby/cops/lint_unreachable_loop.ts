// Lint/UnreachableLoop (AllowedPatterns: [/(exactly|at_least|at_most)\(\d+\)\.times/];
// no correction): a loop (or a block on a looping method) whose body always
// breaks out in its first iteration.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_FOR,
  NT_IF,
  NT_KWBEGIN,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_REDO,
  NT_RETURN,
  NT_SEND,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhEnumerableMethod, ldhEnumeratorMethod, ldhLoopKeyword, ldhNilOrKernel, ldhType } from "./lint_detect_help";
import { scnLeftSiblings } from "./style_cond_help";
import { ssxDescendants, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** AllowedPatterns: /(exactly|at_least|at_most)\(\d+\)\.times/ anywhere in the text. */
const lulAllowed = (s: string): boolean => {
  const words: string[] = ["exactly(", "at_least(", "at_most("];
  for (const w of words) {
    let from = 0;
    while (true) {
      const i = s.indexOf(w, from);
      if (i < 0) {
        break;
      }
      let j = i + toI32(w.length);
      const d0 = j;
      while (j < toI32(s.length) && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) {
        j++;
      }
      if (j > d0 && s.substring(j, toI32(s.length)).startsWith(").times")) {
        return true;
      }
      from = i + 1;
    }
  }
  return false;
};

/** loop_method?. */
const lulLoopMethod = (src: RbSource, n: i32): boolean => {
  if (!ssxIsAnyBlock(src, n)) {
    return false;
  }
  const s = src.a.kid(n, 0);
  // BlockNode#send_node; a block on `super` has no method of these names
  const m = ssxIsCall(src, s) ? ssxMeth(src, s) : "";
  const loopable = ldhEnumerableMethod(m) || ldhEnumeratorMethod(m) || m === "loop";
  return loopable && !lulAllowed(src.src(src.a.exS(s), src.a.exE(s)));
};

/** preceded_by_continue_statement?. */
const lulPrecededByContinue = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  for (const sib of scnLeftSiblings(src, n)) {
    if (!a.isNode(sib)) {
      continue;
    }
    if (ldhLoopKeyword(src, sib) || lulLoopMethod(src, sib)) {
      continue;
    }
    for (const d of ssxDescendants(src, sib)) {
      const t = a.type(d);
      if (t === NT_NEXT || t === NT_REDO) {
        return true;
      }
    }
  }
  return false;
};

/** break_command?. */
const lulBreakCommand = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (t === NT_RETURN || t === NT_BREAK) {
    return true;
  }
  if (t !== NT_SEND || !ldhNilOrKernel(src, src.a.kid(n, 0))) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "raise" || m === "fail" || m === "throw" || m === "exit" || m === "exit!" || m === "abort";
};

/** break_statement?. */
const lulBreakStatement = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  if (lulBreakCommand(src, n)) {
    return true;
  }
  const t = a.type(n);
  if (t === NT_BEGIN || t === NT_KWBEGIN) {
    for (let i = 0; i < a.nKid(n); i++) {
      const s = a.kid(n, i);
      if (lulBreakStatement(src, s)) {
        return !lulPrecededByContinue(src, s);
      }
    }
    return false;
  }
  if (t === NT_IF) {
    const x = a.kid(n, 1);
    const y = a.kid(n, 2);
    return x !== V_NIL && y !== V_NIL && lulBreakStatement(src, x) && lulBreakStatement(src, y);
  }
  if (t === NT_CASE || t === NT_CASE_MATCH) {
    const e = a.kid(n, -1);
    if (e === V_NIL || !lulBreakStatement(src, e)) {
      return false;
    }
    for (let i = 1; i < a.nKid(n) - 1; i++) {
      const body = a.kid(a.kid(n, i), -1);
      if (body === V_NIL || !lulBreakStatement(src, body)) {
        return false;
      }
    }
    return true;
  }
  return false;
};

/** conditional_continue_keyword?: the last `or` under the statement has a next/redo right side. */
const lulConditionalContinue = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  let last = V_NIL;
  for (const d of ssxDescendants(src, n)) {
    if (a.type(d) === NT_OR) {
      last = d;
    }
  }
  if (last === V_NIL) {
    return false;
  }
  const t = ldhType(src, a.kid(last, 1));
  return t === NT_NEXT || t === NT_REDO;
};

export class CopLintUnreachableLoop {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UnreachableLoop");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let body = V_NIL;
      if (t === NT_WHILE || t === NT_UNTIL || t === NT_WHILE_POST || t === NT_UNTIL_POST) {
        body = a.kid(n, 1);
      } else if (t === NT_FOR) {
        body = a.kid(n, 2);
      } else if ((t === NT_BLOCK || t === NT_NUMBLOCK) && lulLoopMethod(src, n)) {
        body = a.kid(n, 2);
      } else {
        continue;
      }
      // statements
      const stmts: i32[] = [];
      if (ldhType(src, body) === NT_BEGIN) {
        for (let i = 0; i < a.nKid(body); i++) {
          stmts.push(a.kid(body, i));
        }
      } else if (body !== V_NIL) {
        stmts.push(body);
      }
      let br = V_NIL;
      for (const s of stmts) {
        if (lulBreakStatement(src, s)) {
          br = s;
          break;
        }
      }
      if (br === V_NIL) {
        continue;
      }
      if (!lulPrecededByContinue(src, br) && !lulConditionalContinue(src, br)) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
