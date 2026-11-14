// The formatter: classified lines to output text.
//
// Decides each line's indent and the blank lines before it, joins short
// function bodies and empty blocks onto one line, lays each line out within
// the column limit (layout.ts), aligns trailing comments, reflows comments
// that overflow, and writes the result.

import { LT_OTHER, P_ARROW, P_ARROWSTAR, P_COLONCOLON, P_LPAREN, P_PERIOD } from "./tok";
import { Classifier, isTrailingComment, spaceBefore } from "./classify";
import { Doc, growI32 } from "./doc";
import { Annot } from "./annotate";
import { Indenter } from "./indenter";
import { displayColumn, hasBom, lex, widthOf } from "./lexer";
import { Out } from "./out";
import { utf8Width } from "./uwidth";
import { Parser, isOperatorAfterVar, isQtWord, tokenCanStartNewLine } from "./parser";
import {
  BK_BLOCK,
  K_COMMENT,
  K_HEADER,
  K_EOF,
  KW_CLASS,
  KW_ENUM,
  KW_NAMESPACE,
  KW_NOEXCEPT,
  KW_PRIVATE,
  KW_PROTECTED,
  KW_PUBLIC,
  KW_STRUCT,
  KW_UNION,
  LT_IMPORT,
  LT_PREPROCESSOR,
  P_COLON,
  P_LBRACE,
  P_RBRACE,
  P_SEMI,
  TT_BLOCK_COMMENT,
  TT_IMPLICIT_STRING_LITERAL,
  TT_DO_WHILE,
  TT_CLASS_LBRACE,
  TT_FUNCTION_LBRACE,
  TT_LINE_COMMENT,
  TT_NAMESPACE_LBRACE,
  TT_STRUCT_LBRACE,
  TT_UNION_LBRACE,
  TT_ENUM_LBRACE,
  TT_CONTROL_STATEMENT_LBRACE,
  TT_ELSE_LBRACE,
  KW_INLINE,
  KW_TEMPLATE,
  TT_CONDITIONAL_EXPR,
  PREC_CONDITIONAL,
  P_QUESTION,
  P_COMMA,
  KW_WHILE,
  P_RPAREN,
  P_HASH,
  PP_IF,
  PP_ELIF,
  PP_DEFINE,
  KW_SWITCH,
  P_GREATER,
  P_LESS,
  PP_PRAGMA,
  PP_ERROR,
  TT_UNKNOWN,
  KW_EXTERN,
  KW_DEFAULT,
  KW_CASE,
  KW_CATCH,
  KW_TRY,
  KW_FOR,
  KW_DO,
  KW_ELSE,
  KW_IF,
  PP_INCLUDE,
  PP_ENDIF,
  PP_ELSE,
  K_IDENT,
  K_STRING,
  KW_USING,
  KW_TYPENAME,
} from "./tok";

const PIECE: i32 = -1048576;
const RAW: i32 = -2097152; // source bytes written as they are, emitted as RAW - index
const PASS_FAIL: i32 = 0;
const PASS_OK: i32 = 1;
const PASS_RESTART: i32 = 2;

const isNameByte = (c: i32): boolean => (c >= 48 && c <= 58) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

const isBlankByte = (c: i32): boolean => c === 32 || c === 9 || c === 11 || c === 12 || c === 13;

/** ASCII punctuation, as C's ispunct. */
const isPunct = (c: i32): boolean => (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);

/** Bytes in the UTF-8 sequence led by `c`. */
const utf8LenOf = (c: i32): i32 => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/** The index of the last `c` code unit in `s`, or -1. */
const lastIndexOfChar = (s: string, c: i32): i32 => {
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    if (s.charCodeAt(i) === c) {
      return i;
    }
  }
  return -1;
};

/** `s` with ASCII capitals lowered. */
const lower = (s: string): string => {
  let out = "";
  let from = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      out = out + s.slice(from, i) + String.fromCharCode(c + 32);
      from = i + 1;
    }
  }
  return from === 0 ? s : out + s.slice(from);
};

export class Formatter {
  words: Parser; // for its token predicates
  d: Doc;
  cls: Classifier;
  ann: Annot;
  ind: Indenter;
  // The emission list: tokens in output order, with the newlines before each
  // and the column it starts at.
  nem: i32 = 0;
  emTok: i32[];
  emNl: i32[];
  emCol: i32[];
  emColPre: i32[]; // emCol before trailing comments were aligned
  synth: string[]; // text of synthetic tokens, emitted as -1 - index
  // Pieces of a split string literal, emitted as PIECE - index: the token's
  // prefix, content bytes [pcA, pcB), and its closing quote.
  rawA: i32[];
  rawB: i32[];
  nraw: i32 = 0;
  escCol: i32[]; // per directive (its `#`): the column its escaped newlines line up at
  escStamp: i32[];
  pcTok: i32[];
  pcA: i32[];
  pcB: i32[];
  npc: i32 = 0;
  verbatim: boolean = false;
  // Conditional compilation passes.
  rec: boolean = false; // write() records each source token's output span
  recCur: i32 = -1;
  recOrd: boolean = false;
  ord: i32[]; // pass 0: source tokens in output order
  uS: i32[]; // per source token: start of its span in this pass's output, -1 if none
  uE: i32[];
  uSs: i32[][];
  uEs: i32[][];
  passOuts: Out[];
  vis: i32[][]; // per pass: 1 for each source token the pass sees
  ppIdx: i32[]; // clang-format's PPLevelBranchIndex
  ppCnt: i32[]; // clang-format's PPLevelBranchCount
  fullN: i32 = 0;
  npass: i32 = 0; // passes of the current file
  curPass: i32 = 0;
  seenBefore: i32[]; // per source token: 1 when a pass before the current one saw it
  useful: i32[]; // per pass: 1 when it sees a token no earlier pass saw
  seenBy: i32[];
  map: i32[]; // pass token -> source token
  o2p: i32[]; // source token -> pass token, -1 if skipped
  decFull: i32[]; // source token -> its FormatDecision (see Doc.dec)
  passSeen: i32[]; // source token -> passes so far that saw it
  finCol: i32[]; // source comment token -> the column the pass that formatted it left it at
  sKind: i32[];
  sStart: i32[];
  sEnd: i32[];
  sNl: i32[];
  sWs: i32[];
  sCol: i32[];
  sWidth: i32[];
  sMulti: i32[];
  sPlain: i32[];
  sInPP: i32[];
  sPPKind: i32[];
  sPPId: i32[];
  sUnesc: i32[];
  sType: i32[];
  sFinal: i32[];
  bracesBalanced: boolean = true;
  bcLa: i32[]; // block comment lines being written: line, content and content column
  bcLe: i32[];
  bcCa: i32[];
  bcCe: i32[];
  bcCc: i32[];
  bcDeco: i32 = 0;
  bcLast: i32 = 0;
  bcBreaks: i32 = 0; // breaks writeBlockComment inserted
  asmSkew: i32 = 0; // after inline assembly on this line: how far past the formatter's column the text ends
  bcEsc: i32 = -1; // writeBlockComment inside a directive: the column of its escapes
  bcPP: boolean = false;
  bcTail: i32 = 0; // writeBlockComment: the comment's unbreakable tail (see unbreakableTail)
  // A one-line block comment in a directive was split: clang-format's next
  // run lays the directive out again around the now multi-line comment.
  gA: i32 = 0; // lineGeom: content start, end, start column, raw prefix length
  gE: i32 = 0;
  gStart: i32 = 0;
  gPre: i32 = 0;
  rerunMacro: boolean = false; // the rerun is for a macro call left alone: run until it settles
  rerun: boolean = false; // writeBlockComment inside a directive (drops `\`, keeps room for it)
  bcFirstW: i32 = 0; // blockCommentPenalty: the width of the comment's first line
  bcShrink: i32 = 0; // blockCommentPenalty: how much narrower the comment got, kept on one line
  bcScratch: Out; // blockCommentPenalty's dry run
  secScratch: Out; // sectionWidth's dry run
  secW: i32 = 0; // sectionWidth: the widest line
  idStamp: i32[]; // isInlineDirective's memory: valid while equal to untGen
  idNext: i32[]; // and the line after the directive run
  secEnd: i32 = -1; // sectionWidth: the section's last entry
  bcShift: Out; // a block comment reflowed before alignment, then shifted
  splitDecoStar: boolean = false;
  rawPP: i32[]; // per raw entry: its directive's `#`, or -1
  untouched: i32[]; // per token, when stamped: 1 kept as written (off region, invalid line), 2 an implicit string literal
  untStamp: i32[];
  untGen: i32 = 0;
  hasOffFull: boolean = false; // multi-pass: off regions over every token
  offFull: i32[];
  outNl: i32[]; // per token: newlines before it in the output (when stamped)
  outNlStamp: i32[];
  hasOff: boolean = false; // the file has a `clang-format off` region
  offTok: i32[]; // 1 for a token inside an off region, when hasOff
  prevLine: i32 = -1;
  // A line comment section being written: per line, its prefix and content.
  scKnown: i32[];
  scStart: i32[];
  scKeep: i32[];
  scExtra: i32[];
  scA: i32[];
  scE: i32[];
  scCol: i32[];
  scSplitA: i32 = 0;
  scSplitN: i32 = 0;
  wsCol: i32 = 0;
  cfwStamp: i32[];
  cfwVal: i32[];
  fileStamp: i32 = 1;
  firstEmitted: boolean = false;
  acLev: i32[];
  // The file's name, for its main include: lowercased stem, and whether it is a source file.
  fileStem: string = "";
  isMainFile: boolean = false;
  cpMax: i32 = 0; // commentPenalty's widest piece
  // commentPenalty's memory, per token: valid while cpcGen holds cpGen.
  cpGen: i32 = 1;
  cpcGen: i32[];
  cpcCol: i32[];
  cpcLine: i32[];
  cpcMax: i32[];
  cpcVal: i64[];
  // sortIncludesText's current block: line and header name ranges, categories.
  incA: i32[];
  incE: i32[];
  incNa: i32[];
  incNe: i32[];
  incCat: i32[];
  incEdits: i32[]; // pairs: replaced range
  incText: u8[][]; // the replacement for each pair
  incNameA: i32 = 0;
  incNameE: i32 = 0;
  fileName: string = ""; // the file's name, lower case

  constructor(d: Doc) {
    this.words = new Parser(d);
    this.bcScratch = new Out(256);
    this.secScratch = new Out(256);
    this.idStamp = new Array<i32>(0);
    this.idNext = new Array<i32>(0);
    this.cpcGen = new Array<i32>(0);
    this.cpcCol = new Array<i32>(0);
    this.cpcLine = new Array<i32>(0);
    this.cpcMax = new Array<i32>(0);
    this.cpcVal = new Array<i64>(0);
    this.bcShift = new Out(256);
    this.incA = new Array<i32>(0);
    this.incE = new Array<i32>(0);
    this.incNa = new Array<i32>(0);
    this.incNe = new Array<i32>(0);
    this.incCat = new Array<i32>(0);
    this.incEdits = new Array<i32>(0);
    this.incText = [];
    this.offTok = new Array<i32>(0);
    this.ord = new Array<i32>(0);
    this.uS = new Array<i32>(0);
    this.uE = new Array<i32>(0);
    this.map = new Array<i32>(0);
    this.o2p = new Array<i32>(0);
    this.decFull = new Array<i32>(0);
    this.passSeen = new Array<i32>(0);
    this.finCol = new Array<i32>(0);
    this.sKind = new Array<i32>(0);
    this.sStart = new Array<i32>(0);
    this.sEnd = new Array<i32>(0);
    this.sNl = new Array<i32>(0);
    this.sWs = new Array<i32>(0);
    this.sCol = new Array<i32>(0);
    this.sWidth = new Array<i32>(0);
    this.sMulti = new Array<i32>(0);
    this.sPlain = new Array<i32>(0);
    this.sInPP = new Array<i32>(0);
    this.sPPKind = new Array<i32>(0);
    this.sPPId = new Array<i32>(0);
    this.sUnesc = new Array<i32>(0);
    this.sType = new Array<i32>(0);
    this.sFinal = new Array<i32>(0);
    this.ppIdx = new Array<i32>(0);
    this.ppCnt = new Array<i32>(0);
    this.useful = new Array<i32>(0);
    this.seenBefore = new Array<i32>(0);
    this.bcLa = new Array<i32>(0);
    this.bcLe = new Array<i32>(0);
    this.bcCa = new Array<i32>(0);
    this.bcCe = new Array<i32>(0);
    this.bcCc = new Array<i32>(0);
    this.rawPP = new Array<i32>(0);
    this.untouched = new Array<i32>(0);
    this.untStamp = new Array<i32>(0);
    this.offFull = new Array<i32>(0);
    this.outNl = new Array<i32>(0);
    this.outNlStamp = new Array<i32>(0);
    this.seenBy = new Array<i32>(0);
    this.uSs = [];
    this.uEs = [];
    this.passOuts = [];
    this.vis = [];
    this.d = d;
    this.cls = new Classifier(d);
    this.ann = new Annot(d);
    this.ind = new Indenter(d, this.ann);
    this.ind.debug = getenv("FFDEBUG") !== null;
    const cap = d.ntok + 16;
    this.emTok = new Array<i32>(cap);
    this.emNl = new Array<i32>(cap);
    this.emCol = new Array<i32>(cap);
    this.emColPre = new Array<i32>(0);
    this.synth = [];
    this.rawA = new Array<i32>(8);
    this.rawB = new Array<i32>(8);
    this.escCol = new Array<i32>(16);
    this.escStamp = new Array<i32>(16);
    this.pcTok = new Array<i32>(16);
    this.acLev = new Array<i32>(16);
    this.pcA = new Array<i32>(16);
    this.pcB = new Array<i32>(16);
    this.scKnown = new Array<i32>(8);
    this.scStart = new Array<i32>(8);
    this.scKeep = new Array<i32>(8);
    this.scExtra = new Array<i32>(8);
    this.scA = new Array<i32>(8);
    this.scE = new Array<i32>(8);
    this.scCol = new Array<i32>(8);
    this.cfwStamp = new Array<i32>(0);
    this.cfwVal = new Array<i32>(0);
  }

  lineStartCol: i32 = 0;

  /** Records the path being formatted (its main include sorts first). */
  setPath(path: string): void {
    this.rerun = false;
    this.rerunMacro = false;
    let base = path;
    const slash = lastIndexOfChar(path, 47);
    if (slash >= 0) {
      base = path.slice(slash + 1);
    }
    const dot = lastIndexOfChar(base, 46);
    const ext = dot >= 0 ? base.slice(dot) : "";
    this.fileStem = lower(dot > 0 ? base.slice(0, dot) : base);
    this.fileName = lower(base);
    this.isMainFile = ext === ".c" || ext === ".cc" || ext === ".cpp" || ext === ".c++" || ext === ".cxx" || ext === ".m" || ext === ".mm";
  }


  /**
   * Whether header name `quoted` (with its quotes) names this source file's own header, by
   * clang-format's rule: the header's stem starts the file name up to its
   * first dot, or is the file's stem, and that name ends with the stem
   * (or the stem and `test`; IncludeIsMainRegex `(Test)?$`).
   */
  isMainHeaderName(quoted: string): boolean {
    // Only a quoted include can be the main header.
    if (quoted.length < 3 || quoted.charCodeAt(0) !== 34) {
      return false;
    }
    let name = quoted.slice(1, quoted.length - 1);
    const slash = lastIndexOfChar(name, 47);
    if (slash >= 0) {
      name = name.slice(slash + 1);
    }
    const dot = lastIndexOfChar(name, 46);
    const stem = lower(dot > 0 ? name.slice(0, dot) : name);
    if (stem.length === 0) {
      return false;
    }
    const fn = this.fileName;
    let firstDot = -1;
    for (let i = 1; i < fn.length; i++) {
      if (fn.charCodeAt(i) === 46) {
        firstDot = i;
        break;
      }
    }
    const matchingStem = firstDot > 0 ? fn.slice(0, firstDot) : fn;
    let matching = "";
    if (matchingStem.startsWith(stem)) {
      matching = matchingStem;
    } else if (this.fileStem === stem) {
      matching = this.fileStem;
    }
    if (matching.length === 0) {
      return false;
    }
    return this.endsWithPattern(matching, stem) || this.endsWithPattern(matching, stem + "test");
  }

  /** Whether `s` ends with `p`, where a `.` in `p` matches any character (a regex). */
  endsWithPattern(s: string, p: string): boolean {
    const n = p.length;
    if (n > s.length) {
      return false;
    }
    const o = s.length - n;
    for (let i = 0; i < n; i++) {
      const c = p.charCodeAt(i);
      if (c !== 46 && c !== s.charCodeAt(o + i)) {
        return false;
      }
    }
    return true;
  }

  /** Readies the formatter for the next file of its Doc. */
  reset(): void {
    this.nem = 0;
    this.npc = 0;
    this.nraw = 0;
    this.synth = [];
    this.verbatim = false;
    this.firstEmitted = false;
    this.prevLine = -1;
    this.lineStartCol = 0;
    this.cfwStamp = new Array<i32>(0);
    this.cfwVal = new Array<i32>(0);
  }

  emit(t: i32, nl: i32, col: i32): void {
    if (nl > 0) {
      this.lineStartCol = col;
    }
    const i = this.nem;
    if (i >= toI32(this.emTok.length)) {
      this.emTok = growI32(this.emTok, i + 1);
      this.emNl = growI32(this.emNl, i + 1);
      this.emCol = growI32(this.emCol, i + 1);
    }
    this.emTok[i] = t;
    this.emNl[i] = nl;
    this.emCol[i] = col;
    this.nem = i + 1;
  }

  /**
   * Replaces the last emitted token, string literal `t`, with its pieces cut
   * at content offsets `cuts[0 .. n)`; every piece after the first starts a
   * line at `col`.
   */
  splitString(t: i32, prefixLen: i32, cuts: i32[], n: i32, col: i32): void {
    const d = this.d;
    let a = d.start[t] + prefixLen;
    const e = d.end[t] - 1;
    for (let i = 0; i <= n; i++) {
      const b = i < n ? cuts[i] : e;
      const k = this.npc;
      if (k >= toI32(this.pcTok.length)) {
        this.pcTok = growI32(this.pcTok, k + 1);
        this.pcA = growI32(this.pcA, k + 1);
        this.pcB = growI32(this.pcB, k + 1);
      }
      this.pcTok[k] = t;
      this.pcA[k] = a;
      this.pcB[k] = b;
      this.npc = k + 1;
      if (i === 0) {
        this.emTok[this.nem - 1] = PIECE - k;
      } else {
        this.emit(PIECE - k, 1, col);
      }
      a = b;
    }
  }

  /** Emits source bytes [a, b) as they are, right after the last entry. */
  emitRaw(a: i32, b: i32): void {
    const k = this.nraw;
    if (k >= toI32(this.rawA.length)) {
      this.rawA = growI32(this.rawA, k + 1);
      this.rawB = growI32(this.rawB, k + 1);
    }
    this.rawA[k] = a;
    this.rawB[k] = b;
    this.nraw = k + 1;
    const last = this.nem > 0 ? this.emTok[this.nem - 1] : -1;
    // The directive the raw bytes belong to: the entry before's.
    if (k >= toI32(this.rawPP.length)) {
      this.rawPP = growI32(this.rawPP, k + 1);
    }
    this.rawPP[k] = last >= 0 ? this.d.ppId[last] : -1;
    const col = this.nem > 0 ? this.emCol[this.nem - 1] + (last >= 0 ? this.d.width[last] : 0) : 0;
    this.emit(RAW - k, 0, col);
  }

  /** The directive (its `#` token) emitted entry `t` belongs to, or -1. */
  entryPP(t: i32): i32 {
    if (t >= 0) {
      return this.d.ppId[t];
    }
    if (t <= RAW) {
      return this.rawPP[RAW - t];
    }
    if (t <= PIECE) {
      return this.d.ppId[this.pcTok[PIECE - t]];
    }
    return -1;
  }

  /** The output width of piece `k`. */
  pieceWidth(k: i32): i32 {
    const d = this.d;
    const t = this.pcTok[k];
    const pl = this.pieceLen(t);
    return pl + widthOf(d.src, this.pcA[k], this.pcB[k]) + 1;
  }

  /** The prefix length (through the opening quote) of string literal `t`. */
  pieceLen(t: i32): i32 {
    const d = this.d;
    let i = d.start[t];
    while (i < d.end[t] && d.at(i) !== 34) {
      i++;
    }
    return i - d.start[t] + 1;
  }

  /** The width of emitted entry `t` (token, synthetic text or piece). */
  emWidth(t: i32): i32 {
    if (t >= 0) {
      return this.lastLineWidth(t);
    }
    if (t <= RAW) {
      const k = RAW - t;
      let a = this.rawB[k];
      while (a > this.rawA[k] && this.d.at(a - 1) !== 10) {
        a--;
      }
      return widthOf(this.d.src, a, this.rawB[k]);
    }
    if (t <= PIECE) {
      return this.pieceWidth(PIECE - t);
    }
    return toI32(this.synth[-t - 1].length);
  }

  /**
   * The widest line, from column `col`, of the line comment section that
   * starts at entry `i` once written there (a dry run of writeSection); also
   * left in secW, with the section's last entry in secEnd.
   */
  /**
   * Whether a line of the line comment section at entry `i` overflows at
   * column `col` as written; if so its reflowed width is measured
   * (sectionWidth).
   */
  sectionOverflows(i: i32, col: i32): boolean {
    const d = this.d;
    let j = i;
    let over = col + d.width[this.emTok[i]] > d.opts.columnLimit;
    while (j + 1 < this.nem && this.continuesSection(j + 1)) {
      j++;
      if (col + d.width[this.emTok[j]] > d.opts.columnLimit) {
        over = true;
      }
    }
    if (!over) {
      return false;
    }
    this.sectionWidth(i, col);
    return true;
  }

  sectionWidth(i: i32, col: i32): i32 {
    let j = i;
    while (j + 1 < this.nem && this.continuesSection(j + 1)) {
      j++;
    }
    this.secEnd = j;
    const o = this.secScratch;
    o.n = 0;
    const saveRerun = this.rerun;
    const saveWs = this.wsCol;
    this.writeSection(o, i, col);
    this.rerun = saveRerun;
    this.wsCol = saveWs;
    let w = 0;
    let ls = 0;
    let first = true;
    for (let q = 0; q <= o.n; q++) {
      if (q === o.n || o.buf[q] === 10) {
        const lw = widthOf(o.buf, ls, q) - (first ? 0 : col);
        if (lw > w) {
          w = lw;
        }
        first = false;
        ls = q + 1;
      }
    }
    this.secW = w;
    return w;
  }

  /** Whether line `l` starts with `public:`, `protected:` or `private:` (the blank-line rules). */
  isAccessKeyword(l: i32): boolean {
    const d = this.d;
    const f = d.lFirst[l];
    const k = d.kind[f];
    const n = d.nxt[f];
    return (k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED) && n >= 0 && d.kind[n] === P_COLON;
  }

  /** Whether line `l` is an access specifier, Qt's included (the indent rule). */
  isAccessSpecifier(l: i32): boolean {
    const d = this.d;
    const f = d.lFirst[l];
    const k = d.kind[f];
    const n = d.nxt[f];
    if (n < 0) {
      return k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED;
    }
    if (!(k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED)) {
      // Qt: `signals:`, `Q_SIGNALS:`, `<anything> slots:`.
      if (isQtWord(d, f, true) && !isQtWord(d, f, false) && d.kind[n] === P_COLON) {
        return true;
      }
      return isQtWord(d, n, false) && d.nxt[n] >= 0 && d.kind[d.nxt[n]] === P_COLON;
    }
    // Without a colon too (`public ref class`), unless the word was a variable.
    return d.kind[n] !== P_COLONCOLON && !isOperatorAfterVar(d.kind[n]);
  }

  /** The indent of line `l` in its list, with `base` added. */
  indentOf(l: i32, base: i32): i32 {
    const d = this.d;
    if (d.lType[l] === LT_PREPROCESSOR || d.lType[l] === LT_IMPORT) {
      return 0;
    }
    let ind = (d.lAbs[l] === 1 ? 0 : base) + d.lLevel[l] * d.opts.indentWidth;
    if (this.isAccessSpecifier(l)) {
      ind = ind + d.opts.accessModifierOffset;
      if (ind < 0) {
        ind = 0;
      }
    }
    return ind;
  }

  /** Appends `// namespace name` to a namespace's `}` line that lacks a comment. */
  namespaceComment(l: i32): void {
    const d = this.d;
    const rb = d.lFirst[l];
    if (d.inPP[rb] === 1) {
      // Not inside a macro body.
      return;
    }
    let after = d.nxt[rb];
    if (after >= 0 && d.kind[after] === P_SEMI) {
      after = d.nxt[after];
    }
    if (after >= 0 && d.kind[after] === K_COMMENT) {
      this.fixEndComment(rb, d.lOpen[l]);
      return;
    }
    if (d.kind[d.lLast[l]] === K_COMMENT) {
      return;
    }
    const o = d.lOpen[l];
    // Short namespaces (one line of body or less) go without. Lines count as
    // parsed, before short blocks join (`class X {};` is two), child lines
    // included: every parsed line between the braces.
    const body = l - o - 1;
    if (body <= 1) {
      return;
    }
    const name = this.namespaceName(o);
    const text = name.length === 0 ? "// namespace" : `// namespace ${name}`;
    const last = this.emTok[this.nem - 1];
    const col = this.emCol[this.nem - 1] + (last >= 0 ? this.lastLineWidth(last) : 0) + 1;
    this.synth.push(text);
    this.emit(-toI32(this.synth.length), 0, col);
  }

  /**
   * The end comment after namespace `}` `rb` (past a `;`), replaced when it
   * does not name the namespace opened on line `o`.
   */
  fixEndComment(rb: i32, o: i32): void {
    const d = this.d;
    let after = d.nxt[rb];
    if (after >= 0 && d.kind[after] === P_SEMI) {
      after = d.nxt[after];
    }
    if (after < 0 || d.kind[after] !== K_COMMENT) {
      return;
    }
    const name = this.namespaceName(o);
    if (!this.validEndComment(after, name)) {
      for (let i = this.nem - 1; i >= 0; i--) {
        if (this.emTok[i] === after) {
          this.synth.push(name.length === 0 ? "// namespace" : `// namespace ${name}`);
          this.emTok[i] = -toI32(this.synth.length);
          break;
        }
      }
    }
  }

  /** The name a namespace opened on line `o` goes by (empty for an anonymous one). */
  namespaceName(o: i32): string {
    const d = this.d;
    const parts: string[] = [];
    let seen = false;
    for (let t = d.lFirst[o]; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] === KW_NAMESPACE) {
        seen = true;
        continue;
      }
      if (!seen) {
        continue;
      }
      if (d.kind[t] === P_LBRACE) {
        break;
      }
      if (d.kind[t] !== K_COMMENT) {
        parts.push(d.text(t));
      }
    }
    return parts.join("");
  }

  /** Whether comment `c` after a namespace's `}` names namespace `name` (clang-format's pattern). */
  validEndComment(c: i32, name: string): boolean {
    const d = this.d;
    const e = d.end[c];
    let i = d.start[c] + 2;
    while (i < e && d.at(i) === 32) {
      i++;
    }
    if (this.wordAt(i, e, "end ")) {
      i = i + 4;
      if (this.wordAt(i, e, "of ")) {
        i = i + 3;
      }
    }
    while (i < e && d.at(i) === 32) {
      i++;
    }
    let anon = false;
    if (this.wordAt(i, e, "anonymous")) {
      i = i + 9;
      anon = true;
    } else if (this.wordAt(i, e, "unnamed")) {
      i = i + 7;
      anon = true;
    }
    while (i < e && d.at(i) === 32) {
      i++;
    }
    if (!this.wordAt(i, e, "namespace")) {
      return false;
    }
    i = i + 9;
    // ( +([a-zA-Z0-9:_ ]+))? \.? *(\*/)?$
    let nameA = i;
    let nameB = i;
    if (i < e && d.at(i) === 32) {
      let j = i;
      while (j < e && d.at(j) === 32) {
        j++;
      }
      let k = j;
      while (k < e && (isNameByte(d.at(k)) || d.at(k) === 32)) {
        k++;
      }
      if (k > j) {
        nameA = j;
        nameB = k;
        i = k;
      }
    }
    if (i < e && d.at(i) === 46) {
      i++;
    }
    while (i < e && d.at(i) === 32) {
      i++;
    }
    if (i + 1 < e && d.at(i) === 42 && d.at(i + 1) === 47) {
      i = i + 2;
    }
    if (i !== e) {
      return false;
    }
    while (nameB > nameA && d.at(nameB - 1) === 32) {
      nameB--;
    }
    const inComment = String.fromBytes(d.src, nameA, nameB);
    if (name.length === 0 && inComment.length !== 0) {
      return false;
    }
    if (name.length !== 0 && anon) {
      return false;
    }
    if (inComment === name) {
      return true;
    }
    // The name may continue on the next comment line.
    const n = d.nxt[c];
    if (n < 0 || d.kind[n] !== K_COMMENT || d.at(d.start[n] + 1) !== 47) {
      return false;
    }
    const ne = d.end[n];
    let q = d.start[n] + 2;
    let qa = q;
    let qb = q;
    if (q < ne && d.at(q) === 32) {
      while (q < ne && d.at(q) === 32) {
        q++;
      }
      qa = q;
      while (q < ne && isNameByte(d.at(q))) {
        q++;
      }
      qb = q;
    }
    if (q < ne && d.at(q) === 46) {
      q++;
    }
    while (q < ne && d.at(q) === 32) {
      q++;
    }
    if (q !== ne) {
      return false;
    }
    return String.fromBytes(d.src, qa, qb) === name;
  }

  /** Whether the bytes at `i` spell `w` (ASCII letters in any case). */
  wordAt(i: i32, e: i32, w: string): boolean {
    const d = this.d;
    const n = toI32(w.length);
    if (i + n > e) {
      return false;
    }
    for (let k = 0; k < n; k++) {
      let c = d.at(i + k);
      if (c >= 65 && c <= 90) {
        c = c + 32;
      }
      if (c !== w.charCodeAt(k)) {
        return false;
      }
    }
    return true;
  }

  /** Whether `}` line `l` closes a namespace. */
  /**
   * Whether tokens `a` < `b` sit in the same branch of the same conditionals:
   * clang-format's parseBlock links a `}` to its `{` only then (its PP hash).
   */
  samePPContext(a: i32, b: i32): boolean {
    const d = this.d;
    let depth = 0;
    for (let t = a + 1; t < b; t++) {
      if (d.kind[t] !== P_HASH) {
        continue;
      }
      const k = d.ppKind[t];
      if (k === PP_IF) {
        depth++;
      } else if (k === PP_ELIF || k === PP_ELSE) {
        if (depth === 0) {
          return false;
        }
      } else if (k === PP_ENDIF) {
        if (depth === 0) {
          return false;
        }
        depth--;
      }
    }
    return depth === 0;
  }

  closesNamespace(l: i32): boolean {
    const d = this.d;
    const o = d.lOpen[l];
    return o >= 0 && d.lNamespace[o] === 1;
  }

  /** Newlines before line `l`, given the previous line in its list. */
  newlinesBefore(l: i32, prev: i32, firstInList: boolean, nested: boolean): i32 {
    const d = this.d;
    const f = d.lFirst[l];
    let nl = d.nl[f];
    if (nl > 2) {
      nl = 2;
    }
    if (d.kind[f] === P_RBRACE) {
      const n = d.nxt[f];
      const onlyBrace = n < 0 || (d.kind[n] === P_SEMI && d.nxt[n] < 0);
      if (onlyBrace && !this.closesNamespace(l) && nl > 1) {
        nl = 1;
      }
    }
    if (firstInList && nested && nl > 1) {
      nl = 1;
    }
    if (nl === 0 && this.firstEmitted) {
      nl = 1;
    }
    if (!this.firstEmitted) {
      // The file's first token keeps up to two newlines (an empty line or
      // two at the top), as clang-format keeps them.
      const src0 = this.rec ? this.map[f] : f;
      nl = src0 === 0 && d.unesc[f] === 1 ? (d.nl[f] > 2 ? 2 : d.nl[f]) : 0;
    }
    if (prev >= 0 && this.isAccessKeyword(l)) {
      const pl = d.kind[d.lLast[prev]];
      if ((pl === P_SEMI || pl === P_RBRACE) && nl <= 1) {
        nl = 2;
      }
      if (this.isAccessKeyword(prev)) {
        nl = 1;
      }
    }
    // (Not after a macro body's last line, from outside it.)
    if (prev >= 0 && this.isAccessKeyword(prev) && !this.isAccessKeyword(l) && !(d.inPP[d.lFirst[prev]] === 1 && d.unesc[f] === 1)) {
      nl = 1;
    }
    return nl;
  }

  /** Classifies every line, tracking whether each sits in a class body. */
  classifyAll(): void {
    const d = this.d;
    const scopes = new Array<i32>(0);
    let l = d.topHead;
    while (l >= 0) {
      const f = d.lFirst[l];
      if (d.kind[f] === P_RBRACE && d.bk[f] === BK_BLOCK && scopes.length !== 0) {
        scopes.pop();
      }
      d.lInClass[l] = scopes.length !== 0 && scopes[scopes.length - 1] === 1 ? 1 : 0;
      this.cls.classifyLine(l);
      // (A trailing comment may follow the `{`.)
      let last = d.lLast[l];
      while (last !== f && d.kind[last] === K_COMMENT) {
        last = d.prv[last];
      }
      if (d.kind[last] === P_LBRACE && d.bk[last] === BK_BLOCK) {
        const tt = d.type[last];
        scopes.push(tt === TT_CLASS_LBRACE || tt === TT_STRUCT_LBRACE || tt === TT_UNION_LBRACE ? 1 : 0);
      }
      l = d.lSibling[l];
    }
  }

  /** Puts a `#define`'s one-line body back on its head line where it fits. */
  mergeDefines(): void {
    if (!this.d.anyDefine) {
      return;
    }
    this.mergeDefinesIn(this.d.topHead);
  }

  /** mergeDefines over the lines from `head` on and their blocks' lines (a lambda's body holds directives too). */
  mergeDefinesIn(head: i32): void {
    const d = this.d;
    const an = this.ann;
    let l = head;
    while (l >= 0) {
      for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
        if (d.childHead[t] >= 0) {
          this.mergeDefinesIn(d.childHead[t]);
        }
      }
      const f = d.lFirst[l];
      const b = d.lSibling[l];
      if (d.kind[f] === P_HASH && d.ppKind[f] === PP_DEFINE && b >= 0 && d.ppId[d.lFirst[b]] === f) {
        const nb = d.lSibling[b];
        const single = !(nb >= 0 && d.ppId[d.lFirst[nb]] === f);
        const last = d.lLast[l];
        if (single && !(d.kind[last] === K_COMMENT && d.type[last] === TT_LINE_COMMENT) && d.mustBreak[d.lFirst[b]] === 0 && !this.lineOff(l) && !this.lineOff(b)) {
          an.annotate(l);
          an.annotate(b);
          let limit = d.opts.columnLimit;
          const tl = an.tot[last];
          limit = tl > limit ? 0 : limit - tl;
          // A comment starting a line of the body is a forced break:
          // clang-format counts the whole limit for it.
          let forced = false;
          for (let t = d.nxt[d.lFirst[b]]; t >= 0; t = d.nxt[t]) {
            if (d.kind[t] === K_COMMENT && d.unesc[t] === 1) {
              forced = true;
              break;
            }
          }
          // So is a line comment under the body's trailing comment, which
          // clang-format reads as the rest of the directive.
          // (A body of comments alone is the define line's trailing comment.)
          const bl = d.lLast[b];
          if (nb >= 0 && d.kind[bl] === K_COMMENT && d.type[bl] === TT_LINE_COMMENT && d.kind[d.lFirst[b]] !== K_COMMENT) {
            const c = d.lFirst[nb];
            if (c === bl + 1 && d.kind[c] === K_COMMENT && d.type[c] === TT_LINE_COMMENT && d.nl[c] === 1 && this.origColumn(c) >= this.origColumn(bl)) {
              forced = true;
            }
          }
          if (limit !== 0 && !forced && 1 + an.tot[d.lLast[b]] <= limit) {
            this.joinInto(l, b);
          }
        }
      }
      l = d.lSibling[l];
    }
  }

  /**
   * `MACRO (*name)` laid out with a break after its `)`: on its next run
   * clang-format takes `MACRO(...)` for a free-standing macro line, which
   * drops the space before its `(`. Entries from `start` hold line `l`.
   */
  macroLineAfterBreak(l: i32, start: i32): void {
    const d = this.d;
    const f = d.lFirst[l];
    const lp = d.nxt[f];
    if (d.kind[f] !== K_IDENT || lp < 0 || d.kind[lp] !== P_LPAREN || d.lType[l] !== LT_OTHER || d.inPP[f] === 1 || !this.words.allCaps(f)) {
      return;
    }
    const rp = d.match[lp];
    if (rp < 0 || start + 1 >= this.nem || this.emTok[start] !== f || this.emTok[start + 1] !== lp || this.emCol[start + 1] <= this.emCol[start] + d.width[f]) {
      return;
    }
    let i = start + 1;
    while (i < this.nem && this.emTok[i] !== rp) {
      if (this.emNl[i] > 0) {
        return;
      }
      i++;
    }
    const n = d.nxt[rp];
    if (i + 1 >= this.nem || n < 0 || this.emTok[i + 1] !== n || this.emNl[i + 1] === 0 || !this.words.canStartNewLine(n)) {
      return;
    }
    for (let k = start + 1; k <= i; k++) {
      this.emCol[k] = this.emCol[k] - 1;
    }
  }

  /**
   * Whether `{`-led line `l` follows a case label (never merged) or, alone,
   * a control statement or `else` (its wrapped brace).
   */
  braceAfterLabelOrControl(l: i32, prevL: i32): boolean {
    const d = this.d;
    if (prevL < 0) {
      return false;
    }
    const pf = d.kind[d.lFirst[prevL]];
    // (A directive read inside the label's line comes after it for
    // clang-format, so the label is not the line before then.)
    if ((pf === KW_CASE || pf === KW_DEFAULT) && !this.hasInnerDirective(prevL)) {
      return true;
    }
    if (d.lFirst[l] === d.lLast[l]) {
      return d.kind[d.lLast[prevL]] === KW_ELSE || pf === KW_IF || pf === KW_ELSE || pf === KW_WHILE || pf === KW_DO || pf === KW_FOR;
    }
    return false;
  }

  /**
   * Whether `#error`/`#warning` line `l` is left as written: its words after
   * the first are implicit string literals clang-format cannot break before,
   * yet a `.` or `->` among them past the column limit must break (the member
   * access rule), so clang-format finds no layout and leaves the line alone.
   */
  longMessage(l: i32): boolean {
    const d = this.d;
    const f = d.lFirst[l];
    if (d.kind[f] !== P_HASH || d.ppKind[f] !== PP_ERROR || d.lType[l] !== LT_PREPROCESSOR) {
      return false;
    }
    const w = d.nxt[f];
    const first = w >= 0 ? d.nxt[w] : -1;
    if (first < 0) {
      return false;
    }
    // Output columns: `#word first` normalized, the rest as written.
    const shift = 1 + d.width[w] + 1 - d.col[first];
    const lim = d.opts.columnLimit;
    for (let t = d.nxt[first]; t >= 0; t = d.nxt[t]) {
      const k = d.kind[t];
      if (k !== P_PERIOD && k !== P_ARROW && k !== P_ARROWSTAR) {
        continue;
      }
      const p = d.prv[t];
      const endPrev = d.col[p] + d.width[p] + shift;
      let toNext = 0;
      for (let q = d.nxt[t]; q >= 0; q = d.nxt[q]) {
        const qk = d.kind[q];
        if (qk === P_PERIOD || qk === P_ARROW || qk === P_ARROWSTAR) {
          toNext = d.col[q] + d.width[q] - (d.col[t] + d.width[t]);
          break;
        }
      }
      if (endPrev + toNext > lim) {
        return true;
      }
    }
    return false;
  }

  /** Whether line `l` is a `#error` or `#warning` with a message. */
  isMessage(l: i32): boolean {
    const d = this.d;
    const f = d.lFirst[l];
    if (d.kind[f] !== P_HASH || d.ppKind[f] !== PP_ERROR || d.lType[l] !== LT_PREPROCESSOR) {
      return false;
    }
    const w = d.nxt[f];
    return w >= 0 && d.nxt[w] >= 0 && d.multi[f] === 0;
  }

  /**
   * Emits `#error`/`#warning` line `l`: `#word`, then the message. Its words
   * after the first are implicit string literals: never broken before, kept
   * as written, and not counted against the limit, so the only break is
   * before the first word, taken when that word overflows.
   */
  emitMessage(l: i32, nl: i32): void {
    const d = this.d;
    const f = d.lFirst[l];
    const w = d.nxt[f];
    const first = d.nxt[w];
    this.emit(f, nl, 0);
    this.emit(w, 0, 1);
    // `#warning("...")`: no space before a parenthesis, as after a name.
    let col = 1 + d.width[w] + (d.kind[first] === P_LPAREN ? 0 : 1);
    let fnl = 0;
    if (col + d.width[first] > d.opts.columnLimit && d.multi[first] === 0) {
      fnl = 1;
      col = d.opts.continuationIndent;
    }
    this.emit(first, fnl, col);
    col = col + d.width[first];
    for (let t = d.nxt[first]; t >= 0; t = d.nxt[t]) {
      const p = d.prv[t];
      if (d.nl[t] > 0) {
        // Continued with `\`: the rest stays as written.
        this.emitRaw(d.end[p], d.end[d.lLast[l]]);
        return;
      }
      col = col + (d.col[t] - d.col[p] - d.width[p]);
      this.emit(t, d.nl[t], col);
      col = col + d.width[t];
    }
  }

  /** Whether a directive line sits between two tokens of line `l`. */
  hasInnerDirective(l: i32): boolean {
    const d = this.d;
    for (let t = d.nxt[d.lFirst[l]]; t >= 0; t = d.nxt[t]) {
      const p = d.prv[t];
      if (t > p + 1 && d.inPP[t - 1] === 1 && d.inPP[t] === 0) {
        return true;
      }
    }
    return false;
  }

  /** Joins `{` lines with their body and `}` where the result fits. */
  joinShortBlocks(head: i32, base: i32): void {
    const d = this.d;
    let l = head;
    let prevL = -1;
    while (l >= 0) {
      const a = d.lSibling[l];
      const last = d.lLast[l];
      // A directive inside the line follows it for clang-format: no merge.
      // (A line with off tokens still merges an empty `{}` after them.)
      const offL = a >= 0 && this.lineOff(l);
      if (a >= 0 && d.kind[last] === P_LBRACE && d.bk[last] === BK_BLOCK && d.type[last] !== TT_LINE_COMMENT && (!offL || (this.hasOff && this.offTok[last] !== 1 && d.lInvalid[l] === 0 && d.kind[d.lFirst[a]] === P_RBRACE)) && !this.lineOff(a) && !this.hasInnerDirective(l)) {
        const tt = d.type[last];
        const lineStart = d.lFirst[l];
        const isFunction = tt === TT_FUNCTION_LBRACE;
        const isRecord = tt === TT_CLASS_LBRACE || tt === TT_STRUCT_LBRACE || tt === TT_UNION_LBRACE;
        // (clang-format's startsWithNamespace: any line starting with it.)
        const isNamespace = tt === TT_NAMESPACE_LBRACE || d.kind[lineStart] === KW_NAMESPACE || (d.kind[lineStart] === KW_INLINE && d.nxt[lineStart] >= 0 && d.kind[d.nxt[lineStart]] === KW_NAMESPACE);
        const isControl = tt === TT_CONTROL_STATEMENT_LBRACE || tt === TT_ELSE_LBRACE;
        const af = d.lFirst[a];
        const emptyBody = d.kind[af] === P_RBRACE && d.lOpen[a] === l;
        const lineIsBlockOnly = lineStart === last;
        // A block opened on a `case`/`default:` line is never merged.
        const caseLine = d.kind[lineStart] === KW_CASE || (d.kind[lineStart] === KW_DEFAULT && d.nxt[lineStart] >= 0 && d.kind[d.nxt[lineStart]] === P_COLON);
        if (!isControl && (!lineIsBlockOnly || !this.braceAfterLabelOrControl(l, prevL)) && !caseLine && emptyBody && !this.hasTrailingLineComment(l)) {
          // `{}` (and `{};`): always one line.
          let after = d.nxt[af];
          while (after >= 0 && d.kind[after] === K_COMMENT) {
            after = d.nxt[after];
          }
          // `};` may carry a trailing comment.
          let afterSemi = after >= 0 ? d.nxt[after] : -1;
          while (afterSemi >= 0 && d.kind[afterSemi] === K_COMMENT && d.nl[afterSemi] === 0) {
            afterSemi = d.nxt[afterSemi];
          }
          if (after < 0 || (d.kind[after] === P_SEMI && afterSemi < 0)) {
            this.joinInto(l, a);
            continue;
          }
        }
        // clang-format's tryMergeSimpleBlock splits any block on a line that
        // starts with a control keyword, `try`, `catch` or `}`.
        // (The first token past leading comments: clang-format's FirstNonComment.)
        let fnc = lineStart;
        while (fnc !== last && d.kind[fnc] === K_COMMENT) {
          fnc = d.nxt[fnc];
        }
        const fk0 = d.kind[fnc];
        const ctrlFirst = fk0 === KW_IF || fk0 === KW_ELSE || fk0 === KW_WHILE || fk0 === KW_DO || fk0 === KW_FOR || fk0 === KW_TRY || fk0 === KW_CATCH || fk0 === P_RBRACE;
        if (isFunction && !ctrlFirst && !lineIsBlockOnly && !emptyBody && !isRecord && !isNamespace && !offL) {
          const b = d.lSibling[a];
          if (b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            this.joinInto(l, a);
            this.joinInto(l, b);
            continue;
          }
        }
        // Any other block (`{` alone, `SCOPE_EXIT {`): clang-format's
        // tryMergeSimpleBlock merges a one-line body when it fits, except a
        // `{` alone after a control statement or `else`.
        const fk = d.kind[fnc];
        const ctrl = fk === KW_IF || fk === KW_ELSE || fk === KW_WHILE || fk === KW_DO || fk === KW_FOR || fk === KW_TRY || fk === KW_CATCH || fk === P_RBRACE || fk === KW_CASE || fk === KW_DEFAULT || fk === KW_EXTERN;
        const blockLike = tt === TT_UNKNOWN || (tt === TT_CONTROL_STATEMENT_LBRACE && fk === KW_SWITCH);
        if (blockLike && !ctrl && !emptyBody && !isFunction && !isRecord && !isNamespace && d.lType[l] !== LT_PREPROCESSOR && !offL) {
          const afterCtrl = fk === P_LBRACE && this.braceAfterLabelOrControl(l, prevL);
          const b = d.lSibling[a];
          if (!afterCtrl && b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            const bn = d.nxt[d.lFirst[b]];
            if (!(bn >= 0 && d.kind[bn] === KW_ELSE)) {
              this.joinInto(l, a);
              this.joinInto(l, b);
              continue;
            }
          }
        }
      }
      if (a >= 0 && d.kind[last] === K_COMMENT && d.type[last] !== TT_LINE_COMMENT && !this.lineOff(l) && !this.lineOff(a) && this.emptyFunctionAfterComment(l, a)) {
        // `void f() { /* nothing */ }`: clang-format looks past trailing
        // block comments for a function's `{` and merges its empty body.
        this.joinInto(l, a);
        continue;
      }
      if (a >= 0 && d.kind[last] === K_COMMENT && d.type[last] !== TT_LINE_COMMENT && !this.lineOff(l) && !this.lineOff(a) && !this.hasInnerDirective(l)) {
        // `int f() { /* c */ return 1; }`: so does it for a one-line body.
        let lnc = last;
        while (lnc >= 0 && d.kind[lnc] === K_COMMENT) {
          lnc = d.prv[lnc];
        }
        const fk1 = d.kind[d.lFirst[l]];
        const ctrl1 = fk1 === KW_IF || fk1 === KW_ELSE || fk1 === KW_WHILE || fk1 === KW_DO || fk1 === KW_FOR || fk1 === KW_TRY || fk1 === KW_CATCH || fk1 === P_RBRACE;
        if (lnc >= 0 && lnc !== d.lFirst[l] && d.kind[lnc] === P_LBRACE && d.type[lnc] === TT_FUNCTION_LBRACE && !ctrl1 && !this.hasTrailingLineComment(l) && d.kind[d.lFirst[a]] !== P_RBRACE) {
          const b = d.lSibling[a];
          if (b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            this.joinInto(l, a);
            this.joinInto(l, b);
            continue;
          }
        }
      }
      // Child blocks (lambda bodies) go through the same joiner.
      for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
        const c = d.childHead[t];
        if (c >= 0) {
          this.joinShortBlocks(c, base);
        }
      }
      prevL = l;
      l = d.lSibling[l];
    }
  }

  /**
   * clang-format's setCommentLineLevels: a comment-only line written at the
   * column of the next line takes that line's level (0 above a directive),
   * unless a blank line separates them; a `}` line is no such next line.
   */
  setCommentLineLevels(head: i32): void {
    const d = this.d;
    const lines: i32[] = [];
    for (let l = head; l >= 0; l = d.lSibling[l]) {
      lines.push(l);
    }
    let next = -1;
    let nextInl = -1; // the parked directive line after a parked comment line
    let afterNonPP = -1; // the first token of the nearest later line that is not a directive or parked
    for (let i = toI32(lines.length) - 1; i >= 0; i--) {
      const l = lines[i];
      const f = d.lFirst[l];
      // isInlineDirective, from the line after it that is no directive.
      const ppLike = d.lType[l] === LT_PREPROCESSOR || d.lType[l] === LT_IMPORT || d.lPP[l] === 1 || d.lInlineCmt[l] === 1;
      const inlineHere = ppLike && afterNonPP >= 0 && afterNonPP < f;
      if (!ppLike) {
        afterNonPP = f;
      }
      if (d.lInlineCmt[l] === 1) {
        // Parked with the directive after it: aligned with it, as clang-format
        // adds both after the statement they were read inside.
        const nf = nextInl >= 0 ? d.lFirst[nextInl] : -1;
        if (nf >= 0 && d.nl[nf] < 2 && this.offMarker(f) !== 1 && d.col[nf] === d.col[f]) {
          d.lLevel[l] = 0;
        }
        continue;
      }
      if (inlineHere) {
        // clang-format adds a directive read inside a statement after it.
        nextInl = l;
        continue;
      }
      nextInl = -1;
      let onlyComments = true;
      for (let t = f; t >= 0; t = d.nxt[t]) {
        if (d.kind[t] !== K_COMMENT) {
          onlyComments = false;
        }
        if (d.childHead[t] >= 0) {
          this.setCommentLineLevels(d.childHead[t]);
        }
      }
      const nf = next >= 0 ? d.lFirst[next] : -1;
      if (next >= 0 && d.nl[nf] < 2 && onlyComments && this.offMarker(f) !== 1 && d.col[nf] === d.col[f]) {
        const pp = d.lType[next] === LT_PREPROCESSOR || d.lType[next] === LT_IMPORT;
        d.lLevel[l] = pp ? 0 : d.lLevel[next];
      } else {
        next = d.kind[f] !== P_RBRACE ? l : -1;
      }
    }
  }

  /**
   * Marks the tokens whose whitespace clang-format leaves as written: off
   * regions and the tokens after the first of a line it cannot annotate (1),
   * an inline assembly block's body (3), and implicit string literals, the text of `#error`, `#warning` and
   * `#pragma mark`/`region` after its first word (2).
   */
  markUntouched(): void {
    const d = this.d;
    this.untGen = this.untGen + 1;
    if (toI32(this.untouched.length) < d.ntok) {
      this.untouched = new Array<i32>(d.ntok + 64);
      this.untStamp = new Array<i32>(d.ntok + 64);
    }
    const g = this.untGen;
    for (let l = 0; l < d.nline; l++) {
      const f = d.lFirst[l];
      if (d.lInvalid[l] === 1) {
        for (let t = d.nl[f] === 0 && d.prv[f] < 0 && f > 0 ? f : d.nxt[f]; t >= 0; t = d.nxt[t]) {
          this.untouched[t] = 1;
          this.untStamp[t] = g;
        }
      }
      // Implicit string literals (`\`): their whitespace is as written;
      // so is all of an inline assembly block's body, newlines included.
      for (let t = f; (d.anyAsm || d.anyImplicit) && t >= 0; t = d.nxt[t]) {
        if (d.asmFin[t] === 1) {
          this.untouched[t] = 3;
          this.untStamp[t] = g;
        } else if (d.type[t] === TT_IMPLICIT_STRING_LITERAL && t !== f) {
          this.untouched[t] = 2;
          this.untStamp[t] = g;
        }
      }
      // A line that starts with `<` and ends with `>` is taken for the
      // header name of `#define X <a/b.h>`.
      if (d.kind[f] === P_LESS && d.kind[d.lLast[l]] === P_GREATER && d.lLast[l] !== f) {
        for (let t = d.nxt[f]; t >= 0; t = d.nxt[t]) {
          this.untouched[t] = 2;
          this.untStamp[t] = g;
        }
      }
      if (d.kind[f] === P_HASH && (d.ppKind[f] === PP_ERROR || d.ppKind[f] === PP_PRAGMA)) {
        const w = d.nxt[f];
        let first = w >= 0 ? d.nxt[w] : -1;
        if (d.ppKind[f] === PP_PRAGMA) {
          if (first < 0 || !(d.is(first, "mark") || d.is(first, "region"))) {
            continue;
          }
          first = d.nxt[first];
        }
        if (first < 0) {
          continue;
        }
        for (let t = d.nxt[first]; t >= 0; t = d.nxt[t]) {
          this.untouched[t] = 2;
          this.untStamp[t] = g;
        }
      }
    }
    if (this.hasOff) {
      for (let t = 0; t < d.ntok; t++) {
        if (this.offTok[t] === 1) {
          this.untouched[t] = 1;
          this.untStamp[t] = g;
        }
      }
    }
  }

  /** 1 or 2 when token `t` keeps its whitespace as written (see markUntouched), else 0. */
  untouchedKind(t: i32): i32 {
    return t >= 0 && t < toI32(this.untStamp.length) && this.untStamp[t] === this.untGen ? this.untouched[t] : 0;
  }

  /** The source offset where token `t`'s whitespace starts, or -1 when its predecessor was skipped. */
  wsStart(t: i32): i32 {
    const d = this.d;
    if (t === 0) {
      return 0;
    }
    if (this.rec && this.map[t - 1] !== this.map[t] - 1) {
      // The pass skipped what came before: the blanks right before it,
      // within an off region (whose layout is kept), else nothing.
      if (!(this.hasOff && this.offTok[t] === 1)) {
        return -1;
      }
      let w = d.start[t];
      while (w > 0 && (isBlankByte(d.at(w - 1)) || d.at(w - 1) === 10 || d.at(w - 1) === 13)) {
        w--;
      }
      return w;
    }
    return d.end[t - 1];
  }

  /** Marks the tokens after a `clang-format off` comment, up to and with its `on`. */
  markOffRegions(): void {
    const d = this.d;
    if (this.rec) {
      // A pass: clang-format marks off regions while lexing, over every token.
      this.hasOff = this.hasOffFull;
      if (this.hasOff) {
        if (toI32(this.offTok.length) < d.ntok) {
          this.offTok = new Array<i32>(d.ntok + 64);
        }
        for (let j = 0; j < d.ntok; j++) {
          this.offTok[j] = this.offFull[this.map[j]];
        }
      }
      return;
    }
    this.hasOff = false;
    let off = false;
    for (let t = 0; t < d.ntok; t++) {
      if (d.kind[t] !== K_COMMENT) {
        if (off) {
          this.offTok[t] = 1;
        }
        continue;
      }
      const m = this.offMarker(t);
      if (m === 1 && !off) {
        if (!this.hasOff) {
          this.hasOff = true;
          if (toI32(this.offTok.length) < d.ntok) {
            this.offTok = new Array<i32>(d.ntok + 64);
          } else {
            this.offTok.fill(0);
          }
        }
        off = true;
      } else if (off) {
        // The `clang-format on` comment itself is formatted again.
        if (m === 2) {
          off = false;
        } else {
          this.offTok[t] = 1;
        }
      }
    }
  }

  /** Whether any token of line `l` lies in a `clang-format off` region. */
  lineOff(l: i32): boolean {
    const d = this.d;
    if (d.lInvalid[l] === 1) {
      return true;
    }
    if (!this.hasOff) {
      return false;
    }
    for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
      if (this.offTok[t] === 1) {
        return true;
      }
    }
    return false;
  }

  hasTrailingLineComment(l: i32): boolean {
    const d = this.d;
    const last = d.lLast[l];
    return d.kind[last] === K_COMMENT && d.type[last] === TT_LINE_COMMENT;
  }

  /** The width of line `l` laid flat, or a large number when it cannot be. */
  flatWidth(l: i32): i32 {
    const d = this.d;
    const f = d.lFirst[l];
    let w = d.width[f];
    if (d.multi[f] === 1) {
      return 100000;
    }
    for (let t = d.nxt[f]; t >= 0; t = d.nxt[t]) {
      if (d.mustBreak[t] === 1 || d.multi[t] === 1 || (d.kind[t] === K_COMMENT && d.nl[t] > 0)) {
        return 100000;
      }
      const p = d.prv[t];
      if (d.kind[p] === K_COMMENT && d.type[p] === TT_LINE_COMMENT) {
        return 100000;
      }
      w = w + (spaceBefore(d, l, t) ? 1 : 0) + d.width[t];
      if (d.childHead[p] >= 0) {
        w = w + this.childFlatWidth(p);
      }
    }
    if (d.childHead[d.lLast[l]] >= 0) {
      w = w + this.childFlatWidth(d.lLast[l]);
    }
    return w;
  }

  /** The width a single-line child block adds inside `{ ... }`, or large. */
  childFlatWidth(lb: i32): i32 {
    const d = this.d;
    if (d.childCount[lb] !== 1) {
      return 100000;
    }
    if (lb < toI32(this.cfwStamp.length) && this.cfwStamp[lb] === this.fileStamp) {
      return this.cfwVal[lb];
    }
    const v = this.childFlatWidthUncached(lb);
    if (lb >= toI32(this.cfwStamp.length)) {
      this.cfwStamp = growI32(this.cfwStamp, d.ntok + 1);
      this.cfwVal = growI32(this.cfwVal, d.ntok + 1);
    }
    this.cfwStamp[lb] = this.fileStamp;
    this.cfwVal[lb] = v;
    return v;
  }

  childFlatWidthUncached(lb: i32): i32 {
    const d = this.d;
    const c = d.childHead[lb];
    if (d.mustBreak[d.lFirst[c]] === 1 || d.nl[d.lFirst[c]] > 1) {
      return 100000;
    }
    if (this.hasTrailingLineComment(c)) {
      return 100000;
    }
    return this.flatWidth(c) + 1;
  }

  canMergeBody(l: i32, a: i32, b: i32, base: i32): boolean {
    const d = this.d;
    const bf = d.lFirst[b];
    if (d.kind[bf] !== P_RBRACE || this.hasInnerDirective(a)) {
      return false;
    }
    // `}` or `};`, maybe with a trailing comment (it counts toward the limit).
    let bn = d.nxt[bf];
    if (bn >= 0 && d.kind[bn] === P_SEMI) {
      bn = d.nxt[bn];
    }
    if (bn >= 0 && d.kind[bn] === K_COMMENT && d.nxt[bn] < 0 && d.nl[bn] === 0) {
      bn = -1;
    }
    // A compound requirement's `} -> C<T>;` (or `} noexcept`) merges too, as
    // does a function-try-block's `} catch (...) {`; `} else` never does.
    const an0 = d.nxt[bf];
    if (bn >= 0 && !(an0 === bn && (d.kind[bn] === P_ARROW || d.kind[bn] === KW_NOEXCEPT || d.kind[bn] === KW_CATCH))) {
      return false;
    }
    if (this.hasTrailingLineComment(a) || this.hasTrailingLineComment(l)) {
      return false;
    }
    if (d.lType[a] === LT_PREPROCESSOR || d.lType[a] === LT_IMPORT) {
      return false;
    }
    // No nested blocks in the body line.
    for (let t = d.lFirst[a]; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] === P_LBRACE && d.bk[t] === BK_BLOCK) {
        return false;
      }
    }
    if (d.lSibling[a] !== b) {
      return false;
    }
    // What is left of the limit after the `{` line must hold the body and `}`.
    const an = this.ann;
    an.annotate(l);
    an.annotate(a);
    an.annotate(b);
    const ind = this.indentOf(l, base);
    if (ind > d.opts.columnLimit) {
      return false;
    }
    let limit = d.opts.columnLimit - ind;
    const tl = an.tot[d.lLast[l]];
    if (tl > limit) {
      return false;
    }
    limit = limit - tl;
    // A macro going on past the `}` keeps room for its ` \` (limitConsideringMacros).
    const nb = d.lSibling[b];
    if (d.lPP[b] === 1 && nb >= 0 && d.lPP[nb] === 1 && d.ppId[d.lFirst[nb]] === d.ppId[bf] && d.unesc[d.lFirst[nb]] === 0) {
      limit = limit < 2 ? 0 : limit - 2;
    }
    if (an.mustB[d.lFirst[a]] === 1 || an.mustB[bf] === 1) {
      return false;
    }
    return 1 + an.tot[d.lLast[a]] + 1 + an.tot[d.lLast[b]] <= limit;
  }

  /** Whether line `l` ends in a function's `{` and block comments, and line `a` is its `}` (or `};`) alone. */
  emptyFunctionAfterComment(l: i32, a: i32): boolean {
    const d = this.d;
    const first = d.lFirst[l];
    let b = d.lLast[l];
    while (b !== first && d.kind[b] === K_COMMENT) {
      b = d.prv[b];
    }
    if (b === first || d.kind[b] !== P_LBRACE || d.type[b] !== TT_FUNCTION_LBRACE || d.bk[b] !== BK_BLOCK) {
      return false;
    }
    const af = d.lFirst[a];
    if (d.kind[af] !== P_RBRACE || d.lOpen[a] !== l) {
      return false;
    }
    let after = d.nxt[af];
    while (after >= 0 && d.kind[after] === K_COMMENT && d.nl[after] === 0) {
      after = d.nxt[after];
    }
    if (after >= 0 && d.nl[after] === 0 && d.kind[after] === P_SEMI) {
      after = d.nxt[after];
      while (after >= 0 && d.kind[after] === K_COMMENT && d.nl[after] === 0) {
        after = d.nxt[after];
      }
    }
    return after < 0 || d.nl[after] > 0;
  }

  /** Appends line `b`'s tokens to line `l` and drops `b` from its list. */
  joinInto(l: i32, b: i32): void {
    const d = this.d;
    const last = d.lLast[l];
    const bf = d.lFirst[b];
    d.nxt[last] = bf;
    d.prv[bf] = last;
    d.lLast[l] = d.lLast[b];
    d.lSibling[l] = d.lSibling[b];
    if (d.topTail === b) {
      d.topTail = l;
    }
    // The joined tokens sit on one line now.
    this.ann.jnl[bf] = d.nl[bf];
    d.nl[bf] = 0;
    this.ann.joined[bf] = b + 1;
    this.ann.lStamp[l] = 0;
  }

  /** The penalty of formatting child list `head` at `base` indent, without emitting. */
  listPenalty(head: i32, base: i32): i64 {
    const d = this.d;
    let pen: i64 = 0;
    let l = head;
    while (l >= 0) {
      this.ind.fm = this;
      pen = pen + this.ind.formatLine(l, this.indentOf(l, base), 1, true, false);
      l = d.lSibling[l];
    }
    return pen;
  }

  /** Emits list `head` (top level or a child block) at `base` indent. */
  emitList(head: i32, base: i32, nested: boolean): void {
    const d = this.d;
    let l = head;
    let prev = -1;
    let pend = -1; // where directives found inside the next line's statement start
    while (l >= 0) {
      const f = d.lFirst[l];
      // A directive inside a statement lands after the statement's first token,
      // so it does not count as the file's first output.
      const fe0 = this.firstEmitted;
      let inlineLine = false;
      if (this.verbatim && d.kind[f] === K_COMMENT && this.offMarker(f) === 2) {
        // A line starting with `clang-format on` is formatted.
        this.verbatim = false;
      }
      const offLine = this.hasOff && this.offTok[f] === 1 && !this.verbatim;
      if (offLine) {
        // An off region whose `clang-format off` comment this pass skipped.
        this.verbatim = true;
      }
      if (this.verbatim && d.kind[f] !== K_COMMENT) {
        // `clang-format on` inside the line: the line is laid out, its tokens
        // before the marker keeping their whitespace (they are untouched).
        // (Only with more tokens after the marker: a trailing marker leaves
        // its line as written.)
        for (let t = d.nxt[f]; t >= 0; t = d.nxt[t]) {
          if (d.kind[t] === K_COMMENT && this.offMarker(t) === 2) {
            if (d.nxt[t] >= 0) {
              this.verbatim = false;
            }
            break;
          }
        }
      }
      if (this.verbatim || this.continuedDirective(l)) {
        // Directives inside a statement go back into it, in source order.
        const inl = this.verbatim && this.isInlineDirective(l);
        if (inl && pend < 0) {
          pend = this.nem;
        }
        if (inl) {
          inlineLine = true;
          this.firstEmitted = true;
        }
        const vStart = this.nem;
        if (!this.verbatim) {
          // A directive continued with `\`: kept as written, bytes and all.
          const nl0 = this.newlinesBefore(l, prev, prev < 0, nested);
          this.firstEmitted = true;
          this.emit(f, nl0, 0);
          this.emitRaw(d.end[f], d.end[d.lLast[l]]);
        } else {
          this.emitVerbatimLine(l);
        }
        if (this.verbatim && !inl && pend >= 0) {
          this.interleave(pend, vStart);
          pend = -1;
        }
      } else if (this.longMessage(l)) {
        // A `#error` or `#warning` clang-format finds no layout for is left as written.
        this.emitVerbatimLine(l);
      } else if (this.isMessage(l)) {
        this.emitMessage(l, this.newlinesBefore(l, prev, prev < 0, nested));
        this.firstEmitted = true;
      } else if (d.lInvalid[l] === 1) {
        // A line clang-format cannot annotate keeps its own layout; only the
        // newlines before it are formatted (none when it starts on the line
        // before's source line: then it is untouched altogether).
        const nl0 = d.nl[f] === 0 && prev >= 0 ? 0 : this.newlinesBefore(l, prev, prev < 0, nested);
        this.firstEmitted = true;
        const hostStart = this.nem;
        for (let t = f; t >= 0; t = d.nxt[t]) {
          this.emit(t, t === f ? nl0 : d.nl[t], d.col[t]);
          this.verbatimChildren(t);
        }
        // (Directives found inside it go back in, in source order.)
        if (pend >= 0) {
          this.interleave(pend, hostStart);
          pend = -1;
        }
      } else {
        const inlinePP = this.isInlineDirective(l);
        if (inlinePP && pend < 0) {
          pend = this.nem;
        }
        inlineLine = inlinePP;
        // A directive inside a statement keeps its own newlines, as any line.
        const nl = inlinePP ? (d.nl[f] > 2 ? 2 : d.nl[f] < 1 ? 1 : d.nl[f]) : this.newlinesBefore(l, prev, prev < 0, nested);
        const ind = this.indentOf(l, base);
        this.firstEmitted = true;
        this.ind.fm = this;
        const hostStart = this.nem;
        this.ind.formatLine(l, ind, nl, false, false);
        this.macroLineAfterBreak(l, hostStart);
        if (!inlinePP && pend >= 0) {
          this.interleave(pend, hostStart);
          pend = -1;
        }
        if (d.kind[f] === P_RBRACE && this.closesNamespace(l)) {
          if (this.bracesBalanced && this.samePPContext(d.lLast[d.lOpen[l]], f)) {
            this.namespaceComment(l);
          }
        } else if (this.bracesBalanced && d.lNamespace[l] === 1) {
          // `namespace X {} // comment`: the joined `}` still has its end
          // comment checked (a short namespace gets none added).
          let lb = -1;
          for (let t = d.nxt[f]; t >= 0; t = d.nxt[t]) {
            if (lb < 0 && d.kind[t] === P_LBRACE) {
              lb = t;
            } else if (lb >= 0 && d.kind[t] === P_RBRACE && d.prv[t] === lb) {
              this.fixEndComment(t, l);
              break;
            }
          }
        }
      }
      this.firstEmitted = inlineLine ? fe0 : true;
      // `// fastfmt off` / `// clang-format off` on this line starts a raw region.
      for (let t = f; t >= 0; t = d.nxt[t]) {
        if (d.kind[t] === K_COMMENT) {
          const m = this.offMarker(t);
          if (m === 1) {
            this.verbatim = true;
          } else if (m === 2) {
            this.verbatim = false;
          }
        }
      }
      if (offLine) {
        // Decided again for the next line from its own tokens.
        this.verbatim = false;
      }
      // clang-format moves a child block's directive lines out of it: they
      // are no line before the next one.
      if (!(nested && (d.lType[l] === LT_PREPROCESSOR || d.lPP[l] === 1 || d.lInlineCmt[l] === 1))) {
        prev = l;
      }
      l = d.lSibling[l];
    }
  }

  /** Whether directive line `l` sits inside the statement of a following line. */
  isInlineDirective(l: i32): boolean {
    const d = this.d;
    if (d.lType[l] !== LT_PREPROCESSOR && d.lType[l] !== LT_IMPORT && d.lPP[l] !== 1 && d.lInlineCmt[l] !== 1) {
      return false;
    }
    // The line after the run of directive lines: found once per run (a
    // long run would be walked again for each of its lines).
    if (toI32(this.idStamp.length) < d.nline) {
      this.idStamp = growI32(this.idStamp, d.nline + 64);
      this.idNext = growI32(this.idNext, d.nline + 64);
    }
    let h = -2;
    if (this.idStamp[l] === this.untGen) {
      h = this.idNext[l];
    } else {
      h = d.lSibling[l];
      while (h >= 0 && (d.lType[h] === LT_PREPROCESSOR || d.lType[h] === LT_IMPORT || d.lPP[h] === 1 || d.lInlineCmt[h] === 1)) {
        h = d.lSibling[h];
      }
      for (let x = d.lSibling[l]; x >= 0 && x !== h; x = d.lSibling[x]) {
        this.idStamp[x] = this.untGen;
        this.idNext[x] = h;
      }
    }
    return h >= 0 && d.lFirst[h] < d.lFirst[l];
  }

  /**
   * Moves the directive entries [pend, hostStart) into the host statement's
   * entries [hostStart, nem), each directive before the first host token that
   * follows it in the source.
   */
  interleave(pend: i32, hostStart: i32): void {
    const n = this.nem;
    const cnt = n - pend;
    const tok = new Array<i32>(cnt);
    const nl = new Array<i32>(cnt);
    const col = new Array<i32>(cnt);
    let o = 0;
    let p = pend;
    let h = hostStart;
    while (o < cnt) {
      // The next directive's run: from p to the next entry starting a line.
      let pe = p;
      if (p < hostStart) {
        pe = p + 1;
        while (pe < hostStart && this.emNl[pe] === 0) {
          pe++;
        }
      }
      const hashTok = p < hostStart ? this.emTok[p] : 0;
      while (h < n && (p >= hostStart || this.hostSourceTok(this.emTok[h]) < hashTok)) {
        tok[o] = this.emTok[h];
        nl[o] = this.emNl[h];
        col[o] = this.emCol[h];
        o++;
        h++;
      }
      while (p < pe) {
        tok[o] = this.emTok[p];
        nl[o] = this.emNl[p];
        col[o] = this.emCol[p];
        o++;
        p++;
      }
      if (p >= hostStart && h >= n) {
        break;
      }
    }
    for (let i = 0; i < cnt; i++) {
      this.emTok[pend + i] = tok[i];
      this.emNl[pend + i] = nl[i];
      this.emCol[pend + i] = col[i];
    }
  }

  /** The source token an emitted entry `t` stands for (a split string's piece: its string), or -1. */
  hostSourceTok(t: i32): i32 {
    if (t >= 0) {
      return t;
    }
    if (t <= PIECE && t > RAW) {
      return this.pcTok[PIECE - t];
    }
    return -1;
  }

  /** Whether directive line `l` continues over an escaped newline. */
  continuedDirective(l: i32): boolean {
    const d = this.d;
    const f = d.lFirst[l];
    if (d.lPP[l] !== 1 || d.kind[f] !== P_HASH) {
      return false;
    }
    // `#if` and `#elif` conditions and split `#define`s are formatted as code.
    // Every directive line is formatted as code, but a #define whose body
    // is not parsed as code is kept as written.
    const pk = d.ppKind[f];
    if (pk !== PP_DEFINE || d.lDefCode[l] === 1) {
      return false;
    }
    for (let t = d.nxt[f]; t >= 0; t = d.nxt[t]) {
      if (d.nl[t] > 0) {
        return true;
      }
    }
    return false;
  }

  /** 1 for an "off" pragma comment, 2 for "on", 0 otherwise. */
  offMarker(t: i32): i32 {
    const d = this.d;
    const a = d.start[t] + 2;
    let i = a;
    while (i < d.end[t] && (d.at(i) === 32 || d.at(i) === 47 || d.at(i) === 42)) {
      i++;
    }
    const e = d.end[t];
    if (d.startsWithAt(i, e, "fastfmt off") || d.startsWithAt(i, e, "clang-format off")) {
      return 1;
    }
    if (d.startsWithAt(i, e, "fastfmt on") || d.startsWithAt(i, e, "clang-format on")) {
      return 2;
    }
    return 0;
  }

  /** Emits line `l` exactly as it was written. */
  emitVerbatimLine(l: i32): void {
    const d = this.d;
    for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
      let c = d.col[t];
      const p = d.prv[t];
      if (t !== d.lFirst[l] && d.nl[t] === 0 && d.kind[t] === K_COMMENT && p >= 0 && d.multi[p] === 0 && this.offMarker(t) === 2) {
        // A trailing `clang-format on` is formatted: one space before it.
        c = d.col[p] + d.width[p] + 1;
      }
      this.emit(t, this.firstEmitted || t !== d.lFirst[l] ? d.nl[t] : 0, c);
      this.verbatimChildren(t);
    }
  }

  verbatimChildren(t: i32): void {
    const d = this.d;
    let c = d.childHead[t];
    while (c >= 0) {
      this.emitVerbatimLine(c);
      c = d.lSibling[c];
    }
  }

  /**
   * Formats the whole document into `out`. Answers false to leave it alone.
   *
   * Like clang-format, a file with conditional compilation is formatted once
   * per combination of `#if` branches: each pass sees one branch of every
   * `#if` (never an `#if 0` branch) and all directive lines. Each token takes
   * its whitespace and text from the first pass that saw it; a token no pass
   * sees is left as written.
   */
  run(out: Out, prof: i64[]): boolean {
    const d = this.d;
    // clang-format sorts includes on the text, before it formats anything.
    if (d.opts.sortIncludes) {
      this.sortIncludesText();
    }
    if (!lex(d)) {
      return false;
    }
    if (hasBom(d)) {
      out.byte(0xef);
      out.byte(0xbb);
      out.byte(0xbf);
    }
    if (d.ntok === 1) {
      // Only whitespace.
      return true;
    }
    let mayRestart = true;
    let restarts = 0; // using-declarations sorted in a later pass restart it all
    while (true) {
      const np = this.planPasses();
      if (getenv("FFPASS") !== null) console.error(`passes ${np} tokens ${d.ntok}`);
      if (np === 0) {
        // One pass over every token.
        for (let j = 0; j < d.ntok; j++) {
          d.passMul[j] = 0;
          d.dec[j] = 0;
        }
        this.rec = false;
        const r = this.runPass(out, prof, mayRestart);
        if (r === PASS_RESTART) {
          mayRestart = false;
          if (!lex(d)) {
            return false;
          }
          continue;
        }
        return r === PASS_OK;
      }
      this.saveTokens();
      this.rec = false;
      this.markOffRegions();
      this.hasOffFull = this.hasOff;
      if (this.hasOff) {
        if (toI32(this.offFull.length) < d.ntok) {
          this.offFull = new Array<i32>(d.ntok + 64);
        }
        for (let t = 0; t < d.ntok; t++) {
          this.offFull[t] = this.offTok[t];
        }
      }
      this.npass = np;
      this.markUsefulPasses(np);
      for (let t = 0; t < this.fullN; t++) {
        this.decFull[t] = 0;
      }
      let restart = false;
      if (toI32(this.passSeen.length) < this.fullN) {
        this.passSeen = new Array<i32>(this.fullN + 64);
        this.finCol = new Array<i32>(this.fullN + 64);
      }
      for (let t = 0; t < this.fullN; t++) {
        this.finCol[t] = -1;
      }
      for (let t = 0; t < this.fullN; t++) {
        this.passSeen[t] = 0;
      }
      for (let p = 0; p < np; p++) {
        // clang-format annotates every pass, useful or not.
        const vp = this.vis[p];
        for (let t = 0; t < this.fullN; t++) {
          this.passSeen[t] = this.passSeen[t] + vp[t];
        }
        if (this.useful[p] === 0) {
          continue;
        }
        while (p >= toI32(this.passOuts.length)) {
          this.passOuts.push(new Out(1 << 16));
          this.uSs.push(new Array<i32>(0));
          this.uEs.push(new Array<i32>(0));
        }
        if (toI32(this.uSs[p].length) < this.fullN) {
          this.uSs[p] = new Array<i32>(this.fullN + 64);
          this.uEs[p] = new Array<i32>(this.fullN + 64);
        }
        this.uSs[p].fill(-1);
        this.uEs[p].fill(-1);
        this.filterTokens(this.vis[p]);
        for (let j = 0; j < d.ntok; j++) {
          d.passMul[j] = this.passSeen[this.map[j]];
        }
        this.reset();
        this.curPass = p;
        this.markSeenBefore(p);
        this.rec = true;
        this.recCur = -1;
        this.recOrd = p === 0;
        if (p === 0) {
          this.ord = [];
        }
        this.uS = this.uSs[p];
        this.uE = this.uEs[p];
        const po = this.passOuts[p];
        po.n = 0;
        const r = this.runPass(po, prof, mayRestart);
        if (getenv("FFPASS") !== null) {
          writeFileBytesSync(`ffpass${p}.txt`, po.buf.slice(0, po.n));
        }
        if (r === PASS_RESTART) {
          restart = true;
          break;
        }
        if (r === PASS_FAIL) {
          this.rec = false;
          return false;
        }
        this.recordDecisions();
      }
      this.rec = false;
      if (restart) {
        restarts++;
        mayRestart = restarts < 4;
        if (!lex(d)) {
          return false;
        }
        continue;
      }
      this.mergePasses(out);
      return true;
    }
  }

  /** One formatting pass over the document's (current) tokens. */
  runPass(out: Out, prof: i64[], mayRestart: boolean): i32 {
    const d = this.d;
    this.cpGen = this.cpGen + 1;
    const t1 = monotonicNanos();
    const p = new Parser(d);
    p.parseFile();
    if (d.failed) {
      return PASS_FAIL;
    }
    if (mayRestart && this.sortUsings()) {
      // The using-declarations were reordered in the text: start over on it.
      return PASS_RESTART;
    }
    const t2 = monotonicNanos();
    this.ann.reset();
    this.ind.reset();
    this.classifyAll();
    if (d.failed) {
      return PASS_FAIL;
    }
    this.markOffRegions();
    this.markUntouched();
    this.setCommentLineLevels(d.topHead);
    this.mergeDefines();
    this.joinShortBlocks(d.topHead, 0);
    const t3 = monotonicNanos();
    // clang-format leaves namespace end comments alone when braces do not balance.
    let braces = 0;
    for (let t = 0; t < d.ntok; t++) {
      if (d.kind[t] === P_LBRACE) {
        braces++;
      } else if (d.kind[t] === P_RBRACE) {
        braces--;
      }
    }
    this.bracesBalanced = braces === 0;
    for (let t = 0; t < d.ntok; t++) {
      d.keepWs[t] = 0;
    }
    this.emitList(d.topHead, 0, false);
    if (d.failed) {
      return PASS_FAIL;
    }
    const t4 = monotonicNanos();
    this.alignChainedConditionals();
    this.markOutputNewlines();
    this.alignTrailingComments();
    if (this.rec) {
      // Where this pass leaves each comment it formats, for later passes.
      for (let i = 0; i < this.nem; i++) {
        const t = this.emTok[i];
        if (t >= 0 && t < d.ntok && d.kind[t] === K_COMMENT && !this.isFin(i)) {
          this.finCol[this.map[t]] = this.emCol[i];
        }
      }
    }
    this.write(out);
    const t5 = monotonicNanos();
    if (prof.length >= 5) {
      prof[1] = prof[1] + (t2 - t1);
      prof[2] = prof[2] + (t3 - t2);
      prof[3] = prof[3] + (t4 - t3);
      prof[4] = prof[4] + (t5 - t4);
    }
    return PASS_OK;
  }

  // ---- Conditional compilation passes ---------------------------------------------

  /**
   * Works out clang-format's passes over the `#if` branches: the visible
   * tokens of each pass go to `vis`. Answers 0 when one pass sees every
   * token, else the number of passes.
   */
  planPasses(): i32 {
    const d = this.d;
    const n = d.ntok;
    let hasCond = false;
    for (let t = 0; t < n; t++) {
      if (d.ppKind[t] === PP_IF || d.ppKind[t] === PP_ELIF || d.ppKind[t] === PP_ELSE) {
        hasCond = true;
        break;
      }
    }
    if (!hasCond) {
      return 0;
    }
    this.ppIdx = [];
    this.ppCnt = [];
    let np = 0;
    let allVisible = true;
    while (true) {
      if (np >= toI32(this.vis.length)) {
        this.vis.push(new Array<i32>(0));
      }
      if (toI32(this.vis[np].length) < n) {
        this.vis[np] = new Array<i32>(n + 64);
      }
      const seen = this.planPass(this.vis[np]);
      if (np === 0 && !seen) {
        allVisible = false;
      }
      np++;
      // Next combination: drop exhausted levels, step the deepest one.
      while (this.ppIdx.length > 0 && this.ppIdx[this.ppIdx.length - 1] + 1 >= this.ppCnt[this.ppCnt.length - 1]) {
        this.ppIdx.pop();
        this.ppCnt.pop();
      }
      if (this.ppIdx.length === 0) {
        break;
      }
      this.ppIdx[this.ppIdx.length - 1] = this.ppIdx[this.ppIdx.length - 1] + 1;
    }
    if (np === 1 && allVisible) {
      return 0;
    }
    return np;
  }

  /** Marks the tokens one pass sees; answers whether it sees every token. */
  planPass(vis: i32[]): boolean {
    const d = this.d;
    const n = d.ntok;
    let level = -1;
    const chain: i32[] = [];
    const unreach: i32[] = []; // per open branch: 1 when its tokens are skipped
    let all = true;
    for (let t = 0; t < n; t++) {
      const pk = d.ppKind[t];
      if (pk === PP_IF) {
        let u = false;
        const w = t + 1;
        const c = t + 2;
        if (w < n && d.ppId[w] === t && c < n && d.ppId[c] === t) {
          const word = d.text(w);
          const cond = d.text(c);
          if (word === "if" && (cond === "0" || cond === "false")) {
            u = true;
          } else if (word === "ifdef" && cond === "SWIG") {
            u = true;
          }
        }
        level = this.condStart(level, chain, unreach, u);
      } else if (pk === PP_ELIF || pk === PP_ELSE) {
        if (level === -1) {
          level = this.condStart(level, chain, unreach, true);
        }
        unreach.pop();
        if (chain.length > 0) {
          chain[chain.length - 1] = chain[chain.length - 1] + 1;
        }
        const skip = level >= 0 && chain.length > 0 && this.ppIdx[level] !== chain[chain.length - 1];
        unreach.push(skip || (unreach.length > 0 && unreach[unreach.length - 1] === 1) ? 1 : 0);
      } else if (pk === PP_ENDIF) {
        if (level >= 0 && chain.length > 0) {
          const k = chain[chain.length - 1] + 1;
          if (k > this.ppCnt[level]) {
            this.ppCnt[level] = k;
          }
        }
        if (level > -1) {
          level--;
        }
        if (chain.length > 0) {
          chain.pop();
        }
        if (unreach.length > 0) {
          unreach.pop();
        }
      }
      const v = d.inPP[t] === 1 || d.kind[t] === K_EOF || unreach.length === 0 || unreach[unreach.length - 1] === 0 || this.readWithDirective(t);
      vis[t] = v ? 1 : 0;
      if (!v) {
        all = false;
      }
    }
    return all;
  }

  /**
   * Whether line comment `t` starts the line after a directive that ends in
   * a line comment, at or right of it: clang-format reads it as the rest of
   * the directive's comment section, in every pass, reachable or not.
   */
  readWithDirective(t: i32): boolean {
    const d = this.d;
    if (t <= 0 || d.kind[t] !== K_COMMENT || d.nl[t] !== 1 || d.at(d.start[t] + 1) !== 47) {
      return false;
    }
    const p = t - 1;
    if (d.kind[p] !== K_COMMENT || d.at(d.start[p] + 1) !== 47) {
      return false;
    }
    if (d.inPP[p] !== 1 && !this.readWithDirective(p)) {
      return false;
    }
    // (clang-format's directive token source reads on past a newline only
    // for a line comment at or right of the comment before it.)
    return this.origColumn(t) >= this.origColumn(p);
  }

  /** clang-format's conditionalCompilationStart; answers the new level. */
  condStart(level0: i32, chain: i32[], unreach: i32[], u: boolean): i32 {
    const level = level0 + 1;
    if (level === toI32(this.ppIdx.length)) {
      this.ppIdx.push(0);
      this.ppCnt.push(0);
    }
    chain.push(u ? -1 : 0);
    const skip = this.ppIdx[level] > 0;
    unreach.push(u || skip || (unreach.length > 0 && unreach[unreach.length - 1] === 1) ? 1 : 0);
    return level;
  }

  /**
   * Marks the passes that see a token no earlier pass saw: only those can
   * contribute to the output (pass 0 always does).
   */
  markUsefulPasses(np: i32): void {
    const n = this.fullN;
    if (toI32(this.useful.length) < np) {
      this.useful = new Array<i32>(np + 16);
    }
    if (toI32(this.seenBy.length) < n) {
      this.seenBy = new Array<i32>(n + 64);
    }
    const v0 = this.vis[0];
    for (let t = 0; t < n; t++) {
      this.seenBy[t] = v0[t];
    }
    this.useful[0] = 1;
    for (let p = 1; p < np; p++) {
      const v = this.vis[p];
      let any = 0;
      for (let t = 0; t < n; t++) {
        if (v[t] === 1 && this.seenBy[t] === 0) {
          this.seenBy[t] = 1;
          any = 1;
        }
      }
      this.useful[p] = any;
    }
  }

  /** Marks the source tokens that a pass before `p` saw. */
  markSeenBefore(p: i32): void {
    const n = this.fullN;
    if (toI32(this.seenBefore.length) < n) {
      this.seenBefore = new Array<i32>(n + 64);
    }
    for (let t = 0; t < n; t++) {
      this.seenBefore[t] = 0;
    }
    for (let q = 0; q < p; q++) {
      if (this.useful[q] === 0) {
        continue;
      }
      const v = this.vis[q];
      for (let t = 0; t < n; t++) {
        if (v[t] === 1) {
          this.seenBefore[t] = 1;
        }
      }
    }
  }

  /**
   * Records the line-break decision of each token this pass formatted first:
   * clang-format's later passes keep a finalized token's decision.
   */
  recordDecisions(): void {
    const d = this.d;
    for (let i = 0; i < this.nem; i++) {
      const t = this.emTok[i];
      if (t < 0 || t >= d.ntok || d.keepWs[t] === 1 || this.untouchedKind(t) > 0) {
        continue;
      }
      const f = this.map[t];
      if (this.seenBefore[f] === 1 || this.decFull[f] !== 0) {
        continue;
      }
      this.decFull[f] = this.emNl[i] > 0 ? 2 : 1;
    }
  }

  /** Copies the lexed token columns aside, before passes filter them. */
  saveTokens(): void {
    const d = this.d;
    const n = d.ntok;
    this.fullN = n;
    if (toI32(this.sKind.length) < n) {
      const c = n + 64;
      this.sKind = new Array<i32>(c);
      this.sStart = new Array<i32>(c);
      this.sEnd = new Array<i32>(c);
      this.sNl = new Array<i32>(c);
      this.sWs = new Array<i32>(c);
      this.sCol = new Array<i32>(c);
      this.sWidth = new Array<i32>(c);
      this.sMulti = new Array<i32>(c);
      this.sPlain = new Array<i32>(c);
      this.sInPP = new Array<i32>(c);
      this.sPPKind = new Array<i32>(c);
      this.sPPId = new Array<i32>(c);
      this.sUnesc = new Array<i32>(c);
      this.sType = new Array<i32>(c);
      this.sFinal = new Array<i32>(c);
      this.o2p = new Array<i32>(c);
      this.map = new Array<i32>(c);
      this.decFull = new Array<i32>(c);
    }
    for (let t = 0; t < n; t++) {
      this.sKind[t] = d.kind[t];
      this.sStart[t] = d.start[t];
      this.sEnd[t] = d.end[t];
      this.sNl[t] = d.nl[t];
      this.sWs[t] = d.ws[t];
      this.sCol[t] = d.col[t];
      this.sWidth[t] = d.width[t];
      this.sMulti[t] = d.multi[t];
      this.sPlain[t] = d.plain[t];
      this.sInPP[t] = d.inPP[t];
      this.sPPKind[t] = d.ppKind[t];
      this.sPPId[t] = d.ppId[t];
      this.sUnesc[t] = d.unesc[t];
      this.sType[t] = d.type[t];
      this.sFinal[t] = d.final[t];
    }
  }

  /** Loads the tokens `vis` marks into the document, as one pass sees them. */
  /**
   * Whether the tokens hidden from this pass right after full token `t`
   * hold, outside any brace of their own, a `;` or a statement keyword:
   * clang-format's brace scan reads every branch's tokens, and those make
   * an open brace a block.
   */
  hiddenSemi(t: i32, vis: i32[]): i32 {
    let depth = 0;
    for (let q = t + 1; q < this.fullN && vis[q] === 0; q++) {
      const k = this.sKind[q];
      if (k === P_LBRACE) {
        depth++;
      } else if (k === P_RBRACE) {
        depth--;
      } else if (depth === 0 && this.sInPP[q] === 0 && (k === P_SEMI || k === KW_IF || k === KW_WHILE || k === KW_FOR || k === KW_SWITCH || k === KW_TRY)) {
        return 1;
      }
    }
    return 0;
  }

  filterTokens(vis: i32[]): void {
    this.cpGen = this.cpGen + 1;
    const d = this.d;
    let j = 0;
    for (let t = 0; t < this.fullN; t++) {
      if (vis[t] === 0) {
        this.o2p[t] = -1;
        continue;
      }
      this.o2p[t] = j;
      this.map[j] = t;
      d.kind[j] = this.sKind[t];
      d.start[j] = this.sStart[t];
      d.end[j] = this.sEnd[t];
      d.nl[j] = this.sNl[t];
      d.ws[j] = this.sWs[t];
      d.col[j] = this.sCol[t];
      d.width[j] = this.sWidth[t];
      d.multi[j] = this.sMulti[t];
      d.plain[j] = this.sPlain[t];
      d.inPP[j] = this.sInPP[t];
      d.ppKind[j] = this.sPPKind[t];
      const pid = this.sPPId[t];
      d.ppId[j] = pid >= 0 ? this.o2p[pid] : -1;
      d.unesc[j] = this.sUnesc[t];
      d.type[j] = this.sType[t];
      d.final[j] = this.sFinal[t];
      d.dec[j] = this.decFull[t];
      d.hidSemi[j] = this.hiddenSemi(t, vis);
      d.asmFin[j] = 0;
      d.nxt[j] = -1;
      d.prv[j] = -1;
      d.match[j] = -1;
      d.childHead[j] = -1;
      d.childTail[j] = -1;
      d.childCount[j] = 0;
      d.bk[j] = 0;
      d.nest[j] = 0;
      d.bind[j] = 0;
      d.mustBreak[j] = 0;
      d.spaces[j] = 0;
      j++;
    }
    d.ntok = j;
    d.nline = 0;
    d.topHead = -1;
    d.topTail = -1;
    d.failed = false;
  }

  /**
   * Builds the output from the passes: pass 0's output, with each run of
   * tokens pass 0 skipped taken from the first pass that saw it (or from the
   * source, when no pass did).
   */
  mergePasses(out: Out): void {
    const n = this.fullN;
    const v0 = this.vis[0];
    const s0 = this.uSs[0];
    const e0 = this.uEs[0];
    const b0 = this.passOuts[0];
    let pos = 0;
    for (let k = 0; k < toI32(this.ord.length); k++) {
      const o = this.ord[k];
      out.range(b0.buf, pos, e0[o]);
      pos = e0[o];
      let q = o + 1;
      while (q < n && v0[q] === 1 && s0[q] < 0) {
        q++;
      }
      if (q < n && v0[q] === 0) {
        let r = q;
        while (r < n && v0[r] === 0) {
          r++;
        }
        this.emitRun(out, q, r);
      }
    }
    out.range(b0.buf, pos, b0.n);
  }

  /** Writes the tokens [q, r), which pass 0 skipped. */
  emitRun(out: Out, q: i32, r: i32): void {
    for (let p = 1; p < this.npass; p++) {
      if (this.useful[p] === 0 || this.vis[p][q] !== 1) {
        continue;
      }
      const us = this.uSs[p];
      const ue = this.uEs[p];
      let lo = -1;
      let hi = -1;
      for (let t = q; t < r; t++) {
        if (us[t] >= 0 && (lo < 0 || us[t] < lo)) {
          lo = us[t];
        }
        if (ue[t] > hi) {
          hi = ue[t];
        }
      }
      if (lo >= 0 && hi >= lo) {
        out.range(this.passOuts[p].buf, lo, hi);
        return;
      }
    }
    // No pass saw these tokens: as written.
    const d = this.d;
    out.range(d.src, this.sEnd[q - 1], this.sEnd[r - 1]);
  }

  // ---- Using-declarations -------------------------------------------------------

  /**
   * Sorts each run of consecutive `using a::b;` lines as clang-format does,
   * before formatting: stable, by `::`-separated label, case-insensitively,
   * a name before a namespace, and drops duplicates. Rewrites the source and
   * answers true when anything moved.
   */
  sortUsings(): boolean {
    const d = this.d;
    let run: i32[] = [];
    let labels: u8[][] = [];
    const edits: i32[] = []; // triples: replaced range [a, b), source line (-1 deletes)
    let off = false;
    for (let l = d.topHead; l >= 0; l = d.lSibling[l]) {
      let f = d.lFirst[l];
      while (f >= 0 && d.kind[f] === K_COMMENT) {
        f = d.nxt[f];
      }
      let label: u8[] = [];
      const candidate = !off && d.lPP[l] === 0 && f >= 0 && d.kind[f] === KW_USING;
      if (candidate) {
        label = this.usingLabel(f);
      }
      if (!candidate || d.nl[d.lFirst[l]] > 1 || label.length === 0) {
        this.endUsingRun(run, labels, edits);
        run = [];
        labels = [];
      }
      if (candidate && label.length > 0) {
        run.push(l);
        labels.push(label);
      }
      for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
        if (d.kind[t] === K_COMMENT) {
          const m = this.offMarker(t);
          if (m === 1) {
            off = true;
          } else if (m === 2) {
            off = false;
          }
        }
      }
    }
    this.endUsingRun(run, labels, edits);
    if (edits.length === 0) {
      return false;
    }
    const out: u8[] = [];
    let at = 0;
    for (let i = 0; i < edits.length; i += 3) {
      for (let c = at; c < edits[i]; c++) {
        out.push(d.src[c]);
      }
      const src = edits[i + 2];
      if (src >= 0) {
        for (let c = d.start[d.lFirst[src]]; c < d.end[d.lLast[src]]; c++) {
          out.push(d.src[c]);
        }
      }
      at = edits[i + 1];
    }
    for (let c = at; c < d.n; c++) {
      out.push(d.src[c]);
    }
    d.reset(out, toI32(out.length));
    return true;
  }

  /** The sort label of the using-declaration at `u`, or empty when it is not one. */
  usingLabel(u: i32): u8[] {
    const d = this.d;
    const label: u8[] = [];
    let t = d.nxt[u];
    if (t >= 0 && d.kind[t] === KW_TYPENAME) {
      for (let c = d.start[t]; c < d.end[t]; c++) {
        label.push(d.src[c]);
      }
      label.push(32);
      t = d.nxt[t];
    }
    if (t >= 0 && d.kind[t] === P_COLONCOLON) {
      label.push(58);
      label.push(58);
      t = d.nxt[t];
    }
    let ident = false;
    while (t >= 0 && d.kind[t] === K_IDENT) {
      ident = true;
      for (let c = d.start[t]; c < d.end[t]; c++) {
        label.push(d.src[c]);
      }
      t = d.nxt[t];
      if (t < 0 || d.kind[t] !== P_COLONCOLON) {
        break;
      }
      label.push(58);
      label.push(58);
      t = d.nxt[t];
    }
    if (ident && t >= 0 && (d.kind[t] === P_SEMI || d.kind[t] === P_COMMA)) {
      return label;
    }
    return [];
  }

  /** Records the edits that sort the run of using lines `run`. */
  endUsingRun(run: i32[], labels: u8[][], edits: i32[]): void {
    const d = this.d;
    const n = toI32(run.length);
    if (n > 1) {
      // Stable insertion sort of positions by label.
      const order: i32[] = [];
      for (let i = 0; i < n; i++) {
        order.push(i);
        let j = i;
        while (j > 0 && compareUsingLabels(labels[i], labels[order[j - 1]]) < 0) {
          order[j] = order[j - 1];
          j--;
        }
        order[j] = i;
      }
      const kept: i32[] = [];
      for (let i = 0; i < n; i++) {
        if (kept.length > 0 && sameBytes(labels[kept[kept.length - 1]], labels[order[i]])) {
          continue;
        }
        kept.push(order[i]);
      }
      for (let i = 0; i < n; i++) {
        const l = run[i];
        if (i >= toI32(kept.length)) {
          const f = d.lFirst[l];
          edits.push(d.prv[f] >= 0 ? d.end[d.prv[f]] : 0);
          edits.push(d.end[d.lLast[l]]);
          edits.push(-1);
        } else if (kept[i] !== i) {
          edits.push(d.start[d.lFirst[l]]);
          edits.push(d.end[d.lLast[l]]);
          edits.push(run[kept[i]]);
        }
      }
    }
  }

  // ---- Includes ---------------------------------------------------------------

  /**
   * clang-format's include sorting, on the source text before anything is
   * formatted (sortCppIncludes): blocks of consecutive include lines, ended
   * by any other line (a blank one too), are ordered by category and header
   * name, with duplicates dropped. Off regions and raw strings are left
   * alone. Answers whether the text changed (it is then replaced).
   */
  sortIncludesText(): boolean {
    const d = this.d;
    const n = d.n;
    this.incA = [];
    this.incE = [];
    this.incNa = [];
    this.incNe = [];
    this.incCat = [];
    this.incEdits = [];
    this.incText = [];
    // (The text as a string, for the runtime's byte search: a file with no
    // include has nothing to sort, and one with no `R"` no raw string.)
    const text = String.fromBytes(d.src, 0, n);
    if (text.indexOf("include") < 0 && text.indexOf("import") < 0) {
      return false;
    }
    const anyRaw = text.indexOf("R\"") >= 0;
    let prev = n >= 3 && toI32(d.src[0]) === 0xef && toI32(d.src[1]) === 0xbb && toI32(d.src[2]) === 0xbf ? 3 : 0;
    let searchFrom = 0;
    let firstBlock = true;
    let mainFound = false;
    let off = false;
    let rawTerm = ")\"";
    while (true) {
      let pos = text.indexOf("\n", searchFrom);
      let lineEnd = pos >= 0 ? pos : n;
      // Trimmed bounds.
      let ta = prev;
      while (ta < lineEnd && isTrimByte(toI32(d.src[ta]))) {
        ta++;
      }
      let te = lineEnd;
      while (te > ta && isTrimByte(toI32(d.src[te - 1]))) {
        te--;
      }
      const term = anyRaw ? this.rawStringTerm(ta, te) : "";
      if (term.length > 0) {
        rawTerm = term;
        off = true;
      }
      // (Only a line inside a raw string can end it.)
      if (off && this.textContains(ta, te, rawTerm)) {
        off = false;
      }
      if (this.isFormatOff(ta, te)) {
        off = true;
      } else if (this.isFormatOn(ta, te)) {
        off = false;
      }
      const merge = te > ta && toI32(d.src[te - 1]) === 92;
      if (!off && !merge) {
        if (this.matchInclude(prev, lineEnd)) {
          if (this.textContains(prev, lineEnd, "/*") && !this.textContains(prev, lineEnd, "*/")) {
            // An unclosed block comment: the lines up to its end go along.
            const c = this.findText("*/", searchFrom);
            pos = c;
            lineEnd = c >= 0 ? c + 2 : n;
          }
          const name = String.fromBytes(d.src, this.incNameA, this.incNameE);
          let cat = includeCategoryOf(name);
          if (!mainFound && firstBlock && this.isMainFile && this.isMainHeaderName(name)) {
            cat = 0;
            mainFound = true;
          }
          this.incA.push(prev);
          this.incE.push(lineEnd);
          this.incNa.push(this.incNameA);
          this.incNe.push(this.incNameE);
          this.incCat.push(cat);
        } else if (this.incA.length > 0) {
          this.sortIncludeBlock();
          firstBlock = this.textStartsWith(ta, te, "#pragma hdrstop");
        }
      }
      if (pos < 0 || pos + 1 === n) {
        break;
      }
      if (!merge) {
        prev = pos + 1;
      }
      searchFrom = pos + 1;
    }
    if (this.incA.length > 0) {
      this.sortIncludeBlock();
    }
    const ed = this.incEdits;
    if (ed.length === 0) {
      return false;
    }
    const out: u8[] = [];
    let at = 0;
    for (let i = 0; i < toI32(ed.length); i += 2) {
      for (let c = at; c < ed[i]; c++) {
        out.push(d.src[c]);
      }
      const txt = this.incText[i / 2];
      for (let c = 0; c < toI32(txt.length); c++) {
        out.push(txt[c]);
      }
      at = ed[i + 1];
    }
    for (let c = at; c < n; c++) {
      out.push(d.src[c]);
    }
    d.reset(out, toI32(out.length));
    return true;
  }

  /** Sorts the include block collected in incA..incCat and clears it. */
  sortIncludeBlock(): void {
    const d = this.d;
    const k = toI32(this.incA.length);
    const idx: i32[] = [];
    for (let i = 0; i < k; i++) {
      idx.push(i);
    }
    // Stable insertion sort by (category, header name bytes).
    for (let i = 1; i < k; i++) {
      const x = idx[i];
      let j = i - 1;
      while (j >= 0 && this.includeLess(x, idx[j])) {
        idx[j + 1] = idx[j];
        j--;
      }
      idx[j + 1] = x;
    }
    // Duplicates (same trimmed line) next to each other are dropped.
    const keep: i32[] = [];
    for (let i = 0; i < k; i++) {
      if (keep.length > 0 && this.sameTrimmed(keep[keep.length - 1], idx[i])) {
        continue;
      }
      keep.push(idx[i]);
    }
    let sorted = toI32(keep.length) === k;
    for (let i = 0; sorted && i < k; i++) {
      if (keep[i] !== i) {
        sorted = false;
      }
    }
    if (!sorted) {
      const txt: u8[] = [];
      for (let i = 0; i < toI32(keep.length); i++) {
        if (i > 0) {
          txt.push(10);
        }
        for (let c = this.incA[keep[i]]; c < this.incE[keep[i]]; c++) {
          txt.push(d.src[c]);
        }
      }
      const a = this.incA[0];
      const e = this.incE[k - 1];
      let same = toI32(txt.length) === e - a;
      for (let c = 0; same && c < e - a; c++) {
        if (txt[c] !== d.src[a + c]) {
          same = false;
        }
      }
      if (!same) {
        this.incEdits.push(a);
        this.incEdits.push(e);
        this.incText.push(txt);
      }
    }
    this.incA = [];
    this.incE = [];
    this.incNa = [];
    this.incNe = [];
    this.incCat = [];
  }

  /** Whether include `x` of the block sorts before include `y`. */
  includeLess(x: i32, y: i32): boolean {
    const cx = this.incCat[x];
    const cy = this.incCat[y];
    if (cx !== cy) {
      return cx < cy;
    }
    const src = this.d.src;
    const ax = this.incNa[x];
    const ay = this.incNa[y];
    const lx = this.incNe[x] - ax;
    const ly = this.incNe[y] - ay;
    const m = lx < ly ? lx : ly;
    for (let i = 0; i < m; i++) {
      const p = toI32(src[ax + i]);
      const q = toI32(src[ay + i]);
      if (p !== q) {
        return p < q;
      }
    }
    return lx < ly;
  }

  /** Whether includes `x` and `y` of the block have the same line, trimmed. */
  sameTrimmed(x: i32, y: i32): boolean {
    const src = this.d.src;
    let ax = this.incA[x];
    let ex = this.incE[x];
    let ay = this.incA[y];
    let ey = this.incE[y];
    while (ax < ex && isTrimByte(toI32(src[ax]))) {
      ax++;
    }
    while (ex > ax && isTrimByte(toI32(src[ex - 1]))) {
      ex--;
    }
    while (ay < ey && isTrimByte(toI32(src[ay]))) {
      ay++;
    }
    while (ey > ay && isTrimByte(toI32(src[ey - 1]))) {
      ey--;
    }
    if (ex - ax !== ey - ay) {
      return false;
    }
    for (let i = 0; i < ex - ax; i++) {
      if (src[ax + i] !== src[ay + i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Whether source line [a, e) is an include, by clang-format's regex
   * `^[\t ]*#[\t ]*(import|include)[^"<]*(["<][^">]*[">])`; sets
   * incNameA/incNameE to the header name, delimiters included.
   */
  matchInclude(a: i32, e: i32): boolean {
    const src = this.d.src;
    let i = a;
    while (i < e && (toI32(src[i]) === 32 || toI32(src[i]) === 9)) {
      i++;
    }
    if (i >= e || toI32(src[i]) !== 35) {
      return false;
    }
    i++;
    while (i < e && (toI32(src[i]) === 32 || toI32(src[i]) === 9)) {
      i++;
    }
    if (this.textHas(i, e, "include")) {
      i = i + 7;
    } else if (this.textHas(i, e, "import")) {
      i = i + 6;
    } else {
      return false;
    }
    while (i < e && toI32(src[i]) !== 34 && toI32(src[i]) !== 60) {
      i++;
    }
    if (i >= e) {
      return false;
    }
    const na = i;
    i++;
    while (i < e && toI32(src[i]) !== 34 && toI32(src[i]) !== 62) {
      i++;
    }
    if (i >= e) {
      return false;
    }
    this.incNameA = na;
    this.incNameE = i + 1;
    return true;
  }

  /** The raw string terminator `)delim"` if text [a, e) opens a raw string, else empty. */
  rawStringTerm(a: i32, e: i32): string {
    const src = this.d.src;
    for (let i = a; i + 2 < e; i++) {
      if (toI32(src[i]) !== 82 || toI32(src[i + 1]) !== 34) {
        continue;
      }
      let j = i + 2;
      while (j < e && isRawDelimByte(toI32(src[j]))) {
        j++;
      }
      if (j < e && toI32(src[j]) === 40) {
        return ")" + String.fromBytes(src, i + 2, j) + "\"";
      }
    }
    return "";
  }

  /** Whether trimmed line [a, e) turns formatting off (`// clang-format off`...). */
  isFormatOff(a: i32, e: i32): boolean {
    if (e - a < 2 || toI32(this.d.src[a]) !== 47) {
      return false;
    }
    return this.textIs(a, e, "/* clang-format off */") || this.markerAt(a, e, "// clang-format off") || this.textIs(a, e, "/* fastfmt off */") || this.markerAt(a, e, "// fastfmt off");
  }

  /** Whether trimmed line [a, e) turns formatting back on. */
  isFormatOn(a: i32, e: i32): boolean {
    if (e - a < 2 || toI32(this.d.src[a]) !== 47) {
      return false;
    }
    return this.textIs(a, e, "/* clang-format on */") || this.markerAt(a, e, "// clang-format on") || this.textIs(a, e, "/* fastfmt on */") || this.markerAt(a, e, "// fastfmt on");
  }

  /** Whether [a, e) is `m`, or starts with `m` then `:`. */
  markerAt(a: i32, e: i32, m: string): boolean {
    const n = toI32(m.length);
    return this.textHas(a, e, m) && (e - a === n || toI32(this.d.src[a + n]) === 58);
  }

  /** Whether [a, e) is exactly `m`. */
  textIs(a: i32, e: i32, m: string): boolean {
    return e - a === toI32(m.length) && this.textHas(a, e, m);
  }

  /** Whether [a, e) starts with `m`. */
  textStartsWith(a: i32, e: i32, m: string): boolean {
    return this.textHas(a, e, m);
  }

  /** Whether `m` occurs at offset `a` within [a, e). */
  textHas(a: i32, e: i32, m: string): boolean {
    const n = toI32(m.length);
    if (e - a < n) {
      return false;
    }
    const src = this.d.src;
    for (let i = 0; i < n; i++) {
      if (toI32(src[a + i]) !== m.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** Whether `m` occurs anywhere in [a, e). */
  textContains(a: i32, e: i32, m: string): boolean {
    const n = toI32(m.length);
    if (n === 0) {
      return true;
    }
    const src = this.d.src;
    const c0 = m.charCodeAt(0);
    for (let i = a; i + n <= e; i++) {
      if (toI32(src[i]) === c0 && this.textHas(i, e, m)) {
        return true;
      }
    }
    return false;
  }

  /** The offset of byte `b` at or after `from`, or -1. */
  findByte(b: i32, from: i32): i32 {
    const d = this.d;
    for (let i = from; i < d.n; i++) {
      if (toI32(d.src[i]) === b) {
        return i;
      }
    }
    return -1;
  }

  /** The offset of `m` at or after `from`, or -1. */
  findText(m: string, from: i32): i32 {
    const n = this.d.n;
    for (let i = from; i + toI32(m.length) <= n; i++) {
      if (this.textHas(i, n, m)) {
        return i;
      }
    }
    return -1;
  }



  // ---- Chained conditionals ------------------------------------------------

  /**
   * Lines up the `?` of each step of a chained conditional, and its final
   * `:`, at one column: the matching operator and the rest of its line move
   * right. Runs of matches are grouped by indent level, bracket depth and
   * conditional depth, as clang-format's whitespace pass does.
   */
  alignChainedConditionals(): void {
    const d = this.d;
    const a = this.ann;
    const n = this.nem;
    // Is there a chained conditional at all?
    let any = false;
    for (let i = 0; i < n; i++) {
      const t = this.emTok[i];
      if (t >= 0 && d.type[t] === TT_CONDITIONAL_EXPR) {
        any = true;
        break;
      }
    }
    if (!any) {
      return;
    }
    if (toI32(this.acLev.length) < n * 3) {
      this.acLev = new Array<i32>(n * 3);
    }
    // Conditional depth: a conditional that follows another's `:` continues its chain.
    const scope = new Array<i32>(0);
    let cl = 0;
    for (let i = 0; i < n; i++) {
      const t = this.emTok[i];
      if (t < 0) {
        this.acLev[i * 3] = i > 0 ? this.acLev[(i - 1) * 3] : 0;
        this.acLev[i * 3 + 1] = i > 0 ? this.acLev[(i - 1) * 3 + 1] : 0;
        this.acLev[i * 3 + 2] = cl;
        continue;
      }
      let first = true;
      for (let k = a.fkHead[t]; k >= 0; k = a.fkNext[k]) {
        // Outermost first; the first is the one a chain may continue.
        const p = d.prv[t];
        const nested = a.fkPrec[k] === PREC_CONDITIONAL && !(first && p >= 0 && d.type[p] === TT_CONDITIONAL_EXPR && d.kind[p] === P_COLON);
        if (nested) {
          cl++;
        }
        scope.push(nested ? 1 : 0);
        first = false;
      }
      this.acLev[i * 3] = a.ilev[t];
      this.acLev[i * 3 + 1] = a.nest[t];
      this.acLev[i * 3 + 2] = cl;
      for (let r = a.fakeR[t]; r > 0 && scope.length > 0; r--) {
        if (scope.pop() === 1) {
          cl--;
        }
      }
    }
    this.acTokens(0);
  }

  /** Compares the level tuples of emitted entries `i` and `j`. */
  acCmp(i: i32, j: i32): i32 {
    for (let k = 0; k < 3; k++) {
      const x = this.acLev[i * 3 + k];
      const y = this.acLev[j * 3 + k];
      if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
    return 0;
  }

  acMatch(i: i32): boolean {
    const d = this.d;
    const t = this.emTok[i];
    if (t < 0 || d.type[t] !== TT_CONDITIONAL_EXPR) {
      return false;
    }
    if (d.kind[t] === P_QUESTION) {
      return this.emNl[i] === 0;
    }
    const nx = d.nxt[t];
    if (d.kind[t] !== P_COLON || nx < 0) {
      return false;
    }
    const h = this.ann.fkHead[nx];
    return h < 0 || this.ann.fkPrec[h] !== PREC_CONDITIONAL;
  }

  /** The column just past the last entry on `i`'s output line. */
  acLineEnd(i: i32): i32 {
    let j = i;
    while (j + 1 < this.nem && this.emNl[j + 1] === 0) {
      j++;
    }
    return this.emCol[j] + this.emWidth(this.emTok[j]);
  }

  /** One level's runs of matches, from entry `start`; answers where it stopped. */
  acTokens(start: i32): i32 {
    const n = this.nem;
    const lim = this.d.opts.columnLimit;
    let widthLeft = 0;
    let widthRight = 0;
    let seqStart = -1;
    let seqEnd = 0;
    let commasBefore = 0;
    let commasBeforeLast = 0;
    let found = false;
    let lineIsComment = true;
    let i = start;
    while (i < n) {
      if (this.acCmp(i, start) < 0) {
        break;
      }
      const t = this.emTok[i];
      if (this.emNl[i] !== 0) {
        commasBefore = 0;
        seqEnd = i;
        if (this.emNl[i] > 1 || (!found && !lineIsComment) || !found) {
          this.acAlign(seqStart, seqEnd, widthLeft);
          widthLeft = 0;
          widthRight = 0;
          seqStart = -1;
        }
        found = false;
        lineIsComment = true;
      }
      if (t < 0 || this.d.kind[t] !== K_COMMENT) {
        lineIsComment = false;
      }
      if (t >= 0 && this.d.kind[t] === P_COMMA) {
        commasBefore++;
      } else if (this.acCmp(i, start) > 0) {
        i = this.acTokens(i);
        continue;
      }
      if (!this.acMatch(i)) {
        i++;
        continue;
      }
      if (found || commasBefore !== commasBeforeLast) {
        this.acAlign(seqStart, i, widthLeft);
        widthLeft = 0;
        widthRight = 0;
        seqStart = -1;
      }
      commasBeforeLast = commasBefore;
      found = true;
      if (seqStart < 0) {
        seqStart = i;
      }
      const left = this.emCol[i];
      const right = this.acLineEnd(i) - this.emCol[i];
      const nl = left > widthLeft ? left : widthLeft;
      const nr = right > widthRight ? right : widthRight;
      if (lim < nl + nr) {
        this.acAlign(seqStart, i, widthLeft);
        seqStart = i;
        widthLeft = left;
        widthRight = right;
      } else {
        widthLeft = nl;
        widthRight = nr;
      }
      i++;
    }
    this.acAlign(seqStart, i, widthLeft);
    return i;
  }

  /** Moves each line's first match in [s, e) (and what follows it on the line) to `col`. */
  acAlign(s: i32, e: i32, col: i32): void {
    if (s < 0 || s >= e) {
      return;
    }
    let found = false;
    let shift = 0;
    let eff = 0; // how far the current output line's tokens have moved
    const scope = new Array<i32>(0);
    for (let i = s; i < e; i++) {
      if (scope.length > 0 && this.acCmp(i, scope[scope.length - 1]) < 0) {
        scope.pop();
      }
      let pnc = i - 1;
      while (pnc > s && this.emTok[pnc] >= 0 && this.d.kind[this.emTok[pnc]] === K_COMMENT) {
        pnc--;
      }
      if (i !== s && this.acCmp(i, pnc) > 0) {
        scope.push(i);
      }
      const inside = scope.length > 0;
      if (this.emNl[i] > 0) {
        // clang-format adds the shift to a token's spaces: what follows on
        // its output line moves by what the tokens before it moved.
        eff = 0;
        if (!inside) {
          shift = 0;
          found = false;
        }
      }
      if (!found && !inside && this.acMatch(i)) {
        found = true;
        shift = col - this.emCol[i];
        eff = eff + shift;
      } else if (shift !== 0 && inside && this.emNl[i] > 0) {
        const t = this.emTok[i];
        const p = t >= 0 ? this.d.prv[t] : -1;
        if (t >= 0 && (this.d.type[t] === TT_CONDITIONAL_EXPR || (p >= 0 && this.d.type[p] === TT_CONDITIONAL_EXPR))) {
          eff = eff + shift;
        }
      }
      this.emCol[i] = this.emCol[i] + eff;
    }
    // The rest of the last output line, past the sequence, moves with it.
    for (let i = e; eff !== 0 && i < this.nem && this.emNl[i] === 0; i++) {
      this.emCol[i] = this.emCol[i] + eff;
    }
  }

  // ---- Trailing comments ------------------------------------------------------

  /**
   * Aligns trailing comments: each comment that ends an output line joins
   * the run of the line before when it fits beside every comment in the run;
   * a comment alone on its line joins only when it was not lined up with the
   * code under it. The run's comments move to its widest start.
   */
  alignTrailingComments(): void {
    const d = this.d;
    const lim = d.opts.columnLimit;
    const n = this.nem;
    if (toI32(this.emColPre.length) < n) {
      this.emColPre = new Array<i32>(n + 64);
    }
    for (let i = 0; i < n; i++) {
      this.emColPre[i] = this.emCol[i];
    }
    let startSeq = 0;
    let minCol = 0;
    let maxCol = 1 << 30;
    let newlines = 0;
    let breakBeforeNext = false;
    let prevI = -1; // the entry before, among those this pass formats
    let prevJoined = false; // that entry is a line comment a directive's line went on to take
    let secEnd = -1; // the last entry of a line comment section measured reflowed
    let secW = 0; // and its widest line
    for (let i = 0; i < n; i++) {
      if (this.isFin(i)) {
        continue;
      }
      const pi = prevI;
      prevI = i;
      newlines = newlines + this.emNl[i];
      if (!this.isTrailingAt(i)) {
        prevJoined = false;
        continue;
      }
      const t = this.emTok[i];
      // A line comment under a directive's trailing line comment, starting at
      // or right of it, continues the directive's line for clang-format (its
      // token source reads on): it goes under that comment.
      let joined = false;
      // (Under a directive comment an earlier pass formatted: where that
      // pass left it.)
      if (t >= 0 && i > 0 && this.isFin(i - 1) && this.emNl[i] === 1 && d.nl[t] === 1 && d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT && d.inPP[t] === 0 && !this.verbatimAt(i)) {
        const pt = this.emTok[i - 1];
        if (pt >= 0 && d.kind[pt] === K_COMMENT && d.type[pt] === TT_LINE_COMMENT && d.inPP[pt] === 1 && d.prv[pt] >= 0 && this.origColumn(t) >= this.origColumn(pt) && this.finCol[this.map[pt]] >= 0) {
          joined = true;
          this.emCol[i] = this.finCol[this.map[pt]];
        }
      }
      if (!joined && t >= 0 && pi >= 0 && pi === i - 1 && this.emNl[i] === 1 && d.nl[t] === 1 && d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT && d.inPP[t] === 0 && !this.verbatimAt(i)) {
        const pt = this.emTok[i - 1];
        if (pt >= 0 && d.kind[pt] === K_COMMENT && d.type[pt] === TT_LINE_COMMENT && (d.inPP[pt] === 1 || prevJoined) && this.origColumn(t) >= this.origColumn(pt)) {
          joined = true;
          this.emCol[i] = this.emCol[i - 1];
        }
      }
      prevJoined = joined;
      const cmin = this.emCol[i];
      let w = t >= 0 ? (d.kind[t] === K_COMMENT && d.multi[t] === 0 ? d.end[t] - d.start[t] : d.width[t]) : this.emWidth(t);
      // (An include line's comment is never split.)
      if (i <= secEnd) {
        // A line of a section reflowed below: the section's widest line.
        w = secW;
      } else if (t >= 0 && d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT && !this.verbatimAt(i) && !(d.ppId[t] >= 0 && d.ppKind[d.ppId[t]] === PP_INCLUDE) && d.opts.reflowComments && i + 1 < n && this.continuesSection(i + 1) && this.sectionOverflows(i, cmin)) {
        // A section that must reflow: clang-format reflows it where the line
        // formatter put it, and each of its lines takes part.
        w = this.secW;
        secW = w;
        secEnd = this.secEnd;
      } else if (t >= 0 && d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT && !this.verbatimAt(i) && !(d.ppId[t] >= 0 && d.ppKind[d.ppId[t]] === PP_INCLUDE)) {
        w = this.commentPieceMax(t, cmin);
      } else if (t >= 0 && d.kind[t] === K_COMMENT && d.type[t] === TT_BLOCK_COMMENT && d.multi[t] === 0 && d.inPP[t] === 0 && cmin + d.width[t] > lim && !this.verbatimAt(i)) {
        // A block comment reflowed to fit: its first line counts.
        this.blockCommentPenalty(t, cmin);
        w = this.bcFirstW;
      } else if (t >= 0 && d.kind[t] === K_COMMENT && d.type[t] === TT_BLOCK_COMMENT && d.multi[t] === 1 && d.inPP[t] === 1 && !this.verbatimAt(i)) {
        // Over several lines of a directive: its first line, without the
        // blanks and the backslash that end it.
        let q = d.start[t];
        while (q < d.end[t] && d.at(q) !== 10) {
          q++;
        }
        while (q > d.start[t] && (d.at(q - 1) === 32 || d.at(q - 1) === 9 || d.at(q - 1) === 13 || d.at(q - 1) === 92)) {
          q--;
        }
        w = q - d.start[t];
      }
      let cmax = this.verbatimAt(i) ? cmin : lim >= w ? lim - w : cmin;
      // (A comment the directive goes on after, past an escaped newline, or
      // whose own lines are, leaves room for the backslash.)
      if (t >= 0 && d.multi[t] === 1 && d.inPP[t] === 1 && cmax >= 2 && !this.verbatimAt(i)) {
        cmax = cmax - 2;
      }
      let wasAligned = false;
      if (this.emNl[i] >= 1 && t >= 0) {
        const cc = d.col[t];
        // Nothing after it: the end of the file is the next line.
        const eof = d.ntok - 1;
        wasAligned = d.kind[eof] === K_EOF && (cc === d.col[eof] || cc === d.col[eof] + d.opts.indentWidth);
        for (let j = i + 1; j < n; j++) {
          const tj = this.emTok[j];
          if (tj >= 0 && d.kind[tj] === K_COMMENT) {
            continue;
          }
          if (tj < 0 && tj > PIECE) {
            continue;
          }
          const nt = tj <= PIECE ? this.pcTok[PIECE - tj] : tj;
          const nc = d.col[nt];
          wasAligned = cc === nc || cc === nc + d.opts.indentWidth;
          break;
        }
      }
      if (pi >= 0 && this.emNl[i] === 0 && this.dontAlignAfter(this.emTok[pi])) {
        this.alignRun(startSeq, i, minCol);
        minCol = 0;
        maxCol = 1 << 30;
        startSeq = i + 1;
      } else if (breakBeforeNext || newlines > 1 || cmin > maxCol || cmax < minCol || (this.emNl[i] === 1 && pi >= 0 && (!this.isTrailingAt(pi) || this.endsInTokenChange(pi))) || wasAligned) {
        this.alignRun(startSeq, i, minCol);
        minCol = cmin;
        maxCol = cmax;
        startSeq = i;
      } else {
        if (cmin > minCol) {
          minCol = cmin;
        }
        if (cmax < maxCol) {
          maxCol = cmax;
        }
      }
      breakBeforeNext = pi < 0 || this.emNl[i] > 1 || (this.emNl[i] === 1 && startSeq === i);
      newlines = 0;
    }
    this.alignRun(startSeq, n, minCol);
  }

  /**
   * Whether the line comment at entry `i` ends with a change inside it on
   * its own line: a space added after `//` with no break after it. Such a
   * change is no trailing comment to clang-format, so an own-line comment
   * after it starts a new alignment sequence.
   */
  endsInTokenChange(i: i32): boolean {
    const d = this.d;
    const t = this.emTok[i];
    if (t < 0 || d.kind[t] !== K_COMMENT || d.type[t] !== TT_LINE_COMMENT || this.verbatimAt(i) || !d.opts.reflowComments) {
      return false;
    }
    this.lineGeom(t, this.emCol[i]);
    if (this.gStart - this.emCol[i] === this.gPre) {
      return false; // the prefix is kept as written
    }
    return this.gStart + this.colsAt(this.gA, this.gE, this.gStart) <= d.opts.columnLimit;
  }

  /** Token `t`'s column as written, tabs expanded. */
  origColumn(t: i32): i32 {
    const d = this.d;
    let ls = d.start[t];
    while (ls > 0 && d.at(ls - 1) !== 10) {
      ls--;
    }
    if (ls === 0 && d.n >= 3 && d.at(0) === 0xef && d.at(1) === 0xbb && d.at(2) === 0xbf) {
      ls = 3;
    }
    return this.colsAt(ls, d.start[t], 0);
  }

  /** Whether token `t` holds a tab. */
  hasTab(t: i32): boolean {
    const d = this.d;
    for (let i = d.start[t]; i < d.end[t]; i++) {
      if (d.at(i) === 9) {
        return true;
      }
    }
    return false;
  }

  /** Moves the trailing comments of entries [s, e) right to `col`. */
  alignRun(s: i32, e: i32, col: i32): void {
    for (let i = s; i < e; i++) {
      if (this.isTrailingAt(i) && this.emCol[i] < col && !this.isFin(i)) {
        this.emCol[i] = col;
      }
    }
  }

  /** Whether a comment after `t` ends a scope (a `}` that began its line, or `});`). */
  dontAlignAfter(t0: i32): boolean {
    const d = this.d;
    const a = this.ann;
    let t = t0;
    if (t < 0) {
      return false;
    }
    if (d.kind[t] === P_SEMI) {
      t = a.prevNonComment(t);
      if (t < 0) {
        return false;
      }
    }
    if (d.kind[t] === P_RPAREN) {
      t = d.match[t];
      if (t < 0) {
        return false;
      }
      t = a.prevNonComment(t);
      if (t < 0) {
        return false;
      }
      if (d.kind[t] === KW_WHILE && d.type[t] === TT_DO_WHILE) {
        const p = a.prevNonComment(t);
        if (p < 0) {
          return true;
        }
        t = p;
      }
    }
    if (d.kind[t] !== P_RBRACE) {
      return false;
    }
    while (d.prv[t] >= 0 && d.kind[d.prv[t]] === P_RBRACE) {
      t = d.prv[t];
    }
    // Whether that `}` starts a line of the output: on its next run
    // clang-format sees the output, and its result stops changing there.
    const onl = t < toI32(this.outNl.length) && this.outNlStamp[t] === this.fileStamp ? this.outNl[t] : d.nl[t];
    return onl > 0;
  }

  /** Records, per emitted token, the newlines before it in the output. */
  markOutputNewlines(): void {
    const d = this.d;
    this.fileStamp = this.fileStamp + 1;
    if (toI32(this.outNl.length) < d.ntok) {
      this.outNl = new Array<i32>(d.ntok + 64);
      this.outNlStamp = new Array<i32>(d.ntok + 64);
    }
    for (let i = 0; i < this.nem; i++) {
      const t = this.emTok[i];
      if (t >= 0) {
        this.outNl[t] = this.emNl[i];
        this.outNlStamp[t] = this.fileStamp;
      }
    }
  }

  /** Whether entry `i` is a comment that ends its output line. */
  isTrailingAt(i: i32): boolean {
    const t = this.emTok[i];
    if (t <= PIECE || (t >= 0 && this.d.kind[t] !== K_COMMENT) || this.untouchedKind(t) === 2) {
      return false;
    }
    if (i + 1 >= this.nem) {
      return true;
    }
    const n = this.emTok[i + 1];
    // (A block comment over several lines is trailing by its own line
    // breaks: clang-format re-indents them with changes inside the token.)
    return this.emNl[i + 1] > 0 || (n >= 0 && this.d.kind[n] === K_EOF) || (t >= 0 && this.d.multi[t] === 1 && this.d.type[t] === TT_BLOCK_COMMENT && !this.verbatimAt(i));
  }

  /** The column a trailing comment at `i` needs: one past the code before it. */
  minCommentCol(i: i32): i32 {

    const p = this.emTok[i - 1];
    return this.emCol[i - 1] + this.emWidth(p) + 1;
  }

  lastLineWidth(t: i32): i32 {
    const d = this.d;
    if (d.multi[t] === 0) {
      return d.width[t];
    }
    let a = d.end[t] - 1;
    while (a > d.start[t] && d.at(a) !== 10) {
      a--;
    }
    return widthOf(d.src, a + 1, d.end[t]);
  }

  // ---- Output -----------------------------------------------------------------

  write(out: Out): void {
    const d = this.d;
    let col = 0;
    this.asmSkew = 0;
    this.alignEscapes();
    for (let i = 0; i < this.nem; i++) {
      const t = this.emTok[i];
      const nl = this.emNl[i];
      if (this.rec) {
        this.recordSpan(out, t, nl, i);
      }
      if (nl > 0 && i > 0) {
        const pp = this.entryPP(t);
        if (pp >= 0 && pp === this.entryPP(this.emTok[i - 1])) {
          const pt = this.emTok[i - 1];
          if (t >= 0 && pt >= 0 && d.end[pt] <= d.start[t] && this.verbatimAt(i)) {
            // Left as written, escaped newlines and all.
            out.range(d.src, d.end[pt], d.end[t]);
            col = d.multi[t] === 1 ? this.lastLineWidth(t) : d.col[t] + d.width[t];
            continue;
          }
          // A break inside a directive: each newline is escaped, `\` at the directive's column.
          out.trimSpaces();
          const esc = this.escCol[pp];
          let sp = esc - (col - this.asmSkew) - 1;
          for (let k = 0; k < nl; k++) {
            out.spaces(sp < 1 && k === 0 ? 1 : sp);
            out.byte(92);
            out.byte(10);
            sp = esc - 1;
          }
          col = 0;
          this.asmSkew = 0;
          const c0 = this.emCol[i];
          if (t <= PIECE && t > RAW) {
            const k = PIECE - t;
            const pt = this.pcTok[k];
            out.spaces(c0);
            const pl = this.pieceLen(pt);
            out.range(d.src, d.start[pt], d.start[pt] + pl);
            out.range(d.src, this.pcA[k], this.pcB[k]);
            out.byte(34);
            col = c0 + this.pieceWidth(k);
            continue;
          }
          out.spaces(c0);
          col = c0;
          // (A block comment over the limit is reflowed there too.)
          if (t >= 0 && d.kind[t] === K_COMMENT && d.type[t] !== TT_LINE_COMMENT && (d.multi[t] === 1 || c0 + d.width[t] > d.opts.columnLimit - 2) && !this.verbatimAt(i)) {
            col = this.writeComment(out, t, col, i);
            continue;
          }
          out.range(d.src, d.start[t], d.end[t]);
          col = col + (d.multi[t] === 1 ? this.lastLineWidth(t) - col : d.width[t]);
          continue;
        }
      }
      if (t <= RAW) {
        const k = RAW - t;
        out.range(d.src, this.rawA[k], this.rawB[k]);
        // Raw bytes spanning lines end at their last line's width.
        let multiLine = false;
        for (let q = this.rawA[k]; q < this.rawB[k]; q++) {
          if (d.at(q) === 10) {
            multiLine = true;
            break;
          }
        }
        col = multiLine ? this.emWidth(t) : col + this.emWidth(t);
        continue;
      }
      if (t <= PIECE) {
        const k = PIECE - t;
        const pt = this.pcTok[k];
        if (nl > 0) {
          out.trimSpaces();
          out.newlines(nl);
          col = 0;
        }
        const pc = this.emCol[i];
        if (pc > col) {
          out.spaces(pc - col);
          col = pc;
        }
        const pl = this.pieceLen(pt);
        out.range(d.src, d.start[pt], d.start[pt] + pl);
        out.range(d.src, this.pcA[k], this.pcB[k]);
        out.byte(34);
        col = col + this.pieceWidth(k);
        continue;
      }
      if (t < 0) {
        const txt = this.synth[-t - 1];
        const c0 = this.emCol[i];
        if (c0 > col) {
          out.spaces(c0 - col);
          col = c0;
        }
        out.str(txt);
        col = col + toI32(txt.length);
        continue;
      }
      if (d.kind[t] === K_EOF) {
        break;
      }
      const unt = d.keepWs[t] === 1 ? 3 : this.untouchedKind(t);
      const ws0 = unt > 0 ? this.wsStart(t) : -1;
      if (ws0 >= 0 && (nl === 0 || unt === 3 || (unt === 1 && this.hasOff && this.offTok[t] === 1))) {
        // Whitespace clang-format does not touch: as written.
        out.range(d.src, ws0, d.start[t]);
        for (let k = ws0; k < d.start[t]; k++) {
          col = d.at(k) === 10 ? 0 : col + 1;
        }
        out.range(d.src, d.start[t], d.end[t]);
        col = d.multi[t] === 1 ? this.lastLineWidth(t) : col + d.width[t];
        // After a newline before an implicit string literal clang-format's
        // column is the 1-based spelling column, one past the written one,
        // and what follows is placed by spaces from there.
        if (unt === 2 && d.anyImplicit && d.nl[t] > 0 && d.type[t] === TT_IMPLICIT_STRING_LITERAL) {
          col = col + 1;
        }
        continue;
      }
      if (nl > 0) {
        out.trimSpaces();
        out.newlines(nl);
        col = 0;
      }
      if (nl > 0) {
        this.asmSkew = 0;
      }
      let c = this.emCol[i] + this.asmSkew;
      if (d.anyAsm && nl === 0 && t > 0 && d.prv[t] >= 0 && d.asmFin[d.prv[t]] === 1) {
        // After inline assembly's text (columns as written): its own space,
        // and what follows keeps its distance.
        if (d.ws[t] === 1) {
          out.spaces(1);
          col = col + 1;
        }
        this.asmSkew = col - this.emCol[i];
        c = col;
      } else if (c > col) {
        out.spaces(c - col);
        col = c;
      }
      if (!this.rerun && nl === 1 && i > 0 && d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT) {
        this.checkSectionRerun(i);
      }
      if (!this.rerun && nl === 1 && i > 0 && t >= 0 && d.nl[t] === 0) {
        this.checkMacroRerun(i);
      }
      if (!this.rerun && d.strTabs && t >= 0 && d.kind[t] === K_STRING) {
        this.checkTabStringRerun(t, c > col ? c : col);
      }
      // clang-format never breaks or reflows an include line's comment.
      const inInclude = d.ppId[t] >= 0 && d.ppKind[d.ppId[t]] === PP_INCLUDE;
      // (A line comment a backslash spliced over lines is written as it is:
      // clang-format's multiline token.)
      if (d.kind[t] === K_COMMENT && d.type[t] === TT_LINE_COMMENT && !this.verbatimAt(i) && !inInclude && d.multi[t] === 0) {
        // `//x` gets its space, which takes a comment that just fit past the
        // limit: the next run lays the line out with it.
        if (!this.rerun && d.opts.reflowComments && col + d.width[t] <= d.opts.columnLimit && col + d.width[t] + this.missingCommentSpace(t) > d.opts.columnLimit) {
          this.rerun = true;
        }
        const o0 = out.n;
        i = this.writeSection(out, i, col);
        col = this.wsCol;
        if (!this.rerun) {
          this.checkPieceRerun(out, o0, col);
        }
      } else if (d.kind[t] === K_COMMENT && !this.verbatimAt(i)) {
        const o0 = out.n;
        col = this.writeComment(out, t, col, i);
        // Broken over lines: the tokens after it on its line follow its end.
        if (d.multi[t] === 0 && i + 1 < this.nem && this.emNl[i + 1] === 0) {
          let broke = false;
          for (let q = o0; q < out.n; q++) {
            if (out.buf[q] === 10) {
              broke = true;
              break;
            }
          }
          const nt = this.emTok[i + 1];
          if (broke && nt >= 0) {
            const delta = col + d.spaces[nt] - this.emCol[i + 1];
            for (let j = i + 1; j < this.nem && (j === i + 1 || this.emNl[j] === 0); j++) {
              this.emCol[j] = this.emCol[j] + delta;
            }
          }
        }
      } else if (d.multi[t] === 1) {
        out.range(d.src, d.start[t], d.end[t]);
        col = this.lastLineWidth(t);
      } else {
        out.range(d.src, d.start[t], d.end[t]);
        col = col + d.width[t];
        // A string holding a tab is as wide as where it lands, which the
        // layout may have measured differently: clang-format writes the
        // spaces the next token needs, whatever the columns say.
        if (d.kind[t] === K_STRING && i + 1 < this.nem && this.emNl[i + 1] === 0 && this.hasTab(t)) {
          const nt = this.emTok[i + 1];
          if (nt >= 0 && d.kind[nt] !== K_COMMENT) {
            col = this.emCol[i + 1] - d.spaces[nt];
          }
        }
      }
    }
    out.trimSpaces();
    if (this.rec && this.recCur >= 0) {
      this.uE[this.map[this.recCur]] = out.n;
    }
    // End with one newline when the source did.
    if (d.n > 0 && d.at(d.n - 1) === 10) {
      out.byte(10);
    }
  }

  /**
   * Where each directive's escaped newlines go: at the column limit, or two
   * past its longest broken line when one is longer.
   */
  alignEscapes(): void {
    const d = this.d;
    if (toI32(this.escCol.length) < d.ntok + 1) {
      this.escCol = growI32(this.escCol, d.ntok + 1);
      this.escStamp = growI32(this.escStamp, d.ntok + 1);
    }
    this.fileStamp = this.fileStamp + 1;
    for (let i = 1; i < this.nem; i++) {
      if (this.emNl[i] === 0) {
        continue;
      }
      const t = this.emTok[i];
      const pp = this.entryPP(t);
      const p = this.emTok[i - 1];
      if (pp < 0 || pp !== this.entryPP(p)) {
        continue;
      }
      // A newline kept as written (a line with no layout, inline assembly)
      // is no line break of clang-format's: it moves no escapes.
      if (t >= 0 && (d.keepWs[t] === 1 || this.untouchedKind(t) === 3)) {
        continue;
      }
      if (this.escStamp[pp] !== this.fileStamp) {
        this.escStamp[pp] = this.fileStamp;
        this.escCol[pp] = d.opts.columnLimit;
      }
      let end = this.emCol[i - 1] + this.emWidth(p) + 2;
      if (p >= 0 && d.multi[p] === 1) {
        // A token over several lines ends on its last: a raw string where
        // it was, a block comment's lines moved with it.
        end = this.lastLineWidth(p) + 2 + (d.kind[p] === K_COMMENT ? this.emCol[i - 1] - d.col[p] : 0);
      }
      if (end > this.escCol[pp]) {
        this.escCol[pp] = end;
      }
    }
  }

  /** Whether pass token `t` was seen by an earlier #if pass. */
  seenTok(t: i32): boolean {
    return this.rec && this.curPass > 0 && t >= 0 && this.seenBefore[this.map[t]] === 1;
  }

  /**
   * Whether entry `i` belongs to a token an earlier #if pass formatted: such
   * tokens are finalized in clang-format and take no part in this pass's
   * alignment (a conditional directive's `#` is formatted again each pass).
   */
  isFin(i: i32): boolean {
    if (!this.rec || this.curPass === 0) {
      return false;
    }
    let t = this.emTok[i];
    if (t <= RAW) {
      return false;
    }
    if (t <= PIECE) {
      t = this.pcTok[PIECE - t];
    } else if (t < 0) {
      return false;
    }
    const d = this.d;
    if (d.kind[t] === P_HASH && (d.ppKind[t] === PP_IF || d.ppKind[t] === PP_ELIF || d.ppKind[t] === PP_ELSE || d.ppKind[t] === PP_ENDIF)) {
      return false;
    }
    return this.seenBefore[this.map[t]] === 1;
  }

  /** Whether emitted entry `i` lies in a `clang-format off` region. */
  verbatimAt(i: i32): boolean {
    const t = this.emTok[i];
    if (this.untouchedKind(t) > 0 || (t >= 0 && this.d.keepWs[t] === 1)) {
      return true;
    }
    if (!this.hasOff) {
      return false;
    }
    return t >= 0 && this.offTok[t] === 1;
  }

  /** Writes comment `t` at column `col`, reflowing a line comment that overflows. */
  writeComment(out: Out, t: i32, col: i32, i: i32): i32 {
    const d = this.d;
    if (d.type[t] !== TT_LINE_COMMENT) {
      if (d.opts.reflowComments && d.inPP[t] === 0 && this.offMarker(t) === 0 && (d.multi[t] === 1 || col + d.width[t] + this.unbreakableTail(t) > d.opts.columnLimit)) {
        const pre0 = i >= 0 && i < this.nem ? this.emColPre[i] : col;
        if (pre0 < col) {
          // Reflowed where the line formatter put it; trailing comment
          // alignment then shifts every line alike, as clang-format does.
          const o = this.bcShift;
          o.n = 0;
          const r = this.writeBlockComment(o, t, pre0);
          const sh = col - pre0;
          for (let q = 0; q < o.n; q++) {
            const b = o.buf[q];
            out.byte(toI32(b));
            if (b === 10 && q + 1 < o.n && o.buf[q + 1] !== 10) {
              out.spaces(sh);
            }
          }
          return r + sh;
        }
        // A one-line comment broken here is several lines on the next run,
        // which can lay out what is around it anew: run again.
        if (d.multi[t] === 0 && !this.rerun) {
          this.rerun = true;
        }
        return this.writeBlockComment(out, t, col);
      }
      // Several lines inside a directive: each line break is escaped at the
      // directive's column, as for code (clang-format drops the `\` first).
      const pp = this.entryPP(t);
      // (A single line is reflowed where it was placed, before trailing
      // comments were aligned; an include's comment never breaks.)
      const inInclude = d.ppId[t] >= 0 && d.ppKind[d.ppId[t]] === PP_INCLUDE;
      const pre = i >= 0 && i < this.nem ? this.emColPre[i] : col;
      if (d.opts.reflowComments && d.inPP[t] === 1 && !inInclude && (d.multi[t] === 1 || pre + d.width[t] + this.unbreakableTail(t) > d.opts.columnLimit - 2) && pp >= 0 && this.offMarker(t) === 0) {
        this.bcEsc = this.escStamp[pp] === this.fileStamp ? this.escCol[pp] : d.opts.columnLimit;
        this.bcPP = true;
        if (d.multi[t] === 0) {
          this.rerun = true;
        }
        const r = this.writeBlockComment(out, t, col);
        this.bcEsc = -1;
        this.bcPP = false;
        return r;
      }
      if (d.multi[t] === 0) {
        out.range(d.src, d.start[t], d.end[t]);
        // (A tab inside it is as wide as where the comment now starts.)
        return col + this.colsAt(d.start[t], d.end[t], col);
      }
      // Re-indent continuation lines by the distance the comment moved.
      const delta = col - d.col[t];
      let a = d.start[t];
      for (let j = a; j < d.end[t]; j++) {
        if (d.at(j) === 10) {
          out.range(d.src, a, j);
          out.trimSpaces();
          out.byte(10);
          let k = j + 1;
          let ws = 0;
          while (k < d.end[t] && (d.at(k) === 32 || d.at(k) === 9)) {
            k++;
            ws++;
          }
          const nw = ws + delta;
          out.spaces(nw < 0 ? 0 : nw);
          a = k;
          j = k - 1;
        }
      }
      out.range(d.src, a, d.end[t]);
      return this.lastLineWidth(t);
    }
    out.range(d.src, d.start[t], d.end[t]);
    return col + d.width[t];
  }

  // ---- Block comments ------------------------------------------------------

  /**
   * Writes block comment `t` at column `col` as clang-format's
   * BreakableBlockComment does: continuation lines re-indented with the
   * comment, `*` decorations aligned under the opening star, lines over the
   * limit broken at blanks, and the rest of a broken line reflowed into the
   * next when it may be. Answers the column after the comment.
   */
  writeBlockComment(out: Out, t: i32, col: i32): i32 {
    const d = this.d;
    const lim = d.opts.columnLimit - (this.bcPP ? 2 : 0);
    this.bcTail = this.unbreakableTail(t);
    const s0 = d.start[t] + 2;
    const s1 = d.end[t] - 2;
    // Lines[i] = [la, le); Content[i] = [ca, ce); ContentColumn[i] = cc.
    let nL = 1;
    for (let q = s0; q < s1; q++) {
      if (d.at(q) === 10) {
        nL++;
      }
    }
    if (toI32(this.bcLa.length) < nL) {
      this.bcLa = new Array<i32>(nL + 8);
      this.bcLe = new Array<i32>(nL + 8);
      this.bcCa = new Array<i32>(nL + 8);
      this.bcCe = new Array<i32>(nL + 8);
      this.bcCc = new Array<i32>(nL + 8);
    }
    const la = this.bcLa;
    const le = this.bcLe;
    const ca = this.bcCa;
    const ce = this.bcCe;
    const cc = this.bcCc;
    let k = 0;
    la[0] = s0;
    for (let q = s0; q < s1; q++) {
      if (d.at(q) === 10) {
        le[k] = q;
        k++;
        la[k] = q + 1;
      }
    }
    le[k] = s1;
    // The column the comment was written at, tabs expanded.
    let ls = d.start[t];
    while (ls > 0 && d.at(ls - 1) !== 10) {
      ls--;
    }
    // (A byte order mark before it takes no column.)
    if (ls === 0 && d.n >= 3 && d.at(0) === 0xef && d.at(1) === 0xbb && d.at(2) === 0xbf) {
      ls = 3;
    }
    const origCol = this.colsAt(ls, d.start[t], 0);
    const delta = col - origCol;
    ca[0] = la[0];
    ce[0] = le[0];
    cc[0] = col + 2;
    for (let i = 1; i < nL; i++) {
      // adjustWhitespace: trim the previous line's end, skip this one's indent
      // (and a directive's `\` before it).
      let lnb = le[i - 1] - 1;
      if (this.bcPP && lnb >= la[i - 1] && d.at(lnb) === 92) {
        lnb--;
      }
      while (lnb >= la[i - 1] && isBlankByte(d.at(lnb))) {
        lnb--;
      }
      const endPrev = lnb >= la[i - 1] ? lnb + 1 : la[i - 1];
      ce[i - 1] = endPrev > ca[i - 1] ? endPrev : ca[i - 1];
      let sol = la[i];
      while (sol < le[i] && isBlankByte(d.at(sol))) {
        sol++;
      }
      ca[i] = sol;
      ce[i] = le[i];
      cc[i] = this.colsAt(la[i], sol, 0) + delta;
    }
    let decoCol = col + 1;
    if (nL >= 2 && ce[1] - ca[1] >= 2 && d.at(ca[1]) === 42 && d.at(ca[1] + 1) === 42 && cc[1] === col) {
      decoCol = col;
    }
    // The decoration: a prefix of "* " every middle line starts with.
    let deco = 2;
    const firstInLine = d.prv[t] < 0 || this.lineFirstAt(t);
    if (nL === 1 && !firstInLine) {
      deco = 0;
    }
    for (let i = 1; i < nL && deco > 0; i++) {
      const len = ce[i] - ca[i];
      if (i + 1 === nL) {
        if (len === 0) {
          break;
        }
      } else if (len > 0 && this.decoStartsWith(deco, ca[i], ce[i])) {
        continue;
      }
      while (deco > 0 && !this.textStartsWithDeco(ca[i], ce[i], deco)) {
        deco--;
      }
    }
    let indentAtBreak = cc[0] + 1;
    // An empty last line puts the closing star under the decoration; a last
    // line that held only decoration still writes it.
    let lastNeedsDeco = true;
    for (let i = 1; i < nL; i++) {
      if (ce[i] === ca[i]) {
        if (i + 1 === nL) {
          lastNeedsDeco = false;
          if (nL >= 2 && deco > 0) {
            cc[i] = decoCol;
          }
        } else if (deco === 0) {
          cc[i] = 0;
        }
        continue;
      }
      const decoSize = this.decoStartsWith(deco, ca[i], ce[i]) ? ce[i] - ca[i] : deco;
      if (decoSize > 0) {
        cc[i] = decoCol + decoSize;
      }
      ca[i] = ca[i] + decoSize;
      if (!this.decoStartsWith(deco, ca[i], ce[i])) {
        const c0 = cc[i] < 0 ? 0 : cc[i];
        if (c0 < indentAtBreak) {
          indentAtBreak = c0;
        }
      }
    }
    if (indentAtBreak < deco) {
      indentAtBreak = deco;
    }
    this.bcDeco = deco;
    this.bcLast = nL - 1;
    // The breaking and reflowing loop (clang-format's breakProtrudingToken).
    const outStart = out.n;
    out.byte(47);
    out.byte(42);
    let seg = ca[0];
    let off = 0;
    let csc = cc[0] < 0 ? 0 : cc[0];
    let rem = this.bcRemaining(0, off, csc);
    let reflowing = false;
    for (let i = 0; i < nL; i++) {
      let newBreak = false;
      let tryReflow = reflowing;
      const a = ca[i];
      const e = ce[i];
      while (csc + rem > lim) {
        this.splitDecoStar = deco === 1;
        const ok = this.commentSplit(a + off, e, csc, lim);
        if (!ok) {
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const toSplit = this.colsAt(a + off, a + off + sA, csc);
        let toNext = 0;
        const after = a + off + sA + sN;
        if (!this.commentSplit(after, e, csc + toSplit + 1, lim)) {
          toNext = this.bcRemaining(i, off, csc);
        } else {
          toNext = this.colsAt(a + off, after + this.scSplitA, csc);
        }
        toNext = toNext + 1 - sN;
        if (csc + toNext <= lim) {
          // Compress the blanks to one space and keep going on this line.
          tryReflow = true;
          out.range(d.src, seg, a + off + sA);
          out.byte(32);
          seg = after;
          csc = csc + toSplit + 1;
          off = off + sA + sN;
          rem = this.bcRemaining(i, off, csc);
          continue;
        }
        const ncsc = indentAtBreak;
        const nrem = this.bcRemaining(i, off + sA + sN, ncsc);
        if (nrem >= rem) {
          break;
        }
        // insertBreak
        this.bcBreaks = this.bcBreaks + 1;
        out.range(d.src, seg, a + off + sA);
        this.bcNewline(out);
        let ind = indentAtBreak;
        let prefix = deco;
        if (i + 1 === nL && e - (a + off) === sA + sN) {
          prefix = 0;
          if (ind >= 2) {
            ind = ind - 2;
          }
        }
        out.spaces(ind - prefix);
        this.bcPrefix(out, prefix);
        seg = after;
        off = off + sA + sN;
        csc = ncsc;
        rem = nrem;
        newBreak = true;
      }
      if (i + 1 < nL) {
        if (newBreak) {
          tryReflow = true;
        }
        reflowing = false;
        if (tryReflow) {
          const csc2 = csc + rem + 1;
          const na = ca[i + 1];
          const ne = ce[i + 1];
          if (this.bcMayReflow(i + 1)) {
            let lead = na;
            while (lead < ne && isBlankByte(d.at(lead))) {
              lead++;
            }
            const off2 = lead < ne ? lead - na : 0;
            const rem2 = this.bcRemaining(i + 1, off2, csc2);
            reflowing = true;
            if (csc2 + rem2 > lim) {
              this.splitDecoStar = deco === 1;
              if (!this.commentSplit(na + off2, ne, csc2, lim)) {
                reflowing = false;
              } else if (csc2 + this.colsAt(na + off2, na + off2 + this.scSplitA, csc2) > lim) {
                reflowing = false;
              }
            }
            if (reflowing) {
              // clang-format takes back the new break's penalty: the line
              // break before the next line goes instead.
              if (newBreak) {
                this.bcBreaks = this.bcBreaks - 1;
              }
              out.range(d.src, seg, e);
              out.byte(32);
              seg = na + off2;
              off = off2;
              csc = csc2;
              rem = rem2;
            }
          }
        }
        if (!reflowing) {
          // adaptStartOfLine
          out.range(d.src, seg, e);
          this.bcNewline(out);
          const j = i + 1;
          let prefix = deco;
          if (ce[j] === ca[j]) {
            if (j + 1 === nL) {
              if (!lastNeedsDeco) {
                prefix = 0;
              }
            } else if (deco > 0) {
              prefix = 1;
            }
          } else if (cc[j] === 1) {
            prefix = prefix > 1 ? 1 : prefix;
          }
          const sp = cc[j] - prefix;
          out.spaces(sp < 0 ? 0 : sp);
          this.bcPrefix(out, prefix);
          seg = ca[j];
          off = 0;
          csc = cc[j] < 0 ? 0 : cc[j];
          rem = this.bcRemaining(j, 0, csc);
        }
      } else {
        out.range(d.src, seg, e);
        out.byte(42);
        out.byte(47);
      }
    }
    this.splitDecoStar = false;
    // The column after the comment: its last output line's width.
    let q = out.n;
    while (q > outStart && out.buf[q - 1] !== 10) {
      q--;
    }
    if (q === outStart) {
      return col + widthOf(out.buf, outStart, out.n);
    }
    return widthOf(out.buf, q, out.n);
  }

  /** A line break inside a block comment; inside a directive, escaped at its column. */
  bcNewline(out: Out): void {
    out.trimSpaces();
    if (this.bcEsc >= 0) {
      let q = out.n;
      while (q > 0 && out.buf[q - 1] !== 10) {
        q--;
      }
      const w = widthOf(out.buf, q, out.n);
      const sp = this.bcEsc - 1 - w;
      out.spaces(sp < 1 ? 1 : sp);
      out.byte(92);
    }
    out.byte(10);
  }

  /** Writes the first `n` bytes of the decoration "* ". */
  bcPrefix(out: Out, n: i32): void {
    if (n >= 1) {
      out.byte(42);
    }
    if (n >= 2) {
      out.byte(32);
    }
  }

  /** Whether the first `n` bytes of "* " start with the text [a, e). */
  decoStartsWith(n: i32, a: i32, e: i32): boolean {
    const len = e - a;
    if (len > n) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (this.d.at(a + i) !== (i === 0 ? 42 : 32)) {
        return false;
      }
    }
    return true;
  }

  /** Whether the text [a, e) starts with the first `n` bytes of "* ". */
  textStartsWithDeco(a: i32, e: i32, n: i32): boolean {
    if (e - a < n) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (this.d.at(a + i) !== (i === 0 ? 42 : 32)) {
        return false;
      }
    }
    return true;
  }

  /** getRemainingLength: the columns of content line `i` from `off`, with the closing delimiter on the last. */
  bcRemaining(i: i32, off: i32, startCol: i32): i32 {
    const a = this.bcCa[i] + off;
    const e = this.bcCe[i];
    // (clang-format counts the unbreakable tail on every line.)
    let len = (a < e ? this.colsAt(a, e, startCol) : 0) + this.bcTail;
    if (i === this.bcLast) {
      len = len + 2;
      if (a >= e) {
        // Only `*/` remains: no decoration needed before it.
        let q = this.bcLa[i];
        while (q < this.bcLe[i] && isBlankByte(this.d.at(q))) {
          q++;
        }
        if (this.textStartsWithDeco(q, this.bcLe[i], this.bcDeco)) {
          len = len - this.bcDeco;
        }
      }
    }
    return len;
  }

  /**
   * A line comment split into pieces one of which, not the last, still
   * overflows: on clang-format's next run that piece is a comment line of its
   * own, which the line's layout then pays for, so the file is formatted once
   * more. (`o0`: where the comment's output starts; its first line starts
   * at the column the write left, worked out back from `endCol`.)
   */
  checkPieceRerun(out: Out, o0: i32, endCol: i32): void {
    const lim = this.d.opts.columnLimit;
    let ls = out.n;
    while (ls > 0 && out.buf[ls - 1] !== 10) {
      ls--;
    }
    if (ls <= o0) {
      return;
    }
    // Lines before the last: each from its start to the newline.
    let q = ls - 1;
    while (q > o0) {
      let st = q;
      while (st > 0 && out.buf[st - 1] !== 10) {
        st--;
      }
      if (widthOf(out.buf, st, q) > lim) {
        this.rerun = true;
        return;
      }
      q = st - 1;
    }
  }

  /**
   * A line comment written on its own line under a trailing line comment of
   * the same line, to its right of where that output line starts: on
   * clang-format's next run it continues the trailing comment's section, so
   * the file is formatted once more.
   */
  /**
   * Whether string literal `t`, written at output column `col`, holds a tab
   * that reaches a different stop than where it was written: clang-format
   * measures it from its new column on the next run, so the file is
   * formatted once more.
   */
  checkTabStringRerun(t: i32, col: i32): void {
    const d = this.d;
    let tab = false;
    for (let k = d.start[t]; k < d.end[t]; k++) {
      if (d.at(k) === 9) {
        tab = true;
        break;
      }
    }
    if (!tab) {
      return;
    }
    let ls = d.start[t];
    while (ls > 0 && d.at(ls - 1) !== 10) {
      ls--;
    }
    if (displayColumn(d.src, ls, d.start[t]) % 8 !== col % 8) {
      this.rerun = true;
    }
  }

  /**
   * Whether the break before emitted token `i` leaves an all-caps word alone
   * on the first line of a statement: on clang-format's next run that word
   * is a macro on a line of its own, so the file is formatted once more.
   */
  checkMacroRerun(i: i32): void {
    const d = this.d;
    const t = this.emTok[i];
    let pt = this.emTok[i - 1];
    if (pt < 0 || d.prv[t] !== pt || !tokenCanStartNewLine(d, t)) {
      return;
    }
    // `MACRO(args)` then the break: a function-like macro of any length.
    let functionLike = false;
    if (d.kind[pt] === P_RPAREN && d.match[pt] >= 0 && d.match[pt] < pt) {
      const w = d.prv[d.match[pt]];
      if (w < 0 || d.prv[w] >= 0 || d.kind[w] !== K_IDENT) {
        return;
      }
      pt = w;
      functionLike = true;
    }
    if (d.prv[pt] >= 0 || d.kind[pt] !== K_IDENT || d.inPP[pt] === 1) {
      return;
    }
    if (!functionLike && ((i > 1 && this.emNl[i - 1] === 0) || d.end[pt] - d.start[pt] < 5)) {
      return;
    }
    for (let k = d.start[pt]; k < d.end[pt]; k++) {
      const c = d.at(k);
      if (c >= 97 && c <= 122) {
        return;
      }
    }
    this.rerun = true;
    this.rerunMacro = true;
    if (this.ind.debug) {
      console.error(`macro rerun at ${d.text(pt)} before ${d.text(t)}`);
    }
  }

  checkSectionRerun(i: i32): void {
    const d = this.d;
    const t = this.emTok[i];
    const pt = this.emTok[i - 1];
    if (pt < 0 || this.emNl[i - 1] !== 0 || d.kind[pt] !== K_COMMENT || d.type[pt] !== TT_LINE_COMMENT || d.prv[t] !== pt) {
      return;
    }
    if (this.emCol[i] === this.emCol[i - 1]) {
      return;
    }
    let j = i - 1;
    while (j > 0 && this.emNl[j] === 0) {
      j--;
    }
    const mt = this.emTok[j];
    const minCol = this.emCol[j] + (mt >= 0 && d.kind[mt] === K_COMMENT && d.type[mt] === TT_LINE_COMMENT ? 0 : 1);
    if (this.emCol[i] >= minCol) {
      this.rerun = true;
    }
  }

  /**
   * clang-format's UnbreakableTailLength: the width of the tokens after `t`
   * on its line up to the first one a break may go before.
   */
  unbreakableTail(t: i32): i32 {
    const d = this.d;
    const a = this.ann;
    let s = 0;
    for (let q = d.nxt[t]; q >= 0; q = d.nxt[q]) {
      if (a.canB[q] === 1 || d.kind[q] === K_COMMENT || d.kind[q] === K_STRING) {
        break;
      }
      s = s + d.spaces[q] + d.width[q];
    }
    return s;
  }

  /** mayReflow: whether content line `i` may join the line before it. */
  bcMayReflow(i: i32): boolean {
    const d = this.d;
    if (i === 0) {
      return false;
    }
    // A comment pragma (IWYU) never reflows.
    let q = this.bcLa[i];
    while (q < this.bcLe[i] && isBlankByte(d.at(q))) {
      q++;
    }
    if (q < this.bcLe[i] && d.at(q) === 42) {
      q++;
    }
    if (this.bcLe[i] - q > 13 && this.textAt(q, " IWYU pragma:")) {
      return false;
    }
    return this.mayReflowContent(this.bcCa[i], this.bcCe[i]);
  }

  /** Whether `t` is the first token of an emitted line (no code before it on its line). */
  lineFirstAt(t: i32): boolean {
    const d = this.d;
    for (let l = 0; l < d.nline; l++) {
      if (d.lFirst[l] === t) {
        return true;
      }
    }
    return false;
  }

  // ---- Line comment sections ----------------------------------------------

  /** Whether entry `j` continues the line comment section entry `j - 1` belongs to. */
  continuesSection(j: i32): boolean {
    const d = this.d;
    const t = this.emTok[j];
    const p = this.emTok[j - 1];
    if (t < 0 || p < 0 || d.kind[t] !== K_COMMENT || d.type[t] !== TT_LINE_COMMENT || d.kind[p] !== K_COMMENT || d.type[p] !== TT_LINE_COMMENT) {
      return false;
    }
    if (this.emNl[j] !== 1 || d.nl[t] !== 1 || this.emCol[j] !== this.emCol[j - 1] || this.verbatimAt(j) || d.multi[t] === 1) {
      return false;
    }
    // A comment an earlier #if pass formatted keeps that pass's text: one
    // new to this pass is written on its own.
    if (this.isFin(j - 1) !== this.isFin(j)) {
      return false;
    }
    // Under a comment that starts its own line, clang-format's
    // continuesLineComment wants it written at or right of that one, or
    // right of a `{` the run of comments follows.
    if (this.emNl[j - 1] > 0 && this.origColumn(t) < this.origColumn(p)) {
      return false;
    }
    // (The run within this line, by its token links.)
    let h = p;
    while (d.prv[h] >= 0 && d.kind[d.prv[h]] === K_COMMENT && d.type[d.prv[h]] === TT_LINE_COMMENT) {
      h = d.prv[h];
    }
    const before = d.prv[h];
    if (before >= 0 && d.kind[before] === P_LBRACE && this.origColumn(t) < this.origColumn(before) + 1) {
      return false;
    }
    return !this.isPragma(t) && !this.isPragma(p);
  }

  /** `// clang-format on|off`, `// fastfmt on|off` or an IWYU pragma. */
  isPragma(t: i32): boolean {
    const d = this.d;
    if (this.offMarker(t) !== 0) {
      return true;
    }
    const a = d.start[t] + 2;
    return d.len(t) > 14 && this.textAt(a, " IWYU pragma:");
  }

  textAt(a: i32, s: string): boolean {
    const d = this.d;
    for (let i = 0; i < toI32(s.length); i++) {
      if (d.at(a + i) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** Splits line `t` into its prefix (known prefix plus spaces) and content; fills the sc* fields for slot `k`. */
  scLine(k: i32, t: i32, startCol: i32): void {
    const d = this.d;
    const a = d.start[t];
    const e = d.end[t];
    let kp = 2;
    if (d.at(a + 2) === 47 && d.at(a + 3) === 60) {
      kp = 4; // ///<
    } else if (d.at(a + 2) === 33 && d.at(a + 3) === 60) {
      kp = 4; // //!<
    } else if (d.at(a + 2) === 47 || d.at(a + 2) === 33 || d.at(a + 2) === 58) {
      kp = 3; // ///, //!, //:
    }
    if (kp > e - a) {
      kp = e - a;
    }
    let sp = a + kp;
    while (sp < e && d.at(sp) === 32) {
      sp++;
    }
    // Content: after the prefix, without trailing blanks.
    let ce = e;
    while (ce > sp && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    const spaces = sp - a - kp;
    let extra = 0;
    let keep = sp - a;
    if (sp < e) {
      const c = d.at(sp);
      const noSpace = (c < 128 && (c === 92 || isPunct(c) || c === 32 || c === 9)) && !(c === 35);
      if (spaces < 1 && !noSpace && !this.isPragma(t) && d.opts.reflowComments) {
        extra = 1;
      }
    } else {
      keep = kp;
    }
    this.scKnown[k] = kp;
    this.scStart[k] = a;
    this.scKeep[k] = keep;
    this.scExtra[k] = extra;
    this.scA[k] = sp;
    this.scE[k] = ce;
    this.scCol[k] = startCol + keep + extra;
  }

  /**
   * clang-format's SpacesInLineCommentPrefix (minimum 1): the space change
   * worked out on a section's first line, or where its `//` prefix changes,
   * applies to every following line, which keep at least one space.
   */
  scSpaceChanges(i: i32, n: i32, startCol: i32): void {
    const d = this.d;
    if (!d.opts.reflowComments) {
      return;
    }
    let first = 0;
    for (let k = 0; k < n; k++) {
      const t = this.emTok[i + k];
      const a = this.scStart[k];
      const kp = this.scKnown[k];
      const sp = a + this.scKeep[k];
      const spaces = this.scKeep[k] - kp;
      const has = this.scA[k] < d.end[t];
      let noSpace = false;
      let c = 0;
      if (has) {
        c = d.at(this.scA[k]);
        noSpace = c < 128 && (c === 92 || isPunct(c) || c === 32 || c === 9) && c !== 35;
      }
      let samePrefix = k > 0 && this.scKnown[k - 1] === kp;
      for (let q = 0; samePrefix && q < kp; q++) {
        if (d.at(a + q) !== d.at(this.scStart[k - 1] + q)) {
          samePrefix = false;
        }
      }
      if (!samePrefix) {
        first = spaces < 1 && has && !noSpace ? 1 - spaces : 0;
      }
      let extra = 0;
      if (has) {
        let change = first;
        if (spaces + change < 1) {
          change = change + 1 - (spaces + change);
        }
        const requires = !noSpace || (c === 125 && first !== 0);
        const allows = this.offMarker(t) === 0 && (spaces !== 0 || requires);
        if (change > 0 && allows) {
          extra = change;
        }
      }
      this.scExtra[k] = extra;
      this.scCol[k] = startCol + (sp - a) + extra;
      if (!has) {
        this.scCol[k] = startCol + this.scKeep[k];
      }
    }
  }

  /** Whether a line comment's text starting with byte `c` takes a space after its prefix. */
  wantsPrefixSpace(t: i32, c: i32): boolean {
    if (!this.d.opts.reflowComments || this.offMarker(t) !== 0) {
      return false;
    }
    return !(c < 128 && (c === 92 || isPunct(c) || c === 32 || c === 9) && c !== 35);
  }

  /** Whether lines `k - 1` and `k` have the same original prefix bytes. */
  scSamePrefix(k: i32): boolean {
    const d = this.d;
    const la = this.scA[k - 1] - this.scStart[k - 1];
    const lb = this.scA[k] - this.scStart[k];
    if (la !== lb) {
      return false;
    }
    for (let i = 0; i < la; i++) {
      if (d.at(this.scStart[k - 1] + i) !== d.at(this.scStart[k] + i)) {
        return false;
      }
    }
    return true;
  }

  /** Starts a new source token's output span when entry `i` belongs to another token. */
  recordSpan(out: Out, t: i32, nl: i32, i: i32): void {
    const d = this.d;
    let owner = this.recCur;
    if (t >= 0) {
      if (d.kind[t] !== K_EOF) {
        owner = t;
      }
    } else if (t > RAW && t <= PIECE) {
      owner = this.pcTok[PIECE - t];
    }
    if (owner === this.recCur) {
      return;
    }
    if (nl > 0 && i > 0) {
      out.trimSpaces();
    }
    if (this.recCur >= 0) {
      this.uE[this.map[this.recCur]] = out.n;
    }
    this.uS[this.map[owner]] = out.n;
    if (this.recOrd) {
      this.ord.push(this.map[owner]);
    }
    this.recCur = owner;
  }

  /** Columns of bytes [a, b) placed at column `c`, tabs to stops of 8. */
  colsAt(a: i32, b: i32, c: i32): i32 {
    const d = this.d;
    let w = 0;
    let s = a;
    let ascii = true;
    for (let i = a; i < b; i++) {
      const ch = d.at(i);
      if (ch === 9) {
        w = w + (ascii ? i - s : utf8Width(d.src, s, i));
        w = w + 8 - ((c + w) % 8);
        s = i + 1;
        ascii = true;
      } else if (ch >= 128) {
        ascii = false;
      }
    }
    return w + (ascii ? b - s : utf8Width(d.src, s, b));
  }

  /** colsAt for bytes [a, b) of token `t`: their count when the token is plain. */
  cw(t: i32, a: i32, b: i32, c: i32): i32 {
    return this.d.plain[t] === 1 ? b - a : this.colsAt(a, b, c);
  }

  /** Whether content [a, e) may take the previous line's words (clang-format's rule). */
  mayReflowContent(a0: i32, e0: i32): boolean {
    const d = this.d;
    let a = a0;
    let e = e0;
    while (a < e && isBlankByte(d.at(a))) {
      a++;
    }
    while (e > a && isBlankByte(d.at(e - 1))) {
      e--;
    }
    if (e - a < 2) {
      return false;
    }
    const c0 = d.at(a);
    const c1 = d.at(a + 1);
    if (c0 === 64 || this.textAt(a, "TODO") || this.textAt(a, "FIXME") || this.textAt(a, "XXX") || this.textAt(a, "-# ") || this.textAt(a, "- ") || this.textAt(a, "+ ") || this.textAt(a, "* ")) {
      return false;
    }
    if (this.numberedItem(a, e, true)) {
      return false;
    }
    if (d.at(e - 1) === 92) {
      return false;
    }
    return !(isPunct(c0) && isPunct(c1));
  }

  /** `1.` or `12.` at `a` (followed by a space when `space`). */
  numberedItem(a: i32, e: i32, space: boolean): boolean {
    const d = this.d;
    const c0 = d.at(a);
    if (a >= e || c0 < 49 || c0 > 57) {
      return false;
    }
    let i = a + 1;
    if (i < e && d.at(i) >= 48 && d.at(i) <= 57) {
      i++;
    }
    if (i >= e || d.at(i) !== 46) {
      return false;
    }
    return !space || (i + 1 < e && d.at(i + 1) === 32);
  }

  /**
   * The widest piece, in columns from `col` (prefix included), of line
   * comment `t` once split to fit the limit at column `col`; its width when
   * it fits or cannot be split. clang-format splits before it aligns, so an
   * aligned comment may move only as far as its widest piece allows.
   */
  commentPieceMax(t: i32, col: i32): i32 {
    const d = this.d;
    const lim = d.opts.columnLimit;
    // (clang-format's trailing comment alignment counts a comment's bytes,
    // not its columns: a tab or a multibyte character is one, or several.)
    const bytes = d.end[t] - d.start[t];
    if (!d.opts.reflowComments || this.isPragma(t) || this.offMarker(t) !== 0 || d.multi[t] === 1) {
      return d.multi[t] === 1 ? d.width[t] : bytes;
    }
    // (With the space clang-format puts after a bare `//`.)
    const sp = this.missingCommentSpace(t);
    if (col + d.width[t] + sp <= lim) {
      return bytes + sp;
    }
    this.commentPenalty(t, col);
    return this.cpMax;
  }

  /** 1 when clang-format puts a space after line comment `t`'s `//`, else 0. */
  missingCommentSpace(t: i32): i32 {
    const d = this.d;
    const a0 = d.start[t];
    const e0 = d.end[t];
    let kp = 2;
    if (d.at(a0 + 2) === 47 || d.at(a0 + 2) === 33) {
      kp = d.at(a0 + 3) === 60 ? 4 : 3;
    }
    if (kp >= e0 - a0) {
      return 0;
    }
    const c = d.at(a0 + kp);
    if (c === 32 || isBlankByte(c)) {
      return 0;
    }
    return !(c < 128 && (c === 92 || isPunct(c))) || c === 35 ? 1 : 0;
  }

  /**
   * What line comment `t` placed at column `col` costs at the end of a line,
   * as clang-format's breakProtrudingToken counts it: 300 per break inserted
   * to fit the limit, plus the excess of what still does not fit.
   */
  /**
   * The penalty of a one-line block comment at `col`, reflowed to fit as
   * writeBlockComment does: 300 per break plus what still overflows.
   */
  blockCommentPenalty(t: i32, col: i32): i64 {
    const d = this.d;
    const lim = d.opts.columnLimit - (d.inPP[t] === 1 ? 2 : 0);
    const a = d.start[t] + 2;
    const e = d.end[t] - 2;
    if (!d.opts.reflowComments || e < a || this.offMarker(t) !== 0) {
      return excessPenalty(col + d.width[t] - lim);
    }
    if (d.multi[t] === 1) {
      // Several lines: a dry run of the writer, then its breaks and overflow.
      const o = this.bcScratch;
      o.n = 0;
      this.bcBreaks = 0;
      this.bcPP = d.inPP[t] === 1;
      this.writeBlockComment(o, t, col);
      this.bcPP = false;
      let mp: i64 = toI64(this.bcBreaks) * 300;
      let ls = 0;
      let first = true;
      for (let q = 0; q <= o.n; q++) {
        if (q === o.n || o.buf[q] === 10) {
          const w = widthOf(o.buf, ls, q) + (first ? col : 0);
          if (w > lim) {
            mp = mp + excessPenalty(w - lim);
          }
          first = false;
          ls = q + 1;
        }
      }
      return mp;
    }
    let off = 0;
    let csc = col + 2;
    const tail = this.unbreakableTail(t);
    let rem = this.colsAt(a, e, csc) + 2 + tail;
    const ind = col + 3;
    let pen: i64 = 0;
    this.splitDecoStar = false;
    this.bcFirstW = d.width[t];
    this.bcShrink = 0;
    while (csc + rem > lim) {
      if (!this.commentSplit(a + off, e, csc, lim)) {
        break;
      }
      const sA = this.scSplitA;
      const sN = this.scSplitN;
      const toSplit = this.colsAt(a + off, a + off + sA, csc);
      const after = a + off + sA + sN;
      let toNext = 0;
      if (!this.commentSplit(after, e, csc + toSplit + 1, lim)) {
        toNext = this.colsAt(a + off, e, csc) + 2 + tail;
      } else {
        toNext = this.colsAt(a + off, after + this.scSplitA, csc);
      }
      toNext = toNext + 1 - sN;
      if (csc + toNext <= lim) {
        csc = csc + toSplit + 1;
        off = off + sA + sN;
        rem = this.colsAt(a + off, e, csc) + 2 + tail;
        continue;
      }
      const nrem = this.colsAt(after, e, ind) + 2 + tail;
      if (nrem >= rem) {
        break;
      }
      if (pen === 0) {
        this.bcFirstW = csc + toSplit - col;
      }
      pen = pen + 300;
      off = off + sA + sN;
      csc = ind;
      rem = nrem;
    }
    // Kept on its line with its blanks squeezed: that much narrower.
    if (pen === 0) {
      this.bcShrink = col + d.width[t] - (csc + rem - tail);
    }
    return pen + excessPenalty(csc + rem - lim);
  }

  /**
   * commentPenalty, remembered per comment for the last column and line it
   * was asked for: the line formatter's search asks again and again.
   */
  commentPenalty(t: i32, col: i32): i64 {
    if (toI32(this.cpcVal.length) <= t) {
      const n = (t > this.d.ntok ? t : this.d.ntok) + 64;
      this.cpcGen = new Array<i32>(n);
      this.cpcCol = new Array<i32>(n);
      this.cpcLine = new Array<i32>(n);
      this.cpcMax = new Array<i32>(n);
      this.cpcVal = new Array<i64>(n);
      // (What was remembered went with the old array.)
      this.cpGen = this.cpGen + 1;
    }
    const ln = this.ind.line;
    if (this.cpcGen[t] === this.cpGen && this.cpcCol[t] === col && this.cpcLine[t] === ln) {
      this.cpMax = this.cpcMax[t];
      return this.cpcVal[t];
    }
    const v = this.commentPenaltyAt(t, col);
    this.cpcGen[t] = this.cpGen;
    this.cpcCol[t] = col;
    this.cpcLine[t] = ln;
    this.cpcMax[t] = this.cpMax;
    this.cpcVal[t] = v;
    return v;
  }

  commentPenaltyAt(t: i32, col: i32): i64 {
    const d = this.d;
    const lim = d.opts.columnLimit;
    if (!d.opts.reflowComments || this.isPragma(t) || this.offMarker(t) !== 0 || d.multi[t] === 1) {
      return excessPenalty(col + d.width[t] - lim);
    }
    const a0 = d.start[t];
    const e0 = d.end[t];
    let kp = 2;
    if (d.at(a0 + 2) === 47 || d.at(a0 + 2) === 33) {
      kp = d.at(a0 + 3) === 60 ? 4 : 3;
    }
    if (kp > e0 - a0) {
      kp = e0 - a0;
    }
    let sp = a0 + kp;
    while (sp < e0 && d.at(sp) === 32) {
      sp++;
    }
    let ce = e0;
    while (ce > sp && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    let prefix = sp - a0;
    if (sp < ce && sp === a0 + kp) {
      const c = d.at(sp);
      if (!(c < 128 && (c === 92 || isPunct(c))) || c === 35) {
        prefix = prefix + 1;
      }
    }
    const start = col + prefix;
    let a = sp;
    let csc = start;
    let rem = this.cw(t, a, ce, csc);
    let pen: i64 = 0;
    let widest = 0;
    let breaks = 0;
    while (csc + rem > lim) {
      if (!this.commentSplit(a, ce, csc, lim)) {
        break;
      }
      const sA = this.scSplitA;
      const sN = this.scSplitN;
      const after = a + sA + sN;
      // Blanks squeezed to one space may let the next piece stay on the
      // line: clang-format goes on there, at no cost.
      const toSplit = this.cw(t, a, a + sA, csc);
      let toNext = 0;
      if (!this.commentSplit(after, ce, csc + toSplit + 1, lim)) {
        toNext = this.cw(t, a, ce, csc);
      } else {
        toNext = this.cw(t, a, after + this.scSplitA, csc);
      }
      toNext = toNext + 1 - sN;
      if (csc + toNext <= lim) {
        csc = csc + toSplit + 1;
        a = after;
        rem = this.cw(t, a, ce, csc);
        continue;
      }
      this.scSplitA = sA;
      this.scSplitN = sN;
      const nrem = this.cw(t, after, ce, start);
      if (nrem >= rem) {
        break;
      }
      // (A piece holds what blanks were squeezed for, before it.)
      const piece = prefix + (csc - start) + this.cw(t, a, a + this.scSplitA, csc);
      if (piece > widest) {
        widest = piece;
      }
      pen = pen + 300;
      breaks++;
      a = after;
      csc = start;
      rem = nrem;
    }
    if (prefix + (csc - start) + rem > widest) {
      widest = prefix + (csc - start) + rem;
    }
    this.cpMax = widest;
    // A section's later lines take what is reflowed onto them: priced as
    // one, as clang-format's line comment section.
    if (this.sectionNext(t) >= 0) {
      return this.sectionPenalty(t, col);
    }
    if (breaks > 0 && this.reflowsIntoNext(t, kp, csc + rem + 1)) {
      // The last piece joins the section's next line instead of the break
      // before it: clang-format takes that break's penalty back.
      pen = pen - 300;
    }
    return pen + excessPenalty(csc + rem - lim);
  }

  /** The line comment continuing `t`'s section on the next line, or -1. */
  sectionNext(t: i32): i32 {
    const d = this.d;
    const n = d.nxt[t];
    if (n < 0 || d.kind[n] !== K_COMMENT || d.type[n] !== TT_LINE_COMMENT || d.nl[n] !== 1 || d.multi[n] === 1 || this.offMarker(n) !== 0) {
      return -1;
    }
    // (A comment that does not continue the section ends it.)
    return this.ind.continuesSection(n, t) ? n : -1;
  }

  /**
   * Line comment `t`'s geometry at column `col`: sets gA and gE (its content,
   * blanks trimmed), gStart (the content's column) and gPre (the prefix as
   * written, with the blanks after it).
   */
  lineGeom(t: i32, col: i32): void {
    const d = this.d;
    const a0 = d.start[t];
    const e0 = d.end[t];
    let kp = 2;
    if (d.at(a0 + 2) === 47 || d.at(a0 + 2) === 33) {
      kp = d.at(a0 + 3) === 60 ? 4 : 3;
    }
    if (kp > e0 - a0) {
      kp = e0 - a0;
    }
    let sp = a0 + kp;
    while (sp < e0 && d.at(sp) === 32) {
      sp++;
    }
    let ce = e0;
    while (ce > sp && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    let prefix = sp - a0;
    if (sp < ce && sp === a0 + kp) {
      const c = d.at(sp);
      if (!(c < 128 && (c === 92 || isPunct(c))) || c === 35) {
        prefix = prefix + 1;
      }
    }
    this.gA = sp;
    this.gE = ce;
    this.gStart = col + prefix;
    this.gPre = sp - a0;
  }

  /**
   * The penalty of breaking line comment `t` at column `col` with the lines
   * of its section after it, each at the same column: clang-format's
   * breakProtrudingToken over a line comment section, reflowing a broken
   * line's rest onto the next line and taking back that break's penalty.
   */
  sectionPenalty(t: i32, col: i32): i64 {
    const d = this.d;
    const lim = d.opts.columnLimit;
    this.lineGeom(t, col);
    let e = this.gE;
    let start = this.gStart;
    let a = this.gA;
    let csc = start;
    let rem = this.colsAt(a, e, csc);
    let pen: i64 = 0;
    let reflowing = false;
    let cur = t;
    while (cur >= 0) {
      const pragma = this.isPragma(cur);
      const nx = this.sectionNext(cur);
      let newBreak = false;
      let tryReflow = reflowing;
      let noSplit = pragma && csc + rem > lim;
      while (!pragma && csc + rem > lim) {
        if (!this.commentSplit(a, e, csc, lim)) {
          noSplit = true;
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const after = a + sA + sN;
        const toSplit = this.colsAt(a, a + sA, csc);
        let toNext = 0;
        if (!this.commentSplit(after, e, csc + toSplit + 1, lim)) {
          toNext = this.colsAt(a, e, csc);
        } else {
          toNext = this.colsAt(a, after + this.scSplitA, csc);
        }
        toNext = toNext + 1 - sN;
        if (csc + toNext <= lim) {
          // The blanks squeezed to one space: on along the line.
          tryReflow = true;
          csc = csc + toSplit + 1;
          a = after;
          rem = this.colsAt(a, e, csc);
          continue;
        }
        const nrem = this.colsAt(after, e, start);
        if (nrem >= rem) {
          break;
        }
        pen = pen + 300;
        a = after;
        csc = start;
        rem = nrem;
        newBreak = true;
      }
      if (nx < 0) {
        break;
      }
      if (noSplit) {
        // (Only the last line's excess is left to the caller.)
        pen = pen + excessPenalty(csc + rem - lim);
      }
      const pa0 = d.start[cur];
      const ppre = this.gPre;
      this.lineGeom(nx, col);
      let same = ppre === this.gPre;
      for (let q = 0; same && q < ppre; q++) {
        if (d.at(pa0 + q) !== d.at(d.start[nx] + q)) {
          same = false;
        }
      }
      if (newBreak) {
        tryReflow = true;
      }
      reflowing = false;
      if (tryReflow && same && this.mayReflowContent(d.start[nx] + this.gPre, this.gE) && !this.isPragma(nx)) {
        const ccsc = csc + rem + 1;
        const rrem = this.colsAt(this.gA, this.gE, ccsc);
        reflowing = true;
        if (ccsc + rrem > lim) {
          if (!this.commentSplit(this.gA, this.gE, ccsc, lim) || ccsc + this.colsAt(this.gA, this.gA + this.scSplitA, ccsc) > lim) {
            reflowing = false;
          }
        }
        if (reflowing) {
          if (newBreak) {
            pen = pen - 300;
          }
          csc = ccsc;
          rem = rrem;
        }
      }
      a = this.gA;
      e = this.gE;
      start = this.gStart;
      if (!reflowing) {
        csc = start;
        rem = this.colsAt(a, e, csc);
      }
      cur = nx;
    }
    return pen + excessPenalty(csc + rem - lim);
  }

  /**
   * Whether the line comment after `t` (same `//` prefix of `kp` bytes, on
   * the next line, continuing its section) may take text reflowed onto its
   * start at column `ccsc`, as writeSection decides.
   */
  reflowsIntoNext(t: i32, kp: i32, ccsc: i32): boolean {
    const d = this.d;
    const lim = d.opts.columnLimit;
    const n = d.nxt[t];
    if (n < 0 || d.kind[n] !== K_COMMENT || d.type[n] !== TT_LINE_COMMENT || d.nl[n] !== 1 || this.isPragma(n) || this.offMarker(n) !== 0) {
      return false;
    }
    if (!this.ind.continuesSection(n, t)) {
      return false;
    }
    const a0 = d.start[n];
    const e0 = d.end[n];
    let nkp = 2;
    if (d.at(a0 + 2) === 47 || d.at(a0 + 2) === 33) {
      nkp = d.at(a0 + 3) === 60 ? 4 : 3;
    }
    if (nkp !== kp || e0 - a0 < kp) {
      return false;
    }
    for (let q = 0; q < kp; q++) {
      if (d.at(a0 + q) !== d.at(d.start[t] + q)) {
        return false;
      }
    }
    let sp = a0 + kp;
    while (sp < e0 && isBlankByte(d.at(sp))) {
      sp++;
    }
    let ce = e0;
    while (ce > sp && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    if (!this.mayReflowContent(a0 + kp, ce)) {
      return false;
    }
    const rrem = this.colsAt(sp, ce, ccsc);
    if (ccsc + rrem <= lim) {
      return true;
    }
    if (!this.commentSplit(sp, ce, ccsc, lim)) {
      return false;
    }
    return ccsc + this.colsAt(sp, sp + this.scSplitA, ccsc) <= lim;
  }

  /**
   * Where to break comment text [a, e) placed at column `csc` within `lim`:
   * sets scSplitA (bytes kept) and scSplitN (blanks dropped); false for nowhere.
   */
  commentSplit(a: i32, e: i32, csc: i32, lim: i32): boolean {
    const d = this.d;
    if (lim <= csc + 1) {
      return false;
    }
    const maxSplit = lim - csc + 1;
    let msb = 0;
    let chars = 0;
    while (chars < maxSplit && a + msb < e) {
      const c = d.at(a + msb);
      const nb = utf8LenOf(c);
      if (c === 9) {
        chars = chars + 8 - ((csc + chars) % 8);
      } else {
        chars++;
      }
      msb = msb + nb;
    }
    // The last blank before msb (exclusive).
    let sp = this.lastBlank(a, a + msb);
    while (sp >= 0) {
      const lnb = this.lastNonBlank(a, sp);
      if (lnb >= 0 && d.at(lnb) === 92) {
        sp = this.lastBlank(a, lnb);
        continue;
      }
      let q = sp;
      while (q < e && isBlankByte(d.at(q))) {
        q++;
      }
      if (this.numberedItem(q, e, false)) {
        sp = this.lastBlank(a, sp);
        continue;
      }
      break;
    }
    if (sp < 0 || this.lastNonBlank(a, sp) < 0) {
      let fnw = a;
      while (fnw < e && isBlankByte(d.at(fnw))) {
        fnw++;
      }
      if (fnw >= e) {
        return false;
      }
      let from = a + msb > fnw ? a + msb : fnw;
      sp = -1;
      while (from < e) {
        if (isBlankByte(d.at(from))) {
          sp = from;
          break;
        }
        from++;
      }
    }
    if (sp < 0 || sp === a) {
      return false;
    }
    if (sp === a + 1 && d.at(a) === 42) {
      return false;
    }
    let bc = sp;
    while (bc > a && isBlankByte(d.at(bc - 1))) {
      bc--;
    }
    let ac = sp;
    // Don't trim the blanks if that would put `*/` right after the break.
    if (!(this.splitDecoStar && e - sp > 1 && d.at(sp + 1) === 47)) {
      while (ac < e && isBlankByte(d.at(ac))) {
        ac++;
      }
    }
    this.scSplitA = bc - a;
    this.scSplitN = ac - bc;
    return true;
  }

  /** The last blank in [a, b), or -1. */
  lastBlank(a: i32, b: i32): i32 {
    for (let i = b - 1; i >= a; i--) {
      if (isBlankByte(this.d.at(i))) {
        return i;
      }
    }
    return -1;
  }

  /** The last non-blank in [a, b), or -1. */
  lastNonBlank(a: i32, b: i32): i32 {
    for (let i = b - 1; i >= a; i--) {
      if (!isBlankByte(this.d.at(i))) {
        return i;
      }
    }
    return -1;
  }

  /** Writes line `k`'s prefix (known prefix, its spaces, and any added space). */
  scPrefix(out: Out, k: i32): void {
    const d = this.d;
    out.range(d.src, this.scStart[k], this.scStart[k] + this.scKeep[k]);
    out.spaces(this.scExtra[k]);
  }

  /**
   * Writes the line comment section starting at entry `i` (column `col`),
   * breaking lines past the limit and reflowing the words that move into
   * the following lines as clang-format does; answers the last entry used.
   */
  writeSection(out: Out, i: i32, col: i32): i32 {
    const d = this.d;
    let j = i;
    while (j + 1 < this.nem && this.continuesSection(j + 1)) {
      j++;
    }
    const n = j - i + 1;
    if (toI32(this.scA.length) < n) {
      this.scKnown = new Array<i32>(n);
      this.scStart = new Array<i32>(n);
      this.scKeep = new Array<i32>(n);
      this.scExtra = new Array<i32>(n);
      this.scA = new Array<i32>(n);
      this.scE = new Array<i32>(n);
      this.scCol = new Array<i32>(n);
    }
    for (let k = 0; k < n; k++) {
      this.scLine(k, this.emTok[i + k], col);
    }
    this.scSpaceChanges(i, n, col);
    const lim = d.opts.columnLimit;
    const reflow = d.opts.reflowComments;
    let off = 0; // bytes into the current line's content
    let csc = this.scCol[0];
    let rem = this.cw(this.emTok[i], this.scA[0], this.scE[0], csc);
    let seg = this.scA[0];
    let reflowing = false;
    this.scPrefix(out, 0);
    let lastCol = col;
    for (let k = 0; k < n; k++) {
      const a = this.scA[k];
      const e = this.scE[k];
      const pragma = this.isPragma(this.emTok[i + k]);
      let newBreak = false;
      let tryReflow = reflowing;
      while (reflow && !pragma && csc + rem > lim) {
        if (!this.commentSplit(a + off, e, csc, lim)) {
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const toSplit = this.cw(this.emTok[i + k], a + off, a + off + sA, csc);
        let toNext = 0;
        const after = a + off + sA + sN;
        if (!this.commentSplit(after, e, csc + toSplit + 1, lim)) {
          toNext = this.cw(this.emTok[i + k], a + off, e, csc);
        } else {
          toNext = this.cw(this.emTok[i + k], a + off, after + this.scSplitA, csc);
        }
        toNext = toNext + 1 - sN;
        if (csc + toNext <= lim) {
          // Keep going on this line, the blanks squeezed to one space.
          tryReflow = true;
          out.range(d.src, seg, a + off + sA);
          out.byte(32);
          seg = after;
          csc = csc + toSplit + 1;
          off = off + sA + sN;
          rem = this.cw(this.emTok[i + k], a + off, e, csc);
          continue;
        }
        // A prefix left without its space (`///@name`) gets one on the next
        // run when the split-off text starts with a letter, which can move
        // the breaks after it: run again.
        if (!this.rerun && this.scKeep[k] - this.scKnown[k] + this.scExtra[k] === 0 && after < e && this.wantsPrefixSpace(this.emTok[i + k], d.at(after))) {
          this.rerun = true;
        }
        const pad = 0;
        const ncsc = this.scCol[k] + pad;
        const nrem = this.cw(this.emTok[i + k], after, e, ncsc);
        if (nrem >= rem) {
          break;
        }
        out.range(d.src, seg, a + off + sA);
        out.trimSpaces();
        out.byte(10);
        out.spaces(col);
        this.scPrefix(out, k);
        if (pad > 0) {
          out.byte(32);
        }
        seg = after;
        csc = ncsc;
        off = off + sA + sN;
        rem = nrem;
        newBreak = true;
        // A comment split inside brackets (a braced list's item): on the
        // next run it is a section of lines, which can change the layout.
        if (!this.rerun && k === 0 && d.nest[this.emTok[i]] > 0) {
          this.rerun = true;
        }
      }
      if (k + 1 < n) {
        if (newBreak) {
          tryReflow = true;
        }
        reflowing = false;
        let roff = 0;
        if (tryReflow && reflow) {
          const ccsc = csc + rem + 1;
          const na = this.scA[k + 1];
          const ne = this.scE[k + 1];
          if (this.scSamePrefix(k + 1) && this.mayReflowContent(na, ne) && !this.isPragma(this.emTok[i + k + 1])) {
            // (A tab after the prefix is content: clang-format keeps it, but
            // measures and splits the line without it. The next run measures
            // it where it landed: run again.)
            let lead = na;
            while (lead < ne && d.at(lead) === 32) {
              lead++;
            }
            let mlead = lead;
            while (mlead < ne && (d.at(mlead) === 32 || d.at(mlead) === 9)) {
              mlead++;
            }
            roff = mlead - na;
            const rrem = this.cw(this.emTok[i + k + 1], mlead, ne, ccsc);
            reflowing = true;
            if (ccsc + rrem > lim) {
              if (!this.commentSplit(mlead, ne, ccsc, lim)) {
                reflowing = false;
              } else {
                const ts = this.cw(this.emTok[i + k + 1], mlead, mlead + this.scSplitA, ccsc);
                if (ccsc + ts > lim) {
                  reflowing = false;
                }
              }
            }
            if (reflowing) {
              if (mlead > lead) {
                this.rerun = true;
              }
              out.range(d.src, seg, e);
              out.byte(32);
              seg = lead;
              csc = ccsc;
              off = roff;
              rem = rrem;
            }
          }
        }
        if (!reflowing) {
          out.range(d.src, seg, e);
          out.trimSpaces();
          out.byte(10);
          out.spaces(col);
          this.scPrefix(out, k + 1);
          off = 0;
          csc = this.scCol[k + 1];
          rem = this.cw(this.emTok[i + k + 1], this.scA[k + 1], this.scE[k + 1], csc);
          seg = this.scA[k + 1];
        }
      } else {
        out.range(d.src, seg, e);
        lastCol = csc + rem;
      }
    }
    this.wsCol = lastCol;
    return j;
  }
}

/** Compares two byte strings ignoring ASCII case, as LLVM's compare_insensitive. */
function compareInsensitive(a: u8[], a0: i32, a1: i32, b: u8[], b0: i32, b1: i32): i32 {
  const n = a1 - a0 < b1 - b0 ? a1 - a0 : b1 - b0;
  for (let i = 0; i < n; i++) {
    let x = toI32(a[a0 + i]);
    let y = toI32(b[b0 + i]);
    if (x >= 65 && x <= 90) {
      x = x + 32;
    }
    if (y >= 65 && y <= 90) {
      y = y + 32;
    }
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (a1 - a0 === b1 - b0) {
    return 0;
  }
  return a1 - a0 < b1 - b0 ? -1 : 1;
}

/** The non-empty `::`-separated segments of `s`, as start/end pairs. */
function usingSegments(s: u8[]): i32[] {
  const out: i32[] = [];
  let a = 0;
  let i = 0;
  const n = toI32(s.length);
  while (i <= n) {
    if (i === n || (s[i] === 58 && i + 1 < n && s[i + 1] === 58)) {
      if (i > a) {
        out.push(a);
        out.push(i);
      }
      if (i === n) {
        break;
      }
      i += 2;
      a = i;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * clang-format's using-declaration order (lexicographic, numeric variant):
 * segment by segment, case-insensitively, a final name before a namespace.
 */
function compareUsingLabels(a: u8[], b: u8[]): i32 {
  const na = usingSegments(a);
  const nb = usingSegments(b);
  const sa = toI32(na.length) >> 1;
  const sb = toI32(nb.length) >> 1;
  const e = sa < sb ? sa : sb;
  for (let i = 0; i < e; i++) {
    const c = compareInsensitive(a, na[2 * i], na[2 * i + 1], b, nb[2 * i], nb[2 * i + 1]);
    if (i + 1 === sa) {
      if (sb > sa) {
        return -1;
      }
      return c;
    }
    if (i + 1 === sb) {
      return 1;
    }
    if (c !== 0) {
      return c;
    }
  }
  return 0;
}

/** Whether two byte strings are equal. */
function sameBytes(a: u8[], b: u8[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < toI32(a.length); i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** clang-format's PenaltyExcessCharacter for `n` columns past the limit. */
const excessPenalty = (n: i32): i64 => (n > 0 ? toI64(n) * 1000000 : 0);

/** Whether byte `c` is one StringRef::trim removes. */
const isTrimByte = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;

/** Whether byte `c` may appear in a raw string delimiter (clang-format's RawStringRegex). */
const isRawDelimByte = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 91 || c === 93 || c === 123 || c === 125 || c === 35 || c === 60 || c === 62 || c === 37 || c === 58 || c === 59 || c === 46 || c === 63 || c === 42 || c === 43 || c === 47 || c === 94 || c === 38 || c === 92 || c === 36 || c === 124 || c === 126 || c === 33 || c === 61 || c === 44 || c === 39 || c === 45;

/**
 * The LLVM style's IncludeCategories for header name `name` (with its
 * delimiters): llvm and clang headers 2, angled and gtest/gmock/isl/json
 * headers 3, the rest 1 (regexes matched case-insensitively).
 */
const includeCategoryOf = (name: string): i32 => {
  const s = lower(name);
  if (s.startsWith("\"llvm/") || s.startsWith("\"llvm-c/") || s.startsWith("\"clang/") || s.startsWith("\"clang-c/")) {
    return 2;
  }
  if (s.startsWith("<") || s.startsWith("\"gtest/") || s.startsWith("\"gmock/") || s.startsWith("\"isl/") || s.startsWith("\"json/")) {
    return 3;
  }
  return 1;
};
