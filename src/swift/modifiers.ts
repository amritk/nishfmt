// SwiftFormat's modifier helpers: the modifier list, isModifier and
// modifiersForDeclaration (walked once, the caller's predicate applied to
// what it visits), startOfModifiers, isDocComment.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexAfterWhere } from "./formatter";
import {
  swEndOfAttribute,
  swEndOfScope,
  swIsAttribute,
  swIsDeclarationTypeKeyword,
  swIsTypeKeywordStr,
  swLastSignificantKeyword,
  swStartOfAttribute,
  swStartOfScope,
  SW_EX_WHERE,
} from "./parsing";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_PREFIX,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

/** _FormatRules.allModifiers. */
export const swIsModifierStr = (s: string): boolean =>
  s === "override" ||
  s === "private" ||
  s === "fileprivate" ||
  s === "internal" ||
  s === "package" ||
  s === "public" ||
  s === "open" ||
  s === "private(set)" ||
  s === "fileprivate(set)" ||
  s === "internal(set)" ||
  s === "package(set)" ||
  s === "public(set)" ||
  s === "open(set)" ||
  s === "final" ||
  s === "dynamic" ||
  s === "optional" ||
  s === "required" ||
  s === "indirect" ||
  s === "isolated" ||
  s === "nonisolated" ||
  s === "nonisolated(unsafe)" ||
  s === "lazy" ||
  s === "weak" ||
  s === "unowned" ||
  s === "unowned(safe)" ||
  s === "unowned(unsafe)" ||
  s === "static" ||
  s === "class" ||
  s === "borrowing" ||
  s === "consuming" ||
  s === "__consuming" ||
  s === "mutating" ||
  s === "nonmutating" ||
  s === "prefix" ||
  s === "infix" ||
  s === "postfix" ||
  s === "async" ||
  s === "convenience";

/** _FormatRules.aclModifiers. */
export const swIsAclModifierStr = (s: string): boolean =>
  s === "private" || s === "fileprivate" || s === "internal" || s === "package" || s === "public" || s === "open";

/** Token.isModifierKeyword. */
export const swIsModifierKeyword = (f: SwFormatter, i: i32): boolean => f.has(i) && (f.k(i) === SW_KEYWORD || f.k(i) === SW_IDENT) && swIsModifierStr(f.s(i));

/** isModifier(at:). */
export const swIsModifier = (f: SwFormatter, index: i32): boolean => {
  if (!swIsModifierKeyword(f, index)) {
    return false;
  }
  if (f.kw(index, "class")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (n >= 0) {
      return swIsDeclarationTypeKeyword(f, n) || swIsModifierKeyword(f, n);
    }
  }
  if (f.tok(index, SW_IDENT, "async")) {
    const nd = swIndexAfterWhere(f, index, (g, j) => swIsDeclarationTypeKeyword(g, j));
    if (nd < 0 || !(f.s(nd) === "let" || f.s(nd) === "var")) {
      return false;
    }
    const sos = swStartOfScope(f, index);
    if (sos >= 0) {
      const kw = swLastSignificantKeyword(f, sos, SW_EX_WHERE);
      if (kw.length !== 0 && swIsTypeKeywordStr(kw)) {
        return false;
      }
    }
  }
  return true;
};

/** What modifiersForDeclaration visits: each modifier's first index and full text, in order. */
export class SwModifiers {
  idx: i32[];
  names: string[];
  constructor() {
    this.idx = [];
    this.names = [];
  }
}

/** modifiersForDeclaration(at:contains:)'s walk, collecting every modifier it would offer the predicate. */
export const swModifiersForDeclaration = (f: SwFormatter, index0: i32): SwModifiers => {
  const out = new SwModifiers();
  let index = index0;
  while (true) {
    let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (prevIndex < 0) {
      return out;
    }
    const k = f.k(prevIndex);
    const s = f.s(prevIndex);
    if (swIsModifier(f, prevIndex) || swIsAttribute(f, prevIndex)) {
      if (k === SW_IDENT) {
        const n = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
        if (n >= 0 && (f.kw(n, "case") || f.kw(n, "var") || f.kw(n, "let") || (f.k(n) === SW_OP && (f.a(n) === SW_OP_INFIX || f.a(n) === SW_OP_PREFIX)))) {
          return out;
        }
      }
      let hi = prevIndex;
      let done = false;
      if (swIsAttribute(f, prevIndex)) {
        const e = swEndOfAttribute(f, prevIndex);
        if (e >= 0 && e > prevIndex) {
          hi = e;
          done = true;
        }
      }
      if (!done) {
        const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
        if (ni >= 0 && (f.tok(ni, SW_START, "<") || f.tok(ni, SW_START, "("))) {
          const e = swEndOfScope(f, ni);
          if (e >= 0) {
            hi = e;
          }
        }
      }
      out.idx.push(prevIndex);
      out.names.push(f.text(prevIndex, hi + 1));
    } else if (k === SW_END && s === ")") {
      const startIndex = f.indexOfBefore(SW_START, "(", 0, prevIndex);
      if (startIndex < 0) {
        return out;
      }
      const ii = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (ii < 0) {
        return out;
      }
      const ok =
        swIsAttribute(f, ii) ||
        swIsModifierStr(f.s(ii)) ||
        f.tok(ii, SW_END, ">") ||
        (f.k(ii) === SW_IDENT && swPrevIsOp(f, ii, "::"));
      if (!ok) {
        return out;
      }
      const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ii);
      if (pt >= 0 && (f.tok(pt, SW_DELIM, ",") || swIsDeclarationTypeKeyword(f, pt))) {
        return out;
      }
      prevIndex = startIndex;
    } else if (k === SW_END && s === ">") {
      const startIndex = f.indexOfBefore(SW_START, "<", 0, prevIndex);
      if (startIndex < 0) {
        return out;
      }
      const a = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (a < 0 || !swIsAttribute(f, a)) {
        return out;
      }
      prevIndex = startIndex;
    } else if (k === SW_IDENT) {
      const startIndex = swStartOfAttribute(f, prevIndex);
      if (startIndex < 0) {
        return out;
      }
      const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (ni < 0 || !(f.ks(ni, SW_OP, ".") || f.ks(ni, SW_OP, "::"))) {
        return out;
      }
      prevIndex = ni;
    } else {
      return out;
    }
    index = prevIndex;
  }
};

const swPrevIsOp = (f: SwFormatter, i: i32, s: string): boolean => {
  const j = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  return j >= 0 && f.ks(j, SW_OP, s);
};

/** modifiersForDeclaration(at:contains: name): a modifier whose first token or full text is `name`. */
export const swHasModifier = (f: SwFormatter, index: i32, name: string): boolean => {
  const m = swModifiersForDeclaration(f, index);
  for (let j = 0; j < toI32(m.idx.length); j++) {
    if (f.s(m.idx[j]) === name || m.names[j] === name) {
      return true;
    }
  }
  return false;
};

/** indexOfModifier(_:forDeclarationAt:), or -1. */
export const swIndexOfModifier = (f: SwFormatter, name: string, index: i32): i32 => {
  const m = swModifiersForDeclaration(f, index);
  for (let j = 0; j < toI32(m.idx.length); j++) {
    if (m.names[j] === name) {
      return m.idx[j];
    }
  }
  return -1;
};

/** startOfModifiers(at:includingAttributes:). */
export const swStartOfModifiers = (f: SwFormatter, index: i32, includingAttributes: boolean): i32 => {
  let startIndex = index;
  const m = swModifiersForDeclaration(f, index);
  for (let j = 0; j < toI32(m.idx.length); j++) {
    if (!includingAttributes && m.names[j].startsWith("@")) {
      break;
    }
    startIndex = m.idx[j];
  }
  return startIndex;
};

/** isDocComment(startOfComment:). */
export const swIsDocComment = (f: SwFormatter, i: i32): boolean => {
  let prefix = "";
  if (f.tok(i, SW_START, "//")) {
    prefix = "/";
  } else if (f.tok(i, SW_START, "/*")) {
    prefix = "*";
  } else {
    return false;
  }
  if (!f.has(i + 1) || f.k(i + 1) !== SW_COMMENT) {
    return false;
  }
  return f.s(i + 1).startsWith(prefix);
};

