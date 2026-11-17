// SwiftFormat's yodaConditions rule (yodaSwap always).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swIsSubscriptOrFunctionCall } from "./parsing";
import { swEndOfExpression } from "./rules_redtype";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_START,
  SW_T_END_OF_SCOPE,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swIsStringDelimiter,
} from "./token";

const swIsPostfixOp = (f: SwFormatter, i: i32): boolean => f.has(i) && f.k(i) === SW_OP && f.a(i) === SW_OP_POSTFIX;

/** valuesInRangeAreConstant(_:). */
const swValuesInRangeAreConstant = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let index = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo, hi);
  while (index >= 0) {
    let i = index;
    if (f.k(i) === SW_START && swIsConstant(f, i)) {
      const e = f.indexAfter(SW_T_END_OF_SCOPE, i);
      if (e < 0) {
        return false;
      }
      i = e;
      index = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i + 1, hi);
    } else if (swIsConstant(f, i) || f.tok(i, SW_DELIM, ",") || f.tok(i, SW_DELIM, ":")) {
      index = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i + 1, hi);
    } else if (f.k(i) === SW_IDENT) {
      const n = f.indexInType(SW_T_NON_SPACE_OR_COMMENT, i + 1, hi);
      if (n < 0 || !f.tok(n, SW_DELIM, ":")) {
        return false;
      }
      index = n;
    } else {
      return false;
    }
  }
  return true;
};

/** isConstant(at:). */
const swIsConstant = (f: SwFormatter, index0: i32): boolean => {
  let index = index0;
  while (swIsPostfixOp(f, index)) {
    index--;
  }
  if (!f.has(index)) {
    return false;
  }
  const k = f.k(index);
  const s = f.s(index);
  if (k === SW_NUMBER || (k === SW_IDENT && (s === "true" || s === "false" || s === "nil"))) {
    return true;
  }
  if (k === SW_END && (s === "]" || s === ")")) {
    const si = f.indexBefore(SW_T_START_OF_SCOPE, index);
    if (si < 0 || swIsSubscriptOrFunctionCall(f, si)) {
      return false;
    }
    return swValuesInRangeAreConstant(f, si + 1, index);
  }
  if (k === SW_START && (s === "[" || s === "(")) {
    if (swIsSubscriptOrFunctionCall(f, index)) {
      return false;
    }
    const e = f.indexAfter(SW_T_END_OF_SCOPE, index);
    if (e < 0) {
      return false;
    }
    return swValuesInRangeAreConstant(f, index + 1, e);
  }
  if (k === SW_START || k === SW_END) {
    return swIsStringDelimiter(k, s);
  }
  if (f.op(index, ".", SW_OP_PREFIX) && f.has(index + 1) && f.k(index + 1) === SW_IDENT) {
    return true;
  }
  if (k === SW_IDENT && f.op(index - 1, ".", SW_OP_PREFIX) && !f.op(index - 2, "\\", SW_OP_PREFIX)) {
    return true;
  }
  return false;
};

/** isOperator(at:). */
const swYodaIsOperator = (f: SwFormatter, index: i32): boolean => {
  if (index < 0) {
    return false;
  }
  const k = f.k(index);
  const s = f.s(index);
  if (k === SW_OP && f.a(index) === SW_OP_INFIX) {
    return !(s === "=" || s === "&&" || s === "||" || s === "?" || s === ":");
  }
  return k === SW_KEYWORD && (s === "as" || s === "is");
};

/** startOfValue(at:), or -1. */
const swStartOfValue = (f: SwFormatter, index0: i32): i32 => {
  let index = index0;
  while (swIsPostfixOp(f, index)) {
    index--;
  }
  if (f.has(index) && f.k(index) === SW_END) {
    const i = f.indexBefore(SW_T_START_OF_SCOPE, index);
    if (i < 0) {
      return -1;
    }
    index = i;
  }
  while (f.has(index - 1) && f.k(index - 1) === SW_OP && f.a(index - 1) === SW_OP_PREFIX) {
    index--;
  }
  return index;
};

const swInverseComparison = (s: string): string => {
  if (s === "<") {
    return ">";
  }
  if (s === "<=") {
    return ">=";
  }
  if (s === ">") {
    return "<";
  }
  if (s === ">=") {
    return "<=";
  }
  return s;
};

/** yodaConditions. */
export const swRuleYodaConditions = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_OP || f.a(i) !== SW_OP_INFIX) {
      continue;
    }
    const op = f.s(i);
    if (!(op === "==" || op === "!=" || op === "<" || op === "<=" || op === ">" || op === ">=")) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
    if (prevIndex < 0 || !swIsConstant(f, prevIndex)) {
      continue;
    }
    const startIndex = swStartOfValue(f, prevIndex);
    if (startIndex < 0 || swYodaIsOperator(f, f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex))) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nextIndex < 0) {
      continue;
    }
    if (
      swIsConstant(f, nextIndex) &&
      !swYodaIsOperator(f, f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex))
    ) {
      continue;
    }
    const endIndex = swEndOfExpression(f, nextIndex, true, true);
    if (endIndex < 0) {
      continue;
    }
    const expression = f.slice(nextIndex, endIndex + 1);
    const constant = f.slice(startIndex, prevIndex + 1);
    f.replaceTokens(nextIndex, endIndex + 1, constant);
    f.replaceToken(i, SW_OP, swInverseComparison(op), SW_OP_INFIX);
    f.replaceTokens(startIndex, prevIndex + 1, expression);
  }
};
