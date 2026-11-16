// SwiftFormat's wrapArguments rule: wrapCollectionsAndArguments(completePartialWrapping: true,
// wrapSingleArguments: true) with the default options (every list mode preserve, maxWidth 0,
// balanced closing parens, partial wrapping allowed, typealias/ternary/condition/return/effects
// wrapping off, so only the partial-wrapping completion runs).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swIsInStringLiteral } from "./expr";
import { SwFormatter, swIndexAfterWhere } from "./formatter";
import { swEndOfScope, swIsCommentedCode, swSpaceEquivalentToTokens } from "./parsing";
import { swIsParameterList } from "./parsing2";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_IDENT,
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

const SW_INDENT_UNIT: string = "    ";

/** removeLinebreakBeforeEndOfScope(at:): answers the new end of scope. */
const swRemoveLinebreakBeforeEndOfScope = (f: SwFormatter, endOfScope0: i32): i32 => {
  let endOfScope = endOfScope0;
  const lastIndex = f.indexBefore(SW_T_NON_SPACE, endOfScope);
  if (lastIndex < 0 || f.k(lastIndex) !== SW_LINEBREAK) {
    return endOfScope;
  }
  const p = f.indexBefore(SW_T_NON_SPACE, lastIndex);
  if (p >= 0 && f.k(p) === SW_COMMENT) {
    return endOfScope;
  }
  f.removeTokens(lastIndex, endOfScope);
  endOfScope = lastIndex;
  const pc = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfScope);
  if (pc >= 0 && f.tok(pc, SW_DELIM, ",")) {
    f.removeToken(pc);
    endOfScope--;
  }
  return endOfScope;
};

/** keepParameterLabelsOnSameLine(startOfScope:endOfScope:): answers the new end of scope. */
const swKeepParameterLabelsOnSameLine = (f: SwFormatter, i: i32, endOfScope0: i32): i32 => {
  let endOfScope = endOfScope0;
  let endIndex = endOfScope;
  while (true) {
    const index = f.lastIndexInType(SW_T_LINEBREAK, i + 1, endIndex);
    if (index < 0) {
      break;
    }
    endIndex = index;
    const lastIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, index);
    if (lastIndex < 0 || f.k(lastIndex) !== SW_IDENT) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
    if (nextIndex < 0 || f.k(nextIndex) !== SW_IDENT) {
      continue;
    }
    const lb = f.slice(index, nextIndex);
    const count = nextIndex - (lastIndex + 1);
    f.replaceTokens(lastIndex + 1, nextIndex, [new SwTok(SW_SPACE, " ", 0)]);
    endOfScope -= count - 1;
    const nextComma = f.indexOfAfter(SW_DELIM, ",", 0, index);
    if (nextComma >= 0) {
      if (f.has(nextComma + 1) && f.k(nextComma + 1) === SW_SPACE) {
        f.replaceTokens(nextComma + 1, nextComma + 2, lb);
        endOfScope += toI32(lb.length) - 1;
      } else {
        f.insertToks(lb, nextComma + 1);
        endOfScope += toI32(lb.length);
      }
    }
  }
  return endOfScope;
};

/** wrapArgumentsBeforeFirst (allowGrouping true, closing paren balanced). */
const swWrapArgumentsBeforeFirst = (f: SwFormatter, i: i32, endOfScope0: i32): void => {
  const indent = f.currentIndentForLine(i);
  let endOfScope = swKeepParameterLabelsOnSameLine(f, i, endOfScope0);
  let index = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfScope);
  if (!f.tok(index, SW_DELIM, ",")) {
    index++;
  }
  while (true) {
    const commaIndex = f.lastIndexOfIn(SW_DELIM, ",", 0, i + 1, index);
    if (commaIndex < 0) {
      break;
    }
    let linebreakIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, commaIndex);
    if (linebreakIndex < 0) {
      break;
    }
    const x = f.indexBefore(SW_T_NON_SPACE, linebreakIndex);
    if (x >= 0) {
      linebreakIndex = x + 1;
    }
    if (!swIsCommentedCode(f, linebreakIndex + 1)) {
      if (f.k(linebreakIndex) === SW_LINEBREAK) {
        const nn = f.indexAfter(SW_T_NON_SPACE, linebreakIndex);
        if (nn >= 0 && f.k(nn) !== SW_LINEBREAK) {
          endOfScope += f.insertSpace(indent + SW_INDENT_UNIT, linebreakIndex + 1);
        }
      }
    }
    index = commaIndex;
  }
  const insertAfterParen = f.indexOfAfter(SW_DELIM, ",", 0, i) >= 0;
  if (insertAfterParen) {
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
    if (nextIndex >= 0) {
      if (f.k(nextIndex) !== SW_LINEBREAK) {
        f.insertLinebreak(nextIndex);
        endOfScope++;
      }
      const nsp = f.indexAfter(SW_T_NON_SPACE, nextIndex);
      if (nextIndex + 1 < endOfScope && nsp >= 0 && f.k(nsp) !== SW_LINEBREAK) {
        let ind = indent;
        if (nsp < endOfScope && !swIsCommentedCode(f, nsp)) {
          ind = ind + SW_INDENT_UNIT;
        }
        endOfScope += f.insertSpace(ind, nextIndex + 1);
      }
    }
  }
  const nt = swIndexAfterWhere(f, i, (g, j) => !g.isComment(j));
  const hasLineBreakAfterOpeningParen = nt >= 0 && f.k(nt) === SW_LINEBREAK;
  if (hasLineBreakAfterOpeningParen) {
    const lastIndex = f.indexBefore(SW_T_NON_SPACE, endOfScope);
    if (lastIndex >= 0) {
      endOfScope += f.insertSpace(indent, lastIndex + 1);
      if (f.k(lastIndex) !== SW_LINEBREAK) {
        f.insertLinebreak(lastIndex + 1);
        endOfScope++;
      }
    }
  }
};

/** wrapArgumentsAfterFirst (allowGrouping true, maxWidth 0). */
const swWrapArgumentsAfterFirst = (f: SwFormatter, i: i32, endOfScope0: i32): void => {
  let firstArgumentIndex = f.indexInType(SW_T_NON_SPACE_OR_LINEBREAK, i + 1, endOfScope0);
  if (firstArgumentIndex < 0) {
    return;
  }
  let endOfScope = swKeepParameterLabelsOnSameLine(f, i, endOfScope0);
  f.removeTokens(i + 1, firstArgumentIndex);
  endOfScope -= firstArgumentIndex - (i + 1);
  firstArgumentIndex = i + 1;
  const start = f.startOfLine(i);
  const indent = swSpaceEquivalentToTokens(f, start, firstArgumentIndex);
  endOfScope = swRemoveLinebreakBeforeEndOfScope(f, endOfScope);
  let index = firstArgumentIndex;
  while (true) {
    const commaIndex = f.indexOfIn(SW_DELIM, ",", 0, index, endOfScope);
    if (commaIndex < 0) {
      break;
    }
    let linebreakIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, commaIndex);
    if (linebreakIndex < 0) {
      break;
    }
    const x = f.indexBefore(SW_T_NON_SPACE, linebreakIndex);
    if (x >= 0) {
      linebreakIndex = x + 1;
    }
    if (f.k(linebreakIndex) === SW_LINEBREAK) {
      if (linebreakIndex + 1 !== endOfScope && !swIsCommentedCode(f, linebreakIndex + 1)) {
        endOfScope += f.insertSpace(indent, linebreakIndex + 1);
      }
    }
    index = commaIndex + 1;
  }
};

/** wrapArguments. */
export const swRuleWrapArguments = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_START) {
      continue;
    }
    const s = f.s(i);
    if (!(s === "(" || s === "[" || s === "<")) {
      continue;
    }
    const endOfScope = swEndOfScope(f, i);
    if (endOfScope < 0) {
      continue;
    }
    if (s === "(") {
      if (!f.has(i - 1) || f.kw(i - 1, "#colorLiteral") || f.kw(i - 1, "#imageLiteral")) {
        continue;
      }
      if (f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i + 1, endOfScope) < 0 && swIsParameterList(f, i)) {
        if (f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfScope, SW_START, "{")) {
          swRemoveLinebreakBeforeEndOfScope(f, endOfScope);
          continue;
        }
      }
    }
    // (Side-effect free checks, cheapest first.)
    const firstLinebreakIndex = f.indexInType(SW_T_LINEBREAK, i + 1, endOfScope);
    if (firstLinebreakIndex < 0) {
      continue;
    }
    const firstIdentifierIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (firstIdentifierIndex < 0 || swIsInStringLiteral(f, i)) {
      continue;
    }
    if (firstIdentifierIndex > firstLinebreakIndex) {
      swWrapArgumentsBeforeFirst(f, i, endOfScope);
    } else {
      swWrapArgumentsAfterFirst(f, i, endOfScope);
    }
  }
};
