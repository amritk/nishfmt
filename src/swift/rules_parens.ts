// SwiftFormat's redundantParens rule (swiftVersion undefined) and removeParen(at:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swIsUnsafeExpression } from "./expr";
import { SwFormatter, swIndexBeforeWhere, swIndexInWhere } from "./formatter";
import { swIsInClosureArguments, swIsStartOfClosure, swIsUnwrap, swStartOfScope } from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_NONE,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

const swOutsideParenRequiresSpacing = (f: SwFormatter, i: i32): boolean => {
  if (!f.has(i)) {
    return false;
  }
  const k = f.k(i);
  return k === SW_IDENT || k === SW_KEYWORD || k === SW_NUMBER || f.tok(i, SW_START, "#if");
};

const swInsideParenRequiresSpacing = (f: SwFormatter, i: i32): boolean => {
  if (!f.has(i)) {
    return false;
  }
  const k = f.k(i);
  if (k === SW_OP || f.tok(i, SW_START, "{") || f.tok(i, SW_END, "}")) {
    return true;
  }
  return swOutsideParenRequiresSpacing(f, i);
};

/** removeParen(at:). */
export const swRemoveParen = (f: SwFormatter, index: i32): void => {
  const isStartOfScope = f.k(index) === SW_START;
  const spaceBefore = f.has(toI32(toU32(index) - 1)) && f.k(toI32(toU32(index) - 1)) === SW_SPACE;
  const spaceAfter =
    f.has(toI32(toU32(index) + 1)) &&
    (f.k(toI32(toU32(index) + 1)) === SW_SPACE || f.k(toI32(toU32(index) + 1)) === SW_LINEBREAK);
  f.removeToken(index);
  if (isStartOfScope) {
    if (swOutsideParenRequiresSpacing(f, toI32(toU32(index) - 1)) && swInsideParenRequiresSpacing(f, index)) {
      if (!spaceBefore && !spaceAfter) {
        f.insert(SW_SPACE, " ", 0, index);
      }
    } else if (spaceAfter && spaceBefore) {
      f.removeToken(toI32(toU32(index) - 1));
    }
  } else if (swInsideParenRequiresSpacing(f, toI32(toU32(index) - 1)) && swOutsideParenRequiresSpacing(f, index)) {
    if (!spaceBefore && !spaceAfter) {
      f.insert(SW_SPACE, " ", 0, index);
    }
  } else if (spaceBefore) {
    f.removeToken(toI32(toU32(index) - 1));
  }
};

/** nestedParens(in: lo...hi): answers the inner opening paren, or -1 (the closing one is found again by the caller). */
const swNestedParensStart = (f: SwFormatter, lo: i32, hi: i32): i32 => {
  const s = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo);
  if (s < 0 || !f.tok(s, SW_START, "(")) {
    return -1;
  }
  const e = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, hi);
  if (e < 0 || !f.tok(e, SW_END, ")")) {
    return -1;
  }
  return f.indexOfAfter(SW_END, ")", 0, s) === e ? s : -1;
};

const swNestedParensEnd = (f: SwFormatter, hi: i32): i32 => f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, hi);

const swRemoveBoth = (f: SwFormatter, i: i32, closingIndex: i32): void => {
  swRemoveParen(f, closingIndex);
  swRemoveParen(f, i);
};

const swIsConditionalKeyword = (s: string): boolean =>
  s === "in" ||
  s === "while" ||
  s === "if" ||
  s === "case" ||
  s === "switch" ||
  s === "where" ||
  s === "for" ||
  s === "guard";

/** The prev/next context for the default case's scan. */
class SwParenCtx {
  pk: i32 = 9;
  ps: string = "";
  pa: i32 = 0;
  nk: i32 = 9;
  ns: string = "";
  na: i32 = 0;
  // next(.nonSpaceOrComment, after: closingIndex)
  lk: i32 = -1;
  ls: string = "";
  la: i32 = 0;
}

/** The predicate of the default case's `index(in: i + 1 ..< closingIndex, where:)`. */
const swParenBlocks = (f: SwFormatter, c: SwParenCtx, j: i32): boolean => {
  const k = f.k(j);
  const s = f.s(j);
  const a = f.a(j);
  if (
    (k === SW_OP && a === SW_OP_INFIX) ||
    (k === SW_IDENT && (s === "any" || s === "some" || s === "each")) ||
    (k === SW_KEYWORD && (s === "as" || s === "is" || s === "try" || s === "await"))
  ) {
    const prevIsEq = c.pk === SW_OP && c.pa === SW_OP_INFIX && c.ps === "=";
    if (!(prevIsEq && k === SW_OP && a === SW_OP_INFIX && s === "->")) {
      if (
        (c.pk === SW_OP && (c.pa === SW_OP_PREFIX || c.pa === SW_OP_INFIX)) ||
        (c.pk === SW_KEYWORD && (c.ps === "as" || c.ps === "is"))
      ) {
        return true;
      }
    }
    if (
      (c.nk === SW_OP && (c.na === SW_OP_POSTFIX || c.na === SW_OP_INFIX)) ||
      (c.nk === SW_KEYWORD && (c.ns === "as" || c.ns === "is"))
    ) {
      return true;
    }
    return (c.lk === SW_START && (c.ls === "[" || c.ls === "(")) || (c.lk === SW_OP && c.la === SW_OP_POSTFIX);
  }
  if (k === SW_OP && a === SW_OP_POSTFIX) {
    return (c.pk === SW_OP && c.pa === SW_OP_PREFIX) || (c.pk === SW_KEYWORD && (c.ps === "as" || c.ps === "is"));
  }
  if (k === SW_DELIM && (s === "," || s === ":" || s === ";")) {
    return true;
  }
  return (k === SW_OP && a === SW_OP_NONE) || (k === SW_START && s === "{");
};

/** The `default` case. */
const swParensDefault = (
  f: SwFormatter,
  c: SwParenCtx,
  i: i32,
  closingIndex0: i32,
  previousIndex: i32,
  innerStart: i32,
): void => {
  let closingIndex = closingIndex0;
  if (innerStart >= 0) {
    const innerEnd = swNestedParensEnd(f, closingIndex);
    swRemoveParen(f, innerEnd);
    swRemoveParen(f, innerStart);
    closingIndex = f.indexOfAfter(SW_END, ")", 0, i);
  }
  if (c.pk === SW_START && c.ps === "(") {
    const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, previousIndex);
    if (q >= 0 && f.tok(q, SW_IDENT, "Selector")) {
      return;
    }
  }
  if (
    f.k(toI32(toU32(closingIndex) - 1)) === SW_OP &&
    f.has(toI32(toU32(closingIndex) + 1)) &&
    f.k(toI32(toU32(closingIndex) + 1)) === SW_OP &&
    f.a(toI32(toU32(closingIndex) + 1)) === SW_OP_INFIX
  ) {
    return;
  }
  const nnl = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, closingIndex);
  c.lk = nnl >= 0 ? f.k(nnl) : -1;
  c.ls = nnl >= 0 ? f.s(nnl) : "";
  c.la = nnl >= 0 ? f.a(nnl) : 0;
  const x = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (x >= 0 && f.k(x) === SW_OP) {
    if (
      (c.nk === SW_OP && c.ns === ".") ||
      (x === toI32(toU32(i) + 1) &&
        f.has(i - 1) &&
        !(f.k(i - 1) === SW_SPACE || f.k(i - 1) === SW_LINEBREAK || f.isComment(i - 1)))
    ) {
      return;
    }
    if ((c.lk === SW_START && (c.ls === "[" || c.ls === "(")) || (c.lk === SW_OP && c.la === SW_OP_POSTFIX)) {
      return;
    }
  }
  if (x === closingIndex) {
    return;
  }
  if (swIndexInWhere(f, toI32(toU32(i) + 1), closingIndex, (g, j) => swParenBlocks(g, c, j)) >= 0) {
    return;
  }
  const u = swIndexInWhere(f, toI32(toU32(i) + 1), closingIndex, (g, j) => swIsUnwrap(g, j));
  const ns = f.indexBefore(SW_T_NON_SPACE, closingIndex);
  if (!((u >= 0 ? u : closingIndex) >= (ns >= 0 ? ns : toI32(toU32(closingIndex) - 1)))) {
    return;
  }
  if (f.kw(x, "#file")) {
    return;
  }
  swRemoveBoth(f, i, closingIndex);
};

/** The `.operator(_, .infix)` case; answers false to fall through to `default`. */
const swParensInfix = (f: SwFormatter, i: i32, closingIndex: i32): boolean => {
  const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
  if (ni < 0 || !f.tok(ni, SW_START, "{")) {
    return false;
  }
  const li = f.indexOfAfter(SW_END, "}", 0, ni);
  if (li < 0 || f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, closingIndex) !== li) {
    return false;
  }
  swRemoveBoth(f, i, closingIndex);
  return true;
};

/** redundantParens. */
export const swRuleRedundantParens = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "(")) {
      continue;
    }
    let closingIndex = f.indexOfAfter(SW_END, ")", 0, i);
    if (closingIndex < 0 || f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_KEYWORD, "repeat")) {
      continue;
    }
    let inner = swNestedParensStart(f, i, closingIndex);
    while (inner >= 0) {
      const innerEnd = swNestedParensEnd(f, closingIndex);
      if (swNestedParensStart(f, inner, innerEnd) < 0) {
        break;
      }
      swRemoveParen(f, innerEnd);
      swRemoveParen(f, inner);
      closingIndex = f.indexOfAfter(SW_END, ")", 0, i);
      inner = swNestedParensStart(f, i, closingIndex);
    }
    let isClosure = false;
    const previousIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const c = new SwParenCtx();
    if (previousIndex >= 0) {
      c.pk = f.k(previousIndex);
      c.ps = f.s(previousIndex);
      c.pa = f.a(previousIndex);
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closingIndex);
    if (nextIndex >= 0) {
      c.nk = f.k(nextIndex);
      c.ns = f.s(nextIndex);
      c.na = f.a(nextIndex);
    }
    const pk = c.pk;
    const ps = c.ps;
    const pa = c.pa;
    const nk = c.nk;
    const ns = c.ns;
    const na = c.na;
    const nextIsIn = nk === SW_KEYWORD && ns === "in";
    const isUnsafeKeyword = swIsUnsafeExpression(f, previousIndex) || (pk === SW_IDENT && ps === "unsafe" && nextIsIn);
    if (
      (nk === SW_OP && na === SW_OP_INFIX && ns === "->") ||
      (nk === SW_KEYWORD && (ns === "throws" || ns === "rethrows")) ||
      (nk === SW_IDENT && ns === "async") ||
      nextIsIn
    ) {
      if (!(pk === SW_KEYWORD && ps === "throws")) {
        const b = swIndexBeforeWhere(
          f,
          i,
          (g, j) => g.tok(j, SW_END, ")") || g.op(j, "->", SW_OP_INFIX) || g.kw(j, "for"),
        );
        const scopeIndex = b < 0 ? swStartOfScope(f, i) : -1;
        if (scopeIndex >= 0) {
          isClosure = swIsStartOfClosure(f, scopeIndex) && swIsInClosureArguments(f, i);
        }
      }
      if (!isClosure && !nextIsIn) {
        continue;
      }
    } else if (nk === SW_OP) {
      const pl = f.indexBefore(SW_T_NON_SPACE, closingIndex);
      if (pl >= 0 && f.k(pl) === SW_OP && !swIsUnwrap(f, pl)) {
        continue;
      }
    }
    const isAttr = pk === SW_KEYWORD && ps.startsWith("@");
    if (isAttr && !isClosure && f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i) === closingIndex) {
      swRemoveBoth(f, i, closingIndex);
      continue;
    }
    // switch prevToken
    if (
      pk === SW_STRBODY ||
      (pk === SW_OP && pa === SW_OP_POSTFIX && (ps === "?" || ps === "!")) ||
      (pk === SW_OP && pa === SW_OP_INFIX && ps === "->")
    ) {
      continue;
    }
    if (pk === SW_IDENT && !isUnsafeKeyword) {
      if (closingIndex !== f.indexAfter(SW_T_NON_SPACE, i)) {
        continue;
      }
      const oi = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closingIndex);
      if (oi < 0 || !f.tok(oi, SW_START, "{") || !swIsStartOfClosure(f, oi)) {
        continue;
      }
      swRemoveBoth(f, i, closingIndex);
      continue;
    }
    if (isClosure) {
      if (
        f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i) === closingIndex ||
        f.indexOfIn(SW_DELIM, ":", 0, toI32(toU32(i) + 1), closingIndex) >= 0
      ) {
        continue;
      }
      let hasSelf = false;
      let underscore = -1;
      for (let j = toI32(toU32(i) + 1); j < closingIndex; j++) {
        if (f.tok(j, SW_IDENT, "self")) {
          hasSelf = true;
        }
        if (underscore < 0 && f.tok(j, SW_IDENT, "_")) {
          underscore = j;
        }
      }
      if (hasSelf) {
        continue;
      }
      if (underscore >= 0) {
        const nu = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, underscore);
        if (nu >= 0 && f.k(nu) === SW_IDENT) {
          continue;
        }
      }
      swRemoveBoth(f, i, closingIndex);
      continue;
    }
    if (pk === SW_KEYWORD && !swIsConditionalKeyword(ps) && !(ps === "let" || ps === "var" || ps === "return")) {
      continue;
    }
    let stage = 0; // 0: not matched yet, 6: the `,`/end/keyword body, 7: the infix body, 8: default
    if (pk === SW_END && (ps === "}" || ps === ")" || ps === "]" || ps === ">")) {
      let lb = false;
      for (let j = toI32(toU32(previousIndex) + 1); j < i; j++) {
        if (f.k(j) === SW_LINEBREAK) {
          lb = true;
          break;
        }
      }
      if (!lb) {
        continue;
      }
      stage = 6;
    } else if (
      (pk === SW_DELIM && ps === ",") ||
      pk === SW_END ||
      pk === SW_KEYWORD ||
      (pk === SW_IDENT && ps === "unsafe")
    ) {
      stage = 6;
    } else if (pk === SW_OP && pa === SW_OP_INFIX) {
      stage = 7;
    } else {
      stage = 8;
    }
    if (stage === 6) {
      if (pk === SW_IDENT && ps === "unsafe") {
        const q = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
        if (q >= 0 && f.k(q) === SW_LINEBREAK) {
          continue;
        }
      }
      if (f.indexOfBefore(SW_END, "}", 0, closingIndex) >= 0) {
        continue;
      }
      const prevBraceOrAngle = pk === SW_END && (ps === "}" || ps === ">");
      const nextBraceOrComma = (nk === SW_START && ns === "{") || (nk === SW_DELIM && ns === ",");
      if (prevBraceOrAngle && nextBraceOrComma) {
        continue;
      }
      const nextIsColonScope = nk === SW_START && ns === ":";
      if (
        !nextBraceOrComma &&
        !nextIsColonScope &&
        !((ps === "for" || ps === "unsafe") && nextIsIn) &&
        !(ps === "guard" && nk === SW_KEYWORD && ns === "else")
      ) {
        stage = 7;
      } else {
        if (
          f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, toI32(toU32(i) + 1), closingIndex) < 0 ||
          f.indexOfIn(SW_DELIM, ",", 0, toI32(toU32(i) + 1), closingIndex) >= 0
        ) {
          continue;
        }
        swRemoveBoth(f, i, closingIndex);
        continue;
      }
    }
    if (stage === 7) {
      if (swParensInfix(f, i, closingIndex)) {
        continue;
      }
    }
    swParensDefault(f, c, i, closingIndex, previousIndex, inner);
  }
};
