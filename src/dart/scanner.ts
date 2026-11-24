// The Dart scanner: source bytes to tokens with their preceding comments, in
// parallel arrays. After the analyzer's scanner (_fe_analyzer_shared
// AbstractScanner, BSD-3-Clause, Copyright the Dart project authors): the
// same token boundaries, string interpolation segments, nested block
// comments, script tag and `// @dart=` language version comment.

import {
  K_NONE,
  K_OPERATOR,
  T_AMP,
  T_AMPAMP,
  T_AMPAMP_EQ,
  T_AMP_EQ,
  T_ARROW,
  T_AT,
  T_BACKTICK,
  T_BANG,
  T_BAR,
  T_BARBAR,
  T_BARBAR_EQ,
  T_BAR_EQ,
  T_BOF,
  T_CARET,
  T_CARET_EQ,
  T_COLON,
  T_COMMA,
  T_DEC,
  T_DOT,
  T_DOTDOT,
  T_DOUBLE,
  T_ELLIPSIS,
  T_ELLIPSIS_Q,
  T_EOF,
  T_EQ,
  T_EQEQ,
  T_GE,
  T_GT,
  T_HASH,
  T_IDENT,
  T_INC,
  T_INDEX,
  T_INDEX_EQ,
  T_INT,
  T_INTERP_EXPR,
  T_INTERP_IDENT,
  T_LBRACE,
  T_LBRACKET,
  T_LE,
  T_LPAREN,
  T_LT,
  T_MINUS,
  T_MINUS_EQ,
  T_NE,
  T_PERCENT,
  T_PERCENT_EQ,
  T_PLUS,
  T_PLUS_EQ,
  T_QDOT,
  T_QDOTDOT,
  T_QQ,
  T_QQ_EQ,
  T_QUESTION,
  T_RBRACE,
  T_RBRACKET,
  T_RPAREN,
  T_SCRIPT,
  T_SEMI,
  T_SHL,
  T_SHL_EQ,
  T_SHR,
  T_SHR_EQ,
  T_SLASH,
  T_SLASH_EQ,
  T_STAR,
  T_STAR_EQ,
  T_STRING,
  T_TILDE,
  T_TILDE_SLASH,
  T_TILDE_SLASH_EQ,
  T_USHR,
  T_USHR_EQ,
  dtKeyword,
} from "./tokens";
import { add32, bytesText, mul32 } from "../core/arr";
import { fault } from "../core/fault";

export const C_LINE: i32 = 1; // `//` comment
export const C_BLOCK: i32 = 2; // `/* */` comment

/**
 * `n` zeroes, as `new Array<i32>(n)` made them: an array of a u16 length
 * needs no check, and only the rest past 65535 is pushed.
 */
const dtTokZeros = (n: i32): i32[] => {
  if (n >= 0 && n <= 65535) {
    return new Array<i32>(toU16(n));
  }
  if (n < 0) {
    fault();
    const none: i32[] = [];
    return none;
  }
  const xs = new Array<i32>(65535);
  dtGrowI32(xs, n);
  return xs;
};

/** `n` falses, as dtTokZeros. */
const dtTokFalses = (n: i32): boolean[] => {
  if (n >= 0 && n <= 65535) {
    return new Array<boolean>(toU16(n));
  }
  if (n < 0) {
    fault();
    const none: boolean[] = [];
    return none;
  }
  const xs = new Array<boolean>(65535);
  dtGrowBool(xs, n);
  return xs;
};

/** Grows `a` in place to `cap` elements, the new ones 0. */
const dtGrowI32 = (a: i32[], cap: i32): void => {
  while (a.length < cap) {
    a.push(0);
  }
};

/** Grows `a` in place to `cap` elements, the new ones false. */
const dtGrowBool = (a: boolean[], cap: i32): void => {
  while (a.length < cap) {
    a.push(false);
  }
};

/**
 * `src[0, n)` as a string, a byte a character: bytesText, a chunk at a time,
 * which keeps its parts list short.
 */
const dtSourceText = (src: u8[], n: i32): string => {
  if (n < 0 || n > src.length) {
    fault();
    return "";
  }
  const chunks: string[] = [];
  let a = 0;
  while (a < n) {
    let e = n;
    // a < n - 4096 bounds a + 4096 by n; the constant says so to the prover.
    if (a < n - 4096 && a <= 2147479551) {
      e = a + 4096;
    }
    chunks.push(bytesText(src, a, e));
    a = e;
  }
  return chunks.join("");
};

/** `xs[i]`, or `none` after a fault when `i` is outside `xs`. */
const dtTokAt = (xs: i32[], i: i32, none: i32): i32 => {
  if (i >= 0 && i < xs.length) {
    return xs[i];
  }
  fault();
  return none;
};

/** Moves `xs[lo, hi)` up one place, to `xs[lo + 1, hi]`; false when `hi` is outside `xs`. */
const dtShiftI32 = (xs: i32[], lo: i32, hi: i32): boolean => {
  if (lo < 0 || hi >= xs.length) {
    return false;
  }
  for (let i = hi; i > lo && i > 0 && i < xs.length; i--) {
    xs[i] = xs[i - 1];
  }
  return true;
};

/** dtShiftI32 for booleans. */
const dtShiftBool = (xs: boolean[], lo: i32, hi: i32): boolean => {
  if (lo < 0 || hi >= xs.length) {
    return false;
  }
  for (let i = hi; i > lo && i > 0 && i < xs.length; i--) {
    xs[i] = xs[i - 1];
  }
  return true;
};

/** The tokens of one file and the comments before each. */
export class DtTokens {
  src: u8[];
  n: i32 = 0; // source length
  count: i32 = 0; // tokens, including BOF at 0 and EOF last
  kind: i32[];
  kw: i32[];
  start: i32[];
  end: i32[];
  cFirst: i32[]; // first preceding comment, or -1
  cCount: i32[];
  lineS: i32[]; // 1-based line of the start
  lineE: i32[]; // 1-based line of the end
  // The scanner splits a `>>` or `>>>` that closes enough open `<` on its
  // statement, as the parser would; `pred` marks each `>` it split off but
  // the last, and the parser sets `gt` on each `>` it takes as a closing
  // angle bracket. dtParse checks the one covers the other.
  pred: boolean[];
  gt: boolean[];
  npred: i32 = 0;
  // Comments.
  nc: i32 = 0;
  cStart: i32[];
  cEnd: i32[];
  cKind: i32[];
  cLineS: i32[];
  cLineE: i32[];
  cCol1: boolean[]; // starts at column 1
  // The `// @dart=major.minor` comment, if any.
  verMajor: i32 = -1;
  verMinor: i32 = -1;
  failed: boolean = false;
  why: string = "";
  // src[0, n) as a string, made at its first use: a token's text is cut
  // from it, as no proof covers String.fromBytes.
  srcText: string = "";
  srcTextReady: boolean = false;

  constructor(src: u8[], n: i32) {
    this.src = src;
    this.n = n;
    // About one token per four bytes and a comment per 64; both grow.
    const cap = (n >> 2) + 16;
    this.kind = dtTokZeros(cap);
    this.kw = dtTokZeros(cap);
    this.start = dtTokZeros(cap);
    this.end = dtTokZeros(cap);
    this.cFirst = dtTokZeros(cap);
    this.cCount = dtTokZeros(cap);
    this.lineS = dtTokZeros(cap);
    this.lineE = dtTokZeros(cap);
    this.pred = dtTokFalses(cap);
    this.gt = dtTokFalses(cap);
    const cc = (n >> 6) + 16;
    this.cStart = dtTokZeros(cc);
    this.cEnd = dtTokZeros(cc);
    this.cKind = dtTokZeros(cc);
    this.cLineS = dtTokZeros(cc);
    this.cLineE = dtTokZeros(cc);
    this.cCol1 = dtTokFalses(cc);
  }

  growTokens(cap: i32): void {
    dtGrowI32(this.kind, cap);
    dtGrowI32(this.kw, cap);
    dtGrowI32(this.start, cap);
    dtGrowI32(this.end, cap);
    dtGrowI32(this.cFirst, cap);
    dtGrowI32(this.cCount, cap);
    dtGrowI32(this.lineS, cap);
    dtGrowI32(this.lineE, cap);
    dtGrowBool(this.pred, cap);
    dtGrowBool(this.gt, cap);
  }

  growComments(cap: i32): void {
    dtGrowI32(this.cStart, cap);
    dtGrowI32(this.cEnd, cap);
    dtGrowI32(this.cKind, cap);
    dtGrowI32(this.cLineS, cap);
    dtGrowI32(this.cLineE, cap);
    dtGrowBool(this.cCol1, cap);
  }

  /** Makes room for at least one more token. */
  roomForToken(): void {
    const len = toI32(this.kind.length);
    if (this.count < len - 1) {
      return;
    }
    this.growTokens(mul32(len, 2));
  }

  /** Makes room for at least one more comment. */
  roomForComment(): void {
    const len = toI32(this.cStart.length);
    if (this.nc < len - 1) {
      return;
    }
    this.growComments(mul32(len, 2));
  }

  // Guarded reads of one token's fields: an index outside the tokens faults
  // and answers a neutral value (EOF, no keyword, no comments).
  kindAt(t: i32): i32 {
    return dtTokAt(this.kind, t, T_EOF);
  }
  kwAt(t: i32): i32 {
    return dtTokAt(this.kw, t, K_NONE);
  }
  startAt(t: i32): i32 {
    return dtTokAt(this.start, t, 0);
  }
  endAt(t: i32): i32 {
    return dtTokAt(this.end, t, 0);
  }
  lineSAt(t: i32): i32 {
    return dtTokAt(this.lineS, t, 0);
  }
  lineEAt(t: i32): i32 {
    return dtTokAt(this.lineE, t, 0);
  }
  cFirstAt(t: i32): i32 {
    return dtTokAt(this.cFirst, t, -1);
  }
  cCountAt(t: i32): i32 {
    return dtTokAt(this.cCount, t, 0);
  }
  // And of one comment's.
  cStartAt(c: i32): i32 {
    return dtTokAt(this.cStart, c, 0);
  }
  cEndAt(c: i32): i32 {
    return dtTokAt(this.cEnd, c, 0);
  }
  cKindAt(c: i32): i32 {
    return dtTokAt(this.cKind, c, 0);
  }
  cLineSAt(c: i32): i32 {
    return dtTokAt(this.cLineS, c, 0);
  }
  cLineEAt(c: i32): i32 {
    return dtTokAt(this.cLineE, c, 0);
  }
  cCol1At(c: i32): boolean {
    const xs = this.cCol1;
    if (c >= 0 && c < xs.length) {
      return xs[c];
    }
    fault();
    return false;
  }

  /** Whether token `t` is spelled `s`. */
  is(t: i32, s: string): boolean {
    const starts = this.start;
    const ends = this.end;
    const src = this.src;
    if (t < 0 || t >= starts.length || t >= ends.length) {
      fault();
      return false;
    }
    const a = starts[t];
    const e = ends[t];
    // A token lies inside the source.
    if (a < 0 || e < a || e > src.length) {
      fault();
      return false;
    }
    // e >= a >= 0: the u32 difference is exact.
    const k = toI32(toU32(e) - toU32(a));
    if (k !== toI32(s.length)) {
      return false;
    }
    let j = a;
    for (let i = 0; i < k && i < s.length; i++) {
      if (j < 0 || j >= src.length) {
        fault();
        return false;
      }
      const b = toI32(src[j]);
      if (b !== s.charCodeAt(i)) {
        return false;
      }
      j = j + 1;
    }
    return true;
  }

  text(t: i32): string {
    const starts = this.start;
    const ends = this.end;
    if (t >= 0 && t < starts.length && t < ends.length) {
      return this.rangeText(starts[t], ends[t]);
    }
    fault();
    return "";
  }

  /** The source bytes `[a, e)` as a string, as String.fromBytes makes it; the range lies in src[0, n). */
  rangeText(a: i32, e: i32): string {
    if (a < 0 || e < a || e > this.n || e > this.src.length) {
      fault();
      return "";
    }
    if (!this.srcTextReady) {
      this.srcText = dtSourceText(this.src, this.n);
      this.srcTextReady = true;
    }
    return this.srcText.substring(a, e);
  }

  /**
   * Splits token `t` after its first `>`: `>>` becomes `>` `>`, `>=` becomes
   * `>` `=`, and so on. Shifts the following tokens up by one.
   */
  splitGt(t: i32): void {
    const kinds = this.kind;
    if (t < 0 || t >= kinds.length) {
      fault();
      return;
    }
    const k = kinds[t];
    let rest = T_GT;
    if (k === T_GE) {
      rest = T_EQ;
    } else if (k === T_SHR) {
      rest = T_GT;
    } else if (k === T_SHR_EQ) {
      rest = T_GE;
    } else if (k === T_USHR) {
      rest = T_SHR;
    } else if (k === T_USHR_EQ) {
      rest = T_SHR_EQ;
    }
    this.roomForToken();
    const count = this.count;
    const t1 = t + 1;
    // roomForToken left count + 1 elements in every array, and t < count.
    if (
      count < t1 ||
      !dtShiftI32(this.kind, t1, count) ||
      !dtShiftI32(this.kw, t1, count) ||
      !dtShiftI32(this.start, t1, count) ||
      !dtShiftI32(this.end, t1, count) ||
      !dtShiftI32(this.cFirst, t1, count) ||
      !dtShiftI32(this.cCount, t1, count) ||
      !dtShiftI32(this.lineS, t1, count) ||
      !dtShiftI32(this.lineE, t1, count) ||
      !dtShiftBool(this.pred, t1, count) ||
      !dtShiftBool(this.gt, t1, count)
    ) {
      fault();
      return;
    }
    const kind = this.kind;
    const kw = this.kw;
    const start = this.start;
    const end = this.end;
    const cFirst = this.cFirst;
    const cCount = this.cCount;
    const lineS = this.lineS;
    const lineE = this.lineE;
    const pred = this.pred;
    const gt = this.gt;
    if (
      t1 >= kind.length ||
      t1 >= kw.length ||
      t1 >= start.length ||
      t1 >= end.length ||
      t1 >= cFirst.length ||
      t1 >= cCount.length ||
      t1 >= lineS.length ||
      t1 >= lineE.length ||
      t1 >= pred.length ||
      t1 >= gt.length ||
      t >= kind.length ||
      t >= start.length ||
      t >= end.length ||
      t >= lineS.length ||
      t >= lineE.length ||
      count >= kind.length
    ) {
      fault();
      return;
    }
    this.count = count + 1;
    const s = start[t];
    if (s < 0 || s >= end[t]) {
      fault();
      return;
    }
    kind[t1] = rest;
    kw[t1] = K_NONE;
    start[t1] = s + 1;
    end[t1] = end[t];
    cFirst[t1] = -1;
    cCount[t1] = 0;
    lineS[t1] = lineS[t];
    lineE[t1] = lineE[t];
    pred[t1] = false;
    gt[t1] = false;
    kind[t] = T_GT;
    end[t] = s + 1;
  }
}

const dtIsIdStart = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36;
const dtIsIdPart = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || (c >= 48 && c <= 57);
const dtIsDigit = (c: i32): boolean => c >= 48 && c <= 57;
const dtIsHex = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/** Scans one file. */
export class DtScanner {
  t: DtTokens;
  src: u8[];
  n: i32;
  p: i32 = 0;
  // Comments seen since the last token.
  pendFirst: i32 = -1;
  // The stack of strings with an open `${`: quote char, triple, brace depth.
  sQuote: i32[];
  sTriple: boolean[];
  sDepth: i32[];
  ns: i32 = 0;
  // Open `<` since the last `;`, `{`, `}`, `=>`, `&&` or `||`, and whether
  // to split `>>` by them (see DtTokens.pred).
  lt: i32 = 0;
  predict: boolean = true;
  // The 1-based line at the scanning position, and where it starts.
  line: i32 = 1;
  lineStart: i32 = 0;
  // The line a string segment being added starts on, or -1.
  segLine: i32 = -1;
  // Whether we are still before the first token (for `// @dart=`).
  header: boolean = true;

  constructor(t: DtTokens) {
    this.t = t;
    this.src = t.src;
    this.n = t.n;
    this.sQuote = new Array<i32>(64);
    this.sTriple = new Array<boolean>(64);
    this.sDepth = new Array<i32>(64);
  }

  fail(why: string): void {
    if (!this.t.failed) {
      this.t.failed = true;
      this.t.why = `${why} at ${this.p}`;
    }
  }

  at(i: i32): i32 {
    if (i < this.n) {
      const src = this.src;
      if (i >= 0 && i < src.length) {
        return toI32(src[i]);
      }
      fault();
    }
    return -1;
  }

  /** at(i + k), for a small offset `k >= 0`. */
  peek(i: i32, k: i32): i32 {
    const j = toI64(i) + toI64(k);
    if (j >= toI64(this.n)) {
      return -1;
    }
    const src = this.src;
    const jj = toI32(j);
    if (jj >= 0 && jj < src.length) {
      return toI32(src[jj]);
    }
    fault();
    return -1;
  }

  /** Notes the byte `c` at `i` when it is `\n` or `\r` (`\r\n` counts at the `\n`). */
  newlineAt(c: i32, i: i32): void {
    if (c === 10 || (c === 13 && this.peek(i, 1) !== 10)) {
      const line = this.line;
      // `c` is the byte at `i`, inside the source; a line per byte at most.
      if (i < this.n && line < 2147483647) {
        this.line = line + 1;
        this.lineStart = i + 1;
      } else {
        fault();
      }
    }
  }

  add(kind: i32, a: i32, b: i32): void {
    const t = this.t;
    t.roomForToken();
    const i = t.count;
    const kinds = t.kind;
    const kws = t.kw;
    const starts = t.start;
    const ends = t.end;
    const lineS = t.lineS;
    const lineE = t.lineE;
    const cFirst = t.cFirst;
    const cCount = t.cCount;
    // roomForToken left room at count in every array.
    if (
      i < 0 ||
      i >= kinds.length ||
      i >= kws.length ||
      i >= starts.length ||
      i >= ends.length ||
      i >= lineS.length ||
      i >= lineE.length ||
      i >= cFirst.length ||
      i >= cCount.length
    ) {
      fault();
      return;
    }
    kinds[i] = kind;
    kws[i] = K_NONE;
    starts[i] = a;
    ends[i] = b;
    lineS[i] = this.segLine >= 0 ? this.segLine : this.line;
    lineE[i] = this.line;
    const pf = this.pendFirst;
    if (pf >= 0) {
      const nc = t.nc;
      // The pending comments are the last ones added.
      if (nc < pf) {
        fault();
        return;
      }
      cFirst[i] = pf;
      // nc >= pf >= 0: the u32 difference is exact.
      cCount[i] = toI32(toU32(nc) - toU32(pf));
    } else {
      cFirst[i] = -1;
      cCount[i] = 0;
    }
    this.pendFirst = -1;
    t.count = i + 1;
    this.header = false;
    const lt = this.lt;
    if (kind === T_LT) {
      // At most one `<` a token.
      if (lt >= i) {
        fault();
        return;
      }
      this.lt = lt + 1;
    } else if (kind === T_GT) {
      if (lt > 0) {
        this.lt = lt - 1;
      }
    } else if (kind === T_SHR || kind === T_USHR) {
      let m = 3;
      if (kind === T_SHR) {
        m = 2;
      }
      if (this.predict && lt >= m) {
        for (let j = 1; j < m; j++) {
          const c = t.count;
          const pred = t.pred;
          if (c <= 0 || c > pred.length) {
            fault();
            return;
          }
          pred[c - 1] = true;
          t.splitGt(c - 1);
        }
        const np = t.npred;
        // At most two a token.
        if (np >= 2147483645) {
          fault();
          return;
        }
        t.npred = np + m - 1;
        // lt >= m >= 2: the u32 difference is exact.
        this.lt = toI32(toU32(lt) - toU32(m));
      } else {
        this.lt = 0;
      }
    } else if (
      kind === T_SEMI ||
      kind === T_LBRACE ||
      kind === T_RBRACE ||
      kind === T_ARROW ||
      kind === T_AMPAMP ||
      kind === T_BARBAR
    ) {
      this.lt = 0;
    }
  }

  /** Records the line and column-1-ness of the comment about to be added at `a`. */
  commentStart(a: i32): void {
    const t = this.t;
    t.roomForComment();
    const nc = t.nc;
    const cLineS = t.cLineS;
    const cCol1 = t.cCol1;
    if (nc < 0 || nc >= cLineS.length || nc >= cCol1.length) {
      fault();
      return;
    }
    cLineS[nc] = this.line;
    cCol1[nc] = a === this.lineStart;
  }

  /** add, for a string segment that starts on line `segLine`. */
  addSeg(kind: i32, a: i32, b: i32, segLine: i32): void {
    this.segLine = segLine;
    this.add(kind, a, b);
    this.segLine = -1;
  }

  addComment(kind: i32, a: i32, b: i32): void {
    const t = this.t;
    t.roomForComment();
    const i = t.nc;
    const cStart = t.cStart;
    const cEnd = t.cEnd;
    const cKind = t.cKind;
    const cLineE = t.cLineE;
    if (i < 0 || i >= cStart.length || i >= cEnd.length || i >= cKind.length || i >= cLineE.length) {
      fault();
      return;
    }
    cStart[i] = a;
    cEnd[i] = b;
    cKind[i] = kind;
    cLineE[i] = this.line;
    if (this.pendFirst < 0) {
      this.pendFirst = i;
    }
    t.nc = i + 1;
  }

  scan(): void {
    const t = this.t;
    // BOF.
    const kinds = t.kind;
    const kws = t.kw;
    const starts = t.start;
    const ends = t.end;
    const cFirst = t.cFirst;
    const cCount = t.cCount;
    const lineS = t.lineS;
    const lineE = t.lineE;
    // The constructor left 16 tokens' room at least.
    if (
      kinds.length < 1 ||
      kws.length < 1 ||
      starts.length < 1 ||
      ends.length < 1 ||
      cFirst.length < 1 ||
      cCount.length < 1 ||
      lineS.length < 1 ||
      lineE.length < 1
    ) {
      fault();
      return;
    }
    kinds[0] = T_BOF;
    kws[0] = K_NONE;
    starts[0] = 0;
    ends[0] = 0;
    cFirst[0] = -1;
    cCount[0] = 0;
    lineS[0] = 1;
    lineE[0] = 1;
    t.count = 1;
    // Skip a UTF-8 byte order mark.
    if (this.n >= 3 && this.at(0) === 0xef && this.at(1) === 0xbb && this.at(2) === 0xbf) {
      this.p = 3;
    }
    if (this.at(this.p) === 35 && this.peek(this.p, 1) === 33) {
      const a = this.p;
      const n = this.n;
      let i = a;
      while (i < n && this.at(i) !== 10 && this.at(i) !== 13) {
        i++;
      }
      this.p = i;
      this.add(T_SCRIPT, a, i);
      this.header = true;
    }
    while (!t.failed) {
      const c = this.skipTrivia();
      if (c < 0) {
        break;
      }
      this.token(c);
    }
    if (this.ns > 0) {
      this.fail("unterminated interpolation");
    }
    this.add(T_EOF, this.n, this.n);
  }

  /** Skips whitespace and comments; answers the next byte or -1 at the end. */
  skipTrivia(): i32 {
    const n = this.n;
    const src = this.src;
    while (this.p < n) {
      const p = this.p;
      if (p < 0 || p >= src.length) {
        fault();
        return -1;
      }
      const c = toI32(src[p]);
      if (c === 32 || c === 9 || c === 12 || c === 11) {
        this.p = p + 1;
        continue;
      }
      if (c === 10 || c === 13) {
        this.newlineAt(c, p);
        this.p = p + 1;
        continue;
      }
      if (c === 47) {
        const p1 = p + 1;
        const d = this.at(p1);
        if (d === 47) {
          // `d` is the byte at p1, inside the source.
          if (p1 >= src.length) {
            fault();
            return -1;
          }
          const a = p;
          let i = p1 + 1;
          while (i < n) {
            if (i < 0 || i >= src.length) {
              fault();
              return -1;
            }
            const e = toI32(src[i]);
            if (e === 10 || e === 13) {
              break;
            }
            i++;
          }
          this.p = i;
          if (this.header && this.t.verMajor < 0) {
            this.languageVersion(a, i);
          }
          this.commentStart(a);
          this.addComment(C_LINE, a, i);
          continue;
        }
        if (d === 42) {
          if (p1 >= src.length) {
            fault();
            return -1;
          }
          const a = p;
          this.commentStart(a);
          let i = p1 + 1;
          let depth = 1;
          while (i < n && depth > 0) {
            if (i < 0 || i >= src.length) {
              fault();
              return -1;
            }
            const e = toI32(src[i]);
            const i1 = i + 1;
            if (e === 42 && this.at(i1) === 47) {
              // The `/` is at i1, inside the source.
              if (i1 >= n) {
                fault();
                return -1;
              }
              depth--;
              i = i1 + 1;
            } else if (e === 47 && this.at(i1) === 42) {
              // A comment opens at most every other byte.
              if (i1 >= n || depth >= i) {
                fault();
                return -1;
              }
              depth++;
              i = i1 + 1;
            } else {
              if (e === 10 || e === 13) {
                this.newlineAt(e, i);
              }
              i++;
            }
          }
          if (depth > 0) {
            this.fail("unterminated comment");
            return -1;
          }
          this.p = i;
          this.addComment(C_BLOCK, a, i);
          continue;
        }
      }
      return c;
    }
    return -1;
  }

  /** Recognizes `// @dart = 2.12` in the file header. */
  languageVersion(a: i32, b: i32): void {
    // `src[a, b)` is a `//` comment.
    if (a < 0 || a >= b) {
      fault();
      return;
    }
    const a1 = a + 1;
    if (a1 >= b) {
      fault();
      return;
    }
    let i = a1 + 1;
    if (this.at(i) === 47) {
      return; // a doc comment
    }
    while (i < b && this.at(i) === 32) {
      i++;
    }
    // `@dart` is inside the comment, which ends at a newline or the end.
    if (
      i >= b - 4 ||
      !(
        this.at(i) === 64 &&
        this.peek(i, 1) === 100 &&
        this.peek(i, 2) === 97 &&
        this.peek(i, 3) === 114 &&
        this.peek(i, 4) === 116
      )
    ) {
      return;
    }
    i = add32(i, 5);
    while (i < b && this.at(i) === 32) {
      i++;
    }
    if (i >= b || this.at(i) !== 61) {
      return;
    }
    i++;
    while (i < b && this.at(i) === 32) {
      i++;
    }
    let major = 0;
    const ms = i;
    while (i < b && dtIsDigit(this.at(i))) {
      if (major < 0 || major > 100000) {
        return;
      }
      major = major * 10 + (this.at(i) & 0xff) - 48;
      if (major > 100000) {
        return;
      }
      i++;
    }
    if (i === ms || i >= b || this.at(i) !== 46) {
      return;
    }
    i++;
    let minor = 0;
    const ns = i;
    while (i < b && dtIsDigit(this.at(i))) {
      if (minor < 0 || minor > 100000) {
        return;
      }
      minor = minor * 10 + (this.at(i) & 0xff) - 48;
      if (minor > 100000) {
        return;
      }
      i++;
    }
    if (i === ns) {
      return;
    }
    while (i < b && this.at(i) === 32) {
      i++;
    }
    if (i !== b) {
      return;
    }
    this.t.verMajor = major;
    this.t.verMinor = minor;
  }

  op(kind: i32, len: i32): void {
    const p = this.p;
    const e = add32(p, len);
    this.add(kind, p, e);
    this.p = e;
  }

  /** Sets the keyword of the token just added, the identifier `src[a, b)`. */
  setKeyword(a: i32, b: i32): void {
    const kw = dtKeyword(this.src, a, b);
    const t = this.t;
    const c = t.count;
    const kws = t.kw;
    if (c > 0 && c <= kws.length) {
      kws[c - 1] = kw;
    } else {
      fault();
    }
  }

  token(c: i32): void {
    const p = this.p;
    const n = this.n;
    // skipTrivia found `c` at p.
    if (p < 0 || p >= n) {
      fault();
      return;
    }
    if (dtIsIdStart(c)) {
      // A raw string?
      if (c === 114 && (this.at(p + 1) === 39 || this.at(p + 1) === 34)) {
        this.string(p, p + 1, true);
        return;
      }
      const src = this.src;
      let i = p + 1;
      while (i < n) {
        if (i < 0 || i >= src.length) {
          fault();
          return;
        }
        if (!dtIsIdPart(toI32(src[i]))) {
          break;
        }
        i++;
      }
      this.add(T_IDENT, p, i);
      this.setKeyword(p, i);
      this.p = i;
      return;
    }
    if (dtIsDigit(c) || (c === 46 && dtIsDigit(this.at(p + 1)))) {
      this.number(p);
      return;
    }
    const d = this.at(p + 1);
    switch (c) {
      case 39:
      case 34:
        this.string(p, p, false);
        return;
      case 40:
        this.op(T_LPAREN, 1);
        return;
      case 41:
        this.op(T_RPAREN, 1);
        return;
      case 91: {
        // `[]` and `[]=` are single tokens only as operator names.
        const cnt = this.t.count;
        const kinds = this.t.kind;
        const kws = this.t.kw;
        // BOF comes first.
        if (cnt <= 0 || cnt > kinds.length || cnt > kws.length) {
          fault();
          return;
        }
        const prev = cnt - 1;
        if (d === 93 && ((kinds[prev] === T_IDENT && kws[prev] === K_OPERATOR) || kinds[prev] === T_HASH)) {
          if (this.peek(p, 2) === 61) {
            this.op(T_INDEX_EQ, 3);
          } else {
            this.op(T_INDEX, 2);
          }
          return;
        }
        this.op(T_LBRACKET, 1);
        return;
      }
      case 93:
        this.op(T_RBRACKET, 1);
        return;
      case 123: {
        const ns = this.ns;
        if (ns > 0) {
          const sDepth = this.sDepth;
          if (ns > sDepth.length) {
            fault();
            return;
          }
          const v = sDepth[ns - 1];
          // A brace a byte at most.
          if (v >= p) {
            fault();
            return;
          }
          sDepth[ns - 1] = v + 1;
        }
        this.op(T_LBRACE, 1);
        return;
      }
      case 125: {
        const ns = this.ns;
        if (ns > 0) {
          const top = ns - 1;
          const sDepth = this.sDepth;
          const sQuote = this.sQuote;
          const sTriple = this.sTriple;
          if (top >= sDepth.length || top >= sQuote.length || top >= sTriple.length) {
            fault();
            return;
          }
          const v = sDepth[top];
          if (v === 0) {
            const quote = sQuote[top];
            const triple = sTriple[top];
            this.op(T_RBRACE, 1);
            this.ns = top;
            this.stringBody(this.p, quote, triple, false);
            return;
          }
          // The depth counts open braces.
          if (v < 0) {
            fault();
            return;
          }
          sDepth[top] = v - 1;
        }
        this.op(T_RBRACE, 1);
        return;
      }
      case 59:
        this.op(T_SEMI, 1);
        return;
      case 44:
        this.op(T_COMMA, 1);
        return;
      case 46:
        if (d === 46) {
          if (this.peek(p, 2) === 46) {
            if (this.peek(p, 3) === 63) {
              this.op(T_ELLIPSIS_Q, 4);
            } else {
              this.op(T_ELLIPSIS, 3);
            }
          } else {
            this.op(T_DOTDOT, 2);
          }
        } else {
          this.op(T_DOT, 1);
        }
        return;
      case 63:
        if (d === 63) {
          if (this.peek(p, 2) === 61) {
            this.op(T_QQ_EQ, 3);
          } else {
            this.op(T_QQ, 2);
          }
        } else if (d === 46) {
          if (this.peek(p, 2) === 46) {
            this.op(T_QDOTDOT, 3);
          } else {
            this.op(T_QDOT, 2);
          }
        } else {
          this.op(T_QUESTION, 1);
        }
        return;
      case 58:
        this.op(T_COLON, 1);
        return;
      case 61:
        if (d === 61) {
          this.op(T_EQEQ, 2);
        } else if (d === 62) {
          this.op(T_ARROW, 2);
        } else {
          this.op(T_EQ, 1);
        }
        return;
      case 33:
        if (d === 61) {
          this.op(T_NE, 2);
        } else {
          this.op(T_BANG, 1);
        }
        return;
      case 60:
        if (d === 61) {
          this.op(T_LE, 2);
        } else if (d === 60) {
          if (this.peek(p, 2) === 61) {
            this.op(T_SHL_EQ, 3);
          } else {
            this.op(T_SHL, 2);
          }
        } else {
          this.op(T_LT, 1);
        }
        return;
      case 62:
        if (d === 61) {
          this.op(T_GE, 2);
        } else if (d === 62) {
          const e = this.peek(p, 2);
          if (e === 61) {
            this.op(T_SHR_EQ, 3);
          } else if (e === 62) {
            if (this.peek(p, 3) === 61) {
              this.op(T_USHR_EQ, 4);
            } else {
              this.op(T_USHR, 3);
            }
          } else {
            this.op(T_SHR, 2);
          }
        } else {
          this.op(T_GT, 1);
        }
        return;
      case 43:
        if (d === 61) {
          this.op(T_PLUS_EQ, 2);
        } else if (d === 43) {
          this.op(T_INC, 2);
        } else {
          this.op(T_PLUS, 1);
        }
        return;
      case 45:
        if (d === 61) {
          this.op(T_MINUS_EQ, 2);
        } else if (d === 45) {
          this.op(T_DEC, 2);
        } else {
          this.op(T_MINUS, 1);
        }
        return;
      case 42:
        if (d === 61) {
          this.op(T_STAR_EQ, 2);
        } else {
          this.op(T_STAR, 1);
        }
        return;
      case 47:
        if (d === 61) {
          this.op(T_SLASH_EQ, 2);
        } else {
          this.op(T_SLASH, 1);
        }
        return;
      case 126:
        if (d === 47) {
          if (this.peek(p, 2) === 61) {
            this.op(T_TILDE_SLASH_EQ, 3);
          } else {
            this.op(T_TILDE_SLASH, 2);
          }
        } else {
          this.op(T_TILDE, 1);
        }
        return;
      case 37:
        if (d === 61) {
          this.op(T_PERCENT_EQ, 2);
        } else {
          this.op(T_PERCENT, 1);
        }
        return;
      case 38:
        if (d === 38) {
          if (this.peek(p, 2) === 61) {
            this.op(T_AMPAMP_EQ, 3);
          } else {
            this.op(T_AMPAMP, 2);
          }
        } else if (d === 61) {
          this.op(T_AMP_EQ, 2);
        } else {
          this.op(T_AMP, 1);
        }
        return;
      case 124:
        if (d === 124) {
          if (this.peek(p, 2) === 61) {
            this.op(T_BARBAR_EQ, 3);
          } else {
            this.op(T_BARBAR, 2);
          }
        } else if (d === 61) {
          this.op(T_BAR_EQ, 2);
        } else {
          this.op(T_BAR, 1);
        }
        return;
      case 94:
        if (d === 61) {
          this.op(T_CARET_EQ, 2);
        } else {
          this.op(T_CARET, 1);
        }
        return;
      case 35:
        this.op(T_HASH, 1);
        return;
      case 64:
        this.op(T_AT, 1);
        return;
      case 96:
        this.op(T_BACKTICK, 1);
        this.fail("backtick");
        return;
      default:
        this.fail("unexpected character");
        return;
    }
  }

  number(p: i32): void {
    const n = this.n;
    let i = p;
    let isDouble = false;
    if (this.at(i) === 48 && (this.peek(i, 1) === 120 || this.peek(i, 1) === 88) && dtIsHex(this.peek(i, 2))) {
      i = add32(i, 3);
      while (i < n && (dtIsHex(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, true)))) {
        i++;
      }
      this.add(T_INT, p, i);
      this.p = i;
      return;
    }
    while (i < n && (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false)))) {
      i++;
    }
    if (i < n && this.at(i) === 46 && dtIsDigit(this.at(i + 1))) {
      isDouble = true;
      i++;
      while (i < n && (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false)))) {
        i++;
      }
    }
    const e = this.at(i);
    if ((e === 101 || e === 69) && i < n) {
      let j = i + 1;
      if (j < n && (this.at(j) === 43 || this.at(j) === 45)) {
        j++;
      }
      if (dtIsDigit(this.at(j))) {
        isDouble = true;
        i = j;
        while (i < n && (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false)))) {
          i++;
        }
      }
    }
    this.add(isDouble ? T_DOUBLE : T_INT, p, i);
    this.p = i;
  }

  /** Whether the `_` run at `i` separates two digits. */
  sepOk(i: i32, hex: boolean): boolean {
    const n = this.n;
    let j = i;
    while (j < n && this.at(j) === 95) {
      j++;
    }
    const c = this.at(j);
    return hex ? dtIsHex(c) : dtIsDigit(c);
  }

  /** Scans a string literal starting at `a` whose quote is at `q`. */
  string(a: i32, q: i32, raw: boolean): void {
    const quote = this.at(q);
    // The quote is inside the source.
    if (q < 0 || q >= this.n) {
      fault();
      return;
    }
    let triple = false;
    let i = q + 1;
    if (this.at(q + 1) === quote && this.peek(q, 2) === quote) {
      triple = true;
      i = add32(q, 3);
    }
    this.stringBody(a, quote, triple, raw, i);
  }

  /**
   * Scans string contents from `from` (the segment's token starts at `a`)
   * up to the closing quote or the next interpolation.
   */
  stringBody(a0: i32, quote: i32, triple: boolean, raw: boolean, from: i32 = -1): void {
    let a = a0;
    let i = from < 0 ? a0 : from;
    const n = this.n;
    const src = this.src;
    let segLine = this.line;
    while (true) {
      if (i >= n) {
        this.fail("unterminated string");
        return;
      }
      if (i < 0 || i >= src.length) {
        fault();
        return;
      }
      const c = toI32(src[i]);
      const i1 = i + 1;
      if (c === quote) {
        if (!triple) {
          this.addSeg(T_STRING, a, i1, segLine);
          this.p = i1;
          return;
        }
        if (this.at(i1) === quote && this.peek(i, 2) === quote) {
          const e = add32(i, 3);
          this.addSeg(T_STRING, a, e, segLine);
          this.p = e;
          return;
        }
        i = i1;
        continue;
      }
      if (c === 10 || c === 13) {
        if (!triple) {
          this.fail("newline in string");
          return;
        }
        this.newlineAt(c, i);
      }
      if (c === 92 && !raw) {
        const d = this.at(i1);
        if (d === 10 || d === 13) {
          this.newlineAt(d, i1);
        }
        if (i1 >= n) {
          // A `\` at the end: past it, the string is unterminated.
          this.fail("unterminated string");
          return;
        }
        i = i1 + 1;
        continue;
      }
      if (c === 36 && !raw) {
        const d = this.at(i1);
        if (d === 123) {
          // The `{` is at i1, inside the source.
          if (i1 >= n) {
            fault();
            return;
          }
          this.addSeg(T_STRING, a, i, segLine);
          this.add(T_INTERP_EXPR, i, i1 + 1);
          this.p = i1 + 1;
          const ns = this.ns;
          const sQuote = this.sQuote;
          if (ns >= toI32(sQuote.length)) {
            this.fail("interpolation too deep");
            return;
          }
          const sTriple = this.sTriple;
          const sDepth = this.sDepth;
          if (ns < 0 || ns >= sTriple.length || ns >= sDepth.length) {
            fault();
            return;
          }
          sQuote[ns] = quote;
          sTriple[ns] = triple;
          sDepth[ns] = 0;
          this.ns = ns + 1;
          return;
        }
        if ((d >= 97 && d <= 122) || (d >= 65 && d <= 90) || d === 95) {
          // The letter is at i1, inside the source.
          if (i1 >= n) {
            fault();
            return;
          }
          this.addSeg(T_STRING, a, i, segLine);
          this.add(T_INTERP_IDENT, i, i1);
          let j = i1 + 1;
          while (j < n) {
            if (j < 0 || j >= src.length) {
              fault();
              return;
            }
            const e = toI32(src[j]);
            if ((e >= 97 && e <= 122) || (e >= 65 && e <= 90) || e === 95 || (e >= 48 && e <= 57)) {
              j++;
            } else {
              break;
            }
          }
          this.add(T_IDENT, i1, j);
          this.setKeyword(i1, j);
          // The rest of the string is the next segment.
          a = j;
          i = j;
          segLine = this.line;
          continue;
        }
        this.fail("bad interpolation");
        return;
      }
      i = i1;
    }
  }
}

/** Scans `src[0, n)`. */
export const dtScan = (src: u8[], n: i32): DtTokens => {
  const t = new DtTokens(src, n);
  const s = new DtScanner(t);
  s.scan();
  return t;
};

/** Scans without splitting any `>>` up front (see DtTokens.pred). */
export const dtScanPlain = (src: u8[], n: i32): DtTokens => {
  const t = new DtTokens(src, n);
  const s = new DtScanner(t);
  s.predict = false;
  s.scan();
  return t;
};

/** Whether the parser took every `>` the scanner split off as a closing angle bracket. */
export const dtPredictionsHeld = (t: DtTokens): boolean => {
  if (t.npred === 0) {
    return true;
  }
  const count = t.count;
  const pred = t.pred;
  const gt = t.gt;
  if (count > pred.length || count > gt.length) {
    fault();
    return false;
  }
  for (let i = 0; i < count && i < pred.length && i < gt.length; i++) {
    if (pred[i] && !gt[i]) {
      return false;
    }
  }
  return true;
};
