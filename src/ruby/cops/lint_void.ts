// Lint/Void (CheckForMethodsWithNoSideEffects: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_DOT,
  F_END,
  F_HEREDOC_END,
  F_KEYWORD,
  F_NAME,
  F_QUESTION,
  F_SELECTOR,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_CASE,
  NT_CASE_MATCH,
  NT_COMPLEX,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_ENSURE,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_FOR,
  NT_FORWARDED_ARGS,
  NT_FORWARDED_RESTARG,
  NT_GVAR,
  NT_HASH,
  NT_IF,
  NT_IN_PATTERN,
  NT_INT,
  NT_IRANGE,
  NT_IVAR,
  NT_KWBEGIN,
  NT_LVAR,
  NT_NIL,
  NT_NUMBLOCK,
  NT_PAIR,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SELF,
  NT_SEND,
  NT_SPLAT,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_WHEN,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { labaLambdaOrProc } from "./lint_ambiguous_block_association";
import { lpgeAssignmentMethod } from "./lint_parentheses_as_grouped_expression";
import { vfSameNode } from "./lint_variable_force";
import { rnHeredoc } from "../node";
import {
  ssxDefName,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxInList,
  ssxIs,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxLocIs,
  ssxMeth,
} from "./style_syntax_help";

/** Node#literal?. */
const lvoLiteral = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_REGEXP ||
  t === NT_TRUE ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT ||
  t === NT_FALSE ||
  t === NT_NIL;

/** node.each_descendant(:begin).any? */
const lvoHasBegin = (src: RbSource, n: i32): boolean => {
  for (const d of ssxDescendants(src, n)) {
    if (src.a.type(d) === NT_BEGIN) {
      return true;
    }
  }
  return false;
};

/** Void#operation?: an operator call whose operands are values. */
const lvoOperation = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const m = ssxMeth(src, n);
  if (a.nKid(n) === 2) {
    return m === "+@" || m === "-@" || m === "~" || m === "!" || !ssxHas(src, n, F_DOT);
  }
  if (a.nKid(n) !== 3) {
    return false;
  }
  const arg = a.kid(n, 2);
  // trailing_comma?
  if (src.src(a.exE(arg), a.exE(n)).indexOf(",") >= 0) {
    return false;
  }
  const t = a.type(arg);
  if (t === NT_HASH) {
    return ssxLocIs(src, arg, F_END, "}");
  }
  return !(t === NT_SPLAT || t === NT_BLOCK_PASS || t === NT_FORWARDED_ARGS || t === NT_FORWARDED_RESTARG);
};

/** entirely_literal?. */
const lvoEntirelyLiteral = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_ARRAY) {
    for (let i = 0; i < a.nKid(n); i++) {
      if (!lvoEntirelyLiteral(src, a.kid(n, i))) {
        return false;
      }
    }
    return true;
  }
  if (t === NT_HASH) {
    for (let i = 0; i < a.nKid(n); i++) {
      const p = a.kid(n, i);
      if (a.type(p) === NT_PAIR && !lvoEntirelyLiteral(src, a.kid(p, 0))) {
        return false;
      }
    }
    // each_value: the pairs' values
    for (let i = 0; i < a.nKid(n); i++) {
      const p = a.kid(n, i);
      if (a.type(p) === NT_PAIR && !lvoEntirelyLiteral(src, a.kid(p, 1))) {
        return false;
      }
    }
    return true;
  }
  if (t === NT_SEND || t === NT_CSEND) {
    const r = a.kid(n, 0);
    return ssxMeth(src, n) === "freeze" && r !== V_NIL && lvoEntirelyLiteral(src, r);
  }
  return lvoLiteral(t);
};

/** Node#special_keyword?. */
const lvoSpecialKeyword = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (!(t === NT_STR || t === NT_SYM || t === NT_INT || t === NT_CONST)) {
    return false;
  }
  const s = src.nodeSrc(n);
  return s === "__FILE__" || s === "__LINE__" || s === "__ENCODING__";
};

const LVO_OPERATORS: string = " * / % + - == === != < > <= >= <=> +@ -@ ~ ! ";

export class CopLintVoid {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/Void");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        const body = a.kid(n, 2);
        if (body === V_NIL || a.type(body) === NT_BEGIN || !this.inVoidContext(src, body)) {
          continue;
        }
        if (ssxMeth(src, a.kid(n, 0)) === "each") {
          continue;
        }
        this.checkVoidOp(src, body, false);
        this.checkExpression(src, body);
      } else if (t === NT_BEGIN || t === NT_KWBEGIN) {
        this.checkBegin(src, n);
      } else if (t === NT_ENSURE) {
        const body = a.kid(n, 1);
        if (body !== V_NIL && a.type(body) !== NT_BEGIN) {
          this.checkExpression(src, body);
        }
      }
    }
  }

  /** in_void_context?. */
  private inVoidContext(src: RbSource, n: i32): boolean {
    const a = src.a;
    const p = src.parent(n);
    if (p === V_NIL || !vfSameNode(src, a.kid(p, -1), n)) {
      return false;
    }
    const t = a.type(p);
    if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      const m = ssxMeth(src, a.kid(p, 0));
      return m === "each" || m === "tap";
    }
    if (t === NT_DEF || t === NT_DEFS) {
      const name = ssxDefName(src, p);
      return (t === NT_DEF && name === "initialize") || lpgeAssignmentMethod(name);
    }
    return t === NT_FOR || t === NT_ENSURE;
  }

  private checkBegin(src: RbSource, n: i32): void {
    const a = src.a;
    let each = false;
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (ssxIsAnyBlock(src, p)) {
        each = ssxMeth(src, a.kid(p, 0)) === "each";
        break;
      }
      p = src.parent(p);
    }
    let m = a.nKid(n);
    const q = src.parent(n);
    const setter =
      q !== V_NIL && (a.type(q) === NT_DEF || a.type(q) === NT_DEFS) && lpgeAssignmentMethod(ssxDefName(src, q));
    if (m > 0 && (!this.inVoidContext(src, n) || each || setter)) {
      m--;
    }
    for (let i = 0; i < m; i++) {
      const e = a.kid(n, i);
      this.checkVoidOp(src, e, each);
      this.checkExpression(src, e);
    }
  }

  private checkExpression(src: RbSource, e: i32): void {
    const a = src.a;
    if (!a.isNode(e)) {
      return;
    }
    const t = a.type(e);
    if (t === NT_IF) {
      // IfNode#body (if_branch)
      const unless =
        ssxHas(src, e, F_KEYWORD) &&
        ssxFE(src, e, F_KEYWORD) - ssxFS(src, e, F_KEYWORD) === 6 &&
        !ssxHas(src, e, F_QUESTION);
      const body = unless ? a.kid(e, 2) : a.kid(e, 1);
      if (body !== V_NIL) {
        this.checkNodes(src, body);
      }
      return;
    }
    if (t === NT_CASE || t === NT_CASE_MATCH) {
      for (let i = 1; i < a.nKid(e) - 1; i++) {
        const w = a.kid(e, i);
        if (ssxIs(src, w, NT_WHEN) || ssxIs(src, w, NT_IN_PATTERN)) {
          const body = a.kid(w, -1);
          if (body !== V_NIL) {
            this.checkExpression(src, body);
          }
        }
      }
      const eb = a.kid(e, -1);
      if (eb !== V_NIL) {
        this.checkExpression(src, eb);
      }
      return;
    }
    this.checkNodes(src, e);
  }

  /** check_void_expression_nodes. */
  private checkNodes(src: RbSource, n: i32): void {
    const a = src.a;
    const t = a.type(n);
    // check_literal
    if (lvoEntirelyLiteral(src, n) && t !== NT_XSTR && t !== NT_IRANGE && t !== NT_ERANGE && t !== NT_NIL) {
      this.flag(src, n, a.exS(n), a.exE(n), !lvoHasBegin(src, n));
    }
    // check_var
    if (t === NT_IVAR || t === NT_GVAR || t === NT_CVAR || t === NT_LVAR) {
      this.flag(src, n, ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME), true);
    } else if (t === NT_CONST) {
      this.flag(src, n, a.exS(n), a.exE(n), true);
    }
    // check_self
    if (t === NT_SELF) {
      this.flag(src, n, a.exS(n), a.exE(n), true);
    }
    // check_void_expression
    if (t === NT_DEFINED_P || labaLambdaOrProc(src, n)) {
      this.flag(src, n, a.exS(n), a.exE(n), true);
    }
  }

  /** An offense whose correction is autocorrect_void_expression. */
  private flag(src: RbSource, n: i32, s: i32, e: i32, correct: boolean): void {
    const a = src.a;
    const k = this.c.offense(s, e);
    if (k === null) {
      return;
    }
    const t = a.type(n);
    const p = src.parent(n);
    const pt = p === V_NIL ? -1 : a.type(p);
    let skip =
      !correct ||
      (t === NT_CONST && !lvoSpecialKeyword(src, n)) ||
      pt === NT_IF ||
      pt === NT_CASE ||
      pt === NT_WHEN ||
      pt === NT_CASE_MATCH ||
      pt === NT_IN_PATTERN;
    if (!skip) {
      let d = p;
      while (d !== V_NIL) {
        const dt = a.type(d);
        if (dt === NT_DEF || dt === NT_DEFS) {
          skip = lpgeAssignmentMethod(ssxDefName(src, d));
          break;
        }
        d = src.parent(d);
      }
    }
    if (!skip) {
      let ve = a.exE(n);
      if (rnHeredoc(src, n) && ssxHas(src, n, F_HEREDOC_END)) {
        const he = ssxFE(src, n, F_HEREDOC_END);
        ve = he > ve ? he : ve;
      }
      k.remove(rbSpaceBegin(src, a.exS(n), 1, true, false, false), ve);
    }
    this.c.commit(k);
  }

  private checkVoidOp(src: RbSource, n0: i32, each: boolean): void {
    const a = src.a;
    let n = n0;
    while (n !== V_NIL && a.type(n) === NT_BEGIN) {
      n = a.kid(n, 0);
    }
    if (n === V_NIL || !ssxIsCall(src, n)) {
      return;
    }
    const m = ssxMeth(src, n);
    if (!ssxInList(LVO_OPERATORS, m)) {
      return;
    }
    if (!lvoOperation(src, n)) {
      return;
    }
    if (each) {
      return;
    }
    const ss = ssxFS(src, n, F_SELECTOR);
    const se = ssxFE(src, n, F_SELECTOR);
    const k = this.c.offense(ss, se);
    if (k === null) {
      return;
    }
    if (a.nKid(n) === 2) {
      k.replace(a.exS(n), a.exE(n), src.nodeSrc(a.kid(n, 0)));
    } else {
      if (ssxHas(src, n, F_DOT)) {
        k.remove(ssxFS(src, n, F_DOT), ssxFE(src, n, F_DOT));
      }
      k.replace(rbSpaceBegin(src, ss, 0, false, false, false), rbSpaceEnd(src, se, 0, false, false, false), "\n");
    }
    this.c.commit(k);
  }
}
