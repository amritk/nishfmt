// SwiftFormat's Token: a kind, the token's text and one extra number (the
// operator or number type, or a linebreak's original line), held as three
// parallel arrays in SwTokList. The predicates mirror Token's in
// Tokenizer.swift.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

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

/** The token list: kinds, strings and aux values, with cheap edits at the end. */
export class SwTokList {
  k: i32[];
  s: string[];
  a: i32[];

  constructor() {
    this.k = [];
    this.s = [];
    this.a = [];
  }

  count(): i32 {
    return toI32(this.k.length);
  }

  push(k: i32, s: string, a: i32): void {
    this.k.push(k);
    this.s.push(s);
    this.a.push(a);
  }

  set(i: i32, k: i32, s: string, a: i32): void {
    this.k[i] = k;
    this.s[i] = s;
    this.a[i] = a;
  }

  insertAt(i: i32, k: i32, s: string, a: i32): void {
    const n = toI32(this.k.length);
    this.k.push(0);
    this.s.push("");
    this.a.push(0);
    for (let j = n; j > i; j--) {
      this.k[j] = this.k[j - 1];
      this.s[j] = this.s[j - 1];
      this.a[j] = this.a[j - 1];
    }
    this.k[i] = k;
    this.s[i] = s;
    this.a[i] = a;
  }

  /** Inserts `m` copies of nothing at `i` (filled by the caller). */
  openGap(i: i32, m: i32): void {
    const n = toI32(this.k.length);
    for (let j = 0; j < m; j++) {
      this.k.push(0);
      this.s.push("");
      this.a.push(0);
    }
    for (let j = n - 1; j >= i; j--) {
      this.k[j + m] = this.k[j];
      this.s[j + m] = this.s[j];
      this.a[j + m] = this.a[j];
    }
  }

  removeAt(i: i32): void {
    const n = toI32(this.k.length);
    for (let j = i; j < n - 1; j++) {
      this.k[j] = this.k[j + 1];
      this.s[j] = this.s[j + 1];
      this.a[j] = this.a[j + 1];
    }
    this.k.pop();
    this.s.pop();
    this.a.pop();
  }

  /** Removes [i, j). */
  removeRange(i: i32, j: i32): void {
    const n = toI32(this.k.length);
    const m = j - i;
    if (m <= 0) {
      return;
    }
    for (let x = i; x < n - m; x++) {
      this.k[x] = this.k[x + m];
      this.s[x] = this.s[x + m];
      this.a[x] = this.a[x + m];
    }
    for (let x = 0; x < m; x++) {
      this.k.pop();
      this.s.pop();
      this.a.pop();
    }
  }

  truncate(n: i32): void {
    while (toI32(this.k.length) > n) {
      this.k.pop();
      this.s.pop();
      this.a.pop();
    }
  }

  copy(): SwTokList {
    const t = new SwTokList();
    t.k = this.k.slice(0, toI32(this.k.length));
    t.s = this.s.slice(0, toI32(this.s.length));
    t.a = this.a.slice(0, toI32(this.a.length));
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
        s === "class" || s === "guard" || s === "catch" || s === "throw" || s === "where" || s === "break" || s === "while" || s === "inout" || s === "defer" || s === "await"
      );
    case 6:
      return (
        s === "return" || s === "public" || s === "import" || s === "static" || s === "switch" || s === "struct" || s === "throws" || s === "deinit" || s === "repeat"
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
  s === "borrowing" || s === "consuming" || s === "isolated" || s === "sending" || s === "some" || s === "any" || s === "of";

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
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 35) {
      hashes++;
    } else if (c === 34) {
      quotes++;
    } else if (c === 47) {
      slashes++;
    } else {
      return -1;
    }
  }
  const regex = slashes === 1;
  if (!(quotes > 0 || regex)) {
    return -1;
  }
  const multi = quotes === 3 || (regex && hashes > 0);
  return hashes * 4 + (multi ? 2 : 0) + (regex ? 1 : 0);
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
  if (n === 0) {
    return false;
  }
  return s.charCodeAt(n - 1) === 35 || (s.charCodeAt(0) === 35 && s.charCodeAt(n - 1) === 47);
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
      if (toI32(s.length) !== ql + h || !s.startsWith(quotes)) {
        return false;
      }
      for (let i = ql; i < ql + h; i++) {
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
