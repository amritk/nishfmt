// SwiftFormat's ParsingHelpers (the parts the ported rules use): scopes,
// statements, closures, keywords and types, all as searches over the
// formatter's tokens.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swCharacterUppercaseInvariant, swGraphemeCount } from "./unicode";
import { SwFormatter, swIndexAfterWhere, swIndexBeforeWhere, swLastIndexInWhere } from "./formatter";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_NUM_BINARY,
  SW_NUM_HEX,
  SW_NUM_INTEGER,
  SW_NUM_OCTAL,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_NONE,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swIsMultilineStringDelimiter,
  swIsStringDelimiter,
  swStrIsMacro,
} from "./token";
import { swCpIsSpace } from "./tokenizer";
import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";

// Keyword sets for `excluding:` parameters, as bits.
export const SW_EX_WHERE: i32 = 1;
export const SW_EX_ELSE: i32 = 2;
export const SW_EX_THROWS: i32 = 4;
export const SW_EX_RETHROWS: i32 = 8;
export const SW_EX_AS: i32 = 16;
export const SW_EX_IS: i32 = 32;
export const SW_EX_TRY: i32 = 64;
export const SW_EX_VAR: i32 = 128;
export const SW_EX_LET: i32 = 256;
export const SW_EX_CASE: i32 = 512;
export const SW_EX_CLASS: i32 = 1024;

const swExcluded = (name: string, ex: i32): boolean => {
  if (ex === 0) {
    return false;
  }
  return (
    ((ex & SW_EX_WHERE) !== 0 && name === "where") ||
    ((ex & SW_EX_ELSE) !== 0 && name === "else") ||
    ((ex & SW_EX_THROWS) !== 0 && name === "throws") ||
    ((ex & SW_EX_RETHROWS) !== 0 && name === "rethrows") ||
    ((ex & SW_EX_AS) !== 0 && name === "as") ||
    ((ex & SW_EX_IS) !== 0 && name === "is") ||
    ((ex & SW_EX_TRY) !== 0 && name === "try") ||
    ((ex & SW_EX_VAR) !== 0 && name === "var") ||
    ((ex & SW_EX_LET) !== 0 && name === "let") ||
    ((ex & SW_EX_CASE) !== 0 && name === "case") ||
    ((ex & SW_EX_CLASS) !== 0 && name === "class")
  );
};

/** The index after `i` of `type` (scope-aware), or -1. */
export const swNext = (f: SwFormatter, type: i32, i: i32): i32 => f.indexAfter(type, i);

/** The index before `i` of `type` (scope-aware), or -1. */
export const swPrev = (f: SwFormatter, type: i32, i: i32): i32 => f.indexBefore(type, i);

/** next(type, after: i) == Token(k, s) */
export const swNextIs = (f: SwFormatter, type: i32, i: i32, k: i32, s: string): boolean => {
  const j = f.indexAfter(type, i);
  return j >= 0 && f.tok(j, k, s);
};

/** last(type, before: i) == Token(k, s) */
export const swPrevIs = (f: SwFormatter, type: i32, i: i32, k: i32, s: string): boolean => {
  const j = f.indexBefore(type, i);
  return j >= 0 && f.tok(j, k, s);
};

/** Token.isLiteralIdentifier. */
export const swIsLiteralIdentifier = (f: SwFormatter, i: i32): boolean =>
  f.k(i) === SW_IDENT && (f.s(i) === "true" || f.s(i) === "false" || f.s(i) === "nil");

/** Token.isUnwrapOperator. */
export const swIsUnwrap = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_OP && f.a(i) === SW_OP_POSTFIX && (f.s(i) === "?" || f.s(i) === "!");

export const swIsKeyword = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_KEYWORD && !f.s(i).startsWith("@");

export const swIsAttribute = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_KEYWORD && f.s(i).startsWith("@");

export const swIsMacroTok = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_KEYWORD && swStrIsMacro(f.s(i));

export const swIsSpaceOrCommentOrLinebreak = (f: SwFormatter, i: i32): boolean => {
  const k = f.k(i);
  return k === SW_SPACE || k === SW_LINEBREAK || f.isComment(i);
};

export const swIsSpaceOrComment = (f: SwFormatter, i: i32): boolean => f.k(i) === SW_SPACE || f.isComment(i);

/** Token.swiftTypeKeywords. */
export const swIsTypeKeywordStr = (s: string): boolean =>
  s === "struct" || s === "class" || s === "actor" || s === "protocol" || s === "enum" || s === "extension";

/** Token.declarationTypeKeywords. */
export const swIsDeclarationTypeKeywordStr = (s: string): boolean =>
  swIsTypeKeywordStr(s) ||
  s === "import" ||
  s === "let" ||
  s === "var" ||
  s === "typealias" ||
  s === "func" ||
  s === "case" ||
  s === "init" ||
  s === "deinit" ||
  s === "subscript" ||
  s === "operator" ||
  s === "precedencegroup" ||
  s === "associatedtype" ||
  s === "macro";

export const swIsDeclarationTypeKeyword = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_KEYWORD && swIsDeclarationTypeKeywordStr(f.s(i));

/** Token.isPropertyAccessorKeyword. */
export const swIsPropertyAccessorKeyword = (f: SwFormatter, i: i32): boolean => {
  if (!f.has(i)) {
    return false;
  }
  const k = f.k(i);
  if (k !== SW_IDENT && k !== SW_KEYWORD) {
    return false;
  }
  const s = f.s(i);
  return (
    s === "get" || s === "set" || s === "_read" || s === "_modify" || s === "willSet" || s === "didSet" || s === "init"
  );
};

// MARK: scopes

/** startOfScope(at:), or -1. */
export const swStartOfScope = (f: SwFormatter, index: i32): i32 => {
  const j = f.indexBefore(SW_T_START_OF_SCOPE, index);
  if (j < 0) {
    return -1;
  }
  if (f.tok(j, SW_START, "//") || f.tok(j, SW_START, "#!")) {
    let lb = f.indexAfter(SW_T_LINEBREAK, j);
    if (lb < 0) {
      lb = index;
    }
    if (lb < index) {
      return -1;
    }
  }
  return j;
};

/** currentScope(at:) as an index, or -1. */
export const swCurrentScope = (f: SwFormatter, index: i32): i32 => f.indexBefore(SW_T_START_OF_SCOPE, index);

/** endOfScope(at:), or -1. */
/** endOfScope(at:), cached per mutation count. */
export const swEndOfScope = (f: SwFormatter, index: i32): i32 => {
  if (index < 0 || index >= f.count()) {
    return -1;
  }
  const gen = f.eoGen;
  const val = f.eoVal;
  while (toI32(gen.length) <= index) {
    gen.push(0);
  }
  while (toI32(val.length) <= index) {
    val.push(0);
  }
  const m = f.mutations;
  if (m >= 2147483647) {
    fault();
    return -1;
  }
  const stamp = m + 1;
  if (index < gen.length && index < val.length && gen[index] === stamp) {
    return val[index];
  }
  const r = swEndOfScopeUncached(f, index);
  if (index < gen.length && index < val.length) {
    gen[index] = stamp;
    val[index] = r;
  }
  return r;
};

const swEndOfScopeUncached = (f: SwFormatter, index: i32): i32 => {
  if (!f.has(index)) {
    return -1;
  }
  let startIndex = index;
  if (f.k(index) !== SW_START) {
    const j = f.indexBefore(SW_T_START_OF_SCOPE, index);
    if (j < 0 || f.tok(j, SW_START, "//") || f.tok(j, SW_START, "#!")) {
      return -1;
    }
    startIndex = j;
  }
  if (!f.tok(startIndex, SW_START, "{")) {
    const st = startIndex;
    let endIndex = startIndex;
    while (endIndex >= 0 && (endIndex < index || !f.closes(endIndex, st))) {
      endIndex = swIndexAfterWhere(f, endIndex, (g, j) => g.closes(j, st) || g.tok(j, SW_END, "#endif"));
    }
    return endIndex;
  }
  let s = startIndex;
  while (true) {
    const st = s;
    const endIndex = swIndexAfterWhere(f, st, (g, j) => g.closes(j, st));
    if (endIndex < 0) {
      return -1;
    }
    if (f.tok(endIndex, SW_END, "}")) {
      return endIndex;
    }
    s = endIndex;
  }
};

// MARK: keywords

/** isAfterBrace (indexOfLastSignificantKeyword's helper). */
const swIsAfterBrace = (f: SwFormatter, index: i32, i: i32): boolean => {
  const scopeStart = f.lastIndexInType(SW_T_START_OF_SCOPE, index, i);
  if (scopeStart >= 0) {
    return swIsAfterBrace(f, index, scopeStart);
  }
  const braceIndex = f.lastIndexOfIn(SW_END, "}", 0, index, i);
  if (braceIndex < 0) {
    return false;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, braceIndex);
  if (
    n < 0 ||
    (f.k(n) === SW_OP && (f.a(n) === SW_OP_INFIX || f.a(n) === SW_OP_POSTFIX)) ||
    f.tok(n, SW_START, "(") ||
    f.tok(n, SW_START, "{") ||
    f.tok(n, SW_DELIM, ",")
  ) {
    return swIsAfterBrace(f, index, braceIndex);
  }
  return true;
};

/** indexOfLastSignificantKeyword(at:excluding:), or -1. */
export const swIndexOfLastSignificantKeyword = (f: SwFormatter, i: i32, ex: i32 = 0): i32 => {
  if (!f.has(i)) {
    return -1;
  }
  const index = swIsKeyword(f, i) ? i : f.indexBefore(SW_T_KEYWORD, i);
  if (index < 0 || f.k(index) !== SW_KEYWORD) {
    return -1;
  }
  if (swIsAfterBrace(f, index, i)) {
    return -1;
  }
  const kw = f.s(index);
  if (
    kw.startsWith("#") ||
    swExcluded(kw, ex) ||
    kw === "in" ||
    kw === "is" ||
    kw === "as" ||
    kw === "try" ||
    kw === "await"
  ) {
    return swIndexOfLastSignificantKeyword(f, index - 1, ex);
  }
  return index;
};

/** lastSignificantKeyword(at:excluding:), or "". */
export const swLastSignificantKeyword = (f: SwFormatter, i: i32, ex: i32 = 0): string => {
  const index = swIndexOfLastSignificantKeyword(f, i, ex);
  if (index < 0 || f.k(index) !== SW_KEYWORD) {
    return "";
  }
  return f.s(index);
};

/** startOfConditionalStatement(at:excluding:), or -1. */
export const swStartOfConditionalStatement = (f: SwFormatter, i: i32, ex: i32 = 0): i32 => {
  let index = swIndexOfLastSignificantKeyword(f, i, ex | SW_EX_ELSE);
  if (index < 0) {
    return -1;
  }
  if (f.kw(index, "where")) {
    const t = swIndexBeforeWhere(f, index, (g, j) => g.tok(j, SW_END, "case") || g.tok(j, SW_END, "}"));
    if (t >= 0 && f.tok(t, SW_END, "case")) {
      return -1;
    }
    const k = swIndexOfLastSignificantKeyword(f, index, SW_EX_WHERE);
    if (k >= 0) {
      index = k;
    }
  }
  if (f.kw(index, "case")) {
    const j = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (j >= 0) {
      if (f.tok(j, SW_DELIM, ",")) {
        const r = swStartOfConditionalStatement(f, j);
        return r >= 0 ? r : index;
      }
      index = j;
    }
  }
  const s = f.s(index);
  if (s === "let" || s === "var" || s === "await") {
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (prevIndex < 0) {
      return -1;
    }
    if (f.kw(prevIndex, "case")) {
      return swStartOfConditionalStatement(f, prevIndex);
    }
    if (f.k(prevIndex) === SW_KEYWORD) {
      const p = f.s(prevIndex);
      if (p === "if" || p === "guard" || p === "while" || p === "for" || p === "catch") {
        return prevIndex;
      }
    }
    if (f.tok(prevIndex, SW_DELIM, ",")) {
      return swStartOfConditionalStatement(f, prevIndex);
    }
    return -1;
  }
  if (s === "if" || s === "guard" || s === "while" || s === "for" || s === "repeat" || s === "case") {
    return index;
  }
  if (s === "switch") {
    return swNextIs(f, SW_T_START_OF_SCOPE, i, SW_START, ":") ? -1 : index;
  }
  return -1;
};

export const swIsConditionalStatement = (f: SwFormatter, i: i32, ex: i32 = 0): boolean =>
  swStartOfConditionalStatement(f, i, ex) >= 0;

/** isConditionalAssignment(at:). */
export const swIsConditionalAssignment = (f: SwFormatter, i: i32): boolean => {
  const start = swStartOfConditionalStatement(f, i);
  if (start < 0) {
    return false;
  }
  let j = start;
  while (true) {
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, j);
    if (prevIndex < 0) {
      return false;
    }
    if (f.kw(prevIndex, "try") || f.kw(prevIndex, "await")) {
      j = prevIndex;
    } else if (swIsUnwrap(f, prevIndex)) {
      const beforeOp = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (beforeOp < 0 || !f.kw(beforeOp, "try")) {
        return false;
      }
      j = beforeOp;
    } else {
      return f.ks(prevIndex, SW_OP, "=");
    }
  }
};

/** isAccessorKeyword(at:checkKeyword:). */
export const swIsAccessorKeyword = (f: SwFormatter, i: i32, checkKeyword: boolean = true): boolean => {
  if (checkKeyword && !swIsPropertyAccessorKeyword(f, i)) {
    return false;
  }
  let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (prevIndex < 0) {
    return false;
  }
  if (f.tok(prevIndex, SW_END, "}")) {
    const startIndex = f.indexOfBefore(SW_START, "{", 0, prevIndex);
    if (startIndex >= 0) {
      const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (prev >= 0) {
        prevIndex = prev;
        if (f.tok(prevIndex, SW_END, ")")) {
          const si = f.indexOfBefore(SW_START, "(", 0, prevIndex);
          if (si >= 0) {
            const p2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, si);
            if (p2 >= 0) {
              prevIndex = p2;
            }
          }
        }
        return swIsAccessorKeyword(f, prevIndex);
      }
    }
  }
  if (f.tok(prevIndex, SW_START, "{")) {
    const kw = swLastSignificantKeyword(f, prevIndex, SW_EX_WHERE);
    return kw === "var" || kw === "subscript";
  }
  return false;
};

/** startOfAttribute(at:), or -1. */
export const swStartOfAttribute = (f: SwFormatter, i: i32): i32 => {
  if (swIsAttribute(f, i)) {
    return i;
  }
  if (f.tok(i, SW_END, ")")) {
    const open = f.indexOfBefore(SW_START, "(", 0, i);
    if (open < 0) {
      return -1;
    }
    const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, open);
    if (prev < 0) {
      return -1;
    }
    return swStartOfAttribute(f, prev);
  }
  if (f.has(i) && f.k(i) === SW_IDENT) {
    const sep = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (sep < 0 || !(f.ks(sep, SW_OP, ".") || f.ks(sep, SW_OP, "::"))) {
      return -1;
    }
    const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sep);
    if (prev < 0) {
      return -1;
    }
    return swStartOfAttribute(f, prev);
  }
  return -1;
};

/** endOfAttribute(at:), or -1 for nil. */
export const swEndOfAttribute = (f: SwFormatter, i: i32): i32 => {
  const startIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (startIndex < 0) {
    return i;
  }
  const lb = swHasLinebreak(f, add32(i, 1), startIndex);
  if (f.tok(startIndex, SW_START, "(") && !lb) {
    return f.indexOfAfter(SW_END, ")", 0, startIndex);
  }
  if (f.op(startIndex, ".", SW_OP_INFIX)) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
    if (n < 0) {
      return -1;
    }
    return swEndOfAttribute(f, n);
  }
  if (f.op(startIndex, "::", SW_OP_INFIX) && !lb) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, startIndex);
    if (n < 0 || f.k(n) === SW_LINEBREAK) {
      return i;
    }
    return swEndOfAttribute(f, n);
  }
  if (f.tok(startIndex, SW_START, "<")) {
    const n = f.indexOfAfter(SW_END, ">", 0, startIndex);
    if (n < 0) {
      return -1;
    }
    return swEndOfAttribute(f, n);
  }
  return i;
};

// MARK: closures

/** isStartOfClosure(at:). */
export const swIsStartOfClosure = (f: SwFormatter, i: i32): boolean => {
  if (!f.tok(i, SW_START, "{")) {
    return false;
  }
  if (swIsConditionalStatement(f, i)) {
    const endIndex = swEndOfScope(f, i);
    if (endIndex >= 0) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, endIndex);
      if (
        (n >= 0 && (f.tok(n, SW_START, "(") || f.op(n, ".", SW_OP_INFIX))) ||
        swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex, SW_START, "{")
      ) {
        return true;
      }
    }
    return false;
  }
  let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (prevIndex < 0) {
    return true;
  }
  const pk = f.k(prevIndex);
  const ps = f.s(prevIndex);
  const pa = f.a(prevIndex);
  if (
    (pk === SW_START && (ps === "(" || ps === "[" || ps === "{")) ||
    (pk === SW_OP && (pa === SW_OP_INFIX || pa === SW_OP_PREFIX)) ||
    pk === SW_DELIM ||
    (pk === SW_KEYWORD &&
      (ps === "return" || ps === "in" || ps === "where" || ps === "try" || ps === "throw" || ps === "await"))
  ) {
    return true;
  }
  if (
    (pk === SW_OP && pa === SW_OP_NONE) ||
    (pk === SW_KEYWORD &&
      (ps === "deinit" || ps === "catch" || ps === "else" || ps === "repeat" || ps === "throws" || ps === "rethrows"))
  ) {
    return false;
  }
  if (pk === SW_END && ps === "}") {
    const startOfScope = f.indexOfBefore(SW_START, "{", 0, prevIndex);
    if (startOfScope < 0) {
      return false;
    }
    return !swIsStartOfClosure(f, startOfScope);
  }
  let identLike = false;
  if (pk === SW_END && (ps === ")" || ps === ">")) {
    let startOfScope = f.indexBefore(SW_T_START_OF_SCOPE, prevIndex);
    if (startOfScope < 0) {
      return true;
    }
    let prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startOfScope);
    if (prev < 0) {
      return true;
    }
    if (ps === ">" && f.tok(prev, SW_END, ")")) {
      const s2 = f.indexBefore(SW_T_START_OF_SCOPE, prev);
      if (s2 >= 0) {
        startOfScope = s2;
      }
      const p2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startOfScope);
      if (p2 >= 0) {
        prev = p2;
      }
    }
    const qk = f.k(prev);
    const qs = f.s(prev);
    if (qk === SW_IDENT) {
      prevIndex = prev;
    } else if (f.op(prev, "?", SW_OP_POSTFIX) || f.op(prev, "!", SW_OP_POSTFIX)) {
      if (f.has(prev - 1) && f.k(prev - 1) === SW_IDENT) {
        prevIndex = prev - 1;
      } else if (f.kw(prev - 1, "init")) {
        return false;
      } else {
        return true;
      }
    } else if (
      f.op(prev, "->", SW_OP_INFIX) ||
      (qk === SW_KEYWORD && (qs === "init" || qs === "subscript" || qs === "throws"))
    ) {
      return false;
    } else if (qk === SW_END && qs === ">") {
      const startIndex = f.indexOfBefore(SW_START, "<", 0, prev);
      if (startIndex < 0) {
        f.fatalError("Expected <", prev - 1);
        return false;
      }
      const pi = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, startIndex);
      if (pi < 0 || f.k(pi) !== SW_IDENT) {
        return false;
      }
      return !swPrevIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pi, SW_KEYWORD, "func");
    } else {
      return false;
    }
    identLike = true;
  }
  if (
    identLike ||
    pk === SW_IDENT ||
    pk === SW_NUMBER ||
    f.op(prevIndex, "?", SW_OP_POSTFIX) ||
    f.op(prevIndex, "!", SW_OP_POSTFIX) ||
    (pk === SW_END && swIsStringDelimiter(pk, ps))
  ) {
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nextIndex >= 0 && (swIsAccessorKeyword(f, nextIndex) || swIsAccessorKeyword(f, prevIndex))) {
      return false;
    }
    const prevKeywordIndex = swIndexOfLastSignificantKeyword(f, prevIndex, SW_EX_WHERE);
    if (prevKeywordIndex < 0) {
      return true;
    }
    const kw = f.s(prevKeywordIndex);
    if (kw === "var") {
      if (f.lastIndexOfIn(SW_OP, "=", SW_OP_INFIX, add32(prevKeywordIndex, 1), i) >= 0) {
        return true;
      }
      let index = prevKeywordIndex;
      while (true) {
        const nextIdx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, index);
        if (nextIdx < 0 || nextIdx >= i) {
          break;
        }
        if (f.op(nextIdx, "=", SW_OP_INFIX)) {
          return true;
        }
        if (f.k(nextIdx) === SW_LINEBREAK) {
          const n2 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIdx);
          if (n2 < 0) {
            return true;
          }
          if (!f.tok(n2, SW_START, "{") && swIsEndOfStatement(f, index) && swIsStartOfStatement(f, n2)) {
            return true;
          }
          index = n2;
        } else {
          index = nextIdx;
        }
      }
      return false;
    }
    if (
      kw === "class" ||
      kw === "actor" ||
      kw === "struct" ||
      kw === "enum" ||
      kw === "protocol" ||
      kw === "extension" ||
      kw === "func" ||
      kw === "init" ||
      kw === "subscript" ||
      kw === "catch"
    ) {
      return false;
    }
    if (kw === "throws" || kw === "rethrows") {
      return swNextIs(f, SW_T_KEYWORD, prevKeywordIndex, SW_KEYWORD, "in");
    }
    return true;
  }
  if (pk === SW_KEYWORD || (pk === SW_END && (ps === "]" || ps === ">"))) {
    return false;
  }
  return true;
};

/** parseClosureArguments(at:)?.inKeywordIndex, or -1. */
export const swClosureInKeyword = (f: SwFormatter, closureStart: i32): i32 => {
  let currentIndex = closureStart;
  let globalActor = -1;
  let n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (n >= 0 && swIsAttribute(f, n)) {
    globalActor = n;
    currentIndex = n;
  }
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (first >= 0 && f.tok(first, SW_START, "[")) {
    const end = swEndOfScope(f, first);
    if (end >= 0) {
      currentIndex = end;
    }
  }
  if (globalActor < 0) {
    n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (n >= 0 && swIsAttribute(f, n)) {
      currentIndex = n;
    }
  }
  const firstParam = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (firstParam < 0) {
    return -1;
  }
  if (f.tok(firstParam, SW_START, "(")) {
    const paramsEnd = swEndOfScope(f, firstParam);
    if (paramsEnd < 0) {
      return -1;
    }
    currentIndex = paramsEnd;
    currentIndex = swSkipClosureEffectsAndReturn(f, currentIndex);
  } else if (f.k(firstParam) === SW_IDENT) {
    let paramsEnd = firstParam;
    let argIndex = firstParam;
    while (argIndex < f.count()) {
      if (f.k(argIndex) === SW_IDENT) {
        paramsEnd = argIndex;
        const nn = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, argIndex);
        if (nn >= 0) {
          if (f.tok(nn, SW_DELIM, ",")) {
            argIndex = add32(nn, 1);
            continue;
          } else if (
            f.kw(nn, "in") ||
            f.op(nn, "->", SW_OP_INFIX) ||
            f.kw(nn, "throws") ||
            f.kw(nn, "rethrows") ||
            f.tok(nn, SW_IDENT, "async")
          ) {
            break;
          } else {
            return -1;
          }
        } else {
          break;
        }
      } else if (swIsSpaceOrCommentOrLinebreak(f, argIndex)) {
        argIndex++;
      } else {
        return -1;
      }
    }
    currentIndex = paramsEnd;
    currentIndex = swSkipClosureEffectsAndReturn(f, currentIndex);
  }
  const inIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (inIndex < 0 || !f.kw(inIndex, "in")) {
    return -1;
  }
  return inIndex;
};

const swSkipClosureEffectsAndReturn = (f: SwFormatter, current: i32): i32 => {
  let currentIndex = current;
  const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (nextTokenIndex < 0) {
    return currentIndex;
  }
  let idx = nextTokenIndex;
  while (f.kw(idx, "throws") || f.kw(idx, "rethrows") || f.tok(idx, SW_IDENT, "async")) {
    const parenStart = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    let moved = false;
    if (parenStart >= 0 && f.tok(parenStart, SW_START, "(")) {
      const parenEnd = swEndOfScope(f, parenStart);
      if (parenEnd >= 0) {
        const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, parenEnd);
        if (nx >= 0) {
          idx = nx;
          moved = true;
        }
      }
    }
    if (!moved) {
      const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
      if (nx >= 0) {
        idx = nx;
      } else {
        break;
      }
    }
  }
  if (f.op(idx, "->", SW_OP_INFIX)) {
    const rts = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    if (rts >= 0) {
      const end = swParseType(f, rts);
      if (end >= 0) {
        return end;
      }
    }
  }
  if (idx !== nextTokenIndex) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    if (p >= 0) {
      currentIndex = p;
    }
  }
  return currentIndex;
};

/** isInClosureArguments(at:). */
export const swIsInClosureArguments = (f: SwFormatter, i: i32): boolean => {
  let scopeStart = i;
  while (true) {
    const startIndex = swStartOfScope(f, scopeStart);
    if (startIndex < 0) {
      return false;
    }
    if (f.tok(startIndex, SW_START, "{")) {
      if (!swIsStartOfClosure(f, startIndex)) {
        return false;
      }
      const inIdx = swClosureInKeyword(f, startIndex);
      if (inIdx < 0) {
        return false;
      }
      return i > startIndex && i <= inIdx;
    }
    scopeStart = startIndex;
  }
};

// MARK: types

/** parseFunctionDeclarationEffectsClause(at:)?.range.upperBound, or -1. */
export const swEffectsClauseEnd = (f: SwFormatter, startIndex: i32): i32 => {
  let end = -1;
  let currentIndex = startIndex;
  const firstAfter = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  while (true) {
    const effectIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (effectIndex < 0 || firstAfter < 0) {
      break;
    }
    const e = f.s(effectIndex);
    if (!(e === "async" || e === "throws" || e === "rethrows")) {
      break;
    }
    if (e === "throws") {
      const st = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, effectIndex);
      if (st >= 0 && f.tok(st, SW_START, "(")) {
        const et = swEndOfScope(f, st);
        if (et >= 0) {
          end = et;
          currentIndex = et;
          continue;
        }
      }
    }
    if (e === "async") {
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, effectIndex);
      if (nt >= 0 && f.kw(nt, "let")) {
        break;
      }
    }
    end = effectIndex;
    currentIndex = effectIndex;
  }
  return end;
};

/** parseGenericValue(at:)'s range end, or -1. */
export const swParseGenericValueEnd = (f: SwFormatter, index: i32): i32 => {
  let v = index;
  if (f.ks(v, SW_OP, "-")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, v);
    if (n >= 0) {
      v = n;
    }
  }
  if (f.k(v) !== SW_NUMBER) {
    return -1;
  }
  const a = f.a(v);
  if (a === SW_NUM_INTEGER || a === SW_NUM_BINARY || a === SW_NUM_OCTAL) {
    return v;
  }
  if (a === SW_NUM_HEX && f.s(v).indexOf("p") < 0 && f.s(v).indexOf("P") < 0) {
    return v;
  }
  return -1;
};

/** parseType(at:)'s range end (it starts at `start`), or -1. */
export const swParseType = (f: SwFormatter, start: i32, exclLower: boolean = false, exclComp: boolean = false): i32 => {
  const baseEnd = swParseNonOptionalType(f, start, exclLower, exclComp);
  if (baseEnd < 0) {
    return -1;
  }
  // swIsUnwrap is false past the last token.
  const count = f.count();
  if (baseEnd < count && swIsUnwrap(f, baseEnd + 1)) {
    let e = baseEnd + 1;
    while (e < count && swIsUnwrap(f, e + 1)) {
      e++;
    }
    return e;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, baseEnd);
  if (n >= 0 && (f.op(n, ".", SW_OP_INFIX) || (!exclComp && f.op(n, "&", SW_OP_INFIX)))) {
    const ft = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
    if (ft >= 0) {
      const e = swParseType(f, ft, exclLower, false);
      if (e >= 0) {
        return e;
      }
    }
  }
  if (n >= 0 && f.op(n, "::", SW_OP_INFIX)) {
    const a = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, n);
    if (a >= 0 && f.k(a) !== SW_LINEBREAK) {
      const e = swParseType(f, a, exclLower, false);
      if (e >= 0) {
        return e;
      }
    }
  }
  return baseEnd;
};

const swParseNonOptionalType = (f: SwFormatter, start: i32, exclLower: boolean, exclComp: boolean): i32 => {
  if (f.tok(start, SW_START, "[")) {
    const endOfScope = swEndOfScope(f, start);
    if (endOfScope >= 0) {
      const inner = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
      if (inner < 0) {
        return -1;
      }
      const innerEnd = swParseType(f, inner, exclLower, exclComp);
      const firstEnd = innerEnd >= 0 ? innerEnd : swParseGenericValueEnd(f, inner);
      if (firstEnd < 0) {
        return -1;
      }
      const after = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, firstEnd);
      if (after < 0) {
        return -1;
      }
      if (after === endOfScope) {
        if (innerEnd < 0) {
          return -1;
        }
      } else {
        if (!(f.tok(after, SW_IDENT, "of") || (f.tok(after, SW_DELIM, ":") && innerEnd >= 0))) {
          return -1;
        }
        const second = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, after);
        if (second < 0) {
          return -1;
        }
        const secondEnd = swParseType(f, second, exclLower, exclComp);
        if (secondEnd < 0) {
          return -1;
        }
        const after2 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, secondEnd);
        if (after2 !== endOfScope) {
          return -1;
        }
      }
      return endOfScope;
    }
  }
  if (f.tok(start, SW_START, "(")) {
    const endOfScope = swEndOfScope(f, start);
    if (endOfScope >= 0) {
      let searchIndex = endOfScope;
      const eff = swEffectsClauseEnd(f, endOfScope);
      if (eff >= 0) {
        searchIndex = eff;
      }
      const ret = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, searchIndex);
      if (ret >= 0 && f.op(ret, "->", SW_OP_INFIX)) {
        const rt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ret);
        if (rt >= 0) {
          const re = swParseType(f, rt, exclLower, exclComp);
          if (re >= 0) {
            return re;
          }
        }
      }
      for (let j = start; j <= endOfScope && j < 2147483647; j++) {
        if (swIsKeyword(f, j)) {
          const s = f.s(j);
          if (
            s === "as" ||
            s === "is" ||
            s === "try" ||
            s === "await" ||
            s === "if" ||
            s === "switch" ||
            s === "for" ||
            s === "while" ||
            s === "guard" ||
            s === "in" ||
            s === "return" ||
            s === "throw"
          ) {
            return -1;
          }
        }
      }
      return endOfScope;
    }
  }
  const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
  if (nt >= 0 && f.tok(nt, SW_START, "<")) {
    const e = swEndOfScope(f, nt);
    if (e >= 0) {
      return e;
    }
  }
  const ss = f.s(start);
  if (
    ss === "any" ||
    ss === "some" ||
    ss === "borrowing" ||
    ss === "consuming" ||
    ss === "sending" ||
    ss === "repeat" ||
    ss === "each" ||
    ss === "~" ||
    ss === "inout" ||
    swIsAttribute(f, start)
  ) {
    if (nt >= 0) {
      const e = swParseType(f, nt, exclLower, exclComp);
      if (e >= 0) {
        return e;
      }
    }
  }
  if (f.k(start) === SW_IDENT && ss !== "init") {
    if (exclLower && swIsLowercaseIdentifier(ss)) {
      return -1;
    }
    return start;
  }
  return -1;
};

/** Whether the first character after leading `_` and backticks is lowercase (uppercased() != itself). */
const swIsLowercaseIdentifier = (name: string): boolean => {
  let i = 0;
  const n = toI32(name.length);
  while (i < n && (name.charCodeAt(i) === 95 || name.charCodeAt(i) === 96)) {
    i++;
  }
  if (i >= n) {
    return false;
  }
  // firstCharacter.uppercased() != firstCharacter
  return !swCharacterUppercaseInvariant(name, i);
};

const swCpAtStr = (s: string, i: i32): i32 => {
  // A sequence cut off by the end of the string panicked: it faults.
  if (i < 0 || i >= s.length) {
    fault();
    return -1;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return c;
  }
  const i1 = i + 1;
  if (i1 >= s.length) {
    fault();
    return -1;
  }
  const c1 = s.charCodeAt(i1) & 0x3f;
  if (c < 0xe0) {
    return ((c & 0x1f) << 6) | c1;
  }
  const i2 = i1 + 1;
  if (i2 >= s.length) {
    fault();
    return -1;
  }
  const c2 = s.charCodeAt(i2) & 0x3f;
  if (c < 0xf0) {
    return ((c & 0x0f) << 12) | (c1 << 6) | c2;
  }
  const i3 = i2 + 1;
  if (i3 >= s.length) {
    fault();
    return -1;
  }
  return ((c & 0x07) << 18) | (c1 << 12) | (c2 << 6) | (s.charCodeAt(i3) & 0x3f);
};

// MARK: statements

/** startOfForLoopPattern(after:), or -1. */
export const swStartOfForLoopPattern = (f: SwFormatter, index: i32): i32 => {
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (n < 0) {
    return -1;
  }
  if (f.kw(n, "try") || f.kw(n, "await")) {
    return swStartOfForLoopPattern(f, n);
  }
  if (f.tok(n, SW_IDENT, "unsafe")) {
    const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
    if (m >= 0 && (f.k(m) === SW_IDENT || f.tok(m, SW_START, "(") || f.kw(m, "case"))) {
      return swStartOfForLoopPattern(f, n);
    }
  }
  return n;
};

/** The scope string for isEndOfStatement/isStartOfStatement: the given one, or the current scope's; null for none. */
const swScopeStr = (f: SwFormatter, i: i32, scope: string | null): string | null => {
  if (scope !== null) {
    return scope;
  }
  const j = swCurrentScope(f, i);
  return j < 0 ? null : f.s(j);
};

/** isEndOfStatement(at:in:). */
export const swIsEndOfStatement = (f: SwFormatter, i: i32, scope: string | null = null): boolean => {
  if (!f.has(i)) {
    return true;
  }
  const k = f.k(i);
  const s = f.s(i);
  if (k === SW_IDENT && s === "unsafe") {
    const forIndex = f.indexOfBefore(SW_KEYWORD, "for", 0, i);
    if (forIndex >= 0) {
      const ps = swStartOfForLoopPattern(f, forIndex);
      if (ps >= 0 && i < ps) {
        return false;
      }
    }
  }
  if (k === SW_END && (s === "case" || s === "default")) {
    return false;
  }
  if (k === SW_KEYWORD) {
    if (
      s === "let" ||
      s === "func" ||
      s === "var" ||
      s === "if" ||
      s === "as" ||
      s === "import" ||
      s === "try" ||
      s === "guard" ||
      s === "case" ||
      s === "for" ||
      s === "init" ||
      s === "switch" ||
      s === "throw" ||
      s === "where" ||
      s === "subscript" ||
      s === "is" ||
      s === "while" ||
      s === "associatedtype" ||
      s === "inout" ||
      s === "await"
    ) {
      return false;
    }
    if (s === "in") {
      return swLastSignificantKeyword(f, i) !== "for";
    }
    if (s === "return") {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (n < 0) {
        return true;
      }
      if ((f.k(n) === SW_KEYWORD && !swStrIsMacro(f.s(n))) || f.tok(n, SW_END, "case") || f.tok(n, SW_END, "default")) {
        return true;
      }
      return false;
    }
    return true;
  }
  if (k === SW_DELIM && s === ",") {
    const sc = swScopeStr(f, i, scope);
    if (sc === null) {
      return false;
    }
    return sc === "<" || sc === "[" || sc === "(" || sc === "case" || sc === "default";
  }
  if (k === SW_DELIM && s === ":") {
    const sc = swScopeStr(f, i, scope);
    if (sc === null) {
      return false;
    }
    return sc === "case" || sc === "default" || sc === "(";
  }
  if (k === SW_OP) {
    const a = f.a(i);
    if (a === SW_OP_INFIX || a === SW_OP_PREFIX) {
      return false;
    }
    if (a === SW_OP_POSTFIX && (s === "?" || s === "!")) {
      if (i > 0 && (f.kw(i - 1, "as") || f.kw(i - 1, "try"))) {
        return false;
      }
      return true;
    }
  }
  const attributeIndex = swStartOfAttribute(f, i);
  if (attributeIndex >= 0) {
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, attributeIndex);
    if (prevIndex >= 0) {
      return swIsEndOfStatement(f, prevIndex, scope);
    }
  }
  return true;
};

/** isTrailingClosureLabel(at:). */
export const swIsTrailingClosureLabel = (f: SwFormatter, i: i32): boolean => {
  if (!(f.has(i) && f.k(i) === SW_IDENT)) {
    return false;
  }
  if (!swPrevIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_END, "}")) {
    return false;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
  if (n < 0 || !f.tok(n, SW_DELIM, ":")) {
    return false;
  }
  const nn = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
  return nn >= 0 && swIsStartOfClosure(f, nn);
};

/** isStartOfStatement(at:in:treatingCollectionKeysAsStart:). */
export const swIsStartOfStatement = (
  f: SwFormatter,
  i: i32,
  scope: string | null = null,
  treatingKeys: boolean = true,
): boolean => {
  if (!f.has(i)) {
    return true;
  }
  const k = f.k(i);
  const s = f.s(i);
  const a = f.a(i);
  if (k === SW_KEYWORD && (s === "where" || s === "dynamicType" || s === "rethrows" || s === "throws")) {
    return false;
  }
  if (k === SW_KEYWORD && s === "as") {
    const sc = swScopeStr(f, i, scope);
    return sc !== null && sc === "case";
  }
  if (k === SW_KEYWORD && s === "in") {
    const sc = swScopeStr(f, i, scope);
    return (sc !== null && sc === "case") || (sc !== null && sc === "{" && swLastSignificantKeyword(f, i) !== "for");
  }
  if (k === SW_KEYWORD && s === "is") {
    const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (lt < 0) {
      return false;
    }
    return f.tok(lt, SW_END, "case") || f.kw(lt, "case") || f.tok(lt, SW_DELIM, ",");
  }
  if (
    k === SW_SPACE ||
    k === SW_DELIM ||
    (k === SW_OP && (a === SW_OP_INFIX || a === SW_OP_POSTFIX)) ||
    (k === SW_END && (s === "}" || s === "]" || s === ")" || s === ">")) ||
    (k === SW_IDENT && swIsTrailingClosureLabel(f, i))
  ) {
    return false;
  }
  if (k === SW_START && s === "{" && swIsStartOfClosure(f, i)) {
    const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
    if (lt < 0 || f.k(lt) !== SW_LINEBREAK) {
      return false;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prevIndex < 0) {
      return false;
    }
    if (f.k(prevIndex) === SW_IDENT && !swIsLiteralIdentifier(f, prevIndex)) {
      return false;
    }
    if (f.tok(prevIndex, SW_END, ")") || f.tok(prevIndex, SW_END, "]")) {
      const startIndex = f.indexBefore(SW_T_START_OF_SCOPE, prevIndex);
      if (startIndex >= 0) {
        let hasLb = false;
        for (let j = startIndex; j < prevIndex; j++) {
          if (f.k(j) === SW_LINEBREAK) {
            hasLb = true;
            break;
          }
        }
        if (!hasLb || f.currentIndentForLine(startIndex) === f.currentIndentForLine(prevIndex)) {
          return false;
        }
      }
    }
    return true;
  }
  let stage = 0; // 1: the identifier body; 2: the try/await body
  if (k === SW_IDENT && s === "async") {
    if (swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_KEYWORD, "let")) {
      return true;
    }
    if (
      swPrevIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_END, ")") &&
      swLastSignificantKeyword(f, i) === "func"
    ) {
      return false;
    }
    stage = 1;
  } else if (
    (k === SW_START && swIsStringDelimiter(k, s) && !treatingKeys) ||
    (k === SW_NUMBER && !treatingKeys) ||
    (k === SW_KEYWORD && swStrIsMacro(s)) ||
    k === SW_IDENT
  ) {
    stage = 1;
  } else if (k === SW_KEYWORD && (s === "try" || s === "await")) {
    stage = 2;
  }
  if (stage === 1) {
    if (!treatingKeys) {
      const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (prevIndex >= 0) {
        let r = f.tok(prevIndex, SW_DELIM, ",") || f.tok(prevIndex, SW_START, "[") || f.tok(prevIndex, SW_START, "(");
        if (!r && (f.op(prevIndex, "?", SW_OP_POSTFIX) || f.op(prevIndex, "!", SW_OP_POSTFIX))) {
          const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, prevIndex);
          r = q >= 0 && (f.kw(q, "try") || f.kw(q, "as"));
        }
        if (r) {
          return false;
        }
      }
    }
    stage = 2;
  }
  if (stage === 2) {
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prevIndex < 0) {
      return true;
    }
    const pk = f.k(prevIndex);
    const ps = f.s(prevIndex);
    const pa = f.a(prevIndex);
    if (f.op(prevIndex, "?", SW_OP_POSTFIX) || f.op(prevIndex, "!", SW_OP_POSTFIX)) {
      const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (q >= 0 && (f.kw(q, "try") || f.kw(q, "as"))) {
        return false;
      }
    }
    if (
      pk === SW_NUMBER ||
      (pk === SW_OP && pa === SW_OP_POSTFIX) ||
      pk === SW_END ||
      pk === SW_IDENT ||
      (pk === SW_START && (ps === "{" || ps === ":")) ||
      (pk === SW_DELIM && ps === ";") ||
      (pk === SW_KEYWORD && ps === "in" && swLastSignificantKeyword(f, i) !== "for") ||
      (pk === SW_KEYWORD && ps === "#else")
    ) {
      return true;
    }
    return false;
  }
  if (k === SW_KEYWORD) {
    return true;
  }
  const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
  if (lt < 0) {
    return true;
  }
  if (f.k(lt) !== SW_LINEBREAK) {
    return false;
  }
  const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (pt >= 0) {
    if (f.kw(pt, "return") || (f.k(pt) === SW_OP && f.a(pt) === SW_OP_INFIX)) {
      return false;
    }
    const cs = swCurrentScope(f, i);
    if (cs >= 0 && swIsMultilineStringDelimiter(f.k(cs), f.s(cs))) {
      return false;
    }
  }
  return true;
};

/** isCommentedCode(at:) (the indent option is four spaces). */
export const swIsCommentedCode = (f: SwFormatter, i: i32): boolean => {
  // f.tok holds only inside the list, so i + 1 fits.
  if (i >= 0 && i < f.count() && f.tok(i, SW_START, "//") && !(f.has(i - 1) && f.k(i - 1) === SW_SPACE)) {
    if (!f.has(i + 1) || f.k(i + 1) === SW_LINEBREAK) {
      return true;
    }
    if (f.k(i + 1) === SW_SPACE && f.s(i + 1).startsWith("    ")) {
      return true;
    }
  }
  return false;
};

/** isLabel(at:). */
export const swIsLabel = (f: SwFormatter, i: i32): boolean => {
  if (!(f.has(i) && f.k(i) === SW_IDENT)) {
    return false;
  }
  return swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_DELIM, ":");
};

/** isGuardElse(at:). */
export const swIsGuardElse = (f: SwFormatter, index: i32): boolean => {
  if (!f.kw(index, "else")) {
    return false;
  }
  const previousIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (previousIndex < 0) {
    return false;
  }
  if (!f.tok(previousIndex, SW_END, "}")) {
    return true;
  }
  const sos = swStartOfScope(f, previousIndex);
  if (sos < 0) {
    return true;
  }
  if (
    swLastSignificantKeyword(f, sos - 1, SW_EX_AS | SW_EX_IS | SW_EX_TRY | SW_EX_VAR | SW_EX_LET | SW_EX_CASE) !== "if"
  ) {
    return true;
  }
  return false;
};

/** isSubscriptOrFunctionCall(at:). */
export const swIsSubscriptOrFunctionCall = (f: SwFormatter, i: i32): boolean => {
  if (!(f.tok(i, SW_START, "[") || f.tok(i, SW_START, "("))) {
    return false;
  }
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
  if (p < 0) {
    return false;
  }
  const pk = f.k(p);
  const ps = f.s(p);
  if (
    pk === SW_IDENT ||
    (pk === SW_OP && f.a(p) === SW_OP_POSTFIX) ||
    (pk === SW_END && (ps === "]" || ps === ")" || ps === ">" || ps === "}" || swIsStringDelimiter(pk, ps)))
  ) {
    return true;
  }
  if (pk === SW_KEYWORD && swStrIsMacro(ps)) {
    return f.s(i) === "(";
  }
  return false;
};

// MARK: conditional branches

export class SwBranches {
  starts: i32[];
  ends: i32[];
  constructor() {
    this.starts = [];
    this.ends = [];
  }
}

/** startOfConditionalBranchBody(after:), or -1. */
export const swStartOfConditionalBranchBody = (f: SwFormatter, index: i32): i32 => {
  const s = f.indexOfAfter(SW_START, "{", 0, index);
  if (s < 0) {
    return -1;
  }
  if (swIsStartOfClosure(f, s)) {
    const e = swEndOfScope(f, s);
    if (e >= 0) {
      return swStartOfConditionalBranchBody(f, e);
    }
  }
  return s;
};

const swIfStatementBranches = (f: SwFormatter, ifIndex: i32): SwBranches => {
  const b = new SwBranches();
  let next = ifIndex;
  while (next >= 0 && (next === ifIndex || f.kw(next, "else"))) {
    const sb = swStartOfConditionalBranchBody(f, next);
    if (sb < 0) {
      break;
    }
    const eb = swEndOfScope(f, sb);
    if (eb < 0) {
      break;
    }
    b.starts.push(sb);
    b.ends.push(eb);
    if (next > ifIndex && !swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, next, SW_KEYWORD, "if")) {
      break;
    }
    next = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eb);
  }
  return b;
};

const swScanIfdefEnd = (f: SwFormatter, ifIndex: i32, containsCase: boolean[]): i32 => {
  let depth = 1;
  // Only brace === 0 is asked, so it counts modulo 2^32.
  let brace: u32 = 0;
  const n = f.count();
  if (ifIndex >= n) {
    return -1;
  }
  for (let i = ifIndex + 1; i < n; i++) {
    const k = f.k(i);
    const s = f.s(i);
    if (k === SW_START && s === "#if") {
      // depth counts tokens, far below 2^31.
      if (depth < 2147483647) {
        depth++;
      }
    } else if (k === SW_END && s === "#endif") {
      // depth is at least 1 here: it returns at 0.
      if (depth > 0) {
        depth--;
      }
      if (depth === 0) {
        return i;
      }
    } else if (k === SW_START && (s === "{" || s === "(" || s === "[")) {
      if (depth === 1) {
        brace = brace + toU32(1);
      }
    } else if (k === SW_END && (s === "}" || s === ")" || s === "]")) {
      if (depth === 1) {
        brace = brace - toU32(1);
      }
    } else if (
      depth === 1 &&
      brace === toU32(0) &&
      ((k === SW_END && (s === "case" || s === "default")) || (k === SW_KEYWORD && s === "@unknown"))
    ) {
      if (containsCase.length > 0) {
        containsCase[0] = true;
      }
    }
  }
  return -1;
};

const swFirstIfdefBoundary = (f: SwFormatter, start: i32, end: i32): i32 => {
  // Only brace === 0 is asked, so it counts modulo 2^32.
  let brace: u32 = 0;
  if (start >= end) {
    return -1;
  }
  let i = start + 1;
  while (i < end) {
    const k = f.k(i);
    const s = f.s(i);
    if (k === SW_START && (s === "{" || s === "(" || s === "[")) {
      brace = brace + toU32(1);
    } else if (k === SW_END && (s === "}" || s === ")" || s === "]")) {
      brace = brace - toU32(1);
    } else if (k === SW_START && s === "#if" && brace === toU32(0)) {
      const cc: boolean[] = [false];
      const e = swScanIfdefEnd(f, i, cc);
      if (e >= 0) {
        if (cc.length > 0 && cc[0]) {
          return i;
        }
        i = e;
        if (i >= end) {
          break;
        }
      }
    } else if (
      (k === SW_KEYWORD && (s === "#else" || s === "#elseif")) ||
      (k === SW_END && s === "#endif" && brace === toU32(0))
    ) {
      return i;
    }
    i++;
  }
  return -1;
};

const swIsCaseOrDefault = (f: SwFormatter, i: i32): boolean =>
  (f.k(i) === SW_END && (f.s(i) === "case" || f.s(i) === "default")) || f.kw(i, "@unknown");

export const swSwitchStatementBranches = (f: SwFormatter, switchIndex: i32): SwBranches | null => {
  const sss = f.indexOfAfter(SW_START, "{", 0, switchIndex);
  if (sss < 0) {
    return null;
  }
  const ess = swEndOfScope(f, sss);
  if (ess < 0) {
    return null;
  }
  const cases: i32[] = [];
  let index = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sss);
  while (index >= 0 && index < ess) {
    const i = index;
    if (swIsCaseOrDefault(f, i)) {
      cases.push(i);
      if (f.kw(i, "@unknown")) {
        const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
        if (nx >= 0 && swIsCaseOrDefault(f, nx)) {
          index = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nx);
          continue;
        }
      }
      index = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    } else if (f.tok(i, SW_START, "{") || f.tok(i, SW_START, "(") || f.tok(i, SW_START, "[")) {
      const e = swEndOfScope(f, i);
      index = e < 0 ? -1 : f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, e);
    } else {
      index = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    }
  }
  if (cases.length === 0) {
    return null;
  }
  const b = new SwBranches();
  for (let o = 0; o < toI32(cases.length); o++) {
    let ci = cases[o];
    if (f.kw(ci, "@unknown")) {
      const ne = swEndOfScope(f, ci);
      if (ne < 0) {
        return null;
      }
      ci = ne;
    }
    const startOfBody = f.indexOfAfter(SW_START, ":", 0, ci);
    if (startOfBody < 0) {
      return null;
    }
    const eb = swEndOfScope(f, startOfBody);
    if (eb < 0) {
      return null;
    }
    let endOfBody = 0;
    if (o + 1 < toI32(cases.length)) {
      const nextCase = cases[o + 1];
      const bd = swFirstIfdefBoundary(f, startOfBody, nextCase);
      endOfBody = bd >= 0 ? bd : nextCase;
    } else {
      endOfBody = ess;
    }
    b.starts.push(startOfBody);
    b.ends.push(endOfBody);
  }
  return b;
};

/** conditionalBranches(at:). */
export const swConditionalBranches = (f: SwFormatter, index: i32): SwBranches | null => {
  if (f.kw(index, "await")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    return n >= 0 ? swConditionalBranches(f, n) : null;
  }
  if (f.kw(index, "try")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (n < 0) {
      return null;
    }
    if (swIsUnwrap(f, n)) {
      const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      if (m >= 0) {
        return swConditionalBranches(f, m);
      }
    }
    return swConditionalBranches(f, n);
  }
  if (f.kw(index, "if")) {
    return swIfStatementBranches(f, index);
  }
  if (f.kw(index, "switch")) {
    return swSwitchStatementBranches(f, index);
  }
  return null;
};

// MARK: widths

/** Character count (Swift's String.count: extended grapheme clusters) of `s`. */
export const swCharCount = (s: string): i32 => swGraphemeCount(s);

/** tokenLength (tabWidth is the indent width, 4): tabs in spaces, strings and comments count 4. */
export const swTokenLength = (f: SwFormatter, i: i32): i32 => {
  const k = f.k(i);
  if (k === SW_LINEBREAK) {
    return 0;
  }
  const s = f.s(i);
  if (k === SW_SPACE || k === SW_STRBODY || k === SW_COMMENT) {
    let n = swCharCount(s);
    for (let j = 0; j < toI32(s.length); j++) {
      if (s.charCodeAt(j) === 9) {
        n = add32(n, 3);
      }
    }
    return n;
  }
  return swCharCount(s);
};

/** The width of a space string. */
export const swSpaceWidth = (s: string): i32 => {
  let n = swCharCount(s);
  for (let j = 0; j < toI32(s.length); j++) {
    if (s.charCodeAt(j) === 9) {
      n = add32(n, 3);
    }
  }
  return n;
};

/** lineLength(from:upTo:) (assetLiteralWidth is visualWidth). */
export const swLineLengthFrom = (f: SwFormatter, start: i32, end: i32): i32 => {
  let length = 0;
  let index = start;
  while (index < end) {
    if (f.kw(index, "#colorLiteral") || f.kw(index, "#imageLiteral")) {
      const si = f.indexOfAfter(SW_START, "(", 0, index);
      const ei = si >= 0 ? swEndOfScope(f, si) : -1;
      if (ei >= 0) {
        length = add32(length, 2);
        index = add32(ei, 1);
        continue;
      }
    }
    length = add32(length, swTokenLength(f, index));
    index++;
  }
  return length;
};

export const swLineLengthUpTo = (f: SwFormatter, index: i32): i32 => swLineLengthFrom(f, f.startOfLine(index), index);

export const swLineLengthAt = (f: SwFormatter, index: i32): i32 => swLineLengthUpTo(f, f.endOfLine(index));

const swSpaces = (n: i32): string => {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(" ");
  }
  return parts.join("");
};

/** spaceEquivalentToWidth (smartTabs on, spaces). */
export const swSpaceEquivalentToWidth = (w: i32): string => swSpaces(w);

/** spaceEquivalentToTokens(from:upTo:). */
export const swSpaceEquivalentToTokens = (f: SwFormatter, start: i32, end: i32): string => {
  const parts: string[] = [];
  let index = start;
  while (index < end) {
    const k = f.k(index);
    if (k === SW_SPACE) {
      parts.push(f.s(index));
    } else if (f.kw(index, "#colorLiteral") || f.kw(index, "#imageLiteral")) {
      const si = f.indexOfAfter(SW_START, "(", 0, index);
      const ei = si >= 0 ? swEndOfScope(f, si) : -1;
      if (ei >= 0) {
        const after = add32(ei, 1);
        parts.push(swSpaces(swLineLengthFrom(f, index, after)));
        index = after;
        continue;
      }
      parts.push(swSpaces(swTokenLength(f, index)));
    } else {
      parts.push(swSpaces(swTokenLength(f, index)));
    }
    index++;
  }
  return parts.join("");
};

/** The leading whitespace of a string body at the start of the line (stringBodyIndent). */
export const swStringBodyIndent = (f: SwFormatter, i: i32): string => {
  const start = f.startOfLine(i);
  const index = f.indexInType(SW_T_NON_SPACE, start, i);
  if (index >= 0 && f.k(index) === SW_STRBODY) {
    const s = f.s(index);
    let j = 0;
    const n = toI32(s.length);
    while (j >= 0 && j < n && j < s.length) {
      const c = s.charCodeAt(j);
      const cp = c < 0x80 ? c : swCpAtStr(s, j);
      if (!swCpIsSpace(cp)) {
        break;
      }
      if (c < 0x80) {
        j = j + 1;
      } else if (c < 0xe0) {
        j = add32(j, 2);
      } else if (c < 0xf0) {
        j = add32(j, 3);
      } else {
        j = add32(j, 4);
      }
    }
    return s.substring(0, j);
  }
  return "";
};

/** linewrapIndent(at:). */
export const swLinewrapIndent = (f: SwFormatter, index: i32): string => {
  const commaIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, add32(index, 1));
  let ok = commaIndex >= 0 && f.tok(commaIndex, SW_DELIM, ",");
  let firstToken = -1;
  let firstNonBrace = -1;
  if (ok) {
    firstToken = f.startOfLine(commaIndex, true);
    for (let j = firstToken; j < commaIndex; j++) {
      if (f.k(j) !== SW_END && !swIsSpaceOrComment(f, j)) {
        firstNonBrace = j;
        break;
      }
    }
    ok = firstNonBrace >= 0;
  }
  if (!ok) {
    const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (nx >= 0 && f.op(nx, ".", SW_OP_INFIX)) {
      let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, index);
      if (prevIndex >= 0) {
        if (f.k(prevIndex) === SW_END) {
          const s = f.indexBefore(SW_T_START_OF_SCOPE, index);
          if (s >= 0) {
            prevIndex = s;
          }
        }
        const lineStart = f.startOfLine(prevIndex, true);
        let ss = f.indexBefore(SW_T_START_OF_SCOPE, index);
        if (ss < 0) {
          ss = -1;
        }
        if (f.op(lineStart, ".", SW_OP_INFIX) && ss < lineStart) {
          return f.currentIndentForLine(lineStart);
        }
      }
    }
    return "    ";
  }
  if (
    f.k(firstToken) === SW_END &&
    swNextIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sub32(firstNonBrace, 1), SW_DELIM, ",")
  ) {
    return "";
  }
  let keywordIndex = swLastIndexInWhere(
    f,
    firstNonBrace,
    commaIndex,
    (g, j) => g.kw(j, "if") || g.kw(j, "guard") || g.kw(j, "while"),
  );
  if (keywordIndex < 0) {
    keywordIndex = swLastIndexInWhere(
      f,
      firstNonBrace,
      commaIndex,
      (g, j) => g.kw(j, "let") || g.kw(j, "var") || g.kw(j, "case"),
    );
  }
  if (keywordIndex < 0) {
    return "    ";
  }
  const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE, keywordIndex);
  if (nextTokenIndex < 0) {
    return "    ";
  }
  return swSpaceEquivalentToTokens(f, firstToken, nextTokenIndex);
};

/** Whether tokens [lo, hi) contain a linebreak. */
export const swHasLinebreak = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.k(j) === SW_LINEBREAK) {
      return true;
    }
  }
  return false;
};
