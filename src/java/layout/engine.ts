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

import { atI32, atU8, bytesText, growI32, newI32s, sliceI32s, strUtf16Len } from "../../core/arr";
import { fault, faulted } from "../../core/fault";
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

/** A column's next capacity, `i * 2 + 16`; past the largest that fits, where that sum overflowed, a fault and 0. */
const jlCap = (i: i32): i32 => {
  if (i >= 0 && i <= 1073741815) {
    return i * 2 + 16;
  }
  fault();
  return 0;
};

/** `a + b`, or a fault and 0 where the sum leaves i32 (and `+` panicked). */
const jlAdd = (a: i32, b: i32): i32 => {
  const r = toI64(a) + toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `x + 1`, or a fault and 0 at the top of i32. */
const jlInc = (x: i32): i32 => {
  if (x < 2147483647) {
    return x + 1;
  }
  fault();
  return 0;
};

/** `x - 1`, or a fault and 0 at the bottom of i32. */
const jlDec = (x: i32): i32 => {
  const r = toI64(x) - toI64(1);
  if (r >= toI64(-2147483648)) {
    return toI32(r);
  }
  fault();
  return 0;
};

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
    const constCache = this.constCache;
    if (constCache.length < 513) {
      fault();
    }
    for (let i = 0; i < 513 && i < constCache.length; i++) {
      constCache[i] = -1;
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
    const kn = jlAdd(this.inp.kN, 2);
    this.blMode = growI32(this.blMode, kn);
    this.blTag = growI32(this.blTag, kn);
    const blMode = this.blMode;
    if (kn > blMode.length) {
      fault();
    }
    for (let i = 0; i < kn && i < blMode.length; i++) {
      blMode[i] = BL_NONE;
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
    this.presize(this.inp.nTokens);
    this.constIndent(0); // ZERO is indent 0
  }

  /**
   * Grows the event, doc and action columns once, to about what a file of
   * `nt` tokens needs (on Java corpora, at most about 3.5 events, 2.6 docs
   * and 1.4 actions a token for nine files in ten), rather than doubling
   * them as they fill. Sizes only: what the columns hold is unchanged.
   */
  private presize(nt: i32): void {
    if (nt <= 0 || nt > 100000000) {
      return;
    }
    const ops = nt * 3 + (nt >> 1);
    if (ops > toI32(this.oKind.length)) {
      this.oKind = growI32(this.oKind, ops);
      this.oA = growI32(this.oA, ops);
      this.oB = growI32(this.oB, ops);
      this.oC = growI32(this.oC, ops);
      this.oD = growI32(this.oD, ops);
      this.oE = growI32(this.oE, ops);
    }
    if (ops > toI32(this.fKind.length)) {
      this.fKind = growI32(this.fKind, ops);
      this.fA = growI32(this.fA, ops);
      this.fB = growI32(this.fB, ops);
      this.fC = growI32(this.fC, ops);
      this.fD = growI32(this.fD, ops);
      this.fE = growI32(this.fE, ops);
    }
    const docs = nt * 2 + (nt >> 1) + (nt >> 3);
    if (docs > toI32(this.dKind.length)) {
      this.dKind = growI32(this.dKind, docs);
      this.dA = growI32(this.dA, docs);
      this.dB = growI32(this.dB, docs);
      this.dC = growI32(this.dC, docs);
      this.dD = growI32(this.dD, docs);
      this.dW = growI32(this.dW, docs);
      this.dLo = growI32(this.dLo, docs);
      this.dHi = growI32(this.dHi, docs);
      this.dKid = growI32(this.dKid, docs);
      this.dKidN = growI32(this.dKidN, docs);
    }
    if (docs > toI32(this.itLevel.length)) {
      this.itLevel = growI32(this.itLevel, docs);
      this.itRef = growI32(this.itRef, docs);
      this.itNext = growI32(this.itNext, docs);
    }
    this.kids = growI32(this.kids, docs);
    if (nt > toI32(this.lvInd.length)) {
      this.lvInd = growI32(this.lvInd, nt);
      this.lvHugInd = growI32(this.lvHugInd, nt);
      this.lvRole = growI32(this.lvRole, nt);
      this.lvHugPt = growI32(this.lvHugPt, nt);
      this.lvFb = growI32(this.lvFb, nt);
      this.lvFirst = growI32(this.lvFirst, nt);
      this.lvLast = growI32(this.lvLast, nt);
    }
    const acs = nt + (nt >> 1);
    if (acs > toI32(this.acKind.length)) {
      this.acKind = growI32(this.acKind, acs);
      this.acA = growI32(this.acA, acs);
      this.acB = growI32(this.acB, acs);
    }
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
      const c = jlCap(i);
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
      const k = n + 256;
      const cache = this.constCache;
      if (k < 0 || k >= cache.length) {
        fault();
        return 0;
      }
      const c = cache[k];
      if (c >= 0) {
        return c;
      }
      const id = this.newIndent(0, n, -1, -1, -1);
      if (k < 0 || k >= cache.length) {
        fault();
        return 0;
      }
      cache[k] = id;
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
    while (true) {
      if (x < 0 || x >= indKind.length || x >= indN.length) {
        fault();
        return 0;
      }
      if (indKind[x] !== 1) {
        return indN[x];
      }
      if (x >= indTag.length || x >= indThen.length || x >= indElse.length) {
        fault();
        return 0;
      }
      const tag = indTag[x];
      if (tag < 0 || tag >= tagTaken.length) {
        fault();
        return 0;
      }
      x = tagTaken[tag] === 1 ? indThen[x] : indElse[x];
    }
  }

  genSym(): i32 {
    const t = this.nTags;
    if (t >= toI32(this.tagTaken.length)) {
      this.tagTaken = growI32(this.tagTaken, jlCap(t));
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
      this.depth = jlInc(this.depth);
    } else if (kind === K_CLOSE) {
      this.depth = jlDec(this.depth);
      if (this.depth < 0) {
        this.fail("unbalanced close");
      }
    }
    const i = this.nOps;
    if (i >= toI32(this.oKind.length)) {
      const cap = jlCap(i);
      this.oKind = growI32(this.oKind, cap);
      this.oA = growI32(this.oA, cap);
      this.oB = growI32(this.oB, cap);
      this.oC = growI32(this.oC, cap);
      this.oD = growI32(this.oD, cap);
      this.oE = growI32(this.oE, cap);
    }
    const oKind = this.oKind;
    const oA = this.oA;
    const oB = this.oB;
    const oC = this.oC;
    const oD = this.oD;
    const oE = this.oE;
    if (
      i < 0 ||
      i >= oKind.length ||
      i >= oA.length ||
      i >= oB.length ||
      i >= oC.length ||
      i >= oD.length ||
      i >= oE.length
    ) {
      fault();
      return;
    }
    oKind[i] = kind;
    oA[i] = a;
    oB[i] = b;
    oC[i] = c;
    oD[i] = d;
    oE[i] = e;
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
      this.hugMark = growI32(this.hugMark, jlCap(h));
    }
    const hugMark = this.hugMark;
    if (h < 0 || h >= hugMark.length) {
      fault();
      return 0;
    }
    hugMark[h] = -1;
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
    const inp = this.inp;
    const p = toI64(this.tokenI) + toI64(skip);
    if (p >= toI64(inp.nTokens)) {
      return -1;
    }
    // Below nTokens, so the conversion is exact when `p` is not negative.
    const i = toI32(p);
    const kTok = inp.kTok;
    if (p >= toI64(0) && i >= 0 && i < kTok.length) {
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

  /** OpsBuilder.token: outputs the next input token when its text is `s`. */
  token(s: string, real: boolean, plusIndentCommentsBefore: i32, breakAndIndentTrailingComment: i32): void {
    if (this.peekIs(s)) {
      const ti = this.tokenI;
      this.addOp(K_TOKEN, ti, 1, plusIndentCommentsBefore, breakAndIndentTrailingComment);
      this.tokenI = jlInc(ti);
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
      const ti = this.tokenI;
      this.addOp(K_TOKEN, ti, 1, 0, -1);
      this.tokenI = jlInc(ti);
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
        const cap = jlCap(id);
        this.lnStart = growI32(this.lnStart, cap);
        this.lnCount = growI32(this.lnCount, cap);
      }
      const lnStart = this.lnStart;
      const lnCount = this.lnCount;
      if (id < 0 || id >= lnStart.length || id >= lnCount.length) {
        fault();
        return;
      }
      lnStart[id] = toI32(this.lnText.length);
      lnCount[id] = toI32(lines.length);
      for (const l of lines) {
        this.lnText.push(l);
      }
      this.nLines = id + 1;
      const ti = this.tokenI;
      this.addOp(K_TOKEN, ti, 1, 0, -1, id);
      this.tokenI = jlInc(ti);
    } else {
      this.fail(`expected token '${p >= 0 ? this.inp.text(p) : "EOF"}'; generated ${this.inp.text(t)} instead`);
    }
  }

  /** OpsBuilder.actualSize: the characters from `pos` for `len`, widened over adjacent comments. */
  actualSize(pos: i32, len: i32): i32 {
    const inp = this.inp;
    const st = inp.tokenAt(pos);
    const et = inp.tokenAt(jlAdd(jlAdd(pos, len), -1));
    if (st < 0 || et < 0) {
      // No token there: LayoutBuilder's position map answers null and it throws.
      this.fail("no token for actualSize");
      return len;
    }
    const refs = inp.refs;
    const tFlags = inp.tFlags;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    let start = atI32(tPos, atI32(inp.kTok, st));
    const bn = atI32(inp.kBeforeN, st);
    let r = atI32(inp.kBefore, st);
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
      r = r + 1;
    }
    const tk = atI32(inp.kTok, et);
    let end = atI32(tEnd, tk);
    const an = atI32(inp.kAfterN, et);
    r = atI32(inp.kAfter, et);
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
      r = r + 1;
    }
    return inp.width(start, end);
  }

  /** OpsBuilder.actualStartColumn: a position, moved to a comment before it on the same line. */
  actualStartColumn(pos: i32): i32 {
    const inp = this.inp;
    const st = inp.tokenAt(pos);
    if (st < 0) {
      this.fail("no token for actualStartColumn");
      return pos;
    }
    const refs = inp.refs;
    const tFlags = inp.tFlags;
    const tPos = inp.tPos;
    const tokPos = atI32(tPos, atI32(inp.kTok, st));
    let start = tokPos;
    const bn = atI32(inp.kBeforeN, st);
    let r = atI32(inp.kBefore, st);
    for (let j = 0; j < bn; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return pos;
      }
      const t = refs[r];
      if (t < 0 || t >= tFlags.length || t >= tPos.length) {
        fault();
        return pos;
      }
      const tp = tPos[t];
      const tf = tFlags[t];
      if (this.breakBetween(tp, tokPos)) {
        return start;
      }
      if ((tf & TF_COMMENT) !== 0 && tp < start) {
        start = tp;
      }
      r = r + 1;
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
    for (let i = a; i < b; i++) {
      if (i < 0 || i >= src.length) {
        fault();
        return false;
      }
      const c = toI32(src[i]);
      if (c === 10) {
        return true;
      }
      if (c === 13) {
        const i1 = i + 1;
        if (!(i1 < n && atU8(src, i1) === 10)) {
          return true;
        }
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
      const inp = this.inp;
      const ti = this.tokenI;
      if (ti < inp.nTokens) {
        const tok = atI32(inp.kTok, ti);
        if (pos > atI32(inp.tPos, tok)) {
          this.fail(`did not generate token "${inp.text(tok)}"`);
        }
      }
    }
  }

  /** Emits every input token not yet output as an imaginary token. */
  drain(): void {
    const inp = this.inp;
    const pos = jlInc(inp.n);
    if (pos > this.inputPosition) {
      const nTokens = inp.nTokens;
      while (true) {
        const ti = this.tokenI;
        if (!(ti < nTokens && pos > atI32(inp.tPos, atI32(inp.kTok, ti)))) {
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
    const refs = inp.refs;
    const tIdx = inp.tIdx;
    const bn = atI32(inp.kBeforeN, k);
    let r = atI32(inp.kBefore, k);
    for (let j = 0; j < bn; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return -1;
      }
      const t = refs[r];
      if (t < 0 || t >= tIdx.length) {
        fault();
        return -1;
      }
      if (tIdx[t] >= 0) {
        return tIdx[t];
      }
      r = r + 1;
    }
    return atI32(tIdx, atI32(inp.kTok, k));
  }

  /** The last numbered tok of a token: its last comment after, else itself (JavaOutput.endTok). */
  lastNumbered(k: i32): i32 {
    const inp = this.inp;
    const refs = inp.refs;
    const tIdx = inp.tIdx;
    const base = atI32(inp.kAfter, k);
    for (let j = atI32(inp.kAfterN, k); j > 0; j--) {
      const r64 = toI64(base) + toI64(j - 1);
      // In range, so the conversion is exact.
      const r = toI32(r64);
      if (r64 < toI64(0) || r64 >= toI64(refs.length) || r < 0 || r >= refs.length) {
        fault();
        return -1;
      }
      const t = refs[r];
      if (t < 0 || t >= tIdx.length) {
        fault();
        return -1;
      }
      if (tIdx[t] >= 0) {
        return tIdx[t];
      }
    }
    return atI32(tIdx, atI32(inp.kTok, k));
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
    const hi = this.lastNumbered(jlDec(this.tokenI));
    this.lastBoundary = this.tokenI;
    // A RangeSet: a range connected to the last one joins it.
    const n = this.nPf;
    if (n > 0) {
      const pfLo = this.pfLo;
      const pfHi = this.pfHi;
      const m = n - 1;
      if (m >= pfLo.length || m >= pfHi.length) {
        fault();
        return;
      }
      if (lo <= pfHi[m] && hi >= pfLo[m]) {
        if (lo < pfLo[m]) {
          pfLo[m] = lo;
        }
        if (hi > pfHi[m]) {
          pfHi[m] = hi;
        }
        return;
      }
    }
    if (n >= toI32(this.pfLo.length)) {
      const cap = jlCap(n);
      this.pfLo = growI32(this.pfLo, cap);
      this.pfHi = growI32(this.pfHi, cap);
    }
    const pfLo = this.pfLo;
    const pfHi = this.pfHi;
    if (n < 0 || n >= pfLo.length || n >= pfHi.length) {
      fault();
      return;
    }
    pfLo[n] = lo;
    pfHi[n] = hi;
    this.nPf = n + 1;
  }

  /** InputOutput.ranges[line] = union(ranges[line], [lo, hi)). */
  private addLineRange(line: i32, lo: i32, hi: i32): void {
    while (this.nLineR <= line) {
      const r = this.nLineR;
      if (r >= toI32(this.lineRLo.length)) {
        const cap = jlCap(r);
        this.lineRLo = growI32(this.lineRLo, cap);
        this.lineRHi = growI32(this.lineRHi, cap);
      }
      const rLo = this.lineRLo;
      const rHi = this.lineRHi;
      if (r < 0 || r >= rLo.length || r >= rHi.length) {
        fault();
        return;
      }
      rLo[r] = -1;
      rHi[r] = -1;
      this.nLineR = r + 1;
    }
    const lineRLo = this.lineRLo;
    const lineRHi = this.lineRHi;
    if (line < 0 || line >= lineRLo.length || line >= lineRHi.length) {
      fault();
      return;
    }
    if (lineRLo[line] < 0) {
      lineRLo[line] = lo;
      lineRHi[line] = hi;
    } else {
      if (lo < lineRLo[line]) {
        lineRLo[line] = lo;
      }
      if (hi > lineRHi[line]) {
        lineRHi[line] = hi;
      }
    }
  }

  /** OpsBuilder.blankLineWanted: at the next token. */
  blankLineWanted(mode: i32): void {
    if (this.tokenI < this.inp.nTokens) {
      this.blankLine(this.firstNumbered(this.tokenI), mode, -1);
    } else {
      this.fail("blank line wanted past the last token");
    }
  }

  /** A conditional blank line: wanted when `tag` was broken. */
  blankLineWantedIf(tag: i32): void {
    if (this.tokenI < this.inp.nTokens) {
      this.blankLine(this.firstNumbered(this.tokenI), BL_COND, tag);
    } else {
      this.fail("blank line wanted past the last token");
    }
  }

  /** JavaOutput.blankLine: the first wish at `k` wins, but conditionals merge. */
  blankLine(k: i32, mode: i32, tag: i32): void {
    const blMode = this.blMode;
    const blTag = this.blTag;
    if (k < 0 || k >= blMode.length) {
      fault();
      return;
    }
    const cur = blMode[k];
    if (cur === BL_NONE) {
      blMode[k] = mode;
      if (mode === BL_COND) {
        const cell = this.newCell(tag, -1);
        if (k >= blTag.length) {
          fault();
          return;
        }
        blTag[k] = cell;
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
    // Append the tag to the list. The link goes into the cell column as it
    // was before newCell, which may grow it, as the old `cellNext[c] = newCell()` did.
    if (k >= blTag.length) {
      fault();
      return;
    }
    const cellNext = this.cellNext;
    let c = blTag[k];
    while (true) {
      if (c < 0 || c >= cellNext.length) {
        fault();
        return;
      }
      const next = cellNext[c];
      if (next < 0) {
        break;
      }
      c = next;
    }
    const cell = this.newCell(tag, -1);
    if (c < 0 || c >= cellNext.length) {
      fault();
      return;
    }
    cellNext[c] = cell;
  }

  private newCell(tag: i32, next: i32): i32 {
    const c = this.nCells;
    if (c >= toI32(this.cellTag.length)) {
      const cap = jlCap(c);
      this.cellTag = growI32(this.cellTag, cap);
      this.cellNext = growI32(this.cellNext, cap);
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
    const blTag = this.blTag;
    const cellTag = this.cellTag;
    const cellNext = this.cellNext;
    const tagTaken = this.tagTaken;
    if (k >= blTag.length) {
      fault();
      return 0;
    }
    let c = blTag[k];
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
      const cap = jlCap(i);
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

  // ---- LayoutBuilder.build ---------------------------------------------------

  /**
   * LayoutBuilder.commentEvents and spliceEvents: the events with every
   * token's comments (and the whitespace around imaginary tokens) threaded
   * in, and spaces after forced breaks dropped.
   */
  private spliceComments(): void {
    const inp = this.inp;
    const opsN = this.nOps;
    const oKind = this.oKind;
    const oA = this.oA;
    const oB = this.oB;
    const oC = this.oC;
    const oD = this.oD;
    const oE = this.oE;
    // The loops read every event below `opsN`.
    if (
      opsN > oKind.length ||
      opsN > oA.length ||
      opsN > oB.length ||
      opsN > oC.length ||
      opsN > oD.length ||
      opsN > oE.length
    ) {
      fault();
      return;
    }
    const kBefore = inp.kBefore;
    const kBeforeN = inp.kBeforeN;
    const kAfter = inp.kAfter;
    const kAfterN = inp.kAfterN;
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
      const real = oB[i];
      const plusIndentBefore = oC[i];
      const trailingIndent = oD[i];
      // Comments before a token go before the groups it opens, comments after
      // it after the groups it closes (`after` is one past the last close).
      let j = i;
      while (j > 0 && j <= oKind.length && oKind[j - 1] === K_OPEN) {
        j--;
      }
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
      if (real === 1) {
        // addToksBefore.
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
          r = r + 1;
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            newlines = jlInc(newlines);
          } else if ((f & TF_COMMENT) !== 0) {
            const line = (f & TF_LINE_COMMENT) !== 0;
            this.addExtra(j, K_BREAK, line ? FORCED : UNIFIED, 0, plusIndentBefore, -1);
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
          this.blankLine(atI32(inp.tIdx, atI32(inp.kTok, k)), BL_YES, -1);
        }
        if (lastWasComment && newlines > 0) {
          this.extraForced(j, 0);
        } else if (space) {
          this.addExtra(j, K_SPACE, 0, 0, 0, -1);
        }
        // addToksAfter.
        r = as;
        for (let q = 0; q < an; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          r = r + 1;
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          if ((f & TF_COMMENT) === 0) {
            continue;
          }
          const breakAfter = (f & TF_JAVADOC) !== 0 || ((f & TF_BLOCK_COMMENT) !== 0 && trailingIndent >= 0);
          if (breakAfter) {
            this.extraForced(after, trailingIndent >= 0 ? trailingIndent : 0);
          } else {
            this.addExtra(after, K_SPACE, 0, 0, 0, -1);
          }
          this.addExtra(after, K_TOK, t, 0, 0, -1);
          // One forced break after a trailing `///` comment (both a line
          // comment and a doc comment), where OpsBuilder adds two.
          if (breakAfter || (f & TF_LINE_COMMENT) !== 0) {
            this.extraForced(after, 0);
          }
        }
      } else {
        // addImaginaryToks: an imaginary token's toks go out as they are.
        let newlines = 0;
        let lastWasComment = false;
        let r = bs;
        for (let q = 0; q < bn; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          r = r + 1;
          if (t < 0 || t >= tFlags.length) {
            fault();
            return;
          }
          const f = tFlags[t];
          if ((f & TF_NEWLINE) !== 0) {
            newlines = jlInc(newlines);
          } else if ((f & TF_COMMENT) !== 0) {
            newlines = 0;
            lastWasComment = true;
          }
          if (lastWasComment && newlines > 0) {
            this.extraForced(j, 0);
          }
          this.addExtra(j, K_TOK, t, 0, 0, -1);
        }
        r = as;
        for (let q = 0; q < an; q++) {
          if (r < 0 || r >= refs.length) {
            fault();
            return;
          }
          const t = refs[r];
          r = r + 1;
          this.addExtra(after, K_TOK, t, 0, 0, -1);
        }
      }
    }
    // The extras are generated in key order (a token's leading comments key
    // at or after the previous token's trailing ones), so they merge in with
    // one pointer; a counting sort covers any other order.
    const nExtra = this.nExtra;
    let sorted = true;
    const keys = this.xKey;
    if (nExtra > keys.length) {
      fault();
      return;
    }
    for (let x = 1; x < nExtra && x < keys.length; x++) {
      if (keys[x] < keys[x - 1]) {
        sorted = false;
        break;
      }
    }
    if (!sorted) {
      this.sortExtras(opsN);
    }
    this.nFin = 0;
    const xKey = this.xKey;
    const xKind = this.xKind;
    const xA = this.xA;
    const xB = this.xB;
    const xC = this.xC;
    const xD = this.xD;
    let afterForcedBreak = false;
    let x = 0;
    for (let i = 0; i <= opsN; i++) {
      while (x < nExtra) {
        if (x < 0 || x >= xKey.length) {
          fault();
          return;
        }
        if (xKey[x] !== i) {
          break;
        }
        if (x >= xKind.length || x >= xA.length || x >= xB.length || x >= xC.length || x >= xD.length) {
          fault();
          return;
        }
        const kind = xKind[x];
        const xa = xA[x];
        if (!(afterForcedBreak && kind === K_SPACE)) {
          this.pushFin(kind, xa, xB[x], xC[x], xD[x], -1);
          afterForcedBreak = kind === K_BREAK && xa === FORCED;
        }
        x++;
      }
      if (i === opsN) {
        break;
      }
      if (i >= oKind.length || i >= oA.length || i >= oB.length || i >= oC.length || i >= oD.length || i >= oE.length) {
        fault();
        return;
      }
      const kind = oKind[i];
      const oa = oA[i];
      const ob = oB[i];
      const oc = oC[i];
      // isSpaceLike: a space, or a break with no extra indent that is a space when not taken.
      if (afterForcedBreak && (kind === K_SPACE || (kind === K_BREAK && this.evalIndent(oc) === 0 && ob === 1))) {
        continue;
      }
      this.pushFin(kind, oa, ob, oc, oD[i], oE[i]);
      // An open, a hug point, a comment fence or a header mark outputs
      // nothing, so it doesn't end the run after a forced break.
      if (kind !== K_OPEN && kind !== K_HUG && kind !== K_FENCE && kind !== K_HEADER) {
        afterForcedBreak = kind === K_BREAK && oa === FORCED;
      }
    }
  }

  /** Reorders the extras stably by key (a counting sort). */
  private sortExtras(opsN: i32): void {
    const counts = newI32s(jlAdd(opsN, 2));
    const k = this.nExtra;
    const xKey = this.xKey;
    const xKind = this.xKind;
    const xA = this.xA;
    const xB = this.xB;
    const xC = this.xC;
    const xD = this.xD;
    if (k > xKey.length || k > xKind.length || k > xA.length || k > xB.length || k > xC.length || k > xD.length) {
      fault();
      return;
    }
    for (let x = 0; x < k && x < xKey.length; x++) {
      const p = jlInc(xKey[x]);
      if (p < 0 || p >= counts.length) {
        fault();
        return;
      }
      counts[p] = jlInc(counts[p]);
    }
    // `counts` holds opsN + 2 entries, so this runs x up to opsN + 1.
    for (let x = 1; x < counts.length; x++) {
      counts[x] = jlAdd(counts[x], counts[x - 1]);
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
      counts[kx] = jlInc(q);
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

  private pushFin(kind: i32, a: i32, b: i32, c: i32, d: i32, e: i32): void {
    const i = this.nFin;
    if (i >= toI32(this.fKind.length)) {
      const cap = jlCap(i);
      this.fKind = growI32(this.fKind, cap);
      this.fA = growI32(this.fA, cap);
      this.fB = growI32(this.fB, cap);
      this.fC = growI32(this.fC, cap);
      this.fD = growI32(this.fD, cap);
      this.fE = growI32(this.fE, cap);
    }
    const fKind = this.fKind;
    const fA = this.fA;
    const fB = this.fB;
    const fC = this.fC;
    const fD = this.fD;
    const fE = this.fE;
    if (
      i < 0 ||
      i >= fKind.length ||
      i >= fA.length ||
      i >= fB.length ||
      i >= fC.length ||
      i >= fD.length ||
      i >= fE.length
    ) {
      fault();
      return;
    }
    fKind[i] = kind;
    fA[i] = a;
    fB[i] = b;
    fC[i] = c;
    fD[i] = d;
    fE[i] = e;
    this.nFin = i + 1;
  }

  // ---- LayoutBuilder.buildTree -----------------------------------------------

  private newLevel(ind: i32, hugInd: i32, role: i32, hugPt: i32, fb: i32): i32 {
    const i = this.nLv;
    if (i >= toI32(this.lvInd.length)) {
      const cap = jlCap(i);
      this.lvInd = growI32(this.lvInd, cap);
      this.lvHugInd = growI32(this.lvHugInd, cap);
      this.lvRole = growI32(this.lvRole, cap);
      this.lvHugPt = growI32(this.lvHugPt, cap);
      this.lvFb = growI32(this.lvFb, cap);
      this.lvFirst = growI32(this.lvFirst, cap);
      this.lvLast = growI32(this.lvLast, cap);
    }
    const lvInd = this.lvInd;
    const lvHugInd = this.lvHugInd;
    const lvRole = this.lvRole;
    const lvHugPt = this.lvHugPt;
    const lvFb = this.lvFb;
    const lvFirst = this.lvFirst;
    const lvLast = this.lvLast;
    if (
      i < 0 ||
      i >= lvInd.length ||
      i >= lvHugInd.length ||
      i >= lvRole.length ||
      i >= lvHugPt.length ||
      i >= lvFb.length ||
      i >= lvFirst.length ||
      i >= lvLast.length
    ) {
      fault();
      return 0;
    }
    lvInd[i] = ind;
    lvHugInd[i] = hugInd;
    lvRole[i] = role;
    lvHugPt[i] = hugPt;
    lvFb[i] = fb;
    lvFirst[i] = -1;
    lvLast[i] = -1;
    this.nLv = i + 1;
    return i;
  }

  private addItem(level: i32, isLevel: i32, ref: i32): void {
    const i = this.nItems;
    if (i >= toI32(this.itLevel.length)) {
      const cap = jlCap(i);
      this.itLevel = growI32(this.itLevel, cap);
      this.itRef = growI32(this.itRef, cap);
      this.itNext = growI32(this.itNext, cap);
    }
    const itLevel = this.itLevel;
    const itRef = this.itRef;
    const itNext = this.itNext;
    const lvFirst = this.lvFirst;
    const lvLast = this.lvLast;
    if (i < 0 || i >= itLevel.length || i >= itRef.length || i >= itNext.length) {
      fault();
      return;
    }
    itLevel[i] = isLevel;
    itRef[i] = ref;
    itNext[i] = -1;
    if (level < 0 || level >= lvFirst.length || level >= lvLast.length) {
      fault();
      return;
    }
    const last = lvLast[level];
    if (last < 0) {
      lvFirst[level] = i;
    } else {
      if (last >= itNext.length) {
        fault();
        return;
      }
      itNext[last] = i;
    }
    lvLast[level] = i;
    this.nItems = i + 1;
  }

  private pushLevel(level: i32): void {
    const n = this.nStack;
    if (n >= toI32(this.stack.length)) {
      this.stack = growI32(this.stack, jlCap(n));
    }
    const stack = this.stack;
    if (n < 0 || n >= stack.length) {
      fault();
      return;
    }
    stack[n] = level;
    this.nStack = n + 1;
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
    const nFin = this.nFin;
    const fKind = this.fKind;
    const fA = this.fA;
    const fB = this.fB;
    const fC = this.fC;
    const fD = this.fD;
    const fE = this.fE;
    for (let i = 0; i < nFin; i++) {
      if (i >= fKind.length || i >= fA.length) {
        fault();
        return 0;
      }
      const kind = fKind[i];
      const fa = fA[i];
      if (kind === K_OPEN) {
        if (i >= fB.length || i >= fC.length || i >= fD.length || i >= fE.length) {
          fault();
          return 0;
        }
        this.pushLevel(this.newLevel(fa, fB[i], fC[i], fD[i], fE[i]));
      } else if (kind === K_CLOSE) {
        const stack = this.stack;
        const n = this.nStack;
        if (n < 2 || n > stack.length) {
          fault();
          return 0;
        }
        this.nStack = n - 1;
        this.addItem(stack[n - 2], 1, stack[n - 1]);
      } else if (kind === K_BREAK) {
        const stack = this.stack;
        const n = this.nStack;
        if (n < 1 || n > stack.length || i >= fB.length || i >= fC.length || i >= fD.length) {
          fault();
          return 0;
        }
        appendLevel = stack[n - 1];
        this.addItem(appendLevel, 0, this.newDoc(D_BREAK, fa, fB[i], fC[i], fD[i]));
      } else if (kind === K_TOKEN) {
        if (i >= fE.length) {
          fault();
          return 0;
        }
        const fe = fE[i];
        const d = fe >= 0 ? this.newDoc(D_LINES, fa, fe, 0, 0) : this.newDoc(D_TEXT, fa, 0, 0, 0);
        this.addItem(appendLevel, 0, d);
      } else if (kind === K_TOK) {
        this.addItem(appendLevel, 0, this.newDoc(D_TOK, fa, 0, 0, 0));
      } else if (kind === K_HUG) {
        const d = this.newDoc(D_MARK, fa, 0, 0, 0);
        const hugMark = this.hugMark;
        if (fa < 0 || fa >= hugMark.length) {
          fault();
          return 0;
        }
        hugMark[fa] = d;
        this.addItem(appendLevel, 0, d);
      } else if (kind === K_HEADER) {
        // Header marks go to the innermost open level, so that a header's
        // start and end are in one group, laid out or skipped together.
        const stack = this.stack;
        const n = this.nStack;
        if (n < 1 || n > stack.length) {
          fault();
          return 0;
        }
        this.addItem(stack[n - 1], 0, this.newDoc(D_HEADER, fa, 0, 0, 0));
      } else if (kind === K_SPACE) {
        this.addItem(appendLevel, 0, this.newDoc(D_SPACE, 0, 0, 0, 0));
      }
    }
    return this.buildLevel(base);
  }

  /** LevelBuilder.build. */
  private buildLevel(lv: i32): i32 {
    const lvRole = this.lvRole;
    const lvInd = this.lvInd;
    if (lv < 0 || lv >= lvRole.length || lv >= lvInd.length) {
      fault();
      return 0;
    }
    if (lvRole[lv] === HUG_HUGGABLE) {
      return this.buildHuggable(lv);
    }
    const ind = lvInd[lv];
    return this.newGroup(ind, this.buildItems(lv));
  }

  /** LevelBuilder.buildItems. */
  private buildItems(lv: i32): i32[] {
    const docs: i32[] = [];
    const itLevel = this.itLevel;
    const itRef = this.itRef;
    const itNext = this.itNext;
    let it = atI32(this.lvFirst, lv);
    while (it >= 0) {
      if (it >= itLevel.length || it >= itRef.length || it >= itNext.length) {
        fault();
        return docs;
      }
      const isLevel = itLevel[it];
      const ref = itRef[it];
      const next = itNext[it];
      docs.push(isLevel === 1 ? this.buildLevel(ref) : ref);
      it = next;
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
    const itLevel = this.itLevel;
    const itRef = this.itRef;
    const itNext = this.itNext;
    let it = atI32(this.lvFirst, lv);
    while (it >= 0) {
      if (it >= itLevel.length || it >= itRef.length || it >= itNext.length) {
        fault();
        return 0;
      }
      const ref = itRef[it];
      const isLevel = itLevel[it] === 1;
      const next = itNext[it];
      let flattened: i32[] = [];
      let fallbackDoc = ref;
      if (isLevel && atI32(this.lvRole, ref) === HUG_ARGUMENTS) {
        flattened = this.buildItems(ref);
        fallbackDoc = this.newGroup(atI32(this.lvInd, ref), flattened);
      } else {
        if (isLevel) {
          fallbackDoc = this.buildLevel(ref);
        }
        flattened.push(fallbackDoc);
      }
      fallback.push(fallbackDoc);
      for (const d of flattened) {
        const dKind = this.dKind;
        const dA = this.dA;
        const dB = this.dB;
        if (d < 0 || d >= dKind.length || d >= dA.length || d >= dB.length) {
          fault();
          return 0;
        }
        if (dKind[d] === D_BREAK) {
          // Forced breaks (after line comments) must not be flattened.
          if (dA[d] === FORCED) {
            canHug = false;
          }
          preferred.push(this.newDoc(D_STR, dB[d], 0, 0, 0));
        } else {
          preferred.push(d);
        }
      }
      it = next;
    }
    const lvInd = this.lvInd;
    const lvHugInd = this.lvHugInd;
    const lvHugPt = this.lvHugPt;
    const lvFb = this.lvFb;
    if (lv < 0 || lv >= lvInd.length || lv >= lvHugInd.length || lv >= lvHugPt.length || lv >= lvFb.length) {
      fault();
      return 0;
    }
    const hugInd = lvHugInd[lv];
    const hp = lvHugPt[lv];
    const fb = lvFb[lv];
    const fallbackGroup = this.newGroup(lvInd[lv], fallback);
    const preferredGroup = this.newGroup(hugInd, preferred);
    const marker = hp >= 0 ? atI32(this.hugMark, hp) : -1;
    const prefixWidth = canHug && marker >= 0 ? this.widthBefore(preferredGroup, marker) : -1;
    if (prefixWidth < 0) {
      return fallbackGroup;
    }
    return this.newDoc(D_CHOICE, preferredGroup, prefixWidth, fallbackGroup, fb);
  }

  /** The flat width of `d` before `marker`, or -1 when `d` doesn't hold it within MAX_LINE_WIDTH. */
  private widthBefore(d: i32, marker: i32): i32 {
    if (d === marker) {
      return 0;
    }
    const dKind = this.dKind;
    if (d < 0 || d >= dKind.length) {
      fault();
      return -1;
    }
    const kind = dKind[d];
    if (kind === D_GROUP) {
      let width = 0;
      const a = atI32(this.dKid, d);
      const e = jlAdd(a, atI32(this.dKidN, d));
      const kids = this.kids;
      const dW = this.dW;
      for (let i = a; i < e; i++) {
        if (i < 0 || i >= kids.length) {
          fault();
          return -1;
        }
        const c = kids[i];
        const before = this.widthBefore(c, marker);
        if (before >= 0) {
          const total = jlAdd(width, before);
          return total < MAX_LINE_WIDTH ? total : MAX_LINE_WIDTH;
        }
        if (c < 0 || c >= dW.length) {
          fault();
          return -1;
        }
        width = jlAdd(width, dW[c]);
        if (width >= MAX_LINE_WIDTH) {
          return -1;
        }
      }
      return -1;
    }
    if (kind === D_CHOICE) {
      return this.widthBefore(atI32(this.dC, d), marker);
    }
    return -1;
  }

  // ---- Docs --------------------------------------------------------------------

  private newDoc(kind: i32, a: i32, b: i32, c: i32, d: i32): i32 {
    const i = this.nDocs;
    if (i >= toI32(this.dKind.length)) {
      const cap = jlCap(i);
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
    const dKind = this.dKind;
    const dA = this.dA;
    const dB = this.dB;
    const dC = this.dC;
    const dD = this.dD;
    const dW = this.dW;
    const dLo = this.dLo;
    const dHi = this.dHi;
    const dKid = this.dKid;
    const dKidN = this.dKidN;
    if (
      i < 0 ||
      i >= dKind.length ||
      i >= dA.length ||
      i >= dB.length ||
      i >= dC.length ||
      i >= dD.length ||
      i >= dKid.length ||
      i >= dKidN.length
    ) {
      fault();
      return 0;
    }
    dKind[i] = kind;
    dA[i] = a;
    dB[i] = b;
    dC[i] = c;
    dD[i] = d;
    dKid[i] = 0;
    dKidN[i] = 0;
    this.nDocs = i + 1;
    const inp = this.inp;
    let w = 0;
    let lo = -1;
    let choiceHi = -1;
    if (kind === D_TEXT) {
      const kTok = inp.kTok;
      if (a < 0 || a >= kTok.length) {
        fault();
        return 0;
      }
      const t = kTok[a];
      w = inp.containsBreak(t) ? MAX_LINE_WIDTH : inp.tokWidth(t);
      lo = atI32(inp.tIdx, t);
    } else if (kind === D_STR) {
      const flats = this.flats;
      if (a < 0 || a >= flats.length) {
        fault();
        return 0;
      }
      w = strUtf16Len(flats[a]);
    } else if (kind === D_LINES) {
      w = MAX_LINE_WIDTH;
      lo = atI32(inp.tIdx, atI32(inp.kTok, a));
    } else if (kind === D_TOK) {
      w = this.tokWidthOf(a);
      lo = atI32(inp.tIdx, a);
    } else if (kind === D_SPACE) {
      w = 1;
    } else if (kind === D_BREAK) {
      if (a === FORCED) {
        w = MAX_LINE_WIDTH;
      } else {
        const flats = this.flats;
        if (b < 0 || b >= flats.length) {
          fault();
          return 0;
        }
        w = strUtf16Len(flats[b]);
      }
    } else if (kind === D_CHOICE) {
      if (c < 0 || c >= dW.length || c >= dLo.length || c >= dHi.length) {
        fault();
        return 0;
      }
      w = dW[c];
      lo = dLo[c];
      choiceHi = dHi[c];
    }
    if (i >= dW.length || i >= dLo.length || i >= dHi.length) {
      fault();
      return 0;
    }
    dW[i] = w;
    dLo[i] = lo;
    if (kind === D_CHOICE) {
      dHi[i] = choiceHi;
    } else if (lo < 0) {
      dHi[i] = -1;
    } else if (lo < 2147483647) {
      dHi[i] = lo + 1;
    } else {
      fault();
      return 0;
    }
    return i;
  }

  /** Doc.Group: its width (saturating at MAX_LINE_WIDTH) and range come from its children. */
  private newGroup(ind: i32, docs: i32[]): i32 {
    const g = this.newDoc(D_GROUP, ind, 0, 0, 0);
    const n = toI32(docs.length);
    const a = this.nKids;
    const need = toI64(a) + toI64(n);
    if (need > toI64(this.kids.length)) {
      if (need > toI64(2147483647)) {
        fault();
        return g;
      }
      this.kids = growI32(this.kids, jlCap(toI32(need)));
    }
    const kids = this.kids;
    const dW = this.dW;
    const dLo = this.dLo;
    const dHi = this.dHi;
    let w = 0;
    let lo = -1;
    let hi = -1;
    let p = a;
    for (let i = 0; i < n && i < docs.length; i++) {
      const d = docs[i];
      if (p < 0 || p >= kids.length || d < 0 || d >= dW.length || d >= dLo.length || d >= dHi.length) {
        fault();
        return g;
      }
      kids[p] = d;
      p = p + 1;
      if (w < MAX_LINE_WIDTH) {
        // Saturates at MAX_LINE_WIDTH.
        w = jlAdd(w, dW[d]);
        if (w >= MAX_LINE_WIDTH) {
          w = MAX_LINE_WIDTH;
        }
      }
      const dl = dLo[d];
      if (dl >= 0) {
        if (lo < 0 || dl < lo) {
          lo = dl;
        }
        if (dHi[d] > hi) {
          hi = dHi[d];
        }
      }
    }
    this.nKids = p;
    const dKid = this.dKid;
    const dKidN = this.dKidN;
    if (g < 0 || g >= dKid.length || g >= dKidN.length || g >= dW.length || g >= dLo.length || g >= dHi.length) {
      fault();
      return g;
    }
    dKid[g] = a;
    dKidN[g] = n;
    dW[g] = w;
    dLo[g] = lo;
    dHi[g] = hi;
    return g;
  }

  /** Doc.Tok.width: a comment's first line (to its second line's offset); other text with a newline never fits. */
  private tokWidthOf(t: i32): i32 {
    const inp = this.inp;
    const idx = this.firstBreak(t);
    if (idx === -1) {
      return strUtf16Len(this.tokFlat(t));
    }
    return (atI32(inp.tFlags, t) & TF_COMMENT) !== 0 ? idx : MAX_LINE_WIDTH;
  }

  /** Newlines.firstBreak over a tok: the offset (in characters) of its second line, or -1. */
  private firstBreak(t: i32): i32 {
    const inp = this.inp;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return -1;
    }
    const a = tPos[t];
    const e = tEnd[t];
    const src = inp.src;
    for (let i = a; i >= 0 && i < e && i < src.length; i++) {
      const c = toI32(src[i]);
      if (c === 10) {
        return inp.width(a, i + 1);
      }
      if (c === 13) {
        const i1 = i + 1;
        if (i1 < e) {
          if (i1 >= src.length) {
            fault();
            return -1;
          }
          if (toI32(src[i1]) === 10) {
            return inp.width(a, i1 + 1);
          }
        }
        return inp.width(a, i1);
      }
    }
    // The scan stopped short of `e` only at an index outside `src`.
    if (a < e && (a < 0 || e > src.length)) {
      fault();
    }
    return -1;
  }

  /** Doc.Tok.flat: a `//` comment gets a space after the slashes; `/* name = *\/` becomes `/* name= *\/`. */
  private tokFlat(t: i32): string {
    const inp = this.inp;
    const a = atI32(inp.tPos, t);
    const e = atI32(inp.tEnd, t);
    if ((atI32(inp.tFlags, t) & TF_LINE_COMMENT) !== 0) {
      let spaced = false;
      if (toI64(e) - toI64(a) >= toI64(3)) {
        // `a + 2 < e`, so the conversion is exact.
        spaced = atU8(inp.src, toI32(toI64(a) + toI64(2))) === 32;
      }
      if (!spaced) {
        return `// ${bytesText(inp.src, jlAdd(a, 2), e)}`;
      }
    }
    const p = reformatParameterComment(inp, t);
    return p !== null ? p : inp.text(t);
  }

  /** The total width of `kids[a, e)`, saturating at MAX_LINE_WIDTH. */
  private kidsWidth(a: i32, e: i32): i32 {
    const kids = this.kids;
    const dW = this.dW;
    let w = 0;
    for (let i = a; i < e; i++) {
      if (i < 0 || i >= kids.length) {
        fault();
        return MAX_LINE_WIDTH;
      }
      const k = kids[i];
      if (k < 0 || k >= dW.length) {
        fault();
        return MAX_LINE_WIDTH;
      }
      w = jlAdd(w, dW[k]);
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
      const cap = jlCap(i);
      this.acKind = growI32(this.acKind, cap);
      this.acA = growI32(this.acA, cap);
      this.acB = growI32(this.acB, cap);
    }
    const acKind = this.acKind;
    const acA = this.acA;
    const acB = this.acB;
    if (i < 0 || i >= acKind.length || i >= acA.length || i >= acB.length) {
      fault();
      return;
    }
    acKind[i] = kind;
    acA[i] = a;
    acB[i] = b;
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
        const cap = jlCap(s);
        this.savedTag = growI32(this.savedTag, cap);
        this.savedVal = growI32(this.savedVal, cap);
      }
      const savedTag = this.savedTag;
      const savedVal = this.savedVal;
      const taken0 = this.tagTaken;
      if (s < 0 || s >= savedTag.length || s >= savedVal.length || tag < 0 || tag >= taken0.length) {
        fault();
        return;
      }
      // SavedBreakTag keeps BreakTag.wasBreakTaken(), which reads an unset tag as not taken.
      savedTag[s] = tag;
      savedVal[s] = taken0[tag] === 1 ? 1 : 0;
      this.nSaved = s + 1;
    }
    const tagTaken = this.tagTaken;
    if (tag < 0 || tag >= tagTaken.length) {
      fault();
      return;
    }
    tagTaken[tag] = taken ? 1 : 0;
  }

  /**
   * Solver.group: a group that fits is laid out flat, otherwise split at its
   * direct breaks, whose indent is `indent` plus the group's. Answers the
   * column after it.
   */
  private solveGroup(g: i32, indent: i32, col: i32): i32 {
    const dW = this.dW;
    const dA = this.dA;
    if (g < 0 || g >= dW.length || g >= dA.length) {
      fault();
      return col;
    }
    const end = jlAdd(col, dW[g]);
    if (end <= this.maxWidth) {
      this.addAction(A_FLAT, g, 0);
      return end;
    }
    return this.broken(g, jlAdd(indent, this.evalIndent(dA[g])), col);
  }

  // The result of the last `segment`: its column, and whether it fit.
  segCol: i32 = 0;
  segFits: boolean = true;

  private broken(g: i32, indent: i32, col0: i32): i32 {
    let col = col0;
    let before = -1;
    let previousFits = true;
    const dKid = this.dKid;
    const dKidN = this.dKidN;
    if (g < 0 || g >= dKid.length || g >= dKidN.length) {
      fault();
      return col;
    }
    const a = dKid[g];
    const e = jlAdd(a, dKidN[g]);
    const kids = this.kids;
    const dKind = this.dKind;
    let segStart = a;
    for (let i = a; i < e; i++) {
      if (i < 0 || i >= kids.length) {
        fault();
        return col;
      }
      const d = kids[i];
      if (d < 0 || d >= dKind.length) {
        fault();
        return col;
      }
      if (dKind[d] === D_BREAK) {
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
      const dA = this.dA;
      const dW = this.dW;
      if (before >= dA.length || before >= dW.length) {
        fault();
        this.segCol = col;
        this.segFits = true;
        return;
      }
      const taken =
        dA[before] !== INDEPENDENT || !previousFits || jlAdd(jlAdd(col, dW[before]), segmentWidth) > this.maxWidth;
      col = this.breakAt(before, taken, indent, col);
      if (this.firstLineEnded) {
        this.segCol = col;
        this.segFits = true;
        return;
      }
    }
    const fits = jlAdd(col, segmentWidth) <= this.maxWidth;
    const kids = this.kids;
    for (let i = a; i < e; i++) {
      if (i < 0 || i >= kids.length) {
        fault();
        break;
      }
      col = this.leaf(kids[i], indent, col);
      if (this.firstLineEnded) {
        break;
      }
    }
    this.segCol = col;
    this.segFits = fits;
  }

  /** Solver.breakOp. */
  private breakAt(b: i32, taken: boolean, indent: i32, col: i32): i32 {
    const dD = this.dD;
    const dC = this.dC;
    const dW = this.dW;
    if (b < 0 || b >= dD.length || b >= dC.length || b >= dW.length) {
      fault();
      return col;
    }
    const tag = dD[b];
    const plusIndent = dC[b];
    const w = dW[b];
    if (tag >= 0) {
      this.recordTag(tag, taken);
    }
    if (taken) {
      this.endLine(col);
      if (this.firstLineEnded) {
        return col;
      }
      let ni = jlAdd(indent, this.evalIndent(plusIndent));
      if (ni < 0) {
        ni = 0;
      }
      this.lineIndent = ni;
      this.addAction(A_NEWLINE, 1, 0);
      this.addAction(A_INDENT, ni, 0);
      return ni;
    }
    this.addAction(A_FLAT, b, 0);
    return jlAdd(col, w);
  }

  private leaf(d: i32, indent: i32, col: i32): i32 {
    const dKind = this.dKind;
    const dA = this.dA;
    const dB = this.dB;
    const dW = this.dW;
    if (d < 0 || d >= dKind.length || d >= dA.length || d >= dB.length || d >= dW.length) {
      fault();
      return col;
    }
    const kind = dKind[d];
    if (kind === D_GROUP) {
      return this.solveGroup(d, indent, col);
    }
    if (kind === D_CHOICE) {
      return this.choice(d, indent, col);
    }
    const da = dA[d];
    const w = dW[d];
    if (kind === D_TEXT) {
      // newDoc gave a token with a line break MAX_LINE_WIDTH, so a narrower
      // one has none and firstBreak would answer -1.
      if (w === MAX_LINE_WIDTH) {
        const kTok = this.inp.kTok;
        if (da < 0 || da >= kTok.length) {
          fault();
          return col;
        }
        const nl = this.firstBreak(kTok[da]);
        if (nl >= 0) {
          this.endLine(jlAdd(col, nl));
        }
      }
      this.addAction(A_FLAT, d, 0);
      return jlAdd(col, w);
    }
    if (kind === D_STR || kind === D_SPACE) {
      this.addAction(A_FLAT, d, 0);
      return jlAdd(col, w);
    }
    if (kind === D_LINES) {
      const id = dB[d];
      const lnStart = this.lnStart;
      const lnCount = this.lnCount;
      const lnText = this.lnText;
      if (id < 0 || id >= lnStart.length || id >= lnCount.length) {
        fault();
        return col;
      }
      const s = lnStart[id];
      const n = lnCount[id];
      if (s < 0 || s >= lnText.length) {
        fault();
        return col;
      }
      this.endLine(jlAdd(col, strUtf16Len(lnText[s])));
      if (this.firstLineEnded) {
        return col;
      }
      const ind = this.lineIndent;
      this.addAction(A_LINE, s, d);
      let newlines = 0;
      // Line `q` is line `s + i`.
      let q = s;
      for (let i = 1; i < n; i++) {
        if (q < 0 || q >= lnText.length) {
          fault();
          return col;
        }
        q = q + 1;
        newlines = jlInc(newlines);
        if (q >= lnText.length) {
          fault();
          return col;
        }
        if (lnText[q].length === 0) {
          continue;
        }
        this.addAction(A_NEWLINE, newlines, 0);
        newlines = 0;
        if (ind > 0) {
          this.addAction(A_INDENT, ind, 0);
        }
        this.addAction(A_LINE, q, d);
      }
      if (newlines > 0) {
        this.addAction(A_NEWLINE, newlines, 0);
      }
      return jlAdd(col, MAX_LINE_WIDTH);
    }
    if (kind === D_HEADER) {
      if (da === 0) {
        const nh = this.nHeader;
        if (nh >= toI32(this.headerIndents.length)) {
          this.headerIndents = growI32(this.headerIndents, jlCap(nh));
        }
        const headerIndents = this.headerIndents;
        if (nh < 0 || nh >= headerIndents.length) {
          fault();
          return col;
        }
        headerIndents[nh] = this.lineIndent;
        this.nHeader = nh + 1;
      } else {
        const nh = this.nHeader;
        if (nh > 0) {
          this.nHeader = nh - 1;
        } else {
          this.fail("a header's end without its start");
        }
      }
      return col;
    }
    if (kind === D_TOK) {
      const text = this.rewrite(this.commentsEngine, da, this.maxWidth, col);
      // The rewriter reports a comment it cannot format on the engine it was given.
      if (this.commentsEngine.failed) {
        this.fail(this.commentsEngine.failure);
      }
      const nl = jlFirstBreak(text);
      if (nl >= 0) {
        this.endLine(jlAdd(col, nl));
      }
      const i = this.nAc;
      const acText = this.acText;
      while (toI32(acText.length) <= i) {
        acText.push("");
      }
      if (i < 0 || i >= acText.length) {
        fault();
        return col;
      }
      acText[i] = text;
      this.addAction(A_TOKTEXT, i, d);
      return jlAdd(col, jlLastLineWidth(text));
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
    const dW = this.dW;
    const dA = this.dA;
    const dB = this.dB;
    const dC = this.dC;
    const dD = this.dD;
    if (c < 0 || c >= dW.length || c >= dA.length || c >= dB.length || c >= dC.length || c >= dD.length) {
      fault();
      return col;
    }
    const end = jlAdd(col, dW[c]);
    if (end <= this.maxWidth) {
      this.addAction(A_FLAT, c, 0);
      return end;
    }
    const preferred = dA[c];
    const prefixWidth = dB[c];
    const fallback = dC[c];
    if (dD[c] === 1 && this.fallbackFitsOnNextLine(fallback, indent, col)) {
      return this.solveGroup(fallback, indent, col);
    }
    const prefixEnd = jlAdd(col, prefixWidth);
    let onHeaderLine = false;
    const nh = this.nHeader;
    if (nh > 0) {
      const headerIndents = this.headerIndents;
      if (nh > headerIndents.length) {
        fault();
        return col;
      }
      onHeaderLine = headerIndents[nh - 1] === this.lineIndent;
    }
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
    const dKid = this.dKid;
    const dKidN = this.dKidN;
    const dA = this.dA;
    if (fallback < 0 || fallback >= dKid.length || fallback >= dKidN.length || fallback >= dA.length) {
      fault();
      return false;
    }
    const a = dKid[fallback];
    const e = jlAdd(a, dKidN[fallback]);
    const groupIndent = dA[fallback];
    const kids = this.kids;
    const dKind = this.dKind;
    let breakIndex = -1;
    for (let i = a; i < e; i++) {
      if (i < 0 || i >= kids.length) {
        fault();
        return false;
      }
      const k = kids[i];
      if (k < 0 || k >= dKind.length) {
        fault();
        return false;
      }
      if (dKind[k] === D_BREAK) {
        if (breakIndex !== -1) {
          return false;
        }
        breakIndex = i;
      }
    }
    if (breakIndex === -1 || jlAdd(col, this.kidsWidth(a, breakIndex)) > this.maxWidth) {
      return false;
    }
    if (breakIndex < 0 || breakIndex >= kids.length) {
      fault();
      return false;
    }
    const brk = kids[breakIndex];
    let ni = jlAdd(jlAdd(indent, this.evalIndent(groupIndent)), this.evalIndent(atI32(this.dC, brk)));
    if (ni < 0) {
      ni = 0;
    }
    return jlAdd(ni, this.kidsWidth(breakIndex + 1, e)) <= this.maxWidth;
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
    const savedNHeader = this.nHeader;
    const savedHeaders = sliceI32s(this.headerIndents, 0, savedNHeader);
    const nt = this.nTrials;
    if (nt >= toI32(this.trialMark.length)) {
      this.trialMark = growI32(this.trialMark, jlCap(nt));
    }
    const trialMark = this.trialMark;
    if (nt < 0 || nt >= trialMark.length) {
      fault();
      return col;
    }
    trialMark[nt] = this.nSaved;
    this.nTrials = nt + 1;
    const end = this.solveGroup(g, indent, col);
    const ended = this.firstLineEnded;
    const column = ended ? this.firstLineEndColumn : end;
    this.firstLineEnded = false;
    this.lineIndent = savedLineIndent;
    const headerIndents = this.headerIndents;
    for (let i = 0; i < savedNHeader; i++) {
      if (i >= headerIndents.length || i >= savedHeaders.length) {
        fault();
        return column;
      }
      headerIndents[i] = savedHeaders[i];
    }
    this.nHeader = savedNHeader;
    this.nAc = mark;
    const trial = jlDec(this.nTrials);
    this.nTrials = trial;
    const from = atI32(this.trialMark, trial);
    const tagTaken = this.tagTaken;
    const savedTag = this.savedTag;
    const savedVal = this.savedVal;
    for (let s = jlDec(this.nSaved); s >= from; s--) {
      if (s < 0 || s >= savedTag.length || s >= savedVal.length) {
        fault();
        return column;
      }
      const tag = savedTag[s];
      if (tag < 0 || tag >= tagTaken.length) {
        fault();
        return column;
      }
      tagTaken[tag] = savedVal[s];
    }
    this.nSaved = from;
    this.trialLineEnded = ended;
    return column;
  }

  /** Replays the actions to JavaOutput. */
  private replay(): void {
    const inp = this.inp;
    const nAc = this.nAc;
    for (let i = 0; i < nAc; i++) {
      const acKind = this.acKind;
      const acA = this.acA;
      const acB = this.acB;
      if (i >= acKind.length || i >= acA.length || i >= acB.length) {
        fault();
        return;
      }
      const kind = acKind[i];
      const aa = acA[i];
      if (kind === A_FLAT) {
        const d = aa;
        const dKind = this.dKind;
        const dA = this.dA;
        const dLo = this.dLo;
        const dHi = this.dHi;
        if (d < 0 || d >= dKind.length || d >= dA.length || d >= dLo.length || d >= dHi.length) {
          fault();
          return;
        }
        const lo = dLo[d];
        const hi = dHi[d];
        if (dKind[d] === D_TEXT) {
          const kTok = inp.kTok;
          const tPos = inp.tPos;
          const tEnd = inp.tEnd;
          const k = dA[d];
          if (k < 0 || k >= kTok.length) {
            fault();
            return;
          }
          const t = kTok[k];
          if (t < 0 || t >= tPos.length || t >= tEnd.length) {
            fault();
            return;
          }
          this.append(inp.src, tPos[t], tEnd[t], lo, hi);
        } else {
          this.scratch.n = 0;
          this.flat(d);
          this.append(this.scratch.buf, 0, this.scratch.n, lo, hi);
        }
      } else if (kind === A_TOKTEXT || kind === A_LINE) {
        const d = acB[i];
        const texts = kind === A_TOKTEXT ? this.acText : this.lnText;
        const dLo = this.dLo;
        const dHi = this.dHi;
        if (aa < 0 || aa >= texts.length || d < 0 || d >= dLo.length || d >= dHi.length) {
          fault();
          return;
        }
        this.appendStr(texts[aa], dLo[d], dHi[d]);
      } else if (kind === A_NEWLINE) {
        const n = aa;
        if (n === 1) {
          // append("\n") with no toks: a pending newline, and the spaces before it dropped.
          if (this.newlinesPending === 0) {
            this.newlinesPending = 1;
          }
          this.nSpaces = 0;
        } else {
          this.scratch.n = 0;
          this.scratch.newlines(n);
          this.append(this.scratch.buf, 0, n, -1, -1);
        }
      } else {
        this.indent(aa);
      }
    }
  }

  /** Doc.appendFlat into the scratch buffer. */
  private flat(d: i32): void {
    const dKind = this.dKind;
    const dA = this.dA;
    const dB = this.dB;
    const dC = this.dC;
    if (d < 0 || d >= dKind.length || d >= dA.length || d >= dB.length || d >= dC.length) {
      fault();
      return;
    }
    const kind = dKind[d];
    const s = this.scratch;
    if (kind === D_GROUP) {
      const dKid = this.dKid;
      const dKidN = this.dKidN;
      if (d >= dKid.length || d >= dKidN.length) {
        fault();
        return;
      }
      const a = dKid[d];
      const e = jlAdd(a, dKidN[d]);
      const kids = this.kids;
      for (let i = a; i < e; i++) {
        if (i < 0 || i >= kids.length) {
          fault();
          return;
        }
        this.flat(kids[i]);
      }
    } else if (kind === D_CHOICE) {
      this.flat(dC[d]);
    } else if (kind === D_TEXT) {
      const inp = this.inp;
      const kTok = inp.kTok;
      const k = dA[d];
      if (k < 0 || k >= kTok.length) {
        fault();
        return;
      }
      const t = kTok[k];
      const tPos = inp.tPos;
      const tEnd = inp.tEnd;
      if (t < 0 || t >= tPos.length || t >= tEnd.length) {
        fault();
        return;
      }
      s.range(inp.src, tPos[t], tEnd[t]);
    } else if (kind === D_STR || kind === D_BREAK) {
      const f = kind === D_STR ? dA[d] : dB[d];
      const flats = this.flats;
      if (f < 0 || f >= flats.length) {
        fault();
        return;
      }
      s.str(flats[f]);
    } else if (kind === D_SPACE) {
      s.byte(32);
    } else if (kind === D_TOK) {
      s.str(this.tokFlat(dA[d]));
    }
  }

  // ---- JavaOutput ------------------------------------------------------------

  private appendStr(s: string, lo: i32, hi: i32): void {
    // The bytes of `s` go through the scratch buffer, which nothing else holds here.
    const sc = this.scratch;
    sc.n = 0;
    sc.str(s);
    this.append(sc.buf, 0, sc.n, lo, hi);
  }

  indent(n: i32): void {
    for (let i = 0; i < n; i++) {
      this.pushSpace(32);
    }
  }

  private pushSpace(c: i32): void {
    const spaces = this.spaces;
    const n = this.nSpaces;
    if (n < 0) {
      fault();
      return;
    }
    if (n >= spaces.length) {
      // Grown as the old copy to `n * 2 + 16` bytes did.
      const cap = jlCap(n);
      while (spaces.length < cap) {
        spaces.push(0);
      }
    }
    if (n >= spaces.length) {
      fault();
      return;
    }
    spaces[n] = toU8(c);
    this.nSpaces = n + 1;
  }

  /** JavaOutput.append of `buf[a, b)` covering tok numbers [lo, hi). */
  append(buf: u8[], a: i32, b: i32, lo: i32, hi: i32): void {
    // Every path reads `buf[a]` when `a < b`, and the run below reads all of
    // `buf[a, b)`, so a range outside `buf` is where the old reads panicked.
    let isComment = false;
    let isNewline = false;
    if (a < b) {
      if (a < 0 || a >= buf.length || b > buf.length) {
        fault();
        return;
      }
      const c0 = toI32(buf[a]);
      const a1 = a + 1;
      if (a1 < b && a1 < buf.length) {
        const c1 = toI32(buf[a1]);
        isComment = c0 === 47 && (c1 === 47 || c1 === 42);
        isNewline = a1 + 1 === b && c0 === 13 && c1 === 10;
      } else {
        isNewline = c0 === 10 || c0 === 13;
      }
    }
    const inp = this.inp;
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
        il = il + 1;
      }
      this.iLine = il;
      const w = this.wanted(this.lastK);
      if ((sawNewlines && isComment) || w === 1 || (w === -1 && sawNewlines)) {
        this.newlinesPending = jlInc(this.newlinesPending);
      }
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
      // `0 <= a <= i < b <= buf.length` whenever this runs; the length test
      // restates it after each call.
      while (i >= 0 && i < b && i < buf.length) {
        const c = toI32(buf[i]);
        if (c === 32 || c === 9) {
          this.pushSpace(c);
          i++;
        } else if (c === 13 || c === 10) {
          this.nSpaces = 0;
          this.newlinesPending = jlInc(this.newlinesPending);
          const i1 = i + 1;
          if (c === 13 && i1 < b && i1 < buf.length && toI32(buf[i1]) === 10) {
            i = i1 + 1;
          } else {
            i = i1;
          }
        } else {
          let np = this.newlinesPending;
          while (np > 0) {
            if (this.nOutLines > 0 || out.n > this.lineStart) {
              out.byte(10);
              this.nOutLines = jlInc(this.nOutLines);
              this.lineStart = out.n;
            }
            rangesSet = false;
            np = np - 1;
            this.newlinesPending = np;
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

  /** JavaOutput.flush, then the replacement's line separators: every line ends in "\n". */
  flush(): void {
    const out = this.out;
    let blank = true;
    const ob = out.buf;
    const on = out.n;
    for (let i = this.lineStart; i < on; i++) {
      if (i < 0 || i >= ob.length) {
        fault();
        return;
      }
      const c = toI32(ob[i]);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 11) {
        blank = false;
        break;
      }
    }
    if (!blank) {
      out.byte(10);
      this.nOutLines = jlInc(this.nOutLines);
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
      const kN = this.inp.kN;
      this.addLineRange(eofLine, kN, jlInc(kN));
    }
  }

  /** Lays out the events the visitor emitted and writes the result into `out`. */
  layout(): boolean {
    if (this.failed) {
      return false;
    }
    // A fault in one phase leaves the next nothing sound to build on.
    this.markForPartialFormat();
    this.spliceComments();
    if (faulted()) {
      return false;
    }
    const root = this.buildTree();
    if (faulted()) {
      return false;
    }
    this.nAc = 0;
    this.firstLineEnded = false;
    this.lineIndent = 0;
    this.nHeader = 0;
    this.nTrials = 0;
    this.nSaved = 0;
    this.solveGroup(root, 0, 0);
    if (faulted()) {
      return false;
    }
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
