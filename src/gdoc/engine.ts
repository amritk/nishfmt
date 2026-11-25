// The layout engine google-java-format and ktfmt share: a visitor emits ops
// (open, close, token, space, break), `build` threads the comments in, the
// ops become a tree of levels, `computeBreaks` decides which breaks are
// taken, and `write` renders the tree through JavaOutput's blank-line rules.
//
// Ported from google-java-format 1.28.0's OpsBuilder, DocBuilder, Doc,
// Indent, Output.BreakTag, JavaOutput, CommentsHelper and Newlines (Apache
// License 2.0, Copyright 2015, 2016 Google Inc.); tools/kotlin/NOTES.md says
// why that credit holds for ktfmt's 1.23.0 and Java's 2.0.0. The tree is kept
// in columns; each `Doc` subclass is a kind.

import { add32, atI32, bytesText, copyU8s, growI32, newI32s, newU8s, strUtf16Len, sub32, utf16Len } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { GInput, gSpan, TF_BLOCK_COMMENT, TF_COMMENT, TF_JAVADOC, TF_LINE_COMMENT, TF_NEWLINE, TF_TOMB } from "./input";

export const MAX_LINE_WIDTH: i32 = 1000;

// Fill modes.
export const UNIFIED: i32 = 0;
export const INDEPENDENT: i32 = 1;
export const FORCED: i32 = 2;

// Op and doc kinds.
const K_OPEN: i32 = 1;
const K_CLOSE: i32 = 2;
const K_TOKEN: i32 = 3;
const K_SPACE: i32 = 4;
const K_BREAK: i32 = 5;
const K_TOK: i32 = 6;
const K_LEVEL: i32 = 7;
const K_FENCE: i32 = 8; // ktfmt's FenceCommentsOp: stops comments moving past it, emits nothing

// Blank-line wishes (OpsBuilder.BlankLineWanted).
export const BL_NONE: i32 = 0;
export const BL_NO: i32 = 1;
export const BL_YES: i32 = 2;
export const BL_PRESERVE: i32 = 3;
export const BL_COND: i32 = 4;

/** Rewrites a comment tok for its column (CommentsHelper.rewrite). */
export type Rewriter = (g: GEngine, tok: i32, maxWidth: i32, column: i32) => string;

/** The default rewriter: the comment as written. */
const keepComment = (g: GEngine, tok: i32, maxWidth: i32, column: i32): string => g.inp.text(tok);

export class GEngine {
  inp: GInput;
  maxWidth: i32 = 100;
  rewrite: Rewriter;
  failed: boolean = false;
  failure: string = "";

  // Indents: constants and conditionals.
  nInd: i32 = 0;
  indKind: i32[]; // 0 const, 1 if
  indN: i32[];
  indTag: i32[];
  indThen: i32[];
  indElse: i32[];
  constCache: i32[]; // value + 256 -> indent id

  // Break tags: -1 unset, 0 not taken, 1 taken.
  nTags: i32 = 0;
  tagTaken: i32[];

  // Flat strings of breaks.
  flats: string[];

  // Ops as the visitor emits them.
  nOps: i32 = 0;
  oKind: i32[];
  oA: i32[];
  oB: i32[];
  oC: i32[];
  oD: i32[];
  depth: i32 = 0;
  tokenI: i32 = 0;
  inputPosition: i32 = -2147483647;

  // Comment ops `build` inserts: key (insert before op `key`), op.
  nExtra: i32 = 0;
  xKey: i32[];
  xKind: i32[];
  xA: i32[];
  xB: i32[];
  xC: i32[];
  xD: i32[];

  // Final ops.
  nFin: i32 = 0;
  fKind: i32[];
  fA: i32[];
  fB: i32[];
  fC: i32[];
  fD: i32[];

  // Docs.
  nDocs: i32 = 0;
  dKind: i32[];
  dA: i32[]; // level: indent; token: input token; break: fill; tok: tok
  dB: i32[]; // break: flat id
  dC: i32[]; // break: indent; token: comments-before indent
  dD: i32[]; // break: tag
  dFirst: i32[];
  dLast: i32[];
  dNext: i32[];
  dW: i32[]; // width, -1 not yet computed
  dLo: i32[]; // range, -2 not yet computed, -1 empty
  dHi: i32[];
  dOne: i32[]; // level: written on one line; break: taken
  dIndent: i32[]; // break: the new indent
  dText: string[]; // tok: the rewritten comment
  stack: i32[];
  nStack: i32 = 0;
  appendLevel: i32 = 0;

  // JavaOutput.
  out: Out;
  blMode: i32[];
  blTag: i32[]; // first tag cell of a conditional wish
  cellTag: i32[];
  cellNext: i32[];
  nCells: i32 = 0;
  iLine: i32 = 0;
  lastK: i32 = -1;
  newlinesPending: i32 = 0;
  spaces: u8[];
  nSpaces: i32 = 0;
  strBuf: u8[]; // appendStr's bytes, kept between calls
  lineStart: i32 = 0;
  nOutLines: i32 = 0;
  scratch: Out;

  // Partial formatting, kept only while `partial` is set (google-java-format's
  // StringWrapper re-formats ranges): OpsBuilder's region boundaries as
  // JavaOutput.partialFormatRanges (closed tok-number ranges, in order), and
  // InputOutput.ranges, the tok numbers on each output line.
  partial: boolean = false;
  lastBoundary: i32 = -1;
  nPf: i32 = 0;
  pfLo: i32[];
  pfHi: i32[];
  nLineR: i32 = 0;
  lineRLo: i32[]; // -1 for an empty range
  lineRHi: i32[];

  constructor(inp: GInput) {
    this.inp = inp;
    this.rewrite = keepComment;
    this.indKind = new Array<i32>(64);
    this.indN = new Array<i32>(64);
    this.indTag = new Array<i32>(64);
    this.indThen = new Array<i32>(64);
    this.indElse = new Array<i32>(64);
    this.constCache = new Array<i32>(513);
    this.tagTaken = new Array<i32>(256);
    this.flats = ["", " "];
    this.oKind = new Array<i32>(256);
    this.oA = new Array<i32>(256);
    this.oB = new Array<i32>(256);
    this.oC = new Array<i32>(256);
    this.oD = new Array<i32>(256);
    this.xKey = new Array<i32>(256);
    this.xKind = new Array<i32>(256);
    this.xA = new Array<i32>(256);
    this.xB = new Array<i32>(256);
    this.xC = new Array<i32>(256);
    this.xD = new Array<i32>(256);
    this.fKind = new Array<i32>(256);
    this.fA = new Array<i32>(256);
    this.fB = new Array<i32>(256);
    this.fC = new Array<i32>(256);
    this.fD = new Array<i32>(256);
    this.dKind = new Array<i32>(256);
    this.dA = new Array<i32>(256);
    this.dB = new Array<i32>(256);
    this.dC = new Array<i32>(256);
    this.dD = new Array<i32>(256);
    this.dFirst = new Array<i32>(256);
    this.dLast = new Array<i32>(256);
    this.dNext = new Array<i32>(256);
    this.dW = new Array<i32>(256);
    this.dLo = new Array<i32>(256);
    this.dHi = new Array<i32>(256);
    this.dOne = new Array<i32>(256);
    this.dIndent = new Array<i32>(256);
    this.dText = [];
    this.stack = new Array<i32>(256);
    this.out = new Out(1 << 12);
    this.scratch = new Out(1 << 12);
    this.blMode = new Array<i32>(256);
    this.blTag = new Array<i32>(256);
    this.cellTag = new Array<i32>(64);
    this.cellNext = new Array<i32>(64);
    this.spaces = new Array<u8>(256);
    this.strBuf = new Array<u8>(64);
    this.pfLo = new Array<i32>(0);
    this.pfHi = new Array<i32>(0);
    this.lineRLo = new Array<i32>(0);
    this.lineRHi = new Array<i32>(0);
  }

  /** Clears everything for the next file; the input must be filled already. */
  reset(): void {
    this.failed = false;
    this.failure = "";
    this.nInd = 0;
    const cc = this.constCache;
    for (let i = 0; i < cc.length; i++) {
      cc[i] = -1;
    }
    this.nTags = 0;
    this.flats = ["", " "];
    this.nOps = 0;
    this.depth = 0;
    this.tokenI = 0;
    this.inputPosition = -2147483647;
    this.nExtra = 0;
    this.nFin = 0;
    this.nDocs = 0;
    this.nStack = 0;
    this.out.n = 0;
    const kn = add32(this.inp.kN, 2);
    this.blMode = growI32(this.blMode, kn);
    this.blTag = growI32(this.blTag, kn);
    const bm = this.blMode;
    // growI32 answers at least `kn` slots unless it faulted.
    for (let i = 0; i < kn && i < bm.length; i++) {
      bm[i] = BL_NONE;
    }
    this.nCells = 0;
    this.iLine = 0;
    this.lastK = -1;
    this.newlinesPending = 0;
    this.nSpaces = 0;
    this.lineStart = 0;
    this.nOutLines = 0;
    this.lastBoundary = -1;
    this.nPf = 0;
    this.nLineR = 0;
    this.constIndent(0); // ZERO is indent 0
  }

  fail(msg: string): void {
    if (!this.failed) {
      this.failed = true;
      const t = this.peekTok(0);
      this.failure = `${msg} at byte ${t >= 0 ? atI32(this.inp.tPos, t) : -1}`;
    }
  }

  // ---- Indents and tags ------------------------------------------------------

  private newIndent(kind: i32, n: i32, tag: i32, th: i32, el: i32): i32 {
    const i = this.nInd;
    if (i >= toI32(this.indKind.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return 0;
      }
      const c = i * 2 + 16;
      this.indKind = growI32(this.indKind, c);
      this.indN = growI32(this.indN, c);
      this.indTag = growI32(this.indTag, c);
      this.indThen = growI32(this.indThen, c);
      this.indElse = growI32(this.indElse, c);
    }
    const indKind = this.indKind;
    const indN = this.indN;
    const indTag = this.indTag;
    const indThen = this.indThen;
    const indElse = this.indElse;
    if (
      i < 0 ||
      i >= indKind.length ||
      i >= indN.length ||
      i >= indTag.length ||
      i >= indThen.length ||
      i >= indElse.length
    ) {
      fault();
      return 0;
    }
    indKind[i] = kind;
    indN[i] = n;
    indTag[i] = tag;
    indThen[i] = th;
    indElse[i] = el;
    this.nInd = i + 1;
    return i;
  }

  /** Indent.Const of `n` columns. */
  constIndent(n: i32): i32 {
    if (n >= -256 && n <= 256) {
      const cc = this.constCache;
      const slot = n + 256;
      if (slot < 0 || slot >= cc.length) {
        fault();
        return 0;
      }
      const c = cc[slot];
      if (c >= 0) {
        return c;
      }
      const id = this.newIndent(0, n, -1, -1, -1);
      if (slot < cc.length) {
        cc[slot] = id;
      }
      return id;
    }
    return this.newIndent(0, n, -1, -1, -1);
  }

  /** Indent.If: `th` when `tag` was broken, else `el`. */
  ifIndent(tag: i32, th: i32, el: i32): i32 {
    return this.newIndent(1, 0, tag, th, el);
  }

  evalIndent(i: i32): i32 {
    const indKind = this.indKind;
    const indN = this.indN;
    const indTag = this.indTag;
    const indThen = this.indThen;
    const indElse = this.indElse;
    const tagTaken = this.tagTaken;
    let x = i;
    while (x >= 0 && x < indKind.length) {
      if (indKind[x] !== 1) {
        if (x < indN.length) {
          return indN[x];
        }
        break;
      }
      if (x >= indTag.length || x >= indThen.length || x >= indElse.length) {
        break;
      }
      const tag = indTag[x];
      if (tag < 0 || tag >= tagTaken.length) {
        break;
      }
      x = tagTaken[tag] === 1 ? indThen[x] : indElse[x];
    }
    fault();
    return 0;
  }

  genSym(): i32 {
    const t = this.nTags;
    if (t >= toI32(this.tagTaken.length)) {
      if (t < 0 || t > 1073741815) {
        fault();
        return 0;
      }
      this.tagTaken = growI32(this.tagTaken, t * 2 + 16);
    }
    const tagTaken = this.tagTaken;
    if (t < 0 || t >= tagTaken.length) {
      fault();
      return 0;
    }
    tagTaken[t] = -1;
    this.nTags = t + 1;
    return t;
  }

  wasBreakTaken(tag: i32): boolean {
    return atI32(this.tagTaken, tag) === 1;
  }

  flatId(s: string): i32 {
    const flats = this.flats;
    for (let i = 0; i < toI32(flats.length); i++) {
      if (flats[i] === s) {
        return i;
      }
    }
    flats.push(s);
    return toI32(flats.length) - 1;
  }

  // ---- OpsBuilder ------------------------------------------------------------

  private addOp(kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    if (kind === K_OPEN) {
      const depth = this.depth;
      if (depth >= 2147483647) {
        fault();
        return;
      }
      this.depth = depth + 1;
    } else if (kind === K_CLOSE) {
      const nd = sub32(this.depth, 1);
      this.depth = nd;
      if (nd < 0) {
        this.fail("unbalanced close");
      }
    }
    const i = this.nOps;
    if (i >= toI32(this.oKind.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return;
      }
      const cap = i * 2 + 16;
      this.oKind = growI32(this.oKind, cap);
      this.oA = growI32(this.oA, cap);
      this.oB = growI32(this.oB, cap);
      this.oC = growI32(this.oC, cap);
      this.oD = growI32(this.oD, cap);
    }
    const oKind = this.oKind;
    const oA = this.oA;
    const oB = this.oB;
    const oC = this.oC;
    const oD = this.oD;
    if (i < 0 || i >= oKind.length || i >= oA.length || i >= oB.length || i >= oC.length || i >= oD.length) {
      fault();
      return;
    }
    oKind[i] = kind;
    oA[i] = a;
    oB[i] = b;
    oC[i] = c;
    oD[i] = d;
    this.nOps = i + 1;
  }

  open(plusIndent: i32): void {
    this.addOp(K_OPEN, plusIndent, 0, 0, 0);
  }

  close(): void {
    this.addOp(K_CLOSE, 0, 0, 0, 0);
  }

  /** ktfmt's FenceCommentsOp. */
  fence(): void {
    this.addOp(K_FENCE, 0, 0, 0, 0);
  }

  space(): void {
    this.addOp(K_SPACE, 0, 0, 0, 0);
  }

  breakOp(fill: i32, flat: string, plusIndent: i32, tag: i32): void {
    this.addOp(K_BREAK, fill, this.flatId(flat), plusIndent, tag);
  }

  /** breakOp(): a unified break with no flat text. */
  brk(): void {
    this.addOp(K_BREAK, UNIFIED, 0, 0, -1);
  }

  /** breakOp(" "). */
  brkSp(): void {
    this.addOp(K_BREAK, UNIFIED, 1, 0, -1);
  }

  /** breakOp(plusIndent). */
  brkInd(plusIndent: i32): void {
    this.addOp(K_BREAK, UNIFIED, 0, plusIndent, -1);
  }

  breakToFill(flat: string): void {
    this.addOp(K_BREAK, INDEPENDENT, this.flatId(flat), 0, -1);
  }

  forcedBreak(): void {
    this.addOp(K_BREAK, FORCED, 0, 0, -1);
  }

  forcedBreakInd(plusIndent: i32): void {
    this.addOp(K_BREAK, FORCED, 0, plusIndent, -1);
  }

  depthNow(): i32 {
    return this.depth;
  }

  /** The text of the token `skip` ahead, as a tok id, or -1 past the end. */
  peekTok(skip: i32): i32 {
    const i64 = toI64(this.tokenI) + toI64(skip);
    if (i64 < toI64(-2147483648) || i64 > toI64(2147483647)) {
      fault();
      return -1;
    }
    const i = toI32(i64);
    if (i >= this.inp.nTokens) {
      return -1;
    }
    const kTok = this.inp.kTok;
    if (i >= 0 && i < kTok.length) {
      return kTok[i];
    }
    fault();
    return -1;
  }

  peekIs(s: string): boolean {
    const t = this.peekTok(0);
    return t >= 0 && this.inp.is(t, s);
  }

  peekIsAt(skip: i32, s: string): boolean {
    const t = this.peekTok(skip);
    return t >= 0 && this.inp.is(t, s);
  }

  /** Moves past the token just output. */
  private nextToken(): void {
    const ti = this.tokenI;
    if (ti < 2147483647) {
      this.tokenI = ti + 1;
    } else {
      fault();
    }
  }

  /** OpsBuilder.token: outputs the next input token when its text is `s`. */
  token(s: string, real: boolean, plusIndentCommentsBefore: i32, breakAndIndentTrailingComment: i32): void {
    if (this.peekIs(s)) {
      this.addOp(K_TOKEN, this.tokenI, 1, plusIndentCommentsBefore, breakAndIndentTrailingComment);
      this.nextToken();
    } else if (real) {
      const t = this.peekTok(0);
      this.fail(`expected token '${t >= 0 ? this.inp.text(t) : "EOF"}'; generated ${s} instead`);
    }
  }

  tok(s: string): void {
    this.token(s, true, 0, -1);
  }

  /** token(text of src[a, b)): outputs the next input token when its text is those bytes. */
  tokBytes(a: i32, b: i32, plusIndentCommentsBefore: i32): void {
    const p = this.peekTok(0);
    const inp = this.inp;
    let same = false;
    if (p >= 0) {
      const tPos = inp.tPos;
      const tEnd = inp.tEnd;
      if (p >= tPos.length || p >= tEnd.length) {
        fault();
        return;
      }
      const pa = tPos[p];
      const n = gSpan(a, b);
      same = gSpan(pa, tEnd[p]) === n;
      if (same && pa !== a) {
        const src = inp.src;
        let i = pa;
        let j = a;
        for (let q = 0; q < n; q++) {
          if (i < 0 || i >= src.length || j < 0 || j >= src.length) {
            fault();
            return;
          }
          if (src[i] !== src[j]) {
            same = false;
            break;
          }
          i++;
          j++;
        }
      }
    }
    if (same) {
      this.addOp(K_TOKEN, this.tokenI, 1, plusIndentCommentsBefore, -1);
      this.nextToken();
    } else {
      this.fail(`expected token '${p >= 0 ? inp.text(p) : "EOF"}'; generated ${bytesText(inp.src, a, b)} instead`);
    }
  }

  /** token(text of tok `t`): outputs the next input token when its text is the same. */
  tokLike(t: i32): void {
    const p = this.peekTok(0);
    if (p >= 0 && this.inp.sameText(p, t)) {
      this.addOp(K_TOKEN, this.tokenI, 1, 0, -1);
      this.nextToken();
    } else {
      this.fail(`expected token '${p >= 0 ? this.inp.text(p) : "EOF"}'; generated ${this.inp.text(t)} instead`);
    }
  }

  /** OpsBuilder.actualSize: the characters from `pos` for `len`, widened over adjacent comments. */
  actualSize(pos: i32, len: i32): i32 {
    const inp = this.inp;
    const st = inp.tokenAt(pos);
    const et = inp.tokenAt(sub32(add32(pos, len), 1));
    if (st < 0 || et < 0) {
      return len;
    }
    const kTok = inp.kTok;
    const kBefore = inp.kBefore;
    const kBeforeN = inp.kBeforeN;
    const kAfter = inp.kAfter;
    const kAfterN = inp.kAfterN;
    const refs = inp.refs;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    const tFlags = inp.tFlags;
    if (st >= kTok.length || st >= kBefore.length || st >= kBeforeN.length) {
      fault();
      return len;
    }
    const ts = kTok[st];
    if (ts < 0 || ts >= tPos.length) {
      fault();
      return len;
    }
    let start = tPos[ts];
    let r = kBefore[st];
    const bn = kBeforeN[st];
    for (let j = 0; j < bn; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return len;
      }
      const t = refs[r];
      if (t < 0 || t >= tFlags.length || t >= tPos.length) {
        fault();
        return len;
      }
      if ((tFlags[t] & TF_COMMENT) !== 0 && tPos[t] < start) {
        start = tPos[t];
      }
      r++;
    }
    if (et >= kTok.length || et >= kAfter.length || et >= kAfterN.length) {
      fault();
      return len;
    }
    const tk = kTok[et];
    if (tk < 0 || tk >= tEnd.length) {
      fault();
      return len;
    }
    let end = tEnd[tk];
    r = kAfter[et];
    const an = kAfterN[et];
    for (let j = 0; j < an; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return len;
      }
      const t = refs[r];
      if (t < 0 || t >= tFlags.length || t >= tEnd.length) {
        fault();
        return len;
      }
      if ((tFlags[t] & TF_COMMENT) !== 0 && tEnd[t] > end) {
        end = tEnd[t];
      }
      r++;
    }
    return inp.width(start, end);
  }

  /** OpsBuilder.actualStartColumn: a position, moved to a comment before it on the same line. */
  actualStartColumn(pos: i32): i32 {
    const inp = this.inp;
    const st = inp.tokenAt(pos);
    if (st < 0) {
      return pos;
    }
    const kTok = inp.kTok;
    const kBefore = inp.kBefore;
    const kBeforeN = inp.kBeforeN;
    const tPos = inp.tPos;
    const tFlags = inp.tFlags;
    if (st >= kTok.length || st >= kBefore.length || st >= kBeforeN.length) {
      fault();
      return pos;
    }
    const ts = kTok[st];
    if (ts < 0 || ts >= tPos.length) {
      fault();
      return pos;
    }
    const tokPos = tPos[ts];
    let start = tokPos;
    let r = kBefore[st];
    const bn = kBeforeN[st];
    for (let j = 0; j < bn; j++) {
      const refs = inp.refs;
      if (r < 0 || r >= refs.length) {
        fault();
        return pos;
      }
      const t = refs[r];
      if (t < 0 || t >= tFlags.length || t >= tPos.length) {
        fault();
        return pos;
      }
      const p = tPos[t];
      if (this.breakBetween(p, tokPos)) {
        return start;
      }
      if ((tFlags[t] & TF_COMMENT) !== 0 && p < start) {
        start = p;
      }
      r++;
    }
    return start;
  }

  /**
   * Whether positions `a` <= `b` are on different lines (javac's LineMap):
   * a "\n", or a "\r" not before "\n", in [a, b). Scanning only between
   * the two keeps this linear in the distance, not in the position.
   */
  private breakBetween(a: i32, b: i32): boolean {
    const src = this.inp.src;
    const n = this.inp.n;
    let i = a;
    while (i >= 0 && i < b && i < src.length) {
      const c = toI32(src[i]);
      if (c === 10) {
        return true;
      }
      if (c === 13) {
        const j = i + 1;
        if (j >= n) {
          return true;
        }
        if (j >= src.length) {
          fault();
          return false;
        }
        if (toI32(src[j]) !== 10) {
          return true;
        }
      }
      i++;
    }
    if (i < b) {
      fault(); // the scan would have read outside `src`
    }
    return false;
  }

  guessToken(s: string): void {
    this.token(s, false, 0, -1);
  }

  /** OpsBuilder.op: an operator token one character at a time. */
  op(s: string): void {
    const n = toI32(s.length);
    for (let i = 0; i < n; i++) {
      this.token(s.substring(i, i + 1), true, 0, -1);
    }
  }

  /** The position of input token `k`'s tok (`inp.tPos[inp.kTok[k]]`). */
  private tokenPos(k: i32): i32 {
    const kTok = this.inp.kTok;
    if (k >= 0 && k < kTok.length) {
      return atI32(this.inp.tPos, kTok[k]);
    }
    fault();
    return 0;
  }

  sync(pos: i32): void {
    if (pos > this.inputPosition) {
      this.inputPosition = pos;
      const ti = this.tokenI;
      if (ti < this.inp.nTokens && pos > this.tokenPos(ti)) {
        this.fail(`did not generate token "${this.inp.text(atI32(this.inp.kTok, ti))}"`);
      }
    }
  }

  /** Emits every input token not yet output as an imaginary token. */
  drain(): void {
    const pos = add32(this.inp.n, 1);
    if (pos > this.inputPosition) {
      while (this.tokenI < this.inp.nTokens) {
        const ti = this.tokenI;
        const kTok = this.inp.kTok;
        const tPos = this.inp.tPos;
        if (ti < 0 || ti >= kTok.length || ti >= 2147483647) {
          fault();
          break;
        }
        const t = kTok[ti];
        if (t < 0 || t >= tPos.length) {
          fault();
          break;
        }
        if (pos <= tPos[t]) {
          break;
        }
        this.addOp(K_TOKEN, ti, 0, 0, -1);
        this.tokenI = ti + 1;
      }
    }
    this.inputPosition = pos;
    if (this.depth !== 0) {
      this.fail(`saw ${this.depth} unclosed ops`);
    }
  }

  /** The first numbered tok of a token: its first comment, else itself. */
  firstNumbered(k: i32): i32 {
    const inp = this.inp;
    const kTok = inp.kTok;
    const kBefore = inp.kBefore;
    const kBeforeN = inp.kBeforeN;
    const refs = inp.refs;
    const tIdx = inp.tIdx;
    if (k < 0 || k >= kTok.length || k >= kBefore.length || k >= kBeforeN.length) {
      fault();
      return 0;
    }
    let r = kBefore[k];
    const bn = kBeforeN[k];
    for (let j = 0; j < bn; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return 0;
      }
      const t = refs[r];
      if (t < 0 || t >= tIdx.length) {
        fault();
        return 0;
      }
      if (tIdx[t] >= 0) {
        return tIdx[t];
      }
      r++;
    }
    return atI32(tIdx, kTok[k]);
  }

  /** The last numbered tok of a token: its last comment after, else itself (JavaOutput.endTok). */
  lastNumbered(k: i32): i32 {
    const inp = this.inp;
    const kTok = inp.kTok;
    const kAfter = inp.kAfter;
    const kAfterN = inp.kAfterN;
    const refs = inp.refs;
    const tIdx = inp.tIdx;
    if (k < 0 || k >= kTok.length || k >= kAfter.length || k >= kAfterN.length) {
      fault();
      return 0;
    }
    const an = kAfterN[k];
    if (an > 0) {
      // The last ref after the token, kAfter + an - 1, then down to kAfter.
      let r = gSpan(1, add32(kAfter[k], an));
      for (let j = an - 1; j >= 0; j--) {
        if (r < 0 || r >= refs.length) {
          fault();
          return 0;
        }
        const t = refs[r];
        if (t < 0 || t >= tIdx.length) {
          fault();
          return 0;
        }
        if (tIdx[t] >= 0) {
          return tIdx[t];
        }
        r--;
      }
    }
    return atI32(tIdx, kTok[k]);
  }

  /**
   * OpsBuilder.markForPartialFormat: a boundary of a region that can be
   * re-formatted alone, [boundary0, boundary1), [boundary1, boundary2), ...;
   * JavaOutput keeps each region as the closed range of its tok numbers.
   */
  markForPartialFormat(): void {
    if (!this.partial) {
      return;
    }
    const ti = this.tokenI;
    if (this.lastBoundary === -1) {
      this.lastBoundary = ti;
      return;
    }
    if (ti === this.lastBoundary) {
      return;
    }
    const lo = this.firstNumbered(this.lastBoundary);
    const hi = this.lastNumbered(sub32(ti, 1));
    this.lastBoundary = ti;
    // A RangeSet: a range connected to the last one joins it.
    const n = this.nPf;
    const pfLo = this.pfLo;
    const pfHi = this.pfHi;
    if (n > 0 && n <= pfLo.length && n <= pfHi.length) {
      const m = n - 1;
      if (lo <= pfHi[m] && hi >= pfLo[m]) {
        if (lo < pfLo[m]) {
          pfLo[m] = lo;
        }
        if (hi > pfHi[m]) {
          pfHi[m] = hi;
        }
        return;
      }
    } else if (n > 0) {
      fault();
      return;
    }
    if (n >= toI32(pfLo.length)) {
      if (n < 0 || n > 1073741815) {
        fault();
        return;
      }
      this.pfLo = growI32(pfLo, n * 2 + 16);
      this.pfHi = growI32(pfHi, n * 2 + 16);
    }
    const lo2 = this.pfLo;
    const hi2 = this.pfHi;
    if (n < 0 || n >= lo2.length || n >= hi2.length) {
      fault();
      return;
    }
    lo2[n] = lo;
    hi2[n] = hi;
    this.nPf = n + 1;
  }

  /** InputOutput.ranges[line] = union(ranges[line], [lo, hi)). */
  private addLineRange(line: i32, lo: i32, hi: i32): void {
    while (this.nLineR <= line) {
      const n = this.nLineR;
      if (n >= toI32(this.lineRLo.length)) {
        if (n < 0 || n > 1073741815) {
          fault();
          return;
        }
        this.lineRLo = growI32(this.lineRLo, n * 2 + 16);
        this.lineRHi = growI32(this.lineRHi, n * 2 + 16);
      }
      const rl = this.lineRLo;
      const rh = this.lineRHi;
      if (n < 0 || n >= rl.length || n >= rh.length) {
        fault();
        return;
      }
      rl[n] = -1;
      rh[n] = -1;
      this.nLineR = n + 1;
    }
    const rl = this.lineRLo;
    const rh = this.lineRHi;
    if (line < 0 || line >= rl.length || line >= rh.length) {
      fault();
      return;
    }
    if (rl[line] < 0) {
      rl[line] = lo;
      rh[line] = hi;
    } else {
      if (lo < rl[line]) {
        rl[line] = lo;
      }
      if (hi > rh[line]) {
        rh[line] = hi;
      }
    }
  }

  /** OpsBuilder.blankLineWanted: at the next token. */
  blankLineWanted(mode: i32): void {
    if (this.tokenI < this.inp.nTokens) {
      this.blankLine(this.firstNumbered(this.tokenI), mode, -1);
    }
  }

  /** A conditional blank line: wanted when `tag` was broken. */
  blankLineWantedIf(tag: i32): void {
    if (this.tokenI < this.inp.nTokens) {
      this.blankLine(this.firstNumbered(this.tokenI), BL_COND, tag);
    }
  }

  /** JavaOutput.blankLine: the first wish at `k` wins, but conditionals merge. */
  blankLine(k: i32, mode: i32, tag: i32): void {
    const blMode = this.blMode;
    if (k < 0 || k >= blMode.length) {
      fault();
      return;
    }
    const cur = blMode[k];
    if (cur === BL_NONE) {
      blMode[k] = mode;
      if (mode === BL_COND) {
        const cell = this.newCell(tag, -1);
        const blTag = this.blTag;
        if (k < blTag.length) {
          blTag[k] = cell;
        } else {
          fault();
        }
      }
      return;
    }
    if (cur !== BL_COND) {
      return; // SimpleBlankLine.merge keeps itself
    }
    if (mode !== BL_COND) {
      blMode[k] = mode;
      return;
    }
    // Append the tag to the list.
    let c = atI32(this.blTag, k);
    const cellNext = this.cellNext;
    while (c >= 0 && c < cellNext.length && cellNext[c] >= 0) {
      c = cellNext[c];
    }
    if (c < 0 || c >= cellNext.length) {
      fault();
      return;
    }
    // The link goes into the cell array as it was before newCell, which
    // may grow it into a new one (JavaScript's order of evaluation).
    const cell = this.newCell(tag, -1);
    if (c < cellNext.length) {
      cellNext[c] = cell;
    } else {
      fault();
    }
  }

  private newCell(tag: i32, next: i32): i32 {
    const c = this.nCells;
    if (c >= toI32(this.cellTag.length)) {
      if (c < 0 || c > 1073741815) {
        fault();
        return -1;
      }
      this.cellTag = growI32(this.cellTag, c * 2 + 16);
      this.cellNext = growI32(this.cellNext, c * 2 + 16);
    }
    const cellTag = this.cellTag;
    const cellNext = this.cellNext;
    if (c < 0 || c >= cellTag.length || c >= cellNext.length) {
      fault();
      return -1;
    }
    cellTag[c] = tag;
    cellNext[c] = next;
    this.nCells = c + 1;
    return c;
  }

  /** The wish at `k`: 1 yes, 0 no, -1 preserve (no opinion). */
  wanted(k: i32): i32 {
    const blMode = this.blMode;
    if (k < 0 || k >= blMode.length) {
      return 0;
    }
    const m = blMode[k];
    if (m === BL_NONE || m === BL_NO) {
      return 0;
    }
    if (m === BL_YES) {
      return 1;
    }
    if (m === BL_PRESERVE) {
      return -1;
    }
    const cellTag = this.cellTag;
    const cellNext = this.cellNext;
    const tagTaken = this.tagTaken;
    let c = atI32(this.blTag, k);
    while (c >= 0) {
      if (c >= cellTag.length || c >= cellNext.length) {
        fault();
        return 0;
      }
      const tag = cellTag[c];
      if (tag < 0 || tag >= tagTaken.length) {
        fault();
        return 0;
      }
      if (tagTaken[tag] === 1) {
        return 1;
      }
      c = cellNext[c];
    }
    return -1;
  }

  private addExtra(key: i32, kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    const i = this.nExtra;
    if (i >= toI32(this.xKey.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return;
      }
      const cap = i * 2 + 16;
      this.xKey = growI32(this.xKey, cap);
      this.xKind = growI32(this.xKind, cap);
      this.xA = growI32(this.xA, cap);
      this.xB = growI32(this.xB, cap);
      this.xC = growI32(this.xC, cap);
      this.xD = growI32(this.xD, cap);
    }
    const xKey = this.xKey;
    const xKind = this.xKind;
    const xA = this.xA;
    const xB = this.xB;
    const xC = this.xC;
    const xD = this.xD;
    if (
      i < 0 ||
      i >= xKey.length ||
      i >= xKind.length ||
      i >= xA.length ||
      i >= xB.length ||
      i >= xC.length ||
      i >= xD.length
    ) {
      fault();
      return;
    }
    xKey[i] = key;
    xKind[i] = kind;
    xA[i] = a;
    xB[i] = b;
    xC[i] = c;
    xD[i] = d;
    this.nExtra = i + 1;
  }

  private extraForced(key: i32, plusIndent: i32): void {
    this.addExtra(key, K_BREAK, FORCED, 0, plusIndent, -1);
  }

  /** makeComment: a block comment alone, a line comment and a forced break. */
  private extraComment(key: i32, t: i32): void {
    this.addExtra(key, K_TOK, t, 0, 0, -1);
    if ((atI32(this.inp.tFlags, t) & TF_BLOCK_COMMENT) === 0) {
      this.extraForced(key, 0);
    }
  }

  private pushFin(kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    const i = this.nFin;
    if (i >= toI32(this.fKind.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return;
      }
      const cap = i * 2 + 16;
      this.fKind = growI32(this.fKind, cap);
      this.fA = growI32(this.fA, cap);
      this.fB = growI32(this.fB, cap);
      this.fC = growI32(this.fC, cap);
      this.fD = growI32(this.fD, cap);
    }
    const fKind = this.fKind;
    const fA = this.fA;
    const fB = this.fB;
    const fC = this.fC;
    const fD = this.fD;
    if (i < 0 || i >= fKind.length || i >= fA.length || i >= fB.length || i >= fC.length || i >= fD.length) {
      fault();
      return;
    }
    fKind[i] = kind;
    fA[i] = a;
    fB[i] = b;
    fC[i] = c;
    fD[i] = d;
    this.nFin = i + 1;
  }

  /** OpsBuilder.build: the ops with every token's comments threaded in. */
  build(): void {
    this.markForPartialFormat();
    const inp = this.inp;
    const opsN = this.nOps;
    const oKind = this.oKind;
    const oA = this.oA;
    const oB = this.oB;
    const oC = this.oC;
    const oD = this.oD;
    // The op columns grow together and hold every op.
    if (opsN > oKind.length || opsN > oA.length || opsN > oB.length || opsN > oC.length || opsN > oD.length) {
      fault();
      return;
    }
    const kBefore = inp.kBefore;
    const kBeforeN = inp.kBeforeN;
    const kAfter = inp.kAfter;
    const kAfterN = inp.kAfterN;
    const kTok = inp.kTok;
    const refs = inp.refs;
    const tFlags = inp.tFlags;
    for (let i = 0; i < opsN && i < oKind.length; i++) {
      if (oKind[i] !== K_TOKEN) {
        continue;
      }
      if (i >= oA.length || i >= oB.length || i >= oC.length || i >= oD.length) {
        fault();
        return;
      }
      const k = oA[i];
      let j = i;
      while (j > 0 && j <= oKind.length && oKind[j - 1] === K_OPEN) {
        j--;
      }
      // The op after the closes that follow the token.
      let after = i + 1;
      while (after < opsN && after < oKind.length && oKind[after] === K_CLOSE) {
        after++;
      }
      if (k < 0 || k >= kBefore.length || k >= kBeforeN.length || k >= kAfter.length || k >= kAfterN.length) {
        fault();
        return;
      }
      const bs = kBefore[k];
      const bn = kBeforeN[k];
      const as = kAfter[k];
      const an = kAfterN[k];
      if (oB[i] === 1) {
        const plusBefore = oC[i];
        const trailing = oD[i];
        let newlines = 0;
        let space = false;
        let lastWasComment = false;
        let allowBlankAfterLastComment = false;
        let r = bs;
        for (let q = 0; q < bn; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            if (newlines >= 2147483647) {
              fault();
              return;
            }
            newlines++;
          } else if ((f & TF_COMMENT) !== 0) {
            this.addExtra(j, K_BREAK, (f & TF_LINE_COMMENT) !== 0 ? FORCED : UNIFIED, 0, plusBefore, -1);
            this.extraComment(j, t);
            space = (f & TF_BLOCK_COMMENT) !== 0;
            newlines = 0;
            lastWasComment = true;
            if ((f & TF_JAVADOC) !== 0) {
              this.extraForced(j, 0);
            }
            allowBlankAfterLastComment =
              (f & TF_LINE_COMMENT) !== 0 || ((f & TF_BLOCK_COMMENT) !== 0 && (f & TF_JAVADOC) === 0);
          }
          r++;
        }
        if (allowBlankAfterLastComment && newlines > 1) {
          if (k >= kTok.length) {
            fault();
            return;
          }
          this.blankLine(atI32(inp.tIdx, kTok[k]), BL_YES, -1);
        }
        if (lastWasComment && newlines > 0) {
          this.extraForced(j, 0);
        } else if (space) {
          this.addExtra(j, K_SPACE, 0, 0, 0, -1);
        }
        r = as;
        for (let q = 0; q < an; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          r++;
          if ((f & TF_COMMENT) === 0) {
            continue;
          }
          const breakAfter = (f & TF_JAVADOC) !== 0 || ((f & TF_BLOCK_COMMENT) !== 0 && trailing >= 0);
          if (breakAfter) {
            if (trailing >= 0) {
              this.extraForced(after, trailing);
            } else {
              this.extraForced(after, 0);
            }
          } else {
            this.addExtra(after, K_SPACE, 0, 0, 0, -1);
          }
          this.extraComment(after, t);
          if (breakAfter) {
            this.extraForced(after, 0);
          }
        }
      } else {
        // An imaginary token: its toks go out as they are.
        let newlines = 0;
        let lastWasComment = false;
        let r = bs;
        for (let q = 0; q < bn; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            if (newlines >= 2147483647) {
              fault();
              return;
            }
            newlines++;
          } else if ((f & TF_COMMENT) !== 0) {
            newlines = 0;
            lastWasComment = true;
          }
          if (lastWasComment && newlines > 0) {
            this.extraForced(j, 0);
          }
          this.addExtra(j, K_TOK, t, 0, 0, -1);
          r++;
        }
        r = as;
        for (let q = 0; q < an; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          this.addExtra(after, K_TOK, refs[r], 0, 0, -1);
          r++;
        }
      }
    }
    // The extras are generated in key order (a token's leading comments key
    // at or after the previous token's trailing ones), so they merge in with
    // one pointer; a counting sort covers any other order.
    const nx = this.nExtra;
    let sorted = true;
    let xKey = this.xKey;
    for (let x = 1; x < nx && x < xKey.length; x++) {
      if (xKey[x] < xKey[x - 1]) {
        sorted = false;
        break;
      }
    }
    if (!sorted) {
      this.sortExtras(opsN);
    }
    xKey = this.xKey;
    const xKind = this.xKind;
    const xA = this.xA;
    const xB = this.xB;
    const xC = this.xC;
    const xD = this.xD;
    // The extra columns grow together and hold every extra.
    if (nx > xKey.length || nx > xKind.length || nx > xA.length || nx > xB.length || nx > xC.length || nx > xD.length) {
      fault();
      return;
    }
    this.nFin = 0;
    if (opsN < 0) {
      return;
    }
    let afterForcedBreak = false;
    let x = 0;
    let i = 0;
    while (true) {
      while (x >= 0 && x < nx && x < xKey.length && xKey[x] === i) {
        if (x >= xKind.length || x >= xA.length || x >= xB.length || x >= xC.length || x >= xD.length) {
          fault();
          return;
        }
        const kind = xKind[x];
        if (!(afterForcedBreak && kind === K_SPACE)) {
          const xa = xA[x];
          this.pushFin(kind, xa, xB[x], xC[x], xD[x]);
          afterForcedBreak = kind === K_BREAK && xa === FORCED;
        }
        x++;
      }
      if (i >= opsN) {
        break;
      }
      if (i < 0 || i >= oKind.length || i >= oA.length || i >= oB.length || i >= oC.length || i >= oD.length) {
        fault();
        return;
      }
      const kind = oKind[i];
      if (
        afterForcedBreak &&
        (kind === K_SPACE || (kind === K_BREAK && this.evalIndentConstOrZero(oC[i]) && oB[i] === 1))
      ) {
        i++;
        continue;
      }
      const oa = oA[i];
      this.pushFin(kind, oa, oB[i], oC[i], oD[i]);
      if (kind !== K_OPEN) {
        afterForcedBreak = kind === K_BREAK && oa === FORCED;
      }
      i++;
    }
  }

  /** Reorders the extras stably by key (a counting sort). */
  private sortExtras(opsN: i32): void {
    if (opsN < 0 || opsN > 2147483645) {
      fault();
      return;
    }
    const counts = newI32s(opsN + 2);
    const k = this.nExtra;
    const xKey = this.xKey;
    const xKind = this.xKind;
    const xA = this.xA;
    const xB = this.xB;
    const xC = this.xC;
    const xD = this.xD;
    // The extra columns grow together and hold every extra.
    if (
      k < 0 ||
      k > xKey.length ||
      k > xKind.length ||
      k > xA.length ||
      k > xB.length ||
      k > xC.length ||
      k > xD.length
    ) {
      fault();
      return;
    }
    for (let x = 0; x < k && x < xKey.length; x++) {
      const kx = xKey[x];
      // A key is an op index; a negative one would fail the placing loop below.
      if (kx < 0 || kx > 2147483645) {
        fault();
        return;
      }
      const ci = kx + 1;
      if (ci >= counts.length) {
        fault();
        return;
      }
      const v = counts[ci];
      if (v >= 2147483647) {
        fault();
        return;
      }
      counts[ci] = v + 1;
    }
    for (let x = 1; x < counts.length; x++) {
      counts[x] = add32(counts[x], counts[x - 1]);
    }
    const key = newI32s(k);
    const kind = newI32s(k);
    const a = newI32s(k);
    const b = newI32s(k);
    const c = newI32s(k);
    const d = newI32s(k);
    for (let x = 0; x < k; x++) {
      if (
        x >= xKey.length ||
        x >= xKind.length ||
        x >= xA.length ||
        x >= xB.length ||
        x >= xC.length ||
        x >= xD.length
      ) {
        fault();
        return;
      }
      const kx = xKey[x];
      if (kx < 0 || kx >= counts.length) {
        fault();
        return;
      }
      const q = counts[kx];
      if (
        q < 0 ||
        q >= key.length ||
        q >= kind.length ||
        q >= a.length ||
        q >= b.length ||
        q >= c.length ||
        q >= d.length
      ) {
        fault();
        return;
      }
      counts[kx] = q + 1;
      key[q] = kx;
      kind[q] = xKind[x];
      a[q] = xA[x];
      b[q] = xB[x];
      c[q] = xC[x];
      d[q] = xD[x];
    }
    for (let x = 0; x < k; x++) {
      if (
        x >= xKey.length ||
        x >= xKind.length ||
        x >= xA.length ||
        x >= xB.length ||
        x >= xC.length ||
        x >= xD.length ||
        x >= key.length ||
        x >= kind.length ||
        x >= a.length ||
        x >= b.length ||
        x >= c.length ||
        x >= d.length
      ) {
        fault();
        return;
      }
      xKey[x] = key[x];
      xKind[x] = kind[x];
      xA[x] = a[x];
      xB[x] = b[x];
      xC[x] = c[x];
      xD[x] = d[x];
    }
  }

  /** Break.getPlusIndent() == 0 for the space-suppression rule (evaluated now). */
  private evalIndentConstOrZero(ind: i32): boolean {
    return this.evalIndent(ind) === 0;
  }

  // ---- DocBuilder ------------------------------------------------------------

  private newDoc(kind: i32, a: i32, b: i32, c: i32, d: i32): i32 {
    const i = this.nDocs;
    if (i >= toI32(this.dKind.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return -1;
      }
      const cap = i * 2 + 16;
      this.dKind = growI32(this.dKind, cap);
      this.dA = growI32(this.dA, cap);
      this.dB = growI32(this.dB, cap);
      this.dC = growI32(this.dC, cap);
      this.dD = growI32(this.dD, cap);
      this.dFirst = growI32(this.dFirst, cap);
      this.dLast = growI32(this.dLast, cap);
      this.dNext = growI32(this.dNext, cap);
      this.dW = growI32(this.dW, cap);
      this.dLo = growI32(this.dLo, cap);
      this.dHi = growI32(this.dHi, cap);
      this.dOne = growI32(this.dOne, cap);
      this.dIndent = growI32(this.dIndent, cap);
    }
    const dKind = this.dKind;
    const dA = this.dA;
    const dB = this.dB;
    const dC = this.dC;
    const dD = this.dD;
    const dFirst = this.dFirst;
    const dLast = this.dLast;
    const dNext = this.dNext;
    const dW = this.dW;
    const dLo = this.dLo;
    const dOne = this.dOne;
    if (
      i < 0 ||
      i >= dKind.length ||
      i >= dA.length ||
      i >= dB.length ||
      i >= dC.length ||
      i >= dD.length ||
      i >= dFirst.length ||
      i >= dLast.length ||
      i >= dNext.length ||
      i >= dW.length ||
      i >= dLo.length ||
      i >= dOne.length
    ) {
      fault();
      return -1;
    }
    dKind[i] = kind;
    dA[i] = a;
    dB[i] = b;
    dC[i] = c;
    dD[i] = d;
    dFirst[i] = -1;
    dLast[i] = -1;
    dNext[i] = -1;
    dW[i] = -1;
    dLo[i] = -2;
    dOne[i] = 0;
    this.nDocs = i + 1;
    return i;
  }

  private addChild(level: i32, d: i32): void {
    const dFirst = this.dFirst;
    const dLast = this.dLast;
    const dNext = this.dNext;
    if (level < 0 || level >= dLast.length || level >= dFirst.length) {
      fault();
      return;
    }
    const last = dLast[level];
    if (last < 0) {
      dFirst[level] = d;
    } else if (last < dNext.length) {
      dNext[last] = d;
    } else {
      fault();
      return;
    }
    dLast[level] = d;
  }

  private push(level: i32): void {
    const n = this.nStack;
    if (n >= toI32(this.stack.length)) {
      if (n < 0 || n > 1073741815) {
        fault();
        return;
      }
      this.stack = growI32(this.stack, n * 2 + 16);
    }
    const stack = this.stack;
    if (n >= 0 && n < stack.length) {
      stack[n] = level;
      this.nStack = n + 1;
    } else {
      fault();
    }
  }

  /** Builds the doc tree from the final ops; answers the root level. */
  buildDoc(): i32 {
    this.nDocs = 0;
    this.nStack = 0;
    const base = this.newDoc(K_LEVEL, this.constIndent(0), 0, 0, 0);
    this.push(base);
    this.appendLevel = base;
    const nFin = this.nFin;
    const fKind = this.fKind;
    const fA = this.fA;
    const fB = this.fB;
    const fC = this.fC;
    const fD = this.fD;
    for (let i = 0; i < nFin; i++) {
      if (i >= fKind.length || i >= fA.length || i >= fB.length || i >= fC.length || i >= fD.length) {
        fault();
        return base;
      }
      const kind = fKind[i];
      if (kind === K_OPEN) {
        this.push(this.newDoc(K_LEVEL, fA[i], 0, 0, 0));
      } else if (kind === K_CLOSE) {
        const n = this.nStack;
        const stack = this.stack;
        // The close pops the level its open pushed; the base stays below it.
        if (n < 2 || n > stack.length) {
          fault();
          return base;
        }
        this.nStack = n - 1;
        this.addChild(stack[n - 2], stack[n - 1]);
      } else if (kind === K_FENCE) {
        continue;
      } else if (kind === K_BREAK) {
        const n = this.nStack;
        const stack = this.stack;
        if (n < 1 || n > stack.length) {
          fault();
          return base;
        }
        this.appendLevel = stack[n - 1];
        this.addChild(this.appendLevel, this.newDoc(K_BREAK, fA[i], fB[i], fC[i], fD[i]));
      } else {
        this.addChild(this.appendLevel, this.newDoc(kind, fA[i], fB[i], fC[i], fD[i]));
      }
    }
    while (toI32(this.dText.length) < this.nDocs) {
      this.dText.push("");
    }
    return base;
  }

  // ---- Doc -------------------------------------------------------------------

  /** Doc.getWidth (memoized). */
  width(d: i32): i32 {
    const dW = this.dW;
    const dKind = this.dKind;
    const dA = this.dA;
    if (d < 0 || d >= dW.length || d >= dKind.length || d >= dA.length) {
      fault();
      return 0;
    }
    const w0 = dW[d];
    if (w0 >= 0) {
      return w0;
    }
    let w = 0;
    const kind = dKind[d];
    if (kind === K_LEVEL) {
      const dNext = this.dNext;
      let c = atI32(this.dFirst, d);
      while (c >= 0) {
        // Summed in i64, so no child's width can overflow the sum.
        const s = toI64(w) + toI64(this.width(c));
        if (s >= toI64(MAX_LINE_WIDTH)) {
          w = MAX_LINE_WIDTH;
          break;
        }
        w = toI32(s);
        if (c >= dNext.length) {
          fault();
          return 0;
        }
        c = dNext[c];
      }
    } else if (kind === K_TOKEN) {
      const t = atI32(this.inp.kTok, dA[d]);
      w = this.inp.lineWidth(t, MAX_LINE_WIDTH);
    } else if (kind === K_SPACE) {
      w = 1;
    } else if (kind === K_BREAK) {
      if (dA[d] === FORCED) {
        w = MAX_LINE_WIDTH;
      } else {
        w = this.flatWidth(atI32(this.dB, d));
      }
    } else {
      w = this.tokWidthOf(dA[d]);
    }
    if (d < dW.length) {
      dW[d] = w;
    }
    return w;
  }

  /** The width of a break's flat text, flats[id]. */
  private flatWidth(id: i32): i32 {
    const flats = this.flats;
    if (id >= 0 && id < flats.length) {
      return strUtf16Len(flats[id]);
    }
    fault();
    return 0;
  }

  /** The flat text of a break: flats[id]. */
  private flatText(id: i32): string {
    const flats = this.flats;
    if (id >= 0 && id < flats.length) {
      return flats[id];
    }
    fault();
    return "";
  }

  /** Doc.Tok.computeWidth. */
  private tokWidthOf(t: i32): i32 {
    const inp = this.inp;
    const f = atI32(inp.tFlags, t);
    const idx = this.firstBreak(t);
    if ((f & TF_COMMENT) !== 0) {
      if (idx > 0) {
        return idx;
      }
      if ((f & TF_LINE_COMMENT) !== 0 && !this.startsWithSlashSlashSpace(t)) {
        return add32(inp.tokWidth(t), 1);
      }
      const pw = gParamCommentWidth(inp, t);
      return pw >= 0 ? pw : inp.tokWidth(t);
    }
    return idx !== -1 ? MAX_LINE_WIDTH : inp.tokWidth(t);
  }

  /** Newlines.firstBreak: the offset (in characters) of the second line, or -1. */
  private firstBreak(t: i32): i32 {
    const inp = this.inp;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return -1;
    }
    const src = inp.src;
    const a = tPos[t];
    const e = tEnd[t];
    let i = a;
    while (i >= 0 && i < e && i < src.length) {
      const c = toI32(src[i]);
      const j = i + 1;
      if (c === 10) {
        return inp.width(a, j);
      }
      if (c === 13) {
        if (j < e) {
          if (j >= src.length) {
            fault();
            return -1;
          }
          if (toI32(src[j]) === 10) {
            return inp.width(a, j + 1);
          }
        }
        return inp.width(a, j);
      }
      i = j;
    }
    if (i < e) {
      fault(); // the scan would have read outside `src`
    }
    return -1;
  }

  private startsWithSlashSlashSpace(t: i32): boolean {
    const inp = this.inp;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return false;
    }
    const a = tPos[t];
    if (gSpan(a, tEnd[t]) < 3) {
      return false;
    }
    const p = add32(a, 2);
    const src = inp.src;
    if (p >= 0 && p < src.length) {
      return toI32(src[p]) === 32;
    }
    fault();
    return false;
  }

  /** Doc.computeBreaks from column `col` at indent `indent`; answers the new column. */
  computeBreaks(d: i32, indent: i32, col: i32): i32 {
    const dKind = this.dKind;
    const dA = this.dA;
    if (d < 0 || d >= dKind.length || d >= dA.length) {
      fault();
      return col;
    }
    const kind = dKind[d];
    if (kind === K_LEVEL) {
      const ind = dA[d];
      const w = this.width(d);
      const dOne = this.dOne;
      if (d >= dOne.length) {
        fault();
        return col;
      }
      if (toI64(col) + toI64(w) <= toI64(this.maxWidth)) {
        dOne[d] = 1;
        return add32(col, w);
      }
      dOne[d] = 0;
      return this.computeBroken(d, add32(indent, this.evalIndent(ind)), col);
    }
    if (kind === K_TOK) {
      const text = this.rewrite(this, dA[d], this.maxWidth, col);
      const dText = this.dText;
      if (d < dText.length) {
        dText[d] = text;
      } else {
        fault();
        return col;
      }
      // The width of the text's last line.
      let last = 0;
      const n = toI32(text.length);
      let i = 0;
      while (i >= 0 && i < n) {
        const c = text.charCodeAt(i);
        let next = i + 1;
        if (c === 10) {
          last = next;
        } else if (c === 13) {
          if (next < n && text.charCodeAt(next) === 10) {
            next = next + 1;
          }
          last = next;
        }
        i = next;
      }
      return add32(col, strUtf16Len(text.substring(last, n)));
    }
    if (kind === K_TOKEN) {
      const t = atI32(this.inp.kTok, dA[d]);
      return add32(col, this.inp.lineWidth(t, MAX_LINE_WIDTH));
    }
    if (kind === K_SPACE) {
      return add32(col, 1);
    }
    this.fail("computeBreaks on a break");
    return col;
  }

  private computeBroken(level: i32, indent: i32, col0: i32): i32 {
    const dKind = this.dKind;
    const dNext = this.dNext;
    const dA = this.dA;
    let col = col0;
    let must = false;
    let c = atI32(this.dFirst, level);
    let first = true;
    const max = this.maxWidth;
    while (first || c >= 0) {
      let brk = -1;
      if (!first) {
        brk = c;
        if (c < 0 || c >= dNext.length) {
          fault();
          return col;
        }
        c = dNext[c];
      }
      first = false;
      // The split: docs up to the next break.
      let splitWidth = 0;
      let e = c;
      while (e >= 0) {
        if (e >= dKind.length || e >= dNext.length) {
          fault();
          return col;
        }
        if (dKind[e] === K_BREAK) {
          break;
        }
        const next = dNext[e];
        // Summed in i64 and capped, as the int sum was.
        const s = toI64(splitWidth) + toI64(this.width(e));
        splitWidth = s >= toI64(MAX_LINE_WIDTH) ? MAX_LINE_WIDTH : toI32(s);
        e = next;
      }
      if (splitWidth > MAX_LINE_WIDTH) {
        splitWidth = MAX_LINE_WIDTH;
      }
      if (brk >= 0) {
        const bw = this.width(brk);
        if (brk >= dA.length) {
          fault();
          return col;
        }
        const shouldBreak = dA[brk] === UNIFIED || must || toI64(col) + toI64(bw) + toI64(splitWidth) > toI64(max);
        col = this.breakAt(brk, col, indent, shouldBreak);
      }
      const enoughRoom = toI64(col) + toI64(splitWidth) <= toI64(max);
      while (c !== e) {
        col = this.computeBreaks(c, indent, col);
        if (c < 0 || c >= dNext.length) {
          fault();
          return col;
        }
        c = dNext[c];
      }
      must = !enoughRoom;
      // `c` is now the next break, or -1.
      if (c < 0) {
        break;
      }
    }
    return col;
  }

  /** Break.computeBreaks(state, lastIndent, broken). */
  private breakAt(b: i32, col: i32, lastIndent: i32, broken: boolean): i32 {
    const dD = this.dD;
    const dOne = this.dOne;
    const dIndent = this.dIndent;
    if (b < 0 || b >= dD.length || b >= dOne.length || b >= dIndent.length) {
      fault();
      return col;
    }
    const tag = dD[b];
    if (tag >= 0) {
      const tagTaken = this.tagTaken;
      if (tag >= tagTaken.length) {
        fault();
        return col;
      }
      tagTaken[tag] = broken ? 1 : 0;
    }
    if (broken) {
      dOne[b] = 1;
      let ni = add32(lastIndent, this.evalIndent(atI32(this.dC, b)));
      if (ni < 0) {
        ni = 0;
      }
      if (b < dIndent.length) {
        dIndent[b] = ni;
      }
      return ni;
    }
    dOne[b] = 0;
    dIndent[b] = -1;
    return add32(col, this.flatWidth(atI32(this.dB, b)));
  }

  /** Doc.range: the tok numbers a doc covers, [lo, hi); lo -1 when empty. */
  private range(d: i32): void {
    const dLo = this.dLo;
    const dHi = this.dHi;
    const dKind = this.dKind;
    const dA = this.dA;
    if (d < 0 || d >= dLo.length || d >= dHi.length || d >= dKind.length || d >= dA.length) {
      fault();
      return;
    }
    if (dLo[d] !== -2) {
      return;
    }
    const kind = dKind[d];
    let lo = -1;
    let hi = -1;
    if (kind === K_LEVEL) {
      const dNext = this.dNext;
      let c = atI32(this.dFirst, d);
      while (c >= 0) {
        this.range(c);
        if (c >= dLo.length || c >= dHi.length || c >= dNext.length) {
          fault();
          return;
        }
        const cl = dLo[c];
        if (cl >= 0) {
          if (lo < 0 || cl < lo) {
            lo = cl;
          }
          if (dHi[c] > hi) {
            hi = dHi[c];
          }
        }
        c = dNext[c];
      }
    } else if (kind === K_TOKEN) {
      lo = atI32(this.inp.tIdx, atI32(this.inp.kTok, dA[d]));
      hi = add32(lo, 1);
    } else if (kind === K_TOK) {
      lo = atI32(this.inp.tIdx, dA[d]);
      hi = add32(lo, 1);
    }
    if (d < dLo.length && d < dHi.length) {
      dLo[d] = lo;
      dHi[d] = hi;
    }
  }

  /** Doc.getFlat into the scratch buffer. */
  private flat(d: i32): void {
    const dKind = this.dKind;
    const dA = this.dA;
    if (d < 0 || d >= dKind.length || d >= dA.length) {
      fault();
      return;
    }
    const kind = dKind[d];
    const s = this.scratch;
    if (kind === K_LEVEL) {
      const dNext = this.dNext;
      let c = atI32(this.dFirst, d);
      while (c >= 0) {
        this.flat(c);
        if (c >= dNext.length) {
          fault();
          return;
        }
        c = dNext[c];
      }
    } else if (kind === K_TOKEN) {
      const inp = this.inp;
      const t = atI32(inp.kTok, dA[d]);
      const tPos = inp.tPos;
      const tEnd = inp.tEnd;
      if (t < 0 || t >= tPos.length || t >= tEnd.length) {
        fault();
        return;
      }
      s.range(inp.src, tPos[t], tEnd[t]);
    } else if (kind === K_SPACE) {
      s.byte(32);
    } else if (kind === K_BREAK) {
      s.str(this.flatText(atI32(this.dB, d)));
    } else {
      s.str(this.tokFlat(dA[d]));
    }
  }

  /** Doc.Tok.computeFlat. */
  private tokFlat(t: i32): string {
    const inp = this.inp;
    if ((atI32(inp.tFlags, t) & TF_LINE_COMMENT) !== 0 && !this.startsWithSlashSlashSpace(t)) {
      const tPos = inp.tPos;
      const tEnd = inp.tEnd;
      if (t < 0 || t >= tPos.length || t >= tEnd.length) {
        fault();
        return "";
      }
      return `// ${bytesText(inp.src, add32(tPos[t], 2), tEnd[t])}`;
    }
    const p = reformatParameterComment(inp, t);
    return p !== null ? p : inp.text(t);
  }

  /** Doc.write. */
  write(d: i32): void {
    const dKind = this.dKind;
    const dA = this.dA;
    const dOne = this.dOne;
    if (d < 0 || d >= dKind.length || d >= dA.length || d >= dOne.length) {
      fault();
      return;
    }
    const kind = dKind[d];
    if (kind === K_LEVEL) {
      if (dOne[d] === 1) {
        this.range(d);
        this.scratch.n = 0;
        this.flat(d);
        this.append(this.scratch.buf, 0, this.scratch.n, atI32(this.dLo, d), atI32(this.dHi, d));
      } else {
        const dNext = this.dNext;
        let c = atI32(this.dFirst, d);
        while (c >= 0) {
          this.write(c);
          if (c >= dNext.length) {
            fault();
            return;
          }
          c = dNext[c];
        }
      }
    } else if (kind === K_TOKEN) {
      const inp = this.inp;
      const t = atI32(inp.kTok, dA[d]);
      const tPos = inp.tPos;
      const tEnd = inp.tEnd;
      const tIdx = inp.tIdx;
      const tFlags = inp.tFlags;
      if (t < 0 || t >= tIdx.length || t >= tFlags.length || t >= tPos.length || t >= tEnd.length) {
        fault();
        return;
      }
      const k = tIdx[t];
      if (k >= 2147483647) {
        fault();
        return;
      }
      const a = tPos[t];
      const e = tEnd[t];
      if ((tFlags[t] & TF_TOMB) !== 0) {
        // The last space before each newline goes out as U+0003, which
        // survives the trailing-space trim and becomes a space again later.
        const n = gSpan(a, e);
        const tmp = newU8s(n);
        const src = inp.src;
        let i = a;
        for (let q = 0; q < n && q < tmp.length; q++) {
          if (i < 0 || i >= src.length) {
            fault();
            return;
          }
          const c = toI32(src[i]);
          const j = i + 1;
          let tomb = false;
          if (c === 32 && j < e) {
            if (j >= src.length) {
              fault();
              return;
            }
            tomb = toI32(src[j]) === 10;
          }
          tmp[q] = tomb ? toU8(3) : toU8(c);
          i = j;
        }
        this.append(tmp, 0, n, k, k + 1);
      } else {
        this.append(inp.src, a, e, k, k + 1);
      }
    } else if (kind === K_SPACE) {
      this.appendStr(" ", -1, -1);
    } else if (kind === K_BREAK) {
      if (dOne[d] === 1) {
        this.appendStr("\n", -1, -1);
        this.indent(atI32(this.dIndent, d));
      } else {
        this.appendStr(this.flatText(atI32(this.dB, d)), -1, -1);
      }
    } else {
      const k = atI32(this.inp.tIdx, dA[d]);
      const dText = this.dText;
      if (d >= dText.length) {
        fault();
        return;
      }
      this.appendStr(dText[d], k, add32(k, 1));
    }
  }

  // ---- JavaOutput ------------------------------------------------------------

  /** append of the bytes of `s`, through a buffer kept between calls. */
  private appendStr(s: string, lo: i32, hi: i32): void {
    const n = toI32(s.length);
    const tmp = this.strBuf;
    while (tmp.length < n) {
      tmp.push(0);
    }
    for (let i = 0; i < n && i < tmp.length; i++) {
      tmp[i] = toU8(s.charCodeAt(i));
    }
    this.append(tmp, 0, n, lo, hi);
  }

  indent(n: i32): void {
    for (let i = 0; i < n; i++) {
      this.pushSpace(32);
    }
  }

  private pushSpace(c: i32): void {
    const n = this.nSpaces;
    let spaces = this.spaces;
    if (n >= toI32(spaces.length)) {
      if (n < 0 || n > 1073741815) {
        fault();
        return;
      }
      const nb = newU8s(n * 2 + 16);
      copyU8s(nb, 0, spaces, 0, toI32(spaces.length));
      this.spaces = nb;
      spaces = nb;
    }
    if (n >= 0 && n < spaces.length) {
      spaces[n] = toU8(c);
      this.nSpaces = n + 1;
    } else {
      fault();
    }
  }

  /** JavaOutput.append of `buf[a, b)` covering tok numbers [lo, hi). */
  append(buf: u8[], a: i32, b: i32, lo: i32, hi: i32): void {
    const inp = this.inp;
    // Every case below reads all of buf[a, b).
    if (a < b && (a < 0 || b > buf.length)) {
      fault();
      return;
    }
    const len = gSpan(a, b);
    if (lo >= 0) {
      let sawNewlines = false;
      const iN = inp.nLines;
      const lineLo = inp.lineLo;
      const lineHi = inp.lineHi;
      let il = this.iLine;
      while (il < iN) {
        if (il < 0 || il >= lineLo.length || il >= lineHi.length) {
          fault();
          return;
        }
        const ll = lineLo[il];
        if (!(ll < 0 || lineHi[il] <= lo)) {
          break;
        }
        if (ll < 0) {
          sawNewlines = true;
        }
        il++;
      }
      this.iLine = il;
      let isComment = false;
      if (len >= 2 && a >= 0 && a < buf.length - 1) {
        const c1 = toI32(buf[a + 1]);
        isComment = toI32(buf[a]) === 47 && (c1 === 47 || c1 === 42);
      }
      const w = this.wanted(this.lastK);
      if ((sawNewlines && isComment) || w === 1 || (w === -1 && sawNewlines)) {
        this.bumpNewlines();
      }
    }
    let isNewline = false;
    if (len === 1 && a >= 0 && a < buf.length) {
      const c0 = toI32(buf[a]);
      isNewline = c0 === 10 || c0 === 13;
    } else if (len === 2 && a >= 0 && a < buf.length - 1) {
      isNewline = toI32(buf[a]) === 13 && toI32(buf[a + 1]) === 10;
    }
    if (isNewline) {
      if (this.newlinesPending === 0) {
        this.newlinesPending = 1;
      }
      this.nSpaces = 0;
    } else {
      const out = this.out;
      let rangesSet = false;
      let i = a;
      while (i >= 0 && i < b && i < buf.length) {
        const c = toI32(buf[i]);
        if (c === 32 || c === 9) {
          this.pushSpace(c);
          i++;
        } else if (c === 13 || c === 10) {
          const j = i + 1;
          if (c === 13 && j < b && j < buf.length && toI32(buf[j]) === 10) {
            i = j;
          }
          this.nSpaces = 0;
          this.bumpNewlines();
          i++;
        } else {
          let pending = this.newlinesPending;
          while (pending > 0) {
            if (this.nOutLines > 0 || out.n > this.lineStart) {
              out.byte(10);
              const nl = this.nOutLines;
              if (nl >= 2147483647) {
                fault();
                return;
              }
              this.nOutLines = nl + 1;
              this.lineStart = out.n;
            }
            rangesSet = false;
            pending = pending - 1;
          }
          this.newlinesPending = pending;
          if (this.partial && lo >= 0 && !rangesSet) {
            this.addLineRange(this.nOutLines, lo, hi);
            rangesSet = true;
          }
          const ns = this.nSpaces;
          if (ns > 0) {
            out.range(this.spaces, 0, ns);
            this.nSpaces = 0;
          }
          // The run of other characters goes out at once.
          let j = i + 1;
          while (j < b && j < buf.length) {
            const d = toI32(buf[j]);
            if (d === 32 || d === 9 || d === 10 || d === 13) {
              break;
            }
            j++;
          }
          out.range(buf, i, j);
          i = j;
        }
      }
    }
    if (lo >= 0) {
      this.lastK = hi;
    }
  }

  /** One more newline before the next text. */
  private bumpNewlines(): void {
    const p = this.newlinesPending;
    if (p < 2147483647) {
      this.newlinesPending = p + 1;
    } else {
      fault();
    }
  }

  /** JavaOutput.flush, then the replacement's line separators: every line ends in "\n". */
  flush(): void {
    const out = this.out;
    const buf = out.buf;
    const on = out.n;
    let blank = true;
    let i = this.lineStart;
    while (i >= 0 && i < on && i < buf.length) {
      const c = toI32(buf[i]);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 11) {
        blank = false;
        break;
      }
      i++;
    }
    if (blank && i < on) {
      fault(); // the scan would have read outside the buffer
      return;
    }
    if (!blank) {
      out.byte(10);
      const nl = this.nOutLines;
      if (nl >= 2147483647) {
        fault();
        return;
      }
      this.nOutLines = nl + 1;
      this.lineStart = out.n;
    } else {
      out.n = this.lineStart;
    }
    if (this.nOutLines === 0) {
      out.byte(10);
    }
    if (this.partial) {
      // The EOF tok's range follows the lines.
      const eofLine = this.nLineR > this.nOutLines ? this.nLineR : this.nOutLines;
      const kn = this.inp.kN;
      this.addLineRange(eofLine, kn, add32(kn, 1));
    }
  }

  /** Lays out the ops the visitor emitted and writes the result into `out`. */
  layout(): boolean {
    if (this.failed) {
      return false;
    }
    this.build();
    const root = this.buildDoc();
    this.computeBreaks(root, 0, 0);
    this.write(root);
    this.flush();
    return !this.failed;
  }
}

/**
 * CommentsHelper's parameter-comment match, `/* name = *\/`: the start of the
 * name, or -1 when tok `t` is no such comment.
 */
const gParamName = (inp: GInput, t: i32): i32 => {
  const tFlags = inp.tFlags;
  const tPos = inp.tPos;
  const tEnd = inp.tEnd;
  if (t < 0 || t >= tFlags.length) {
    fault();
    return -1;
  }
  if ((tFlags[t] & TF_BLOCK_COMMENT) === 0) {
    return -1;
  }
  if (t >= tPos.length || t >= tEnd.length) {
    fault();
    return -1;
  }
  const src = inp.src;
  let i = add32(tPos[t], 2);
  const e = sub32(tEnd[t], 2);
  if (e < i) {
    return -1;
  }
  if (e < 0 || e >= src.length) {
    fault();
    return -1;
  }
  if (toI32(src[e]) !== 42) {
    return -1;
  }
  // From here i <= e < src.length; a negative i would read outside `src` at once.
  if (i < 0) {
    fault();
    return -1;
  }
  while (i < e && i < src.length && gIsWs(toI32(src[i]))) {
    i++;
  }
  const ns = i;
  if (i >= e || i >= src.length || !gIsIdentStart(toI32(src[i]))) {
    return -1;
  }
  i = gParamNameEnd(src, ns, e);
  while (i >= 0 && i < e && i < src.length && gIsWs(toI32(src[i]))) {
    i++;
  }
  if (i < 0 || i >= e || i >= src.length || toI32(src[i]) !== 61) {
    return -1;
  }
  i++;
  while (i < e && i < src.length && gIsWs(toI32(src[i]))) {
    i++;
  }
  if (i !== e) {
    return -1;
  }
  return ns;
};

/** The end of a parameter comment's name from its start `ns` (an identifier start, before `e`): its identifier parts, then a "...". */
const gParamNameEnd = (src: u8[], ns: i32, e: i32): i32 => {
  if (ns < 0 || ns >= src.length) {
    fault();
    return ns;
  }
  let i = ns + 1;
  while (i < e && i < src.length && gIsIdentPart(toI32(src[i]))) {
    i++;
  }
  if (i >= 0 && e >= 0 && e - i >= 3 && i < src.length - 2) {
    if (toI32(src[i]) === 46 && toI32(src[i + 1]) === 46 && toI32(src[i + 2]) === 46) {
      i += 3;
    }
  }
  return i;
};

/** CommentsHelper.reformatParameterComment: `/* name = *\/` as `/* name= *\/`, else null. */
export const reformatParameterComment = (inp: GInput, t: i32): string | null => {
  const ns = gParamName(inp, t);
  if (ns < 0) {
    return null;
  }
  const ne = gParamNameEnd(inp.src, ns, sub32(atI32(inp.tEnd, t), 2));
  return `/* ${bytesText(inp.src, ns, ne)}= */`;
};

/**
 * The width of reformatParameterComment's answer, or -1 for null, counted
 * without building the string: "/* " and "= *\/" around the name.
 */
const gParamCommentWidth = (inp: GInput, t: i32): i32 => {
  const ns = gParamName(inp, t);
  if (ns < 0) {
    return -1;
  }
  const ne = gParamNameEnd(inp.src, ns, sub32(atI32(inp.tEnd, t), 2));
  return add32(utf16Len(inp.src, ns, ne), 7);
};

const gIsWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/** Character.isJavaIdentifierStart for ASCII; any non-ASCII byte counts. */
export const gIsIdentStart = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;

export const gIsIdentPart = (c: i32): boolean => gIsIdentStart(c) || (c >= 48 && c <= 57);
