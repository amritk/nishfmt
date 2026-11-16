// The C# lexer: Roslyn's tokens with their leading and trailing trivia,
// preprocessor directives as trivia (evaluated against the defined symbols,
// with the excluded branches as disabled text), documentation comments, and
// interpolated strings split into their start, text, hole and end tokens the
// way Roslyn's parser rescans them.
//
// Ported from Roslyn's Lexer.cs, Lexer_StringLiteral.cs, DirectiveParser.cs
// and LanguageParser_InterpolatedString.cs (MIT License, Copyright the .NET
// Foundation and Contributors), for CSharpier 1.4.0 (MIT License, Copyright
// (c) 2021 Bela VanderVoort).

import { growI32 } from "../core/arr";
import {
  K_AmpersandAmpersandToken,
  K_AmpersandEqualsToken,
  K_AmpersandToken,
  K_AsteriskEqualsToken,
  K_AsteriskToken,
  K_BadDirectiveTrivia,
  K_BarBarToken,
  K_BarEqualsToken,
  K_BarToken,
  K_CaretEqualsToken,
  K_CaretToken,
  K_CharacterLiteralToken,
  K_CloseBraceToken,
  K_CloseBracketToken,
  K_CloseParenToken,
  K_ColonColonToken,
  K_ColonToken,
  K_CommaToken,
  K_DefineDirectiveTrivia,
  K_DisabledTextTrivia,
  K_DotDotToken,
  K_DotToken,
  K_ElifDirectiveTrivia,
  K_ElseDirectiveTrivia,
  K_EndIfDirectiveTrivia,
  K_EndOfFileToken,
  K_EndOfLineTrivia,
  K_EndRegionDirectiveTrivia,
  K_EqualsEqualsToken,
  K_EqualsGreaterThanToken,
  K_EqualsToken,
  K_ErrorDirectiveTrivia,
  K_ExclamationEqualsToken,
  K_ExclamationToken,
  K_GreaterThanEqualsToken,
  K_GreaterThanToken,
  K_IdentifierToken,
  K_IfDirectiveTrivia,
  K_IgnoredDirectiveTrivia,
  K_InterpolatedMultiLineRawStringStartToken,
  K_InterpolatedRawStringEndToken,
  K_InterpolatedSingleLineRawStringStartToken,
  K_InterpolatedStringEndToken,
  K_InterpolatedStringStartToken,
  K_InterpolatedStringTextToken,
  K_InterpolatedVerbatimStringStartToken,
  K_LessThanEqualsToken,
  K_LessThanLessThanEqualsToken,
  K_LessThanLessThanToken,
  K_LessThanToken,
  K_LineDirectiveTrivia,
  K_LoadDirectiveTrivia,
  K_MinusEqualsToken,
  K_MinusGreaterThanToken,
  K_MinusMinusToken,
  K_MinusToken,
  K_MultiLineCommentTrivia,
  K_MultiLineDocumentationCommentTrivia,
  K_MultiLineRawStringLiteralToken,
  K_NullableDirectiveTrivia,
  K_NumericLiteralToken,
  K_OpenBraceToken,
  K_OpenBracketToken,
  K_OpenParenToken,
  K_PercentEqualsToken,
  K_PercentToken,
  K_PlusEqualsToken,
  K_PlusPlusToken,
  K_PlusToken,
  K_PragmaChecksumDirectiveTrivia,
  K_PragmaWarningDirectiveTrivia,
  K_QuestionQuestionEqualsToken,
  K_QuestionQuestionToken,
  K_QuestionToken,
  K_ReferenceDirectiveTrivia,
  K_RegionDirectiveTrivia,
  K_SemicolonToken,
  K_ShebangDirectiveTrivia,
  K_SingleLineCommentTrivia,
  K_SingleLineDocumentationCommentTrivia,
  K_SingleLineRawStringLiteralToken,
  K_SlashEqualsToken,
  K_SlashToken,
  K_StringLiteralToken,
  K_TildeToken,
  K_UndefDirectiveTrivia,
  K_Utf8MultiLineRawStringLiteralToken,
  K_Utf8SingleLineRawStringLiteralToken,
  K_Utf8StringLiteralToken,
  K_WarningDirectiveTrivia,
  K_WhitespaceTrivia,
  csKeyword,
} from "./kinds";

// Interpolated string kinds.
const IS_NORMAL: i32 = 0;
const IS_VERBATIM: i32 = 1;
const IS_SINGLE_RAW: i32 = 2;
const IS_MULTI_RAW: i32 = 3;

/** Token flags. */
export const TF_HOLE_END: i32 = 1; // the ':' or '}' that ends an interpolation hole

/** The code point at s[p] (UTF-8), or -1 past `lim`. */
export const csCodePoint = (s: u8[], p: i32, lim: i32): i32 => {
  if (p >= lim) {
    return -1;
  }
  const c = toI32(s[p]);
  if (c < 0x80) {
    return c;
  }
  if (c < 0xc0) {
    return 0xfffd; // a continuation byte
  }
  if (c < 0xe0 && p + 1 < lim) {
    return ((c & 0x1f) << 6) | (toI32(s[p + 1]) & 0x3f);
  }
  if (c < 0xf0 && p + 2 < lim) {
    return ((c & 0x0f) << 12) | ((toI32(s[p + 1]) & 0x3f) << 6) | (toI32(s[p + 2]) & 0x3f);
  }
  if (p + 3 < lim) {
    return ((c & 0x07) << 18) | ((toI32(s[p + 1]) & 0x3f) << 12) | ((toI32(s[p + 2]) & 0x3f) << 6) | (toI32(s[p + 3]) & 0x3f);
  }
  return c;
};

/** The byte length of the UTF-8 sequence starting with byte c. */
export const csCpLen = (c: i32): i32 => (c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/** SyntaxFacts.IsWhitespace for a code point (not new lines). */
export const csIsWhitespaceCp = (c: i32): boolean => {
  if (c === 32 || c === 9 || c === 11 || c === 12 || c === 0x1a) {
    return true;
  }
  if (c < 0x80) {
    return false;
  }
  return c === 0xa0 || c === 0xfeff || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000;
};

/** SyntaxFacts.IsNewLine for a code point. */
export const csIsNewLineCp = (c: i32): boolean => c === 13 || c === 10 || c === 0x85 || c === 0x2028 || c === 0x2029;

const isIdentStartByte = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c >= 0x80;
const isIdentPartByte = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57) || c >= 0x80;
const isDigit = (c: i32): boolean => c >= 48 && c <= 57;
const isHexDigit = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/** The tokens and trivia of one file. */
export class CsLexer {
  src: u8[];
  lim: i32;
  pos: i32 = 0;
  err: boolean = false;
  errMsg: string = "";

  nt: i32 = 0;
  kind: i32[];
  ck: i32[]; // the contextual keyword kind of an identifier
  flags: i32[];
  start: i32[];
  end: i32[];
  l0: i32[];
  l1: i32[];
  t0: i32[];
  t1: i32[];
  parent: i32[];

  ntr: i32 = 0;
  trKind: i32[];
  trStart: i32[];
  trEnd: i32[]; // the end of the full text (a directive's line end included)
  trTextEnd: i32[]; // the end of ToString(): a directive without its line end
  trAux: i32[]; // the start of an #if/#elif condition

  // Preprocessor state.
  syms: string[];
  dirKind: i32[]; // 1 #if group, 2 #region
  dirTaken: i32[]; // for an #if group: a branch was taken
  dirElse: i32[]; // for an #if group: #else was seen
  nDir: i32 = 0;
  hasDirectives: boolean = false;
  sawToken: boolean = false;

  constructor(src: u8[], start: i32, lim: i32, syms: string[]) {
    this.src = src;
    this.pos = start;
    this.lim = lim;
    this.syms = syms;
    const cap = (lim - start) / 3 + 64;
    this.kind = new Array<i32>(cap);
    this.ck = new Array<i32>(cap);
    this.flags = new Array<i32>(cap);
    this.start = new Array<i32>(cap);
    this.end = new Array<i32>(cap);
    this.l0 = new Array<i32>(cap);
    this.l1 = new Array<i32>(cap);
    this.t0 = new Array<i32>(cap);
    this.t1 = new Array<i32>(cap);
    this.parent = new Array<i32>(cap);
    const tc = (lim - start) / 4 + 64;
    this.trKind = new Array<i32>(tc);
    this.trStart = new Array<i32>(tc);
    this.trEnd = new Array<i32>(tc);
    this.trTextEnd = new Array<i32>(tc);
    this.trAux = new Array<i32>(tc);
    this.dirKind = new Array<i32>(64);
    this.dirTaken = new Array<i32>(64);
    this.dirElse = new Array<i32>(64);
  }

  fail(msg: string): void {
    if (!this.err) {
      this.err = true;
      this.errMsg = `${msg} at ${this.pos}`;
    }
  }

  peek(i: i32): i32 {
    const p = this.pos + i;
    return p < this.lim ? toI32(this.src[p]) : -1;
  }

  cp(): i32 {
    return csCodePoint(this.src, this.pos, this.lim);
  }

  // ---- storage ----

  addTrivia(k: i32, a: i32, b: i32): i32 {
    const i = this.ntr;
    if (i >= toI32(this.trKind.length)) {
      const c = i * 2 + 16;
      this.trKind = growI32(this.trKind, c);
      this.trStart = growI32(this.trStart, c);
      this.trEnd = growI32(this.trEnd, c);
      this.trTextEnd = growI32(this.trTextEnd, c);
      this.trAux = growI32(this.trAux, c);
    }
    this.trKind[i] = k;
    this.trStart[i] = a;
    this.trEnd[i] = b;
    this.trTextEnd[i] = b;
    this.trAux[i] = -1;
    this.ntr = i + 1;
    return i;
  }

  addToken(k: i32, a: i32, b: i32, l0: i32, l1: i32): i32 {
    const i = this.nt;
    if (i >= toI32(this.kind.length)) {
      const c = i * 2 + 16;
      this.kind = growI32(this.kind, c);
      this.ck = growI32(this.ck, c);
      this.flags = growI32(this.flags, c);
      this.start = growI32(this.start, c);
      this.end = growI32(this.end, c);
      this.l0 = growI32(this.l0, c);
      this.l1 = growI32(this.l1, c);
      this.t0 = growI32(this.t0, c);
      this.t1 = growI32(this.t1, c);
      this.parent = growI32(this.parent, c);
    }
    this.kind[i] = k;
    this.ck[i] = 0;
    this.flags[i] = 0;
    this.start[i] = a;
    this.end[i] = b;
    this.l0[i] = l0;
    this.l1[i] = l1;
    this.t0[i] = this.ntr;
    this.t1[i] = this.ntr;
    this.parent[i] = -1;
    this.nt = i + 1;
    return i;
  }

  // ---- the main loop ----

  lexFile(): void {
    while (!this.err) {
      const l0 = this.ntr;
      this.lexTrivia(false);
      const l1 = this.ntr;
      if (this.pos >= this.lim) {
        if (this.nDir > 0) {
          this.fail("unterminated #if or #region");
        }
        this.addToken(K_EndOfFileToken, this.pos, this.pos, l0, l1);
        return;
      }
      this.lexToken(l0, l1);
    }
  }

  /** Scans one token at pos (after its leading trivia), then its trailing trivia. */
  lexToken(l0: i32, l1: i32): void {
    this.sawToken = true;
    const a = this.pos;
    const c = this.peek(0);
    let k = 0;
    switch (c) {
      case 34: // "
      case 39: // '
        k = this.scanStringLiteral();
        break;
      case 47: // /
        this.pos += 1;
        k = this.tryAdvance(61) ? K_SlashEqualsToken : K_SlashToken;
        break;
      case 46: // .
        if (isDigit(this.peek(1)) && !(a > 0 && toI32(this.src[a - 1]) === 46 && this.prevIsDotToken(a))) {
          k = this.scanNumericLiteral();
        } else {
          this.pos += 1;
          k = K_DotToken;
          if (this.peek(0) === 46) {
            // `..` is one token for Roslyn's parser (EatDotDotToken joins them); keep them apart here.
          }
        }
        break;
      case 44:
        this.pos += 1;
        k = K_CommaToken;
        break;
      case 58: // :
        this.pos += 1;
        k = this.tryAdvance(58) ? K_ColonColonToken : K_ColonToken;
        break;
      case 59:
        this.pos += 1;
        k = K_SemicolonToken;
        break;
      case 126:
        this.pos += 1;
        k = K_TildeToken;
        break;
      case 33: // !
        this.pos += 1;
        k = this.tryAdvance(61) ? K_ExclamationEqualsToken : K_ExclamationToken;
        break;
      case 61: // =
        this.pos += 1;
        k = this.tryAdvance(61) ? K_EqualsEqualsToken : this.tryAdvance(62) ? K_EqualsGreaterThanToken : K_EqualsToken;
        break;
      case 42:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_AsteriskEqualsToken : K_AsteriskToken;
        break;
      case 40:
        this.pos += 1;
        k = K_OpenParenToken;
        break;
      case 41:
        this.pos += 1;
        k = K_CloseParenToken;
        break;
      case 123:
        this.pos += 1;
        k = K_OpenBraceToken;
        break;
      case 125:
        this.pos += 1;
        k = K_CloseBraceToken;
        break;
      case 91:
        this.pos += 1;
        k = K_OpenBracketToken;
        break;
      case 93:
        this.pos += 1;
        k = K_CloseBracketToken;
        break;
      case 63: // ?
        this.pos += 1;
        if (this.tryAdvance(63)) {
          k = this.tryAdvance(61) ? K_QuestionQuestionEqualsToken : K_QuestionQuestionToken;
        } else {
          k = K_QuestionToken;
        }
        break;
      case 43:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_PlusEqualsToken : this.tryAdvance(43) ? K_PlusPlusToken : K_PlusToken;
        break;
      case 45:
        this.pos += 1;
        k = this.tryAdvance(61)
          ? K_MinusEqualsToken
          : this.tryAdvance(45)
            ? K_MinusMinusToken
            : this.tryAdvance(62)
              ? K_MinusGreaterThanToken
              : K_MinusToken;
        break;
      case 37:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_PercentEqualsToken : K_PercentToken;
        break;
      case 38:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_AmpersandEqualsToken : this.tryAdvance(38) ? K_AmpersandAmpersandToken : K_AmpersandToken;
        break;
      case 94:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_CaretEqualsToken : K_CaretToken;
        break;
      case 124:
        this.pos += 1;
        k = this.tryAdvance(61) ? K_BarEqualsToken : this.tryAdvance(124) ? K_BarBarToken : K_BarToken;
        break;
      case 60: // <
        this.pos += 1;
        if (this.tryAdvance(61)) {
          k = K_LessThanEqualsToken;
        } else if (this.tryAdvance(60)) {
          k = this.tryAdvance(61) ? K_LessThanLessThanEqualsToken : K_LessThanLessThanToken;
        } else {
          k = K_LessThanToken;
        }
        break;
      case 62: // >
        this.pos += 1;
        k = this.tryAdvance(61) ? K_GreaterThanEqualsToken : K_GreaterThanToken;
        break;
      case 64: {
        // @
        let i = 0;
        while (this.peek(i) === 64) {
          i++;
        }
        if (this.peek(i) === 34) {
          if (i > 1) {
            this.fail("bad @ sequence");
            return;
          }
          k = this.scanVerbatimString();
        } else if (this.peek(i) === 36) {
          this.lexInterpolatedString(l0, l1);
          return;
        } else if (i === 1 && this.isIdentStartAt(1)) {
          this.pos += 1;
          this.scanIdentChars();
          k = K_IdentifierToken;
          const t = this.addToken(k, a, this.pos, l0, l1);
          this.lexTrailing(t);
          return;
        } else {
          this.fail("bad @");
          return;
        }
        break;
      }
      case 36: {
        // $
        const c1 = this.peek(1);
        if (c1 === 36 || c1 === 64 || c1 === 34) {
          this.lexInterpolatedString(l0, l1);
          return;
        }
        this.fail("unexpected $");
        return;
      }
      default:
        if (isDigit(c)) {
          k = this.scanNumericLiteral();
        } else if (isIdentStartByte(c) || (c === 92 && this.peek(1) === 117)) {
          if (c >= 0x80) {
            const p = this.cp();
            if (csIsWhitespaceCp(p) || csIsNewLineCp(p)) {
              this.fail("unexpected character");
              return;
            }
          }
          this.scanIdentChars();
          const kw = csKeyword(this.src, a, this.pos - a);
          if (kw > 0) {
            k = kw;
          } else {
            k = K_IdentifierToken;
            const t = this.addToken(k, a, this.pos, l0, l1);
            this.ck[t] = -kw;
            this.lexTrailing(t);
            return;
          }
        } else {
          this.fail("unexpected character");
          return;
        }
        break;
    }
    if (this.err) {
      return;
    }
    const t = this.addToken(k, a, this.pos, l0, l1);
    this.lexTrailing(t);
  }

  prevIsDotToken(a: i32): boolean {
    // `..5` is a dot dot token followed by an integer, unless the first dot started a number.
    return this.nt > 0 && this.kind[this.nt - 1] === K_DotToken && this.end[this.nt - 1] === a;
  }

  tryAdvance(c: i32): boolean {
    if (this.peek(0) === c) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  lexTrailing(t: i32): void {
    this.t0[t] = this.ntr;
    this.lexTrivia(true);
    this.t1[t] = this.ntr;
  }

  isIdentStartAt(i: i32): boolean {
    const c = this.peek(i);
    if (c === 92 && this.peek(i + 1) === 117) {
      return true;
    }
    if (!isIdentStartByte(c)) {
      return false;
    }
    if (c >= 0x80) {
      const p = csCodePoint(this.src, this.pos + i, this.lim);
      return !csIsWhitespaceCp(p) && !csIsNewLineCp(p);
    }
    return true;
  }

  scanIdentChars(): void {
    while (this.pos < this.lim) {
      const c = toI32(this.src[this.pos]);
      if (c < 0x80) {
        if (isIdentPartByte(c)) {
          this.pos += 1;
        } else if (c === 92 && this.peek(1) === 117) {
          this.pos += 2;
          for (let i = 0; i < 4 && isHexDigit(this.peek(0)); i++) {
            this.pos += 1;
          }
        } else {
          return;
        }
      } else {
        const p = this.cp();
        if (csIsWhitespaceCp(p) || csIsNewLineCp(p)) {
          return;
        }
        this.pos += csCpLen(c);
      }
    }
  }

  // ---- literals ----

  scanNumericLiteral(): i32 {
    let isReal = false;
    let isHex = false;
    let isBinary = false;
    if (this.peek(0) === 48 && (this.peek(1) === 120 || this.peek(1) === 88)) {
      this.pos += 2;
      isHex = true;
      while (isHexDigit(this.peek(0)) || this.peek(0) === 95) {
        this.pos += 1;
      }
    } else if (this.peek(0) === 48 && (this.peek(1) === 98 || this.peek(1) === 66)) {
      this.pos += 2;
      isBinary = true;
      while (this.peek(0) === 48 || this.peek(0) === 49 || this.peek(0) === 95) {
        this.pos += 1;
      }
    } else {
      while (isDigit(this.peek(0)) || this.peek(0) === 95) {
        this.pos += 1;
      }
      if (this.peek(0) === 46 && isDigit(this.peek(1))) {
        isReal = true;
        this.pos += 1;
        while (isDigit(this.peek(0)) || this.peek(0) === 95) {
          this.pos += 1;
        }
      }
      const e = this.peek(0);
      if (e === 101 || e === 69) {
        const s = this.peek(1);
        if (isDigit(s) || ((s === 43 || s === 45) && isDigit(this.peek(2)))) {
          isReal = true;
          this.pos += s === 43 || s === 45 ? 2 : 1;
          while (isDigit(this.peek(0)) || this.peek(0) === 95) {
            this.pos += 1;
          }
        }
      }
    }
    const c = this.peek(0) | 32;
    if (!isHex && !isBinary && (c === 102 || c === 100 || c === 109)) {
      this.pos += 1;
    } else if (!isReal && (c === 117 || c === 108)) {
      this.pos += 1;
      const c2 = this.peek(0) | 32;
      if ((c === 117 && c2 === 108) || (c === 108 && c2 === 117)) {
        this.pos += 1;
      }
    }
    if (isIdentPartByte(this.peek(0)) && this.peek(0) < 0x80) {
      this.fail("bad numeric literal");
    }
    return K_NumericLiteralToken;
  }

  /** A "..." or '...' literal (or a raw string). */
  scanStringLiteral(): i32 {
    const q = this.peek(0);
    if (q === 34 && this.peek(1) === 34 && this.peek(2) === 34) {
      return this.scanRawString();
    }
    this.pos += 1;
    while (true) {
      const c = this.peek(0);
      if (c === 92) {
        this.pos += 2;
        continue;
      }
      if (c === q) {
        this.pos += 1;
        break;
      }
      if (c < 0 || c === 10 || c === 13 || csIsNewLineCp(this.cp())) {
        this.fail("newline in constant");
        return 0;
      }
      this.pos += 1;
    }
    if (q === 39) {
      return K_CharacterLiteralToken;
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.pos += 2;
      return K_Utf8StringLiteralToken;
    }
    return K_StringLiteralToken;
  }

  scanVerbatimString(): i32 {
    this.pos += 2; // @"
    while (true) {
      const c = this.peek(0);
      if (c < 0) {
        this.fail("unterminated verbatim string");
        return 0;
      }
      this.pos += 1;
      if (c === 34) {
        if (this.peek(0) === 34) {
          this.pos += 1;
          continue;
        }
        break;
      }
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.pos += 2;
      return K_Utf8StringLiteralToken;
    }
    return K_StringLiteralToken;
  }

  quoteRun(): i32 {
    let n = 0;
    while (this.peek(n) === 34) {
      n++;
    }
    return n;
  }

  skipWs(): void {
    while (this.pos < this.lim) {
      const c = toI32(this.src[this.pos]);
      if (c === 32 || c === 9 || c === 11 || c === 12) {
        this.pos += 1;
      } else if (c >= 0x80 && csIsWhitespaceCp(this.cp())) {
        this.pos += csCpLen(c);
      } else {
        return;
      }
    }
  }

  isNewLineHere(): boolean {
    const c = this.peek(0);
    return c === 10 || c === 13 || (c >= 0x80 && csIsNewLineCp(this.cp()));
  }

  advancePastNewLine(): void {
    const c = this.peek(0);
    if (c === 13 && this.peek(1) === 10) {
      this.pos += 2;
    } else if (c >= 0x80) {
      this.pos += csCpLen(c);
    } else {
      this.pos += 1;
    }
  }

  /** A non-interpolated raw string literal: """...""". */
  scanRawString(): i32 {
    const qn = this.quoteRun();
    this.pos += qn;
    const after = this.pos;
    this.skipWs();
    if (this.isNewLineHere()) {
      // multi-line
      this.advancePastNewLine();
      const first = this.pos;
      this.skipWs();
      if (this.quoteRun() >= qn) {
        this.fail("raw string must contain content");
        return 0;
      }
      this.pos = first;
      while (true) {
        if (this.pos >= this.lim) {
          this.fail("unterminated raw string");
          return 0;
        }
        if (this.isNewLineHere()) {
          const save = this.pos;
          this.advancePastNewLine();
          this.skipWs();
          const n = this.quoteRun();
          if (n >= qn) {
            if (n > qn) {
              this.fail("too many quotes");
              return 0;
            }
            this.pos += n;
            break;
          }
          this.pos = save;
          this.advancePastNewLine();
          continue;
        }
        if (this.peek(0) === 34) {
          const n = this.quoteRun();
          if (n >= qn) {
            this.fail("raw string delimiter on content line");
            return 0;
          }
          this.pos += n;
          continue;
        }
        this.pos += csCpLen(this.peek(0));
      }
      if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
        this.pos += 2;
        return K_Utf8MultiLineRawStringLiteralToken;
      }
      return K_MultiLineRawStringLiteralToken;
    }
    this.pos = after;
    while (true) {
      if (this.pos >= this.lim || this.isNewLineHere()) {
        this.fail("unterminated raw string");
        return 0;
      }
      if (this.peek(0) === 34) {
        const n = this.quoteRun();
        if (n >= qn) {
          if (n > qn) {
            this.fail("too many quotes");
            return 0;
          }
          this.pos += n;
          break;
        }
        this.pos += n;
        continue;
      }
      this.pos += csCpLen(this.peek(0));
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.pos += 2;
      return K_Utf8SingleLineRawStringLiteralToken;
    }
    return K_SingleLineRawStringLiteralToken;
  }

  // ---- interpolated strings ----

  /** Lexes $"...", $@"...", @$"..." or $$"""...""" as the token sequence Roslyn's parser builds from it. */
  lexInterpolatedString(l0: i32, l1: i32): void {
    const a = this.pos;
    let kind = IS_NORMAL;
    let dollars = 1;
    let quotes = 1;
    const c0 = this.peek(0);
    const c1 = this.peek(1);
    const c2 = this.peek(2);
    if ((c0 === 36 && c1 === 64 && c2 === 34) || (c0 === 64 && c1 === 36 && c2 === 34)) {
      kind = IS_VERBATIM;
      this.pos += 3;
    } else if (c0 === 36 && c1 === 34 && (c2 !== 34 || this.peek(3) !== 34)) {
      kind = IS_NORMAL;
      this.pos += 2;
    } else {
      if (c0 !== 36) {
        this.fail("bad interpolated string");
        return;
      }
      dollars = 0;
      while (this.peek(0) === 36) {
        dollars++;
        this.pos += 1;
      }
      quotes = this.quoteRun();
      if (quotes < 3) {
        this.fail("bad raw interpolated string");
        return;
      }
      this.pos += quotes;
      const after = this.pos;
      this.skipWs();
      if (this.isNewLineHere()) {
        this.advancePastNewLine();
        kind = IS_MULTI_RAW;
      } else {
        this.pos = after;
        kind = IS_SINGLE_RAW;
      }
    }
    const startKind =
      kind === IS_NORMAL
        ? K_InterpolatedStringStartToken
        : kind === IS_VERBATIM
          ? K_InterpolatedVerbatimStringStartToken
          : kind === IS_SINGLE_RAW
            ? K_InterpolatedSingleLineRawStringStartToken
            : K_InterpolatedMultiLineRawStringStartToken;
    this.addToken(startKind, a, this.pos, l0, l1);
    if (kind === IS_MULTI_RAW) {
      // `$"""` followed directly by the closing line is an error
      const save = this.pos;
      this.skipWs();
      if (this.quoteRun() >= quotes) {
        this.fail("raw string must contain content");
        return;
      }
      this.pos = save;
    }
    let textStart = this.pos;
    while (!this.err) {
      if (this.pos >= this.lim || (kind !== IS_VERBATIM && kind !== IS_MULTI_RAW && this.isNewLineHere())) {
        this.fail("unterminated interpolated string");
        return;
      }
      if (kind === IS_MULTI_RAW && this.isNewLineHere()) {
        const save = this.pos;
        this.advancePastNewLine();
        this.skipWs();
        const n = this.quoteRun();
        this.pos = save;
        if (n >= quotes) {
          // end of a multi-line raw string: the close range starts at the new line
          this.addText(textStart, this.pos);
          const ea = this.pos;
          this.advancePastNewLine();
          this.skipWs();
          if (this.quoteRun() > quotes) {
            this.fail("too many quotes");
            return;
          }
          this.pos += quotes;
          const t = this.addToken(K_InterpolatedRawStringEndToken, ea, this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        this.advancePastNewLine();
        continue;
      }
      const c = this.peek(0);
      if (c === 34) {
        if (kind === IS_NORMAL) {
          this.addText(textStart, this.pos);
          this.pos += 1;
          const t = this.addToken(K_InterpolatedStringEndToken, this.pos - 1, this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        if (kind === IS_VERBATIM) {
          if (this.peek(1) === 34) {
            this.pos += 2;
            continue;
          }
          this.addText(textStart, this.pos);
          this.pos += 1;
          const t = this.addToken(K_InterpolatedStringEndToken, this.pos - 1, this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        const n = this.quoteRun();
        if (n >= quotes) {
          if (kind === IS_MULTI_RAW) {
            this.fail("raw string delimiter on content line");
            return;
          }
          if (n > quotes) {
            this.fail("too many quotes");
            return;
          }
          this.addText(textStart, this.pos);
          const ea = this.pos;
          this.pos += n;
          const t = this.addToken(K_InterpolatedRawStringEndToken, ea, this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        this.pos += n;
        continue;
      }
      if (c === 125) {
        // }
        if (kind === IS_NORMAL || kind === IS_VERBATIM) {
          if (this.peek(1) !== 125) {
            this.fail("unescaped }");
            return;
          }
          this.pos += 2;
        } else {
          let n = 0;
          while (this.peek(n) === 125) {
            n++;
          }
          if (n >= dollars) {
            this.fail("too many close braces");
            return;
          }
          this.pos += n;
        }
        continue;
      }
      if (c === 123) {
        // {
        let openStart = this.pos;
        let openEnd = this.pos + 1;
        if (kind === IS_NORMAL || kind === IS_VERBATIM) {
          if (this.peek(1) === 123) {
            this.pos += 2;
            continue;
          }
        } else {
          let n = 0;
          while (this.peek(n) === 123) {
            n++;
          }
          if (n < dollars) {
            this.pos += n;
            continue;
          }
          if (n >= 2 * dollars) {
            this.fail("too many open braces");
            return;
          }
          openStart = this.pos + n - dollars;
          openEnd = this.pos + n;
        }
        this.addText(textStart, openStart);
        this.lexHole(kind, dollars, openStart, openEnd);
        if (this.err) {
          return;
        }
        textStart = this.pos;
        continue;
      }
      if (c === 92 && kind === IS_NORMAL) {
        this.pos += 2;
        continue;
      }
      this.pos += csCpLen(c);
    }
  }

  addText(a: i32, b: i32): void {
    if (b > a) {
      this.addToken(K_InterpolatedStringTextToken, a, b, this.ntr, this.ntr);
    }
  }

  /** One interpolation: its braces, the tokens of its expression, and its format. */
  lexHole(kind: i32, dollars: i32, openStart: i32, openEnd: i32): void {
    // Find the extent of the hole first, the way Roslyn's scanner does.
    this.pos = openEnd;
    const exprStart = this.pos;
    const colon = this.scanHoleBalanced(kind, 125, true);
    if (this.err) {
      return;
    }
    let exprEnd = this.pos;
    let fmtEnd = -1;
    if (colon >= 0) {
      exprEnd = colon;
      fmtEnd = this.pos;
    }
    // the close braces
    let closeEnd = this.pos;
    if (kind === IS_NORMAL || kind === IS_VERBATIM) {
      if (this.peek(0) !== 125) {
        this.fail("unclosed hole");
        return;
      }
      closeEnd = this.pos + 1;
    } else {
      let n = 0;
      while (this.peek(n) === 125) {
        n++;
      }
      if (n < dollars) {
        this.fail("not enough close braces");
        return;
      }
      closeEnd = this.pos + dollars;
    }
    const closeStart = this.pos;
    // Now lex: `{` with the trivia after it as trailing trivia.
    const saveLim = this.lim;
    const ob = this.addToken(K_OpenBraceToken, openStart, openEnd, this.ntr, this.ntr);
    this.pos = exprStart;
    this.lim = exprEnd;
    this.lexTrailing(ob);
    let lead0 = this.ntr;
    while (!this.err) {
      lead0 = this.ntr;
      this.lexTriviaNoDirectives();
      if (this.pos >= this.lim) {
        break;
      }
      this.lexToken(lead0, this.ntr);
    }
    const lead1 = this.ntr;
    this.lim = saveLim;
    if (this.err) {
      return;
    }
    if (colon >= 0) {
      const ct = this.addToken(K_ColonToken, colon, colon + 1, lead0, lead1);
      this.flags[ct] = TF_HOLE_END;
      this.addToken(K_InterpolatedStringTextToken, colon + 1, fmtEnd, this.ntr, this.ntr);
      const cb = this.addToken(K_CloseBraceToken, closeStart, closeEnd, this.ntr, this.ntr);
      this.flags[cb] = TF_HOLE_END;
    } else {
      const cb = this.addToken(K_CloseBraceToken, closeStart, closeEnd, lead0, lead1);
      this.flags[cb] = TF_HOLE_END;
    }
    this.pos = closeEnd;
  }

  /** ScanInterpolatedStringLiteralHoleBalancedText: leaves pos on the ending char; answers the top-level colon of a hole, or -1. */
  scanHoleBalanced(kind: i32, endingChar: i32, isHole: boolean): i32 {
    while (!this.err) {
      if (this.pos >= this.lim) {
        this.fail("unterminated hole");
        return -1;
      }
      const c = this.peek(0);
      switch (c) {
        case 35:
          this.fail("# in hole");
          return -1;
        case 36: {
          const c1 = this.peek(1);
          if (c1 === 36 || c1 === 64 || c1 === 34) {
            this.skipInterpolatedString();
            continue;
          }
          this.pos += 1;
          continue;
        }
        case 58:
          if (isHole) {
            const colon = this.pos;
            this.scanFormatSpecifier(kind);
            return colon;
          }
          this.pos += 1;
          continue;
        case 125:
        case 41:
        case 93:
          if (c === endingChar) {
            return -1;
          }
          this.fail("unbalanced hole");
          return -1;
        case 34:
          if (this.peek(1) === 34 && this.peek(2) === 34) {
            this.scanRawString();
          } else {
            this.scanStringLiteral();
          }
          continue;
        case 39:
          this.scanStringLiteral();
          continue;
        case 64: {
          let i = 0;
          while (this.peek(i) === 64) {
            i++;
          }
          if (this.peek(i) === 34) {
            this.scanVerbatimString();
            continue;
          }
          if (this.peek(i) === 36) {
            this.skipInterpolatedString();
            continue;
          }
          this.pos += 1;
          continue;
        }
        case 47:
          if (this.peek(1) === 47) {
            while (this.pos < this.lim && !this.isNewLineHere()) {
              this.pos += 1;
            }
            continue;
          }
          if (this.peek(1) === 42) {
            this.pos += 2;
            while (this.pos < this.lim && !(this.peek(0) === 42 && this.peek(1) === 47)) {
              this.pos += 1;
            }
            this.pos += 2;
            continue;
          }
          this.pos += 1;
          continue;
        case 123:
          this.pos += 1;
          this.scanHoleBalanced(kind, 125, false);
          if (this.peek(0) === 125) {
            this.pos += 1;
          }
          continue;
        case 40:
          this.pos += 1;
          this.scanHoleBalanced(kind, 41, false);
          if (this.peek(0) === 41) {
            this.pos += 1;
          }
          continue;
        case 91:
          this.pos += 1;
          this.scanHoleBalanced(kind, 93, false);
          if (this.peek(0) === 93) {
            this.pos += 1;
          }
          continue;
        default:
          this.pos += csCpLen(c);
          continue;
      }
    }
    return -1;
  }

  scanFormatSpecifier(kind: i32): void {
    this.pos += 1; // :
    while (true) {
      const c = this.peek(0);
      if (c === 92 && kind === IS_NORMAL) {
        this.pos += 2;
      } else if (c === 34) {
        if (kind === IS_VERBATIM && this.peek(1) === 34) {
          this.pos += 2;
        } else {
          return;
        }
      } else if (c === 123) {
        this.fail("{ in format");
        return;
      } else if (c === 125 || c < 0) {
        return;
      } else {
        this.pos += csCpLen(c);
      }
    }
  }

  /** Skips a nested interpolated string inside a hole (its extent only). */
  skipInterpolatedString(): void {
    // Lex it into scratch tokens and drop them: simplest way to find the extent.
    const saveNt = this.nt;
    const saveNtr = this.ntr;
    this.lexInterpolatedString(this.ntr, this.ntr);
    // the trailing trivia was lexed too; rewind to the end token's text end
    if (!this.err) {
      this.pos = this.end[this.nt - 1];
    }
    this.nt = saveNt;
    this.ntr = saveNtr;
  }

  // ---- trivia ----

  lexTriviaNoDirectives(): void {
    this.lexTriviaImpl(false, false);
  }

  lexTrivia(isTrailing: boolean): void {
    this.lexTriviaImpl(isTrailing, true);
  }

  lexTriviaImpl(isTrailing: boolean, allowDirectives: boolean): void {
    let onlyWhitespaceOnLine = !isTrailing;
    while (!this.err && this.pos < this.lim) {
      const a = this.pos;
      let c = toI32(this.src[a]);
      if (c >= 0x80) {
        const p = this.cp();
        if (csIsWhitespaceCp(p)) {
          c = 32;
        } else if (csIsNewLineCp(p)) {
          c = 10;
        }
      }
      if (c === 32 || c === 9 || c === 11 || c === 12 || c === 0x1a) {
        this.skipWs();
        if (this.pos === a) {
          this.pos += 1;
          while (this.pos < this.lim && toI32(this.src[this.pos]) === 0x1a) {
            this.pos += 1;
          }
          this.skipWs();
        }
        this.addTrivia(K_WhitespaceTrivia, a, this.pos);
        continue;
      }
      if (c === 47) {
        const c1 = this.peek(1);
        if (c1 === 47) {
          if (this.peek(2) === 47 && this.peek(3) !== 47) {
            if (isTrailing) {
              return;
            }
            this.lexSingleLineDocComment();
            continue;
          }
          while (this.pos < this.lim && !this.isNewLineHere()) {
            this.pos += 1;
          }
          this.addTrivia(K_SingleLineCommentTrivia, a, this.pos);
          onlyWhitespaceOnLine = false;
          continue;
        }
        if (c1 === 42) {
          const isDoc = this.peek(2) === 42 && this.peek(3) !== 42 && this.peek(3) !== 47;
          if (isDoc && isTrailing) {
            return;
          }
          this.pos += 2;
          while (true) {
            if (this.pos >= this.lim) {
              this.fail("open ended comment");
              return;
            }
            if (this.peek(0) === 42 && this.peek(1) === 47) {
              this.pos += 2;
              break;
            }
            this.pos += 1;
          }
          this.addTrivia(isDoc ? K_MultiLineDocumentationCommentTrivia : K_MultiLineCommentTrivia, a, this.pos);
          onlyWhitespaceOnLine = false;
          continue;
        }
        return;
      }
      if (c === 13 || c === 10) {
        this.advancePastNewLine();
        this.addTrivia(K_EndOfLineTrivia, a, this.pos);
        if (isTrailing) {
          return;
        }
        onlyWhitespaceOnLine = true;
        continue;
      }
      if (c === 35 && allowDirectives) {
        if (isTrailing || !onlyWhitespaceOnLine) {
          this.fail("bad directive placement");
          return;
        }
        this.lexDirectiveAndExcluded();
        onlyWhitespaceOnLine = true;
        continue;
      }
      if ((c === 60 || c === 61 || c === 124 || c === 62) && !isTrailing && this.isConflictMarker()) {
        this.fail("conflict marker");
        return;
      }
      return;
    }
  }

  isConflictMarker(): boolean {
    const c = this.peek(0);
    const a = this.pos;
    if (a > 0) {
      const p = toI32(this.src[a - 1]);
      if (p !== 10 && p !== 13) {
        return false;
      }
    }
    for (let i = 1; i < 7; i++) {
      if (this.peek(i) !== c) {
        return false;
      }
    }
    return c === 61 || this.peek(7) === 32;
  }

  lexSingleLineDocComment(): void {
    const a = this.pos;
    while (true) {
      // the rest of this /// line, with its new line
      while (this.pos < this.lim && !this.isNewLineHere()) {
        this.pos += 1;
      }
      if (this.pos >= this.lim) {
        break;
      }
      this.advancePastNewLine();
      const lineStart = this.pos;
      this.skipWs();
      if (this.peek(0) === 47 && this.peek(1) === 47 && this.peek(2) === 47 && this.peek(3) !== 47) {
        continue;
      }
      this.pos = lineStart;
      break;
    }
    this.addTrivia(K_SingleLineDocumentationCommentTrivia, a, this.pos);
  }

  // ---- preprocessor ----

  isDefined(a: i32, b: i32): boolean {
    const name = String.fromBytes(this.src, a, b);
    for (const s of this.syms) {
      if (s === name) {
        return true;
      }
    }
    return false;
  }

  define(a: i32, b: i32, on: boolean): void {
    const name = String.fromBytes(this.src, a, b);
    if (on) {
      if (!this.isDefined(a, b)) {
        this.syms.push(name);
      }
      return;
    }
    const keep: string[] = [];
    for (const s of this.syms) {
      if (s !== name) {
        keep.push(s);
      }
    }
    this.syms = keep;
  }

  pushDir(kind: i32, taken: boolean): void {
    if (this.nDir >= toI32(this.dirKind.length)) {
      const c = this.nDir * 2;
      this.dirKind = growI32(this.dirKind, c);
      this.dirTaken = growI32(this.dirTaken, c);
      this.dirElse = growI32(this.dirElse, c);
    }
    this.dirKind[this.nDir] = kind;
    this.dirTaken[this.nDir] = taken ? 1 : 0;
    this.dirElse[this.nDir] = 0;
    this.nDir += 1;
  }

  lexDirectiveAndExcluded(): void {
    const taken = this.lexDirective(true, true);
    if (taken === 0) {
      this.lexExcluded(true);
    }
  }

  /** Disabled text and the directives in it, until a taken branch or the #endif of this group. */
  lexExcluded(endIsActive: boolean): void {
    while (!this.err) {
      const followed = this.lexDisabledText();
      if (!followed) {
        return;
      }
      const lead = this.pos;
      this.skipWs();
      if (this.pos > lead) {
        this.addTrivia(K_WhitespaceTrivia, lead, this.pos);
      }
      const t = this.lexDirectiveCore(false, endIsActive);
      const k = this.trKind[this.ntr - 1];
      if (k === K_EndIfDirectiveTrivia || t === 1) {
        return;
      }
      if (k === K_IfDirectiveTrivia) {
        this.lexExcluded(false);
      }
    }
  }

  /** Consumes text up to the line of the next directive; answers whether a directive follows. */
  lexDisabledText(): boolean {
    const a = this.pos;
    let lastLineStart = this.pos;
    let allWhitespace = true;
    while (true) {
      if (this.pos >= this.lim) {
        if (this.pos > a) {
          this.addTrivia(K_DisabledTextTrivia, a, this.pos);
        }
        return false;
      }
      const c = toI32(this.src[this.pos]);
      if (c === 35) {
        if (lastLineStart < this.pos && !allWhitespace) {
          this.pos += 1;
          continue;
        }
        this.pos = lastLineStart;
        if (this.pos > a) {
          this.addTrivia(K_DisabledTextTrivia, a, this.pos);
        }
        return true;
      }
      if (c === 13 || c === 10 || (c >= 0x80 && csIsNewLineCp(this.cp()))) {
        this.advancePastNewLine();
        lastLineStart = this.pos;
        allWhitespace = true;
        continue;
      }
      if (c >= 0x80) {
        allWhitespace = allWhitespace && csIsWhitespaceCp(this.cp());
        this.pos += csCpLen(c);
      } else {
        allWhitespace = allWhitespace && (c === 32 || c === 9 || c === 11 || c === 12);
        this.pos += 1;
      }
    }
  }

  /** Lexes a directive in active code; answers 1 taken, 0 not taken, -1 not a branching directive. */
  lexDirective(isActive: boolean, endIsActive: boolean): i32 {
    return this.lexDirectiveCore(isActive, endIsActive);
  }

  skipDirWs(): void {
    while (this.pos < this.lim) {
      const c = toI32(this.src[this.pos]);
      if (c === 32 || c === 9 || c === 11 || c === 12) {
        this.pos += 1;
      } else if (c >= 0x80 && csIsWhitespaceCp(this.cp())) {
        this.pos += csCpLen(c);
      } else {
        return;
      }
    }
  }

  /** At the end of a directive: only whitespace and a // comment may follow. */
  endOfDirective(isActive: boolean): void {
    this.skipDirWs();
    if (this.peek(0) === 47 && this.peek(1) === 47) {
      while (this.pos < this.lim && !this.isNewLineHere()) {
        this.pos += 1;
      }
    }
    if (this.pos < this.lim && !this.isNewLineHere()) {
      if (isActive) {
        this.fail("end of directive expected");
      }
      while (this.pos < this.lim && !this.isNewLineHere()) {
        this.pos += 1;
      }
    }
  }

  toEndOfLine(): void {
    while (this.pos < this.lim && !this.isNewLineHere()) {
      this.pos += 1;
    }
  }

  dirWordEnd(): i32 {
    let p = this.pos;
    while (p < this.lim && isIdentPartByte(toI32(this.src[p]))) {
      p++;
    }
    return p;
  }

  isWord(a: i32, b: i32, w: string): boolean {
    if (b - a !== toI32(w.length)) {
      return false;
    }
    for (let i = 0; i < b - a; i++) {
      if (toI32(this.src[a + i]) !== w.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  lexDirectiveCore(isActive: boolean, endIsActive: boolean): i32 {
    this.hasDirectives = true;
    const a = this.pos;
    this.pos += 1; // #
    const hashEnd = this.pos;
    this.skipDirWs();
    const ka = this.pos;
    const kb = this.dirWordEnd();
    this.pos = kb;
    let kind = K_BadDirectiveTrivia;
    let taken = -1;
    let aux = -1;
    if (this.isWord(ka, kb, "if")) {
      kind = K_IfDirectiveTrivia;
      this.skipDirWs();
      aux = this.pos;
      const v = this.ppExpr(isActive);
      this.endOfDirective(true);
      const t = isActive && v;
      this.pushDir(1, t);
      taken = t ? 1 : 0;
    } else if (this.isWord(ka, kb, "elif")) {
      kind = K_ElifDirectiveTrivia;
      this.skipDirWs();
      aux = this.pos;
      const v = this.ppExpr(endIsActive);
      this.endOfDirective(true);
      if (this.nDir === 0 || this.dirKind[this.nDir - 1] !== 1 || this.dirElse[this.nDir - 1] === 1) {
        this.fail("unexpected #elif");
        return -1;
      }
      const t = endIsActive && v && this.dirTaken[this.nDir - 1] === 0;
      if (t) {
        this.dirTaken[this.nDir - 1] = 1;
      }
      taken = t ? 1 : 0;
    } else if (this.isWord(ka, kb, "else")) {
      kind = K_ElseDirectiveTrivia;
      this.endOfDirective(true);
      if (this.nDir === 0 || this.dirKind[this.nDir - 1] !== 1 || this.dirElse[this.nDir - 1] === 1) {
        this.fail("unexpected #else");
        return -1;
      }
      const t = endIsActive && this.dirTaken[this.nDir - 1] === 0;
      if (t) {
        this.dirTaken[this.nDir - 1] = 1;
      }
      this.dirElse[this.nDir - 1] = 1;
      taken = t ? 1 : 0;
    } else if (this.isWord(ka, kb, "endif")) {
      kind = K_EndIfDirectiveTrivia;
      this.endOfDirective(true);
      if (this.nDir === 0 || this.dirKind[this.nDir - 1] !== 1) {
        this.fail("unexpected #endif");
        return -1;
      }
      this.nDir -= 1;
    } else if (this.isWord(ka, kb, "region")) {
      kind = K_RegionDirectiveTrivia;
      this.toEndOfLine();
      this.pushDir(2, false);
    } else if (this.isWord(ka, kb, "endregion")) {
      kind = K_EndRegionDirectiveTrivia;
      this.toEndOfLine();
      if (this.nDir === 0 || this.dirKind[this.nDir - 1] !== 2) {
        this.fail("unexpected #endregion");
        return -1;
      }
      this.nDir -= 1;
    } else if (this.isWord(ka, kb, "define") || this.isWord(ka, kb, "undef")) {
      const isDefine = this.isWord(ka, kb, "define");
      kind = isDefine ? K_DefineDirectiveTrivia : K_UndefDirectiveTrivia;
      if (isActive && this.sawToken) {
        this.fail("#define after a token");
        return -1;
      }
      this.skipDirWs();
      const na = this.pos;
      const nb = this.dirWordEnd();
      if (nb === na) {
        if (isActive) {
          this.fail("identifier expected");
          return -1;
        }
      }
      this.pos = nb;
      this.endOfDirective(isActive);
      if (isActive) {
        this.define(na, nb, isDefine);
      }
    } else if (this.isWord(ka, kb, "error") || this.isWord(ka, kb, "warning")) {
      kind = this.isWord(ka, kb, "error") ? K_ErrorDirectiveTrivia : K_WarningDirectiveTrivia;
      this.toEndOfLine();
    } else if (this.isWord(ka, kb, "line")) {
      kind = K_LineDirectiveTrivia;
      this.toEndOfLine();
    } else if (this.isWord(ka, kb, "pragma")) {
      this.skipDirWs();
      const wa = this.pos;
      const wb = this.dirWordEnd();
      kind = this.isWord(wa, wb, "checksum") ? K_PragmaChecksumDirectiveTrivia : K_PragmaWarningDirectiveTrivia;
      this.toEndOfLine();
    } else if (this.isWord(ka, kb, "nullable")) {
      kind = K_NullableDirectiveTrivia;
      this.toEndOfLine();
    } else if (this.isWord(ka, kb, "r")) {
      kind = K_ReferenceDirectiveTrivia;
      this.toEndOfLine();
    } else if (this.isWord(ka, kb, "load")) {
      kind = K_LoadDirectiveTrivia;
      this.toEndOfLine();
    } else if (ka === hashEnd && this.peek(0) === 33) {
      kind = K_ShebangDirectiveTrivia;
      if (isActive && a !== 0) {
        this.fail("shebang not on first line");
        return -1;
      }
      this.toEndOfLine();
    } else if (ka === hashEnd && this.peek(0) === 58) {
      kind = K_IgnoredDirectiveTrivia;
      this.toEndOfLine();
    } else {
      if (isActive) {
        this.fail("directive expected");
        return -1;
      }
      this.toEndOfLine();
    }
    if (this.err) {
      return -1;
    }
    const textEnd = this.pos;
    if (this.pos < this.lim) {
      this.advancePastNewLine();
    }
    const i = this.addTrivia(kind, a, this.pos);
    this.trTextEnd[i] = textEnd;
    this.trAux[i] = aux;
    return taken;
  }

  // The preprocessor expression grammar of Roslyn's DirectiveParser.

  ppExpr(report: boolean): boolean {
    const v = this.ppOr(report);
    return v;
  }

  ppOr(report: boolean): boolean {
    let v = this.ppAnd(report);
    while (true) {
      this.skipDirWs();
      if (this.peek(0) === 124 && this.peek(1) === 124) {
        this.pos += 2;
        const r = this.ppAnd(report);
        v = v || r;
      } else {
        return v;
      }
    }
  }

  ppAnd(report: boolean): boolean {
    let v = this.ppEq(report);
    while (true) {
      this.skipDirWs();
      if (this.peek(0) === 38 && this.peek(1) === 38) {
        this.pos += 2;
        const r = this.ppEq(report);
        v = v && r;
      } else {
        return v;
      }
    }
  }

  ppEq(report: boolean): boolean {
    let v = this.ppNot(report);
    while (true) {
      this.skipDirWs();
      if ((this.peek(0) === 61 || this.peek(0) === 33) && this.peek(1) === 61) {
        const eq = this.peek(0) === 61;
        this.pos += 2;
        const r = this.ppNot(report);
        v = eq ? v === r : v !== r;
      } else {
        return v;
      }
    }
  }

  ppNot(report: boolean): boolean {
    this.skipDirWs();
    if (this.peek(0) === 33 && this.peek(1) !== 61) {
      this.pos += 1;
      return !this.ppNot(report);
    }
    return this.ppPrimary(report);
  }

  ppPrimary(report: boolean): boolean {
    this.skipDirWs();
    const c = this.peek(0);
    if (c === 40) {
      this.pos += 1;
      const v = this.ppOr(report);
      this.skipDirWs();
      if (this.peek(0) !== 41) {
        this.fail(") expected in directive");
        return false;
      }
      this.pos += 1;
      return v;
    }
    if (isIdentStartByte(c)) {
      const a = this.pos;
      const b = this.dirWordEnd();
      this.pos = b;
      if (this.isWord(a, b, "true")) {
        return true;
      }
      if (this.isWord(a, b, "false")) {
        return false;
      }
      return this.isDefined(a, b);
    }
    this.fail("bad directive expression");
    return false;
  }
}
