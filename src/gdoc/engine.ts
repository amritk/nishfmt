// The layout engine google-java-format and ktfmt share: a visitor emits ops
// (open, close, token, space, break), `build` threads the comments in, the
// ops become a tree of levels, `computeBreaks` decides which breaks are
// taken, and `write` renders the tree through JavaOutput's blank-line rules.
//
// Ported from google-java-format's OpsBuilder, DocBuilder, Doc, Indent,
// Output.BreakTag and JavaOutput (Apache License 2.0, Copyright 2015 Google
// Inc.). The tree is kept in columns; each `Doc` subclass is a kind.

import { growI32, strUtf16Len } from "../core/arr";
import { Out } from "../core/out";
import { GInput, TF_BLOCK_COMMENT, TF_COMMENT, TF_JAVADOC, TF_LINE_COMMENT, TF_NEWLINE, TF_TOMB } from "./input";

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
    for (let i = 0; i < 513; i++) {
      this.constCache[i] = -1;
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
    const kn = this.inp.kN + 2;
    this.blMode = growI32(this.blMode, kn);
    this.blTag = growI32(this.blTag, kn);
    for (let i = 0; i < kn; i++) {
      this.blMode[i] = BL_NONE;
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
      this.failure = `${msg} at byte ${t >= 0 ? this.inp.tPos[t] : -1}`;
    }
  }

  // ---- Indents and tags ------------------------------------------------------

  private newIndent(kind: i32, n: i32, tag: i32, th: i32, el: i32): i32 {
    const i = this.nInd;
    if (i >= toI32(this.indKind.length)) {
      const c = i * 2 + 16;
      this.indKind = growI32(this.indKind, c);
      this.indN = growI32(this.indN, c);
      this.indTag = growI32(this.indTag, c);
      this.indThen = growI32(this.indThen, c);
      this.indElse = growI32(this.indElse, c);
    }
    this.indKind[i] = kind;
    this.indN[i] = n;
    this.indTag[i] = tag;
    this.indThen[i] = th;
    this.indElse[i] = el;
    this.nInd = i + 1;
    return i;
  }

  /** Indent.Const of `n` columns. */
  constIndent(n: i32): i32 {
    if (n >= -256 && n <= 256) {
      const c = this.constCache[n + 256];
      if (c >= 0) {
        return c;
      }
      const id = this.newIndent(0, n, -1, -1, -1);
      this.constCache[n + 256] = id;
      return id;
    }
    return this.newIndent(0, n, -1, -1, -1);
  }

  /** Indent.If: `th` when `tag` was broken, else `el`. */
  ifIndent(tag: i32, th: i32, el: i32): i32 {
    return this.newIndent(1, 0, tag, th, el);
  }

  evalIndent(i: i32): i32 {
    let x = i;
    while (this.indKind[x] === 1) {
      x = this.tagTaken[this.indTag[x]] === 1 ? this.indThen[x] : this.indElse[x];
    }
    return this.indN[x];
  }

  genSym(): i32 {
    const t = this.nTags;
    if (t >= toI32(this.tagTaken.length)) {
      this.tagTaken = growI32(this.tagTaken, t * 2 + 16);
    }
    this.tagTaken[t] = -1;
    this.nTags = t + 1;
    return t;
  }

  wasBreakTaken(tag: i32): boolean {
    return this.tagTaken[tag] === 1;
  }

  flatId(s: string): i32 {
    for (let i = 0; i < toI32(this.flats.length); i++) {
      if (this.flats[i] === s) {
        return i;
      }
    }
    this.flats.push(s);
    return toI32(this.flats.length) - 1;
  }

  // ---- OpsBuilder ------------------------------------------------------------

  private addOp(kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    if (kind === K_OPEN) {
      this.depth = this.depth + 1;
    } else if (kind === K_CLOSE) {
      this.depth = this.depth - 1;
      if (this.depth < 0) {
        this.fail("unbalanced close");
      }
    }
    const i = this.nOps;
    if (i >= toI32(this.oKind.length)) {
      const cap = i * 2 + 16;
      this.oKind = growI32(this.oKind, cap);
      this.oA = growI32(this.oA, cap);
      this.oB = growI32(this.oB, cap);
      this.oC = growI32(this.oC, cap);
      this.oD = growI32(this.oD, cap);
    }
    this.oKind[i] = kind;
    this.oA[i] = a;
    this.oB[i] = b;
    this.oC[i] = c;
    this.oD[i] = d;
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
    const i = this.tokenI + skip;
    return i < this.inp.nTokens ? this.inp.kTok[i] : -1;
  }

  peekIs(s: string): boolean {
    const t = this.peekTok(0);
    return t >= 0 && this.inp.is(t, s);
  }

  peekIsAt(skip: i32, s: string): boolean {
    const t = this.peekTok(skip);
    return t >= 0 && this.inp.is(t, s);
  }

  /** OpsBuilder.token: outputs the next input token when its text is `s`. */
  token(s: string, real: boolean, plusIndentCommentsBefore: i32, breakAndIndentTrailingComment: i32): void {
    if (this.peekIs(s)) {
      this.addOp(K_TOKEN, this.tokenI, 1, plusIndentCommentsBefore, breakAndIndentTrailingComment);
      this.tokenI = this.tokenI + 1;
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
    let same = p >= 0 && inp.tEnd[p] - inp.tPos[p] === b - a;
    if (same && inp.tPos[p] !== a) {
      for (let i = 0; i < b - a; i++) {
        if (inp.src[inp.tPos[p] + i] !== inp.src[a + i]) {
          same = false;
          break;
        }
      }
    }
    if (same) {
      this.addOp(K_TOKEN, this.tokenI, 1, plusIndentCommentsBefore, -1);
      this.tokenI = this.tokenI + 1;
    } else {
      this.fail(
        `expected token '${p >= 0 ? inp.text(p) : "EOF"}'; generated ${String.fromBytes(inp.src, a, b)} instead`,
      );
    }
  }

  /** token(text of tok `t`): outputs the next input token when its text is the same. */
  tokLike(t: i32): void {
    const p = this.peekTok(0);
    if (p >= 0 && this.inp.sameText(p, t)) {
      this.addOp(K_TOKEN, this.tokenI, 1, 0, -1);
      this.tokenI = this.tokenI + 1;
    } else {
      this.fail(`expected token '${p >= 0 ? this.inp.text(p) : "EOF"}'; generated ${this.inp.text(t)} instead`);
    }
  }

  /** OpsBuilder.actualSize: the characters from `pos` for `len`, widened over adjacent comments. */
  actualSize(pos: i32, len: i32): i32 {
    const inp = this.inp;
    const st = inp.tokenAt(pos);
    const et = inp.tokenAt(pos + len - 1);
    if (st < 0 || et < 0) {
      return len;
    }
    let start = inp.tPos[inp.kTok[st]];
    for (let j = 0; j < inp.kBeforeN[st]; j++) {
      const t = inp.refs[inp.kBefore[st] + j];
      if ((inp.tFlags[t] & TF_COMMENT) !== 0 && inp.tPos[t] < start) {
        start = inp.tPos[t];
      }
    }
    const tk = inp.kTok[et];
    let end = inp.tEnd[tk];
    for (let j = 0; j < inp.kAfterN[et]; j++) {
      const t = inp.refs[inp.kAfter[et] + j];
      if ((inp.tFlags[t] & TF_COMMENT) !== 0 && inp.tEnd[t] > end) {
        end = inp.tEnd[t];
      }
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
    const tokPos = inp.tPos[inp.kTok[st]];
    let start = tokPos;
    for (let j = 0; j < inp.kBeforeN[st]; j++) {
      const t = inp.refs[inp.kBefore[st] + j];
      if (this.breakBetween(inp.tPos[t], tokPos)) {
        return start;
      }
      if ((inp.tFlags[t] & TF_COMMENT) !== 0 && inp.tPos[t] < start) {
        start = inp.tPos[t];
      }
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
    for (let i = a; i < b; i++) {
      const c = toI32(src[i]);
      if (c === 10 || (c === 13 && !(i + 1 < this.inp.n && toI32(src[i + 1]) === 10))) {
        return true;
      }
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

  sync(pos: i32): void {
    if (pos > this.inputPosition) {
      this.inputPosition = pos;
      if (this.tokenI < this.inp.nTokens && pos > this.inp.tPos[this.inp.kTok[this.tokenI]]) {
        this.fail(`did not generate token "${this.inp.text(this.inp.kTok[this.tokenI])}"`);
      }
    }
  }

  /** Emits every input token not yet output as an imaginary token. */
  drain(): void {
    const pos = this.inp.n + 1;
    if (pos > this.inputPosition) {
      while (this.tokenI < this.inp.nTokens && pos > this.inp.tPos[this.inp.kTok[this.tokenI]]) {
        this.addOp(K_TOKEN, this.tokenI, 0, 0, -1);
        this.tokenI = this.tokenI + 1;
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
    for (let j = 0; j < inp.kBeforeN[k]; j++) {
      const t = inp.refs[inp.kBefore[k] + j];
      if (inp.tIdx[t] >= 0) {
        return inp.tIdx[t];
      }
    }
    return inp.tIdx[inp.kTok[k]];
  }

  /** The last numbered tok of a token: its last comment after, else itself (JavaOutput.endTok). */
  lastNumbered(k: i32): i32 {
    const inp = this.inp;
    for (let j = inp.kAfterN[k] - 1; j >= 0; j--) {
      const t = inp.refs[inp.kAfter[k] + j];
      if (inp.tIdx[t] >= 0) {
        return inp.tIdx[t];
      }
    }
    return inp.tIdx[inp.kTok[k]];
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
    if (this.lastBoundary === -1) {
      this.lastBoundary = this.tokenI;
      return;
    }
    if (this.tokenI === this.lastBoundary) {
      return;
    }
    const lo = this.firstNumbered(this.lastBoundary);
    const hi = this.lastNumbered(this.tokenI - 1);
    this.lastBoundary = this.tokenI;
    // A RangeSet: a range connected to the last one joins it.
    const n = this.nPf;
    if (n > 0 && lo <= this.pfHi[n - 1] && hi >= this.pfLo[n - 1]) {
      if (lo < this.pfLo[n - 1]) {
        this.pfLo[n - 1] = lo;
      }
      if (hi > this.pfHi[n - 1]) {
        this.pfHi[n - 1] = hi;
      }
      return;
    }
    if (n >= toI32(this.pfLo.length)) {
      this.pfLo = growI32(this.pfLo, n * 2 + 16);
      this.pfHi = growI32(this.pfHi, n * 2 + 16);
    }
    this.pfLo[n] = lo;
    this.pfHi[n] = hi;
    this.nPf = n + 1;
  }

  /** InputOutput.ranges[line] = union(ranges[line], [lo, hi)). */
  private addLineRange(line: i32, lo: i32, hi: i32): void {
    while (this.nLineR <= line) {
      if (this.nLineR >= toI32(this.lineRLo.length)) {
        this.lineRLo = growI32(this.lineRLo, this.nLineR * 2 + 16);
        this.lineRHi = growI32(this.lineRHi, this.nLineR * 2 + 16);
      }
      this.lineRLo[this.nLineR] = -1;
      this.lineRHi[this.nLineR] = -1;
      this.nLineR = this.nLineR + 1;
    }
    if (this.lineRLo[line] < 0) {
      this.lineRLo[line] = lo;
      this.lineRHi[line] = hi;
    } else {
      if (lo < this.lineRLo[line]) {
        this.lineRLo[line] = lo;
      }
      if (hi > this.lineRHi[line]) {
        this.lineRHi[line] = hi;
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
    const cur = this.blMode[k];
    if (cur === BL_NONE) {
      this.blMode[k] = mode;
      if (mode === BL_COND) {
        this.blTag[k] = this.newCell(tag, -1);
      }
      return;
    }
    if (cur !== BL_COND) {
      return; // SimpleBlankLine.merge keeps itself
    }
    if (mode !== BL_COND) {
      this.blMode[k] = mode;
      return;
    }
    // Append the tag to the list.
    let c = this.blTag[k];
    while (this.cellNext[c] >= 0) {
      c = this.cellNext[c];
    }
    this.cellNext[c] = this.newCell(tag, -1);
  }

  private newCell(tag: i32, next: i32): i32 {
    const c = this.nCells;
    if (c >= toI32(this.cellTag.length)) {
      this.cellTag = growI32(this.cellTag, c * 2 + 16);
      this.cellNext = growI32(this.cellNext, c * 2 + 16);
    }
    this.cellTag[c] = tag;
    this.cellNext[c] = next;
    this.nCells = c + 1;
    return c;
  }

  /** The wish at `k`: 1 yes, 0 no, -1 preserve (no opinion). */
  wanted(k: i32): i32 {
    if (k < 0 || k >= toI32(this.blMode.length)) {
      return 0;
    }
    const m = this.blMode[k];
    if (m === BL_NONE || m === BL_NO) {
      return 0;
    }
    if (m === BL_YES) {
      return 1;
    }
    if (m === BL_PRESERVE) {
      return -1;
    }
    for (let c = this.blTag[k]; c >= 0; c = this.cellNext[c]) {
      if (this.tagTaken[this.cellTag[c]] === 1) {
        return 1;
      }
    }
    return -1;
  }

  private addExtra(key: i32, kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    const i = this.nExtra;
    if (i >= toI32(this.xKey.length)) {
      const cap = i * 2 + 16;
      this.xKey = growI32(this.xKey, cap);
      this.xKind = growI32(this.xKind, cap);
      this.xA = growI32(this.xA, cap);
      this.xB = growI32(this.xB, cap);
      this.xC = growI32(this.xC, cap);
      this.xD = growI32(this.xD, cap);
    }
    this.xKey[i] = key;
    this.xKind[i] = kind;
    this.xA[i] = a;
    this.xB[i] = b;
    this.xC[i] = c;
    this.xD[i] = d;
    this.nExtra = i + 1;
  }

  private extraForced(key: i32, plusIndent: i32): void {
    this.addExtra(key, K_BREAK, FORCED, 0, plusIndent, -1);
  }

  /** makeComment: a block comment alone, a line comment and a forced break. */
  private extraComment(key: i32, t: i32): void {
    this.addExtra(key, K_TOK, t, 0, 0, -1);
    if ((this.inp.tFlags[t] & TF_BLOCK_COMMENT) === 0) {
      this.extraForced(key, 0);
    }
  }

  private pushFin(kind: i32, a: i32, b: i32, c: i32, d: i32): void {
    const i = this.nFin;
    if (i >= toI32(this.fKind.length)) {
      const cap = i * 2 + 16;
      this.fKind = growI32(this.fKind, cap);
      this.fA = growI32(this.fA, cap);
      this.fB = growI32(this.fB, cap);
      this.fC = growI32(this.fC, cap);
      this.fD = growI32(this.fD, cap);
    }
    this.fKind[i] = kind;
    this.fA[i] = a;
    this.fB[i] = b;
    this.fC[i] = c;
    this.fD[i] = d;
    this.nFin = i + 1;
  }

  /** OpsBuilder.build: the ops with every token's comments threaded in. */
  build(): void {
    this.markForPartialFormat();
    const inp = this.inp;
    const opsN = this.nOps;
    for (let i = 0; i < opsN; i++) {
      if (this.oKind[i] !== K_TOKEN) {
        continue;
      }
      const k = this.oA[i];
      let j = i;
      while (j > 0 && this.oKind[j - 1] === K_OPEN) {
        j--;
      }
      let kk = i;
      while (kk + 1 < opsN && this.oKind[kk + 1] === K_CLOSE) {
        kk++;
      }
      const bs = inp.kBefore[k];
      const bn = inp.kBeforeN[k];
      if (this.oB[i] === 1) {
        let newlines = 0;
        let space = false;
        let lastWasComment = false;
        let allowBlankAfterLastComment = false;
        for (let q = 0; q < bn; q++) {
          const t = inp.refs[bs + q];
          const f = inp.tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            newlines++;
          } else if ((f & TF_COMMENT) !== 0) {
            this.addExtra(j, K_BREAK, (f & TF_LINE_COMMENT) !== 0 ? FORCED : UNIFIED, 0, this.oC[i], -1);
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
        }
        if (allowBlankAfterLastComment && newlines > 1) {
          this.blankLine(inp.tIdx[inp.kTok[k]], BL_YES, -1);
        }
        if (lastWasComment && newlines > 0) {
          this.extraForced(j, 0);
        } else if (space) {
          this.addExtra(j, K_SPACE, 0, 0, 0, -1);
        }
        const as = inp.kAfter[k];
        const an = inp.kAfterN[k];
        for (let q = 0; q < an; q++) {
          const t = inp.refs[as + q];
          const f = inp.tFlags[t];
          if ((f & TF_COMMENT) === 0) {
            continue;
          }
          const breakAfter = (f & TF_JAVADOC) !== 0 || ((f & TF_BLOCK_COMMENT) !== 0 && this.oD[i] >= 0);
          if (breakAfter) {
            this.extraForced(kk + 1, this.oD[i] >= 0 ? this.oD[i] : 0);
          } else {
            this.addExtra(kk + 1, K_SPACE, 0, 0, 0, -1);
          }
          this.extraComment(kk + 1, t);
          if (breakAfter) {
            this.extraForced(kk + 1, 0);
          }
        }
      } else {
        // An imaginary token: its toks go out as they are.
        let newlines = 0;
        let lastWasComment = false;
        for (let q = 0; q < bn; q++) {
          const t = inp.refs[bs + q];
          const f = inp.tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            newlines++;
          } else if ((f & TF_COMMENT) !== 0) {
            newlines = 0;
            lastWasComment = true;
          }
          if (lastWasComment && newlines > 0) {
            this.extraForced(j, 0);
          }
          this.addExtra(j, K_TOK, t, 0, 0, -1);
        }
        const as = inp.kAfter[k];
        const an = inp.kAfterN[k];
        for (let q = 0; q < an; q++) {
          this.addExtra(kk + 1, K_TOK, inp.refs[as + q], 0, 0, -1);
        }
      }
    }
    // The extras are generated in key order (a token's leading comments key
    // at or after the previous token's trailing ones), so they merge in with
    // one pointer; a counting sort covers any other order.
    let sorted = true;
    for (let x = 1; x < this.nExtra; x++) {
      if (this.xKey[x] < this.xKey[x - 1]) {
        sorted = false;
        break;
      }
    }
    if (!sorted) {
      this.sortExtras(opsN);
    }
    this.nFin = 0;
    let afterForcedBreak = false;
    let x = 0;
    for (let i = 0; i <= opsN; i++) {
      while (x < this.nExtra && this.xKey[x] === i) {
        const kind = this.xKind[x];
        if (!(afterForcedBreak && kind === K_SPACE)) {
          this.pushFin(kind, this.xA[x], this.xB[x], this.xC[x], this.xD[x]);
          afterForcedBreak = kind === K_BREAK && this.xA[x] === FORCED;
        }
        x++;
      }
      if (i === opsN) {
        break;
      }
      const kind = this.oKind[i];
      if (
        afterForcedBreak &&
        (kind === K_SPACE || (kind === K_BREAK && this.evalIndentConstOrZero(this.oC[i]) && this.oB[i] === 1))
      ) {
        continue;
      }
      this.pushFin(kind, this.oA[i], this.oB[i], this.oC[i], this.oD[i]);
      if (kind !== K_OPEN) {
        afterForcedBreak = kind === K_BREAK && this.oA[i] === FORCED;
      }
    }
  }

  /** Reorders the extras stably by key (a counting sort). */
  private sortExtras(opsN: i32): void {
    const counts = new Array<i32>(opsN + 2);
    for (let x = 0; x < this.nExtra; x++) {
      counts[this.xKey[x] + 1] = counts[this.xKey[x] + 1] + 1;
    }
    for (let x = 1; x <= opsN + 1; x++) {
      counts[x] = counts[x] + counts[x - 1];
    }
    const k = this.nExtra;
    const key = new Array<i32>(k);
    const kind = new Array<i32>(k);
    const a = new Array<i32>(k);
    const b = new Array<i32>(k);
    const c = new Array<i32>(k);
    const d = new Array<i32>(k);
    for (let x = 0; x < k; x++) {
      const q = counts[this.xKey[x]];
      counts[this.xKey[x]] = q + 1;
      key[q] = this.xKey[x];
      kind[q] = this.xKind[x];
      a[q] = this.xA[x];
      b[q] = this.xB[x];
      c[q] = this.xC[x];
      d[q] = this.xD[x];
    }
    for (let x = 0; x < k; x++) {
      this.xKey[x] = key[x];
      this.xKind[x] = kind[x];
      this.xA[x] = a[x];
      this.xB[x] = b[x];
      this.xC[x] = c[x];
      this.xD[x] = d[x];
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
    this.dKind[i] = kind;
    this.dA[i] = a;
    this.dB[i] = b;
    this.dC[i] = c;
    this.dD[i] = d;
    this.dFirst[i] = -1;
    this.dLast[i] = -1;
    this.dNext[i] = -1;
    this.dW[i] = -1;
    this.dLo[i] = -2;
    this.dOne[i] = 0;
    this.nDocs = i + 1;
    return i;
  }

  private addChild(level: i32, d: i32): void {
    if (this.dLast[level] < 0) {
      this.dFirst[level] = d;
    } else {
      this.dNext[this.dLast[level]] = d;
    }
    this.dLast[level] = d;
  }

  private push(level: i32): void {
    if (this.nStack >= toI32(this.stack.length)) {
      this.stack = growI32(this.stack, this.nStack * 2 + 16);
    }
    this.stack[this.nStack] = level;
    this.nStack = this.nStack + 1;
  }

  /** Builds the doc tree from the final ops; answers the root level. */
  buildDoc(): i32 {
    this.nDocs = 0;
    this.nStack = 0;
    const base = this.newDoc(K_LEVEL, this.constIndent(0), 0, 0, 0);
    this.push(base);
    this.appendLevel = base;
    for (let i = 0; i < this.nFin; i++) {
      const kind = this.fKind[i];
      if (kind === K_OPEN) {
        this.push(this.newDoc(K_LEVEL, this.fA[i], 0, 0, 0));
      } else if (kind === K_CLOSE) {
        this.nStack = this.nStack - 1;
        const top = this.stack[this.nStack];
        this.addChild(this.stack[this.nStack - 1], top);
      } else if (kind === K_FENCE) {
        continue;
      } else if (kind === K_BREAK) {
        this.appendLevel = this.stack[this.nStack - 1];
        this.addChild(this.appendLevel, this.newDoc(K_BREAK, this.fA[i], this.fB[i], this.fC[i], this.fD[i]));
      } else {
        this.addChild(this.appendLevel, this.newDoc(kind, this.fA[i], this.fB[i], this.fC[i], this.fD[i]));
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
    const w0 = this.dW[d];
    if (w0 >= 0) {
      return w0;
    }
    let w = 0;
    const kind = this.dKind[d];
    if (kind === K_LEVEL) {
      for (let c = this.dFirst[d]; c >= 0; c = this.dNext[c]) {
        w += this.width(c);
        if (w >= MAX_LINE_WIDTH) {
          w = MAX_LINE_WIDTH;
          break;
        }
      }
    } else if (kind === K_TOKEN) {
      const t = this.inp.kTok[this.dA[d]];
      w = this.inp.containsBreak(t) ? MAX_LINE_WIDTH : this.inp.tokWidth(t);
    } else if (kind === K_SPACE) {
      w = 1;
    } else if (kind === K_BREAK) {
      w = this.dA[d] === FORCED ? MAX_LINE_WIDTH : strUtf16Len(this.flats[this.dB[d]]);
    } else {
      w = this.tokWidthOf(this.dA[d]);
    }
    this.dW[d] = w;
    return w;
  }

  /** Doc.Tok.computeWidth. */
  private tokWidthOf(t: i32): i32 {
    const inp = this.inp;
    const f = inp.tFlags[t];
    const idx = this.firstBreak(t);
    if ((f & TF_COMMENT) !== 0) {
      if (idx > 0) {
        return idx;
      }
      if ((f & TF_LINE_COMMENT) !== 0 && !this.startsWithSlashSlashSpace(t)) {
        return inp.tokWidth(t) + 1;
      }
      const p = reformatParameterComment(inp, t);
      return p !== null ? strUtf16Len(p) : inp.tokWidth(t);
    }
    return idx !== -1 ? MAX_LINE_WIDTH : inp.tokWidth(t);
  }

  /** Newlines.firstBreak: the offset (in characters) of the second line, or -1. */
  private firstBreak(t: i32): i32 {
    const inp = this.inp;
    const a = inp.tPos[t];
    const e = inp.tEnd[t];
    for (let i = a; i < e; i++) {
      const c = toI32(inp.src[i]);
      if (c === 10) {
        return inp.width(a, i + 1);
      }
      if (c === 13) {
        if (i + 1 < e && toI32(inp.src[i + 1]) === 10) {
          return inp.width(a, i + 2);
        }
        return inp.width(a, i + 1);
      }
    }
    return -1;
  }

  private startsWithSlashSlashSpace(t: i32): boolean {
    const inp = this.inp;
    const a = inp.tPos[t];
    return inp.tEnd[t] - a >= 3 && toI32(inp.src[a + 2]) === 32;
  }

  /** Doc.computeBreaks from column `col` at indent `indent`; answers the new column. */
  computeBreaks(d: i32, indent: i32, col: i32): i32 {
    const kind = this.dKind[d];
    if (kind === K_LEVEL) {
      const w = this.width(d);
      if (col + w <= this.maxWidth) {
        this.dOne[d] = 1;
        return col + w;
      }
      this.dOne[d] = 0;
      return this.computeBroken(d, indent + this.evalIndent(this.dA[d]), col);
    }
    if (kind === K_TOK) {
      const text = this.rewrite(this, this.dA[d], this.maxWidth, col);
      this.dText[d] = text;
      // The width of the text's last line.
      let last = 0;
      const n = toI32(text.length);
      for (let i = 0; i < n; i++) {
        const c = text.charCodeAt(i);
        if (c === 10) {
          last = i + 1;
        } else if (c === 13) {
          if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
            i++;
          }
          last = i + 1;
        }
      }
      return col + strUtf16Len(text.substring(last, n));
    }
    if (kind === K_TOKEN) {
      const t = this.inp.kTok[this.dA[d]];
      return col + (this.inp.containsBreak(t) ? MAX_LINE_WIDTH : this.inp.tokWidth(t));
    }
    if (kind === K_SPACE) {
      return col + 1;
    }
    this.fail("computeBreaks on a break");
    return col;
  }

  private computeBroken(level: i32, indent: i32, col0: i32): i32 {
    let col = col0;
    let must = false;
    let c = this.dFirst[level];
    let first = true;
    const max = this.maxWidth;
    while (first || c >= 0) {
      let brk = -1;
      if (!first) {
        brk = c;
        c = this.dNext[c];
      }
      first = false;
      // The split: docs up to the next break.
      let splitWidth = 0;
      let e = c;
      while (e >= 0 && this.dKind[e] !== K_BREAK) {
        splitWidth += this.width(e);
        if (splitWidth >= MAX_LINE_WIDTH) {
          splitWidth = MAX_LINE_WIDTH;
        }
        e = this.dNext[e];
      }
      if (splitWidth > MAX_LINE_WIDTH) {
        splitWidth = MAX_LINE_WIDTH;
      }
      if (brk >= 0) {
        const bw = this.width(brk);
        const shouldBreak = this.dA[brk] === UNIFIED || must || col + bw + splitWidth > max;
        col = this.breakAt(brk, col, indent, shouldBreak);
      }
      const enoughRoom = col + splitWidth <= max;
      while (c !== e) {
        col = this.computeBreaks(c, indent, col);
        c = this.dNext[c];
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
    const tag = this.dD[b];
    if (tag >= 0) {
      this.tagTaken[tag] = broken ? 1 : 0;
    }
    if (broken) {
      this.dOne[b] = 1;
      let ni = lastIndent + this.evalIndent(this.dC[b]);
      if (ni < 0) {
        ni = 0;
      }
      this.dIndent[b] = ni;
      return ni;
    }
    this.dOne[b] = 0;
    this.dIndent[b] = -1;
    return col + strUtf16Len(this.flats[this.dB[b]]);
  }

  /** Doc.range: the tok numbers a doc covers, [lo, hi); lo -1 when empty. */
  private range(d: i32): void {
    if (this.dLo[d] !== -2) {
      return;
    }
    const kind = this.dKind[d];
    let lo = -1;
    let hi = -1;
    if (kind === K_LEVEL) {
      for (let c = this.dFirst[d]; c >= 0; c = this.dNext[c]) {
        this.range(c);
        if (this.dLo[c] >= 0) {
          if (lo < 0 || this.dLo[c] < lo) {
            lo = this.dLo[c];
          }
          if (this.dHi[c] > hi) {
            hi = this.dHi[c];
          }
        }
      }
    } else if (kind === K_TOKEN) {
      lo = this.inp.tIdx[this.inp.kTok[this.dA[d]]];
      hi = lo + 1;
    } else if (kind === K_TOK) {
      lo = this.inp.tIdx[this.dA[d]];
      hi = lo + 1;
    }
    this.dLo[d] = lo;
    this.dHi[d] = hi;
  }

  /** Doc.getFlat into the scratch buffer. */
  private flat(d: i32): void {
    const kind = this.dKind[d];
    const s = this.scratch;
    if (kind === K_LEVEL) {
      for (let c = this.dFirst[d]; c >= 0; c = this.dNext[c]) {
        this.flat(c);
      }
    } else if (kind === K_TOKEN) {
      const t = this.inp.kTok[this.dA[d]];
      s.range(this.inp.src, this.inp.tPos[t], this.inp.tEnd[t]);
    } else if (kind === K_SPACE) {
      s.byte(32);
    } else if (kind === K_BREAK) {
      s.str(this.flats[this.dB[d]]);
    } else {
      s.str(this.tokFlat(this.dA[d]));
    }
  }

  /** Doc.Tok.computeFlat. */
  private tokFlat(t: i32): string {
    const inp = this.inp;
    if ((inp.tFlags[t] & TF_LINE_COMMENT) !== 0 && !this.startsWithSlashSlashSpace(t)) {
      return `// ${String.fromBytes(inp.src, inp.tPos[t] + 2, inp.tEnd[t])}`;
    }
    const p = reformatParameterComment(inp, t);
    return p !== null ? p : inp.text(t);
  }

  /** Doc.write. */
  write(d: i32): void {
    const kind = this.dKind[d];
    if (kind === K_LEVEL) {
      if (this.dOne[d] === 1) {
        this.range(d);
        this.scratch.n = 0;
        this.flat(d);
        this.append(this.scratch.buf, 0, this.scratch.n, this.dLo[d], this.dHi[d]);
      } else {
        for (let c = this.dFirst[d]; c >= 0; c = this.dNext[c]) {
          this.write(c);
        }
      }
    } else if (kind === K_TOKEN) {
      const t = this.inp.kTok[this.dA[d]];
      const k = this.inp.tIdx[t];
      if ((this.inp.tFlags[t] & TF_TOMB) !== 0) {
        // The last space before each newline goes out as U+0003, which
        // survives the trailing-space trim and becomes a space again later.
        const a = this.inp.tPos[t];
        const e = this.inp.tEnd[t];
        const tmp = new Array<u8>(e - a);
        for (let i = a; i < e; i++) {
          const c = toI32(this.inp.src[i]);
          tmp[i - a] = c === 32 && i + 1 < e && toI32(this.inp.src[i + 1]) === 10 ? toU8(3) : toU8(c);
        }
        this.append(tmp, 0, e - a, k, k + 1);
      } else {
        this.append(this.inp.src, this.inp.tPos[t], this.inp.tEnd[t], k, k + 1);
      }
    } else if (kind === K_SPACE) {
      this.appendStr(" ", -1, -1);
    } else if (kind === K_BREAK) {
      if (this.dOne[d] === 1) {
        this.appendStr("\n", -1, -1);
        this.indent(this.dIndent[d]);
      } else {
        this.appendStr(this.flats[this.dB[d]], -1, -1);
      }
    } else {
      const k = this.inp.tIdx[this.dA[d]];
      this.appendStr(this.dText[d], k, k + 1);
    }
  }

  // ---- JavaOutput ------------------------------------------------------------

  private appendStr(s: string, lo: i32, hi: i32): void {
    const tmp = new Array<u8>(s.length);
    for (let i = 0; i < toI32(s.length); i++) {
      tmp[i] = toU8(s.charCodeAt(i));
    }
    this.append(tmp, 0, toI32(tmp.length), lo, hi);
  }

  indent(n: i32): void {
    for (let i = 0; i < n; i++) {
      this.pushSpace(32);
    }
  }

  private pushSpace(c: i32): void {
    if (this.nSpaces >= toI32(this.spaces.length)) {
      const nb = new Array<u8>(this.nSpaces * 2 + 16);
      nb.set(this.spaces);
      this.spaces = nb;
    }
    this.spaces[this.nSpaces] = toU8(c);
    this.nSpaces = this.nSpaces + 1;
  }

  /** JavaOutput.append of `buf[a, b)` covering tok numbers [lo, hi). */
  append(buf: u8[], a: i32, b: i32, lo: i32, hi: i32): void {
    const inp = this.inp;
    if (lo >= 0) {
      let sawNewlines = false;
      const iN = inp.nLines;
      while (this.iLine < iN && (inp.lineLo[this.iLine] < 0 || inp.lineHi[this.iLine] <= lo)) {
        if (inp.lineLo[this.iLine] < 0) {
          sawNewlines = true;
        }
        this.iLine = this.iLine + 1;
      }
      const isComment = b - a >= 2 && toI32(buf[a]) === 47 && (toI32(buf[a + 1]) === 47 || toI32(buf[a + 1]) === 42);
      const w = this.wanted(this.lastK);
      if ((sawNewlines && isComment) || w === 1 || (w === -1 && sawNewlines)) {
        this.newlinesPending = this.newlinesPending + 1;
      }
    }
    const len = b - a;
    const isNewline =
      (len === 1 && (toI32(buf[a]) === 10 || toI32(buf[a]) === 13)) ||
      (len === 2 && toI32(buf[a]) === 13 && toI32(buf[a + 1]) === 10);
    if (isNewline) {
      if (this.newlinesPending === 0) {
        this.newlinesPending = 1;
      }
      this.nSpaces = 0;
    } else {
      const out = this.out;
      let rangesSet = false;
      let i = a;
      while (i < b) {
        const c = toI32(buf[i]);
        if (c === 32 || c === 9) {
          this.pushSpace(c);
          i++;
        } else if (c === 13 || c === 10) {
          if (c === 13 && i + 1 < b && toI32(buf[i + 1]) === 10) {
            i++;
          }
          this.nSpaces = 0;
          this.newlinesPending = this.newlinesPending + 1;
          i++;
        } else {
          while (this.newlinesPending > 0) {
            if (this.nOutLines > 0 || out.n > this.lineStart) {
              out.byte(10);
              this.nOutLines = this.nOutLines + 1;
              this.lineStart = out.n;
            }
            rangesSet = false;
            this.newlinesPending = this.newlinesPending - 1;
          }
          if (this.partial && lo >= 0 && !rangesSet) {
            this.addLineRange(this.nOutLines, lo, hi);
            rangesSet = true;
          }
          if (this.nSpaces > 0) {
            out.range(this.spaces, 0, this.nSpaces);
            this.nSpaces = 0;
          }
          // The run of other characters goes out at once.
          let j = i + 1;
          while (j < b) {
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

  /** JavaOutput.flush, then the replacement's line separators: every line ends in "\n". */
  flush(): void {
    const out = this.out;
    let blank = true;
    for (let i = this.lineStart; i < out.n; i++) {
      const c = toI32(out.buf[i]);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 11) {
        blank = false;
        break;
      }
    }
    if (!blank) {
      out.byte(10);
      this.nOutLines = this.nOutLines + 1;
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
      this.addLineRange(eofLine, this.inp.kN, this.inp.kN + 1);
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

/** CommentsHelper.reformatParameterComment: `/* name = *\/` as `/* name= *\/`, else null. */
export const reformatParameterComment = (inp: GInput, t: i32): string | null => {
  if ((inp.tFlags[t] & TF_BLOCK_COMMENT) === 0) {
    return null;
  }
  const src = inp.src;
  let i = inp.tPos[t] + 2;
  const e = inp.tEnd[t] - 2;
  if (e < i || toI32(src[e]) !== 42) {
    return null;
  }
  while (i < e && gIsWs(toI32(src[i]))) {
    i++;
  }
  const ns = i;
  if (i >= e || !gIsIdentStart(toI32(src[i]))) {
    return null;
  }
  i++;
  while (i < e && gIsIdentPart(toI32(src[i]))) {
    i++;
  }
  if (i + 3 <= e && toI32(src[i]) === 46 && toI32(src[i + 1]) === 46 && toI32(src[i + 2]) === 46) {
    i += 3;
  }
  const ne = i;
  while (i < e && gIsWs(toI32(src[i]))) {
    i++;
  }
  if (i >= e || toI32(src[i]) !== 61) {
    return null;
  }
  i++;
  while (i < e && gIsWs(toI32(src[i]))) {
    i++;
  }
  if (i !== e) {
    return null;
  }
  return `/* ${String.fromBytes(src, ns, ne)}= */`;
};

const gIsWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/** Character.isJavaIdentifierStart for ASCII; any non-ASCII byte counts. */
export const gIsIdentStart = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;

export const gIsIdentPart = (c: i32): boolean => gIsIdentStart(c) || (c >= 48 && c <= 57);
