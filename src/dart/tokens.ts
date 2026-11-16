// Token kinds and keywords for the Dart scanner, after the analyzer's
// TokenType and Keyword (_fe_analyzer_shared, BSD-3-Clause, Copyright the
// Dart project authors).

// Kinds.
export const T_BOF: i32 = 0;
export const T_EOF: i32 = 1;
export const T_IDENT: i32 = 2; // identifiers and keywords; see the keyword id
export const T_INT: i32 = 3;
export const T_DOUBLE: i32 = 4;
export const T_STRING: i32 = 5; // a string literal or one segment of one
export const T_INTERP_EXPR: i32 = 6; // `${`
export const T_INTERP_IDENT: i32 = 7; // `$`
export const T_SCRIPT: i32 = 8; // `#!...`
export const T_LPAREN: i32 = 10;
export const T_RPAREN: i32 = 11;
export const T_LBRACKET: i32 = 12;
export const T_RBRACKET: i32 = 13;
export const T_LBRACE: i32 = 14;
export const T_RBRACE: i32 = 15;
export const T_SEMI: i32 = 16;
export const T_COMMA: i32 = 17;
export const T_DOT: i32 = 18;
export const T_DOTDOT: i32 = 19;
export const T_ELLIPSIS: i32 = 20; // ...
export const T_ELLIPSIS_Q: i32 = 21; // ...?
export const T_QDOT: i32 = 22; // ?.
export const T_QDOTDOT: i32 = 23; // ?..
export const T_QUESTION: i32 = 24;
export const T_QQ: i32 = 25; // ??
export const T_QQ_EQ: i32 = 26; // ??=
export const T_COLON: i32 = 27;
export const T_EQ: i32 = 28;
export const T_EQEQ: i32 = 29;
export const T_NE: i32 = 30;
export const T_ARROW: i32 = 31; // =>
export const T_BANG: i32 = 32;
export const T_LT: i32 = 33;
export const T_LE: i32 = 34;
export const T_SHL: i32 = 35;
export const T_SHL_EQ: i32 = 36;
export const T_GT: i32 = 37;
export const T_GE: i32 = 38;
export const T_SHR: i32 = 39;
export const T_SHR_EQ: i32 = 40;
export const T_USHR: i32 = 41;
export const T_USHR_EQ: i32 = 42;
export const T_PLUS: i32 = 43;
export const T_PLUS_EQ: i32 = 44;
export const T_INC: i32 = 45;
export const T_MINUS: i32 = 46;
export const T_MINUS_EQ: i32 = 47;
export const T_DEC: i32 = 48;
export const T_STAR: i32 = 49;
export const T_STAR_EQ: i32 = 50;
export const T_SLASH: i32 = 51;
export const T_SLASH_EQ: i32 = 52;
export const T_TILDE_SLASH: i32 = 53;
export const T_TILDE_SLASH_EQ: i32 = 54;
export const T_PERCENT: i32 = 55;
export const T_PERCENT_EQ: i32 = 56;
export const T_AMP: i32 = 57;
export const T_AMP_EQ: i32 = 58;
export const T_AMPAMP: i32 = 59;
export const T_AMPAMP_EQ: i32 = 60;
export const T_BAR: i32 = 61;
export const T_BAR_EQ: i32 = 62;
export const T_BARBAR: i32 = 63;
export const T_BARBAR_EQ: i32 = 64;
export const T_CARET: i32 = 65;
export const T_CARET_EQ: i32 = 66;
export const T_TILDE: i32 = 67;
export const T_HASH: i32 = 68;
export const T_AT: i32 = 69;
export const T_INDEX: i32 = 70; // `[]` after `operator`
export const T_INDEX_EQ: i32 = 71; // `[]=` after `operator`
export const T_BACKTICK: i32 = 72;

// Keywords. Reserved words first, then built-in identifiers, then the
// contextual ones; dtIsReserved answers the first group.
export const K_NONE: i32 = 0;
export const K_ASSERT: i32 = 1;
export const K_BREAK: i32 = 2;
export const K_CASE: i32 = 3;
export const K_CATCH: i32 = 4;
export const K_CLASS: i32 = 5;
export const K_CONST: i32 = 6;
export const K_CONTINUE: i32 = 7;
export const K_DEFAULT: i32 = 8;
export const K_DO: i32 = 9;
export const K_ELSE: i32 = 10;
export const K_ENUM: i32 = 11;
export const K_EXTENDS: i32 = 12;
export const K_FALSE: i32 = 13;
export const K_FINAL: i32 = 14;
export const K_FINALLY: i32 = 15;
export const K_FOR: i32 = 16;
export const K_IF: i32 = 17;
export const K_IN: i32 = 18;
export const K_IS: i32 = 19;
export const K_NEW: i32 = 20;
export const K_NULL: i32 = 21;
export const K_RETHROW: i32 = 22;
export const K_RETURN: i32 = 23;
export const K_SUPER: i32 = 24;
export const K_SWITCH: i32 = 25;
export const K_THIS: i32 = 26;
export const K_THROW: i32 = 27;
export const K_TRUE: i32 = 28;
export const K_TRY: i32 = 29;
export const K_VAR: i32 = 30;
export const K_VOID: i32 = 31;
export const K_WHILE: i32 = 32;
export const K_WITH: i32 = 33;
export const K_LAST_RESERVED: i32 = 33;
// Built-in identifiers.
export const K_ABSTRACT: i32 = 40;
export const K_AS: i32 = 41;
export const K_COVARIANT: i32 = 42;
export const K_DEFERRED: i32 = 43;
export const K_DYNAMIC: i32 = 44;
export const K_EXPORT: i32 = 45;
export const K_EXTENSION: i32 = 46;
export const K_EXTERNAL: i32 = 47;
export const K_FACTORY: i32 = 48;
export const K_FUNCTION: i32 = 49;
export const K_GET: i32 = 50;
export const K_IMPLEMENTS: i32 = 51;
export const K_IMPORT: i32 = 52;
export const K_INTERFACE: i32 = 53;
export const K_LATE: i32 = 54;
export const K_LIBRARY: i32 = 55;
export const K_MIXIN: i32 = 56;
export const K_OPERATOR: i32 = 57;
export const K_PART: i32 = 58;
export const K_REQUIRED: i32 = 59;
export const K_SET: i32 = 60;
export const K_STATIC: i32 = 61;
export const K_TYPEDEF: i32 = 62;
export const K_AUGMENT: i32 = 63;
export const K_LAST_BUILTIN: i32 = 63;
// Contextual keywords.
export const K_ASYNC: i32 = 70;
export const K_AWAIT: i32 = 71;
export const K_BASE: i32 = 72;
export const K_HIDE: i32 = 73;
export const K_NATIVE: i32 = 74;
export const K_OF: i32 = 75;
export const K_ON: i32 = 76;
export const K_SEALED: i32 = 77;
export const K_SHOW: i32 = 78;
export const K_SYNC: i32 = 79;
export const K_TYPE: i32 = 80;
export const K_WHEN: i32 = 81;
export const K_YIELD: i32 = 82;

export const dtIsReserved = (k: i32): boolean => k >= K_ASSERT && k <= K_LAST_RESERVED;
export const dtIsBuiltIn = (k: i32): boolean => k >= K_ABSTRACT && k <= K_LAST_BUILTIN;

/** The keyword id of the identifier `src[a, b)`, or K_NONE. */
export const dtKeyword = (src: u8[], a: i32, b: i32): i32 => {
  const n = b - a;
  if (n < 2 || n > 10) {
    return K_NONE;
  }
  const c = toI32(src[a]);
  if (c < 97 && c !== 70) {
    return K_NONE;
  }
  switch (c) {
    case 97: // a
      if (dtIs(src, a, n, "as")) return K_AS;
      if (dtIs(src, a, n, "assert")) return K_ASSERT;
      if (dtIs(src, a, n, "abstract")) return K_ABSTRACT;
      if (dtIs(src, a, n, "async")) return K_ASYNC;
      if (dtIs(src, a, n, "await")) return K_AWAIT;
      if (dtIs(src, a, n, "augment")) return K_AUGMENT;
      return K_NONE;
    case 98: // b
      if (dtIs(src, a, n, "break")) return K_BREAK;
      if (dtIs(src, a, n, "base")) return K_BASE;
      return K_NONE;
    case 99: // c
      if (dtIs(src, a, n, "case")) return K_CASE;
      if (dtIs(src, a, n, "catch")) return K_CATCH;
      if (dtIs(src, a, n, "class")) return K_CLASS;
      if (dtIs(src, a, n, "const")) return K_CONST;
      if (dtIs(src, a, n, "continue")) return K_CONTINUE;
      if (dtIs(src, a, n, "covariant")) return K_COVARIANT;
      return K_NONE;
    case 100: // d
      if (dtIs(src, a, n, "do")) return K_DO;
      if (dtIs(src, a, n, "default")) return K_DEFAULT;
      if (dtIs(src, a, n, "deferred")) return K_DEFERRED;
      if (dtIs(src, a, n, "dynamic")) return K_DYNAMIC;
      return K_NONE;
    case 101: // e
      if (dtIs(src, a, n, "else")) return K_ELSE;
      if (dtIs(src, a, n, "enum")) return K_ENUM;
      if (dtIs(src, a, n, "extends")) return K_EXTENDS;
      if (dtIs(src, a, n, "export")) return K_EXPORT;
      if (dtIs(src, a, n, "extension")) return K_EXTENSION;
      if (dtIs(src, a, n, "external")) return K_EXTERNAL;
      return K_NONE;
    case 102: // f
      if (dtIs(src, a, n, "false")) return K_FALSE;
      if (dtIs(src, a, n, "final")) return K_FINAL;
      if (dtIs(src, a, n, "finally")) return K_FINALLY;
      if (dtIs(src, a, n, "for")) return K_FOR;
      if (dtIs(src, a, n, "factory")) return K_FACTORY;
      return K_NONE;
    case 70: // F
      if (dtIs(src, a, n, "Function")) return K_FUNCTION;
      return K_NONE;
    case 103: // g
      if (dtIs(src, a, n, "get")) return K_GET;
      return K_NONE;
    case 104: // h
      if (dtIs(src, a, n, "hide")) return K_HIDE;
      return K_NONE;
    case 105: // i
      if (dtIs(src, a, n, "if")) return K_IF;
      if (dtIs(src, a, n, "in")) return K_IN;
      if (dtIs(src, a, n, "is")) return K_IS;
      if (dtIs(src, a, n, "implements")) return K_IMPLEMENTS;
      if (dtIs(src, a, n, "import")) return K_IMPORT;
      if (dtIs(src, a, n, "interface")) return K_INTERFACE;
      return K_NONE;
    case 108: // l
      if (dtIs(src, a, n, "late")) return K_LATE;
      if (dtIs(src, a, n, "library")) return K_LIBRARY;
      return K_NONE;
    case 109: // m
      if (dtIs(src, a, n, "mixin")) return K_MIXIN;
      return K_NONE;
    case 110: // n
      if (dtIs(src, a, n, "new")) return K_NEW;
      if (dtIs(src, a, n, "null")) return K_NULL;
      if (dtIs(src, a, n, "native")) return K_NATIVE;
      return K_NONE;
    case 111: // o
      if (dtIs(src, a, n, "of")) return K_OF;
      if (dtIs(src, a, n, "on")) return K_ON;
      if (dtIs(src, a, n, "operator")) return K_OPERATOR;
      return K_NONE;
    case 112: // p
      if (dtIs(src, a, n, "part")) return K_PART;
      return K_NONE;
    case 114: // r
      if (dtIs(src, a, n, "rethrow")) return K_RETHROW;
      if (dtIs(src, a, n, "return")) return K_RETURN;
      if (dtIs(src, a, n, "required")) return K_REQUIRED;
      return K_NONE;
    case 115: // s
      if (dtIs(src, a, n, "super")) return K_SUPER;
      if (dtIs(src, a, n, "switch")) return K_SWITCH;
      if (dtIs(src, a, n, "set")) return K_SET;
      if (dtIs(src, a, n, "static")) return K_STATIC;
      if (dtIs(src, a, n, "sealed")) return K_SEALED;
      if (dtIs(src, a, n, "show")) return K_SHOW;
      if (dtIs(src, a, n, "sync")) return K_SYNC;
      return K_NONE;
    case 116: // t
      if (dtIs(src, a, n, "this")) return K_THIS;
      if (dtIs(src, a, n, "throw")) return K_THROW;
      if (dtIs(src, a, n, "true")) return K_TRUE;
      if (dtIs(src, a, n, "try")) return K_TRY;
      if (dtIs(src, a, n, "typedef")) return K_TYPEDEF;
      if (dtIs(src, a, n, "type")) return K_TYPE;
      return K_NONE;
    case 118: // v
      if (dtIs(src, a, n, "var")) return K_VAR;
      if (dtIs(src, a, n, "void")) return K_VOID;
      return K_NONE;
    case 119: // w
      if (dtIs(src, a, n, "while")) return K_WHILE;
      if (dtIs(src, a, n, "with")) return K_WITH;
      if (dtIs(src, a, n, "when")) return K_WHEN;
      return K_NONE;
    case 121: // y
      if (dtIs(src, a, n, "yield")) return K_YIELD;
      return K_NONE;
    default:
      return K_NONE;
  }
};

/** Whether `src[a, a + n)` is `s`. */
export const dtIs = (src: u8[], a: i32, n: i32, s: string): boolean => {
  if (toI32(s.length) !== n) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (toI32(src[a + i]) !== s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};
