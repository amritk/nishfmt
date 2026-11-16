// SwiftFormat's redundantReturn rule with an undefined Swift version (below 5.1, so
// only bare returns and the returns of single-expression closures go), plus
// parseExpressionRange(endingAt:) and isSingleExpression(in:allowing:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swEndOfPostfixIfdef, swIsUnsafeExpression, swParseExpressionEnd } from "./expr";
import { SwFormatter } from "./formatter";
import {
  swClosureInKeyword,
  swConditionalBranches,
  swEndOfScope,
  swIndexOfLastSignificantKeyword,
  swIsAccessorKeyword,
  swIsConditionalStatement,
  swIsStartOfClosure,
  swIsUnwrap,
  swLastSignificantKeyword,
  swStartOfScope,
  SW_EX_THROWS,
  SW_EX_WHERE,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
} from "./token";

const swIsPrefixKeyword = (s: string): boolean => s === "await" || s === "try" || s === "repeat" || s === "each";

/** parseExpressionRange(endingAt:)?.lowerBound, or -1. */
export const swParseExpressionStartEndingAt = (f: SwFormatter, endIndex: i32): i32 => {
  const k = f.k(endIndex);
  const s = f.s(endIndex);
  const a = f.a(endIndex);
  if (k === SW_OP && a === SW_OP_INFIX && s === "=") {
    return -1;
  }
  const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  if (prevIndex >= 0) {
    const pk = f.k(prevIndex);
    const ps = f.s(prevIndex);
    const pa = f.a(prevIndex);
    if (f.op(prevIndex, ".", SW_OP_INFIX) || f.tok(prevIndex, SW_DELIM, ".")) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      return b >= 0 ? swParseExpressionStartEndingAt(f, b) : -1;
    }
    if (pk === SW_OP && pa === SW_OP_INFIX && ps !== "=") {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      return b >= 0 ? swParseExpressionStartEndingAt(f, b) : -1;
    }
    if (pk === SW_OP && pa === SW_OP_PREFIX) {
      const tb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, prevIndex);
      if (tb >= 0 && f.k(tb) === SW_OP && f.a(tb) === SW_OP_INFIX) {
        const pe = swParseExpressionStartEndingAt(f, prevIndex);
        if (pe >= 0) {
          return pe;
        }
      }
    }
    if (f.kw(prevIndex, "as") || f.kw(prevIndex, "is")) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      return b >= 0 ? swParseExpressionStartEndingAt(f, b) : -1;
    }
    if (swIsUnwrap(f, prevIndex)) {
      const asIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (asIndex >= 0 && f.kw(asIndex, "as")) {
        const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, asIndex);
        return b >= 0 ? swParseExpressionStartEndingAt(f, b) : -1;
      }
    }
    if ((pk === SW_OP && pa === SW_OP_PREFIX) || swIsPrefixKeyword(ps) || swIsUnsafeExpression(f, prevIndex)) {
      const st = swParseExpressionStartEndingAt(f, prevIndex);
      return st >= 0 ? st : prevIndex;
    }
    if (swIsUnwrap(f, prevIndex) || f.op(prevIndex, "?", SW_OP_POSTFIX)) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (b >= 0 && swIsPrefixKeyword(f.s(b))) {
        const st = swParseExpressionStartEndingAt(f, b);
        return st >= 0 ? st : b;
      }
    }
  }
  if (k === SW_OP && (a === SW_OP_POSTFIX || a === SW_OP_INFIX)) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    return p >= 0 ? swParseExpressionStartEndingAt(f, p) : -1;
  }
  if (k === SW_END) {
    const sos = f.indexBefore(SW_T_START_OF_SCOPE, endIndex);
    if (sos < 0) {
      return -1;
    }
    const pb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sos);
    const prev = pb >= 0 ? swParseExpressionStartEndingAt(f, pb) : -1;
    if (s === "#endif") {
      if (prev < 0 || swEndOfPostfixIfdef(f, sos) !== endIndex) {
        return -1;
      }
      return prev;
    }
    return prev >= 0 ? prev : sos;
  }
  if (k === SW_IDENT || k === SW_NUMBER || (k === SW_KEYWORD && s.startsWith("#"))) {
    return endIndex;
  }
  return -1;
};

/** isSingleExpression(in: lo ..< hi, allowing: [.returnStatement] or []) for an undefined Swift version. */
export const swIsSingleExpression = (f: SwFormatter, lo: i32, hi: i32, allowReturn: boolean): boolean => {
  let startIndex = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo, hi);
  if (startIndex < 0 || f.tok(startIndex, SW_START, "#if")) {
    return false;
  }
  if (f.kw(startIndex, "return")) {
    if (!allowReturn) {
      return false;
    }
    const e = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex + 1, hi);
    if (e < 0) {
      return false;
    }
    startIndex = e;
  }
  if (swConditionalBranches(f, startIndex) !== null) {
    return false;
  }
  const end = swParseExpressionEnd(f, startIndex);
  if (end < 0) {
    return false;
  }
  return f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, end) === hi;
};

/** startOfBody(atStartOfScope:). */
export const swStartOfBody = (f: SwFormatter, sos: i32): i32 => {
  if (swIsStartOfClosure(f, sos)) {
    const inIndex = swClosureInKeyword(f, sos);
    if (inIndex >= 0) {
      return inIndex;
    }
  }
  return sos;
};

/** isFlatMapClosureWithInferredReturnType(at:). */
const swIsFlatMapClosureWithInferredReturnType = (f: SwFormatter, closureStart: i32): boolean => {
  let p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureStart);
  if (p >= 0 && f.tok(p, SW_START, "(") && swStartOfScope(f, closureStart) === p) {
    p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p);
  }
  if (p < 0 || !f.tok(p, SW_IDENT, "flatMap")) {
    return false;
  }
  const inIndex = swClosureInKeyword(f, closureStart);
  if (inIndex < 0) {
    return true;
  }
  return f.indexOfIn(SW_OP, "->", SW_OP_INFIX, closureStart + 1, inIndex) < 0;
};

/** The first pass, for one `return`. */
const swRemoveBareReturn = (f: SwFormatter, i: i32, startIndex: i32): void => {
  if (f.kw(startIndex, "in")) {
    // fine
  } else if (f.tok(startIndex, SW_START, "{")) {
    let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
    if (prevIndex >= 0) {
      if (swIsAccessorKeyword(f, prevIndex)) {
        return;
      }
      if (f.tok(prevIndex, SW_END, ")")) {
        const j = f.indexOfBefore(SW_START, "(", 0, prevIndex);
        if (j >= 0) {
          const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, j);
          prevIndex = q >= 0 ? q : j;
          if (f.op(prevIndex, "?", SW_OP_POSTFIX)) {
            const q2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
            if (q2 >= 0) {
              prevIndex = q2;
            }
          }
          if (!(f.k(prevIndex) === SW_IDENT || f.kw(prevIndex, "init"))) {
            return;
          }
        }
      }
      if (!(f.tok(prevIndex, SW_DELIM, ":") || f.tok(prevIndex, SW_START, "("))) {
        const pki = swIndexOfLastSignificantKeyword(f, startIndex, SW_EX_WHERE);
        if (pki >= 0) {
          const ks = f.s(pki);
          if (ks === "let" || ks === "var") {
            const ok = f.op(prevIndex, "=", SW_OP_INFIX) || f.lastIndexOfIn(SW_OP, "=", SW_OP_INFIX, pki + 1, prevIndex) >= 0;
            if (!ok || swIsConditionalStatement(f, pki)) {
              return;
            }
          } else if (ks === "func" || ks === "throws" || ks === "rethrows" || ks === "init" || ks === "subscript") {
            if (!f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_END, "}")) {
              return;
            }
          } else {
            return;
          }
        }
      }
    }
  } else {
    const endIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (endIndex < 0 || !f.tok(endIndex, SW_END, "}")) {
      return;
    }
    const sIdx = f.indexOfBefore(SW_START, "{", 0, endIndex);
    if (sIdx < 0) {
      return;
    }
    if (!swIsStartOfClosure(f, sIdx)) {
      const lk = swLastSignificantKeyword(f, sIdx, SW_EX_WHERE | SW_EX_THROWS);
      if (!(lk === "func" || lk === "rethrows")) {
        return;
      }
    }
  }
  const endIndex = swEndOfScope(f, i);
  if (endIndex < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i) !== endIndex) {
    return;
  }
  const sos = swStartOfScope(f, i);
  if (sos >= 0 && f.tok(sos, SW_START, "{") && swIsStartOfClosure(f, sos)) {
    const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const er = lt >= 0 ? swParseExpressionStartEndingAt(f, lt) : -1;
    if (er >= 0) {
      const tb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, er);
      if (tb >= 0 && (f.kw(tb, "in") || f.tok(tb, SW_START, "{"))) {
        return;
      }
    }
  }
  if (f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i) === endIndex) {
    const s2 = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (s2 >= 0) {
      f.removeTokens(s2 + 1, i + 1);
      return;
    }
  }
  f.removeToken(i);
  let nextIndex = f.indexAfter(SW_T_NON_SPACE, i - 1);
  if (nextIndex >= 0 && f.k(nextIndex) === SW_LINEBREAK) {
    const x = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nextIndex);
    if (x >= 0) {
      nextIndex = x - 1;
    }
    f.removeTokens(i, nextIndex + 1);
  } else if (f.has(i) && f.k(i) === SW_SPACE) {
    f.removeToken(i);
  }
};

/** redundantReturn. */
export const swRuleRedundantReturn = (f: SwFormatter): void => {
  const returnIndices: i32[] = [];
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "return")) {
      continue;
    }
    const startIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (startIndex < 0) {
      continue;
    }
    swRemoveBareReturn(f, i, startIndex);
    if (f.kw(i, "return")) {
      returnIndices.push(i);
    }
  }
  for (let sos = f.enumStart(); sos >= 0; sos = f.enumNext()) {
    if (!f.tok(sos, SW_START, "{") || !swIsStartOfClosure(f, sos)) {
      continue;
    }
    if (swIsFlatMapClosureWithInferredReturnType(f, sos)) {
      continue;
    }
    const endOfScope = swEndOfScope(f, sos);
    if (endOfScope < 0) {
      continue;
    }
    const body = swStartOfBody(f, sos);
    if (!swIsSingleExpression(f, body + 1, endOfScope, true)) {
      continue;
    }
    const first = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, body + 1, endOfScope);
    if (first < 0 || !f.kw(first, "return") || returnIndices.indexOf(first) < 0) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, first);
    if (nextIndex < 0 || f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, first + 1, endOfScope) < 0) {
      continue;
    }
    const count = nextIndex - first;
    for (let q = toI32(returnIndices.length) - 1; q >= 0; q--) {
      const x = returnIndices[q];
      if (x >= first && x < nextIndex) {
        for (let r = q; r + 1 < toI32(returnIndices.length); r++) {
          returnIndices[r] = returnIndices[r + 1];
        }
        returnIndices.pop();
      } else if (x > first) {
        returnIndices[q] = x - count;
      }
    }
    f.removeTokens(first, nextIndex);
  }
};
