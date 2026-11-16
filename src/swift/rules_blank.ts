// SwiftFormat's blank-line rules: blankLinesAtStartOfScope,
// blankLinesAtEndOfScope, blankLinesBetweenImports, blankLineAfterImports,
// emptyBraces, leadingDelimiters, docCommentsBeforeModifiers.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

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

/** tokens[lo...hi].numberOfLeadingLinebreaks(). */
export const swLeadingLinebreaks = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  let n = 0;
  let i = lo;
  while (i <= hi && f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK)) {
    if (f.k(i) === SW_LINEBREAK) {
      n++;
    }
    i++;
  }
  return n;
};

/** tokens[lo...hi].numberOfTrailingLinebreaks(). */
export const swTrailingLinebreaks = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  let n = 0;
  let i = hi;
  while (i >= lo && f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK)) {
    if (f.k(i) === SW_LINEBREAK) {
      n++;
    }
    i--;
  }
  return n;
};

/** removeLeadingBlankLinesIfPresent(in: lo...hi). */
export const swRemoveLeadingBlankLines = (f: SwFormatter, lo: i32, hi: i32): void => {
  const h = f.ref(lo, hi);
  while (swLeadingLinebreaks(f, f.refLo[h], f.refHi[h]) > 1) {
    const first = f.indexInType(SW_T_LINEBREAK, f.refLo[h], f.refHi[h] + 1);
    if (first < 0) {
      break;
    }
    f.removeTokens(f.refLo[h], first + 1);
  }
  f.unref(h);
};

/** removeTrailingBlankLinesIfPresent(in: lo...hi). */
export const swRemoveTrailingBlankLines = (f: SwFormatter, lo: i32, hi: i32): void => {
  const h = f.ref(lo, hi);
  while (swTrailingLinebreaks(f, f.refLo[h], f.refHi[h]) > 1) {
    const last = f.lastIndexInType(SW_T_LINEBREAK, f.refLo[h], f.refHi[h] + 1);
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
      if (e >= 0 && startOfScope + 1 < e) {
        const inIndex = f.indexOfIn(SW_KEYWORD, "in", 0, startOfScope + 1, e);
        if (inIndex >= 0 && swStartOfScope(f, inIndex) === startOfScope) {
          startOfScope = inIndex;
        }
      }
    }
    const endOfScope = swEndOfScope(f, startOfScope);
    if (endOfScope < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, startOfScope) === endOfScope) {
      continue;
    }
    swRemoveLeadingBlankLines(f, startOfScope + 1, endOfScope - 1);
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
    swRemoveTrailingBlankLines(f, i + 1, endOfScope - 1);
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
    const toks: SwTok[] = [new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(i + 1))];
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
    if (k === SW_LINEBREAK || f.kw(nextIndex, "import") || f.kw(nextIndex, "#else") || f.kw(nextIndex, "#elseif") || f.tok(nextIndex, SW_END, "#endif")) {
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
    f.removeTokens(i + 1, closing);
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
      nextIndex = i + 1;
    }
    f.insertSpace(f.currentIndentForLine(i), nextIndex);
    f.insertLinebreak(nextIndex);
    f.removeTokens(i + 1, nextIndex);
    const lb = f.indexBefore(SW_T_NON_SPACE, endOfLine);
    if (lb < 0 || f.k(lb) !== SW_COMMENT) {
      f.removeTokens(endOfLine, i);
      continue;
    }
    const startIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, endOfLine);
    f.removeTokens(endOfLine, i);
    const comment = f.slice(startIndex + 1, endOfLine);
    f.insertToks(comment, endOfLine + 1);
    f.removeTokens(startIndex + 1, endOfLine);
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
        while (f.has(endIndex + 1) && (f.k(endIndex + 1) === SW_SPACE || f.k(endIndex + 1) === SW_LINEBREAK)) {
          endIndex++;
        }
        f.moveTokens(index, endIndex, insertionPoint);
        insertionPoint += endIndex - index + 1;
      }
      startIndex = endIndex + 1;
    }
  }
};
