// SwiftFormat's braces (K&R), wrapMultilineStatementBraces and
// elseOnSameLine rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import { SwFormatter, swIndexBeforeWhere } from "./formatter";
import {
  swEndOfScope,
  swHasLinebreak,
  swIndexOfLastSignificantKeyword,
  swIsGuardElse,
  swIsStartOfClosure,
  SW_EX_CASE,
  SW_EX_LET,
  SW_EX_VAR,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** Swift's String `<` for ASCII-ish strings: byte-wise lexicographic order. */
export const swStrLess = (a: string, b: string): boolean => {
  const n = toI32(a.length);
  const m = toI32(b.length);
  const k = n < m ? n : m;
  for (let i = 0; i < k && i < n && i < m; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) {
      return x < y;
    }
  }
  return n < m;
};

/** shouldWrapMultilineStatementBrace(at:). */
export const swShouldWrapMultilineStatementBrace = (f: SwFormatter, index: i32): boolean => {
  const endIndex = swEndOfScope(f, index);
  if (endIndex < 0 || !swHasLinebreak(f, toI32(toU32(index) + 1), endIndex)) {
    return false;
  }
  const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (prevIndex < 0 || f.k(prevIndex) === SW_START || f.k(prevIndex) === SW_DELIM) {
    return false;
  }
  const indent = f.currentIndentForLine(prevIndex);
  if (!swIsStartOfClosure(f, index)) {
    return swStrLess(f.currentIndentForLine(endIndex), indent);
  }
  if (f.tok(prevIndex, SW_END, ")") && f.k(f.startOfLine(prevIndex, true)) !== SW_END) {
    const startIndex = f.indexOfBefore(SW_START, "(", 0, prevIndex);
    if (startIndex >= 0 && swStrLess(f.currentIndentForLine(startIndex), indent)) {
      return !f.onSameLine(startIndex, prevIndex);
    }
  }
  return false;
};

/** braces (K&R; maxWidth is 0, so unwrapping never exceeds it). */
export const swRuleBraces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "{")) {
      continue;
    }
    const closing = swEndOfScope(f, i);
    if (closing < 0 || f.indexInType(SW_T_LINEBREAK, toI32(toU32(i) + 1), closing) < 0) {
      continue;
    }
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (pt < 0 || f.tok(pt, SW_DELIM, ",") || f.kw(pt, "in") || f.k(pt) === SW_START) {
      continue;
    }
    const pen = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, closing);
    if (pen >= 0 && f.k(pen) !== SW_LINEBREAK) {
      f.insertSpace(f.currentIndentForLine(i), closing);
      f.insertLinebreak(closing);
      if (f.has(closing - 1) && f.k(closing - 1) === SW_SPACE) {
        f.removeToken(closing - 1);
      }
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (prevIndex < 0 || !swHasLinebreak(f, prevIndex, i) || f.isComment(prevIndex) || f.tok(prevIndex, SW_END, "}")) {
      continue;
    }
    // A token index: prevIndex + 1 cannot overflow.
    if (prevIndex >= 2147483647) {
      fault();
      return;
    }
    const sl = f.startOfLine(prevIndex, true);
    if (f.tok(sl, SW_START, "#if") || f.kw(sl, "#elseif") || f.kw(sl, "#else") || f.tok(sl, SW_END, "#endif")) {
      continue;
    }
    if (f.ruleEnabled("wrapMultilineStatementBraces") && swShouldWrapMultilineStatementBrace(f, i)) {
      continue;
    }
    f.replaceTokensWith1(prevIndex + 1, i, SW_SPACE, " ", 0);
  }
};

/** wrapMultilineStatementBraces. */
export const swRuleWrapMultilineStatementBraces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "{")) {
      continue;
    }
    const l = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
    if (l < 0 || f.k(l) === SW_LINEBREAK || !swShouldWrapMultilineStatementBrace(f, i)) {
      continue;
    }
    const endIndex = swEndOfScope(f, i);
    if (endIndex < 0) {
      continue;
    }
    const indent = f.currentIndentForLine(endIndex);
    f.insertLinebreak(i);
    f.insertSpace(indent, toI32(toU32(i) + 1));
    if (f.has(i - 1) && f.k(i - 1) === SW_SPACE) {
      f.removeToken(i - 1);
    }
  }
};

/** bracesContainLinebreak. */
const swBracesContainLinebreak = (f: SwFormatter, endIndex: i32): boolean => {
  const s = f.indexOfBefore(SW_START, "{", 0, endIndex);
  if (s < 0) {
    return false;
  }
  return swHasLinebreak(f, s, endIndex);
};

/** elseOnSameLine (elsePosition sameLine, guardElsePosition auto, K&R braces). */
export const swRuleElseOnSameLine = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    let stage = 0; // 1: the else body; 2: the catch body
    if (f.kw(i, "while")) {
      const endIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (endIndex >= 0 && f.tok(endIndex, SW_END, "}")) {
        const startIndex = f.indexOfBefore(SW_START, "{", 0, endIndex);
        if (startIndex >= 0 && f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex, SW_KEYWORD, "repeat")) {
          stage = 1;
        }
      }
    } else if (f.kw(i, "else")) {
      stage = 1;
    } else if (f.kw(i, "catch")) {
      stage = 2;
    }
    if (stage === 1) {
      let prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
      const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
      if (prevIndex < 0 || nextIndex < 0 || f.isComment(nextIndex)) {
        continue;
      }
      const isOnNewLine = f.k(prevIndex) === SW_LINEBREAK;
      if (isOnNewLine) {
        const p = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
        if (p >= 0) {
          prevIndex = p;
        }
      }
      // Token indices: prevIndex + 1 and i + 1 cannot overflow.
      if (prevIndex >= 2147483647 || i >= 2147483647) {
        fault();
        return;
      }
      if (f.tok(prevIndex, SW_END, "}") && !swIsGuardElse(f, i)) {
        stage = 2;
      } else {
        const guardIndex = swIndexOfLastSignificantKeyword(f, prevIndex + 1, SW_EX_VAR | SW_EX_LET | SW_EX_CASE);
        if (guardIndex < 0 || !f.kw(guardIndex, "guard")) {
          continue;
        }
        const shouldWrap = isOnNewLine || swHasLinebreak(f, i + 1, nextIndex);
        if (shouldWrap) {
          f.replaceTokensWith1(i + 1, nextIndex, SW_SPACE, " ", 0);
          if (!isOnNewLine) {
            f.replaceTokens(prevIndex + 1, i, [new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(prevIndex + 1))]);
            // A token index: the u32 sum is exact.
            f.insertSpace(f.currentIndentForLine(guardIndex), toI32(toU32(prevIndex) + 2));
          }
        } else if (isOnNewLine && !f.isComment(prevIndex)) {
          f.replaceTokensWith1(prevIndex + 1, i, SW_SPACE, " ", 0);
        }
        continue;
      }
    }
    if (stage === 2) {
      const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
      if (prevIndex < 0) {
        continue;
      }
      if (f.k(prevIndex) === SW_LINEBREAK) {
        const lt = swIndexBeforeWhere(f, prevIndex, (g, j) => !(g.k(j) === SW_SPACE || g.isComment(j)));
        if (lt >= 0 && f.k(lt) === SW_LINEBREAK) {
          continue;
        }
        const pb = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, prevIndex);
        if (pb >= 0 && f.tok(pb, SW_END, "}") && swBracesContainLinebreak(f, pb)) {
          // A token index: pb + 1 cannot overflow.
          if (pb >= 2147483647) {
            fault();
            return;
          }
          f.replaceTokensWith1(pb + 1, i, SW_SPACE, " ", 0);
        }
      }
    }
  }
};
