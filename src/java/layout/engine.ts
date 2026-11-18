// google-java-format 2.0.0's layout engine, which formats Java (ktfmt still
// runs on the 1.x engine in src/gdoc/engine.ts): the visitor emits events
// (open, close, token, space, break, hug points, header marks, comment
// fences), `build` threads the comments in and turns the events into a tree
// of groups and choices, `solve` lays the tree out greedily in one pass, and
// the actions it records are replayed through JavaOutput's blank-line rules.
//
// Ported from google-java-format 2.0.0's layout.Doc, layout.Docs,
// layout.LayoutBuilder and layout.LayoutSolver, with the OpsBuilder, Indent,
// Output.BreakTag and JavaOutput parts they use (Apache License 2.0,
// Copyright 2015 and 2026 Google Inc.). The tree is kept in columns.

import { growI32, strUtf16Len } from "../../core/arr";
import { Out } from "../../core/out";
import {
  BL_COND,
  BL_NO,
  BL_NONE,
  BL_PRESERVE,
  BL_YES,
  FORCED,
  GEngine,
  INDEPENDENT,
  MAX_LINE_WIDTH,
  reformatParameterComment,
  UNIFIED,
} from "../../gdoc/engine";
import { GInput, TF_BLOCK_COMMENT, TF_COMMENT, TF_JAVADOC, TF_LINE_COMMENT, TF_NEWLINE } from "../../gdoc/input";

// Event kinds.
const K_OPEN: i32 = 1;
const K_CLOSE: i32 = 2;
const K_TOKEN: i32 = 3;
const K_SPACE: i32 = 4;
const K_BREAK: i32 = 5;
const K_TOK: i32 = 6;
const K_FENCE: i32 = 8;
const K_HUG: i32 = 9;
const K_HEADER: i32 = 10;

// Doc kinds.
const D_TEXT: i32 = 1; // an input token
const D_STR: i32 = 2; // a flat break's text
const D_MARK: i32 = 3; // a hug point's zero-width marker
const D_LINES: i32 = 4; // a text block, its lines indented to the line's indent
const D_TOK: i32 = 5; // a comment, or whitespace around an imaginary token
const D_SPACE: i32 = 6;
const D_HEADER: i32 = 7; // a = 0 start, 1 end
const D_BREAK: i32 = 8;
const D_GROUP: i32 = 9;
const D_CHOICE: i32 = 10;

// LayoutBuilder.HugRole.
const HUG_NONE: i32 = 0;
const HUG_HUGGABLE: i32 = 1;
const HUG_ARGUMENTS: i32 = 2;

// LayoutSolver actions.
const A_FLAT: i32 = 1; // a doc's flat text
const A_TOKTEXT: i32 = 2; // a rewritten comment
const A_LINE: i32 = 3; // a line of a text block
const A_NEWLINE: i32 = 4;
const A_INDENT: i32 = 5;

/** CommentsHelper.rewrite: the comment re-formatted for its column (src/java/comments.ts). */
export type JlRewriter = (g: GEngine, tok: i32, maxWidth: i32, column: i32) => string;

/** The default rewriter: the comment as written. */
const jlKeepComment = (g: GEngine, tok: i32, maxWidth: i32, column: i32): string => g.inp.text(tok);

export class JlEngine {
  inp: GInput;
  maxWidth: i32 = 100;
  rewrite: JlRewriter;
  // The comment rewriter takes the 1.x engine for its input; this one shares `inp`.
  commentsEngine: GEngine;
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

  // Events as the visitor emits them. Open: a indent, b hugged indent, c hug
  // role, d hug point, e fallbackIfFlatOnNextLine. Token: a token, b real,
  // c comments-before indent, d trailing-comment indent, e text block lines.
  nOps: i32 = 0;
  oKind: i32[];
  oA: i32[];
  oB: i32[];
  oC: i32[];
  oD: i32[];
  oE: i32[];
  depth: i32 = 0;
  tokenI: i32 = 0;
  inputPosition: i32 = -2147483647;
  nHugPoints: i32 = 0;

  // Text blocks: lines `lnStart[id]` .. + `lnCount[id]` of `lnText`.
  lnText: string[];
  lnStart: i32[];
  lnCount: i32[];
  nLines: i32 = 0;

  // Comment events `build` inserts: key (insert before event `key`), event.
  nExtra: i32 = 0;
  xKey: i32[];
  xKind: i32[];
  xA: i32[];
  xB: i32[];
  xC: i32[];
  xD: i32[];

  // Final events.
  nFin: i32 = 0;
  fKind: i32[];
  fA: i32[];
  fB: i32[];
  fC: i32[];
  fD: i32[];
  fE: i32[];

  // Levels under construction (LayoutBuilder.LevelBuilder), with their items
  // in a list: a doc, or a nested level.
  nLv: i32 = 0;
  lvInd: i32[];
  lvHugInd: i32[];
  lvRole: i32[];
  lvHugPt: i32[];
  lvFb: i32[];
  lvFirst: i32[];
  lvLast: i32[];
  nItems: i32 = 0;
  itLevel: i32[]; // 1 a level, 0 a doc
  itRef: i32[];
  itNext: i32[];
  stack: i32[];
  nStack: i32 = 0;
  hugMark: i32[]; // hug point -> its marker doc

  // Docs. Text: a token; str: a flat id; mark: a hug point; lines: a token,
  // b lines; tok: a tok; header: a 0/1; break: a mode, b flat, c indent,
  // d tag; group: a indent, kids; choice: a preferred, b prefix width,
  // c fallback, d fallbackIfFlatOnNextLine.
  nDocs: i32 = 0;
  dKind: i32[];
  dA: i32[];
  dB: i32[];
  dC: i32[];
  dD: i32[];
  dW: i32[];
  dLo: i32[]; // range of tok numbers [lo, hi), lo -1 when empty
  dHi: i32[];
  dKid: i32[];
  dKidN: i32[];
  kids: i32[];
  nKids: i32 = 0;

  // LayoutSolver.
  nAc: i32 = 0;
  acKind: i32[];
  acA: i32[];
  acB: i32[];
  acText: string[];
  firstLineEnded: boolean = false;
  firstLineEndColumn: i32 = 0;
  lineIndent: i32 = 0;
  headerIndents: i32[];
  nHeader: i32 = 0;
  // Trial layouts: the tags each one changed, with their earlier values.
  nTrials: i32 = 0;
  trialMark: i32[];
  nSaved: i32 = 0;
  savedTag: i32[];
  savedVal: i32[];

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
  // StringWrapper re-formats ranges): LayoutBuilder's region boundaries as
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

  constructor(inp: GInput, commentsEngine: GEngine) {
    this.inp = inp;
    this.commentsEngine = commentsEngine;
    this.rewrite = jlKeepComment;
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
    this.oE = new Array<i32>(256);
    this.lnText = [];
    this.lnStart = new Array<i32>(16);
    this.lnCount = new Array<i32>(16);
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
    this.fE = new Array<i32>(256);
    this.lvInd = new Array<i32>(64);
    this.lvHugInd = new Array<i32>(64);
    this.lvRole = new Array<i32>(64);
    this.lvHugPt = new Array<i32>(64);
    this.lvFb = new Array<i32>(64);
    this.lvFirst = new Array<i32>(64);
    this.lvLast = new Array<i32>(64);
    this.itLevel = new Array<i32>(256);
    this.itRef = new Array<i32>(256);
    this.itNext = new Array<i32>(256);
    this.stack = new Array<i32>(64);
    this.hugMark = new Array<i32>(16);
    this.dKind = new Array<i32>(256);
    this.dA = new Array<i32>(256);
    this.dB = new Array<i32>(256);
    this.dC = new Array<i32>(256);
    this.dD = new Array<i32>(256);
    this.dW = new Array<i32>(256);
    this.dLo = new Array<i32>(256);
    this.dHi = new Array<i32>(256);
    this.dKid = new Array<i32>(256);
    this.dKidN = new Array<i32>(256);
    this.kids = new Array<i32>(256);
    this.acKind = new Array<i32>(256);
    this.acA = new Array<i32>(256);
    this.acB = new Array<i32>(256);
    this.acText = [];
    this.headerIndents = new Array<i32>(16);
    this.trialMark = new Array<i32>(16);
    this.savedTag = new Array<i32>(16);
    this.savedVal = new Array<i32>(16);
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
    this.commentsEngine.failed = false;
    this.commentsEngine.failure = "";
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
    this.nHugPoints = 0;
    this.lnText = [];
    this.nLines = 0;
    this.nExtra = 0;
    this.nFin = 0;
    this.nLv = 0;
    this.nItems = 0;
    this.nStack = 0;
    this.nDocs = 0;
    this.nKids = 0;
    this.nAc = 0;
    this.firstLineEnded = false;
    this.lineIndent = 0;
    this.nHeader = 0;
    this.nTrials = 0;
    this.nSaved = 0;
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

  flatId(s: string): i32 {
    for (let i = 0; i < toI32(this.flats.length); i++) {
      if (this.flats[i] === s) {
        return i;
      }
    }
    this.flats.push(s);
    return toI32(this.flats.length) - 1;
  }

  // ---- LayoutBuilder (adapted from OpsBuilder) -----------------------------

  private addOp(kind: i32, a: i32, b: i32, c: i32, d: i32, e: i32 = -1): void {
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
      this.oE = growI32(this.oE, cap);
    }
    this.oKind[i] = kind;
    this.oA[i] = a;
    this.oB[i] = b;
    this.oC[i] = c;
    this.oD[i] = d;
    this.oE[i] = e;
    this.nOps = i + 1;
  }

  open(plusIndent: i32): void {
    this.addOp(K_OPEN, plusIndent, 0, HUG_NONE, -1, 1);
  }

  /**
   * LayoutBuilder.openHuggable: a level for an argument list whose argument
   * may be hugged (`f(x -> { ... })`). Its direct breaks, and those of a
   * nested openHuggedArguments level, are the ones not taken when hugging;
   * the hugged content is indented from the call's line by `huggedPlusIndent`.
   */
  openHuggable(plusIndent: i32, huggedPlusIndent: i32, hugPoint: i32, fallbackIfFlatOnNextLine: boolean): void {
    this.addOp(K_OPEN, plusIndent, huggedPlusIndent, HUG_HUGGABLE, hugPoint, fallbackIfFlatOnNextLine ? 1 : 0);
  }

  /** LayoutBuilder.openHuggedArguments: the level holding a huggable level's arguments. */
  openHuggedArguments(): void {
    this.addOp(K_OPEN, 0, 0, HUG_ARGUMENTS, -1, 1);
  }

  /** LayoutBuilder.newHugPoint: the start of a body that can be hugged, such as a lambda's. */
  newHugPoint(): i32 {
    const h = this.nHugPoints;
    if (h >= toI32(this.hugMark.length)) {
      this.hugMark = growI32(this.hugMark, h * 2 + 16);
    }
    this.hugMark[h] = -1;
    this.nHugPoints = h + 1;
    return h;
  }

  /** LayoutBuilder.hugPoint: marks where `hugPoint` is. */
  hugPoint(hugPoint: i32): void {
    this.addOp(K_HUG, hugPoint, 0, 0, 0);
  }

  /** LayoutBuilder.headerStart: the start of a statement header followed by a body (an `if`'s condition). */
  headerStart(): void {
    this.addOp(K_HEADER, 0, 0, 0, 0);
  }

  headerEnd(): void {
    this.addOp(K_HEADER, 1, 0, 0, 0);
  }

  close(): void {
    this.addOp(K_CLOSE, 0, 0, 0, 0);
  }

  /** LayoutBuilder.fenceComments: keeps comments before the next tokens from moving out to enclosing groups. */
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

  /**
   * LayoutBuilder.multilineToken: the next input token, when its text is that
   * of tok `t`, written as `lines`, whose non-empty lines after the first are
   * indented to the indent of the line the token starts on (a text block).
   */
  multilineTokenLike(t: i32, lines: string[]): void {
    const p = this.peekTok(0);
    if (p >= 0 && this.inp.sameText(p, t)) {
      const id = this.nLines;
      if (id >= toI32(this.lnStart.length)) {
        this.lnStart = growI32(this.lnStart, id * 2 + 16);
        this.lnCount = growI32(this.lnCount, id * 2 + 16);
      }
      this.lnStart[id] = toI32(this.lnText.length);
      this.lnCount[id] = toI32(lines.length);
      for (const l of lines) {
        this.lnText.push(l);
      }
      this.nLines = id + 1;
      this.addOp(K_TOKEN, this.tokenI, 1, 0, -1, id);
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

  // ---- LayoutBuilder.build ---------------------------------------------------

  /**
   * LayoutBuilder.commentEvents and spliceEvents: the events with every
   * token's comments (and the whitespace around imaginary tokens) threaded
   * in, and spaces after forced breaks dropped.
   */
  private spliceComments(): void {
    const inp = this.inp;
    const opsN = this.nOps;
    for (let i = 0; i < opsN; i++) {
      if (this.oKind[i] !== K_TOKEN) {
        continue;
      }
      const k = this.oA[i];
      // Comments before a token go before the groups it opens, comments after
      // it after the groups it closes.
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
        // addToksBefore.
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
            const line = (f & TF_LINE_COMMENT) !== 0;
            this.addExtra(j, K_BREAK, line ? FORCED : UNIFIED, 0, this.oC[i], -1);
            this.addExtra(j, K_TOK, t, 0, 0, -1);
            if (line) {
              this.extraForced(j, 0);
            }
            space = (f & TF_BLOCK_COMMENT) !== 0;
            newlines = 0;
            lastWasComment = true;
            if ((f & TF_JAVADOC) !== 0) {
              this.extraForced(j, 0);
            }
            allowBlankAfterLastComment = line || ((f & TF_BLOCK_COMMENT) !== 0 && (f & TF_JAVADOC) === 0);
          }
        }
        if (allowBlankAfterLastComment && newlines > 1) {
          // A blank line after two newlines in a row following a line or block comment.
          this.blankLine(inp.tIdx[inp.kTok[k]], BL_YES, -1);
        }
        if (lastWasComment && newlines > 0) {
          this.extraForced(j, 0);
        } else if (space) {
          this.addExtra(j, K_SPACE, 0, 0, 0, -1);
        }
        // addToksAfter.
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
          this.addExtra(kk + 1, K_TOK, t, 0, 0, -1);
          // One forced break after a trailing `///` comment (both a line
          // comment and a doc comment), where OpsBuilder adds two.
          if (breakAfter || (f & TF_LINE_COMMENT) !== 0) {
            this.extraForced(kk + 1, 0);
          }
        }
      } else {
        // addImaginaryToks: an imaginary token's toks go out as they are.
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
          this.pushFin(kind, this.xA[x], this.xB[x], this.xC[x], this.xD[x], -1);
          afterForcedBreak = kind === K_BREAK && this.xA[x] === FORCED;
        }
        x++;
      }
      if (i === opsN) {
        break;
      }
      const kind = this.oKind[i];
      // isSpaceLike: a space, or a break with no extra indent that is a space when not taken.
      if (
        afterForcedBreak &&
        (kind === K_SPACE || (kind === K_BREAK && this.evalIndent(this.oC[i]) === 0 && this.oB[i] === 1))
      ) {
        continue;
      }
      this.pushFin(kind, this.oA[i], this.oB[i], this.oC[i], this.oD[i], this.oE[i]);
      // An open, a hug point, a comment fence or a header mark outputs
      // nothing, so it doesn't end the run after a forced break.
      if (kind !== K_OPEN && kind !== K_HUG && kind !== K_FENCE && kind !== K_HEADER) {
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

  private pushFin(kind: i32, a: i32, b: i32, c: i32, d: i32, e: i32): void {
    const i = this.nFin;
    if (i >= toI32(this.fKind.length)) {
      const cap = i * 2 + 16;
      this.fKind = growI32(this.fKind, cap);
      this.fA = growI32(this.fA, cap);
      this.fB = growI32(this.fB, cap);
      this.fC = growI32(this.fC, cap);
      this.fD = growI32(this.fD, cap);
      this.fE = growI32(this.fE, cap);
    }
    this.fKind[i] = kind;
    this.fA[i] = a;
    this.fB[i] = b;
    this.fC[i] = c;
    this.fD[i] = d;
    this.fE[i] = e;
    this.nFin = i + 1;
  }

  // ---- LayoutBuilder.buildTree -----------------------------------------------

  private newLevel(ind: i32, hugInd: i32, role: i32, hugPt: i32, fb: i32): i32 {
    const i = this.nLv;
    if (i >= toI32(this.lvInd.length)) {
      const cap = i * 2 + 16;
      this.lvInd = growI32(this.lvInd, cap);
      this.lvHugInd = growI32(this.lvHugInd, cap);
      this.lvRole = growI32(this.lvRole, cap);
      this.lvHugPt = growI32(this.lvHugPt, cap);
      this.lvFb = growI32(this.lvFb, cap);
      this.lvFirst = growI32(this.lvFirst, cap);
      this.lvLast = growI32(this.lvLast, cap);
    }
    this.lvInd[i] = ind;
    this.lvHugInd[i] = hugInd;
    this.lvRole[i] = role;
    this.lvHugPt[i] = hugPt;
    this.lvFb[i] = fb;
    this.lvFirst[i] = -1;
    this.lvLast[i] = -1;
    this.nLv = i + 1;
    return i;
  }

  private addItem(level: i32, isLevel: i32, ref: i32): void {
    const i = this.nItems;
    if (i >= toI32(this.itLevel.length)) {
      const cap = i * 2 + 16;
      this.itLevel = growI32(this.itLevel, cap);
      this.itRef = growI32(this.itRef, cap);
      this.itNext = growI32(this.itNext, cap);
    }
    this.itLevel[i] = isLevel;
    this.itRef[i] = ref;
    this.itNext[i] = -1;
    if (this.lvLast[level] < 0) {
      this.lvFirst[level] = i;
    } else {
      this.itNext[this.lvLast[level]] = i;
    }
    this.lvLast[level] = i;
    this.nItems = i + 1;
  }

  private pushLevel(level: i32): void {
    if (this.nStack >= toI32(this.stack.length)) {
      this.stack = growI32(this.stack, this.nStack * 2 + 16);
    }
    this.stack[this.nStack] = level;
    this.nStack = this.nStack + 1;
  }

  /**
   * LayoutBuilder.buildTree: the tree of groups from the final events. As in
   * DocBuilder, docs other than breaks go to the group of the most recent
   * break rather than to the innermost open one, so trailing text (the `;`
   * after a closed group) counts towards whether that group fits.
   */
  private buildTree(): i32 {
    this.nLv = 0;
    this.nItems = 0;
    this.nStack = 0;
    this.nDocs = 0;
    this.nKids = 0;
    const base = this.newLevel(0, 0, HUG_NONE, -1, 1);
    this.pushLevel(base);
    let appendLevel = base;
    for (let i = 0; i < this.nFin; i++) {
      const kind = this.fKind[i];
      if (kind === K_OPEN) {
        this.pushLevel(this.newLevel(this.fA[i], this.fB[i], this.fC[i], this.fD[i], this.fE[i]));
      } else if (kind === K_CLOSE) {
        this.nStack = this.nStack - 1;
        this.addItem(this.stack[this.nStack - 1], 1, this.stack[this.nStack]);
      } else if (kind === K_BREAK) {
        appendLevel = this.stack[this.nStack - 1];
        this.addItem(appendLevel, 0, this.newDoc(D_BREAK, this.fA[i], this.fB[i], this.fC[i], this.fD[i]));
      } else if (kind === K_TOKEN) {
        const k = this.fA[i];
        const d = this.fE[i] >= 0 ? this.newDoc(D_LINES, k, this.fE[i], 0, 0) : this.newDoc(D_TEXT, k, 0, 0, 0);
        this.addItem(appendLevel, 0, d);
      } else if (kind === K_TOK) {
        this.addItem(appendLevel, 0, this.newDoc(D_TOK, this.fA[i], 0, 0, 0));
      } else if (kind === K_HUG) {
        const hp = this.fA[i];
        const d = this.newDoc(D_MARK, hp, 0, 0, 0);
        this.hugMark[hp] = d;
        this.addItem(appendLevel, 0, d);
      } else if (kind === K_HEADER) {
        // Header marks go to the innermost open level, so that a header's
        // start and end are in one group, laid out or skipped together.
        this.addItem(this.stack[this.nStack - 1], 0, this.newDoc(D_HEADER, this.fA[i], 0, 0, 0));
      } else if (kind === K_SPACE) {
        this.addItem(appendLevel, 0, this.newDoc(D_SPACE, 0, 0, 0, 0));
      }
    }
    return this.buildLevel(base);
  }

  /** LevelBuilder.build. */
  private buildLevel(lv: i32): i32 {
    if (this.lvRole[lv] === HUG_HUGGABLE) {
      return this.buildHuggable(lv);
    }
    return this.newGroup(this.lvInd[lv], this.buildItems(lv));
  }

  /** LevelBuilder.buildItems. */
  private buildItems(lv: i32): i32[] {
    const docs: i32[] = [];
    for (let it = this.lvFirst[lv]; it >= 0; it = this.itNext[it]) {
      docs.push(this.itLevel[it] === 1 ? this.buildLevel(this.itRef[it]) : this.itRef[it]);
    }
    return docs;
  }

  /**
   * LevelBuilder.buildHuggable: a choice between hugging and the regular
   * layout. The hugged layout has the same content, with the breaks of this
   * level and of its arguments level as their flat text, and this level's
   * indent replaced by its hugged indent; everything up to the hug point must
   * fit on the current line.
   */
  private buildHuggable(lv: i32): i32 {
    const fallback: i32[] = [];
    const preferred: i32[] = [];
    let canHug = true;
    for (let it = this.lvFirst[lv]; it >= 0; it = this.itNext[it]) {
      const ref = this.itRef[it];
      let flattened: i32[] = [];
      let fallbackDoc = ref;
      if (this.itLevel[it] === 1 && this.lvRole[ref] === HUG_ARGUMENTS) {
        flattened = this.buildItems(ref);
        fallbackDoc = this.newGroup(this.lvInd[ref], flattened);
      } else {
        if (this.itLevel[it] === 1) {
          fallbackDoc = this.buildLevel(ref);
        }
        flattened.push(fallbackDoc);
      }
      fallback.push(fallbackDoc);
      for (const d of flattened) {
        if (this.dKind[d] === D_BREAK) {
          // Forced breaks (after line comments) must not be flattened.
          if (this.dA[d] === FORCED) {
            canHug = false;
          }
          preferred.push(this.newDoc(D_STR, this.dB[d], 0, 0, 0));
        } else {
          preferred.push(d);
        }
      }
    }
    const fallbackGroup = this.newGroup(this.lvInd[lv], fallback);
    const preferredGroup = this.newGroup(this.lvHugInd[lv], preferred);
    const hp = this.lvHugPt[lv];
    const marker = hp >= 0 ? this.hugMark[hp] : -1;
    const prefixWidth = canHug && marker >= 0 ? this.widthBefore(preferredGroup, marker) : -1;
    if (prefixWidth < 0) {
      return fallbackGroup;
    }
    return this.newDoc(D_CHOICE, preferredGroup, prefixWidth, fallbackGroup, this.lvFb[lv]);
  }

  /** The flat width of `d` before `marker`, or -1 when `d` doesn't hold it within MAX_LINE_WIDTH. */
  private widthBefore(d: i32, marker: i32): i32 {
    if (d === marker) {
      return 0;
    }
    const kind = this.dKind[d];
    if (kind === D_GROUP) {
      let width = 0;
      const a = this.dKid[d];
      const e = a + this.dKidN[d];
      for (let i = a; i < e; i++) {
        const c = this.kids[i];
        const before = this.widthBefore(c, marker);
        if (before >= 0) {
          return width + before < MAX_LINE_WIDTH ? width + before : MAX_LINE_WIDTH;
        }
        width += this.dW[c];
        if (width >= MAX_LINE_WIDTH) {
          return -1;
        }
      }
      return -1;
    }
    if (kind === D_CHOICE) {
      return this.widthBefore(this.dC[d], marker);
    }
    return -1;
  }

  // ---- Docs --------------------------------------------------------------------

  private newDoc(kind: i32, a: i32, b: i32, c: i32, d: i32): i32 {
    const i = this.nDocs;
    if (i >= toI32(this.dKind.length)) {
      const cap = i * 2 + 16;
      this.dKind = growI32(this.dKind, cap);
      this.dA = growI32(this.dA, cap);
      this.dB = growI32(this.dB, cap);
      this.dC = growI32(this.dC, cap);
      this.dD = growI32(this.dD, cap);
      this.dW = growI32(this.dW, cap);
      this.dLo = growI32(this.dLo, cap);
      this.dHi = growI32(this.dHi, cap);
      this.dKid = growI32(this.dKid, cap);
      this.dKidN = growI32(this.dKidN, cap);
    }
    this.dKind[i] = kind;
    this.dA[i] = a;
    this.dB[i] = b;
    this.dC[i] = c;
    this.dD[i] = d;
    this.dKid[i] = 0;
    this.dKidN[i] = 0;
    this.nDocs = i + 1;
    const inp = this.inp;
    let w = 0;
    let lo = -1;
    if (kind === D_TEXT) {
      const t = inp.kTok[a];
      w = inp.containsBreak(t) ? MAX_LINE_WIDTH : inp.tokWidth(t);
      lo = inp.tIdx[t];
    } else if (kind === D_STR) {
      w = strUtf16Len(this.flats[a]);
    } else if (kind === D_LINES) {
      w = MAX_LINE_WIDTH;
      lo = inp.tIdx[inp.kTok[a]];
    } else if (kind === D_TOK) {
      w = this.tokWidthOf(a);
      lo = inp.tIdx[a];
    } else if (kind === D_SPACE) {
      w = 1;
    } else if (kind === D_BREAK) {
      w = a === FORCED ? MAX_LINE_WIDTH : strUtf16Len(this.flats[b]);
    } else if (kind === D_CHOICE) {
      w = this.dW[c];
      lo = this.dLo[c];
      this.dHi[i] = this.dHi[c];
    }
    this.dW[i] = w;
    this.dLo[i] = lo;
    if (kind !== D_CHOICE) {
      this.dHi[i] = lo >= 0 ? lo + 1 : -1;
    }
    return i;
  }

  /** Doc.Group: its width (saturating at MAX_LINE_WIDTH) and range come from its children. */
  private newGroup(ind: i32, docs: i32[]): i32 {
    const g = this.newDoc(D_GROUP, ind, 0, 0, 0);
    const n = toI32(docs.length);
    if (this.nKids + n > toI32(this.kids.length)) {
      this.kids = growI32(this.kids, (this.nKids + n) * 2 + 16);
    }
    const a = this.nKids;
    let w = 0;
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < n; i++) {
      const d = docs[i];
      this.kids[a + i] = d;
      if (w < MAX_LINE_WIDTH) {
        w += this.dW[d];
        if (w >= MAX_LINE_WIDTH) {
          w = MAX_LINE_WIDTH;
        }
      }
      if (this.dLo[d] >= 0) {
        if (lo < 0 || this.dLo[d] < lo) {
          lo = this.dLo[d];
        }
        if (this.dHi[d] > hi) {
          hi = this.dHi[d];
        }
      }
    }
    this.nKids = a + n;
    this.dKid[g] = a;
    this.dKidN[g] = n;
    this.dW[g] = w;
    this.dLo[g] = lo;
    this.dHi[g] = hi;
    return g;
  }

  /** Doc.Tok.width: a comment's first line (to its second line's offset); other text with a newline never fits. */
  private tokWidthOf(t: i32): i32 {
    const inp = this.inp;
    const idx = this.firstBreak(t);
    if (idx === -1) {
      return strUtf16Len(this.tokFlat(t));
    }
    return (inp.tFlags[t] & TF_COMMENT) !== 0 ? idx : MAX_LINE_WIDTH;
  }

  /** Newlines.firstBreak over a tok: the offset (in characters) of its second line, or -1. */
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

  /** Doc.Tok.flat: a `//` comment gets a space after the slashes; `/* name = *\/` becomes `/* name= *\/`. */
  private tokFlat(t: i32): string {
    const inp = this.inp;
    const a = inp.tPos[t];
    if ((inp.tFlags[t] & TF_LINE_COMMENT) !== 0 && !(inp.tEnd[t] - a >= 3 && toI32(inp.src[a + 2]) === 32)) {
      return `// ${String.fromBytes(inp.src, a + 2, inp.tEnd[t])}`;
    }
    const p = reformatParameterComment(inp, t);
    return p !== null ? p : inp.text(t);
  }

  /** The total width of `kids[a, e)`, saturating at MAX_LINE_WIDTH. */
  private kidsWidth(a: i32, e: i32): i32 {
    let w = 0;
    for (let i = a; i < e; i++) {
      w += this.dW[this.kids[i]];
      if (w >= MAX_LINE_WIDTH) {
        return MAX_LINE_WIDTH;
      }
    }
    return w;
  }

  // ---- LayoutSolver ------------------------------------------------------------

  private addAction(kind: i32, a: i32, b: i32): void {
    const i = this.nAc;
    if (i >= toI32(this.acKind.length)) {
      const cap = i * 2 + 16;
      this.acKind = growI32(this.acKind, cap);
      this.acA = growI32(this.acA, cap);
      this.acB = growI32(this.acB, cap);
    }
    this.acKind[i] = kind;
    this.acA[i] = a;
    this.acB[i] = b;
    this.nAc = i + 1;
  }

  /** Records that the current line ends at `column`; in a trial layout, that ends the trial. */
  private endLine(column: i32): void {
    if (this.nTrials > 0) {
      this.firstLineEnded = true;
      this.firstLineEndColumn = column;
    }
  }

  private recordTag(tag: i32, taken: boolean): void {
    if (this.nTrials > 0) {
      const s = this.nSaved;
      if (s >= toI32(this.savedTag.length)) {
        this.savedTag = growI32(this.savedTag, s * 2 + 16);
        this.savedVal = growI32(this.savedVal, s * 2 + 16);
      }
      // SavedBreakTag keeps BreakTag.wasBreakTaken(), which reads an unset tag as not taken.
      this.savedTag[s] = tag;
      this.savedVal[s] = this.tagTaken[tag] === 1 ? 1 : 0;
      this.nSaved = s + 1;
    }
    this.tagTaken[tag] = taken ? 1 : 0;
  }

  /**
   * Solver.group: a group that fits is laid out flat, otherwise split at its
   * direct breaks, whose indent is `indent` plus the group's. Answers the
   * column after it.
   */
  private solveGroup(g: i32, indent: i32, col: i32): i32 {
    const w = this.dW[g];
    if (col + w <= this.maxWidth) {
      this.addAction(A_FLAT, g, 0);
      return col + w;
    }
    return this.broken(g, indent + this.evalIndent(this.dA[g]), col);
  }

  // The result of the last `segment`: its column, and whether it fit.
  segCol: i32 = 0;
  segFits: boolean = true;

  private broken(g: i32, indent: i32, col0: i32): i32 {
    let col = col0;
    let before = -1;
    let previousFits = true;
    const a = this.dKid[g];
    const e = a + this.dKidN[g];
    let segStart = a;
    for (let i = a; i < e; i++) {
      const d = this.kids[i];
      if (this.dKind[d] === D_BREAK) {
        this.segment(before, segStart, i, previousFits, indent, col);
        col = this.segCol;
        if (this.firstLineEnded) {
          return col;
        }
        previousFits = this.segFits;
        before = d;
        segStart = i + 1;
      }
    }
    this.segment(before, segStart, e, previousFits, indent, col);
    return this.segCol;
  }

  /**
   * Solver.segment: a break and the docs up to the next one. Unified and
   * forced breaks are taken whenever their group is broken; a fill break when
   * the segment doesn't fit, or the previous one didn't.
   */
  private segment(before: i32, a: i32, e: i32, previousFits: boolean, indent: i32, col0: i32): void {
    let col = col0;
    const segmentWidth = this.kidsWidth(a, e);
    if (before >= 0) {
      const taken =
        this.dA[before] !== INDEPENDENT || !previousFits || col + this.dW[before] + segmentWidth > this.maxWidth;
      col = this.breakAt(before, taken, indent, col);
      if (this.firstLineEnded) {
        this.segCol = col;
        this.segFits = true;
        return;
      }
    }
    const fits = col + segmentWidth <= this.maxWidth;
    for (let i = a; i < e; i++) {
      col = this.leaf(this.kids[i], indent, col);
      if (this.firstLineEnded) {
        break;
      }
    }
    this.segCol = col;
    this.segFits = fits;
  }

  /** Solver.breakOp. */
  private breakAt(b: i32, taken: boolean, indent: i32, col: i32): i32 {
    const tag = this.dD[b];
    if (tag >= 0) {
      this.recordTag(tag, taken);
    }
    if (taken) {
      this.endLine(col);
      if (this.firstLineEnded) {
        return col;
      }
      let ni = indent + this.evalIndent(this.dC[b]);
      if (ni < 0) {
        ni = 0;
      }
      this.lineIndent = ni;
      this.addAction(A_NEWLINE, 1, 0);
      this.addAction(A_INDENT, ni, 0);
      return ni;
    }
    this.addAction(A_FLAT, b, 0);
    return col + this.dW[b];
  }

  private leaf(d: i32, indent: i32, col: i32): i32 {
    const kind = this.dKind[d];
    if (kind === D_GROUP) {
      return this.solveGroup(d, indent, col);
    }
    if (kind === D_CHOICE) {
      return this.choice(d, indent, col);
    }
    if (kind === D_TEXT) {
      const t = this.inp.kTok[this.dA[d]];
      const nl = this.firstBreak(t);
      if (nl >= 0) {
        this.endLine(col + nl);
      }
      this.addAction(A_FLAT, d, 0);
      return col + this.dW[d];
    }
    if (kind === D_STR || kind === D_SPACE) {
      this.addAction(A_FLAT, d, 0);
      return col + this.dW[d];
    }
    if (kind === D_LINES) {
      const id = this.dB[d];
      const s = this.lnStart[id];
      const n = this.lnCount[id];
      this.endLine(col + strUtf16Len(this.lnText[s]));
      if (this.firstLineEnded) {
        return col;
      }
      const ind = this.lineIndent;
      this.addAction(A_LINE, s, d);
      let newlines = 0;
      for (let i = 1; i < n; i++) {
        newlines++;
        if (this.lnText[s + i].length === 0) {
          continue;
        }
        this.addAction(A_NEWLINE, newlines, 0);
        newlines = 0;
        if (ind > 0) {
          this.addAction(A_INDENT, ind, 0);
        }
        this.addAction(A_LINE, s + i, d);
      }
      if (newlines > 0) {
        this.addAction(A_NEWLINE, newlines, 0);
      }
      return col + MAX_LINE_WIDTH;
    }
    if (kind === D_HEADER) {
      if (this.dA[d] === 0) {
        if (this.nHeader >= toI32(this.headerIndents.length)) {
          this.headerIndents = growI32(this.headerIndents, this.nHeader * 2 + 16);
        }
        this.headerIndents[this.nHeader] = this.lineIndent;
        this.nHeader = this.nHeader + 1;
      } else if (this.nHeader > 0) {
        this.nHeader = this.nHeader - 1;
      }
      return col;
    }
    if (kind === D_TOK) {
      const text = this.rewrite(this.commentsEngine, this.dA[d], this.maxWidth, col);
      // The rewriter reports a comment it cannot format on the engine it was given.
      if (this.commentsEngine.failed) {
        this.fail(this.commentsEngine.failure);
      }
      const nl = jlFirstBreak(text);
      if (nl >= 0) {
        this.endLine(col + nl);
      }
      const i = this.nAc;
      while (toI32(this.acText.length) <= i) {
        this.acText.push("");
      }
      this.acText[i] = text;
      this.addAction(A_TOKTEXT, i, d);
      return col + jlLastLineWidth(text);
    }
    if (kind === D_MARK) {
      return col;
    }
    this.fail("layout reached a break outside its group");
    return col;
  }

  /**
   * Solver.choice. When the content doesn't fit flat, the fallback is used if
   * taking its one direct break lets the rest fit flat on the next line
   * (`f(\n x -> g(x))` rather than breaking inside the lambda); otherwise the
   * preferred layout is used when its prefix fits on the current line, its
   * first line fits and holds the whole prefix, and the line isn't the first
   * of a statement header. The preferred layout is indented from the current
   * line's indent, so a hugged lambda's body is indented from the call's line.
   */
  private choice(c: i32, indent: i32, col: i32): i32 {
    const w = this.dW[c];
    if (col + w <= this.maxWidth) {
      this.addAction(A_FLAT, c, 0);
      return col + w;
    }
    const preferred = this.dA[c];
    const fallback = this.dC[c];
    if (this.dD[c] === 1 && this.fallbackFitsOnNextLine(fallback, indent, col)) {
      return this.solveGroup(fallback, indent, col);
    }
    const prefixEnd = col + this.dB[c];
    const onHeaderLine = this.nHeader > 0 && this.headerIndents[this.nHeader - 1] === this.lineIndent;
    if (prefixEnd <= this.maxWidth && !onHeaderLine) {
      const lineIndent = this.lineIndent;
      const firstLineEnd = this.firstLineEnd(preferred, lineIndent, col);
      if (prefixEnd <= firstLineEnd && firstLineEnd <= this.maxWidth) {
        if (this.nTrials > 0 && this.trialLineEnded) {
          // The enclosing trial ends where this one did; laying the preferred
          // layout out again would only find that column again.
          this.endLine(firstLineEnd);
          return col;
        }
        return this.solveGroup(preferred, lineIndent, col);
      }
    }
    return this.solveGroup(fallback, indent, col);
  }

  /** Whether `fallback` can take its one direct break and fit everything after it flat on the next line. */
  private fallbackFitsOnNextLine(fallback: i32, indent: i32, col: i32): boolean {
    const a = this.dKid[fallback];
    const e = a + this.dKidN[fallback];
    let breakIndex = -1;
    for (let i = a; i < e; i++) {
      if (this.dKind[this.kids[i]] === D_BREAK) {
        if (breakIndex !== -1) {
          return false;
        }
        breakIndex = i;
      }
    }
    if (breakIndex === -1 || col + this.kidsWidth(a, breakIndex) > this.maxWidth) {
      return false;
    }
    let ni = indent + this.evalIndent(this.dA[fallback]) + this.evalIndent(this.dC[this.kids[breakIndex]]);
    if (ni < 0) {
      ni = 0;
    }
    return ni + this.kidsWidth(breakIndex + 1, e) <= this.maxWidth;
  }

  // Whether the last trial's first line ended before the end of its layout.
  trialLineEnded: boolean = false;

  /**
   * Solver.firstLineEnd: lays `g` out provisionally, up to the end of its
   * first line, and answers the column that line ends at. The trial's actions
   * and break tags are discarded.
   */
  private firstLineEnd(g: i32, indent: i32, col: i32): i32 {
    const mark = this.nAc;
    const savedLineIndent = this.lineIndent;
    const savedHeaders = this.headerIndents.slice(0, this.nHeader);
    const savedNHeader = this.nHeader;
    if (this.nTrials >= toI32(this.trialMark.length)) {
      this.trialMark = growI32(this.trialMark, this.nTrials * 2 + 16);
    }
    this.trialMark[this.nTrials] = this.nSaved;
    this.nTrials = this.nTrials + 1;
    const end = this.solveGroup(g, indent, col);
    const ended = this.firstLineEnded;
    const column = ended ? this.firstLineEndColumn : end;
    this.firstLineEnded = false;
    this.lineIndent = savedLineIndent;
    for (let i = 0; i < savedNHeader; i++) {
      this.headerIndents[i] = savedHeaders[i];
    }
    this.nHeader = savedNHeader;
    this.nAc = mark;
    this.nTrials = this.nTrials - 1;
    const from = this.trialMark[this.nTrials];
    for (let s = this.nSaved - 1; s >= from; s--) {
      this.tagTaken[this.savedTag[s]] = this.savedVal[s];
    }
    this.nSaved = from;
    this.trialLineEnded = ended;
    return column;
  }

  /** Replays the actions to JavaOutput. */
  private replay(): void {
    const inp = this.inp;
    for (let i = 0; i < this.nAc; i++) {
      const kind = this.acKind[i];
      if (kind === A_FLAT) {
        const d = this.acA[i];
        const dk = this.dKind[d];
        if (dk === D_TEXT) {
          const t = inp.kTok[this.dA[d]];
          this.append(inp.src, inp.tPos[t], inp.tEnd[t], this.dLo[d], this.dHi[d]);
        } else {
          this.scratch.n = 0;
          this.flat(d);
          this.append(this.scratch.buf, 0, this.scratch.n, this.dLo[d], this.dHi[d]);
        }
      } else if (kind === A_TOKTEXT) {
        const d = this.acB[i];
        this.appendStr(this.acText[this.acA[i]], this.dLo[d], this.dHi[d]);
      } else if (kind === A_LINE) {
        const d = this.acB[i];
        this.appendStr(this.lnText[this.acA[i]], this.dLo[d], this.dHi[d]);
      } else if (kind === A_NEWLINE) {
        const n = this.acA[i];
        if (n === 1) {
          this.appendStr("\n", -1, -1);
        } else {
          this.scratch.n = 0;
          for (let q = 0; q < n; q++) {
            this.scratch.byte(10);
          }
          this.append(this.scratch.buf, 0, n, -1, -1);
        }
      } else {
        this.indent(this.acA[i]);
      }
    }
  }

  /** Doc.appendFlat into the scratch buffer. */
  private flat(d: i32): void {
    const kind = this.dKind[d];
    const s = this.scratch;
    if (kind === D_GROUP) {
      const a = this.dKid[d];
      const e = a + this.dKidN[d];
      for (let i = a; i < e; i++) {
        this.flat(this.kids[i]);
      }
    } else if (kind === D_CHOICE) {
      this.flat(this.dC[d]);
    } else if (kind === D_TEXT) {
      const t = this.inp.kTok[this.dA[d]];
      s.range(this.inp.src, this.inp.tPos[t], this.inp.tEnd[t]);
    } else if (kind === D_STR) {
      s.str(this.flats[this.dA[d]]);
    } else if (kind === D_SPACE) {
      s.byte(32);
    } else if (kind === D_BREAK) {
      s.str(this.flats[this.dB[d]]);
    } else if (kind === D_TOK) {
      s.str(this.tokFlat(this.dA[d]));
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

  /** Lays out the events the visitor emitted and writes the result into `out`. */
  layout(): boolean {
    if (this.failed) {
      return false;
    }
    this.markForPartialFormat();
    this.spliceComments();
    const root = this.buildTree();
    this.nAc = 0;
    this.firstLineEnded = false;
    this.lineIndent = 0;
    this.nHeader = 0;
    this.nTrials = 0;
    this.nSaved = 0;
    this.solveGroup(root, 0, 0);
    this.replay();
    this.flush();
    return !this.failed;
  }
}

/** Newlines.firstBreak: the offset (in UTF-16 units) of the second line of `s`, or -1. */
const jlFirstBreak = (s: string): i32 => {
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) {
      return strUtf16Len(s.substring(0, i + 1));
    }
    if (c === 13) {
      return strUtf16Len(s.substring(0, i + 1 < n && s.charCodeAt(i + 1) === 10 ? i + 2 : i + 1));
    }
  }
  return -1;
};

/** The width of the last line of `s` (from Newlines.lastLineStart). */
const jlLastLineWidth = (s: string): i32 => {
  const n = toI32(s.length);
  for (let i = n - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c === 10 || c === 13) {
      return strUtf16Len(s.substring(i + 1, n));
    }
  }
  return strUtf16Len(s);
};
