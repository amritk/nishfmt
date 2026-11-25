// RuboCop::Cop::MultilineExpressionIndentation, for
// Layout/MultilineMethodCallIndentation and
// Layout/MultilineOperationIndentation (IndentationWidth: 2).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_DOT,
  F_END,
  F_KEYWORD,
  F_OPERATOR,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASGN,
  NT_CSEND,
  NT_FOR,
  NT_IF,
  NT_KWBEGIN,
  NT_OP_ASGN,
  NT_RETURN,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbSource } from "../source";
import { rnE, rnHas, rnMethod, rnS } from "../node";
import { rmlFirstNonWs, rmlIsAssignment, rmlIsCall, rmlLastArg, rmlTernary } from "./layout_multiline_help";

/** within_node?(inner, outer) over ranges. */
export const rmxWithin = (is: i32, ie: i32, os: i32, oe: i32): boolean => is >= os && ie <= oe;

/** Whether node `n`'s range lies within node `o`'s. */
export const rmxWithinNode = (src: RbSource, n: i32, o: i32): boolean =>
  rmxWithin(src.a.exS(n), src.a.exE(n), src.a.exS(o), src.a.exE(o));

/** MethodIdentifierPredicates#assignment_method? */
export const rmxAssignmentMethod = (m: string): boolean => {
  if (m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<") {
    return false;
  }
  return m.endsWith("=");
};

/** MethodIdentifierPredicates#operator_method? */
export const rmxOperatorMethod = (m: string): boolean =>
  m === "|" ||
  m === "^" ||
  m === "&" ||
  m === "<=>" ||
  m === "==" ||
  m === "===" ||
  m === "=~" ||
  m === ">" ||
  m === ">=" ||
  m === "<" ||
  m === "<=" ||
  m === "<<" ||
  m === ">>" ||
  m === "+" ||
  m === "-" ||
  m === "*" ||
  m === "/" ||
  m === "%" ||
  m === "**" ||
  m === "~" ||
  m === "+@" ||
  m === "-@" ||
  m === "!@" ||
  m === "~@" ||
  m === "[]" ||
  m === "[]=" ||
  m === "!" ||
  m === "!=" ||
  m === "!~" ||
  m === "`";

/** left_hand_side(lhs). */
export const rmxLeftHandSide = (src: RbSource, lhs0: i32): i32 => {
  let lhs = lhs0;
  while (true) {
    const p = src.parent(lhs);
    if (p === V_NIL || !rmlIsCall(src, p) || !rnHas(src, p, F_DOT) || rmxAssignmentMethod(rnMethod(src, p))) {
      break;
    }
    lhs = p;
  }
  return lhs;
};

/** indentation(node): the column of the first non-blank of the node's first line. */
export const rmxIndentation = (src: RbSource, n: i32): i32 => {
  const p = rmlFirstNonWs(src, src.line(src.a.exS(n)));
  return p < 0 ? 0 : src.column(p);
};

/** indented_keyword_expression. */
export const rmxKwExpr = (src: RbSource, n: i32): i32 => (src.a.type(n) === NT_FOR ? src.a.kid(n, 1) : src.a.kid(n, 0));

/** kw_node_with_special_indentation (V_NIL for none). */
export const rmxKwNode = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_FOR || t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_RETURN) {
      if (!(t === NT_IF && rmlTernary(src, p))) {
        const e = rmxKwExpr(src, p);
        if (e !== V_NIL && a.isNode(e) && rmxWithinNode(src, n, e)) {
          return p;
        }
      }
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** postfix_conditional? */
export const rmxPostfixConditional = (src: RbSource, n: i32): boolean => {
  if (src.a.type(n) !== NT_IF || rmlTernary(src, n)) {
    return false;
  }
  const kw = src.src(rnS(src, n, F_KEYWORD), rnE(src, n, F_KEYWORD));
  return (kw === "if" || kw === "unless") && !rnHas(src, n, F_END);
};

/** correct_indentation(node). */
export const rmxCorrectIndentation = (src: RbSource, n: i32): i32 => {
  const kw = rmxKwNode(src, n);
  if (kw !== V_NIL && !rmxPostfixConditional(src, kw)) {
    return 4;
  }
  return 2;
};

/** Util#parentheses?: the node's end is `)`. */
export const rmxParenthesized = (src: RbSource, n: i32): boolean => {
  if (!rnHas(src, n, F_END)) {
    return false;
  }
  const s = rnS(src, n, F_END);
  return toI64(rnE(src, n, F_END)) - toI64(s) === toI64(1) && src.at(s) === 41;
};

/** argument_in_method_call(node, kind) (V_NIL for none). */
export const rmxArgumentInMethodCall = (src: RbSource, n: i32, withParens: boolean): i32 => {
  const a = src.a;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_BLOCK) {
      return V_NIL;
    }
    if (t === NT_SEND && !rnHas(src, p, F_OPERATOR) && (!withParens || rmxParenthesized(src, p))) {
      for (let i = 2; i < a.nKid(p); i++) {
        if (rmxWithinNode(src, n, a.kid(p, i))) {
          return p;
        }
      }
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** assignment_rhs(node). */
export const rmxAssignmentRhs = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  if (t === NT_CASGN || t === NT_OP_ASGN) {
    return src.a.kid(n, 2);
  }
  if (t === NT_SEND || t === NT_CSEND) {
    return rmlLastArg(src, n);
  }
  return src.a.kid(n, -1);
};

/** valid_rhs_candidate?(candidate, node) for a candidate range. */
const rmxValidRhsCandidate = (src: RbSource, cs: i32, ce: i32, n: i32): boolean => {
  if (cs < 0) {
    return true;
  }
  if (n === V_NIL || !src.a.isNode(n)) {
    return false;
  }
  return rmxWithin(cs, ce, src.a.exS(n), src.a.exE(n));
};

/** part_of_assignment_rhs(node, candidate) (V_NIL for none; cs < 0 for no candidate). */
export const rmxPartOfAssignmentRhs = (src: RbSource, n: i32, cs: i32, ce: i32): i32 => {
  const a = src.a;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    // disqualified_rhs?
    if (
      t === NT_IF ||
      t === NT_WHILE ||
      t === NT_UNTIL ||
      t === NT_FOR ||
      t === NT_RETURN ||
      t === NT_ARRAY ||
      t === NT_KWBEGIN
    ) {
      return V_NIL;
    }
    if (t === NT_BLOCK) {
      const body = a.kid(p, 2);
      if (body !== V_NIL && (cs < 0 || rmxWithin(cs, ce, a.exS(body), a.exE(body)))) {
        return V_NIL;
      }
    }
    // valid_rhs?
    if (t === NT_SEND) {
      if (rnHas(src, p, F_OPERATOR) && rmxValidRhsCandidate(src, cs, ce, rmlLastArg(src, p))) {
        return p;
      }
    } else if (rmlIsAssignment(src, p)) {
      if (rmxValidRhsCandidate(src, cs, ce, rmxAssignmentRhs(src, p))) {
        return p;
      }
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** grouped_expression?: a parenthesized begin. */
export const rmxGrouped = (src: RbSource, n: i32): boolean => src.a.type(n) === NT_BEGIN && rnHas(src, n, F_BEGIN);

/** inside_arg_list_parentheses?(node, ancestor). */
export const rmxInsideArgParens = (src: RbSource, n: i32, anc: i32): boolean => {
  if (src.a.type(anc) !== NT_SEND || !rmxParenthesized(src, anc)) {
    return false;
  }
  return src.a.exS(n) > rnS(src, anc, F_BEGIN) && src.a.exE(n) < rnE(src, anc, F_END);
};

/** not_for_this_cop?(node). */
export const rmxNotForThisCop = (src: RbSource, n: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (rmxGrouped(src, p) || rmxInsideArgParens(src, n, p)) {
      return true;
    }
    p = src.parent(p);
  }
  return false;
};
