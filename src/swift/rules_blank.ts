// SwiftFormat's blank-line rules: blankLinesAtStartOfScope,
// blankLinesAtEndOfScope, blankLinesBetweenImports, blankLineAfterImports,
// emptyBraces, leadingDelimiters, docCommentsBeforeModifiers.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swRefHi, swRefLo } from "./decl";
import { SwFormatter } from "./formatter";
import { swIsDocComment, swIsModifier, swStartOfModifiers } from "./modifiers";
import { swEndOfScope, swIsAttribute, swIsDeclarationTypeKeyword, swIsStartOfClosure, swStartOfScope } from "./parsing";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_SPACE,
  SW_START,
  SW_T_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SwTok,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** tokens[lo...hi].numberOfLeadingLinebreaks(). */
export const swLeadingLinebreaks = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  let n = 0;
  let i = lo;
  while (i <= hi && f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK)) {
    if (f.k(i) === SW_LINEBREAK) {
      n = toI32(toU32(n) + 1);
    }
    i = toI32(toU32(i) + 1);
  }
  return n;
};

/** tokens[lo...hi].numberOfTrailingLinebreaks(). */
export const swTrailingLinebreaks = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  let n = 0;
  let i = hi;
  while (i >= lo && f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK)) {
    if (f.k(i) === SW_LINEBREAK) {
      n = toI32(toU32(n) + 1);
    }
    i = toI32(toU32(i) - 1);
  }
  return n;
};

/** removeLeadingBlankLinesIfPresent(in: lo...hi). */
export const swRemoveLeadingBlankLines = (f: SwFormatter, lo: i32, hi: i32): void => {
  const h = f.ref(lo, hi);
  // Token indices: the u32 sums are exact.
  while (swLeadingLinebreaks(f, swRefLo(f, h), swRefHi(f, h)) > 1) {
    const first = f.indexInType(SW_T_LINEBREAK, swRefLo(f, h), toI32(toU32(swRefHi(f, h)) + 1));
    if (first < 0) {
      break;
    }
    f.removeTokens(swRefLo(f, h), toI32(toU32(first) + 1));
  }
  f.unref(h);
};

/** removeTrailingBlankLinesIfPresent(in: lo...hi). */
export const swRemoveTrailingBlankLines = (f: SwFormatter, lo: i32, hi: i32): void => {
  const h = f.ref(lo, hi);
  // Token indices: the u32 sums are exact.
  while (swTrailingLinebreaks(f, swRefLo(f, h), swRefHi(f, h)) > 1) {
    const last = f.lastIndexInType(SW_T_LINEBREAK, swRefLo(f, h), toI32(toU32(swRefHi(f, h)) + 1));
    if (last < 0) {
      break;
    }
    f.removeToken(last);
    if (f.has(last - 1) && f.k(last - 1) === SW_SPACE && f.has(last - 2) && f.k(last - 2) === SW_LINEBREAK) {
      f.removeToken(last - 1);
    }
  }
  f.unref(h);
};

/** blankLinesAtStartOfScope (typeBlankLines and scopeBlankLines are `remove`). */
export const swRuleBlankLinesAtStartOfScope = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_START) {
      continue;
    }
    const s = f.s(i);
    if (!(s === "{" || s === "(" || s === "[" || s === "<" || s === ":")) {
      continue;
    }
    let startOfScope = i;
    if (swIsStartOfClosure(f, startOfScope)) {
      const e = swEndOfScope(f, startOfScope);
      if (e >= 0 && toI32(toU32(startOfScope) + 1) < e) {
        const inIndex = f.indexOfIn(SW_KEYWORD, "in", 0, toI32(toU32(startOfScope) + 1), e);
        if (inIndex >= 0 && swStartOfScope(f, inIndex) === startOfScope) {
          startOfScope = inIndex;
        }
      }
    }
    const endOfScope = swEndOfScope(f, startOfScope);
    if (endOfScope < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, startOfScope) === endOfScope) {
      continue;
    }
    swRemoveLeadingBlankLines(f, toI32(toU32(startOfScope) + 1), endOfScope - 1);
  }
};

/** blankLinesAtEndOfScope. */
export const swRuleBlankLinesAtEndOfScope = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_START) {
      continue;
    }
    const s = f.s(i);
    if (!(s === "{" || s === "(" || s === "[" || s === "<")) {
      continue;
    }
    const endOfScope = swEndOfScope(f, i);
    if (endOfScope < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i) === endOfScope) {
      continue;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, endOfScope);
    if (n >= 0 && f.k(n) !== SW_LINEBREAK) {
      continue;
    }
    swRemoveTrailingBlankLines(f, toI32(toU32(i) + 1), endOfScope - 1);
  }
};

/** blankLinesBetweenImports. */
export const swRuleBlankLinesBetweenImports = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "import")) {
      continue;
    }
    const endOfLine = f.indexAfter(SW_T_LINEBREAK, i);
    if (endOfLine < 0) {
      continue;
    }
    const next = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, endOfLine);
    if (next < 0 || !(f.kw(next, "@testable") || f.kw(next, "import"))) {
      continue;
    }
    const indent = f.currentIndentForLine(next);
    const toks: SwTok[] = [new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(toI32(toU32(i) + 1)))];
    if (indent.length !== 0) {
      toks.push(new SwTok(SW_SPACE, indent, 0));
    }
    f.replaceTokens(endOfLine, next, toks);
  }
};

/** blankLineAfterImports. */
export const swRuleBlankLineAfterImports = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "import")) {
      continue;
    }
    const endOfLine = f.indexAfter(SW_T_LINEBREAK, i);
    if (endOfLine < 0) {
      continue;
    }
    let nextIndex = f.indexAfter(SW_T_NON_SPACE, endOfLine);
    if (nextIndex < 0) {
      continue;
    }
    while (f.tok(nextIndex, SW_START, "#if") || swIsModifier(f, nextIndex) || swIsAttribute(f, nextIndex)) {
      const index = f.indexAfter(SW_T_KEYWORD, nextIndex);
      if (index < 0) {
        break;
      }
      nextIndex = index;
    }
    const k = f.k(nextIndex);
    if (
      k === SW_LINEBREAK ||
      f.kw(nextIndex, "import") ||
      f.kw(nextIndex, "#else") ||
      f.kw(nextIndex, "#elseif") ||
      f.tok(nextIndex, SW_END, "#endif")
    ) {
      continue;
    }
    f.insertLinebreak(endOfLine);
  }
};

/** emptyBraces (noSpace). */
export const swRuleEmptyBraces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "{")) {
      continue;
    }
    const closing = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (closing < 0 || !f.tok(closing, SW_END, "}")) {
      continue;
    }
    const t = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, closing);
    if (t >= 0 && (f.kw(t, "else") || f.kw(t, "catch"))) {
      continue;
    }
    f.removeTokens(toI32(toU32(i) + 1), closing);
  }
};

/** leadingDelimiters. */
export const swRuleLeadingDelimiters = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_DELIM) {
      continue;
    }
    const endOfLine = f.indexBefore(SW_T_NON_SPACE, i);
    if (endOfLine < 0 || f.k(endOfLine) !== SW_LINEBREAK) {
      continue;
    }
    let nextIndex = f.indexAfter(SW_T_NON_SPACE, i);
    if (nextIndex < 0) {
      nextIndex = toI32(toU32(i) + 1);
    }
    f.insertSpace(f.currentIndentForLine(i), nextIndex);
    f.insertLinebreak(nextIndex);
    f.removeTokens(toI32(toU32(i) + 1), nextIndex);
    const lb = f.indexBefore(SW_T_NON_SPACE, endOfLine);
    if (lb < 0 || f.k(lb) !== SW_COMMENT) {
      f.removeTokens(endOfLine, i);
      continue;
    }
    const startIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, endOfLine);
    f.removeTokens(endOfLine, i);
    const comment = f.slice(toI32(toU32(startIndex) + 1), endOfLine);
    f.insertToks(comment, toI32(toU32(endOfLine) + 1));
    f.removeTokens(toI32(toU32(startIndex) + 1), endOfLine);
  }
};

/** docCommentsBeforeModifiers. */
export const swRuleDocCommentsBeforeModifiers = (f: SwFormatter): void => {
  for (let keywordIndex = f.enumStart(); keywordIndex >= 0; keywordIndex = f.enumNext()) {
    if (!swIsDeclarationTypeKeyword(f, keywordIndex)) {
      continue;
    }
    const som = swStartOfModifiers(f, keywordIndex, true);
    if (!(som < keywordIndex)) {
      continue;
    }
    let insertionPoint = som;
    let startIndex = som;
    while (true) {
      const index = f.indexInType(SW_T_START_OF_SCOPE, startIndex, keywordIndex);
      if (index < 0) {
        break;
      }
      let endIndex = swEndOfScope(f, index);
      if (endIndex < 0) {
        break;
      }
      if (swIsDocComment(f, index)) {
        // f.has(endIndex + 1) needs endIndex < f.count(), which bounds the sum.
        while (endIndex < f.count()) {
          const next = endIndex + 1;
          if (!f.has(next)) {
            break;
          }
          const nk = f.k(next);
          if (!(nk === SW_SPACE || nk === SW_LINEBREAK)) {
            break;
          }
          endIndex = next;
        }
        f.moveTokens(index, endIndex, insertionPoint);
        insertionPoint = toI32(toU32(insertionPoint) + toU32(endIndex) - toU32(index) + 1);
      }
      startIndex = toI32(toU32(endIndex) + 1);
    }
  }
};
