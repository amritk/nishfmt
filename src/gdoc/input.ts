// The token model google-java-format and ktfmt share: every piece of the
// source is a "tok" (a token, a comment, a run of spaces or one newline), and
// each real token carries the comments and whitespace before and after it.
// A language's lexer fills the tok columns; `buildTokens` groups them.
//
// Ported from google-java-format 1.28.0's Input, JavaInput and InputOutput
// (Apache License 2.0, Copyright 2015 Google Inc.); 1.23.0 (ktfmt 0.65's) and
// 2.0.0 (Java's) give the same output here, as tools/kotlin/NOTES.md says.

import { growI32, utf16Len } from "../core/arr";

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
    for (let i = 0; i < n; i++) {
      if (toI32(src[i]) >= 0x80) {
        ascii = false;
        break;
      }
    }
    this.ascii = ascii;
  }

  /** Characters (UTF-16 units) in src[a, b). */
  width(a: i32, b: i32): i32 {
    return this.ascii ? b - a : utf16Len(this.src, a, b);
  }

  tokWidth(t: i32): i32 {
    return this.width(this.tPos[t], this.tEnd[t]);
  }

  text(t: i32): string {
    return String.fromBytes(this.src, this.tPos[t], this.tEnd[t]);
  }

  /** Whether tok `t`'s text is exactly `s`. */
  is(t: i32, s: string): boolean {
    const a = this.tPos[t];
    const k = toI32(s.length);
    if (this.tEnd[t] - a !== k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** Whether toks `a` and `b` have the same text. */
  sameText(a: i32, b: i32): boolean {
    const n = this.tEnd[a] - this.tPos[a];
    if (this.tEnd[b] - this.tPos[b] !== n) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (this.src[this.tPos[a] + i] !== this.src[this.tPos[b] + i]) {
        return false;
      }
    }
    return true;
  }

  /** Whether the bytes src[a, b) are exactly `s`. */
  rangeIs(a: i32, b: i32, s: string): boolean {
    const k = toI32(s.length);
    if (b - a !== k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  firstByte(t: i32): i32 {
    return this.tEnd[t] > this.tPos[t] ? toI32(this.src[this.tPos[t]]) : -1;
  }

  /** Appends a tok; a numbered one (token or comment) gets the next number. */
  addTok(pos: i32, end: i32, flags: i32, kind: i32, col: i32): void {
    const t = this.nToks;
    if (t >= toI32(this.tPos.length)) {
      const c = t * 2 + 16;
      this.tPos = growI32(this.tPos, c);
      this.tEnd = growI32(this.tEnd, c);
      this.tIdx = growI32(this.tIdx, c);
      this.tCol = growI32(this.tCol, c);
      this.tFlags = growI32(this.tFlags, c);
      this.tKind = growI32(this.tKind, c);
    }
    this.tPos[t] = pos;
    this.tEnd[t] = end;
    this.tFlags[t] = flags;
    this.tKind[t] = kind;
    this.tCol[t] = col;
    if ((flags & (TF_TOKEN | TF_COMMENT)) !== 0) {
      this.tIdx[t] = this.kN;
      this.kN = this.kN + 1;
    } else {
      this.tIdx[t] = -1;
    }
    this.nToks = t + 1;
  }

  /** Adds the EOF tok: a token with empty text, numbered kN (kN is not bumped). */
  addEof(pos: i32, col: i32): void {
    this.addTok(pos, pos, TF_TOKEN, 0, col);
    this.kN = this.kN - 1;
  }

  private pushRef(t: i32): void {
    if (this.nRefs >= toI32(this.refs.length)) {
      this.refs = growI32(this.refs, this.nRefs * 2 + 16);
    }
    this.refs[this.nRefs] = t;
    this.nRefs = this.nRefs + 1;
  }

  private newToken(tok: i32, before: i32, beforeN: i32, after: i32, afterN: i32): void {
    const k = this.nTokens;
    if (k >= toI32(this.kTok.length)) {
      const c = k * 2 + 16;
      this.kTok = growI32(this.kTok, c);
      this.kBefore = growI32(this.kBefore, c);
      this.kBeforeN = growI32(this.kBeforeN, c);
      this.kAfter = growI32(this.kAfter, c);
      this.kAfterN = growI32(this.kAfterN, c);
      this.kSpanStart = growI32(this.kSpanStart, c);
      this.kSpanEnd = growI32(this.kSpanEnd, c);
    }
    this.kTok[k] = tok;
    this.kBefore[k] = before;
    this.kBeforeN[k] = beforeN;
    this.kAfter[k] = after;
    this.kAfterN[k] = afterN;
    this.nTokens = k + 1;
  }

  /**
   * Groups the toks into tokens as JavaInput.buildTokens does: a token takes
   * the toks before it, and after it every non-token up to and including the
   * first one with a line break. A block comment after `(`, `<` or `.` and a
   * javadoc after `;` belong to the next token; a parameter comment
   * (`/* name= *\/`) starts the next token's toks and drops the newlines after it.
   */
  buildTokens(): void {
    const nT = this.nToks;
    const fl = this.tFlags;
    let k = 0;
    let before = this.nRefs;
    while (k < nT) {
      while ((fl[k] & TF_TOKEN) === 0) {
        const t = k;
        k++;
        this.pushRef(t);
        if ((fl[t] & TF_PARAM_COMMENT) !== 0) {
          while ((fl[k] & TF_NEWLINE) !== 0) {
            k++;
          }
        }
      }
      const tok = k;
      k++;
      const beforeN = this.nRefs - before;
      // The toks after are pushed after the toks before, so the two ranges
      // stay contiguous in `refs`.
      const after = this.nRefs;
      let paramSplit = false;
      while (k < nT && (fl[k] & TF_TOKEN) === 0) {
        if ((fl[k] & TF_BLOCK_COMMENT) !== 0) {
          if (this.is(tok, "(") || this.is(tok, "<") || this.is(tok, ".")) {
            break;
          }
        }
        if ((fl[k] & TF_JAVADOC) !== 0 && this.is(tok, ";")) {
          break;
        }
        if ((fl[k] & TF_PARAM_COMMENT) !== 0) {
          this.newToken(tok, before, beforeN, after, this.nRefs - after);
          before = this.nRefs;
          this.pushRef(k);
          k++;
          while ((fl[k] & TF_NEWLINE) !== 0) {
            k++;
          }
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
      this.newToken(tok, before, beforeN, after, this.nRefs - after);
      before = this.nRefs;
    }
    this.finishTokens();
  }

  containsBreak(t: i32): boolean {
    for (let i = this.tPos[t]; i < this.tEnd[t]; i++) {
      const c = toI32(this.src[i]);
      if (c === 10 || c === 13) {
        return true;
      }
    }
    return false;
  }

  /** Spans, the number-to-token map and the per-line tok ranges. */
  finishTokens(): void {
    const nk = this.nTokens;
    this.kToToken = growI32(this.kToToken, this.kN + 2);
    for (let k = 0; k < nk; k++) {
      let s = this.kTok[k];
      for (let j = 0; j < this.kBeforeN[k]; j++) {
        const t = this.refs[this.kBefore[k] + j];
        if (this.tIdx[t] >= 0) {
          s = t;
          break;
        }
        // Non-numbered toks never start a span.
      }
      let e = this.kTok[k];
      for (let j = this.kAfterN[k] - 1; j >= 0; j--) {
        const t = this.refs[this.kAfter[k] + j];
        if (this.tIdx[t] >= 0) {
          e = t;
          break;
        }
      }
      this.kSpanStart[k] = this.tPos[s];
      let upper = this.tPos[e];
      if (this.tEnd[e] > this.tPos[e]) {
        upper = this.tEnd[e] - 1;
      }
      this.kSpanEnd[k] = upper;
      for (let j = 0; j < this.kBeforeN[k]; j++) {
        const t = this.refs[this.kBefore[k] + j];
        if (this.tIdx[t] >= 0) {
          this.kToToken[this.tIdx[t]] = k;
        }
      }
      this.kToToken[this.tIdx[this.kTok[k]]] = k;
      for (let j = 0; j < this.kAfterN[k]; j++) {
        const t = this.refs[this.kAfter[k] + j];
        if (this.tIdx[t] >= 0) {
          this.kToToken[this.tIdx[t]] = k;
        }
      }
    }
    // InputOutput.computeRanges: each line's numbered toks.
    let line = 0;
    this.ensureLine(0);
    this.lineLo[0] = -1;
    for (let t = 0; t < this.nToks; t++) {
      const line0 = line;
      line += this.countBreaks(t);
      const k = this.tIdx[t];
      this.ensureLine(line);
      if (k >= 0) {
        for (let i = line0; i <= line; i++) {
          if (this.lineLo[i] < 0) {
            this.lineLo[i] = k;
          }
          this.lineHi[i] = k + 1;
        }
      }
    }
    this.nLines = line + 1;
  }

  private ensureLine(i: i32): void {
    while (this.nLines <= i) {
      if (this.nLines >= toI32(this.lineLo.length)) {
        this.lineLo = growI32(this.lineLo, this.nLines * 2 + 16);
        this.lineHi = growI32(this.lineHi, this.nLines * 2 + 16);
      }
      this.lineLo[this.nLines] = -1;
      this.lineHi[this.nLines] = -1;
      this.nLines = this.nLines + 1;
    }
  }

  /** Line breaks in tok `t` ("\r\n" counts once). */
  countBreaks(t: i32): i32 {
    let n = 0;
    const e = this.tEnd[t];
    for (let i = this.tPos[t]; i < e; i++) {
      const c = toI32(this.src[i]);
      if (c === 10) {
        n++;
      } else if (c === 13) {
        n++;
        if (i + 1 < e && toI32(this.src[i + 1]) === 10) {
          i++;
        }
      }
    }
    return n;
  }

  /** The token whose span holds character `pos`, or -1 (positionTokenMap.get). */
  tokenAt(pos: i32): i32 {
    let lo = 0;
    let hi = this.nTokens - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.kSpanStart[mid] > pos) {
        hi = mid - 1;
      } else if (this.kSpanEnd[mid] < pos) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return -1;
  }

  /** The column of the tok starting at `pos` (positionToColumnMap.get). */
  columnAt(pos: i32): i32 {
    let lo = 0;
    let hi = this.nToks - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = this.tPos[mid];
      if (p > pos) {
        hi = mid - 1;
      } else if (p < pos) {
        lo = mid + 1;
      } else {
        // Zero-width toks share a position with what follows; the first wins
        // in an ImmutableMap built in order only if positions differ, so take
        // the lowest index at this position.
        let m = mid;
        while (m > 0 && this.tPos[m - 1] === pos) {
          m--;
        }
        return this.tCol[m];
      }
    }
    return -1;
  }
}
