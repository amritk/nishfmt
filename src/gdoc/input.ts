// The token model google-java-format and ktfmt share: every piece of the
// source is a "tok" (a token, a comment, a run of spaces or one newline), and
// each real token carries the comments and whitespace before and after it.
// A language's lexer fills the tok columns; `buildTokens` groups them.
//
// Ported from google-java-format 1.28.0's Input, JavaInput and InputOutput
// (Apache License 2.0, Copyright 2015 Google Inc.); tools/kotlin/NOTES.md says
// why that credit holds for ktfmt's 1.23.0 and Java's 2.0.0.

import { add32, bytesText, growI32, sub32, utf16Len } from "../core/arr";
import { fault } from "../core/fault";

// Tok flags.
export const TF_TOKEN: i32 = 1; // a real token (not whitespace or a comment)
export const TF_NEWLINE: i32 = 2; // "\n", "\r\n" or "\r"
export const TF_LINE_COMMENT: i32 = 4; // starts with //
export const TF_BLOCK_COMMENT: i32 = 8; // starts with /*
export const TF_JAVADOC: i32 = 16; // starts with /** and is not /**/ or /***
export const TF_PARAM_COMMENT: i32 = 32; // /* name= */ by JavaInput's pattern
export const TF_SPACES: i32 = 64; // a run of spaces or tabs
export const TF_TOMB: i32 = 128; // a token whose line-ending spaces are written as tombstones (ktfmt)
export const TF_OTHER_COMMENT: i32 = 256; // a comment that is neither // nor /* (ktfmt's shebang)

// Tok.isComment.
export const TF_COMMENT: i32 = 268; // TF_LINE_COMMENT | TF_BLOCK_COMMENT | TF_OTHER_COMMENT

export class GInput {
  src: u8[];
  n: i32 = 0;
  ascii: boolean = true;

  // Toks.
  nToks: i32 = 0;
  tPos: i32[];
  tEnd: i32[];
  tIdx: i32[]; // the tok's number (tokens and comments), or -1
  tCol: i32[]; // UTF-16 column of the tok's start
  tFlags: i32[];
  tKind: i32[]; // the language's token kind, or 0
  kN: i32 = 0; // numbered toks, excluding EOF

  // Tokens: a real tok with the toks before and after it.
  nTokens: i32 = 0;
  kTok: i32[];
  kBefore: i32[]; // start in refs
  kBeforeN: i32[];
  kAfter: i32[];
  kAfterN: i32[];
  kSpanStart: i32[]; // first character the token's comments cover
  kSpanEnd: i32[]; // last character (inclusive)
  refs: i32[];
  nRefs: i32 = 0;
  // Number -> token holding that numbered tok.
  kToToken: i32[];

  // Input lines: the range of tok numbers on each line, [lo, hi), lo = -1 when empty.
  nLines: i32 = 0;
  lineLo: i32[];
  lineHi: i32[];

  constructor() {
    this.src = new Array<u8>(0);
    this.tPos = new Array<i32>(256);
    this.tEnd = new Array<i32>(256);
    this.tIdx = new Array<i32>(256);
    this.tCol = new Array<i32>(256);
    this.tFlags = new Array<i32>(256);
    this.tKind = new Array<i32>(256);
    this.kTok = new Array<i32>(256);
    this.kBefore = new Array<i32>(256);
    this.kBeforeN = new Array<i32>(256);
    this.kAfter = new Array<i32>(256);
    this.kAfterN = new Array<i32>(256);
    this.kSpanStart = new Array<i32>(256);
    this.kSpanEnd = new Array<i32>(256);
    this.refs = new Array<i32>(512);
    this.kToToken = new Array<i32>(256);
    this.lineLo = new Array<i32>(256);
    this.lineHi = new Array<i32>(256);
  }
  reset(src: u8[], n: i32): void {
    this.src = src;
    this.n = n;
    this.nToks = 0;
    this.nTokens = 0;
    this.nRefs = 0;
    this.kN = 0;
    this.nLines = 0;
    let ascii = true;
    for (let i = 0; i < n && i < src.length; i++) {
      if (toI32(src[i]) >= 0x80) {
        ascii = false;
        break;
      }
    }
    if (ascii && n > src.length) {
      fault(); // the scan would have read past `src`
    }
    this.ascii = ascii;
  }

  /** Characters (UTF-16 units) in src[a, b). */
  width(a: i32, b: i32): i32 {
    if (this.ascii) {
      return a >= 0 && b >= 0 ? b - a : sub32(b, a);
    }
    return utf16Len(this.src, a, b);
  }

  tokWidth(t: i32): i32 {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t >= 0 && t < tPos.length && t < tEnd.length) {
      return this.width(tPos[t], tEnd[t]);
    }
    fault();
    return 0;
  }

  text(t: i32): string {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t >= 0 && t < tPos.length && t < tEnd.length) {
      return bytesText(this.src, tPos[t], tEnd[t]);
    }
    fault();
    return "";
  }

  /** Whether tok `t`'s text is exactly `s`. */
  is(t: i32, s: string): boolean {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return false;
    }
    return this.rangeIs(tPos[t], tEnd[t], s);
  }

  /** Whether toks `a` and `b` have the same text. */
  sameText(a: i32, b: i32): boolean {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (a < 0 || a >= tPos.length || a >= tEnd.length || b < 0 || b >= tPos.length || b >= tEnd.length) {
      fault();
      return false;
    }
    const pa = tPos[a];
    const pb = tPos[b];
    const n = gSpan(pa, tEnd[a]);
    if (gSpan(pb, tEnd[b]) !== n) {
      return false;
    }
    const src = this.src;
    let i = pa;
    let j = pb;
    for (let k = 0; k < n; k++) {
      if (i < 0 || i >= src.length || j < 0 || j >= src.length) {
        fault();
        return false;
      }
      if (src[i] !== src[j]) {
        return false;
      }
      i++;
      j++;
    }
    return true;
  }

  /** Whether the bytes src[a, b) are exactly `s`. */
  rangeIs(a: i32, b: i32, s: string): boolean {
    const k = toI32(s.length);
    if (gSpan(a, b) !== k) {
      return false;
    }
    const src = this.src;
    let j = a;
    for (let i = 0; i < k; i++) {
      if (j < 0 || j >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[j]) !== s.charCodeAt(i)) {
        return false;
      }
      j++;
    }
    return true;
  }

  firstByte(t: i32): i32 {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return -1;
    }
    const a = tPos[t];
    if (tEnd[t] <= a) {
      return -1;
    }
    const src = this.src;
    if (a >= 0 && a < src.length) {
      return toI32(src[a]);
    }
    fault();
    return -1;
  }

  /** Appends a tok; a numbered one (token or comment) gets the next number. */
  addTok(pos: i32, end: i32, flags: i32, kind: i32, col: i32): void {
    const t = this.nToks;
    if (t >= toI32(this.tPos.length)) {
      if (t < 0 || t > 1073741815) {
        fault();
        return;
      }
      const c = t * 2 + 16;
      this.tPos = growI32(this.tPos, c);
      this.tEnd = growI32(this.tEnd, c);
      this.tIdx = growI32(this.tIdx, c);
      this.tCol = growI32(this.tCol, c);
      this.tFlags = growI32(this.tFlags, c);
      this.tKind = growI32(this.tKind, c);
    }
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    const tIdx = this.tIdx;
    const tCol = this.tCol;
    const tFlags = this.tFlags;
    const tKind = this.tKind;
    if (
      t < 0 ||
      t >= tPos.length ||
      t >= tEnd.length ||
      t >= tIdx.length ||
      t >= tCol.length ||
      t >= tFlags.length ||
      t >= tKind.length
    ) {
      fault();
      return;
    }
    tPos[t] = pos;
    tEnd[t] = end;
    tFlags[t] = flags;
    tKind[t] = kind;
    tCol[t] = col;
    if ((flags & (TF_TOKEN | TF_COMMENT)) !== 0) {
      const kn = this.kN;
      if (kn >= 2147483647) {
        fault();
        return;
      }
      tIdx[t] = kn;
      this.kN = kn + 1;
    } else {
      tIdx[t] = -1;
    }
    this.nToks = t + 1;
  }

  /** Adds the EOF tok: a token with empty text, numbered kN (kN is not bumped). */
  addEof(pos: i32, col: i32): void {
    this.addTok(pos, pos, TF_TOKEN, 0, col);
    const kn = this.kN;
    if (kn >= 1) {
      this.kN = kn - 1;
    } else {
      fault(); // addTok numbered the EOF tok unless it faulted
    }
  }

  private pushRef(t: i32): void {
    const n = this.nRefs;
    if (n >= toI32(this.refs.length)) {
      if (n < 0 || n > 1073741815) {
        fault();
        return;
      }
      this.refs = growI32(this.refs, n * 2 + 16);
    }
    const refs = this.refs;
    if (n >= 0 && n < refs.length) {
      refs[n] = t;
      this.nRefs = n + 1;
    } else {
      fault();
    }
  }

  /** The refs pushed since `before` (`nRefs - before`). */
  private refsSince(before: i32): i32 {
    return gSpan(before, this.nRefs);
  }

  private newToken(tok: i32, before: i32, beforeN: i32, after: i32, afterN: i32): void {
    const k = this.nTokens;
    if (k >= toI32(this.kTok.length)) {
      if (k < 0 || k > 1073741815) {
        fault();
        return;
      }
      const c = k * 2 + 16;
      this.kTok = growI32(this.kTok, c);
      this.kBefore = growI32(this.kBefore, c);
      this.kBeforeN = growI32(this.kBeforeN, c);
      this.kAfter = growI32(this.kAfter, c);
      this.kAfterN = growI32(this.kAfterN, c);
      this.kSpanStart = growI32(this.kSpanStart, c);
      this.kSpanEnd = growI32(this.kSpanEnd, c);
    }
    const kTok = this.kTok;
    const kBefore = this.kBefore;
    const kBeforeN = this.kBeforeN;
    const kAfter = this.kAfter;
    const kAfterN = this.kAfterN;
    if (
      k < 0 ||
      k >= kTok.length ||
      k >= kBefore.length ||
      k >= kBeforeN.length ||
      k >= kAfter.length ||
      k >= kAfterN.length
    ) {
      fault();
      return;
    }
    kTok[k] = tok;
    kBefore[k] = before;
    kBeforeN[k] = beforeN;
    kAfter[k] = after;
    kAfterN[k] = afterN;
    this.nTokens = k + 1;
  }

  /**
   * Groups the toks into tokens as JavaInput.buildTokens does: a token takes
   * the toks before it, and after it every non-token up to and including the
   * first one with a line break. A block comment after `(`, `<` or `.` and a
   * javadoc after `;` belong to the next token; a parameter comment
   * (`/* name= *\/`) starts the next token's toks and drops the newlines after it.
   *
   * The last tok is the EOF token, so the scans for the next token stop
   * inside the toks; one that would run past the flags faults.
   */
  buildTokens(): void {
    const nT = this.nToks;
    const fl = this.tFlags;
    let k = 0;
    let before = this.nRefs;
    while (k >= 0 && k < nT) {
      let tok = k;
      while (true) {
        if (k < 0 || k >= fl.length) {
          fault();
          return;
        }
        const f = fl[k];
        if ((f & TF_TOKEN) !== 0) {
          tok = k;
          k = k + 1;
          break;
        }
        const t = k;
        k++;
        this.pushRef(t);
        if ((f & TF_PARAM_COMMENT) !== 0) {
          k = gSkipNewlines(fl, k);
        }
      }
      const beforeN = this.refsSince(before);
      // The toks after are pushed after the toks before, so the two ranges
      // stay contiguous in `refs`.
      const after = this.nRefs;
      let paramSplit = false;
      while (k >= 0 && k < nT) {
        if (k >= fl.length) {
          fault();
          return;
        }
        const f = fl[k];
        if ((f & TF_TOKEN) !== 0) {
          break;
        }
        if ((f & TF_BLOCK_COMMENT) !== 0) {
          if (this.is(tok, "(") || this.is(tok, "<") || this.is(tok, ".")) {
            break;
          }
        }
        if ((f & TF_JAVADOC) !== 0 && this.is(tok, ";")) {
          break;
        }
        if ((f & TF_PARAM_COMMENT) !== 0) {
          this.newToken(tok, before, beforeN, after, this.refsSince(after));
          before = this.nRefs;
          this.pushRef(k);
          k = gSkipNewlines(fl, k + 1);
          paramSplit = true;
          break;
        }
        const t = k;
        k++;
        this.pushRef(t);
        if (this.containsBreak(t)) {
          break;
        }
      }
      if (paramSplit) {
        continue;
      }
      this.newToken(tok, before, beforeN, after, this.refsSince(after));
      before = this.nRefs;
    }
    this.finishTokens();
  }

  containsBreak(t: i32): boolean {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return false;
    }
    const src = this.src;
    const e = tEnd[t];
    let i = tPos[t];
    while (i >= 0 && i < e && i < src.length) {
      const c = toI32(src[i]);
      if (c === 10 || c === 13) {
        return true;
      }
      i++;
    }
    if (i < e) {
      fault(); // the scan would have read outside `src`
    }
    return false;
  }

  /** `containsBreak(t) ? broken : tokWidth(t)`, with one range check and one scan. */
  lineWidth(t: i32, broken: i32): i32 {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return 0;
    }
    const src = this.src;
    const a = tPos[t];
    const e = tEnd[t];
    let i = a;
    while (i >= 0 && i < e && i < src.length) {
      const c = toI32(src[i]);
      if (c === 10 || c === 13) {
        return broken;
      }
      i++;
    }
    if (i < e) {
      fault(); // the scan would have read outside `src`
      return 0;
    }
    return this.width(a, e);
  }

  /** Spans, the number-to-token map and the per-line tok ranges. */
  finishTokens(): void {
    const nk = this.nTokens;
    const kn = this.kN;
    if (kn > 2147483645) {
      fault();
      return;
    }
    this.kToToken = growI32(this.kToToken, kn + 2);
    const kTok = this.kTok;
    const kBefore = this.kBefore;
    const kBeforeN = this.kBeforeN;
    const kAfter = this.kAfter;
    const kAfterN = this.kAfterN;
    const kSpanStart = this.kSpanStart;
    const kSpanEnd = this.kSpanEnd;
    const kToToken = this.kToToken;
    const refs = this.refs;
    const tIdx = this.tIdx;
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    for (let k = 0; k < nk; k++) {
      if (
        k >= kTok.length ||
        k >= kBefore.length ||
        k >= kBeforeN.length ||
        k >= kAfter.length ||
        k >= kAfterN.length ||
        k >= kSpanStart.length ||
        k >= kSpanEnd.length
      ) {
        fault();
        return;
      }
      const tok = kTok[k];
      const b0 = kBefore[k];
      const bn = kBeforeN[k];
      const a0 = kAfter[k];
      const an = kAfterN[k];
      let s = tok;
      let r = b0;
      for (let j = 0; j < bn; j++) {
        if (r < 0 || r >= refs.length) {
          fault();
          return;
        }
        const t = refs[r];
        if (t < 0 || t >= tIdx.length) {
          fault();
          return;
        }
        if (tIdx[t] >= 0) {
          s = t;
          break;
        }
        // Non-numbered toks never start a span.
        r++;
      }
      let e = tok;
      if (an > 0) {
        // The last ref after the token, a0 + an - 1, then down to a0.
        r = gSpan(1, add32(a0, an));
        for (let j = an - 1; j >= 0; j--) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          if (t < 0 || t >= tIdx.length) {
            fault();
            return;
          }
          if (tIdx[t] >= 0) {
            e = t;
            break;
          }
          r--;
        }
      }
      if (s < 0 || s >= tPos.length || e < 0 || e >= tPos.length || e >= tEnd.length) {
        fault();
        return;
      }
      kSpanStart[k] = tPos[s];
      const pe = tPos[e];
      let upper = pe;
      const ee = tEnd[e];
      if (ee > pe) {
        upper = gSpan(1, ee); // ee > pe, so ee - 1 fits
      }
      kSpanEnd[k] = upper;
      r = b0;
      for (let j = 0; j < bn; j++) {
        if (r < 0 || r >= refs.length) {
          fault();
          return;
        }
        const t = refs[r];
        if (t < 0 || t >= tIdx.length) {
          fault();
          return;
        }
        const x = tIdx[t];
        if (x >= 0) {
          if (x >= kToToken.length) {
            fault();
            return;
          }
          kToToken[x] = k;
        }
        r++;
      }
      if (tok < 0 || tok >= tIdx.length) {
        fault();
        return;
      }
      const xt = tIdx[tok];
      if (xt < 0 || xt >= kToToken.length) {
        fault();
        return;
      }
      kToToken[xt] = k;
      r = a0;
      for (let j = 0; j < an; j++) {
        if (r < 0 || r >= refs.length) {
          fault();
          return;
        }
        const t = refs[r];
        if (t < 0 || t >= tIdx.length) {
          fault();
          return;
        }
        const x = tIdx[t];
        if (x >= 0) {
          if (x >= kToToken.length) {
            fault();
            return;
          }
          kToToken[x] = k;
        }
        r++;
      }
    }
    // InputOutput.computeRanges: each line's numbered toks.
    let line = 0;
    this.ensureLine(0);
    const lineLo0 = this.lineLo;
    if (lineLo0.length > 0) {
      lineLo0[0] = -1;
    } else {
      fault();
      return;
    }
    const nToks = this.nToks;
    for (let t = 0; t < nToks; t++) {
      const line0 = line;
      const lr = toI64(line) + toI64(this.countBreaks(t));
      if (lr > toI64(2147483646)) {
        fault();
        return;
      }
      line = toI32(lr);
      if (t >= tIdx.length) {
        fault();
        return;
      }
      const k = tIdx[t];
      this.ensureLine(line);
      if (k >= 0) {
        if (k >= 2147483647) {
          fault();
          return;
        }
        const lineLo = this.lineLo;
        const lineHi = this.lineHi;
        for (let i = line0; i <= line; i++) {
          if (i < 0 || i >= lineLo.length || i >= lineHi.length) {
            fault();
            return;
          }
          if (lineLo[i] < 0) {
            lineLo[i] = k;
          }
          lineHi[i] = k + 1;
        }
      }
    }
    if (line >= 2147483647) {
      fault();
      return;
    }
    this.nLines = line + 1;
  }

  private ensureLine(i: i32): void {
    while (this.nLines <= i) {
      const n = this.nLines;
      if (n >= toI32(this.lineLo.length)) {
        if (n < 0 || n > 1073741815) {
          fault();
          return;
        }
        this.lineLo = growI32(this.lineLo, n * 2 + 16);
        this.lineHi = growI32(this.lineHi, n * 2 + 16);
      }
      const lineLo = this.lineLo;
      const lineHi = this.lineHi;
      if (n < 0 || n >= lineLo.length || n >= lineHi.length) {
        fault();
        return;
      }
      lineLo[n] = -1;
      lineHi[n] = -1;
      this.nLines = n + 1;
    }
  }

  /** Line breaks in tok `t` ("\r\n" counts once). */
  countBreaks(t: i32): i32 {
    const tPos = this.tPos;
    const tEnd = this.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return 0;
    }
    const src = this.src;
    let n = 0;
    const e = tEnd[t];
    let i = tPos[t];
    while (i >= 0 && i < e && i < src.length) {
      const c = toI32(src[i]);
      if (c === 10 || c === 13) {
        // At most one break a byte, and `src` is shorter than 2^31 - 1 bytes.
        if (n >= 2147483647) {
          fault();
          return 0;
        }
        n++;
        if (c === 13) {
          const j = i + 1;
          if (j < e && j < src.length && toI32(src[j]) === 10) {
            i = j;
          }
        }
      }
      i++;
    }
    if (i < e) {
      fault(); // the scan would have read outside `src`
    }
    return n;
  }

  /** The token whose span holds character `pos`, or -1 (positionTokenMap.get). */
  tokenAt(pos: i32): i32 {
    const kSpanStart = this.kSpanStart;
    const kSpanEnd = this.kSpanEnd;
    let lo = 0;
    let hi = gLastIndex(this.nTokens);
    while (lo <= hi) {
      const mid = gMid(lo, hi);
      if (mid < 0 || mid >= kSpanStart.length || mid >= kSpanEnd.length) {
        fault();
        return -1;
      }
      if (kSpanStart[mid] > pos) {
        hi = mid - 1;
      } else if (kSpanEnd[mid] < pos) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return -1;
  }

  /** The column of the tok starting at `pos` (positionToColumnMap.get). */
  columnAt(pos: i32): i32 {
    const tPos = this.tPos;
    const tCol = this.tCol;
    let lo = 0;
    let hi = gLastIndex(this.nToks);
    while (lo <= hi) {
      const mid = gMid(lo, hi);
      if (mid < 0 || mid >= tPos.length) {
        fault();
        return -1;
      }
      const p = tPos[mid];
      if (p > pos) {
        hi = mid - 1;
      } else if (p < pos) {
        lo = mid + 1;
      } else {
        // Zero-width toks share a position with what follows; the first wins
        // in an ImmutableMap built in order only if positions differ, so take
        // the lowest index at this position.
        let m = mid;
        while (m > 0 && m <= tPos.length && tPos[m - 1] === pos) {
          m--;
        }
        if (m >= 0 && m < tCol.length) {
          return tCol[m];
        }
        fault();
        return -1;
      }
    }
    return -1;
  }
}

/** `e - a`; a difference outside i32 faults. */
export const gSpan = (a: i32, e: i32): i32 => (a >= 0 && e >= 0 ? e - a : sub32(e, a));

/** `n - 1` for a count `n`: -1 for none (and for a count no array can hold). */
const gLastIndex = (n: i32): i32 => (n > 0 ? n - 1 : -1);

/** `(lo + hi) >> 1` for the bounds of a binary search, `0 <= lo <= hi`. */
const gMid = (lo: i32, hi: i32): i32 => toI32((toU32(lo) + toU32(hi)) >> toU32(1));

/** The first tok from `k` on that is not a newline; a scan past the flags faults. */
const gSkipNewlines = (fl: i32[], k0: i32): i32 => {
  let k = k0;
  while (k >= 0 && k < fl.length && (fl[k] & TF_NEWLINE) !== 0) {
    k++;
  }
  if (k < 0 || k >= fl.length) {
    fault();
  }
  return k;
};
