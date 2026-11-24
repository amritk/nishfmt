// SwiftFormat's Token: a kind, the token's text and one extra number (the
// operator or number type, or a linebreak's original line), held as three
// parallel arrays in SwTokList. The predicates mirror Token's in
// Tokenizer.swift.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";

// Token kinds (Token's cases).
export const SW_NUMBER: i32 = 0;
export const SW_LINEBREAK: i32 = 1;
export const SW_START: i32 = 2;
export const SW_END: i32 = 3;
export const SW_DELIM: i32 = 4;
export const SW_OP: i32 = 5;
export const SW_STRBODY: i32 = 6;
export const SW_KEYWORD: i32 = 7;
export const SW_IDENT: i32 = 8;
export const SW_SPACE: i32 = 9;
export const SW_COMMENT: i32 = 10;
export const SW_ERROR: i32 = 11;

// OperatorType.
export const SW_OP_NONE: i32 = 0;
export const SW_OP_INFIX: i32 = 1;
export const SW_OP_PREFIX: i32 = 2;
export const SW_OP_POSTFIX: i32 = 3;

// NumberType.
export const SW_NUM_INTEGER: i32 = 0;
export const SW_NUM_DECIMAL: i32 = 1;
export const SW_NUM_BINARY: i32 = 2;
export const SW_NUM_OCTAL: i32 = 3;
export const SW_NUM_HEX: i32 = 4;

// TokenType.
export const SW_T_SPACE: i32 = 0;
export const SW_T_COMMENT: i32 = 1;
export const SW_T_LINEBREAK: i32 = 2;
export const SW_T_END_OF_STATEMENT: i32 = 3;
export const SW_T_START_OF_SCOPE: i32 = 4;
export const SW_T_END_OF_SCOPE: i32 = 5;
export const SW_T_KEYWORD: i32 = 6;
export const SW_T_DELIMITER: i32 = 7;
export const SW_T_IDENTIFIER: i32 = 8;
export const SW_T_ATTRIBUTE: i32 = 9;
export const SW_T_OPERATOR: i32 = 10;
export const SW_T_UNWRAP_OPERATOR: i32 = 11;
export const SW_T_RANGE_OPERATOR: i32 = 12;
export const SW_T_NUMBER: i32 = 13;
export const SW_T_ERROR: i32 = 14;
export const SW_T_SPACE_OR_COMMENT: i32 = 15;
export const SW_T_SPACE_OR_LINEBREAK: i32 = 16;
export const SW_T_SPACE_OR_COMMENT_OR_LINEBREAK: i32 = 17;
export const SW_T_KEYWORD_OR_ATTRIBUTE: i32 = 18;
export const SW_T_IDENTIFIER_OR_KEYWORD: i32 = 19;
export const SW_T_NON_SPACE: i32 = 20;
export const SW_T_NON_LINEBREAK: i32 = 21;
export const SW_T_NON_SPACE_OR_COMMENT: i32 = 22;
export const SW_T_NON_SPACE_OR_LINEBREAK: i32 = 23;
export const SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK: i32 = 24;

/** A token value, for building runs of tokens to insert. */
export class SwTok {
  s: string;
  k: i32;
  a: i32;
  constructor(k: i32, s: string, a: i32) {
    this.k = k;
    this.s = s;
    this.a = a;
  }
}

/** Moves `xs[i, n - m)` up to `[i + m, n)`, `n` the length (the caller pushed `m` slots). */
const swMoveUp = <T>(xs: T[], i: i32, m: i32): void => {
  const n = toI32(xs.length);
  if (i < 0 || m < 0 || m > n) {
    fault();
    return;
  }
  for (let d = n - 1; d >= 0 && d < xs.length; d--) {
    const s = d - m;
    if (s < i || s < 0 || s >= xs.length) {
      break;
    }
    xs[d] = xs[s];
  }
};

/** Moves `xs[i + m, n)` down to `[i, n - m)`, `n` the length (the caller then pops `m`). */
const swMoveDown = <T>(xs: T[], i: i32, m: i32): void => {
  const n = toI32(xs.length);
  if (i < 0 || m < 0 || m > n) {
    fault();
    return;
  }
  if (i >= n - m) {
    return;
  }
  // i < n - m, so i + m < n.
  let s = toI32(toU32(i) + toU32(m));
  for (let d = i; d >= 0 && d < xs.length && s >= 0 && s < xs.length; d++) {
    xs[d] = xs[s];
    s++;
  }
};

/** Pops `m` elements; fewer than `m` faults (pop on an empty array panicked). */
const swPopN = <T>(xs: T[], m: i32): void => {
  for (let x = 0; x < m; x++) {
    if (xs.length > 0) {
      xs.pop();
    } else {
      fault();
      return;
    }
  }
};

/** xs.pop() for a stack the caller knows is not empty; an empty one faults (pop panicked). */
export const swPopLast = <T>(xs: T[]): void => {
  if (xs.length > 0) {
    xs.pop();
  } else {
    fault();
  }
};

/** Pops down to `n` (>= 0) elements. */
const swTruncate = <T>(xs: T[], n: i32): void => {
  while (xs.length > n && xs.length > 0) {
    xs.pop();
  }
};

/** The token list: kinds, strings and aux values, with cheap edits at the end; `c` holds each
 *  token's scope code (swScopeCode), so scope-aware scans compare integers. The four arrays
 *  always have one length. */
export class SwTokList {
  k: i32[];
  s: string[];
  a: i32[];
  c: i32[];

  constructor() {
    this.k = [];
    this.s = [];
    this.a = [];
    this.c = [];
  }

  count(): i32 {
    return toI32(this.k.length);
  }

  /** The kind of token i; outside the list faults and answers -1. */
  kAt(i: i32): i32 {
    const tk = this.k;
    if (i >= 0 && i < tk.length) {
      return tk[i];
    }
    fault();
    return -1;
  }

  /** The string of token i; outside the list faults and answers "". */
  sAt(i: i32): string {
    const ts = this.s;
    if (i >= 0 && i < ts.length) {
      return ts[i];
    }
    fault();
    return "";
  }

  /** The aux value of token i; outside the list faults and answers 0. */
  aAt(i: i32): i32 {
    const ta = this.a;
    if (i >= 0 && i < ta.length) {
      return ta[i];
    }
    fault();
    return 0;
  }

  push(k: i32, s: string, a: i32): void {
    this.k.push(k);
    this.s.push(s);
    this.a.push(a);
    this.c.push(swScopeCode(k, s));
  }

  set(i: i32, k: i32, s: string, a: i32): void {
    const code = swScopeCode(k, s);
    const tk = this.k;
    const ts = this.s;
    const ta = this.a;
    const tc = this.c;
    if (i >= 0 && i < tk.length && i < ts.length && i < ta.length && i < tc.length) {
      tk[i] = k;
      ts[i] = s;
      ta[i] = a;
      tc[i] = code;
    } else {
      fault();
    }
  }

  insertAt(i: i32, k: i32, s: string, a: i32): void {
    const n = toI32(this.k.length);
    this.k.push(0);
    this.s.push("");
    this.a.push(0);
    this.c.push(0);
    if (i < 0 || i > n) {
      fault();
      return;
    }
    swMoveUp(this.k, i, 1);
    swMoveUp(this.s, i, 1);
    swMoveUp(this.a, i, 1);
    swMoveUp(this.c, i, 1);
    this.set(i, k, s, a);
  }

  /** Inserts `m` copies of nothing at `i` (filled by the caller with set). */
  openGap(i: i32, m: i32): void {
    const n = toI32(this.k.length);
    for (let j = 0; j < m; j++) {
      this.k.push(0);
      this.s.push("");
      this.a.push(0);
      this.c.push(0);
    }
    if (i >= n) {
      return;
    }
    swMoveUp(this.k, i, m);
    swMoveUp(this.s, i, m);
    swMoveUp(this.a, i, m);
    swMoveUp(this.c, i, m);
  }

  removeAt(i: i32): void {
    swMoveDown(this.k, i, 1);
    swMoveDown(this.s, i, 1);
    swMoveDown(this.a, i, 1);
    swMoveDown(this.c, i, 1);
    swPopN(this.k, 1);
    swPopN(this.s, 1);
    swPopN(this.a, 1);
    swPopN(this.c, 1);
  }

  /** Removes [i, j). */
  removeRange(i: i32, j: i32): void {
    if (j <= i) {
      return;
    }
    if (i < 0) {
      fault();
      return;
    }
    // 0 <= i < j, so the difference fits.
    const m = toI32(toU32(j) - toU32(i));
    swMoveDown(this.k, i, m);
    swMoveDown(this.s, i, m);
    swMoveDown(this.a, i, m);
    swMoveDown(this.c, i, m);
    swPopN(this.k, m);
    swPopN(this.s, m);
    swPopN(this.a, m);
    swPopN(this.c, m);
  }

  truncate(n: i32): void {
    if (n < 0) {
      fault();
      return;
    }
    swTruncate(this.k, n);
    swTruncate(this.s, n);
    swTruncate(this.a, n);
    swTruncate(this.c, n);
  }

  copy(): SwTokList {
    const t = new SwTokList();
    t.k = this.k.map((x) => x);
    t.s = this.s.map((x) => x);
    t.a = this.a.map((x) => x);
    t.c = this.c.map((x) => x);
    return t;
  }
}

/** swiftKeywords (Any, Self, self, super, nil, true and false are identifiers). */
export const swIsSwiftKeyword = (s: string): boolean => {
  const n = toI32(s.length);
  if (n < 2 || n > 15) {
    return false;
  }
  switch (n) {
    case 2:
      return s === "if" || s === "as" || s === "in" || s === "do" || s === "is";
    case 3:
      return s === "let" || s === "var" || s === "try" || s === "for";
    case 4:
      return s === "func" || s === "else" || s === "case" || s === "init" || s === "enum";
    case 5:
      return (
        s === "class" ||
        s === "guard" ||
        s === "catch" ||
        s === "throw" ||
        s === "where" ||
        s === "break" ||
        s === "while" ||
        s === "inout" ||
        s === "defer" ||
        s === "await"
      );
    case 6:
      return (
        s === "return" ||
        s === "public" ||
        s === "import" ||
        s === "static" ||
        s === "switch" ||
        s === "struct" ||
        s === "throws" ||
        s === "deinit" ||
        s === "repeat"
      );
    case 7:
      return s === "private" || s === "default" || s === "consume" || s === "discard";
    case 8:
      return s === "internal" || s === "continue" || s === "operator" || s === "rethrows" || s === "protocol";
    case 9:
      return s === "extension" || s === "typealias" || s === "subscript";
    case 11:
      return s === "fileprivate" || s === "fallthrough";
    case 14:
      return s === "associatedtype";
    case 15:
      return s === "precedencegroup";
    default:
      return false;
  }
};

/** String.isKeywordInTypeContext. */
export const swIsKeywordInTypeContext = (s: string): boolean =>
  s === "borrowing" ||
  s === "consuming" ||
  s === "isolated" ||
  s === "sending" ||
  s === "some" ||
  s === "any" ||
  s === "of";

/** String.isMacro: starts with `#` and is not a conditional compilation directive. */
export const swStrIsMacro = (s: string): boolean =>
  s.startsWith("#") && s !== "#if" && s !== "#elseif" && s !== "#else" && s !== "#endif";

export const swStrIsAttribute = (s: string): boolean => s.startsWith("@");

export const swStrIsMacroOrAttribute = (s: string): boolean => swStrIsMacro(s) || swStrIsAttribute(s);

/** Token.isComment. */
export const swKindIsComment = (k: i32, s: string): boolean =>
  k === SW_COMMENT || (k === SW_START && (s === "//" || s === "/*")) || (k === SW_END && s === "*/");

/** Token.is(type). */
export const swTokIs = (k: i32, s: string, a: i32, type: i32): boolean => {
  switch (type) {
    case SW_T_SPACE:
      return k === SW_SPACE;
    case SW_T_COMMENT:
      return swKindIsComment(k, s);
    case SW_T_SPACE_OR_COMMENT:
      return k === SW_SPACE || swKindIsComment(k, s);
    case SW_T_SPACE_OR_LINEBREAK:
      return k === SW_SPACE || k === SW_LINEBREAK;
    case SW_T_SPACE_OR_COMMENT_OR_LINEBREAK:
      return k === SW_SPACE || k === SW_LINEBREAK || swKindIsComment(k, s);
    case SW_T_LINEBREAK:
      return k === SW_LINEBREAK;
    case SW_T_END_OF_STATEMENT:
      return k === SW_LINEBREAK || (k === SW_DELIM && s === ";");
    case SW_T_START_OF_SCOPE:
      return k === SW_START;
    case SW_T_END_OF_SCOPE:
      return k === SW_END;
    case SW_T_KEYWORD:
      return k === SW_KEYWORD && !s.startsWith("@");
    case SW_T_KEYWORD_OR_ATTRIBUTE:
      return k === SW_KEYWORD;
    case SW_T_IDENTIFIER:
      return k === SW_IDENT;
    case SW_T_IDENTIFIER_OR_KEYWORD:
      return k === SW_IDENT || k === SW_KEYWORD;
    case SW_T_ATTRIBUTE:
      return k === SW_KEYWORD && s.startsWith("@");
    case SW_T_DELIMITER:
      return k === SW_DELIM;
    case SW_T_OPERATOR:
      return k === SW_OP;
    case SW_T_UNWRAP_OPERATOR:
      return k === SW_OP && a === SW_OP_POSTFIX && (s === "?" || s === "!");
    case SW_T_RANGE_OPERATOR:
      return k === SW_OP && (s === "..." || s === "..<");
    case SW_T_NUMBER:
      return k === SW_NUMBER;
    case SW_T_ERROR:
      return k === SW_ERROR;
    case SW_T_NON_SPACE:
      return k !== SW_SPACE;
    case SW_T_NON_LINEBREAK:
      return k !== SW_LINEBREAK;
    case SW_T_NON_SPACE_OR_COMMENT:
      return !(k === SW_SPACE || swKindIsComment(k, s));
    case SW_T_NON_SPACE_OR_LINEBREAK:
      return !(k === SW_SPACE || k === SW_LINEBREAK);
    case SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK:
      return !(k === SW_SPACE || k === SW_LINEBREAK || swKindIsComment(k, s));
    default:
      return false;
  }
};

/** Token.stringDelimiterType, packed: -1 for none, else hashCount*4 + multiline*2 + regex. */
export const swStringDelimiterType = (k: i32, s: string): i32 => {
  if (k !== SW_START && k !== SW_END) {
    return -1;
  }
  let quotes = 0;
  let hashes = 0;
  let slashes = 0;
  const n = toI32(s.length);
  // Each count is at most i, below n.
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 35) {
      if (hashes < n) {
        hashes++;
      }
    } else if (c === 34) {
      if (quotes < n) {
        quotes++;
      }
    } else if (c === 47) {
      if (slashes < n) {
        slashes++;
      }
    } else {
      return -1;
    }
  }
  const regex = slashes === 1;
  if (!(quotes > 0 || regex)) {
    return -1;
  }
  if (hashes < 0 || hashes >= 0x20000000) {
    fault();
    return -1;
  }
  // hashes * 4 + multi * 2 + regex, the low bits free below 2^31.
  let r = hashes << 2;
  if (quotes === 3 || (regex && hashes > 0)) {
    r = r | 2;
  }
  if (regex) {
    r = r | 1;
  }
  return r;
};

/** Token.isStringDelimiter. */
export const swIsStringDelimiter = (k: i32, s: string): boolean => {
  if (k !== SW_START && k !== SW_END) {
    return false;
  }
  if (s.indexOf('"') >= 0 || s === "/") {
    return true;
  }
  const n = toI32(s.length);
  if (n <= 0 || n > s.length) {
    return false;
  }
  const last = s.charCodeAt(n - 1);
  if (last === 35) {
    return true;
  }
  return last === 47 && s.length > 0 && s.charCodeAt(0) === 35;
};

/** Token.isMultilineStringDelimiter. */
export const swIsMultilineStringDelimiter = (k: i32, s: string): boolean => {
  const t = swStringDelimiterType(k, s);
  return t >= 0 && (t & 2) !== 0;
};

/** Token.isEndOfScope(scope): whether the token (k, s) closes the scope token (sk, ss, sa). */
export const swIsEndOfScopeOf = (k: i32, s: string, sk: i32, ss: string, sa: i32): boolean => {
  if (k === SW_END) {
    if (sk !== SW_START) {
      return false;
    }
    if (ss === "(") {
      return s === ")";
    }
    if (ss === "[") {
      return s === "]";
    }
    if (ss === "<") {
      return s === ">";
    }
    if (ss === "{" || ss === ":") {
      return s === "}" || s === "case" || s === "default";
    }
    if (ss === "/*") {
      return s === "*/";
    }
    if (ss === "#if") {
      return s === "#endif";
    }
    const t = swStringDelimiterType(sk, ss);
    if (t >= 0) {
      const quotes = (t & 1) !== 0 ? "/" : (t & 2) !== 0 ? '"""' : '"';
      const h = t >> 2;
      const ql = toI32(quotes.length);
      // h is at most 2^29 and ql at most 3: the sum fits.
      if (toI32(s.length) !== toI32(toU32(ql) + toU32(h)) || !s.startsWith(quotes)) {
        return false;
      }
      for (let i = ql; i >= 0 && i < s.length; i++) {
        if (s.charCodeAt(i) !== 35) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  if (k === SW_LINEBREAK) {
    return sk === SW_START && (ss === "//" || ss === "#!");
  }
  if ((k === SW_DELIM || k === SW_START) && s === ":") {
    return (sk === SW_END && (ss === "case" || ss === "default")) || (sk === SW_OP && ss === "?" && sa === SW_OP_INFIX);
  }
  return false;
};

/** Token.isLvalue. */
export const swIsLvalue = (k: i32, s: string, a: i32): boolean => {
  if (k === SW_IDENT || k === SW_NUMBER) {
    return true;
  }
  if (k === SW_OP) {
    return a === SW_OP_POSTFIX;
  }
  if (k === SW_END) {
    return s === ")" || s === "]" || s === "}" || s === ">" || swIsStringDelimiter(k, s);
  }
  if (k === SW_KEYWORD) {
    return s.startsWith("#");
  }
  return false;
};

/** Token.isRvalue. */
export const swIsRvalue = (k: i32, s: string, a: i32): boolean => {
  if (k === SW_OP) {
    return !(a === SW_OP_INFIX || a === SW_OP_POSTFIX);
  }
  if (k === SW_IDENT || k === SW_NUMBER) {
    return true;
  }
  if (k === SW_START) {
    return s === "(" || s === "[" || s === "{" || swIsStringDelimiter(k, s);
  }
  if (k === SW_KEYWORD) {
    return s.startsWith("#");
  }
  return false;
};

/** Token.isSwitchCaseOrDefault. */
export const swIsSwitchCaseOrDefault = (k: i32, s: string): boolean =>
  (k === SW_END && (s === "case" || s === "default")) || (k === SW_KEYWORD && s === "@unknown");

// Scope codes (SwTokList.c): what a scope-aware scan needs to know about a token.
export const SW_SC_OTHER: i32 = 0;
export const SW_SC_PAREN: i32 = 1;
export const SW_SC_BRACKET: i32 = 2;
export const SW_SC_ANGLE: i32 = 3;
export const SW_SC_BRACE: i32 = 4;
export const SW_SC_COLON: i32 = 5;
export const SW_SC_BLOCK_COMMENT: i32 = 6;
export const SW_SC_IF: i32 = 7;
export const SW_SC_LINE_COMMENT: i32 = 8;
export const SW_SC_HASHBANG: i32 = 9;
export const SW_SC_START_OTHER: i32 = 10;
export const SW_SC_END_PAREN: i32 = 21;
export const SW_SC_END_BRACKET: i32 = 22;
export const SW_SC_END_ANGLE: i32 = 23;
export const SW_SC_END_BRACE: i32 = 24;
export const SW_SC_CASE: i32 = 25;
export const SW_SC_DEFAULT: i32 = 26;
export const SW_SC_END_BLOCK_COMMENT: i32 = 27;
export const SW_SC_ENDIF: i32 = 28;
export const SW_SC_END_OTHER: i32 = 30;
export const SW_SC_LINEBREAK: i32 = 40;
export const SW_SC_DELIM_COLON: i32 = 41;
export const SW_SC_KEYWORD: i32 = 50;
export const SW_SC_ATTRIBUTE: i32 = 51;

/** The scope code of a token. */
export const swScopeCode = (k: i32, s: string): i32 => {
  if (k === SW_START) {
    if (s === "(") {
      return SW_SC_PAREN;
    }
    if (s === "[") {
      return SW_SC_BRACKET;
    }
    if (s === "<") {
      return SW_SC_ANGLE;
    }
    if (s === "{") {
      return SW_SC_BRACE;
    }
    if (s === ":") {
      return SW_SC_COLON;
    }
    if (s === "/*") {
      return SW_SC_BLOCK_COMMENT;
    }
    if (s === "#if") {
      return SW_SC_IF;
    }
    if (s === "//") {
      return SW_SC_LINE_COMMENT;
    }
    if (s === "#!") {
      return SW_SC_HASHBANG;
    }
    return SW_SC_START_OTHER;
  }
  if (k === SW_END) {
    if (s === ")") {
      return SW_SC_END_PAREN;
    }
    if (s === "]") {
      return SW_SC_END_BRACKET;
    }
    if (s === ">") {
      return SW_SC_END_ANGLE;
    }
    if (s === "}") {
      return SW_SC_END_BRACE;
    }
    if (s === "case") {
      return SW_SC_CASE;
    }
    if (s === "default") {
      return SW_SC_DEFAULT;
    }
    if (s === "*/") {
      return SW_SC_END_BLOCK_COMMENT;
    }
    if (s === "#endif") {
      return SW_SC_ENDIF;
    }
    return SW_SC_END_OTHER;
  }
  if (k === SW_LINEBREAK) {
    return SW_SC_LINEBREAK;
  }
  if (k === SW_DELIM && s === ":") {
    return SW_SC_DELIM_COLON;
  }
  if (k === SW_KEYWORD) {
    return s.startsWith("@") ? SW_SC_ATTRIBUTE : SW_SC_KEYWORD;
  }
  return SW_SC_OTHER;
};

/** tokens[end].isEndOfScope(tokens[start]) from scope codes; falls back to the strings for
 *  string delimiters and `?` / `case` colons. */
export const swClosesByCode = (t: SwTokList, end: i32, start: i32): boolean => {
  const tc = t.c;
  if (end < 0 || end >= tc.length || start < 0 || start >= tc.length) {
    fault();
    return false;
  }
  const ce = tc[end];
  const cs = tc[start];
  if (ce >= SW_SC_END_PAREN && ce <= SW_SC_ENDIF) {
    if (cs === SW_SC_START_OTHER) {
      return false;
    }
    if (ce === SW_SC_END_PAREN) {
      return cs === SW_SC_PAREN;
    }
    if (ce === SW_SC_END_BRACKET) {
      return cs === SW_SC_BRACKET;
    }
    if (ce === SW_SC_END_ANGLE) {
      return cs === SW_SC_ANGLE;
    }
    if (ce === SW_SC_END_BRACE || ce === SW_SC_CASE || ce === SW_SC_DEFAULT) {
      return cs === SW_SC_BRACE || cs === SW_SC_COLON;
    }
    if (ce === SW_SC_END_BLOCK_COMMENT) {
      return cs === SW_SC_BLOCK_COMMENT;
    }
    return cs === SW_SC_IF;
  }
  if (ce === SW_SC_LINEBREAK) {
    return cs === SW_SC_LINE_COMMENT || cs === SW_SC_HASHBANG;
  }
  if (ce === SW_SC_OTHER || ce === SW_SC_KEYWORD || ce === SW_SC_ATTRIBUTE) {
    return false;
  }
  if (ce >= SW_SC_PAREN && ce <= SW_SC_START_OTHER && ce !== SW_SC_COLON) {
    return false;
  }
  const tk = t.k;
  const ts = t.s;
  const ta = t.a;
  if (end >= tk.length || end >= ts.length || start >= tk.length || start >= ts.length || start >= ta.length) {
    fault();
    return false;
  }
  return swIsEndOfScopeOf(tk[end], ts[end], tk[start], ts[start], ta[start]);
};

/** tokens[i].is(type), reading the scope code for comment, keyword and attribute tests. */
export const swTokIsAt = (t: SwTokList, i: i32, type: i32): boolean => {
  const tk = t.k;
  const tc = t.c;
  if (i < 0 || i >= tk.length || i >= tc.length) {
    fault();
    return false;
  }
  const k = tk[i];
  if (type === SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK) {
    if (k === SW_SPACE || k === SW_LINEBREAK || k === SW_COMMENT) {
      return false;
    }
    const c = tc[i];
    return !(c === SW_SC_LINE_COMMENT || c === SW_SC_BLOCK_COMMENT || c === SW_SC_END_BLOCK_COMMENT);
  }
  if (type === SW_T_NON_SPACE) {
    return k !== SW_SPACE;
  }
  if (type === SW_T_START_OF_SCOPE) {
    return k === SW_START;
  }
  if (type === SW_T_LINEBREAK) {
    return k === SW_LINEBREAK;
  }
  if (type === SW_T_KEYWORD) {
    return tc[i] === SW_SC_KEYWORD;
  }
  if (type === SW_T_NON_SPACE_OR_COMMENT) {
    if (k === SW_SPACE || k === SW_COMMENT) {
      return false;
    }
    const c = tc[i];
    return !(c === SW_SC_LINE_COMMENT || c === SW_SC_BLOCK_COMMENT || c === SW_SC_END_BLOCK_COMMENT);
  }
  if (type === SW_T_NON_SPACE_OR_LINEBREAK) {
    return !(k === SW_SPACE || k === SW_LINEBREAK);
  }
  if (type === SW_T_NON_LINEBREAK) {
    return k !== SW_LINEBREAK;
  }
  const ts = t.s;
  const ta = t.a;
  if (i >= ts.length || i >= ta.length) {
    fault();
    return false;
  }
  return swTokIs(k, ts[i], ta[i], type);
};
