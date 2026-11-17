// Small SwiftFormat rules: redundantBreak, strongOutlets, redundantLet,
// redundantLetError, redundantGet.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swCharacterIsUppercase } from "./unicode";
import { SwFormatter, swIndexBeforeWhere } from "./formatter";
import {
  swCurrentScope,
  swIsAccessorKeyword,
  swIsAttribute,
  swIsTypeKeywordStr,
  swLastSignificantKeyword,
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
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_IDENTIFIER,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SW_T_NON_SPACE_OR_LINEBREAK,
} from "./token";

/** redundantBreak. */
export const swRuleRedundantBreak = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "break")) {
      continue;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (p >= 0 && f.tok(p, SW_START, ":")) {
      continue;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (n < 0 || f.k(n) !== SW_END) {
      continue;
    }
    let startIndex = f.indexBefore(SW_T_NON_SPACE, i);
    const endIndex = f.indexAfter(SW_T_NON_SPACE, i);
    if (startIndex < 0 || endIndex < 0) {
      continue;
    }
    const cs = swCurrentScope(f, i);
    if (cs < 0 || !f.tok(cs, SW_START, ":")) {
      continue;
    }
    if (f.k(startIndex) !== SW_LINEBREAK || f.k(endIndex) !== SW_LINEBREAK) {
      startIndex += 1;
    }
    f.removeTokens(startIndex, endIndex);
  }
};

/** strongOutlets. */
export const swRuleStrongOutlets = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "@IBOutlet")) {
      continue;
    }
    const varIndex = f.indexOfAfter(SW_KEYWORD, "var", 0, i);
    if (varIndex < 0) {
      continue;
    }
    let weakIndex = -1;
    for (let j = i; j < varIndex; j++) {
      if (f.tok(j, SW_IDENT, "weak")) {
        weakIndex = j;
        break;
      }
    }
    if (weakIndex < 0) {
      continue;
    }
    const ni = f.indexAfter(SW_T_IDENTIFIER, varIndex);
    if (ni < 0 || f.k(ni) !== SW_IDENT) {
      continue;
    }
    const lower = swLowercased(f.s(ni));
    if (lower.endsWith("delegate") || lower.endsWith("datasource")) {
      continue;
    }
    if (f.k(weakIndex + 1) === SW_SPACE) {
      f.removeToken(weakIndex + 1);
    } else if (f.k(weakIndex - 1) === SW_SPACE) {
      f.removeToken(weakIndex - 1);
    }
    f.removeToken(weakIndex);
  }
};

/** String.lowercased() for ASCII letters (other bytes kept). Exact for the prefix and suffix
 *  tests it is used for (`sourcery:`, `delegate`, `todo:` ...): no other code point lowercases to
 *  ASCII except U+212A KELVIN SIGN (to `k`, which todos checks for) and U+0130 (to `i` + U+0307,
 *  which can match no ASCII key). */
export const swLowercased = (s: string): string => {
  const n = toI32(s.length);
  const b = new Array<u8>(n);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    b[i] = toU8(c >= 65 && c <= 90 ? c + 32 : c);
  }
  return String.fromBytes(b, 0, n);
};

/** index(before: i, where: one of `{`, `:`, `#if`): the (cached) current scope when it is one of
 *  those; the same backward scan otherwise answers -1, except past a `//` comment start. */
const swScopeStartBraceColonIf = (f: SwFormatter, i: i32): i32 => {
  const cs = f.indexBefore(SW_T_START_OF_SCOPE, i);
  if (cs < 0) {
    return -1;
  }
  if (f.tok(cs, SW_START, "{") || f.tok(cs, SW_START, ":") || f.tok(cs, SW_START, "#if")) {
    return cs;
  }
  if (f.tok(cs, SW_START, "//")) {
    return swIndexBeforeWhere(
      f,
      i,
      (g, j) => g.tok(j, SW_START, "{") || g.tok(j, SW_START, ":") || g.tok(j, SW_START, "#if"),
    );
  }
  return -1;
};

/** isInResultBuilder(at:). */
export const swIsInResultBuilder = (f: SwFormatter, i0: i32): boolean => {
  let i = i0;
  while (true) {
    const startIndex = swScopeStartBraceColonIf(f, i);
    if (startIndex < 0) {
      return false;
    }
    const prevIndex = swIndexBeforeWhere(f, startIndex, (g, j) => {
      const k = g.k(j);
      return !(k === SW_SPACE || k === SW_LINEBREAK || g.isComment(j)) && k !== SW_END;
    });
    if (prevIndex < 0) {
      return false;
    }
    if (f.tok(startIndex, SW_START, "{")) {
      const kw = swLastSignificantKeyword(f, startIndex, SW_EX_WHERE);
      if (kw.length !== 0 && swIsTypeKeywordStr(kw)) {
        if (f.k(prevIndex) === SW_START && i !== startIndex) {
          i = startIndex;
        } else {
          i = prevIndex;
        }
        continue;
      }
    }
    if (f.k(prevIndex) === SW_IDENT && swFirstIsUppercase(f.s(prevIndex))) {
      const l = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (
        l < 0 ||
        f.tok(l, SW_IDENT, "some") ||
        f.k(l) === SW_DELIM ||
        f.k(l) === SW_START ||
        f.k(l) === SW_END ||
        (f.k(l) === SW_OP && (f.a(l) === SW_OP_INFIX || f.a(l) === SW_OP_PREFIX))
      ) {
        return true;
      }
    }
    if (f.s(prevIndex) === "#Preview") {
      return true;
    }
    if (f.k(prevIndex) === SW_START && i !== startIndex) {
      i = startIndex;
    } else {
      i = prevIndex;
    }
  }
};

/** name.first?.isUppercase. */
export const swFirstIsUppercase = (s: string): boolean => s.length !== 0 && swCharacterIsUppercase(s, 0);

/** redundantLet. */
export const swRuleRedundantLet = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_IDENT, "_")) {
      continue;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (n >= 0 && f.tok(n, SW_DELIM, ":")) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prevIndex < 0 || !(f.kw(prevIndex, "let") || f.kw(prevIndex, "var"))) {
      continue;
    }
    const nextNonSpace = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, prevIndex);
    if (nextNonSpace < 0) {
      continue;
    }
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
    if (pt >= 0) {
      if (
        f.kw(pt, "if") ||
        f.kw(pt, "guard") ||
        f.kw(pt, "while") ||
        f.tok(pt, SW_IDENT, "async") ||
        swIsAttribute(f, pt)
      ) {
        continue;
      }
      if (f.tok(pt, SW_DELIM, ",")) {
        const cs = swCurrentScope(f, i);
        if (!(cs >= 0 && f.tok(cs, SW_START, "("))) {
          continue;
        }
      }
    }
    if (swIsInResultBuilder(f, i)) {
      continue;
    }
    f.removeTokens(prevIndex, nextNonSpace);
  }
};

/** redundantLetError. */
export const swRuleRedundantLetError = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "catch")) {
      continue;
    }
    const letIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (letIndex < 0 || !f.kw(letIndex, "let")) {
      continue;
    }
    const errorIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, letIndex);
    if (errorIndex < 0 || !f.tok(errorIndex, SW_IDENT, "error")) {
      continue;
    }
    const scopeIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, errorIndex);
    if (scopeIndex < 0 || !f.tok(scopeIndex, SW_START, "{")) {
      continue;
    }
    f.removeTokens(letIndex, scopeIndex);
  }
};

/** redundantGet. */
export const swRuleRedundantGet = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_IDENT, "get") || !swIsAccessorKeyword(f, i, false)) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prevIndex < 0 || !f.tok(prevIndex, SW_START, "{")) {
      continue;
    }
    const openIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (openIndex < 0 || !f.tok(openIndex, SW_START, "{")) {
      continue;
    }
    const closeIndex = f.indexOfAfter(SW_END, "}", 0, openIndex);
    if (closeIndex < 0) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closeIndex);
    if (nextIndex < 0 || !f.tok(nextIndex, SW_END, "}")) {
      continue;
    }
    f.removeTokens(closeIndex, nextIndex);
    f.removeTokens(prevIndex + 1, openIndex + 1);
  }
};
