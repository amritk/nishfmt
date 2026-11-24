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

import { add32, bytesText, growI32, newI32s, newU8s, sub32 } from "../core/arr";
import { fault } from "../core/fault";
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
  if (p < 0 || p >= s.length || p > 2000000000) {
    fault();
    return -1;
  }
  const c = toI32(s[p]);
  if (c < 0x80) {
    return c;
  }
  if (c < 0xc0) {
    return 0xfffd; // a continuation byte
  }
  // p <= 2000000000, so p + 3 fits
  const p1 = p + 1;
  const p2 = p + 2;
  const p3 = p + 3;
  if (c < 0xe0 && p1 < lim) {
    if (p1 >= s.length) {
      fault();
      return -1;
    }
    return ((c & 0x1f) << 6) | (toI32(s[p1]) & 0x3f);
  }
  if (c < 0xf0 && p2 < lim) {
    if (p1 >= s.length || p2 >= s.length) {
      fault();
      return -1;
    }
    return ((c & 0x0f) << 12) | ((toI32(s[p1]) & 0x3f) << 6) | (toI32(s[p2]) & 0x3f);
  }
  if (p3 < lim) {
    if (p1 >= s.length || p2 >= s.length || p3 >= s.length) {
      fault();
      return -1;
    }
    return ((c & 0x07) << 18) | ((toI32(s[p1]) & 0x3f) << 12) | ((toI32(s[p2]) & 0x3f) << 6) | (toI32(s[p3]) & 0x3f);
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
  return (
    c === 0xa0 ||
    c === 0xfeff ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000
  );
};

/** SyntaxFacts.IsNewLine for a code point. */
export const csIsNewLineCp = (c: i32): boolean => c === 13 || c === 10 || c === 0x85 || c === 0x2028 || c === 0x2029;

const csIsIdentStartByte = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c >= 0x80;
const csIsIdentPartByte = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57) || c >= 0x80;
const csIsDigit = (c: i32): boolean => c >= 48 && c <= 57;
const csIsHexDigit = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/**
 * At least n zeroes, for the columns sized up front: one of the lengths below,
 * each at most a fifth above the last, a literal the compiler proves, where
 * newI32s pushes one zero at a time. A column that outgrows it is pushed to.
 */
export const csZeroI32s = (n: i32): i32[] => {
  if (n <= 1024) {
    return new Array<i32>(1024);
  }
  if (n <= 2048) {
    return new Array<i32>(2048);
  }
  if (n <= 4096) {
    return new Array<i32>(4096);
  }
  if (n <= 4864) {
    return new Array<i32>(4864);
  }
  if (n <= 5824) {
    return new Array<i32>(5824);
  }
  if (n <= 6912) {
    return new Array<i32>(6912);
  }
  if (n <= 8192) {
    return new Array<i32>(8192);
  }
  if (n <= 9728) {
    return new Array<i32>(9728);
  }
  if (n <= 11584) {
    return new Array<i32>(11584);
  }
  if (n <= 13760) {
    return new Array<i32>(13760);
  }
  if (n <= 16384) {
    return new Array<i32>(16384);
  }
  if (n <= 19456) {
    return new Array<i32>(19456);
  }
  if (n <= 23168) {
    return new Array<i32>(23168);
  }
  if (n <= 27584) {
    return new Array<i32>(27584);
  }
  if (n <= 32768) {
    return new Array<i32>(32768);
  }
  if (n <= 38976) {
    return new Array<i32>(38976);
  }
  if (n <= 46336) {
    return new Array<i32>(46336);
  }
  if (n <= 55104) {
    return new Array<i32>(55104);
  }
  if (n <= 65536) {
    return new Array<i32>(65536);
  }
  if (n <= 77952) {
    return new Array<i32>(77952);
  }
  if (n <= 92672) {
    return new Array<i32>(92672);
  }
  if (n <= 110208) {
    return new Array<i32>(110208);
  }
  if (n <= 131072) {
    return new Array<i32>(131072);
  }
  if (n <= 155840) {
    return new Array<i32>(155840);
  }
  if (n <= 185344) {
    return new Array<i32>(185344);
  }
  if (n <= 220416) {
    return new Array<i32>(220416);
  }
  if (n <= 262144) {
    return new Array<i32>(262144);
  }
  if (n <= 311744) {
    return new Array<i32>(311744);
  }
  if (n <= 370752) {
    return new Array<i32>(370752);
  }
  if (n <= 440896) {
    return new Array<i32>(440896);
  }
  if (n <= 524288) {
    return new Array<i32>(524288);
  }
  if (n <= 623488) {
    return new Array<i32>(623488);
  }
  if (n <= 741440) {
    return new Array<i32>(741440);
  }
  if (n <= 881728) {
    return new Array<i32>(881728);
  }
  if (n <= 1048576) {
    return new Array<i32>(1048576);
  }
  if (n <= 1246976) {
    return new Array<i32>(1246976);
  }
  if (n <= 1482880) {
    return new Array<i32>(1482880);
  }
  if (n <= 1763456) {
    return new Array<i32>(1763456);
  }
  if (n <= 2097152) {
    return new Array<i32>(2097152);
  }
  if (n <= 2493952) {
    return new Array<i32>(2493952);
  }
  if (n <= 2965824) {
    return new Array<i32>(2965824);
  }
  if (n <= 3526976) {
    return new Array<i32>(3526976);
  }
  if (n <= 4194304) {
    return new Array<i32>(4194304);
  }
  return newI32s(n);
};

/** At least n zero bytes, as csZeroI32s sizes them. */
export const csZeroU8s = (n: i32): u8[] => {
  if (n <= 1024) {
    return new Array<u8>(1024);
  }
  if (n <= 2048) {
    return new Array<u8>(2048);
  }
  if (n <= 4096) {
    return new Array<u8>(4096);
  }
  if (n <= 4864) {
    return new Array<u8>(4864);
  }
  if (n <= 5824) {
    return new Array<u8>(5824);
  }
  if (n <= 6912) {
    return new Array<u8>(6912);
  }
  if (n <= 8192) {
    return new Array<u8>(8192);
  }
  if (n <= 9728) {
    return new Array<u8>(9728);
  }
  if (n <= 11584) {
    return new Array<u8>(11584);
  }
  if (n <= 13760) {
    return new Array<u8>(13760);
  }
  if (n <= 16384) {
    return new Array<u8>(16384);
  }
  if (n <= 19456) {
    return new Array<u8>(19456);
  }
  if (n <= 23168) {
    return new Array<u8>(23168);
  }
  if (n <= 27584) {
    return new Array<u8>(27584);
  }
  if (n <= 32768) {
    return new Array<u8>(32768);
  }
  if (n <= 38976) {
    return new Array<u8>(38976);
  }
  if (n <= 46336) {
    return new Array<u8>(46336);
  }
  if (n <= 55104) {
    return new Array<u8>(55104);
  }
  if (n <= 65536) {
    return new Array<u8>(65536);
  }
  if (n <= 77952) {
    return new Array<u8>(77952);
  }
  if (n <= 92672) {
    return new Array<u8>(92672);
  }
  if (n <= 110208) {
    return new Array<u8>(110208);
  }
  if (n <= 131072) {
    return new Array<u8>(131072);
  }
  if (n <= 155840) {
    return new Array<u8>(155840);
  }
  if (n <= 185344) {
    return new Array<u8>(185344);
  }
  if (n <= 220416) {
    return new Array<u8>(220416);
  }
  if (n <= 262144) {
    return new Array<u8>(262144);
  }
  if (n <= 311744) {
    return new Array<u8>(311744);
  }
  if (n <= 370752) {
    return new Array<u8>(370752);
  }
  if (n <= 440896) {
    return new Array<u8>(440896);
  }
  if (n <= 524288) {
    return new Array<u8>(524288);
  }
  if (n <= 623488) {
    return new Array<u8>(623488);
  }
  if (n <= 741440) {
    return new Array<u8>(741440);
  }
  if (n <= 881728) {
    return new Array<u8>(881728);
  }
  if (n <= 1048576) {
    return new Array<u8>(1048576);
  }
  if (n <= 1246976) {
    return new Array<u8>(1246976);
  }
  if (n <= 1482880) {
    return new Array<u8>(1482880);
  }
  if (n <= 1763456) {
    return new Array<u8>(1763456);
  }
  if (n <= 2097152) {
    return new Array<u8>(2097152);
  }
  if (n <= 2493952) {
    return new Array<u8>(2493952);
  }
  if (n <= 2965824) {
    return new Array<u8>(2965824);
  }
  if (n <= 3526976) {
    return new Array<u8>(3526976);
  }
  if (n <= 4194304) {
    return new Array<u8>(4194304);
  }
  return newU8s(n);
};

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
    // Capacities only: a column past its capacity is pushed to.
    let span = 0;
    const w = toI64(lim) - toI64(start);
    if (w >= toI64(0) && w <= toI64(1073741823)) {
      span = toI32(w);
    }
    const cap = span / 5 + 64;
    this.kind = csZeroI32s(cap);
    this.ck = csZeroI32s(cap);
    this.flags = csZeroI32s(cap);
    this.start = csZeroI32s(cap);
    this.end = csZeroI32s(cap);
    this.l0 = csZeroI32s(cap);
    this.l1 = csZeroI32s(cap);
    this.t0 = csZeroI32s(cap);
    this.t1 = csZeroI32s(cap);
    this.parent = csZeroI32s(cap);
    const tc = span / 10 + 64;
    this.trKind = csZeroI32s(tc);
    this.trStart = csZeroI32s(tc);
    this.trEnd = csZeroI32s(tc);
    this.trTextEnd = csZeroI32s(tc);
    this.trAux = csZeroI32s(tc);
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
    const p = toI64(this.pos) + toI64(i);
    if (p >= toI64(0) && p < toI64(this.lim)) {
      const k = toI32(p);
      const src = this.src;
      if (k >= 0 && k < src.length) {
        return toI32(src[k]);
      }
      fault();
    } else if (p > toI64(2147483647)) {
      fault();
    }
    return -1;
  }

  /** The byte at pos, or -1 at or past lim. */
  cur(): i32 {
    const p = this.pos;
    if (p >= 0 && p < this.lim) {
      const src = this.src;
      if (p < src.length) {
        return toI32(src[p]);
      }
      fault();
    }
    return -1;
  }

  /** The byte at p, which lies inside src; -1 after a fault when it does not. */
  byteAt(p: i32): i32 {
    const src = this.src;
    if (p >= 0 && p < src.length) {
      return toI32(src[p]);
    }
    fault();
    return -1;
  }

  /** Moves pos on by k bytes. */
  adv(k: i32): void {
    const r = toI64(this.pos) + toI64(k);
    if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
      this.pos = toI32(r);
      return;
    }
    this.lexFault();
  }

  /** a + b for a position pos is set to; past i32, which no file reaches, lim after giving up on the file. */
  posSum(a: i32, b: i32): i32 {
    const r = toI64(a) + toI64(b);
    if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
      return toI32(r);
    }
    this.lexFault();
    return this.lim;
  }

  /** Gives up on the file at a position or count no file reaches: every loop ends at lim or on err. */
  lexFault(): void {
    fault();
    this.fail("out of range");
    this.pos = this.lim;
  }

  /** The number of bytes equal to c from pos on, before lim. */
  runOf(c: i32): i32 {
    const src = this.src;
    const lim = this.lim;
    const a = this.pos;
    if (a < 0) {
      return 0;
    }
    let p = a;
    while (p >= 0 && p < lim && p < src.length && toI32(src[p]) === c) {
      p++;
    }
    if (p < lim && p >= src.length) {
      fault();
    }
    return p - a;
  }

  cp(): i32 {
    return csCodePoint(this.src, this.pos, this.lim);
  }

  // ---- storage ----

  /** Adds trivia at ntr: written in place, or pushed past a column's end (the columns are written together, so all are). */
  addTrivia(k: i32, a: i32, b: i32): i32 {
    const i = this.ntr;
    const trKind = this.trKind;
    const trStart = this.trStart;
    const trEnd = this.trEnd;
    const trTextEnd = this.trTextEnd;
    const trAux = this.trAux;
    if (i < 0 || i > 1000000000) {
      this.lexFault();
      return -1;
    }
    if (i < trKind.length && i < trStart.length && i < trEnd.length && i < trTextEnd.length && i < trAux.length) {
      trKind[i] = k;
      trStart[i] = a;
      trEnd[i] = b;
      trTextEnd[i] = b;
      trAux[i] = -1;
    } else if (i === trKind.length) {
      trKind.push(k);
      trStart.push(a);
      trEnd.push(b);
      trTextEnd.push(b);
      trAux.push(-1);
    } else {
      this.lexFault();
      return -1;
    }
    this.ntr = i + 1;
    return i;
  }

  /** Adds a token at nt: written in place, or pushed past a column's end (the columns are written together, so all are). */
  addToken(k: i32, a: i32, b: i32, l0: i32, l1: i32): i32 {
    const i = this.nt;
    const ntr = this.ntr;
    const kind = this.kind;
    const ck = this.ck;
    const flags = this.flags;
    const start = this.start;
    const end = this.end;
    const tl0 = this.l0;
    const tl1 = this.l1;
    const t0 = this.t0;
    const t1 = this.t1;
    const parent = this.parent;
    if (i < 0 || i > 1000000000) {
      this.lexFault();
      return -1;
    }
    if (
      i < kind.length &&
      i < ck.length &&
      i < flags.length &&
      i < start.length &&
      i < end.length &&
      i < tl0.length &&
      i < tl1.length &&
      i < t0.length &&
      i < t1.length &&
      i < parent.length
    ) {
      kind[i] = k;
      ck[i] = 0;
      flags[i] = 0;
      start[i] = a;
      end[i] = b;
      tl0[i] = l0;
      tl1[i] = l1;
      t0[i] = ntr;
      t1[i] = ntr;
      parent[i] = -1;
    } else if (i === kind.length) {
      kind.push(k);
      ck.push(0);
      flags.push(0);
      start.push(a);
      end.push(b);
      tl0.push(l0);
      tl1.push(l1);
      t0.push(ntr);
      t1.push(ntr);
      parent.push(-1);
    } else {
      this.lexFault();
      return -1;
    }
    this.nt = i + 1;
    return i;
  }

  /** The start of trivia i; 0 after a fault when there is none. */
  trStartAt(i: i32): i32 {
    const xs = this.trStart;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The end of trivia i (a directive's line end included); 0 after a fault when there is none. */
  trEndAt(i: i32): i32 {
    const xs = this.trEnd;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The end of trivia i's text; 0 after a fault when there is none. */
  trTextEndAt(i: i32): i32 {
    const xs = this.trTextEnd;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The condition start of #if/#elif trivia i; 0 after a fault when there is none. */
  trAuxAt(i: i32): i32 {
    const xs = this.trAux;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The start of token t; 0 after a fault when there is none. */
  startAt(i: i32): i32 {
    const xs = this.start;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The end of token t; 0 after a fault when there is none. */
  endAt(i: i32): i32 {
    const xs = this.end;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The first leading trivia of token t; 0 after a fault when there is none. */
  l0At(i: i32): i32 {
    const xs = this.l0;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The end of token t's leading trivia; 0 after a fault when there is none. */
  l1At(i: i32): i32 {
    const xs = this.l1;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The first trailing trivia of token t; 0 after a fault when there is none. */
  t0At(i: i32): i32 {
    const xs = this.t0;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The end of token t's trailing trivia; 0 after a fault when there is none. */
  t1At(i: i32): i32 {
    const xs = this.t1;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The flags of token t; 0 after a fault when there is none. */
  flagsAt(i: i32): i32 {
    const xs = this.flags;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return 0;
  }

  /** The node that holds token t; -1 after a fault when there is none. */
  parentAt(i: i32): i32 {
    const xs = this.parent;
    if (i >= 0 && i < xs.length) {
      return xs[i];
    }
    fault();
    return -1;
  }

  /** The kind of token t; 0 after a fault when there is none. */
  tokKind(t: i32): i32 {
    const kind = this.kind;
    if (t >= 0 && t < kind.length) {
      return kind[t];
    }
    fault();
    return 0;
  }

  /** The contextual keyword kind of token t; 0 after a fault when there is none. */
  tokCk(t: i32): i32 {
    const ck = this.ck;
    if (t >= 0 && t < ck.length) {
      return ck[t];
    }
    fault();
    return 0;
  }

  /** Sets token t's contextual keyword slot (for `{`, its closing token). */
  setCk(t: i32, v: i32): void {
    const ck = this.ck;
    if (t >= 0 && t < ck.length) {
      ck[t] = v;
    } else {
      this.lexFault();
    }
  }

  setFlags(t: i32, v: i32): void {
    const flags = this.flags;
    if (t >= 0 && t < flags.length) {
      flags[t] = v;
    } else {
      this.lexFault();
    }
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
        this.adv(1);
        k = this.tryAdvance(61) ? K_SlashEqualsToken : K_SlashToken;
        break;
      case 46: // .
        if (csIsDigit(this.peek(1)) && !(a > 0 && this.byteAt(a - 1) === 46 && this.prevIsDotToken(a))) {
          k = this.scanNumericLiteral();
        } else {
          this.adv(1);
          k = K_DotToken;
          if (this.peek(0) === 46) {
            // `..` is one token for Roslyn's parser (EatDotDotToken joins them); keep them apart here.
          }
        }
        break;
      case 44:
        this.adv(1);
        k = K_CommaToken;
        break;
      case 58: // :
        this.adv(1);
        k = this.tryAdvance(58) ? K_ColonColonToken : K_ColonToken;
        break;
      case 59:
        this.adv(1);
        k = K_SemicolonToken;
        break;
      case 126:
        this.adv(1);
        k = K_TildeToken;
        break;
      case 33: // !
        this.adv(1);
        k = this.tryAdvance(61) ? K_ExclamationEqualsToken : K_ExclamationToken;
        break;
      case 61: // =
        this.adv(1);
        k = this.tryAdvance(61) ? K_EqualsEqualsToken : this.tryAdvance(62) ? K_EqualsGreaterThanToken : K_EqualsToken;
        break;
      case 42:
        this.adv(1);
        k = this.tryAdvance(61) ? K_AsteriskEqualsToken : K_AsteriskToken;
        break;
      case 40:
        this.adv(1);
        k = K_OpenParenToken;
        break;
      case 41:
        this.adv(1);
        k = K_CloseParenToken;
        break;
      case 123:
        this.adv(1);
        k = K_OpenBraceToken;
        break;
      case 125:
        this.adv(1);
        k = K_CloseBraceToken;
        break;
      case 91:
        this.adv(1);
        k = K_OpenBracketToken;
        break;
      case 93:
        this.adv(1);
        k = K_CloseBracketToken;
        break;
      case 63: // ?
        this.adv(1);
        if (this.tryAdvance(63)) {
          k = this.tryAdvance(61) ? K_QuestionQuestionEqualsToken : K_QuestionQuestionToken;
        } else {
          k = K_QuestionToken;
        }
        break;
      case 43:
        this.adv(1);
        k = this.tryAdvance(61) ? K_PlusEqualsToken : this.tryAdvance(43) ? K_PlusPlusToken : K_PlusToken;
        break;
      case 45:
        this.adv(1);
        k = this.tryAdvance(61)
          ? K_MinusEqualsToken
          : this.tryAdvance(45)
            ? K_MinusMinusToken
            : this.tryAdvance(62)
              ? K_MinusGreaterThanToken
              : K_MinusToken;
        break;
      case 37:
        this.adv(1);
        k = this.tryAdvance(61) ? K_PercentEqualsToken : K_PercentToken;
        break;
      case 38:
        this.adv(1);
        k = this.tryAdvance(61)
          ? K_AmpersandEqualsToken
          : this.tryAdvance(38)
            ? K_AmpersandAmpersandToken
            : K_AmpersandToken;
        break;
      case 94:
        this.adv(1);
        k = this.tryAdvance(61) ? K_CaretEqualsToken : K_CaretToken;
        break;
      case 124:
        this.adv(1);
        k = this.tryAdvance(61) ? K_BarEqualsToken : this.tryAdvance(124) ? K_BarBarToken : K_BarToken;
        break;
      case 60: // <
        this.adv(1);
        if (this.tryAdvance(61)) {
          k = K_LessThanEqualsToken;
        } else if (this.tryAdvance(60)) {
          k = this.tryAdvance(61) ? K_LessThanLessThanEqualsToken : K_LessThanLessThanToken;
        } else {
          k = K_LessThanToken;
        }
        break;
      case 62: // >
        this.adv(1);
        k = this.tryAdvance(61) ? K_GreaterThanEqualsToken : K_GreaterThanToken;
        break;
      case 64: {
        // @
        const i = this.runOf(64);
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
          this.adv(1);
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
        if (csIsDigit(c)) {
          k = this.scanNumericLiteral();
        } else if (csIsIdentStartByte(c) || (c === 92 && this.peek(1) === 117)) {
          if (c >= 0x80) {
            const p = this.cp();
            if (csIsWhitespaceCp(p) || csIsNewLineCp(p)) {
              this.fail("unexpected character");
              return;
            }
          }
          this.scanIdentChars();
          const kw = csKeyword(this.src, a, sub32(this.pos, a));
          if (kw > 0) {
            k = kw;
          } else {
            k = K_IdentifierToken;
            const t = this.addToken(k, a, this.pos, l0, l1);
            this.setCk(t, sub32(0, kw));
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
    const nt = this.nt;
    const kind = this.kind;
    const end = this.end;
    if (nt <= 0) {
      return false;
    }
    const t = nt - 1;
    if (t < kind.length && t < end.length) {
      return kind[t] === K_DotToken && end[t] === a;
    }
    fault();
    return false;
  }

  tryAdvance(c: i32): boolean {
    if (this.peek(0) === c) {
      this.adv(1);
      return true;
    }
    return false;
  }

  lexTrailing(t: i32): void {
    const t0 = this.t0;
    if (t < 0 || t >= t0.length) {
      this.lexFault();
      return;
    }
    t0[t] = this.ntr;
    this.lexTrivia(true);
    const t1 = this.t1;
    if (t < t1.length) {
      t1[t] = this.ntr;
    } else {
      this.lexFault();
    }
  }

  isIdentStartAt(i: i32): boolean {
    const c = this.peek(i);
    if (c === 92 && this.peek(i + 1) === 117) {
      return true;
    }
    if (!csIsIdentStartByte(c)) {
      return false;
    }
    if (c >= 0x80) {
      const p = csCodePoint(this.src, add32(this.pos, i), this.lim);
      return !csIsWhitespaceCp(p) && !csIsNewLineCp(p);
    }
    return true;
  }

  scanIdentChars(): void {
    while (this.pos < this.lim) {
      // the run of ASCII identifier bytes at pos
      const src = this.src;
      const lim = this.lim;
      let q = this.pos;
      while (q >= 0 && q < lim && q < src.length) {
        const b = toI32(src[q]);
        if (b >= 0x80 || !csIsIdentPartByte(b)) {
          break;
        }
        q++;
      }
      this.pos = q;
      if (q >= lim) {
        return;
      }
      const c = this.cur();
      if (c < 0x80) {
        if (c === 92 && this.peek(1) === 117) {
          this.adv(2);
          for (let i = 0; i < 4 && csIsHexDigit(this.peek(0)); i++) {
            this.adv(1);
          }
        } else {
          return;
        }
      } else {
        const p = this.cp();
        if (csIsWhitespaceCp(p) || csIsNewLineCp(p)) {
          return;
        }
        this.adv(csCpLen(c));
      }
    }
  }

  // ---- literals ----

  scanNumericLiteral(): i32 {
    let isReal = false;
    let isHex = false;
    let isBinary = false;
    if (this.peek(0) === 48 && (this.peek(1) === 120 || this.peek(1) === 88)) {
      this.adv(2);
      isHex = true;
      while (csIsHexDigit(this.peek(0)) || this.peek(0) === 95) {
        this.adv(1);
      }
    } else if (this.peek(0) === 48 && (this.peek(1) === 98 || this.peek(1) === 66)) {
      this.adv(2);
      isBinary = true;
      while (this.peek(0) === 48 || this.peek(0) === 49 || this.peek(0) === 95) {
        this.adv(1);
      }
    } else {
      while (csIsDigit(this.peek(0)) || this.peek(0) === 95) {
        this.adv(1);
      }
      if (this.peek(0) === 46 && csIsDigit(this.peek(1))) {
        isReal = true;
        this.adv(1);
        while (csIsDigit(this.peek(0)) || this.peek(0) === 95) {
          this.adv(1);
        }
      }
      const e = this.peek(0);
      if (e === 101 || e === 69) {
        const s = this.peek(1);
        if (csIsDigit(s) || ((s === 43 || s === 45) && csIsDigit(this.peek(2)))) {
          isReal = true;
          this.adv(s === 43 || s === 45 ? 2 : 1);
          while (csIsDigit(this.peek(0)) || this.peek(0) === 95) {
            this.adv(1);
          }
        }
      }
    }
    const c = this.peek(0) | 32;
    if (!isHex && !isBinary && (c === 102 || c === 100 || c === 109)) {
      this.adv(1);
    } else if (!isReal && (c === 117 || c === 108)) {
      this.adv(1);
      const c2 = this.peek(0) | 32;
      if ((c === 117 && c2 === 108) || (c === 108 && c2 === 117)) {
        this.adv(1);
      }
    }
    if (csIsIdentPartByte(this.peek(0)) && this.peek(0) < 0x80) {
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
    this.adv(1);
    while (true) {
      const c = this.peek(0);
      if (c === 92) {
        this.adv(2);
        continue;
      }
      if (c === q) {
        this.adv(1);
        break;
      }
      if (c < 0 || c === 10 || c === 13 || csIsNewLineCp(this.cp())) {
        this.fail("newline in constant");
        return 0;
      }
      this.adv(1);
    }
    if (q === 39) {
      return K_CharacterLiteralToken;
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.adv(2);
      return K_Utf8StringLiteralToken;
    }
    return K_StringLiteralToken;
  }

  scanVerbatimString(): i32 {
    this.adv(2); // @"
    while (true) {
      const c = this.peek(0);
      if (c < 0) {
        this.fail("unterminated verbatim string");
        return 0;
      }
      this.adv(1);
      if (c === 34) {
        if (this.peek(0) === 34) {
          this.adv(1);
          continue;
        }
        break;
      }
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.adv(2);
      return K_Utf8StringLiteralToken;
    }
    return K_StringLiteralToken;
  }

  quoteRun(): i32 {
    return this.runOf(34);
  }

  skipWs(): void {
    while (this.pos < this.lim) {
      // the run of ASCII whitespace at pos
      const src = this.src;
      const lim = this.lim;
      let q = this.pos;
      while (q >= 0 && q < lim && q < src.length) {
        const b = toI32(src[q]);
        if (b !== 32 && b !== 9 && b !== 11 && b !== 12) {
          break;
        }
        q++;
      }
      this.pos = q;
      if (q >= lim) {
        return;
      }
      const c = this.cur();
      if (c >= 0x80 && csIsWhitespaceCp(this.cp())) {
        this.adv(csCpLen(c));
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
      this.adv(2);
    } else if (c >= 0x80) {
      this.adv(csCpLen(c));
    } else {
      this.adv(1);
    }
  }

  /** A non-interpolated raw string literal: """...""". */
  scanRawString(): i32 {
    const qn = this.quoteRun();
    this.adv(qn);
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
            this.adv(n);
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
          this.adv(n);
          continue;
        }
        this.adv(csCpLen(this.peek(0)));
      }
      if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
        this.adv(2);
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
          this.adv(n);
          break;
        }
        this.adv(n);
        continue;
      }
      this.adv(csCpLen(this.peek(0)));
    }
    if ((this.peek(0) === 117 || this.peek(0) === 85) && this.peek(1) === 56) {
      this.adv(2);
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
      this.adv(3);
    } else if (c0 === 36 && c1 === 34 && (c2 !== 34 || this.peek(3) !== 34)) {
      kind = IS_NORMAL;
      this.adv(2);
    } else {
      if (c0 !== 36) {
        this.fail("bad interpolated string");
        return;
      }
      dollars = this.runOf(36);
      this.adv(dollars);
      quotes = this.quoteRun();
      if (quotes < 3) {
        this.fail("bad raw interpolated string");
        return;
      }
      this.adv(quotes);
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
          this.adv(quotes);
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
          this.adv(1);
          const t = this.addToken(K_InterpolatedStringEndToken, sub32(this.pos, 1), this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        if (kind === IS_VERBATIM) {
          if (this.peek(1) === 34) {
            this.adv(2);
            continue;
          }
          this.addText(textStart, this.pos);
          this.adv(1);
          const t = this.addToken(K_InterpolatedStringEndToken, sub32(this.pos, 1), this.pos, this.ntr, this.ntr);
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
          this.adv(n);
          const t = this.addToken(K_InterpolatedRawStringEndToken, ea, this.pos, this.ntr, this.ntr);
          this.lexTrailing(t);
          return;
        }
        this.adv(n);
        continue;
      }
      if (c === 125) {
        // }
        if (kind === IS_NORMAL || kind === IS_VERBATIM) {
          if (this.peek(1) !== 125) {
            this.fail("unescaped }");
            return;
          }
          this.adv(2);
        } else {
          const n = this.runOf(125);
          if (n >= dollars) {
            this.fail("too many close braces");
            return;
          }
          this.adv(n);
        }
        continue;
      }
      if (c === 123) {
        // {
        let openStart = this.pos;
        let openEnd = this.posSum(this.pos, 1);
        if (kind === IS_NORMAL || kind === IS_VERBATIM) {
          if (this.peek(1) === 123) {
            this.adv(2);
            continue;
          }
        } else {
          const n = this.runOf(123);
          if (n < dollars) {
            this.adv(n);
            continue;
          }
          if (toI64(n) >= toI64(2) * toI64(dollars)) {
            this.fail("too many open braces");
            return;
          }
          openEnd = this.posSum(this.pos, n);
          openStart = sub32(openEnd, dollars);
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
        this.adv(2);
        continue;
      }
      this.adv(csCpLen(c));
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
      closeEnd = this.posSum(this.pos, 1);
    } else {
      const n = this.runOf(125);
      if (n < dollars) {
        this.fail("not enough close braces");
        return;
      }
      closeEnd = this.posSum(this.pos, dollars);
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
      const colonEnd = add32(colon, 1);
      const ct = this.addToken(K_ColonToken, colon, colonEnd, lead0, lead1);
      this.setFlags(ct, TF_HOLE_END);
      this.setCk(ob, ct);
      this.addToken(K_InterpolatedStringTextToken, colonEnd, fmtEnd, this.ntr, this.ntr);
      const cb = this.addToken(K_CloseBraceToken, closeStart, closeEnd, this.ntr, this.ntr);
      this.setFlags(cb, TF_HOLE_END);
    } else {
      const cb = this.addToken(K_CloseBraceToken, closeStart, closeEnd, lead0, lead1);
      this.setFlags(cb, TF_HOLE_END);
      this.setCk(ob, cb);
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
          this.adv(1);
          continue;
        }
        case 58:
          if (isHole) {
            const colon = this.pos;
            this.scanFormatSpecifier(kind);
            return colon;
          }
          this.adv(1);
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
          const i = this.runOf(64);
          if (this.peek(i) === 34) {
            this.scanVerbatimString();
            continue;
          }
          if (this.peek(i) === 36) {
            this.skipInterpolatedString();
            continue;
          }
          this.adv(1);
          continue;
        }
        case 47:
          if (this.peek(1) === 47) {
            this.toEndOfLine();
            continue;
          }
          if (this.peek(1) === 42) {
            this.adv(2);
            while (this.pos < this.lim && !(this.peek(0) === 42 && this.peek(1) === 47)) {
              this.adv(1);
            }
            this.adv(2);
            continue;
          }
          this.adv(1);
          continue;
        case 123:
          this.adv(1);
          this.scanHoleBalanced(kind, 125, false);
          if (this.peek(0) === 125) {
            this.adv(1);
          }
          continue;
        case 40:
          this.adv(1);
          this.scanHoleBalanced(kind, 41, false);
          if (this.peek(0) === 41) {
            this.adv(1);
          }
          continue;
        case 91:
          this.adv(1);
          this.scanHoleBalanced(kind, 93, false);
          if (this.peek(0) === 93) {
            this.adv(1);
          }
          continue;
        default:
          this.adv(csCpLen(c));
          continue;
      }
    }
    return -1;
  }

  scanFormatSpecifier(kind: i32): void {
    this.adv(1); // :
    while (true) {
      const c = this.peek(0);
      if (c === 92 && kind === IS_NORMAL) {
        this.adv(2);
      } else if (c === 34) {
        if (kind === IS_VERBATIM && this.peek(1) === 34) {
          this.adv(2);
        } else {
          return;
        }
      } else if (c === 123) {
        this.fail("{ in format");
        return;
      } else if (c === 125 || c < 0) {
        return;
      } else {
        this.adv(csCpLen(c));
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
      const nt = this.nt;
      const end = this.end;
      if (nt > 0 && nt <= end.length) {
        this.pos = end[nt - 1];
      } else {
        this.lexFault();
      }
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
      let c = this.cur();
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
          this.adv(1);
          while (this.pos < this.lim && this.cur() === 0x1a) {
            this.adv(1);
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
          this.toEndOfLine();
          this.addTrivia(K_SingleLineCommentTrivia, a, this.pos);
          onlyWhitespaceOnLine = false;
          continue;
        }
        if (c1 === 42) {
          const isDoc = this.peek(2) === 42 && this.peek(3) !== 42 && this.peek(3) !== 47;
          if (isDoc && isTrailing) {
            return;
          }
          this.adv(2);
          while (true) {
            if (this.pos >= this.lim) {
              this.fail("open ended comment");
              return;
            }
            if (this.peek(0) === 42 && this.peek(1) === 47) {
              this.adv(2);
              break;
            }
            this.adv(1);
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
      const p = this.byteAt(a - 1);
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
      this.toEndOfLine();
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
    const name = bytesText(this.src, a, b);
    for (const s of this.syms) {
      if (s === name) {
        return true;
      }
    }
    return false;
  }

  define(a: i32, b: i32, on: boolean): void {
    const name = bytesText(this.src, a, b);
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
    const nd = this.nDir;
    if (nd < 0 || nd > 1073741823) {
      this.lexFault();
      return;
    }
    if (nd >= this.dirKind.length) {
      const c = nd * 2;
      this.dirKind = growI32(this.dirKind, c);
      this.dirTaken = growI32(this.dirTaken, c);
      this.dirElse = growI32(this.dirElse, c);
    }
    const dirKind = this.dirKind;
    const dirTaken = this.dirTaken;
    const dirElse = this.dirElse;
    if (nd >= dirKind.length || nd >= dirTaken.length || nd >= dirElse.length) {
      this.lexFault();
      return;
    }
    dirKind[nd] = kind;
    dirTaken[nd] = taken ? 1 : 0;
    dirElse[nd] = 0;
    this.nDir = nd + 1;
  }

  /** The index of the innermost open #if or #region, -1 when there is none. */
  dirTop(): i32 {
    const nd = this.nDir;
    if (nd === 0) {
      return -1;
    }
    if (nd > 0 && nd <= this.dirKind.length && nd <= this.dirTaken.length && nd <= this.dirElse.length) {
      return nd - 1;
    }
    this.lexFault();
    return -1;
  }

  /** Whether the innermost open directive is of kind k (1 #if group, 2 #region). */
  dirTopIs(k: i32): boolean {
    const top = this.dirTop();
    const dirKind = this.dirKind;
    return top >= 0 && top < dirKind.length && dirKind[top] === k;
  }

  /** Whether the innermost #if group has seen its #else. */
  dirTopElse(): boolean {
    const top = this.dirTop();
    const dirElse = this.dirElse;
    return top >= 0 && top < dirElse.length && dirElse[top] === 1;
  }

  /** Whether a branch of the innermost #if group was taken. */
  dirTopTaken(): boolean {
    const top = this.dirTop();
    const dirTaken = this.dirTaken;
    return top >= 0 && top < dirTaken.length && dirTaken[top] !== 0;
  }

  setDirTopTaken(): void {
    const top = this.dirTop();
    const dirTaken = this.dirTaken;
    if (top >= 0 && top < dirTaken.length) {
      dirTaken[top] = 1;
    }
  }

  setDirTopElse(): void {
    const top = this.dirTop();
    const dirElse = this.dirElse;
    if (top >= 0 && top < dirElse.length) {
      dirElse[top] = 1;
    }
  }

  popDir(): void {
    const nd = this.nDir;
    if (nd > 0) {
      this.nDir = nd - 1;
    } else {
      this.lexFault();
    }
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
      const k = this.trKindAt(sub32(this.ntr, 1));
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
      const c = this.cur();
      if (c === 35) {
        if (lastLineStart < this.pos && !allWhitespace) {
          this.adv(1);
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
        this.adv(csCpLen(c));
      } else {
        allWhitespace = allWhitespace && (c === 32 || c === 9 || c === 11 || c === 12);
        this.adv(1);
      }
    }
  }

  /** Lexes a directive in active code; answers 1 taken, 0 not taken, -1 not a branching directive. */
  lexDirective(isActive: boolean, endIsActive: boolean): i32 {
    return this.lexDirectiveCore(isActive, endIsActive);
  }

  skipDirWs(): void {
    this.skipWs();
  }

  /** At the end of a directive: only whitespace and a // comment may follow. */
  endOfDirective(isActive: boolean): void {
    this.skipDirWs();
    if (this.peek(0) === 47 && this.peek(1) === 47) {
      this.toEndOfLine();
    }
    if (this.pos < this.lim && !this.isNewLineHere()) {
      if (isActive) {
        this.fail("end of directive expected");
      }
      this.toEndOfLine();
    }
  }

  /** Moves pos to the next new line, or to lim. */
  toEndOfLine(): void {
    const src = this.src;
    const lim = this.lim;
    let q = this.pos;
    while (q >= 0 && q < lim && q < src.length) {
      const b = toI32(src[q]);
      if (b === 10 || b === 13) {
        break;
      }
      if (b >= 0x80) {
        this.pos = q;
        if (csIsNewLineCp(this.cp())) {
          return;
        }
      }
      q++;
    }
    this.pos = q;
    if (q >= 0 && q < lim && q >= src.length) {
      // a byte past src before lim
      this.lexFault();
    }
  }

  dirWordEnd(): i32 {
    const src = this.src;
    const lim = this.lim;
    let p = this.pos;
    if (p < 0 && p < lim) {
      fault();
      return p;
    }
    while (p >= 0 && p < lim && p < src.length && csIsIdentPartByte(toI32(src[p]))) {
      p++;
    }
    if (p < lim && p >= src.length) {
      fault();
    }
    return p;
  }

  isWord(a: i32, b: i32, w: string): boolean {
    const n = toI64(b) - toI64(a);
    if (n !== toI64(w.length)) {
      return false;
    }
    const src = this.src;
    let p = a;
    for (let i = 0; i < w.length; i++) {
      if (p < 0 || p >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[p]) !== w.charCodeAt(i)) {
        return false;
      }
      p = p + 1;
    }
    return true;
  }

  /** The kind of trivia i; 0 after a fault when there is none. */
  trKindAt(i: i32): i32 {
    const trKind = this.trKind;
    if (i >= 0 && i < trKind.length) {
      return trKind[i];
    }
    fault();
    return 0;
  }

  lexDirectiveCore(isActive: boolean, endIsActive: boolean): i32 {
    this.hasDirectives = true;
    const a = this.pos;
    this.adv(1); // #
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
      if (!this.dirTopIs(1) || this.dirTopElse()) {
        this.fail("unexpected #elif");
        return -1;
      }
      const t = endIsActive && v && !this.dirTopTaken();
      if (t) {
        this.setDirTopTaken();
      }
      taken = t ? 1 : 0;
    } else if (this.isWord(ka, kb, "else")) {
      kind = K_ElseDirectiveTrivia;
      this.endOfDirective(true);
      if (!this.dirTopIs(1) || this.dirTopElse()) {
        this.fail("unexpected #else");
        return -1;
      }
      const t = endIsActive && !this.dirTopTaken();
      if (t) {
        this.setDirTopTaken();
      }
      this.setDirTopElse();
      taken = t ? 1 : 0;
    } else if (this.isWord(ka, kb, "endif")) {
      kind = K_EndIfDirectiveTrivia;
      this.endOfDirective(true);
      if (!this.dirTopIs(1)) {
        this.fail("unexpected #endif");
        return -1;
      }
      this.popDir();
    } else if (this.isWord(ka, kb, "region")) {
      kind = K_RegionDirectiveTrivia;
      this.toEndOfLine();
      this.pushDir(2, false);
    } else if (this.isWord(ka, kb, "endregion")) {
      kind = K_EndRegionDirectiveTrivia;
      this.toEndOfLine();
      if (!this.dirTopIs(2)) {
        this.fail("unexpected #endregion");
        return -1;
      }
      this.popDir();
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
    const trTextEnd = this.trTextEnd;
    const trAux = this.trAux;
    if (i >= 0 && i < trTextEnd.length && i < trAux.length) {
      trTextEnd[i] = textEnd;
      trAux[i] = aux;
    } else {
      this.lexFault();
    }
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
        this.adv(2);
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
        this.adv(2);
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
        this.adv(2);
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
      this.adv(1);
      return !this.ppNot(report);
    }
    return this.ppPrimary(report);
  }

  ppPrimary(report: boolean): boolean {
    this.skipDirWs();
    const c = this.peek(0);
    if (c === 40) {
      this.adv(1);
      const v = this.ppOr(report);
      this.skipDirWs();
      if (this.peek(0) !== 41) {
        this.fail(") expected in directive");
        return false;
      }
      this.adv(1);
      return v;
    }
    if (csIsIdentStartByte(c)) {
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
