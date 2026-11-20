// The lexer: source bytes to the token table, in one pass.
//
// It splits `>>` into two `>` (so templates close one at a time), keeps
// comments as tokens, lexes `#include <x>`'s header name as one token, and
// marks every token of a preprocessor directive.

import { uncheckedGet, uncheckedSet } from "nish:unsafe";
import { Doc } from "./doc";
import { utf8Width } from "../core/uwidth";
import {
  CW_FINAL,
  CW_HAS_INCLUDE,
  CW_IMPORT,
  CW_MODULE,
  CW_OVERRIDE,
  K_CHAR,
  K_COMMENT,
  K_EOF,
  K_HEADER,
  K_IDENT,
  K_NUMBER,
  K_STRING,
  K_UNKNOWN,
  KW_ALIGNAS,
  KW_ALIGNOF,
  KW_ASM,
  KW_ATOMIC,
  KW_MS,
  KW_GENERIC,
  KW_ATTRIBUTE,
  KW_AUTO,
  KW_BOOL,
  KW_BREAK,
  KW_CASE,
  KW_CATCH,
  KW_CHAR,
  KW_CHAR16_T,
  KW_CHAR32_T,
  KW_CHAR8_T,
  KW_CLASS,
  KW_CO_AWAIT,
  KW_CO_RETURN,
  KW_CO_YIELD,
  KW_CONCEPT,
  KW_CONST,
  KW_CONST_CAST,
  KW_CONSTEVAL,
  KW_CONSTEXPR,
  KW_CONSTINIT,
  KW_CONTINUE,
  KW_DECLTYPE,
  KW_DEFAULT,
  KW_DELETE,
  KW_DO,
  KW_DOUBLE,
  KW_DYNAMIC_CAST,
  KW_ELSE,
  KW_ENUM,
  KW_EXPLICIT,
  KW_EXPORT,
  KW_EXTERN,
  KW_FALSE,
  KW_FLOAT,
  KW_FOR,
  KW_FRIEND,
  KW_GOTO,
  KW_IF,
  KW_INLINE,
  KW_INT,
  KW_LONG,
  KW_MUTABLE,
  KW_NAMESPACE,
  KW_NEW,
  KW_NOEXCEPT,
  KW_NULLPTR,
  KW_OPERATOR,
  KW_PRIVATE,
  KW_PROTECTED,
  KW_PUBLIC,
  KW_REGISTER,
  KW_REINTERPRET_CAST,
  KW_REQUIRES,
  KW_RETURN,
  KW_SHORT,
  KW_SIGNED,
  KW_SIZEOF,
  KW_STATIC,
  KW_STATIC_ASSERT,
  KW_STATIC_CAST,
  KW_STRUCT,
  KW_SWITCH,
  KW_TEMPLATE,
  KW_THIS,
  KW_THREAD_LOCAL,
  KW_THROW,
  KW_TRUE,
  KW_TRY,
  KW_TYPEDEF,
  KW_TYPEID,
  KW_TYPENAME,
  KW_TYPEOF,
  KW_UNION,
  KW_UNSIGNED,
  KW_USING,
  KW_VIRTUAL,
  KW_VOID,
  KW_VOLATILE,
  KW_WCHAR_T,
  KW_WHILE,
  P_AMP,
  P_AMPAMP,
  P_AMPEQUAL,
  P_ARROW,
  P_ARROWSTAR,
  P_AT,
  P_BACKSLASH,
  P_CARET,
  P_CARETEQUAL,
  P_COLON,
  P_COLONCOLON,
  P_COMMA,
  P_ELLIPSIS,
  P_EQUAL,
  P_EQUALEQUAL,
  P_EXCLAIM,
  P_EXCLAIMEQUAL,
  P_GREATER,
  P_GREATEREQUAL,
  P_GREATERGREATEREQUAL,
  P_HASH,
  P_HASHHASH,
  P_LBRACE,
  P_LESS,
  P_LESSEQUAL,
  P_LESSLESS,
  P_LESSLESSEQUAL,
  P_LPAREN,
  P_LSQUARE,
  P_MINUS,
  P_MINUSEQUAL,
  P_MINUSMINUS,
  P_PERCENT,
  P_PERCENTEQUAL,
  P_PERIOD,
  P_PERIODSTAR,
  P_PIPE,
  P_PIPEEQUAL,
  P_PIPEPIPE,
  P_PLUS,
  P_PLUSEQUAL,
  P_PLUSPLUS,
  P_QUESTION,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  P_SLASH,
  P_SLASHEQUAL,
  P_SPACESHIP,
  P_STAR,
  P_STAREQUAL,
  P_TILDE,
  PP_DEFINE,
  PP_ELIF,
  PP_ELSE,
  PP_ENDIF,
  PP_ERROR,
  PP_IF,
  PP_INCLUDE,
  PP_NONE,
  PP_OTHER,
  PP_PRAGMA,
} from "./tok";

const isIdentStart = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || c >= 128;

const isIdentChar = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 36 || c >= 128;

const isDigit = (c: i32): boolean => c >= 48 && c <= 57;

/**
 * clang's isRawStringDelimBody: a letter, digit, underscore, period or
 * punctuation byte (the double quote, dollar, at and backtick included) other
 * than the parentheses and the backslash; that is, printable ASCII but space,
 * `(`, `)` and `\`.
 */
const isRawDelimBody = (c: i32): boolean => c >= 33 && c <= 126 && c !== 40 && c !== 41 && c !== 92;

/** Whether the `n` bytes of `d.src` at `a` spell `s`. */
const wordIs = (src: u8[], a: i32, n: i32, s: string): boolean => {
  if (n !== toI32(s.length)) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (toI32(uncheckedGet(src, a + i)) !== s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

/** Whether the word at `a` (length `n`, starting `__`) is a Microsoft keyword that names no type. */
const isMsKeyword = (src: u8[], a: i32, n: i32): boolean => {
  switch (n) {
    case 5:
      return wordIs(src, a, n, "__w64");
    case 6:
      return wordIs(src, a, n, "__sptr") || wordIs(src, a, n, "__uptr");
    case 7:
      return (
        wordIs(src, a, n, "__cdecl") ||
        wordIs(src, a, n, "__ptr32") ||
        wordIs(src, a, n, "__ptr64") ||
        wordIs(src, a, n, "__super")
      );
    case 8:
      return wordIs(src, a, n, "__inline");
    case 9:
      return wordIs(src, a, n, "__stdcall") || wordIs(src, a, n, "__regcall");
    case 10:
      return wordIs(src, a, n, "__fastcall") || wordIs(src, a, n, "__thiscall") || wordIs(src, a, n, "__inline__");
    case 11:
      return wordIs(src, a, n, "__unaligned");
    case 12:
      return wordIs(src, a, n, "__vectorcall");
    case 13:
      return wordIs(src, a, n, "__forceinline");
    case 20:
      return wordIs(src, a, n, "__single_inheritance");
    case 21:
      return wordIs(src, a, n, "__virtual_inheritance");
    case 22:
      return wordIs(src, a, n, "__multiple_inheritance");
    default:
      return false;
  }
};

/**
 * Where the ud-suffix of a string or character literal that ends at `i`
 * ends. clang's lexer (C++20) takes `_x` as a suffix, and for a string the
 * standard library's (`s`, `sv`, `ms`, `if`, ...); any other word is a
 * token of its own: `"%d"PRId64`.
 */
const udSuffixEnd = (d: Doc, i: i32, n: i32, str: boolean): i32 => {
  if (i >= n) {
    return i;
  }
  const c = d.at(i);
  if (!(c === 95 || (c >= 97 && c <= 122) || (c >= 65 && c <= 90))) {
    return i;
  }
  let j = i;
  while (j < n && isIdentChar(d.at(j))) {
    j++;
  }
  if (c === 95) {
    return j;
  }
  if (!str || j - i > 3) {
    return i;
  }
  const c1 = j - i > 1 ? d.at(i + 1) : 0;
  const c2 = j - i > 2 ? d.at(i + 2) : 0;
  switch (j - i) {
    case 1:
      // h s i d y
      return c === 104 || c === 115 || c === 105 || c === 100 || c === 121 ? j : i;
    case 2:
      // ms us ns il if sv
      if (c1 === 115 && (c === 109 || c === 117 || c === 110)) {
        return j;
      }
      if (c === 105 && (c1 === 108 || c1 === 102)) {
        return j;
      }
      return c === 115 && c1 === 118 ? j : i;
    default:
      // min
      return c === 109 && c1 === 105 && c2 === 110 ? j : i;
  }
};

/** The keyword id of the word at `a`, length `n`, or K_IDENT. */
export const wordKind = (src: u8[], a: i32, n: i32): i32 => {
  const c = toI32(uncheckedGet(src, a));
  // Microsoft's structured exception handling reads as try/catch.
  if (c === 95 && n >= 5 && n <= 9) {
    if (wordIs(src, a, n, "__try")) return KW_TRY;
    if (wordIs(src, a, n, "__except") || wordIs(src, a, n, "__finally")) return KW_CATCH;
  }
  // `_asm`, `__asm` and `__asm__` are spellings of `asm`.
  if (
    c === 95 &&
    (n === 4 || n === 5 || n === 7) &&
    (wordIs(src, a, n, "_asm") || wordIs(src, a, n, "__asm") || wordIs(src, a, n, "__asm__"))
  ) {
    return KW_ASM;
  }
  // Keywords clang-format's lexer knows (it turns on Microsoft extensions).
  if (c === 95 && n >= 5 && toI32(uncheckedGet(src, a + 1)) === 95 && isMsKeyword(src, a, n)) {
    return KW_MS;
  }
  if (c === 95 && n === 8 && wordIs(src, a, n, "_Generic")) {
    return KW_GENERIC;
  }
  switch (n) {
    case 2:
      if (wordIs(src, a, n, "do")) return KW_DO;
      if (wordIs(src, a, n, "if")) return KW_IF;
      return K_IDENT;
    case 3:
      // C++'s alternative token for `!` (clang-format lexes it so).
      if (c === 110 && wordIs(src, a, n, "not")) return P_EXCLAIM;
      if (c === 102 && wordIs(src, a, n, "for")) return KW_FOR;
      if (c === 105 && wordIs(src, a, n, "int")) return KW_INT;
      if (c === 110 && wordIs(src, a, n, "new")) return KW_NEW;
      if (c === 116 && wordIs(src, a, n, "try")) return KW_TRY;
      if (c === 97 && wordIs(src, a, n, "asm")) return KW_ASM;
      return K_IDENT;
    case 4:
      switch (c) {
        case 97:
          return wordIs(src, a, n, "auto") ? KW_AUTO : K_IDENT;
        case 98:
          return wordIs(src, a, n, "bool") ? KW_BOOL : K_IDENT;
        case 99:
          if (wordIs(src, a, n, "case")) return KW_CASE;
          if (wordIs(src, a, n, "char")) return KW_CHAR;
          return K_IDENT;
        case 101:
          if (wordIs(src, a, n, "else")) return KW_ELSE;
          if (wordIs(src, a, n, "enum")) return KW_ENUM;
          return K_IDENT;
        case 103:
          return wordIs(src, a, n, "goto") ? KW_GOTO : K_IDENT;
        case 108:
          return wordIs(src, a, n, "long") ? KW_LONG : K_IDENT;
        case 116:
          if (wordIs(src, a, n, "this")) return KW_THIS;
          if (wordIs(src, a, n, "true")) return KW_TRUE;
          return K_IDENT;
        case 118:
          return wordIs(src, a, n, "void") ? KW_VOID : K_IDENT;
        default:
          return K_IDENT;
      }
    case 5:
      switch (c) {
        case 98:
          return wordIs(src, a, n, "break") ? KW_BREAK : K_IDENT;
        case 99:
          if (wordIs(src, a, n, "const")) return KW_CONST;
          if (wordIs(src, a, n, "class")) return KW_CLASS;
          if (wordIs(src, a, n, "catch")) return KW_CATCH;
          return K_IDENT;
        case 102:
          if (wordIs(src, a, n, "false")) return KW_FALSE;
          if (wordIs(src, a, n, "float")) return KW_FLOAT;
          if (wordIs(src, a, n, "final")) return CW_FINAL;
          return K_IDENT;
        case 115:
          return wordIs(src, a, n, "short") ? KW_SHORT : K_IDENT;
        case 116:
          return wordIs(src, a, n, "throw") ? KW_THROW : K_IDENT;
        case 117:
          if (wordIs(src, a, n, "using")) return KW_USING;
          if (wordIs(src, a, n, "union")) return KW_UNION;
          return K_IDENT;
        case 119:
          return wordIs(src, a, n, "while") ? KW_WHILE : K_IDENT;
        default:
          return K_IDENT;
      }
    case 6:
      switch (c) {
        case 100:
          if (wordIs(src, a, n, "delete")) return KW_DELETE;
          if (wordIs(src, a, n, "double")) return KW_DOUBLE;
          return K_IDENT;
        case 101:
          if (wordIs(src, a, n, "extern")) return KW_EXTERN;
          if (wordIs(src, a, n, "export")) return KW_EXPORT;
          return K_IDENT;
        case 102:
          return wordIs(src, a, n, "friend") ? KW_FRIEND : K_IDENT;
        case 105:
          if (wordIs(src, a, n, "inline")) return KW_INLINE;
          if (wordIs(src, a, n, "import")) return CW_IMPORT;
          return K_IDENT;
        case 109:
          return wordIs(src, a, n, "module") ? CW_MODULE : K_IDENT;
        case 112:
          return wordIs(src, a, n, "public") ? KW_PUBLIC : K_IDENT;
        case 114:
          return wordIs(src, a, n, "return") ? KW_RETURN : K_IDENT;
        case 115:
          if (wordIs(src, a, n, "static")) return KW_STATIC;
          if (wordIs(src, a, n, "struct")) return KW_STRUCT;
          if (wordIs(src, a, n, "sizeof")) return KW_SIZEOF;
          if (wordIs(src, a, n, "signed")) return KW_SIGNED;
          if (wordIs(src, a, n, "switch")) return KW_SWITCH;
          return K_IDENT;
        case 116:
          if (wordIs(src, a, n, "typeid")) return KW_TYPEID;
          if (wordIs(src, a, n, "typeof")) return KW_TYPEOF;
          return K_IDENT;
        default:
          return K_IDENT;
      }
    case 7:
      switch (c) {
        case 97:
          if (wordIs(src, a, n, "alignas")) return KW_ALIGNAS;
          if (wordIs(src, a, n, "alignof")) return KW_ALIGNOF;
          return K_IDENT;
        case 99:
          if (wordIs(src, a, n, "concept")) return KW_CONCEPT;
          if (wordIs(src, a, n, "char8_t")) return KW_CHAR8_T;
          return K_IDENT;
        case 100:
          return wordIs(src, a, n, "default") ? KW_DEFAULT : K_IDENT;
        case 109:
          return wordIs(src, a, n, "mutable") ? KW_MUTABLE : K_IDENT;
        case 110:
          return wordIs(src, a, n, "nullptr") ? KW_NULLPTR : K_IDENT;
        case 112:
          return wordIs(src, a, n, "private") ? KW_PRIVATE : K_IDENT;
        case 116:
          return wordIs(src, a, n, "typedef") ? KW_TYPEDEF : K_IDENT;
        case 118:
          return wordIs(src, a, n, "virtual") ? KW_VIRTUAL : K_IDENT;
        case 119:
          return K_IDENT; // (`wchar_t` is a name to clang-format: its lexer leaves wide chars off)
        case 95:
          return wordIs(src, a, n, "_Atomic") ? KW_ATOMIC : K_IDENT;
        default:
          return K_IDENT;
      }
    case 8:
      switch (c) {
        case 99:
          if (wordIs(src, a, n, "continue")) return KW_CONTINUE;
          if (wordIs(src, a, n, "char16_t")) return KW_CHAR16_T;
          if (wordIs(src, a, n, "char32_t")) return KW_CHAR32_T;
          if (wordIs(src, a, n, "co_await")) return KW_CO_AWAIT;
          if (wordIs(src, a, n, "co_yield")) return KW_CO_YIELD;
          if (wordIs(src, a, n, "co_return")) return KW_CO_RETURN;
          return K_IDENT;
        case 100:
          return wordIs(src, a, n, "decltype") ? KW_DECLTYPE : K_IDENT;
        case 101:
          return wordIs(src, a, n, "explicit") ? KW_EXPLICIT : K_IDENT;
        case 110:
          return wordIs(src, a, n, "noexcept") ? KW_NOEXCEPT : K_IDENT;
        case 111:
          if (wordIs(src, a, n, "operator")) return KW_OPERATOR;
          if (wordIs(src, a, n, "override")) return CW_OVERRIDE;
          return K_IDENT;
        case 114:
          if (wordIs(src, a, n, "requires")) return KW_REQUIRES;
          if (wordIs(src, a, n, "register")) return KW_REGISTER;
          return K_IDENT;
        case 116:
          if (wordIs(src, a, n, "template")) return KW_TEMPLATE;
          if (wordIs(src, a, n, "typename")) return KW_TYPENAME;
          return K_IDENT;
        case 117:
          return wordIs(src, a, n, "unsigned") ? KW_UNSIGNED : K_IDENT;
        case 118:
          return wordIs(src, a, n, "volatile") ? KW_VOLATILE : K_IDENT;
        default:
          return K_IDENT;
      }
    case 9:
      if (c === 110 && wordIs(src, a, n, "namespace")) return KW_NAMESPACE;
      if (c === 112 && wordIs(src, a, n, "protected")) return KW_PROTECTED;
      if (c === 99) {
        if (wordIs(src, a, n, "constexpr")) return KW_CONSTEXPR;
        if (wordIs(src, a, n, "consteval")) return KW_CONSTEVAL;
        if (wordIs(src, a, n, "constinit")) return KW_CONSTINIT;
        if (wordIs(src, a, n, "co_return")) return KW_CO_RETURN;
      }
      return K_IDENT;
    case 10:
      // (clang-format takes `__declspec(...)` for an attribute.)
      if (c === 95 && wordIs(src, a, n, "__declspec")) return KW_ATTRIBUTE;
      return wordIs(src, a, n, "const_cast") ? KW_CONST_CAST : K_IDENT;
    case 11:
      if (wordIs(src, a, n, "static_cast")) return KW_STATIC_CAST;
      // clang-format's default IfMacros: reads as `if`.
      if (wordIs(src, a, n, "KJ_IF_MAYBE")) return KW_IF;
      return K_IDENT;
    case 12:
      if (wordIs(src, a, n, "dynamic_cast")) return KW_DYNAMIC_CAST;
      if (wordIs(src, a, n, "thread_local")) return KW_THREAD_LOCAL;
      return K_IDENT;
    case 13:
      if (wordIs(src, a, n, "static_assert")) return KW_STATIC_ASSERT;
      if (wordIs(src, a, n, "__attribute__")) return KW_ATTRIBUTE;
      if (wordIs(src, a, n, "__has_include")) return CW_HAS_INCLUDE;
      return K_IDENT;
    case 16:
      return wordIs(src, a, n, "reinterpret_cast") ? KW_REINTERPRET_CAST : K_IDENT;
    default:
      return K_IDENT;
  }
};

/** The directive id of the word at `a`, length `n`, after a `#`. */
const ppKindOf = (src: u8[], a: i32, n: i32): i32 => {
  if (wordIs(src, a, n, "include") || wordIs(src, a, n, "include_next") || wordIs(src, a, n, "import")) {
    return PP_INCLUDE;
  }
  if (wordIs(src, a, n, "define") || wordIs(src, a, n, "undef")) return PP_DEFINE;
  if (wordIs(src, a, n, "if") || wordIs(src, a, n, "ifdef") || wordIs(src, a, n, "ifndef")) return PP_IF;
  if (wordIs(src, a, n, "elif") || wordIs(src, a, n, "elifdef") || wordIs(src, a, n, "elifndef")) return PP_ELIF;
  if (wordIs(src, a, n, "else")) return PP_ELSE;
  if (wordIs(src, a, n, "endif")) return PP_ENDIF;
  if (wordIs(src, a, n, "pragma")) return PP_PRAGMA;
  if (wordIs(src, a, n, "error") || wordIs(src, a, n, "warning")) return PP_ERROR;
  return PP_OTHER;
};

/** The display width of bytes [a, b): one column per UTF-8 lead byte. */
export const widthOf = (src: u8[], a: i32, b: i32): i32 => {
  // (ASCII alone, the usual case, is its length; tabs count one here.)
  let ascii = true;
  for (let i = a; i < b; i++) {
    const c = toI32(uncheckedGet(src, i));
    if (c >= 128) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    return b - a;
  }
  // Tabs split the text into the pieces clang-format measures one by one.
  let w = 0;
  let s = a;
  for (let i = a; i <= b; i++) {
    if (i === b || toI32(uncheckedGet(src, i)) === 9) {
      w = w + utf8Width(src, s, i) + (i < b ? 1 : 0);
      s = i + 1;
    }
  }
  return w;
};

/** Whether the identifier [a, b) is a string-literal prefix; 2 when raw. */
const stringPrefix = (src: u8[], a: i32, b: i32): i32 => {
  const n = b - a;
  if (n === 1) {
    const c = toI32(uncheckedGet(src, a));
    if (c === 82) return 2; // R
    if (c === 117 || c === 85 || c === 76) return 1; // u U L
    return 0;
  }
  if (n === 2) {
    if (wordIs(src, a, n, "u8")) return 1;
    if (wordIs(src, a, n, "uR") || wordIs(src, a, n, "UR") || wordIs(src, a, n, "LR")) return 2;
    return 0;
  }
  if (n === 3 && wordIs(src, a, n, "u8R")) return 2;
  return 0;
};

/**
 * Lexes `d.src` into `d`'s token table, ending with one K_EOF token. Answers
 * false when the input has an unterminated comment, string or character.
 */
/** Whether the document starts with a UTF-8 byte order mark. */
export const hasBom = (d: Doc): boolean =>
  d.n >= 3 &&
  toI32(uncheckedGet(d.src, 0)) === 0xef &&
  toI32(uncheckedGet(d.src, 1)) === 0xbb &&
  toI32(uncheckedGet(d.src, 2)) === 0xbf;

/**
 * The display column of byte `a` on the line starting at `ls`: tabs reach the
 * next stop of 8, as clang-format's lexer counts the column a token starts at.
 */
export const displayColumn = (src: u8[], ls: i32, a: i32): i32 => {
  let c = 0;
  let seg = ls;
  let high = false;
  for (let j = ls; j < a; j++) {
    const b = toI32(uncheckedGet(src, j));
    if (b === 9) {
      c = c + (high ? utf8Width(src, seg, j) : j - seg);
      c = c + 8 - (c % 8);
      seg = j + 1;
      high = false;
    } else if (b >= 128) {
      high = true;
    }
  }
  return c + (high ? utf8Width(src, seg, a) : a - seg);
};

/**
 * Whether the `<<` at byte `i` (token `t` about to start) stays two `<`:
 * clang-format splits it and merges it back unless the token before is a
 * `<` or the next token is one (`<` or a `<<` it splits, not `<=` or `<<=`).
 */
const lessSplits = (d: Doc, i: i32, t: i32): boolean => {
  if (t > 0 && d.kind[t - 1] === P_LESS && d.end[t - 1] <= i) {
    return true;
  }
  // (`operator<< <T>` stays `operator<<`.)
  if (t > 0 && d.kind[t - 1] === KW_OPERATOR) {
    return false;
  }
  let j = i + 2;
  while (j < d.n) {
    const c = d.at(j);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11) {
      j++;
    } else if (c === 92 && (d.at(j + 1) === 10 || (d.at(j + 1) === 13 && d.at(j + 2) === 10))) {
      j += 2;
    } else {
      break;
    }
  }
  if (j >= d.n || d.at(j) !== 60) {
    return false;
  }
  // `<=` and `<<=` are no `<`.
  return !(d.at(j + 1) === 61 || (d.at(j + 1) === 60 && d.at(j + 2) === 61));
};

export const lex = (d: Doc): boolean => {
  const src = d.src;
  const n = d.n;
  // A UTF-8 byte order mark is not a token; the formatter writes it back.
  let i = hasBom(d) ? 3 : 0;
  d.strTabs = false;
  d.anyImplicit = false;
  d.anyAsm = false;
  d.anyDefine = false;
  d.nCR = 0;
  d.nLF = 0;
  let lineStart = 0;
  let nl = 0;
  let unesc = 0;
  let ws = 0;
  let inPP = false;
  let ppIncludeNext = false; // the next `<` is a header name
  let hasInclude = 0; // 1 after `__has_include`, 2 after its `(`: a `<` starts a header name
  let ppWordNext = false; // the next word names the directive
  let ppHashTok = -1;
  let atLineStart = true; // only whitespace since the last unescaped newline
  let ok = true;
  let t = 0;
  let cap = toI32(d.kind.length);
  let highByte = false; // the token holds a byte >= 128
  while (true) {
    // Whitespace.
    while (i < n) {
      const c = toI32(uncheckedGet(src, i));
      if (c === 10) {
        d.nLF = d.nLF + 1;
        nl++;
        unesc = 1;
        ws = 1;
        i++;
        lineStart = i;
        atLineStart = true;
        if (inPP) {
          inPP = false;
          ppIncludeNext = false;
          ppWordNext = false;
        }
      } else if (c === 32 || c === 9 || c === 13 || c === 12 || c === 11) {
        if (c === 13) {
          d.nCR = d.nCR + 1;
        }
        ws = 1;
        i++;
      } else if (c === 92 && (d.at(i + 1) === 10 || (d.at(i + 1) === 13 && d.at(i + 2) === 10))) {
        // An escaped newline: whitespace that keeps a directive going.
        i += d.at(i + 1) === 13 ? 3 : 2;
        lineStart = i;
        nl++;
        ws = 1;
      } else {
        break;
      }
    }
    if (t >= cap) {
      d.growTokens(t + (t >> 1) + 64);
      cap = toI32(d.kind.length);
    }
    uncheckedSet(d.nl, t, nl);
    uncheckedSet(d.ws, t, ws);
    uncheckedSet(d.unesc, t, unesc);
    uncheckedSet(d.col, t, i - lineStart);
    uncheckedSet(d.start, t, i);
    uncheckedSet(d.multi, t, 0);
    uncheckedSet(d.plain, t, 0);
    uncheckedSet(d.ppKind, t, PP_NONE);
    uncheckedSet(d.nxt, t, -1);
    uncheckedSet(d.prv, t, -1);
    uncheckedSet(d.match, t, -1);
    uncheckedSet(d.childHead, t, -1);
    uncheckedSet(d.childTail, t, -1);
    uncheckedSet(d.childCount, t, 0);
    uncheckedSet(d.bk, t, 0);
    uncheckedSet(d.type, t, 0);
    uncheckedSet(d.final, t, 0);
    uncheckedSet(d.eqList, t, 0);
    uncheckedSet(d.hidSemi, t, 0);
    uncheckedSet(d.asmFin, t, 0);
    uncheckedSet(d.nest, t, 0);
    uncheckedSet(d.bind, t, 0);
    uncheckedSet(d.mustBreak, t, 0);
    uncheckedSet(d.spaces, t, 0);
    nl = 0;
    unesc = 0;
    ws = 0;
    if (i >= n) {
      d.kind[t] = K_EOF;
      d.end[t] = i;
      d.width[t] = 0;
      d.inPP[t] = 0;
      d.ppId[t] = -1;
      t++;
      break;
    }
    const startOfLine = atLineStart;
    atLineStart = false;
    highByte = false;
    let scanWidth = false; // a comment or literal: measure its width
    const a = i;
    const c = toI32(uncheckedGet(src, i));
    let k = K_UNKNOWN;
    if (startOfLine && c === 35) {
      // `#` opens a directive.
      inPP = true;
      ppWordNext = true;
      ppHashTok = t;
      i++;
      k = P_HASH;
      if (d.at(i) === 35) {
        i++;
        k = P_HASHHASH;
      } else {
        // A directive even with no name after it (the null directive `#`);
        // the name, when there is one, decides its kind.
        d.ppKind[t] = PP_OTHER;
      }
    } else if (isIdentStart(c)) {
      i++;
      let hi = c;
      while (i < n) {
        const e = toI32(uncheckedGet(src, i));
        if (!isIdentChar(e)) {
          break;
        }
        hi = hi | e;
        i++;
      }
      highByte = hi >= 128;
      const q = d.at(i);
      const pre = q === 34 || q === 39 ? stringPrefix(src, a, i) : 0;
      if (pre === 2 && q === 34) {
        // A raw string: R"delim( ... )delim", as clang's
        // Lexer::LexRawStringLiteral finds it: up to 16 delimiter bytes,
        // then `(`; it ends only at `)`, the delimiter and `"`.
        i++;
        const dStart = i;
        while (i - dStart !== 16 && i < n && isRawDelimBody(d.at(i))) {
          i++;
        }
        const dLen = i - dStart;
        let closed = false;
        if (d.at(i) !== 40) {
          // Not a delimiter: clang lexes an unknown token up to the next `"`.
          ok = false;
          i = n;
        } else {
          i++;
        }
        while (i < n) {
          if (d.at(i) === 41) {
            let m = true;
            for (let j = 0; j < dLen; j++) {
              if (d.at(i + 1 + j) !== d.at(dStart + j)) {
                m = false;
                break;
              }
            }
            if (m && d.at(i + 1 + dLen) === 34) {
              i = i + 2 + dLen;
              closed = true;
              break;
            }
          }
          i++;
        }
        if (!closed) {
          ok = false;
        }
        i = udSuffixEnd(d, i, n, true);
        k = K_STRING;
        scanWidth = true;
      } else if (pre === 1 || (pre === 2 && q === 39)) {
        i++;
        while (i < n && d.at(i) !== q) {
          if (d.at(i) === 92) {
            i++;
          } else if (d.at(i) === 10) {
            ok = false;
            break;
          }
          i++;
        }
        i++;
        i = udSuffixEnd(d, i, n, q === 34);
        k = q === 34 ? K_STRING : K_CHAR;
        scanWidth = true;
      } else {
        k = wordKind(src, a, i - a);
        if (k === KW_IF && i - a === 11 && inPP && t === ppHashTok + 2 && d.ppKind[ppHashTok] === PP_DEFINE) {
          // The name a `#define` gives stays a name.
          k = K_IDENT;
        }
        if (ppWordNext) {
          ppWordNext = false;
          const pk = ppKindOf(src, a, i - a);
          if (ppHashTok >= 0) {
            d.ppKind[ppHashTok] = pk;
            if (pk === PP_DEFINE) {
              d.anyDefine = true;
            }
          }
          if (pk === PP_INCLUDE) {
            ppIncludeNext = true;
          }
          k = K_IDENT;
        }
      }
    } else if (isDigit(c) || (c === 46 && isDigit(d.at(i + 1)))) {
      i++;
      while (i < n) {
        const e = toI32(uncheckedGet(src, i));
        if (isIdentChar(e) || e === 46) {
          i++;
        } else if (e === 39 && isIdentChar(d.at(i + 1))) {
          i++;
        } else if ((e === 43 || e === 45) && i > a) {
          const p = d.at(i - 1);
          if (p === 101 || p === 69 || p === 112 || p === 80) {
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      k = K_NUMBER;
    } else if (c === 34 || c === 39) {
      i++;
      while (i < n && d.at(i) !== c) {
        if (d.at(i) === 92) {
          i++;
        } else if (d.at(i) === 10) {
          ok = false;
          break;
        }
        i++;
      }
      i++;
      i = udSuffixEnd(d, i, n, c === 34);
      k = c === 34 ? K_STRING : K_CHAR;
      scanWidth = true;
    } else if (c === 47 && d.at(i + 1) === 47) {
      i += 2;
      while (i < n) {
        if (d.at(i) === 10) {
          // A backslash ending the line (blanks may follow it) splices the
          // next line into the comment, as clang's lexer reads it.
          let j = i - 1;
          while (j > a + 1 && (d.at(j) === 13 || d.at(j) === 32 || d.at(j) === 9)) {
            j--;
          }
          if (j > a + 1 && d.at(j) === 92) {
            // clang-format 23's FormatTokenLexer cuts the comment after a
            // backslash right before the newline when the next line is a
            // line comment too: that comment is a token of its own.
            if (j === i - 1) {
              let q = i + 1;
              while (q < n && (d.at(q) === 32 || d.at(q) === 9 || d.at(q) === 11 || d.at(q) === 12 || d.at(q) === 13)) {
                q++;
              }
              if (q + 1 < n && d.at(q) === 47 && d.at(q + 1) === 47) {
                break;
              }
            }
            i++;
            continue;
          }
          break;
        }
        i++;
      }
      // Trailing whitespace is not part of the comment.
      while (i > a + 2 && (d.at(i - 1) === 32 || d.at(i - 1) === 9 || d.at(i - 1) === 13)) {
        i--;
      }
      k = K_COMMENT;
      scanWidth = true;
    } else if (c === 47 && d.at(i + 1) === 42) {
      i += 2;
      let closed = false;
      while (i < n) {
        if (d.at(i) === 42 && d.at(i + 1) === 47) {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        ok = false;
      }
      k = K_COMMENT;
      scanWidth = true;
    } else if (c === 60 && (ppIncludeNext || hasInclude === 2)) {
      i++;
      while (i < n && d.at(i) !== 62 && d.at(i) !== 10) {
        i++;
      }
      if (d.at(i) === 62) {
        i++;
      }
      k = K_HEADER;
      ppIncludeNext = false;
      hasInclude = 0;
    } else {
      const c1 = d.at(i + 1);
      const c2 = d.at(i + 2);
      i++;
      switch (c) {
        case 40:
          k = P_LPAREN;
          break;
        case 41:
          k = P_RPAREN;
          break;
        case 123:
          k = P_LBRACE;
          break;
        case 125:
          k = P_RBRACE;
          break;
        case 91:
          k = P_LSQUARE;
          break;
        case 93:
          k = P_RSQUARE;
          break;
        case 59:
          k = P_SEMI;
          break;
        case 44:
          k = P_COMMA;
          break;
        case 63:
          k = P_QUESTION;
          break;
        case 126:
          k = P_TILDE;
          break;
        case 64:
          k = P_AT;
          break;
        case 92:
          k = P_BACKSLASH;
          break;
        case 58:
          if (c1 === 58) {
            i++;
            k = P_COLONCOLON;
          } else {
            k = P_COLON;
          }
          break;
        case 46:
          if (c1 === 46 && c2 === 46) {
            i += 2;
            k = P_ELLIPSIS;
          } else if (c1 === 42) {
            i++;
            k = P_PERIODSTAR;
          } else {
            k = P_PERIOD;
          }
          break;
        case 45:
          if (c1 === 62) {
            i++;
            if (d.at(i) === 42) {
              i++;
              k = P_ARROWSTAR;
            } else {
              k = P_ARROW;
            }
          } else if (c1 === 45) {
            i++;
            k = P_MINUSMINUS;
          } else if (c1 === 61) {
            i++;
            k = P_MINUSEQUAL;
          } else {
            k = P_MINUS;
          }
          break;
        case 43:
          if (c1 === 43) {
            i++;
            k = P_PLUSPLUS;
          } else if (c1 === 61) {
            i++;
            k = P_PLUSEQUAL;
          } else {
            k = P_PLUS;
          }
          break;
        case 60:
          if (c1 === 60 && c2 === 61) {
            i += 2;
            k = P_LESSLESSEQUAL;
          } else if (c1 === 60 && !lessSplits(d, a, t)) {
            i++;
            k = P_LESSLESS;
          } else if (c1 === 60) {
            // clang-format's lexer splits `<<` and merges it back only when no
            // `<` is next to it: `<<<` is three `<`.
            k = P_LESS;
          } else if (c1 === 61) {
            i++;
            if (d.at(i) === 62) {
              i++;
              k = P_SPACESHIP;
            } else {
              k = P_LESSEQUAL;
            }
          } else {
            k = P_LESS;
          }
          break;
        case 62:
          // `>>` is two `>`; only `>=` and `>>=` fuse.
          if (c1 === 61) {
            i++;
            k = P_GREATEREQUAL;
          } else if (c1 === 62 && c2 === 61) {
            i += 2;
            k = P_GREATERGREATEREQUAL;
          } else {
            k = P_GREATER;
          }
          break;
        case 61:
          if (c1 === 61) {
            i++;
            k = P_EQUALEQUAL;
          } else {
            k = P_EQUAL;
          }
          break;
        case 33:
          if (c1 === 61) {
            i++;
            k = P_EXCLAIMEQUAL;
          } else {
            k = P_EXCLAIM;
          }
          break;
        case 42:
          if (c1 === 61) {
            i++;
            k = P_STAREQUAL;
          } else {
            k = P_STAR;
          }
          break;
        case 47:
          if (c1 === 61) {
            i++;
            k = P_SLASHEQUAL;
          } else {
            k = P_SLASH;
          }
          break;
        case 37:
          if (c1 === 61) {
            i++;
            k = P_PERCENTEQUAL;
          } else {
            k = P_PERCENT;
          }
          break;
        case 38:
          if (c1 === 38) {
            i++;
            k = P_AMPAMP;
          } else if (c1 === 61) {
            i++;
            k = P_AMPEQUAL;
          } else {
            k = P_AMP;
          }
          break;
        case 124:
          if (c1 === 124) {
            i++;
            k = P_PIPEPIPE;
          } else if (c1 === 61) {
            i++;
            k = P_PIPEEQUAL;
          } else {
            k = P_PIPE;
          }
          break;
        case 94:
          if (c1 === 61) {
            i++;
            k = P_CARETEQUAL;
          } else {
            k = P_CARET;
          }
          break;
        case 35:
          if (c1 === 35) {
            i++;
            k = P_HASHHASH;
          } else {
            k = P_HASH;
          }
          break;
        default:
          k = K_UNKNOWN;
          break;
      }
    }
    if (i > n) {
      i = n;
    }
    if (inPP) {
      const a0 = uncheckedGet(d.start, t);
      if (wordIs(src, a0, i - a0, "__has_include") || wordIs(src, a0, i - a0, "__has_include_next")) {
        hasInclude = 1;
      } else if (hasInclude === 1 && k === P_LPAREN) {
        hasInclude = 2;
      } else {
        hasInclude = 0;
      }
    }
    uncheckedSet(d.kind, t, k);
    if (k === K_UNKNOWN || k === P_BACKSLASH || k === CW_HAS_INCLUDE) {
      d.anyImplicit = true;
    } else if (k === KW_ASM) {
      d.anyAsm = true;
    }
    uncheckedSet(d.end, t, i);
    uncheckedSet(d.inPP, t, inPP ? 1 : 0);
    uncheckedSet(d.ppId, t, inPP ? ppHashTok : -1);
    if (!scanWidth && !highByte) {
      uncheckedSet(d.width, t, i - a);
      uncheckedSet(d.plain, t, 1);
      t++;
      continue;
    }
    // Width, and whether the token runs past a newline. Between tabs the
    // text is measured in display columns (see uwidth).
    let w = 0;
    let multi = 0;
    let seg = a;
    let end = i;
    let segHigh = false; // the piece since the last tab holds a byte >= 128
    let col0 = -1; // the token's display column, found at its first tab
    let everHigh = false;
    for (let j = a; j < i; j++) {
      const b = toI32(uncheckedGet(src, j));
      if (b === 10) {
        multi = 1;
        lineStart = j + 1;
        end = j;
        break;
      }
      if (b === 9) {
        // A tab in a literal or comment reaches the next stop of 8 from where
        // the token was written, as clang-format measures it.
        w = w + (segHigh ? utf8Width(src, seg, j) : j - seg);
        if (col0 < 0) {
          col0 = displayColumn(src, lineStart, a);
        }
        if (k === K_STRING) {
          d.strTabs = true;
        }
        const c = col0 + w;
        w = w + 8 - (c % 8);
        seg = j + 1;
        segHigh = false;
      } else if (b >= 128) {
        segHigh = true;
        everHigh = true;
      }
    }
    w = w + (segHigh ? utf8Width(src, seg, end) : end - seg);
    uncheckedSet(d.plain, t, multi === 0 && col0 < 0 && !everHigh ? 1 : 0);
    if (multi === 1) {
      for (let j = lineStart; j < i; j++) {
        if (toI32(uncheckedGet(src, j)) === 10) {
          lineStart = j + 1;
        }
      }
    }
    uncheckedSet(d.width, t, w);
    uncheckedSet(d.multi, t, multi);
    t++;
  }
  d.ntok = t;
  return ok;
};
