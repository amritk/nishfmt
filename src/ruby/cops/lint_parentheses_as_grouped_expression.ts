// Lint/ParenthesesAsGroupedExpression.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_BEGIN,
  NT_ERANGE,
  NT_HASH,
  NT_IF,
  NT_IRANGE,
  NT_OR,
  NT_RESCUE,
  NT_SEND,
  NT_SUPER,
  NT_UNTIL,
  NT_WHILE,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lrrsModifierForm } from "./lint_redundant_require_statement";
import {
  ssxArgc,
  ssxAssignment,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxIs,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxLocIs,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
  ssxSetter,
} from "./style_syntax_help";

/** Node#parenthesized_call?: loc.begin is `(`. */
const lpgeParenCall = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_BEGIN, "(");

/** MethodIdentifierPredicates#assignment_method?: not a comparison, ends with `=`. */
export const lpgeAssignmentMethod = (m: string): boolean => {
  if (m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === "<" || m === ">") {
    return false;
  }
  return m.endsWith("=");
};

/** command_call?. */
const lpgeCommandCall = (src: RbSource, n0: i32): boolean => {
  let n = n0;
  if (!src.a.isNode(n)) {
    return false;
  }
  if (ssxIsAnyBlock(src, n)) {
    n = src.a.kid(n, 0);
  }
  const t = src.a.type(n);
  if (ssxIsCall(src, n)) {
    return ssxArgc(src, n) > 0 && !ssxParenthesized(src, n) && !ssxOperatorName(ssxMeth(src, n));
  }
  if (t === NT_SUPER || t === NT_YIELD) {
    return src.a.nKid(n) > 0 && !ssxParenthesized(src, n);
  }
  return false;
};

/** command_call_operand?. */
const lpgeOperand = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  if (ssxAssignment(src, n) || (ssxIsCall(src, n) && lpgeAssignmentMethod(ssxMeth(src, n)))) {
    const v = a.kid(n, -1);
    return lpgeCommandCall(src, v) || lpgeOperand(src, v);
  }
  if (ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "!" && ssxLocIs(src, n, F_SELECTOR, "!")) {
    const r = a.kid(n, 0);
    return lpgeCommandCall(src, r) || lpgeOperand(src, r);
  }
  return false;
};

/** invalid_bare_argument?. */
const lpgeInvalidBare = (src: RbSource, n0: i32): boolean => {
  const a = src.a;
  let n = n0;
  while (n !== V_NIL && a.type(n) === NT_BEGIN && a.nKid(n) === 1) {
    n = a.kid(n, 0);
  }
  if (n === V_NIL) {
    return false;
  }
  const t = a.type(n);
  // keyword_operator?
  if ((t === NT_AND || t === NT_OR) && (ssxLocIs(src, n, F_OPERATOR, "and") || ssxLocIs(src, n, F_OPERATOR, "or"))) {
    return true;
  }
  if (t === NT_RESCUE || (t === NT_SEND && ssxMeth(src, n) === "!" && ssxLocIs(src, n, F_SELECTOR, "not"))) {
    return true;
  }
  // modifier_expression?
  if ((t === NT_IF || t === NT_WHILE || t === NT_UNTIL) && lrrsModifierForm(src, n)) {
    return true;
  }
  return lpgeOperand(src, n);
};

export class CopLintParenthesesAsGroupedExpression {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ParenthesesAsGroupedExpression");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || this.valid(src, n)) {
        continue;
      }
      const arg = a.kid(n, 2);
      if (ssxParenthesized(src, n) || !src.nodeSrc(arg).startsWith("(") || !ssxHas(src, n, F_SELECTOR)) {
        continue;
      }
      const len = a.exS(arg) - ssxFE(src, n, F_SELECTOR);
      if (len <= 0) {
        continue;
      }
      const k = this.c.offense(a.exS(arg) - len, a.exS(arg));
      if (k !== null) {
        k.remove(a.exS(arg) - len, a.exS(arg));
        this.c.commit(k);
      }
    }
  }

  /** valid_context?. */
  private valid(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (ssxArgc(src, n) !== 1) {
      return true;
    }
    const arg = a.kid(n, 2);
    if (!lpgeParenCall(src, arg) || ssxIsAnyBlock(src, arg)) {
      return true;
    }
    if (ssxOperatorName(ssxMeth(src, n)) || ssxSetter(src, n)) {
      return true;
    }
    // chained_calls?: a call's children always number more than one.
    if (ssxIsCall(src, arg)) {
      return true;
    }
    const t = a.type(arg);
    if (t === NT_AND || t === NT_OR || t === NT_HASH) {
      return true;
    }
    if (t === NT_IF && ssxHas(src, arg, F_QUESTION)) {
      return true;
    }
    if ((t === NT_IRANGE || t === NT_ERANGE) && lpgeParenCall(src, arg)) {
      return true;
    }
    return lpgeInvalidBare(src, arg);
  }
}
