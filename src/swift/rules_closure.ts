// SwiftFormat's redundantClosure rule (no if/switch expressions with an undefined
// Swift version, so only single simple expressions qualify), with
// indexIsWithinNestedClosure(_:startOfScopeIndex:) and endOfVoidType(at:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swIsUnsafeExpression } from "./expr";
import { SwFormatter } from "./formatter";
import { swEndOfScope, swIsConditionalStatement, swIsStartOfClosure, swIsTrailingClosureLabel } from "./parsing";
import { swIsStartOfClosureOrFunctionBody } from "./rules_doc";
import { swIsSingleExpression, swStartOfBody } from "./rules_return";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** indexIsWithinNestedClosure(_:startOfScopeIndex:). */
export const swIndexIsWithinNestedClosure = (f: SwFormatter, index: i32, startOfScopeIndex: i32): boolean => {
  let i = index;
  while (true) {
    let sos = -1;
    if (f.has(i) && f.k(i) === SW_START) {
      sos = i;
    } else {
      sos = f.indexBefore(SW_T_START_OF_SCOPE, i);
      if (sos < 0) {
        return false;
      }
    }
    if (sos <= startOfScopeIndex) {
      return false;
    }
    if (swIsStartOfClosureOrFunctionBody(f, sos)) {
      return sos !== startOfScopeIndex;
    }
    if (f.has(sos) && f.k(sos) === SW_START) {
      i = toI32(toU32(sos) - 1);
      continue;
    }
    return false;
  }
};

/** endOfVoidType(at:) >= 0. */
const swIsVoidType = (f: SwFormatter, index: i32): boolean => {
  if (f.tok(index, SW_IDENT, "Void")) {
    return true;
  }
  if (f.tok(index, SW_IDENT, "Swift")) {
    const d = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
    if (d < 0 || !f.op(d, ".", SW_OP_INFIX)) {
      return false;
    }
    const v = f.indexAfter(SW_T_NON_SPACE, d);
    return v >= 0 && f.tok(v, SW_IDENT, "Void");
  }
  if (f.tok(index, SW_START, "(")) {
    const n = f.indexAfter(SW_T_NON_SPACE, index);
    if (n < 0) {
      return false;
    }
    if (f.tok(n, SW_END, ")")) {
      return true;
    }
    if (f.tok(n, SW_IDENT, "Void")) {
      const n2 = f.indexAfter(SW_T_NON_SPACE, n);
      return n2 >= 0 && f.k(n2) === SW_END && f.s(n2) === ")";
    }
  }
  return false;
};

/** isTrailingClosureArgument(at:). */
const swIsTrailingClosureArgument = (f: SwFormatter, closureStartIndex: i32): boolean => {
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureStartIndex);
  if (p < 0 || swIsConditionalStatement(f, p)) {
    return false;
  }
  const k = f.k(p);
  if (k === SW_IDENT) {
    return !swIsUnsafeExpression(f, p);
  }
  if (f.tok(p, SW_END, ")") || f.tok(p, SW_END, ">")) {
    return true;
  }
  if (k === SW_OP && f.a(p) === SW_OP_POSTFIX) {
    return !f.kw(p - 1, "try");
  }
  if (f.tok(p, SW_DELIM, ":")) {
    const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p);
    return q >= 0 && swIsTrailingClosureLabel(f, q);
  }
  return false;
};

const swIsSpaceOrBreakAt = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK);

/** redundantClosure. */
export const swRuleRedundantClosure = (f: SwFormatter): void => {
  for (let closureStartIndex = f.enumStart(); closureStartIndex >= 0; closureStartIndex = f.enumNext()) {
    if (!f.tok(closureStartIndex, SW_START, "{")) {
      continue;
    }
    let startIndex = closureStartIndex;
    let closureEndIndex = swEndOfScope(f, closureStartIndex);
    if (closureEndIndex < 0) {
      continue;
    }
    let openParen = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureEndIndex);
    if (openParen < 0 || !f.tok(openParen, SW_START, "(")) {
      continue;
    }
    let closeParen = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, openParen);
    if (closeParen < 0 || !f.tok(closeParen, SW_END, ")")) {
      continue;
    }
    if (!swIsStartOfClosure(f, closureStartIndex) || swIsTrailingClosureArgument(f, closureStartIndex)) {
      continue;
    }
    let lb = false;
    for (let j = closureEndIndex; j < openParen; j++) {
      if (f.k(j) === SW_LINEBREAK) {
        lb = true;
        break;
      }
    }
    if (lb || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureStartIndex) === closureEndIndex) {
      continue;
    }
    const body = swStartOfBody(f, closureStartIndex);
    if (!swIsSingleExpression(f, toI32(toU32(body) + 1), closureEndIndex, true)) {
      continue;
    }
    let bad = false;
    for (let j = closureStartIndex; j <= closureEndIndex; j = toI32(toU32(j) + 1)) {
      if (f.kw(j, "in") && !swIndexIsWithinNestedClosure(f, j, closureStartIndex)) {
        bad = true;
        break;
      }
    }
    if (bad) {
      continue;
    }
    for (let j = closureStartIndex; j <= closureEndIndex; j = toI32(toU32(j) + 1)) {
      if (
        (f.tok(j, SW_IDENT, "fatalError") || f.tok(j, SW_IDENT, "preconditionFailure") || f.kw(j, "throw")) &&
        !swIndexIsWithinNestedClosure(f, j, closureStartIndex)
      ) {
        bad = true;
        break;
      }
    }
    if (bad) {
      continue;
    }
    while (true) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (p < 0 || !(f.kw(p, "try") || f.kw(p, "await") || swIsUnsafeExpression(f, p))) {
        break;
      }
      for (let j = p; j < startIndex; j++) {
        if (f.isComment(j)) {
          bad = true;
        }
      }
      if (bad) {
        break;
      }
      startIndex = p;
    }
    if (bad) {
      continue;
    }
    const eq = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
    if (eq >= 0 && f.op(eq, "=", SW_OP_INFIX)) {
      const colon = f.indexOfBefore(SW_DELIM, ":", 0, eq);
      const ni = colon >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon) : -1;
      if (ni >= 0 && swIsVoidType(f, ni)) {
        continue;
      }
    }
    while (swIsSpaceOrBreakAt(f, toI32(toU32(closureStartIndex) + 1))) {
      f.removeToken(toI32(toU32(closureStartIndex) + 1));
      openParen = toI32(toU32(openParen) - 1);
      closeParen = toI32(toU32(closeParen) - 1);
      closureEndIndex = toI32(toU32(closureEndIndex) - 1);
    }
    while (swIsSpaceOrBreakAt(f, toI32(toU32(closureEndIndex) - 1))) {
      f.removeToken(toI32(toU32(closureEndIndex) - 1));
      openParen = toI32(toU32(openParen) - 1);
      closeParen = toI32(toU32(closeParen) - 1);
      closureEndIndex = toI32(toU32(closureEndIndex) - 1);
    }
    f.removeToken(closeParen);
    f.removeToken(openParen);
    f.removeToken(closureEndIndex);
    const returnIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureStartIndex);
    if (returnIndex >= 0 && f.s(returnIndex) === "return") {
      while (swIsSpaceOrBreakAt(f, toI32(toU32(returnIndex) + 1))) {
        f.removeToken(toI32(toU32(returnIndex) + 1));
      }
      f.removeToken(returnIndex);
    }
    f.removeTokens(startIndex, toI32(toU32(closureStartIndex) + 1));
  }
};
