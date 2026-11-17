// SwiftFormat's trailingClosures rule, with parseFunctionCallArguments(startOfScope:),
// parseFunctionIdentifier(beforeStartOfScope:), wrapLine(before:) and unwrapLine(before:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swEndOfScope, swIsConditionalStatement, swIsTrailingClosureLabel, swStartOfAttribute } from "./parsing";
import { swUnwrapLine } from "./rules_blank2";
import { swRemoveParen } from "./rules_parens";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_POSTFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
  swStrIsMacro,
} from "./token";

/** A FunctionCallArgument: label "" for nil, labelIndex -1 for nil. */
export class SwCallArg {
  label: string;
  labelIndex: i32;
  lo: i32;
  hi: i32;
  constructor(label: string, labelIndex: i32, lo: i32, hi: i32) {
    this.label = label;
    this.labelIndex = labelIndex;
    this.lo = lo;
    this.hi = hi;
  }
}

const swIsPropertyObserverBlock = (f: SwFormatter, i: i32): boolean => {
  if (!f.tok(i, SW_START, "{")) {
    return false;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  return n >= 0 && (f.tok(n, SW_IDENT, "willSet") || f.tok(n, SW_IDENT, "didSet"));
};

const swParseAdditionalTrailingClosures = (f: SwFormatter, endOfClosure: i32, out: SwCallArg[]): void => {
  let currentIndex = endOfClosure;
  while (true) {
    const labelIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (labelIndex < 0 || !swIsTrailingClosureLabel(f, labelIndex)) {
      return;
    }
    const colon = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, labelIndex);
    if (colon < 0 || !f.tok(colon, SW_DELIM, ":")) {
      return;
    }
    const ob = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon);
    if (ob < 0 || !f.tok(ob, SW_START, "{")) {
      return;
    }
    const eb = swEndOfScope(f, ob);
    if (eb < 0) {
      return;
    }
    out.push(new SwCallArg(f.s(labelIndex), labelIndex, ob, eb));
    currentIndex = eb;
  }
};

const swIsSpaceOrLinebreak = (f: SwFormatter, i: i32): boolean => f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK;

/** parseFunctionCallArguments(startOfScope:). */
export const swParseFunctionCallArguments = (f: SwFormatter, startOfScope: i32): SwCallArg[] => {
  const out: SwCallArg[] = [];
  if (f.tok(startOfScope, SW_START, "{")) {
    const e = swEndOfScope(f, startOfScope);
    if (e < 0) {
      return out;
    }
    out.push(new SwCallArg("", -1, startOfScope, e));
    swParseAdditionalTrailingClosures(f, e, out);
    return out;
  }
  const endOfScope = swEndOfScope(f, startOfScope);
  if (endOfScope < 0) {
    return out;
  }
  if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startOfScope) !== endOfScope) {
    let currentIndex = startOfScope;
    while (currentIndex < endOfScope) {
      const prevEnd = currentIndex;
      const c = f.indexOfIn(SW_DELIM, ",", 0, prevEnd + 1, endOfScope);
      const curEnd = c >= 0 ? c : endOfScope;
      if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevEnd) === endOfScope) {
        break;
      }
      const colon = f.indexOfIn(SW_DELIM, ":", 0, prevEnd + 1, curEnd);
      const li = colon >= 0 ? f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon) : -1;
      const labeled = li >= 0 && f.k(li) === SW_IDENT;
      let vs = labeled ? colon + 1 : prevEnd + 1;
      let ve = curEnd - 1;
      while (vs <= ve && swIsSpaceOrLinebreak(f, vs)) {
        vs++;
      }
      while (ve >= vs && swIsSpaceOrLinebreak(f, ve)) {
        ve--;
      }
      if (vs > ve) {
        currentIndex = curEnd;
        continue;
      }
      out.push(new SwCallArg(labeled ? f.s(li) : "", labeled ? li : -1, vs, ve));
      if (curEnd >= endOfScope) {
        break;
      }
      currentIndex = curEnd;
    }
  }
  const ob = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfScope);
  if (ob >= 0 && f.tok(ob, SW_START, "{") && !swIsPropertyObserverBlock(f, ob)) {
    const eb = swEndOfScope(f, ob);
    if (eb >= 0) {
      out.push(new SwCallArg("", -1, ob, eb));
      swParseAdditionalTrailingClosures(f, eb, out);
    }
  }
  return out;
};

const swIsFunctionIdentifier = (f: SwFormatter, i: i32): boolean => {
  const k = f.k(i);
  const s = f.s(i);
  return k === SW_IDENT || (k === SW_KEYWORD && (s.startsWith("@") || swStrIsMacro(s))) || s === "init";
};

/** parseFunctionIdentifier(beforeStartOfScope:), or -1. */
export const swParseFunctionIdentifier = (f: SwFormatter, startOfScope: i32): i32 => {
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startOfScope);
  if (p < 0) {
    return -1;
  }
  if (swIsFunctionIdentifier(f, p)) {
    return p;
  }
  if (f.op(p, "?", SW_OP_POSTFIX) || f.op(p, "!", SW_OP_POSTFIX)) {
    const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p);
    if (b >= 0 && swIsFunctionIdentifier(f, b)) {
      return b;
    }
  }
  return -1;
};

/** wrapLine(before:). */
export const swWrapLine = (f: SwFormatter, tokenIndex: i32): void => {
  f.insertSpace(f.currentIndentForLine(tokenIndex), tokenIndex);
  f.insertLinebreak(tokenIndex);
  if (f.k(tokenIndex - 1) === SW_SPACE) {
    f.removeToken(tokenIndex - 1);
  }
};

const swIsSingleClosureValue = (f: SwFormatter, a: SwCallArg): boolean => {
  const first = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, a.lo, a.hi + 1);
  const last = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, a.hi + 1);
  if (first < 0 || last < 0 || !f.tok(first, SW_START, "{") || !f.tok(last, SW_END, "}")) {
    return false;
  }
  return f.indexOfAfter(SW_END, "}", 0, first) === last;
};

const swTrimmedIsCloseParen = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let seen = false;
  for (let j = lo; j <= hi; j++) {
    const k = f.k(j);
    if (k === SW_SPACE || k === SW_LINEBREAK) {
      continue;
    }
    if (seen || !f.tok(j, SW_END, ")")) {
      return false;
    }
    seen = true;
  }
  return seen;
};

/** trailingClosures. */
export const swRuleTrailingClosures = (f: SwFormatter): void => {
  for (let open = f.enumStart(); open >= 0; open = f.enumNext()) {
    if (!f.tok(open, SW_START, "(")) {
      continue;
    }
    const identifierIndex = swParseFunctionIdentifier(f, open);
    if (identifierIndex < 0) {
      continue;
    }
    let lb = false;
    for (let j = identifierIndex; j < open; j++) {
      if (f.k(j) === SW_LINEBREAK) {
        lb = true;
        break;
      }
    }
    if (lb) {
      continue;
    }
    const name = f.s(identifierIndex);
    if (
      name === "performBatchUpdates" ||
      name === "expect" ||
      swIsConditionalStatement(f, open) ||
      swStartOfAttribute(f, identifierIndex) >= 0
    ) {
      continue;
    }
    const args = swParseFunctionCallArguments(f, open);
    let firstTrailing = toI32(args.length);
    while (firstTrailing > 0 && swIsSingleClosureValue(f, args[firstTrailing - 1])) {
      firstTrailing--;
    }
    const count = toI32(args.length) - firstTrailing;
    const closingParen = swEndOfScope(f, open);
    if (closingParen < 0 || f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closingParen, SW_START, "{")) {
      continue;
    }
    if (count === 1) {
      const c = args[firstTrailing];
      const useTrailing = name === "async" || name === "asyncAfter" || name === "sync" || name === "autoreleasepool";
      if (c.labelIndex >= 0 && !useTrailing) {
        continue;
      }
      const closingBrace = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, closingParen);
      if (closingBrace < 0 || !f.tok(closingBrace, SW_END, "}")) {
        continue;
      }
      const openingBrace = f.indexOfBefore(SW_START, "{", 0, closingBrace);
      if (openingBrace < 0 || f.indexOfBefore(SW_END, "}", 0, openingBrace) >= 0) {
        continue;
      }
      let startIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, openingBrace);
      if (startIndex < 0) {
        continue;
      }
      if (f.tok(startIndex, SW_DELIM, ",") || f.tok(startIndex, SW_START, "(")) {
        // fine
      } else if (f.tok(startIndex, SW_DELIM, ":")) {
        const ci = f.indexOfBefore(SW_DELIM, ",", 0, openingBrace);
        if (ci >= 0) {
          startIndex = ci;
        } else if (f.indexOfBefore(SW_START, "(", 0, openingBrace) === open) {
          startIndex = open;
        } else {
          continue;
        }
      } else {
        continue;
      }
      const wasParen = startIndex === open;
      swRemoveParen(f, closingParen);
      f.replaceTokens(
        startIndex,
        openingBrace,
        wasParen ? [new SwTok(SW_SPACE, " ", 0)] : [new SwTok(SW_END, ")", 0), new SwTok(SW_SPACE, " ", 0)],
      );
      continue;
    }
    if (count < 2) {
      continue;
    }
    if (args[firstTrailing].labelIndex >= 0) {
      continue;
    }
    let allLabeled = true;
    for (let q = firstTrailing + 1; q < toI32(args.length); q++) {
      if (args[q].labelIndex < 0) {
        allLabeled = false;
      }
    }
    if (!allLabeled) {
      continue;
    }
    const lineLo = f.startOfLine(closingParen);
    const lineHi = f.endOfLine(closingParen);
    const tbcp = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closingParen);
    if (swTrimmedIsCloseParen(f, lineLo, lineHi)) {
      f.removeTokens(lineLo, lineHi + 1);
    } else {
      f.removeToken(closingParen);
    }
    if (tbcp >= 0 && f.tok(tbcp, SW_DELIM, ",")) {
      f.removeToken(tbcp);
    }
    for (let q = toI32(args.length) - 1; q >= firstTrailing; q--) {
      const c = args[q];
      const cr = f.ref(c.lo, c.hi);
      const oneLine = f.onSameLine(f.refLo[cr], f.refHi[cr]);
      const ib = q === firstTrailing ? f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c.lo) : -1;
      if (q === firstTrailing && ib >= 0) {
        if (f.tok(ib, SW_START, "(")) {
          f.removeToken(ib);
        } else if (f.tok(ib, SW_DELIM, ",")) {
          f.replaceToken(ib, SW_END, ")", 0);
        }
        if (!f.onSameLine(ib, c.lo)) {
          swUnwrapLine(f, f.refLo[cr]);
        }
      } else if (q !== firstTrailing && c.labelIndex >= 0) {
        const lr = f.ref(c.labelIndex, c.labelIndex);
        const ci = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, f.refLo[lr]);
        if (ci >= 0 && f.tok(ci, SW_DELIM, ",")) {
          const wasPrev = !f.onSameLine(ci, f.refLo[lr]);
          f.removeToken(ci);
          if (wasPrev) {
            swUnwrapLine(f, f.refLo[lr]);
          }
        }
        f.unref(lr);
      }
      if (oneLine) {
        swWrapLine(f, f.refHi[cr]);
        swWrapLine(f, f.refLo[cr] + 1);
      }
      f.unref(cr);
    }
  }
};
