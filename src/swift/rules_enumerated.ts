// SwiftFormat's redundantEnumerated rule, with startOfMemberCallReceiver(endingAt:)
// and startOfForLoopBody(after:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swParseExpressionEnd } from "./expr";
import { SwFormatter } from "./formatter";
import { swUnescaped } from "./funcdecl";
import { swEndOfScope, swIsStartOfClosure, swStartOfForLoopPattern, swStartOfScope } from "./parsing";
import { swParseFunctionCallArguments } from "./rules_trailing";
import { swRemoveUsed } from "./rules_unused";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_PREFIX,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

/** startOfMemberCallReceiver(endingAt:stoppingAtLeadingNegation:), or -1. */
export const swStartOfMemberCallReceiver = (f: SwFormatter, dotIndex: i32, stopAtNegation: boolean): i32 => {
  let start = dotIndex;
  while (true) {
    const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
    if (prev < 0) {
      return start;
    }
    const k = f.k(prev);
    const s = f.s(prev);
    if ((k === SW_OP && s === ".") || f.tok(prev, SW_DELIM, ".")) {
      const bd = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      if (bd < 0 || !(f.k(bd) === SW_IDENT || f.k(bd) === SW_END)) {
        return -1;
      }
      start = prev;
    } else if (k === SW_IDENT) {
      if (f.k(start) === SW_IDENT) {
        return start;
      }
      start = prev;
    } else if (stopAtNegation && f.op(prev, "!", SW_OP_PREFIX)) {
      return start;
    } else if (k === SW_OP && (s === "?" || s === "!")) {
      return -1;
    } else if (k === SW_OP && f.a(prev) === SW_OP_PREFIX) {
      return -1;
    } else if (k === SW_END && (s === ")" || s === "]" || s === ">" || s === "}")) {
      if (f.k(start) === SW_IDENT) {
        return start;
      }
      const ss = swStartOfScope(f, prev);
      if (ss < 0) {
        return -1;
      }
      start = ss;
    } else {
      return start;
    }
  }
};

/** startOfForLoopBody(after:), or -1. */
export const swStartOfForLoopBody = (f: SwFormatter, index: i32): i32 => {
  let i = index;
  while (true) {
    const sob = f.indexOfAfter(SW_START, "{", 0, i);
    if (sob < 0) {
      return -1;
    }
    if (swIsStartOfClosure(f, sob)) {
      const e = swEndOfScope(f, sob);
      if (e >= 0) {
        i = e;
        continue;
      }
    }
    return sob;
  }
};

/** redundantEnumeratedCall(endingAt:) as the `.` index (the call ends at endIndex0's call), or -1. */
const swRedundantEnumeratedCallDot = (f: SwFormatter, endIndex0: i32): i32 => {
  let endIndex = endIndex0;
  while (true) {
    if (!f.tok(endIndex, SW_END, ")")) {
      return -1;
    }
    const callStart = swStartOfScope(f, endIndex);
    if (callStart < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, callStart) !== endIndex) {
      return -1;
    }
    const method = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, callStart);
    const dot = method >= 0 ? f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, method) : -1;
    if (dot < 0 || !f.op(dot, ".", SW_OP_INFIX)) {
      return -1;
    }
    if (f.tok(method, SW_IDENT, "enumerated")) {
      return dot;
    }
    if (!f.tok(method, SW_IDENT, "reversed")) {
      return -1;
    }
    const re = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot);
    if (re < 0) {
      return -1;
    }
    endIndex = re;
  }
};

const swHasCommentIn = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.isComment(j)) {
      return true;
    }
  }
  return false;
};

/** removeRedundantEnumerated(at:). */
const swRemoveRedundantEnumerated = (f: SwFormatter, forIndex: i32): void => {
  const ps = swStartOfForLoopPattern(f, forIndex);
  if (ps < 0 || !f.tok(ps, SW_START, "(")) {
    return;
  }
  const pe = swEndOfScope(f, ps);
  const inIndex = pe >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pe) : -1;
  if (inIndex < 0 || !f.kw(inIndex, "in")) {
    return;
  }
  const b = swParseFunctionCallArguments(f, ps);
  if (b.length !== 2) {
    return;
  }
  for (const a of b) {
    if (a.labelIndex >= 0 || a.lo !== a.hi || f.k(a.lo) !== SW_IDENT) {
      return;
    }
  }
  const ss = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, inIndex);
  const se = ss >= 0 ? swParseExpressionEnd(f, ss) : -1;
  if (se < 0) {
    return;
  }
  // the enumerated() call ends where the sequence ends
  const dot = swRedundantEnumeratedCallDot(f, se);
  if (dot < 0) {
    return;
  }
  const enumEnd = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot) >= 0 ? swEnumeratedCallEnd(f, dot) : -1;
  if (enumEnd < 0) {
    return;
  }
  const rs = swStartOfMemberCallReceiver(f, dot, false);
  if (
    rs < 0 ||
    !(rs === ss || (f.tok(ss, SW_IDENT, "unsafe") && f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ss) === rs))
  ) {
    return;
  }
  const after = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, se);
  if (after < 0 || !(f.kw(after, "where") || f.tok(after, SW_START, "{"))) {
    return;
  }
  const bs = swStartOfForLoopBody(f, se);
  const be = bs >= 0 ? swEndOfScope(f, bs) : -1;
  if (be < 0) {
    return;
  }
  const indexBinding = b[0].lo;
  const name = swUnescaped(f.s(indexBinding));
  if (name !== "_") {
    const names: string[] = [name];
    const data: i32[] = [indexBinding];
    if (!swRemoveUsed(f, names, data, [], bs + 1, be)) {
      return;
    }
    if (f.kw(after, "where") && names.length !== 0) {
      if (!swRemoveUsed(f, names, data, [], after + 1, bs)) {
        return;
      }
    }
    if (names.length === 0) {
      return;
    }
  }
  const element = b[1].lo;
  if (swHasCommentIn(f, dot, enumEnd + 1) || swHasCommentIn(f, ps, element) || swHasCommentIn(f, element + 1, pe + 1)) {
    return;
  }
  f.removeTokens(dot, enumEnd + 1);
  f.removeTokens(element + 1, pe + 1);
  f.removeTokens(ps, element);
};

/** The `)` closing the `enumerated()` call whose `.` is at dot. */
const swEnumeratedCallEnd = (f: SwFormatter, dot: i32): i32 => {
  const method = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot);
  const open = method >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, method) : -1;
  return open >= 0 && f.tok(open, SW_START, "(") ? swEndOfScope(f, open) : -1;
};

/** redundantEnumerated. */
export const swRuleRedundantEnumerated = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.kw(i, "for")) {
      swRemoveRedundantEnumerated(f, i);
    }
  }
};
