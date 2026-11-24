// SwiftFormat's redundantVariable and redundantInit rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swCharacterEnd, swCharacterUppercaseInvariant } from "./unicode";
import { swStringExcludingLinebreaksAndComments } from "./decl";
import { swParseExpressionEnd, swParsePropertyDeclaration } from "./expr";
import { SwFormatter } from "./formatter";
import { swParseFunctionDeclaration } from "./funcdecl";
import {
  swEndOfScope,
  swIndexOfLastSignificantKeyword,
  swParseType,
  swStartOfScope,
  SW_EX_RETHROWS,
  SW_EX_THROWS,
  SW_EX_WHERE,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SwTok,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** returnTypeOfEnclosingScope(at:) as [start, end], or []. */
const swReturnTypeOfEnclosingScope = (f: SwFormatter, index: i32): i32[] => {
  const sob = swStartOfScope(f, index);
  if (sob < 0 || !f.tok(sob, SW_START, "{")) {
    return [];
  }
  const ki = swIndexOfLastSignificantKeyword(f, sob, SW_EX_THROWS | SW_EX_RETHROWS);
  if (ki < 0) {
    return [];
  }
  const kw = f.s(ki);
  if (kw === "func" || kw === "subscript") {
    const arrow = f.indexOfIn(SW_OP, "->", SW_OP_INFIX, toI32(toU32(ki) + 1), sob);
    if (arrow >= 0) {
      const rti = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, arrow);
      const rte = rti >= 0 ? swParseType(f, rti) : -1;
      if (rte >= 0) {
        return [rti, rte];
      }
    }
  }
  if (kw === "var") {
    const p = swParsePropertyDeclaration(f, ki);
    if (p !== null && p.typeStart >= 0) {
      return [p.typeStart, p.typeEnd];
    }
  }
  return [];
};

const swSameTokenRuns = (f: SwFormatter, a0: i32, a1: i32, b0: i32, b1: i32): boolean => {
  if (toI32(toU32(a1) - toU32(a0)) !== toI32(toU32(b1) - toU32(b0))) {
    return false;
  }
  for (let q = 0; q <= toI32(toU32(a1) - toU32(a0)); q = toI32(toU32(q) + 1)) {
    if (!f.same(toI32(toU32(a0) + toU32(q)), toI32(toU32(b0) + toU32(q)))) {
      return false;
    }
  }
  return true;
};

/** redundantVariable. */
export const swRuleRedundantVariable = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!(f.kw(i, "let") || f.kw(i, "var"))) {
      continue;
    }
    const p = swParsePropertyDeclaration(f, i);
    if (p === null || p.assignment < 0 || p.valueStart < 0) {
      continue;
    }
    const returnIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p.valueEnd);
    if (returnIndex < 0 || !f.kw(returnIndex, "return")) {
      continue;
    }
    const rv = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, returnIndex);
    if (rv < 0) {
      continue;
    }
    const re = swParseExpressionEnd(f, rv, true);
    if (re < 0 || re !== rv || !f.tok(rv, SW_IDENT, p.identifier)) {
      continue;
    }
    const rrLo = f.startOfLine(returnIndex);
    const rrHi = f.endOfLine(re);
    if (i <= rrHi && rrLo <= p.valueEnd) {
      continue;
    }
    if (p.startOfModifiers !== i) {
      continue;
    }
    if (p.typeStart >= 0) {
      const rt = swReturnTypeOfEnclosingScope(f, i);
      // rt is [] or [start, end].
      if (rt.length < 2 || !swSameTokenRuns(f, rt[0], rt[1], p.typeStart, p.typeEnd)) {
        continue;
      }
    }
    const valueEnd = p.valueEnd;
    const valueStart = p.valueStart;
    f.removeTokens(rrLo, toI32(toU32(rrHi) + 1));
    let allSpace = true;
    for (let j = toI32(toU32(valueEnd) + 1); j < toI32(toU32(rrLo) - 1); j++) {
      if (!(f.k(j) === SW_SPACE || f.k(j) === SW_LINEBREAK)) {
        allSpace = false;
        break;
      }
    }
    if (allSpace && toI32(toU32(valueEnd) + 1) < toI32(toU32(rrLo) - 1)) {
      f.removeTokens(toI32(toU32(valueEnd) + 1), toI32(toU32(rrLo) - 1));
    }
    f.replaceTokens(i, valueStart, [new SwTok(SW_KEYWORD, "return", 0), new SwTok(SW_SPACE, " ", 0)]);
  }
};

/** isValidEndOfType(at:). */
const swIsValidEndOfType = (f: SwFormatter, i: i32): boolean => {
  if (f.k(i) === SW_IDENT) {
    return true;
  }
  const s = f.s(i);
  return s === "]" || s === ")" || s === ">" || s === "?" || s === "!";
};

/** isFunctionParameter(named:at:). */
const swIsFunctionParameter = (f: SwFormatter, name: string, index: i32): boolean => {
  let scopeIndex = index;
  while (true) {
    const sos = swStartOfScope(f, scopeIndex);
    if (sos < 0) {
      return false;
    }
    scopeIndex = sos;
    if (!f.tok(sos, SW_START, "{")) {
      continue;
    }
    const ki = swIndexOfLastSignificantKeyword(f, sos, SW_EX_WHERE);
    if (ki < 0 || !(f.kw(ki, "func") || f.kw(ki, "init") || f.kw(ki, "subscript"))) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, ki);
    if (fd === null || fd.bodyStart !== sos) {
      continue;
    }
    for (const a of fd.args) {
      if (a.internalLabel === name) {
        return true;
      }
    }
  }
};

/** The first character code of the last dot-separated part of the type's string, or -1. */
/** type.string.components(separatedBy: ".").last?.first: -1 for nil, 36 for `$`, 1 for a Character
 *  that uppercasing leaves unchanged, 0 otherwise. */
const swTypeLastPartFirstChar = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  // A token index: the u32 sum is exact.
  const s = swStringExcludingLinebreaksAndComments(f, lo, toI32(toU32(hi) + 1));
  const n = toI32(s.length);
  let d = n - 1;
  while (d >= 0 && d < n && s.charCodeAt(d) !== 46) {
    d--;
  }
  // d >= -1, so e >= 0.
  const e = d + 1;
  if (e < 0 || e >= n) {
    return -1;
  }
  if (s.charCodeAt(e) === 36 && swCharacterEnd(s, e) === e + 1) {
    return 36;
  }
  return swCharacterUppercaseInvariant(s, e) ? 1 : 0;
};

/** redundantInit. */
export const swRuleRedundantInit = (f: SwFormatter): void => {
  for (let initIndex = f.enumStart(); initIndex >= 0; initIndex = f.enumNext()) {
    if (!f.tok(initIndex, SW_IDENT, "init")) {
      continue;
    }
    const dotIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, initIndex);
    if (dotIndex < 0 || !f.ks(dotIndex, SW_OP, ".")) {
      continue;
    }
    const open = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, initIndex);
    if (open < 0 || !(f.tok(open, SW_START, "(") || f.tok(open, SW_START, "{"))) {
      continue;
    }
    const close = swEndOfScope(f, open);
    if (close < 0 || f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, close, SW_DELIM, ":")) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dotIndex);
    if (prevIndex < 0 || !swIsValidEndOfType(f, prevIndex)) {
      continue;
    }
    const pk = f.k(prevIndex);
    const ps = f.s(prevIndex);
    const pa = f.a(prevIndex);
    let startOfTypeIndex = -1;
    for (let t = 0; t < dotIndex; t++) {
      const te = swParseType(f, t);
      if (te < 0) {
        continue;
      }
      if (!(f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, te) === dotIndex || te === initIndex)) {
        continue;
      }
      const lb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, t);
      if (lb >= 0 && f.k(lb) === SW_IDENT) {
        continue;
      }
      startOfTypeIndex = t;
      break;
    }
    if (startOfTypeIndex < 0) {
      continue;
    }
    const typeEnd = swParseType(f, startOfTypeIndex);
    if (typeEnd < 0) {
      continue;
    }
    const firstChar = swTypeLastPartFirstChar(f, startOfTypeIndex, typeEnd);
    if (firstChar < 0 || firstChar === 36 || firstChar === 0) {
      continue;
    }
    const lineStart = f.startOfLine(prevIndex, true);
    if (f.tok(lineStart, SW_START, "#if") || f.kw(lineStart, "#elseif")) {
      continue;
    }
    if (f.tok(open, SW_START, "{") && pk === SW_END && ps === "]") {
      continue;
    }
    let j = dotIndex;
    let shadowed = false;
    while (true) {
      let pi = f.indexOfBefore(pk, ps, pa, j);
      if (pi < 0) {
        pi = f.indexBefore(SW_T_START_OF_SCOPE, j);
      }
      if (pi < 0) {
        break;
      }
      j = pi;
      if (f.k(pi) === pk && f.s(pi) === ps && f.a(pi) === pa) {
        const pp = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pi);
        if (pp >= 0 && (f.kw(pp, "let") || f.kw(pp, "var"))) {
          shadowed = true;
          break;
        }
      }
    }
    if (shadowed) {
      continue;
    }
    if (pk === SW_IDENT && startOfTypeIndex === prevIndex && swIsFunctionParameter(f, ps, dotIndex)) {
      continue;
    }
    if (f.tok(open, SW_START, "(")) {
      f.removeTokens(toI32(toU32(initIndex) + 1), open);
    }
    let endOfTypeIndex = startOfTypeIndex;
    for (let q = dotIndex - 1; q >= startOfTypeIndex; q = toI32(toU32(q) - 1)) {
      const k = f.k(q);
      if (k !== SW_SPACE && k !== SW_LINEBREAK && !f.isComment(q)) {
        endOfTypeIndex = q;
        break;
      }
    }
    f.removeTokens(toI32(toU32(endOfTypeIndex) + 1), toI32(toU32(initIndex) + 1));
  }
};
