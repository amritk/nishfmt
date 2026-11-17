// More of SwiftFormat's ParsingHelpers: scope types, type positions,
// parameter lists, and FormattingHelpers.shouldInsertSpaceAfterToken.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import {
  swEndOfScope,
  swHasLinebreak,
  swIsInClosureArguments,
  swIsUnwrap,
  swLastSignificantKeyword,
  swNextIs,
  swPrevIs,
  swStartOfAttribute,
  swStartOfScope,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_START,
  SW_T_KEYWORD,
  SW_T_KEYWORD_OR_ATTRIBUTE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swIsKeywordInTypeContext,
  swStrIsMacroOrAttribute,
} from "./token";

export const SW_SCOPE_NONE: i32 = 0;
export const SW_SCOPE_ARRAY: i32 = 1;
export const SW_SCOPE_ARRAY_TYPE: i32 = 2;
export const SW_SCOPE_CAPTURE_LIST: i32 = 3;
export const SW_SCOPE_DICTIONARY: i32 = 4;
export const SW_SCOPE_DICTIONARY_TYPE: i32 = 5;
export const SW_SCOPE_FUNCTION_CALL: i32 = 6;
export const SW_SCOPE_PARAMETER_LIST: i32 = 7;
export const SW_SCOPE_SUBSCRIPT: i32 = 8;
export const SW_SCOPE_TUPLE: i32 = 9;
export const SW_SCOPE_TUPLE_TYPE: i32 = 10;
export const SW_SCOPE_THROWS_TYPE: i32 = 11;

export const swScopeTypeIsType = (t: i32): boolean =>
  t === SW_SCOPE_ARRAY_TYPE || t === SW_SCOPE_DICTIONARY_TYPE || t === SW_SCOPE_TUPLE_TYPE;

/** scopeType(at:), SW_SCOPE_NONE for nil. */
export const swScopeType = (f: SwFormatter, index: i32): i32 => {
  if (!f.has(index)) {
    return SW_SCOPE_NONE;
  }
  if (f.k(index) !== SW_START) {
    const startIndex = f.indexBefore(SW_T_START_OF_SCOPE, index);
    if (startIndex < 0) {
      return SW_SCOPE_NONE;
    }
    return swScopeType(f, startIndex);
  }
  const s = f.s(index);
  if (s !== "(" && s !== "[") {
    return SW_SCOPE_NONE;
  }
  if (s === "(" && swPrevIs(f, SW_T_NON_SPACE_OR_LINEBREAK, index, SW_KEYWORD, "throws")) {
    return SW_SCOPE_THROWS_TYPE;
  }
  const endIndex = swEndOfScope(f, index);
  if (endIndex < 0) {
    return SW_SCOPE_NONE;
  }
  let isType = false;
  const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  const nextIsDot = nextIndex >= 0 && f.ks(nextIndex, SW_OP, ".");
  if (
    nextIsDot &&
    (swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex, SW_IDENT, "self") ||
      swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex, SW_IDENT, "init"))
  ) {
    isType = true;
  } else if (swNextIs(f, SW_T_NON_SPACE_OR_COMMENT, endIndex, SW_START, "(")) {
    isType = true;
  } else {
    let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (prevIndex >= 0) {
      const attributeIndex = swStartOfAttribute(f, prevIndex);
      if (attributeIndex >= 0) {
        const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, attributeIndex);
        if (p >= 0) {
          prevIndex = p;
        }
      }
      const pk = f.k(prevIndex);
      const ps = f.s(prevIndex);
      let callCase = false;
      if (swIsUnwrap(f, prevIndex)) {
        const l = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, prevIndex);
        if (l >= 0 && (f.kw(l, "as") || f.kw(l, "try"))) {
          isType = true;
        } else {
          callCase = true;
        }
      } else if (pk === SW_IDENT || (pk === SW_END && (ps === ")" || ps === "]"))) {
        callCase = true;
      } else if (pk === SW_START && ps === "{" && swIsInClosureArguments(f, index)) {
        return s === "(" ? SW_SCOPE_PARAMETER_LIST : SW_SCOPE_CAPTURE_LIST;
      } else if (pk === SW_DELIM && (ps === ":" || ps === ",")) {
        const scopeStart = f.indexBefore(SW_T_START_OF_SCOPE, prevIndex);
        if (scopeStart >= 0) {
          if (f.tok(scopeStart, SW_START, "(") && swPrevIs(f, SW_T_KEYWORD, scopeStart, SW_KEYWORD, "func")) {
            isType = true;
          } else if (f.tok(scopeStart, SW_START, "(") || f.tok(scopeStart, SW_START, "[")) {
            const t = swScopeType(f, scopeStart);
            if (t === SW_SCOPE_NONE) {
              return SW_SCOPE_NONE;
            }
            isType = swScopeTypeIsType(t);
          }
        }
        const lk = f.indexBefore(SW_T_KEYWORD, index);
        if (lk >= 0 && (f.kw(lk, "let") || f.kw(lk, "var"))) {
          isType = true;
        }
      } else if (f.ks(prevIndex, SW_OP, "->") || f.tok(prevIndex, SW_START, "<") || f.kw(prevIndex, "extension")) {
        isType = true;
      } else if (f.tok(prevIndex, SW_START, "[") || f.tok(prevIndex, SW_START, "(")) {
        const t = swScopeType(f, prevIndex);
        if (t === SW_SCOPE_NONE) {
          return SW_SCOPE_NONE;
        }
        isType = swScopeTypeIsType(t);
      } else if (f.op(prevIndex, "=", SW_OP_INFIX)) {
        isType = swLastSignificantKeyword(f, prevIndex) === "typealias";
      }
      if (callCase && !swHasLinebreak(f, prevIndex + 1, index)) {
        return s === "(" ? SW_SCOPE_FUNCTION_CALL : SW_SCOPE_SUBSCRIPT;
      }
    }
  }
  if (s === "(") {
    return isType ? SW_SCOPE_TUPLE_TYPE : SW_SCOPE_TUPLE;
  }
  if (f.indexOfAfter(SW_DELIM, ":", 0, index) >= 0) {
    return isType ? SW_SCOPE_DICTIONARY_TYPE : SW_SCOPE_DICTIONARY;
  }
  return isType ? SW_SCOPE_ARRAY_TYPE : SW_SCOPE_ARRAY;
};

/** isTypePosition(at:). */
export const swIsTypePosition = (f: SwFormatter, index: i32): boolean => {
  const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (prevIndex < 0) {
    return false;
  }
  if (
    f.op(prevIndex, "->", SW_OP_INFIX) ||
    f.tok(prevIndex, SW_START, "<") ||
    f.kw(prevIndex, "is") ||
    f.kw(prevIndex, "as")
  ) {
    return true;
  }
  if (f.tok(prevIndex, SW_DELIM, ":") || f.tok(prevIndex, SW_DELIM, ",")) {
    const lk = f.indexBefore(SW_T_KEYWORD, index);
    if (lk >= 0 && (f.kw(lk, "let") || f.kw(lk, "var"))) {
      return true;
    }
    const scopeStart = swStartOfScope(f, index);
    if (scopeStart >= 0) {
      if (f.tok(scopeStart, SW_START, "(")) {
        if (swPrevIs(f, SW_T_KEYWORD, scopeStart, SW_KEYWORD, "func")) {
          return true;
        }
        return swIsInClosureArguments(f, scopeStart);
      }
      if (f.tok(scopeStart, SW_START, "[")) {
        return swIsInClosureArguments(f, scopeStart);
      }
    }
  }
  return swScopeTypeIsType(swScopeType(f, index));
};

/** isParameterList(at:). */
export const swIsParameterList = (f: SwFormatter, i: i32): boolean => {
  const endIndex = swEndOfScope(f, i);
  if (endIndex < 0) {
    return false;
  }
  const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  if (nextIndex < 0) {
    return false;
  }
  if (f.op(nextIndex, "->", SW_OP_INFIX) || f.kw(nextIndex, "throws") || f.kw(nextIndex, "rethrows")) {
    return true;
  }
  if (f.kw(nextIndex, "in")) {
    return !swPrevIs(f, SW_T_NON_SPACE_OR_LINEBREAK, i, SW_KEYWORD, "for");
  }
  if (f.tok(nextIndex, SW_IDENT, "async")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex);
    if (n >= 0 && (f.op(n, "->", SW_OP_INFIX) || f.kw(n, "throws") || f.kw(n, "rethrows") || f.tok(n, SW_START, "{"))) {
      return true;
    }
    return false;
  }
  const funcIndex = f.indexBefore(SW_T_KEYWORD_OR_ATTRIBUTE, i);
  if (
    funcIndex >= 0 &&
    (f.kw(funcIndex, "func") || f.kw(funcIndex, "init") || f.kw(funcIndex, "subscript") || f.kw(funcIndex, "macro"))
  ) {
    if (f.lastIndexOfIn(SW_END, "}", 0, funcIndex, i) < 0) {
      return true;
    }
  }
  return false;
};

// Answers of shouldInsertSpaceAfterToken.
export const SW_SPACE_NIL: i32 = 0;
export const SW_SPACE_YES: i32 = 1;
export const SW_SPACE_NO: i32 = 2;

/** shouldInsertSpaceAfterToken(at:) (swiftVersion undefined). */
export const swShouldInsertSpaceAfterToken = (f: SwFormatter, index: i32): i32 => {
  if (!f.has(index)) {
    return SW_SPACE_NIL;
  }
  const k = f.k(index);
  const s = f.s(index);
  if (k === SW_KEYWORD) {
    if (s === "@autoclosure") {
      // swiftVersion < "3" holds for an undefined version.
      const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
      if (nextIndex >= 0 && swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex, SW_IDENT, "escaping")) {
        return SW_SPACE_NO;
      }
      return SW_SPACE_YES;
    }
    if (s === "@escaping" || s === "@noescape" || s === "@Sendable" || s === "@MainActor") {
      return SW_SPACE_YES;
    }
    if (s.startsWith("@")) {
      if (swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index, SW_START, "[")) {
        return SW_SPACE_YES;
      }
      const i = f.indexOfAfter(SW_START, "(", 0, index);
      if (i >= 0) {
        return swIsParameterList(f, i) ? SW_SPACE_YES : SW_SPACE_NO;
      }
      return SW_SPACE_NO;
    }
    if (
      s === "private" ||
      s === "fileprivate" ||
      s === "internal" ||
      s === "init" ||
      s === "subscript" ||
      s === "throws"
    ) {
      return SW_SPACE_NO;
    }
    if (s === "await") {
      return SW_SPACE_YES;
    }
    if (f.ks(index - 1, SW_OP, "::")) {
      return SW_SPACE_NO;
    }
    return swStrIsMacroOrAttribute(s) ? SW_SPACE_NO : SW_SPACE_YES;
  }
  if (k === SW_IDENT) {
    if (s === "as" || s === "is" || s === "try") {
      return !f.ks(index - 1, SW_OP, ".") && !f.ks(index - 1, SW_OP, "::") ? SW_SPACE_YES : SW_SPACE_NO;
    }
    if (s === "unsafe") {
      return SW_SPACE_YES;
    }
    return swIsKeywordInTypeContext(s) && !f.ks(index - 1, SW_OP, ".") && swIsTypePosition(f, index)
      ? SW_SPACE_YES
      : SW_SPACE_NO;
  }
  if (k === SW_END && s === "]") {
    return swIsInClosureArguments(f, index) ? SW_SPACE_YES : SW_SPACE_NO;
  }
  if (k === SW_END && s === ")") {
    const open = f.indexOfBefore(SW_START, "(", 0, index);
    if (open >= 0) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, open);
      if (p >= 0 && f.tok(p, SW_IDENT, "nonisolated")) {
        return SW_SPACE_YES;
      }
    }
    return swStartOfAttribute(f, index) >= 0 ? SW_SPACE_YES : SW_SPACE_NO;
  }
  if (k === SW_NUMBER || (k === SW_END && (s === "}" || s === ">"))) {
    return SW_SPACE_NO;
  }
  return SW_SPACE_NIL;
};
