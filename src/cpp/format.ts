// The formatter: classified lines to output text.
//
// Decides each line's indent and the blank lines before it, joins short
// function bodies and empty blocks onto one line, lays each line out within
// the column limit (layout.ts), aligns trailing comments, reflows comments
// that overflow, and writes the result.

import { LT_OTHER, P_ARROW, P_ARROWSTAR, P_COLONCOLON, P_LPAREN, P_PERIOD } from "./tok";
import { Classifier, isTrailingComment, spaceBefore } from "./classify";
import { Doc } from "./doc";
import { add32, bytesText, copyU8s, growI32, newI32s, newI64s, sliceU8s, sub32 } from "../core/arr";
import { fault, faulted } from "../core/fault";
import { Annot } from "./annotate";
import { Indenter } from "./indenter";
import { hasBom, lex, widthOf } from "./lexer";
import { Out } from "../core/out";
import { utf8Width } from "../core/uwidth";
import { Parser, isOperatorAfterVar, isQtWord } from "./parser";
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
  TT_INHERITANCE_COLON,
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
  P_AT,
  P_MINUS,
  P_PLUS,
  K_STRING,
  KW_USING,
  KW_TYPENAME,
} from "./tok";

const PIECE: i32 = -1048576;
const RAW: i32 = -2097152; // source bytes written as they are, emitted as RAW - index
const PASS_FAIL: i32 = 0;
const PASS_OK: i32 = 1;
const PASS_RESTART: i32 = 2;

const isNameByte = (c: i32): boolean =>
  (c >= 48 && c <= 58) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

const isBlankByte = (c: i32): boolean => c === 32 || c === 9 || c === 11 || c === 12 || c === 13;

/** ASCII punctuation, as C's ispunct. */
const isPunct = (c: i32): boolean =>
  (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);

/** Bytes in the UTF-8 sequence led by `c`. */
const utf8LenOf = (c: i32): i32 => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/**
 * `xs[i]`; an `i` outside `xs` (where indexing panicked) faults and answers
 * -1, which ends any token or line chain it would have continued.
 */
const fwAt = (xs: i32[], i: i32): i32 => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return -1;
};

/** `xs[i]`; an `i` outside `xs` (where indexing panicked) faults and answers 0. */
const fwAt0 = (xs: i32[], i: i32): i32 => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return 0;
};

/**
 * Writes `src[a, b)` to `out` as `out.range` does, faults included, with one
 * copy in place of a test per byte.
 */
const fwRange = (out: Out, src: u8[], a: i32, b: i32): void => {
  if (b <= a) {
    return;
  }
  if (a < 0 || b > src.length) {
    fault();
    return;
  }
  const n = out.n;
  // `0 <= a < b`, so the u32 difference is the true length.
  const k = toI32(toU32(b) - toU32(a));
  if (!out.room(toI64(n) + toI64(k))) {
    return;
  }
  copyU8s(out.buf, n, src, a, k);
  // `room` held `n + k` below 2^31.
  out.n = toI32(toU32(n) + toU32(k));
};

/** `xs[i] = v`; an `i` outside `xs` faults and writes nothing. */
const fwPut = (xs: i32[], i: i32, v: i32): void => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    xs[u] = v;
    return;
  }
  fault();
};

/** `xs[n - 1]`, the last of `n` entries; an `n` outside `[1, xs.length]` faults and answers -1. */
const fwLast = (xs: i32[], n: i32): i32 => {
  if (n > 0 && n <= xs.length) {
    return xs[n - 1];
  }
  fault();
  return -1;
};

/** `a + b`; a sum outside i32 faults and answers 0. */
const fwAdd = (a: i32, b: i32): i32 => {
  const r = toI64(a) + toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `a * b`; a product outside i32 faults and answers 0. */
const fwMul = (a: i32, b: i32): i32 => {
  const r = toI64(a) * toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `a - b`; a difference outside i32 faults and answers 0. */
const fwSub = (a: i32, b: i32): i32 => {
  const r = toI64(a) - toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/**
 * `total + (t2 - t1)`, a profile total of monotonic nanoseconds. Both times
 * and the total are non-negative and far below 2^63 (centuries), so the
 * wrapping u64 sum is the exact one.
 */
const fwSpan = (total: i64, t1: i64, t2: i64): i64 => toI64(toU64(total) + (toU64(t2) - toU64(t1)));

/**
 * Sets `unt[t] = v` and `stamp[t] = g` for each token `t` of the chain from
 * `t0` on; a token outside the arrays (where indexing panicked) faults.
 */
const fwMarkChain = (nxt: i32[], unt: i32[], stamp: i32[], t0: i32, v: i32, g: i32): void => {
  let t = t0;
  while (t >= 0) {
    if (t >= nxt.length || t >= unt.length || t >= stamp.length) {
      fault();
      return;
    }
    unt[t] = v;
    stamp[t] = g;
    t = nxt[t];
  }
};

/** Appends `src[a, e)` to `out`; a non-empty range outside `src` (where indexing panicked) faults. */
const fwPushBytes = (out: u8[], src: u8[], a: i32, e: i32): void => {
  if (a < e && (a < 0 || e > src.length)) {
    fault();
    return;
  }
  for (let c = a; c >= 0 && c < e && c < src.length; c++) {
    out.push(src[c]);
  }
};

/** `src[i]`, as an i32; an `i` outside `src` (where indexing panicked) faults and answers -1. */
const fwByte = (src: u8[], i: i32): i32 => {
  if (i >= 0 && i < src.length) {
    return toI32(src[i]);
  }
  fault();
  return -1;
};

/**
 * The first index at or after `from` where `pat` (not empty) starts in
 * `src[0, n)`, or -1: `String.indexOf` on those bytes taken as a string.
 * `n` past `src` (where reading the text panicked) faults.
 */
const fwFind = (src: u8[], n: i32, pat: string, from: i32): i32 => {
  if (pat.length < 1) {
    return -1;
  }
  if (n > src.length) {
    fault();
    return -1;
  }
  const c0 = pat.charCodeAt(0);
  let i = from;
  if (i < 0) {
    i = 0;
  }
  for (; i < n; i++) {
    if (toI32(src[i]) !== c0) {
      continue;
    }
    let k = 1;
    let j = i + 1;
    while (k < pat.length && j < n && toI32(src[j]) === pat.charCodeAt(k)) {
      k++;
      j++;
    }
    if (k === toI32(pat.length)) {
      return i;
    }
  }
  return -1;
};

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
      // (`from <= i < s.length`: substring cuts what slice cut.)
      out = out + s.substring(from, i) + String.fromCharCode(c + 32);
      from = i + 1;
    }
  }
  return from === 0 ? s : out + s.substring(from);
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
  compoundReqs: i32[]; // the parser's compound requirement `{`s, this pass
  useful: i32[]; // per pass: 1 when it sees a token no earlier pass saw
  seenBy: i32[];
  map: i32[]; // pass token -> source token
  o2p: i32[]; // source token -> pass token, -1 if skipped
  fapFull: i32[]; // source token -> clang's FirstAfterPPLine, from any pass
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
  endCommentsInserted: boolean = false; // insertContinuedEndComments ran on this file
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
  // lineOfTok: the line each line-head token starts, for annotation stamp tlStamp.
  tlHead: i32[];
  // lineOfTok: the line of each token, for the same stamp.
  tlLine: i32[];
  tlStamp: i32 = 0;
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
    this.fapFull = new Array<i32>(0);
    this.sPPKind = new Array<i32>(0);
    this.sPPId = new Array<i32>(0);
    this.sUnesc = new Array<i32>(0);
    this.sType = new Array<i32>(0);
    this.sFinal = new Array<i32>(0);
    this.ppIdx = new Array<i32>(0);
    this.ppCnt = new Array<i32>(0);
    this.useful = new Array<i32>(0);
    this.seenBefore = new Array<i32>(0);
    this.compoundReqs = new Array<i32>(0);
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
    this.tlHead = new Array<i32>(0);
    this.tlLine = new Array<i32>(0);
    this.ind = new Indenter(d, this.ann);
    this.ind.debug = getenv("FFDEBUG") !== null;
    const cap = fwAdd(d.ntok, 16);
    this.emTok = newI32s(cap);
    this.emNl = newI32s(cap);
    this.emCol = newI32s(cap);
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
    let base = path;
    // (`slash` and `dot` lie in their strings: substring cuts what slice cut.)
    const slash = lastIndexOfChar(path, 47);
    if (slash >= 0 && slash < toI32(path.length)) {
      base = path.substring(slash + 1);
    }
    const dot = lastIndexOfChar(base, 46);
    const ext = dot >= 0 ? base.substring(dot) : "";
    this.fileStem = lower(dot > 0 ? base.substring(0, dot) : base);
    this.fileName = lower(base);
    this.isMainFile =
      ext === ".c" ||
      ext === ".cc" ||
      ext === ".cpp" ||
      ext === ".c++" ||
      ext === ".cxx" ||
      ext === ".m" ||
      ext === ".mm";
    // clang-format formats these as Objective-C when they hold any (its
    // guessLanguage); only Objective-C constructs tell the two apart.
    this.d.objcLang = ext === ".h" || ext === "" || ext === ".m" || ext === ".mm";
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
    // (Each cut lies in its string: substring cuts what slice cut.)
    let name = quoted.substring(1, quoted.length - 1);
    const slash = lastIndexOfChar(name, 47);
    if (slash >= 0 && slash < toI32(name.length)) {
      name = name.substring(slash + 1);
    }
    const dot = lastIndexOfChar(name, 46);
    const stem = lower(dot > 0 ? name.substring(0, dot) : name);
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
    const matchingStem = firstDot > 0 ? fn.substring(0, firstDot) : fn;
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
    // `p` against the last `n` characters of `s`, side by side.
    let i = 0;
    for (let j = s.length - n; j >= 0 && j < s.length && i < p.length; j++) {
      const c = p.charCodeAt(i);
      if (c !== 46 && c !== s.charCodeAt(j)) {
        return false;
      }
      i++;
    }
    return true;
  }

  /** Readies the formatter for the next file of its Doc. */
  reset(): void {
    this.ann.clear();
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
    // (Past 2^30 entries the arrays cannot grow: where `emTok[i]` panicked.)
    if (i < 0 || i > 1073741823) {
      fault();
      return;
    }
    if (i >= toI32(this.emTok.length)) {
      this.emTok = growI32(this.emTok, i + 1);
      this.emNl = growI32(this.emNl, i + 1);
      this.emCol = growI32(this.emCol, i + 1);
    }
    const tok = this.emTok;
    const nls = this.emNl;
    const cols = this.emCol;
    if (i < tok.length && i < nls.length && i < cols.length) {
      tok[i] = t;
      nls[i] = nl;
      cols[i] = col;
      this.nem = i + 1;
    } else {
      fault();
    }
  }

  /**
   * Replaces the last emitted token, string literal `t`, with its pieces cut
   * at content offsets `cuts[0 .. n)`; every piece after the first starts a
   * line at `col`.
   */
  splitString(t: i32, prefixLen: i32, cuts: i32[], n: i32, col: i32): void {
    const d = this.d;
    if (this.hasOff && fwAt(this.offTok, t) === 1) {
      // clang-format's replaceWhitespaceInToken: a Finalized token (in an
      // off region) is written as it is, whatever the breaker decided.
      return;
    }
    let a = fwAdd(fwAt(d.start, t), prefixLen);
    const e = fwSub(fwAt(d.end, t), 1);
    if (n > cuts.length || n > 2147483646) {
      // (Where `cuts[i]` panicked.)
      fault();
      return;
    }
    for (let i = 0; i <= n; i++) {
      const b = i < n && i < cuts.length ? cuts[i] : e;
      const k = this.npc;
      // (Where `PIECE - k` or `pcTok[k]` panicked.)
      if (k < 0 || k > 2146435072) {
        fault();
        return;
      }
      if (k >= toI32(this.pcTok.length)) {
        this.pcTok = growI32(this.pcTok, k + 1);
        this.pcA = growI32(this.pcA, k + 1);
        this.pcB = growI32(this.pcB, k + 1);
      }
      fwPut(this.pcTok, k, t);
      fwPut(this.pcA, k, a);
      fwPut(this.pcB, k, b);
      this.npc = k + 1;
      if (i === 0) {
        const em = this.emTok;
        const m = this.nem;
        if (m > 0 && m <= em.length) {
          em[m - 1] = PIECE - k;
        } else {
          fault();
          return;
        }
      } else {
        this.emit(PIECE - k, 1, col);
      }
      a = b;
    }
  }

  /** Emits source bytes [a, b) as they are, right after the last entry. */
  emitRaw(a: i32, b: i32): void {
    const k = this.nraw;
    // (Where `rawA[k]` or `RAW - k` panicked.)
    if (k < 0 || k > 2145386496) {
      fault();
      return;
    }
    if (k >= toI32(this.rawA.length)) {
      this.rawA = growI32(this.rawA, k + 1);
      this.rawB = growI32(this.rawB, k + 1);
    }
    fwPut(this.rawA, k, a);
    fwPut(this.rawB, k, b);
    this.nraw = k + 1;
    const m = this.nem;
    const last = m > 0 ? fwLast(this.emTok, m) : -1;
    // The directive the raw bytes belong to: the entry before's.
    if (k >= toI32(this.rawPP.length)) {
      this.rawPP = growI32(this.rawPP, k + 1);
    }
    fwPut(this.rawPP, k, last >= 0 ? fwAt(this.d.ppId, last) : -1);
    const col = m > 0 ? fwAdd(fwLast(this.emCol, m), last >= 0 ? fwAt(this.d.width, last) : 0) : 0;
    this.emit(RAW - k, 0, col);
  }

  /** The directive (its `#` token) emitted entry `t` belongs to, or -1. */
  entryPP(t: i32): i32 {
    if (t >= 0) {
      return fwAt(this.d.ppId, t);
    }
    if (t <= RAW) {
      return fwAt(this.rawPP, RAW - t);
    }
    if (t <= PIECE) {
      return fwAt(this.d.ppId, fwAt(this.pcTok, PIECE - t));
    }
    return -1;
  }

  /** The output width of piece `k`. */
  pieceWidth(k: i32): i32 {
    const d = this.d;
    const t = fwAt(this.pcTok, k);
    const pl = this.pieceLen(t);
    return fwAdd(fwAdd(pl, widthOf(d.src, fwAt(this.pcA, k), fwAt(this.pcB, k))), 1);
  }

  /** The prefix length (through the opening quote) of string literal `t`. */
  pieceLen(t: i32): i32 {
    const d = this.d;
    const s = fwAt(d.start, t);
    const e = fwAt(d.end, t);
    let i = s;
    while (i < e && d.at(i) !== 34) {
      i++;
    }
    return fwAdd(fwSub(i, s), 1);
  }

  /** The width of emitted entry `t` (token, synthetic text or piece). */
  emWidth(t: i32): i32 {
    if (t >= 0) {
      return this.lastLineWidth(t);
    }
    if (t <= RAW) {
      const k = RAW - t;
      const ra = fwAt(this.rawA, k);
      const rb = fwAt(this.rawB, k);
      let a = rb;
      while (a > ra && this.d.at(fwSub(a, 1)) !== 10) {
        // (`a > ra`: the step fits.)
        a = fwSub(a, 1);
      }
      return widthOf(this.d.src, a, rb);
    }
    if (t <= PIECE) {
      return this.pieceWidth(PIECE - t);
    }
    // (PIECE < t < 0: a synthetic entry.)
    const si = -1 - t;
    const synth = this.synth;
    if (si >= 0 && si < synth.length) {
      return toI32(synth[si].length);
    }
    fault();
    return 0;
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
    const nem = this.nem;
    let j = i;
    let over = fwAdd(col, fwAt(d.width, fwAt(this.emTok, i))) > d.opts.columnLimit;
    while (j < nem && j + 1 < nem && this.continuesSection(j + 1)) {
      j++;
      if (fwAdd(col, fwAt(d.width, fwAt(this.emTok, j))) > d.opts.columnLimit) {
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
    const nem = this.nem;
    let j = i;
    while (j < nem && j + 1 < nem && this.continuesSection(j + 1)) {
      j++;
    }
    this.secEnd = j;
    const o = this.secScratch;
    o.n = 0;
    const saveWs = this.wsCol;
    this.writeSection(o, i, col);
    this.wsCol = saveWs;
    let w = 0;
    let ls = 0;
    let first = true;
    const buf = o.buf;
    const on = o.n;
    if (on > buf.length || on > 2147483646) {
      // (Where `o.buf[q]` panicked.)
      fault();
      return 0;
    }
    for (let q = 0; q <= on; q++) {
      if (q === on || (q < buf.length && buf[q] === 10)) {
        const lw = fwSub(widthOf(buf, ls, q), first ? 0 : col);
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
    const f = fwAt(d.lFirst, l);
    const k = fwAt(d.kind, f);
    const n = fwAt(d.nxt, f);
    return (k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED) && n >= 0 && fwAt(d.kind, n) === P_COLON;
  }

  /** Whether line `l` is an access specifier, Qt's included (the indent rule). */
  isAccessSpecifier(l: i32): boolean {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    const k = fwAt(d.kind, f);
    const n = fwAt(d.nxt, f);
    // Objective-C's `@public`, `@protected`, `@package`, `@private`.
    if (k === P_AT && n >= 0) {
      const nk = fwAt(d.kind, n);
      return nk === KW_PUBLIC || nk === KW_PRIVATE || nk === KW_PROTECTED || (nk === K_IDENT && d.is(n, "package"));
    }
    if (n < 0) {
      return k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED;
    }
    if (!(k === KW_PUBLIC || k === KW_PRIVATE || k === KW_PROTECTED)) {
      // Qt: `signals:`, `Q_SIGNALS:`, `<anything> slots:`.
      if (isQtWord(d, f, true) && !isQtWord(d, f, false) && fwAt(d.kind, n) === P_COLON) {
        return true;
      }
      return isQtWord(d, n, false) && fwAt(d.nxt, n) >= 0 && fwAt(d.kind, fwAt(d.nxt, n)) === P_COLON;
    }
    // Without a colon too (`public ref class`), unless the word was a variable.
    return fwAt(d.kind, n) !== P_COLONCOLON && !isOperatorAfterVar(fwAt(d.kind, n));
  }

  /**
   * clang-format 23's LT_AccessModifier: a line where an access keyword is
   * followed by a colon annotated as an inheritance colon (`... public : int
   * x;` after a macro without `;`) takes the access specifier's offset too.
   */
  hasAccessModifierColon(l: i32): boolean {
    const d = this.d;
    for (let t = fwAt(d.nxt, fwAt(d.lFirst, l)); t >= 0; t = fwAt(d.nxt, t)) {
      if (fwAt(d.type, t) === TT_INHERITANCE_COLON) {
        const p = this.ann.prevNonComment(t);
        const pk = p >= 0 ? fwAt(d.kind, p) : -1;
        if (pk === KW_PUBLIC || pk === KW_PRIVATE || pk === KW_PROTECTED) {
          return true;
        }
      }
    }
    return false;
  }

  /** The indent of line `l` in its list, with `base` added. */
  indentOf(l: i32, base: i32): i32 {
    const d = this.d;
    const lt = fwAt(d.lType, l);
    if (lt === LT_PREPROCESSOR || lt === LT_IMPORT) {
      return 0;
    }
    let ind = fwAdd(fwAt(d.lAbs, l) === 1 ? 0 : base, fwMul(fwAt(d.lLevel, l), d.opts.indentWidth));
    if (this.isAccessSpecifier(l) || this.hasAccessModifierColon(l)) {
      ind = fwAdd(ind, d.opts.accessModifierOffset);
      if (ind < 0) {
        ind = 0;
      }
    }
    return ind;
  }

  /**
   * clang-format's NamespaceEndCommentsFixer runs before its formatter, on the
   * text, so a line comment under a namespace `}` that gets an end comment
   * can continue that comment (continuesLineCommentSection: written right of
   * the `}`). Where that may happen, inserts the end comments namespaceComment
   * would add into the text, once per file, and answers true to start over.
   */
  insertContinuedEndComments(): boolean {
    const d = this.d;
    if (this.endCommentsInserted) {
      return false;
    }
    const at: i32[] = []; // source offset, line of the namespace
    let trigger = false;
    let off = false; // inside a `// clang-format off` region
    let ct = 0;
    for (let l = d.topHead; l >= 0; l = fwAt(d.lSibling, l)) {
      const rb = fwAt(d.lFirst, l);
      for (; ct < rb; ct++) {
        if (fwAt(d.kind, ct) === K_COMMENT) {
          const m = this.offMarker(ct);
          if (m === 1) {
            off = true;
          } else if (m === 2) {
            off = false;
          }
        }
      }
      if (off || fwAt(d.kind, rb) !== P_RBRACE || !this.closesNamespace(l) || fwAt(d.inPP, rb) === 1) {
        continue;
      }
      const o = fwAt(d.lOpen, l);
      if (
        !this.samePPContext(fwAt(d.lLast, o), rb) ||
        fwAt(d.kind, fwAt(d.lLast, l)) === K_COMMENT ||
        fwSub(fwSub(l, o), 1) <= 1
      ) {
        continue;
      }
      let after = fwAt(d.nxt, rb);
      if (after >= 0 && fwAt(d.kind, after) === P_SEMI) {
        after = fwAt(d.nxt, after);
      }
      if (after >= 0) {
        continue;
      }
      // The end comment goes after the `}` (past a `;`).
      const nrb = fwAt(d.nxt, rb);
      const end = nrb >= 0 ? nrb : rb;
      at.push(fwAt(d.end, end));
      at.push(o);
      // The comments up to the next code token, directive lines between
      // them included, are read while the `}` line is pending.
      for (let c = fwAdd(end, 1); c < d.ntok && (fwAt(d.kind, c) === K_COMMENT || fwAt(d.inPP, c) === 1); c++) {
        if (
          fwAt(d.kind, c) === K_COMMENT &&
          fwAt(d.inPP, c) === 0 &&
          fwAt(d.nl, c) === 1 &&
          d.at(fwAdd(fwAt(d.start, c), 1)) === 47 &&
          d.origCol(c) > d.origCol(rb)
        ) {
          trigger = true;
        }
      }
    }
    if (!trigger || !this.bracesBalance()) {
      return false;
    }
    this.endCommentsInserted = true;
    const out: u8[] = [];
    let from = 0;
    for (let i = 0; i < at.length; i += 2) {
      const e = at[i];
      if (i + 1 >= at.length || i >= 2147483646) {
        // (Where `at[i + 1]` or `i += 2` panicked.)
        fault();
        return false;
      }
      const o = at[i + 1];
      fwPushBytes(out, d.src, from, e);
      const text = ` ${this.endCommentText(o)}`;
      for (let k = 0; k < toI32(text.length); k++) {
        out.push(toU8(text.charCodeAt(k)));
      }
      from = e;
    }
    fwPushBytes(out, d.src, from, d.n);
    d.reset(out, toI32(out.length));
    return true;
  }

  /** Whether the document's `{` and `}` balance. */
  bracesBalance(): boolean {
    const d = this.d;
    const kind = d.kind;
    const n = d.ntok;
    if (n > kind.length) {
      // (Where `kind[t]` panicked.)
      fault();
      return false;
    }
    // Opening and closing braces counted apart: each count stays below `n`.
    let opens = 0;
    let closes = 0;
    for (let t = 0; t < n; t++) {
      const k = kind[t];
      if (k === P_LBRACE) {
        if (opens < n) {
          opens++;
        }
      } else if (k === P_RBRACE) {
        if (closes < n) {
          closes++;
        }
      }
    }
    return opens === closes;
  }

  /** Appends `// namespace name` to a namespace's `}` line that lacks a comment. */
  namespaceComment(l: i32): void {
    const d = this.d;
    const rb = fwAt(d.lFirst, l);
    if (fwAt(d.inPP, rb) === 1) {
      // Not inside a macro body.
      return;
    }
    let after = fwAt(d.nxt, rb);
    if (after >= 0 && fwAt(d.kind, after) === P_SEMI) {
      after = fwAt(d.nxt, after);
    }
    if (after >= 0 && fwAt(d.kind, after) === K_COMMENT) {
      this.fixEndComment(rb, fwAt(d.lOpen, l));
      return;
    }
    if (fwAt(d.kind, fwAt(d.lLast, l)) === K_COMMENT) {
      return;
    }
    const o = fwAt(d.lOpen, l);
    // Short namespaces (one line of body or less) go without. Lines count as
    // parsed, before short blocks join (`class X {};` is two), child lines
    // included: every parsed line between the braces.
    const body = fwSub(fwSub(l, o), 1);
    if (body <= 1) {
      return;
    }
    const text = this.endCommentText(o);
    const last = fwLast(this.emTok, this.nem);
    const col = fwAdd(fwAdd(fwLast(this.emCol, this.nem), last >= 0 ? this.lastLineWidth(last) : 0), 1);
    this.synth.push(text);
    this.emit(-toI32(this.synth.length), 0, col);
  }

  /**
   * The end comment after namespace `}` `rb` (past a `;`), replaced when it
   * does not name the namespace opened on line `o`.
   */
  fixEndComment(rb: i32, o: i32): void {
    const d = this.d;
    let after = fwAt(d.nxt, rb);
    if (after >= 0 && fwAt(d.kind, after) === P_SEMI) {
      after = fwAt(d.nxt, after);
    }
    if (after < 0 || fwAt(d.kind, after) !== K_COMMENT) {
      return;
    }
    const name = this.namespaceName(o);
    if (!this.validEndComment(after, name)) {
      for (let i = fwSub(this.nem, 1); i >= 0; i--) {
        if (fwAt(this.emTok, i) === after) {
          this.synth.push(this.endCommentText(o));
          fwPut(this.emTok, i, -toI32(this.synth.length));
          break;
        }
      }
    }
  }

  /** The end comment of the namespace opened on line `o`. */
  endCommentText(o: i32): string {
    const name = this.namespaceName(o);
    return name.length === 0 ? "// namespace" : `// namespace ${name}`;
  }

  /** The name a namespace opened on line `o` goes by (empty for an anonymous one). */
  namespaceName(o: i32): string {
    const d = this.d;
    const parts: string[] = [];
    let seen = false;
    for (let t = fwAt(d.lFirst, o); t >= 0; t = fwAt(d.nxt, t)) {
      const k = fwAt(d.kind, t);
      if (k === KW_NAMESPACE) {
        seen = true;
        continue;
      }
      if (!seen) {
        continue;
      }
      if (k === P_LBRACE) {
        break;
      }
      if (k !== K_COMMENT) {
        parts.push(d.text(t));
      }
    }
    return parts.join("");
  }

  /** Whether comment `c` after a namespace's `}` names namespace `name` (clang-format's pattern). */
  validEndComment(c: i32, name: string): boolean {
    const d = this.d;
    const e = fwAt(d.end, c);
    let i = fwAdd(fwAt(d.start, c), 2);
    while (i < e && d.at(i) === 32) {
      i++;
    }
    if (this.wordAt(i, e, "end ")) {
      i = fwAdd(i, 4);
      if (this.wordAt(i, e, "of ")) {
        i = fwAdd(i, 3);
      }
    }
    while (i < e && d.at(i) === 32) {
      i++;
    }
    let anon = false;
    if (this.wordAt(i, e, "anonymous")) {
      i = fwAdd(i, 9);
      anon = true;
    } else if (this.wordAt(i, e, "unnamed")) {
      i = fwAdd(i, 7);
      anon = true;
    }
    while (i < e && d.at(i) === 32) {
      i++;
    }
    if (!this.wordAt(i, e, "namespace")) {
      return false;
    }
    i = fwAdd(i, 9);
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
    if (i < e && i + 1 < e && d.at(i) === 42 && d.at(i + 1) === 47) {
      i = fwAdd(i, 2);
    }
    if (i !== e) {
      return false;
    }
    while (nameB > nameA && d.at(fwSub(nameB, 1)) === 32) {
      nameB = fwSub(nameB, 1);
    }
    const inComment = bytesText(d.src, nameA, nameB);
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
    const n = fwAt(d.nxt, c);
    if (n < 0 || fwAt(d.kind, n) !== K_COMMENT || d.at(fwAdd(fwAt(d.start, n), 1)) !== 47) {
      return false;
    }
    const ne = fwAt(d.end, n);
    let q = fwAdd(fwAt(d.start, n), 2);
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
    return bytesText(d.src, qa, qb) === name;
  }

  /** Whether the bytes at `i` spell `w` (ASCII letters in any case). */
  wordAt(i: i32, e: i32, w: string): boolean {
    const d = this.d;
    const n = toI32(w.length);
    if (fwAdd(i, n) > e) {
      return false;
    }
    for (let k = 0; k < n; k++) {
      let c = d.at(fwAdd(i, k));
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
    if (a >= b) {
      return true;
    }
    const kind = d.kind;
    const ppKind = d.ppKind;
    // (depth never goes below 0: `<= 0` is `=== 0`.)
    let depth = 0;
    for (let t = a + 1; t < b; t++) {
      if (t < 0 || t >= kind.length) {
        // (Where `kind[t]` panicked.)
        fault();
        return false;
      }
      if (kind[t] !== P_HASH) {
        continue;
      }
      if (t >= ppKind.length) {
        fault();
        return false;
      }
      const k = ppKind[t];
      if (k === PP_IF) {
        if (depth >= 2147483647) {
          fault();
          return false;
        }
        depth++;
      } else if (k === PP_ELIF || k === PP_ELSE) {
        if (depth <= 0) {
          return false;
        }
      } else if (k === PP_ENDIF) {
        if (depth <= 0) {
          return false;
        }
        depth--;
      }
    }
    return depth === 0;
  }

  closesNamespace(l: i32): boolean {
    const d = this.d;
    const o = fwAt(d.lOpen, l);
    return o >= 0 && fwAt(d.lNamespace, o) === 1;
  }

  /** Newlines before line `l`, given the previous line in its list. */
  newlinesBefore(l: i32, prev: i32, firstInList: boolean, nested: boolean): i32 {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    let nl = fwAt(d.nl, f);
    if (nl > 2) {
      nl = 2;
    }
    if (fwAt(d.kind, f) === P_RBRACE) {
      const n = fwAt(d.nxt, f);
      const onlyBrace = n < 0 || (fwAt(d.kind, n) === P_SEMI && fwAt(d.nxt, n) < 0);
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
      const src0 = this.rec ? fwAt(this.map, f) : f;
      nl = 0;
      if (src0 === 0 && fwAt(d.unesc, f) === 1) {
        const nf = fwAt(d.nl, f);
        nl = nf > 2 ? 2 : nf;
      }
    }
    if (prev >= 0 && this.isAccessKeyword(l)) {
      const pl = fwAt(d.kind, fwAt(d.lLast, prev));
      if ((pl === P_SEMI || pl === P_RBRACE) && nl <= 1) {
        nl = 2;
      }
      if (this.isAccessKeyword(prev)) {
        nl = 1;
      }
    }
    // (Not after a macro body's last line, from outside it.)
    if (
      prev >= 0 &&
      this.isAccessKeyword(prev) &&
      !this.isAccessKeyword(l) &&
      !(fwAt(d.inPP, fwAt(d.lFirst, prev)) === 1 && fwAt(d.unesc, f) === 1)
    ) {
      nl = 1;
    }
    return nl;
  }

  /** Classifies every line, tracking whether each sits in a class body. */
  classifyAll(): void {
    const d = this.d;
    const scopes = new Array<i32>(0);
    // clang-format's MacroBodyScopes: the braces a #define body's lines leave
    // open, cleared by every line outside a macro body (its head included).
    let macroDepth = 0;
    let l = d.topHead;
    while (l >= 0) {
      const f = fwAt(d.lFirst, l);
      if (fwAt(d.kind, f) === P_RBRACE && fwAt(d.bk, f) === BK_BLOCK && scopes.length > 0) {
        scopes.pop();
      }
      const ns = scopes.length;
      fwPut(d.lInClass, l, ns > 0 && scopes[ns - 1] === 1 ? 1 : 0);
      const body = fwAt(d.inPP, f) === 1 && fwAt(d.lType, l) !== LT_PREPROCESSOR;
      if (!body) {
        macroDepth = 0;
      }
      this.cls.macroScope = body && macroDepth > 0;
      this.cls.classifyLine(l);
      this.cls.macroScope = false;
      if (body) {
        // (Each `{` pushes a scope and each `}` pops one, if any is left.)
        for (let t = f; t >= 0; t = fwAt(d.nxt, t)) {
          const k = fwAt(d.kind, t);
          if (k === P_LBRACE) {
            macroDepth = fwAdd(macroDepth, 1);
          } else if (k === P_RBRACE && macroDepth > 0) {
            macroDepth--;
          }
        }
      }
      // (A trailing comment may follow the `{`.)
      let last = fwAt(d.lLast, l);
      while (last !== f && fwAt(d.kind, last) === K_COMMENT) {
        last = fwAt(d.prv, last);
      }
      if (fwAt(d.kind, last) === P_LBRACE && fwAt(d.bk, last) === BK_BLOCK) {
        const tt = fwAt(d.type, last);
        scopes.push(tt === TT_CLASS_LBRACE || tt === TT_STRUCT_LBRACE || tt === TT_UNION_LBRACE ? 1 : 0);
      }
      l = fwAt(d.lSibling, l);
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
      for (let t = fwAt(d.lFirst, l); t >= 0; t = fwAt(d.nxt, t)) {
        if (fwAt(d.childHead, t) >= 0) {
          this.mergeDefinesIn(fwAt(d.childHead, t));
        }
      }
      const f = fwAt(d.lFirst, l);
      const b = fwAt(d.lSibling, l);
      if (
        fwAt(d.kind, f) === P_HASH &&
        fwAt(d.ppKind, f) === PP_DEFINE &&
        b >= 0 &&
        fwAt(d.ppId, fwAt(d.lFirst, b)) === f
      ) {
        const nb = fwAt(d.lSibling, b);
        const single = !(nb >= 0 && fwAt(d.ppId, fwAt(d.lFirst, nb)) === f);
        const last = fwAt(d.lLast, l);
        if (
          single &&
          !(fwAt(d.kind, last) === K_COMMENT && fwAt(d.type, last) === TT_LINE_COMMENT) &&
          fwAt(d.mustBreak, fwAt(d.lFirst, b)) === 0 &&
          !this.lineOff(l) &&
          !this.lineOff(b)
        ) {
          an.annotate(l);
          an.annotate(b);
          let limit = d.opts.columnLimit;
          const tl = fwAt(an.tot, last);
          limit = tl > limit ? 0 : fwSub(limit, tl);
          // A comment starting a line of the body is a forced break:
          // clang-format counts the whole limit for it.
          let forced = false;
          for (let t = fwAt(d.nxt, fwAt(d.lFirst, b)); t >= 0; t = fwAt(d.nxt, t)) {
            if (fwAt(d.kind, t) === K_COMMENT && fwAt(d.unesc, t) === 1) {
              forced = true;
              break;
            }
          }
          // So is a line comment under the body's trailing comment, which
          // clang-format reads as the rest of the directive.
          // (A body of comments alone is the define line's trailing comment.)
          const bl = fwAt(d.lLast, b);
          if (
            nb >= 0 &&
            fwAt(d.kind, bl) === K_COMMENT &&
            fwAt(d.type, bl) === TT_LINE_COMMENT &&
            fwAt(d.kind, fwAt(d.lFirst, b)) !== K_COMMENT
          ) {
            const c = fwAt(d.lFirst, nb);
            if (
              c === fwAdd(bl, 1) &&
              fwAt(d.kind, c) === K_COMMENT &&
              fwAt(d.type, c) === TT_LINE_COMMENT &&
              fwAt(d.nl, c) === 1 &&
              this.origColumn(c) >= this.origColumn(bl)
            ) {
              forced = true;
            }
          }
          if (limit !== 0 && !forced && fwAdd(1, fwAt(an.tot, fwAt(d.lLast, b))) <= limit) {
            this.joinInto(l, b);
          }
        }
      }
      l = fwAt(d.lSibling, l);
    }
  }

  /**
   * `MACRO (*name)` laid out with a break after its `)`: on its next run
   * clang-format takes `MACRO(...)` for a free-standing macro line, which
   * drops the space before its `(`. Entries from `start` hold line `l`.
   */
  macroLineAfterBreak(l: i32, start: i32): void {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    const lp = fwAt(d.nxt, f);
    if (
      fwAt(d.kind, f) !== K_IDENT ||
      lp < 0 ||
      fwAt(d.kind, lp) !== P_LPAREN ||
      fwAt(d.lType, l) !== LT_OTHER ||
      fwAt(d.inPP, f) === 1 ||
      !this.words.allCaps(f)
    ) {
      return;
    }
    const rp = fwAt(d.match, lp);
    const nem = this.nem;
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    if (rp < 0 || start >= nem || start + 1 >= nem) {
      return;
    }
    if (
      fwAt(emTok, start) !== f ||
      fwAt(emTok, start + 1) !== lp ||
      fwAt(emCol, start + 1) <= fwAdd(fwAt(emCol, start), fwAt(d.width, f))
    ) {
      return;
    }
    let i = start + 1;
    while (i < nem && fwAt(emTok, i) !== rp) {
      if (fwAt(emNl, i) > 0) {
        return;
      }
      i++;
    }
    const n = fwAt(d.nxt, rp);
    if (
      i >= nem ||
      i + 1 >= nem ||
      n < 0 ||
      fwAt(emTok, i + 1) !== n ||
      fwAt(emNl, i + 1) === 0 ||
      !this.words.canStartNewLine(n)
    ) {
      return;
    }
    for (let k = start + 1; k <= i; k++) {
      if (k < 0 || k >= emCol.length) {
        // (Where `emCol[k]` panicked.)
        fault();
        return;
      }
      emCol[k] = fwSub(emCol[k], 1);
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
    const pf = fwAt(d.kind, fwAt(d.lFirst, prevL));
    // (A directive read inside the label's line comes after it for
    // clang-format, so the label is not the line before then.)
    if ((pf === KW_CASE || pf === KW_DEFAULT) && !this.hasInnerDirective(prevL)) {
      return true;
    }
    if (fwAt(d.lFirst, l) === fwAt(d.lLast, l)) {
      return (
        fwAt(d.kind, fwAt(d.lLast, prevL)) === KW_ELSE ||
        pf === KW_IF ||
        pf === KW_ELSE ||
        pf === KW_WHILE ||
        pf === KW_DO ||
        pf === KW_FOR
      );
    }
    return false;
  }

  /**
   * Whether `#error`/`#warning` line `l` is left as written after its `#`: its words after
   * the first are implicit string literals clang-format cannot break before,
   * yet a `.` or `->` among them past the column limit must break (the member
   * access rule), so clang-format finds no layout and leaves the line alone.
   */
  longMessage(l: i32): boolean {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    if (fwAt(d.kind, f) !== P_HASH || fwAt(d.ppKind, f) !== PP_ERROR || fwAt(d.lType, l) !== LT_PREPROCESSOR) {
      return false;
    }
    const w = fwAt(d.nxt, f);
    const first = w >= 0 ? fwAt(d.nxt, w) : -1;
    if (first < 0) {
      return false;
    }
    // Output columns: `#word first` normalized, the rest as written.
    const shift = fwSub(fwAdd(fwAdd(1, fwAt(d.width, w)), 1), fwAt(d.col, first));
    const lim = d.opts.columnLimit;
    for (let t = fwAt(d.nxt, first); t >= 0; t = fwAt(d.nxt, t)) {
      const k = fwAt(d.kind, t);
      if (k !== P_PERIOD && k !== P_ARROW && k !== P_ARROWSTAR) {
        continue;
      }
      const p = fwAt(d.prv, t);
      const endPrev = fwAdd(fwAdd(fwAt(d.col, p), fwAt(d.width, p)), shift);
      let toNext = 0;
      for (let q = fwAt(d.nxt, t); q >= 0; q = fwAt(d.nxt, q)) {
        const qk = fwAt(d.kind, q);
        if (qk === P_PERIOD || qk === P_ARROW || qk === P_ARROWSTAR) {
          toNext = fwSub(fwAdd(fwAt(d.col, q), fwAt(d.width, q)), fwAdd(fwAt(d.col, t), fwAt(d.width, t)));
          break;
        }
      }
      if (fwAdd(endPrev, toNext) > lim) {
        return true;
      }
    }
    return false;
  }

  /** Whether line `l` is a `#error` or `#warning` with a message. */
  isMessage(l: i32): boolean {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    if (fwAt(d.kind, f) !== P_HASH || fwAt(d.ppKind, f) !== PP_ERROR || fwAt(d.lType, l) !== LT_PREPROCESSOR) {
      return false;
    }
    const w = fwAt(d.nxt, f);
    return w >= 0 && fwAt(d.nxt, w) >= 0 && fwAt(d.multi, f) === 0;
  }

  /**
   * Emits `#error`/`#warning` line `l`: `#word`, then the message. Its words
   * after the first are implicit string literals: never broken before, kept
   * as written, and not counted against the limit, so the only break is
   * before the first word, taken when that word overflows.
   */
  emitMessage(l: i32, nl: i32): void {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    const w = fwAt(d.nxt, f);
    const first = fwAt(d.nxt, w);
    this.emit(f, nl, 0);
    this.emit(w, 0, 1);
    // (The first word is TT_AfterPPDirective: a space before it, `(` too.)
    let col = fwAdd(2, fwAt(d.width, w));
    let fnl = 0;
    if (fwAdd(col, fwAt(d.width, first)) > d.opts.columnLimit && fwAt(d.multi, first) === 0) {
      fnl = 1;
      col = d.opts.continuationIndent;
    }
    this.emit(first, fnl, col);
    col = fwAdd(col, fwAt(d.width, first));
    for (let t = fwAt(d.nxt, first); t >= 0; t = fwAt(d.nxt, t)) {
      const p = fwAt(d.prv, t);
      if (fwAt(d.nl, t) > 0) {
        // Continued with `\`: the rest stays as written.
        this.emitRaw(fwAt(d.end, p), fwAt(d.end, fwAt(d.lLast, l)));
        return;
      }
      col = fwAdd(col, fwSub(fwSub(fwAt(d.col, t), fwAt(d.col, p)), fwAt(d.width, p)));
      this.emit(t, fwAt(d.nl, t), col);
      col = fwAdd(col, fwAt(d.width, t));
    }
  }

  /** Whether a directive line sits between two tokens of line `l`. */
  hasInnerDirective(l: i32): boolean {
    const d = this.d;
    const nxt = d.nxt;
    const prv = d.prv;
    const inPP = d.inPP;
    let t = fwAt(nxt, fwAt(d.lFirst, l));
    while (t >= 0) {
      if (t >= nxt.length || t >= prv.length || t >= inPP.length) {
        // (Where `prv[t]` panicked.)
        fault();
        return false;
      }
      // (`p < t - 1` is `t > p + 1`; a token's `prv` is -1 or more, so then t > 0.)
      const p = prv[t];
      if (t > 0 && p < t - 1 && inPP[t - 1] === 1 && inPP[t] === 0) {
        return true;
      }
      t = nxt[t];
    }
    return false;
  }

  /** Joins `{` lines with their body and `}` where the result fits. */
  joinShortBlocks(head: i32, base: i32): void {
    const d = this.d;
    let l = head;
    let prevL = -1;
    while (l >= 0) {
      const a = fwAt(d.lSibling, l);
      const last = fwAt(d.lLast, l);
      // A directive inside the line follows it for clang-format: no merge.
      // (A line with off tokens still merges an empty `{}` after them.)
      const offL = a >= 0 && this.lineOff(l);
      if (
        a >= 0 &&
        fwAt(d.kind, last) === P_LBRACE &&
        fwAt(d.bk, last) === BK_BLOCK &&
        fwAt(d.type, last) !== TT_LINE_COMMENT &&
        (!offL ||
          (this.hasOff &&
            fwAt(this.offTok, last) !== 1 &&
            fwAt(d.lInvalid, l) === 0 &&
            fwAt(d.kind, fwAt(d.lFirst, a)) === P_RBRACE)) &&
        !this.lineOff(a) &&
        !this.hasInnerDirective(l)
      ) {
        const tt = fwAt(d.type, last);
        const lineStart = fwAt(d.lFirst, l);
        const isFunction = tt === TT_FUNCTION_LBRACE;
        const isRecord = tt === TT_CLASS_LBRACE || tt === TT_STRUCT_LBRACE || tt === TT_UNION_LBRACE;
        // (clang-format's startsWithNamespace: any line starting with it.)
        const isNamespace =
          tt === TT_NAMESPACE_LBRACE ||
          fwAt(d.kind, lineStart) === KW_NAMESPACE ||
          (fwAt(d.kind, lineStart) === KW_INLINE &&
            fwAt(d.nxt, lineStart) >= 0 &&
            fwAt(d.kind, fwAt(d.nxt, lineStart)) === KW_NAMESPACE);
        const isControl = tt === TT_CONTROL_STATEMENT_LBRACE || tt === TT_ELSE_LBRACE;
        const af = fwAt(d.lFirst, a);
        const emptyBody = fwAt(d.kind, af) === P_RBRACE && fwAt(d.lOpen, a) === l;
        const lineIsBlockOnly = lineStart === last;
        // clang-format 23's tryMergeSimpleBlock: a `{` that starts a statement
        // (TT_BlockLBrace) is never merged under AllowShortBlocksOnASingleLine
        // Never, neither with its body nor with an empty `}`.
        const blockLBrace = lineIsBlockOnly && tt === TT_UNKNOWN && this.compoundReqs.indexOf(last) < 0;
        // A block opened on a `case`/`default:` line is never merged.
        const caseLine =
          fwAt(d.kind, lineStart) === KW_CASE ||
          (fwAt(d.kind, lineStart) === KW_DEFAULT &&
            fwAt(d.nxt, lineStart) >= 0 &&
            fwAt(d.kind, fwAt(d.nxt, lineStart)) === P_COLON);
        if (
          !isControl &&
          !blockLBrace &&
          (!lineIsBlockOnly || !this.braceAfterLabelOrControl(l, prevL)) &&
          !caseLine &&
          emptyBody &&
          !this.hasTrailingLineComment(l)
        ) {
          // `{}` (and `{};`): always one line.
          let after = fwAt(d.nxt, af);
          while (after >= 0 && fwAt(d.kind, after) === K_COMMENT) {
            after = fwAt(d.nxt, after);
          }
          // `};` may carry a trailing comment.
          let afterSemi = after >= 0 ? fwAt(d.nxt, after) : -1;
          while (afterSemi >= 0 && fwAt(d.kind, afterSemi) === K_COMMENT && fwAt(d.nl, afterSemi) === 0) {
            afterSemi = fwAt(d.nxt, afterSemi);
          }
          if (after < 0 || (fwAt(d.kind, after) === P_SEMI && afterSemi < 0)) {
            this.joinInto(l, a);
            continue;
          }
        }
        // clang-format's tryMergeSimpleBlock splits any block on a line that
        // starts with a control keyword, `try`, `catch` or `}`.
        // (The first token past leading comments: clang-format's FirstNonComment.)
        let fnc = lineStart;
        while (fnc !== last && fwAt(d.kind, fnc) === K_COMMENT) {
          fnc = fwAt(d.nxt, fnc);
        }
        const fk0 = fwAt(d.kind, fnc);
        const ctrlFirst =
          fk0 === KW_IF ||
          fk0 === KW_ELSE ||
          fk0 === KW_WHILE ||
          fk0 === KW_DO ||
          fk0 === KW_FOR ||
          fk0 === KW_TRY ||
          fk0 === KW_CATCH ||
          fk0 === P_RBRACE;
        if (isFunction && !ctrlFirst && !lineIsBlockOnly && !emptyBody && !isRecord && !isNamespace && !offL) {
          const b = fwAt(d.lSibling, a);
          if (b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            this.joinInto(l, a);
            this.joinInto(l, b);
            continue;
          }
        }
        // Any other block (`{` alone, `SCOPE_EXIT {`): clang-format's
        // tryMergeSimpleBlock merges a one-line body when it fits, except a
        // `{` alone after a control statement or `else`.
        const fk = fwAt(d.kind, fnc);
        const ctrl =
          fk === KW_IF ||
          fk === KW_ELSE ||
          fk === KW_WHILE ||
          fk === KW_DO ||
          fk === KW_FOR ||
          fk === KW_TRY ||
          fk === KW_CATCH ||
          fk === P_RBRACE ||
          fk === KW_CASE ||
          fk === KW_DEFAULT ||
          fk === KW_EXTERN;
        const blockLike = tt === TT_UNKNOWN || (tt === TT_CONTROL_STATEMENT_LBRACE && fk === KW_SWITCH);
        // (Never a line starting with an Objective-C `@`, `-` or `+`.)
        const objcFirst =
          fwAt(d.kind, lineStart) === P_AT || fwAt(d.kind, lineStart) === P_MINUS || fwAt(d.kind, lineStart) === P_PLUS;
        if (
          blockLike &&
          !objcFirst &&
          !blockLBrace &&
          !ctrl &&
          !emptyBody &&
          !isFunction &&
          !isRecord &&
          !isNamespace &&
          fwAt(d.lType, l) !== LT_PREPROCESSOR &&
          !offL
        ) {
          const afterCtrl = fk === P_LBRACE && this.braceAfterLabelOrControl(l, prevL);
          const b = fwAt(d.lSibling, a);
          if (!afterCtrl && b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            const bn = fwAt(d.nxt, fwAt(d.lFirst, b));
            if (!(bn >= 0 && fwAt(d.kind, bn) === KW_ELSE)) {
              this.joinInto(l, a);
              this.joinInto(l, b);
              continue;
            }
          }
        }
      }
      if (
        a >= 0 &&
        fwAt(d.kind, last) === K_COMMENT &&
        fwAt(d.type, last) !== TT_LINE_COMMENT &&
        !this.lineOff(l) &&
        !this.lineOff(a) &&
        this.emptyFunctionAfterComment(l, a)
      ) {
        // `void f() { /* nothing */ }`: clang-format looks past trailing
        // block comments for a function's `{` and merges its empty body.
        this.joinInto(l, a);
        continue;
      }
      if (
        a >= 0 &&
        fwAt(d.kind, last) === K_COMMENT &&
        fwAt(d.type, last) !== TT_LINE_COMMENT &&
        !this.lineOff(l) &&
        !this.lineOff(a) &&
        !this.hasInnerDirective(l)
      ) {
        // `int f() { /* c */ return 1; }`: so does it for a one-line body.
        let lnc = last;
        while (lnc >= 0 && fwAt(d.kind, lnc) === K_COMMENT) {
          lnc = fwAt(d.prv, lnc);
        }
        const fk1 = fwAt(d.kind, fwAt(d.lFirst, l));
        const ctrl1 =
          fk1 === KW_IF ||
          fk1 === KW_ELSE ||
          fk1 === KW_WHILE ||
          fk1 === KW_DO ||
          fk1 === KW_FOR ||
          fk1 === KW_TRY ||
          fk1 === KW_CATCH ||
          fk1 === P_RBRACE;
        if (
          lnc >= 0 &&
          lnc !== fwAt(d.lFirst, l) &&
          fwAt(d.kind, lnc) === P_LBRACE &&
          fwAt(d.type, lnc) === TT_FUNCTION_LBRACE &&
          !ctrl1 &&
          !this.hasTrailingLineComment(l) &&
          fwAt(d.kind, fwAt(d.lFirst, a)) !== P_RBRACE
        ) {
          const b = fwAt(d.lSibling, a);
          if (b >= 0 && !this.lineOff(b) && this.canMergeBody(l, a, b, base)) {
            this.joinInto(l, a);
            this.joinInto(l, b);
            continue;
          }
        }
      }
      // Child blocks (lambda bodies) go through the same joiner.
      for (let t = fwAt(d.lFirst, l); t >= 0; t = fwAt(d.nxt, t)) {
        const c = fwAt(d.childHead, t);
        if (c >= 0) {
          this.joinShortBlocks(c, base);
        }
      }
      prevL = l;
      l = fwAt(d.lSibling, l);
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
    for (let l = head; l >= 0; l = fwAt(d.lSibling, l)) {
      lines.push(l);
    }
    let next = -1;
    let nextInl = -1; // the parked directive line after a parked comment line
    let afterNonPP = -1; // the first token of the nearest later line that is not a directive or parked
    for (let i = toI32(lines.length) - 1; i >= 0; i--) {
      if (i >= lines.length) {
        fault();
        return;
      }
      const l = lines[i];
      const f = fwAt(d.lFirst, l);
      // isInlineDirective, from the line after it that is no directive.
      const ppLike =
        fwAt(d.lType, l) === LT_PREPROCESSOR ||
        fwAt(d.lType, l) === LT_IMPORT ||
        fwAt(d.lPP, l) === 1 ||
        fwAt(d.lInlineCmt, l) === 1;
      const inlineHere = ppLike && afterNonPP >= 0 && afterNonPP < f;
      if (!ppLike) {
        afterNonPP = f;
      }
      if (fwAt(d.lInlineCmt, l) === 1) {
        // Parked with the directive after it: aligned with it, as clang-format
        // adds both after the statement they were read inside.
        const nf = nextInl >= 0 ? fwAt(d.lFirst, nextInl) : -1;
        if (nf >= 0 && fwAt(d.nl, nf) < 2 && this.offMarker(f) !== 1 && fwAt(d.col, nf) === fwAt(d.col, f)) {
          fwPut(d.lLevel, l, 0);
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
      for (let t = f; t >= 0; t = fwAt(d.nxt, t)) {
        if (fwAt(d.kind, t) !== K_COMMENT) {
          onlyComments = false;
        }
        if (fwAt(d.childHead, t) >= 0) {
          this.setCommentLineLevels(fwAt(d.childHead, t));
        }
      }
      const nf = next >= 0 ? fwAt(d.lFirst, next) : -1;
      if (
        next >= 0 &&
        fwAt(d.nl, nf) < 2 &&
        onlyComments &&
        this.offMarker(f) !== 1 &&
        fwAt(d.col, nf) === fwAt(d.col, f)
      ) {
        const pp = fwAt(d.lType, next) === LT_PREPROCESSOR || fwAt(d.lType, next) === LT_IMPORT;
        const iw = d.opts.indentWidth;
        if (!this.seenTok(f) && this.finalizedTok(nf) && iw > 0 && fwAt(d.col, f) % iw === 0) {
          // clang-format 23: aligned with a line an earlier pass formatted
          // (its first token finalized), the comment keeps its column. (A
          // comment an earlier pass formatted keeps that pass's output.)
          if (head !== d.topHead) {
            // (A child line's level is relative to its block: not ported.)
            d.failed = true;
          }
          fwPut(d.lLevel, l, fwAt(d.col, f) / iw);
        } else {
          fwPut(d.lLevel, l, pp ? 0 : fwAt(d.lLevel, next));
        }
      } else {
        next = fwAt(d.kind, f) !== P_RBRACE ? l : -1;
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
    this.untGen = fwAdd(this.untGen, 1);
    if (toI32(this.untouched.length) < d.ntok) {
      this.untouched = newI32s(fwAdd(d.ntok, 64));
      this.untStamp = newI32s(fwAdd(d.ntok, 64));
    }
    const g = this.untGen;
    const unt = this.untouched;
    const stamp = this.untStamp;
    const nxt = d.nxt;
    const nline = d.nline;
    for (let l = 0; l < nline; l++) {
      const f = fwAt(d.lFirst, l);
      if (fwAt(d.lInvalid, l) === 1) {
        fwMarkChain(nxt, unt, stamp, fwAt(d.nl, f) === 0 && fwAt(d.prv, f) < 0 && f > 0 ? f : fwAt(nxt, f), 1, g);
      }
      // Implicit string literals (`\`): their whitespace is as written;
      // so is all of an inline assembly block's body, newlines included.
      if (d.anyAsm || d.anyImplicit) {
        const asmFin = d.asmFin;
        const type = d.type;
        let t = f;
        while (t >= 0) {
          if (t >= asmFin.length || t >= type.length || t >= nxt.length || t >= unt.length || t >= stamp.length) {
            // (Where `asmFin[t]` panicked.)
            fault();
            return;
          }
          if (asmFin[t] === 1) {
            unt[t] = 3;
            stamp[t] = g;
          } else if (type[t] === TT_IMPLICIT_STRING_LITERAL && t !== f) {
            unt[t] = 2;
            stamp[t] = g;
          }
          t = nxt[t];
        }
      }
      // A line that starts with `<` and ends with `>` is taken for the
      // header name of `#define X <a/b.h>`.
      const ll = fwAt(d.lLast, l);
      if (fwAt(d.kind, f) === P_LESS && fwAt(d.kind, ll) === P_GREATER && ll !== f) {
        fwMarkChain(nxt, unt, stamp, fwAt(nxt, f), 2, g);
      }
      const pk = fwAt(d.ppKind, f);
      if (fwAt(d.kind, f) === P_HASH && (pk === PP_ERROR || pk === PP_PRAGMA)) {
        const w = fwAt(nxt, f);
        let first = w >= 0 ? fwAt(nxt, w) : -1;
        if (pk === PP_PRAGMA) {
          if (first < 0 || !(d.is(first, "mark") || d.is(first, "region"))) {
            continue;
          }
          first = fwAt(nxt, first);
        }
        if (first < 0) {
          continue;
        }
        fwMarkChain(nxt, unt, stamp, fwAt(nxt, first), 2, g);
      }
    }
    if (this.hasOff) {
      const offTok = this.offTok;
      const nt = d.ntok;
      if (nt > offTok.length || nt > unt.length || nt > stamp.length) {
        // (Where `offTok[t]` panicked.)
        fault();
        return;
      }
      for (let t = 0; t < nt; t++) {
        if (offTok[t] === 1) {
          unt[t] = 1;
          stamp[t] = g;
        }
      }
    }
  }

  /** 1 or 2 when token `t` keeps its whitespace as written (see markUntouched), else 0. */
  untouchedKind(t: i32): i32 {
    return t >= 0 && t < toI32(this.untStamp.length) && this.untStamp[t] === this.untGen ? fwAt(this.untouched, t) : 0;
  }

  /** The source offset where token `t`'s whitespace starts, or -1 when its predecessor was skipped. */
  wsStart(t: i32): i32 {
    const d = this.d;
    if (t === 0) {
      return 0;
    }
    if (this.rec && fwAt(this.map, fwSub(t, 1)) !== fwSub(fwAt(this.map, t), 1)) {
      // The pass skipped what came before: the blanks right before it,
      // within an off region (whose layout is kept), else nothing.
      if (!(this.hasOff && fwAt(this.offTok, t) === 1)) {
        return -1;
      }
      let w = fwAt(d.start, t);
      while (w > 0 && (isBlankByte(d.at(w - 1)) || d.at(w - 1) === 10 || d.at(w - 1) === 13)) {
        w--;
      }
      return w;
    }
    return fwAt(d.end, fwSub(t, 1));
  }

  /** Marks the tokens after a `clang-format off` comment, up to and with its `on`. */
  markOffRegions(): void {
    const d = this.d;
    if (this.rec) {
      // A pass: clang-format marks off regions while lexing, over every token.
      this.hasOff = this.hasOffFull;
      if (this.hasOff) {
        const nt = d.ntok;
        if (toI32(this.offTok.length) < nt) {
          this.offTok = newI32s(fwAdd(nt, 64));
        }
        const offTok = this.offTok;
        const offFull = this.offFull;
        const map = this.map;
        if (nt > offTok.length || nt > map.length) {
          // (Where `offTok[j]` panicked.)
          fault();
          return;
        }
        for (let j = 0; j < nt; j++) {
          const m = map[j];
          if (m < 0 || m >= offFull.length) {
            fault();
            return;
          }
          offTok[j] = offFull[m];
        }
      }
      return;
    }
    this.hasOff = false;
    let off = false;
    const kind = d.kind;
    const nt = d.ntok;
    for (let t = 0; t < nt; t++) {
      if (t >= kind.length) {
        // (Where `kind[t]` panicked.)
        fault();
        return;
      }
      if (kind[t] !== K_COMMENT) {
        if (off) {
          fwPut(this.offTok, t, 1);
        }
        continue;
      }
      const m = this.offMarker(t);
      if (m === 1 && !off) {
        if (!this.hasOff) {
          this.hasOff = true;
          if (toI32(this.offTok.length) < nt) {
            this.offTok = newI32s(fwAdd(nt, 64));
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
          fwPut(this.offTok, t, 1);
        }
      }
    }
  }

  /** Whether any token of line `l` lies in a `clang-format off` region. */
  lineOff(l: i32): boolean {
    const d = this.d;
    if (fwAt(d.lInvalid, l) === 1) {
      return true;
    }
    if (!this.hasOff) {
      return false;
    }
    const nxt = d.nxt;
    const offTok = this.offTok;
    let t = fwAt(d.lFirst, l);
    while (t >= 0) {
      if (t >= offTok.length || t >= nxt.length) {
        // (Where `offTok[t]` or `nxt[t]` panicked.)
        fault();
        return false;
      }
      if (offTok[t] === 1) {
        return true;
      }
      t = nxt[t];
    }
    return false;
  }

  hasTrailingLineComment(l: i32): boolean {
    const d = this.d;
    const last = fwAt(d.lLast, l);
    return fwAt(d.kind, last) === K_COMMENT && fwAt(d.type, last) === TT_LINE_COMMENT;
  }

  /** The width of line `l` laid flat, or a large number when it cannot be. */
  flatWidth(l: i32): i32 {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    let w = fwAt(d.width, f);
    if (fwAt(d.multi, f) === 1) {
      return 100000;
    }
    const nxt = d.nxt;
    const prv = d.prv;
    const kind = d.kind;
    const type = d.type;
    const width = d.width;
    const childHead = d.childHead;
    const mustBreak = d.mustBreak;
    const multi = d.multi;
    const nl = d.nl;
    let t = fwAt(nxt, f);
    while (t >= 0) {
      if (
        t >= mustBreak.length ||
        t >= multi.length ||
        t >= kind.length ||
        t >= nl.length ||
        t >= prv.length ||
        t >= width.length ||
        t >= nxt.length
      ) {
        // (Where indexing token `t` panicked.)
        fault();
        return 0;
      }
      if (mustBreak[t] === 1 || multi[t] === 1 || (kind[t] === K_COMMENT && nl[t] > 0)) {
        return 100000;
      }
      const p = prv[t];
      const wt = width[t];
      const next = nxt[t];
      if (p < 0 || p >= kind.length || p >= type.length || p >= childHead.length) {
        fault();
        return 0;
      }
      if (kind[p] === K_COMMENT && type[p] === TT_LINE_COMMENT) {
        return 100000;
      }
      const lb = childHead[p];
      w = fwAdd(fwAdd(w, spaceBefore(d, l, t) ? 1 : 0), wt);
      if (lb >= 0) {
        w = fwAdd(w, this.childFlatWidth(p));
      }
      t = next;
    }
    const last = fwAt(d.lLast, l);
    if (fwAt(childHead, last) >= 0) {
      w = fwAdd(w, this.childFlatWidth(last));
    }
    return w;
  }

  /** The width a single-line child block adds inside `{ ... }`, or large. */
  childFlatWidth(lb: i32): i32 {
    const d = this.d;
    if (fwAt(d.childCount, lb) !== 1) {
      return 100000;
    }
    const stamp = this.cfwStamp;
    if (lb >= 0 && lb < stamp.length && stamp[lb] === this.fileStamp) {
      return fwAt(this.cfwVal, lb);
    }
    const v = this.childFlatWidthUncached(lb);
    if (lb >= toI32(this.cfwStamp.length)) {
      this.cfwStamp = growI32(this.cfwStamp, fwAdd(d.ntok, 1));
      this.cfwVal = growI32(this.cfwVal, fwAdd(d.ntok, 1));
    }
    fwPut(this.cfwStamp, lb, this.fileStamp);
    fwPut(this.cfwVal, lb, v);
    return v;
  }

  childFlatWidthUncached(lb: i32): i32 {
    const d = this.d;
    const c = fwAt(d.childHead, lb);
    if (fwAt(d.mustBreak, fwAt(d.lFirst, c)) === 1 || fwAt(d.nl, fwAt(d.lFirst, c)) > 1) {
      return 100000;
    }
    if (this.hasTrailingLineComment(c)) {
      return 100000;
    }
    return fwAdd(this.flatWidth(c), 1);
  }

  canMergeBody(l: i32, a: i32, b: i32, base: i32): boolean {
    const d = this.d;
    const bf = fwAt(d.lFirst, b);
    if (fwAt(d.kind, bf) !== P_RBRACE || this.hasInnerDirective(a)) {
      return false;
    }
    // `}` or `};`, maybe with a trailing comment (it counts toward the limit).
    let bn = fwAt(d.nxt, bf);
    if (bn >= 0 && fwAt(d.kind, bn) === P_SEMI) {
      bn = fwAt(d.nxt, bn);
    }
    if (bn >= 0 && fwAt(d.kind, bn) === K_COMMENT && fwAt(d.nxt, bn) < 0 && fwAt(d.nl, bn) === 0) {
      bn = -1;
    }
    // A compound requirement's `} -> C<T>;` (or `} noexcept`) merges too, as
    // does a function-try-block's `} catch (...) {`; `} else` never does.
    const an0 = fwAt(d.nxt, bf);
    if (
      bn >= 0 &&
      !(
        an0 === bn &&
        (fwAt(d.kind, bn) === P_ARROW || fwAt(d.kind, bn) === KW_NOEXCEPT || fwAt(d.kind, bn) === KW_CATCH)
      )
    ) {
      return false;
    }
    if (this.hasTrailingLineComment(a) || this.hasTrailingLineComment(l)) {
      return false;
    }
    if (fwAt(d.lType, a) === LT_PREPROCESSOR || fwAt(d.lType, a) === LT_IMPORT) {
      return false;
    }
    // No nested blocks in the body line.
    for (let t = fwAt(d.lFirst, a); t >= 0; t = fwAt(d.nxt, t)) {
      if (fwAt(d.kind, t) === P_LBRACE && fwAt(d.bk, t) === BK_BLOCK) {
        return false;
      }
    }
    if (fwAt(d.lSibling, a) !== b) {
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
    let limit = fwSub(d.opts.columnLimit, ind);
    const tl = fwAt(an.tot, fwAt(d.lLast, l));
    if (tl > limit) {
      return false;
    }
    limit = fwSub(limit, tl);
    // A macro going on past the `}` keeps room for its ` \` (limitConsideringMacros).
    const nb = fwAt(d.lSibling, b);
    if (
      fwAt(d.lPP, b) === 1 &&
      nb >= 0 &&
      fwAt(d.lPP, nb) === 1 &&
      fwAt(d.ppId, fwAt(d.lFirst, nb)) === fwAt(d.ppId, bf) &&
      fwAt(d.unesc, fwAt(d.lFirst, nb)) === 0
    ) {
      limit = limit < 2 ? 0 : limit - 2;
    }
    if (fwAt(an.mustB, fwAt(d.lFirst, a)) === 1 || fwAt(an.mustB, bf) === 1) {
      return false;
    }
    return fwAdd(fwAdd(fwAdd(1, fwAt(an.tot, fwAt(d.lLast, a))), 1), fwAt(an.tot, fwAt(d.lLast, b))) <= limit;
  }

  /** Whether line `l` ends in a function's `{` and block comments, and line `a` is its `}` (or `};`) alone. */
  emptyFunctionAfterComment(l: i32, a: i32): boolean {
    const d = this.d;
    const first = fwAt(d.lFirst, l);
    let b = fwAt(d.lLast, l);
    while (b !== first && fwAt(d.kind, b) === K_COMMENT) {
      b = fwAt(d.prv, b);
    }
    if (
      b === first ||
      fwAt(d.kind, b) !== P_LBRACE ||
      fwAt(d.type, b) !== TT_FUNCTION_LBRACE ||
      fwAt(d.bk, b) !== BK_BLOCK
    ) {
      return false;
    }
    const af = fwAt(d.lFirst, a);
    if (fwAt(d.kind, af) !== P_RBRACE || fwAt(d.lOpen, a) !== l) {
      return false;
    }
    let after = fwAt(d.nxt, af);
    while (after >= 0 && fwAt(d.kind, after) === K_COMMENT && fwAt(d.nl, after) === 0) {
      after = fwAt(d.nxt, after);
    }
    if (after >= 0 && fwAt(d.nl, after) === 0 && fwAt(d.kind, after) === P_SEMI) {
      after = fwAt(d.nxt, after);
      while (after >= 0 && fwAt(d.kind, after) === K_COMMENT && fwAt(d.nl, after) === 0) {
        after = fwAt(d.nxt, after);
      }
    }
    return after < 0 || fwAt(d.nl, after) > 0;
  }

  /** Appends line `b`'s tokens to line `l` and drops `b` from its list. */
  joinInto(l: i32, b: i32): void {
    const d = this.d;
    const last = fwAt(d.lLast, l);
    const bf = fwAt(d.lFirst, b);
    fwPut(d.nxt, last, bf);
    fwPut(d.prv, bf, last);
    fwPut(d.lLast, l, fwAt(d.lLast, b));
    fwPut(d.lSibling, l, fwAt(d.lSibling, b));
    if (d.topTail === b) {
      d.topTail = l;
    }
    // The joined tokens sit on one line now.
    fwPut(this.ann.jnl, bf, fwAt(d.nl, bf));
    fwPut(d.nl, bf, 0);
    fwPut(this.ann.joined, bf, fwAdd(b, 1));
    fwPut(this.ann.lStamp, l, 0);
  }

  /** The penalty of formatting child list `head` at `base` indent, without emitting. */
  listPenalty(head: i32, base: i32): i64 {
    const d = this.d;
    let pen: i64 = 0;
    let l = head;
    while (l >= 0) {
      this.ind.fm = this;
      // (Penalties are sums of break and excess-column costs, far below
      // 2^63: the wrapping u64 sum is the exact one.)
      pen = toI64(toU64(pen) + toU64(this.ind.formatLine(l, this.indentOf(l, base), 1, true, false)));
      l = fwAt(d.lSibling, l);
    }
    return pen;
  }

  /** Emits list `head` (top level or a child block) at `base` indent. */
  emitList(head: i32, base: i32, nested: boolean): void {
    const d = this.d;
    let l = head;
    let prev = -1;
    let pend = -1; // where directives found inside the next line's statement start
    let lastInl = -1; // the last directive line inside the statement being emitted
    while (l >= 0) {
      const f = fwAt(d.lFirst, l);
      // A directive inside a statement lands after the statement's first token,
      // so it does not count as the file's first output.
      const fe0 = this.firstEmitted;
      let inlineLine = false;
      if (this.verbatim && fwAt(d.kind, f) === K_COMMENT && this.offMarker(f) === 2) {
        // A line starting with `clang-format on` is formatted.
        this.verbatim = false;
      }
      const offLine = this.hasOff && fwAt(this.offTok, f) === 1 && !this.verbatim;
      if (offLine) {
        // An off region whose `clang-format off` comment this pass skipped.
        this.verbatim = true;
      }
      if (this.verbatim && fwAt(d.kind, f) !== K_COMMENT) {
        // `clang-format on` inside the line: the line is laid out, its tokens
        // before the marker keeping their whitespace (they are untouched).
        // (Only with more tokens after the marker: a trailing marker leaves
        // its line as written.)
        for (let t = fwAt(d.nxt, f); t >= 0; t = fwAt(d.nxt, t)) {
          if (fwAt(d.kind, t) === K_COMMENT && this.offMarker(t) === 2) {
            if (fwAt(d.nxt, t) >= 0) {
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
          this.emitRaw(fwAt(d.end, f), fwAt(d.end, fwAt(d.lLast, l)));
        } else {
          this.emitVerbatimLine(l);
        }
        if (this.verbatim && !inl && pend >= 0) {
          this.interleave(pend, vStart);
          pend = -1;
        }
      } else if (this.longMessage(l)) {
        // A `#error` or `#warning` clang-format finds no layout for: its
        // first token is still placed (formatFirstToken runs before the
        // line formatter), the rest is left as written.
        const nl0 = this.newlinesBefore(l, prev, prev < 0, nested);
        this.firstEmitted = true;
        this.emit(f, nl0, 0);
        this.emitRaw(fwAt(d.end, f), fwAt(d.end, fwAt(d.lLast, l)));
      } else if (this.isMessage(l)) {
        this.emitMessage(l, this.newlinesBefore(l, prev, prev < 0, nested));
        this.firstEmitted = true;
      } else if (fwAt(d.lInvalid, l) === 1) {
        // A line clang-format cannot annotate keeps its own layout; only the
        // newlines before it are formatted (none when it starts on the line
        // before's source line: then it is untouched altogether).
        const nl0 = fwAt(d.nl, f) === 0 && prev >= 0 ? 0 : this.newlinesBefore(l, prev, prev < 0, nested);
        this.firstEmitted = true;
        const hostStart = this.nem;
        for (let t = f; t >= 0; t = fwAt(d.nxt, t)) {
          this.emit(t, t === f ? nl0 : fwAt(d.nl, t), fwAt(d.col, t));
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
        let nl = 0;
        if (inlinePP) {
          const nf = fwAt(d.nl, f);
          nl = nf > 2 ? 2 : nf < 1 ? 1 : nf;
        } else {
          nl = this.newlinesBefore(l, prev, prev < 0, nested);
        }
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
        if (fwAt(d.kind, f) === P_RBRACE && this.closesNamespace(l)) {
          if (this.bracesBalanced && this.samePPContext(fwAt(d.lLast, fwAt(d.lOpen, l)), f)) {
            this.namespaceComment(l);
          }
        } else if (this.bracesBalanced && fwAt(d.lNamespace, l) === 1) {
          // `namespace X {} // comment`: the joined `}` still has its end
          // comment checked (a short namespace gets none added).
          let lb = -1;
          for (let t = fwAt(d.nxt, f); t >= 0; t = fwAt(d.nxt, t)) {
            if (lb < 0 && fwAt(d.kind, t) === P_LBRACE) {
              lb = t;
            } else if (lb >= 0 && fwAt(d.kind, t) === P_RBRACE && fwAt(d.prv, t) === lb) {
              this.fixEndComment(t, l);
              break;
            }
          }
        }
      }
      this.firstEmitted = inlineLine ? fe0 : true;
      // `// nishfmt off` / `// clang-format off` on this line starts a raw region.
      for (let t = f; t >= 0; t = fwAt(d.nxt, t)) {
        if (fwAt(d.kind, t) === K_COMMENT) {
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
      // Directives inside a statement follow it in clang-format's line list:
      // the statement's previous line is the one before them, and the last
      // of them is the line before the statement's next line.
      if (inlineLine) {
        if (!nested) {
          lastInl = l;
        }
      } else if (
        !(nested && (fwAt(d.lType, l) === LT_PREPROCESSOR || fwAt(d.lPP, l) === 1 || fwAt(d.lInlineCmt, l) === 1))
      ) {
        prev = lastInl >= 0 ? lastInl : l;
        lastInl = -1;
      }
      l = fwAt(d.lSibling, l);
    }
  }

  /** Whether directive line `l` sits inside the statement of a following line. */
  isInlineDirective(l: i32): boolean {
    const d = this.d;
    if (
      fwAt(d.lType, l) !== LT_PREPROCESSOR &&
      fwAt(d.lType, l) !== LT_IMPORT &&
      fwAt(d.lPP, l) !== 1 &&
      fwAt(d.lInlineCmt, l) !== 1
    ) {
      return false;
    }
    // The line after the run of directive lines: found once per run (a
    // long run would be walked again for each of its lines).
    if (toI32(this.idStamp.length) < d.nline) {
      this.idStamp = growI32(this.idStamp, fwAdd(d.nline, 64));
      this.idNext = growI32(this.idNext, fwAdd(d.nline, 64));
    }
    let h = -2;
    if (fwAt(this.idStamp, l) === this.untGen) {
      h = fwAt(this.idNext, l);
    } else {
      h = fwAt(d.lSibling, l);
      while (
        h >= 0 &&
        (fwAt(d.lType, h) === LT_PREPROCESSOR ||
          fwAt(d.lType, h) === LT_IMPORT ||
          fwAt(d.lPP, h) === 1 ||
          fwAt(d.lInlineCmt, h) === 1)
      ) {
        h = fwAt(d.lSibling, h);
      }
      for (let x = fwAt(d.lSibling, l); x >= 0 && x !== h; x = fwAt(d.lSibling, x)) {
        fwPut(this.idStamp, x, this.untGen);
        fwPut(this.idNext, x, h);
      }
    }
    return h >= 0 && fwAt(d.lFirst, h) < fwAt(d.lFirst, l);
  }

  /**
   * Moves the directive entries [pend, hostStart) into the host statement's
   * entries [hostStart, nem), each directive before the first host token that
   * follows it in the source.
   */
  interleave(pend: i32, hostStart: i32): void {
    const n = this.nem;
    const cnt = fwSub(n, pend);
    const tok = newI32s(cnt);
    const nl = newI32s(cnt);
    const col = newI32s(cnt);
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    let o = 0;
    let p = pend;
    let h = hostStart;
    while (o < cnt) {
      // The next directive's run: from p to the next entry starting a line.
      let pe = p;
      if (p < hostStart) {
        pe = p + 1;
        while (pe < hostStart && fwAt(emNl, pe) === 0) {
          pe++;
        }
      }
      const hashTok = p < hostStart ? fwAt(emTok, p) : 0;
      while (h < n && (p >= hostStart || this.hostSourceTok(fwAt(emTok, h)) < hashTok)) {
        if (o < 0 || o >= tok.length || o >= nl.length || o >= col.length) {
          // (Where `tok[o]` panicked.)
          fault();
          return;
        }
        tok[o] = fwAt(emTok, h);
        nl[o] = fwAt(emNl, h);
        col[o] = fwAt(emCol, h);
        o++;
        h++;
      }
      while (p < pe) {
        if (o < 0 || o >= tok.length || o >= nl.length || o >= col.length) {
          fault();
          return;
        }
        tok[o] = fwAt(emTok, p);
        nl[o] = fwAt(emNl, p);
        col[o] = fwAt(emCol, p);
        o++;
        p++;
      }
      if (p >= hostStart && h >= n) {
        break;
      }
    }
    let k = pend;
    for (let i = 0; i < cnt; i++) {
      if (
        k < 0 ||
        k >= emTok.length ||
        k >= emNl.length ||
        k >= emCol.length ||
        i >= tok.length ||
        i >= nl.length ||
        i >= col.length
      ) {
        // (Where `emTok[pend + i]` panicked.)
        fault();
        return;
      }
      emTok[k] = tok[i];
      emNl[k] = nl[i];
      emCol[k] = col[i];
      k++;
    }
  }

  /** The source token an emitted entry `t` stands for (a split string's piece: its string), or -1. */
  hostSourceTok(t: i32): i32 {
    if (t >= 0) {
      return t;
    }
    if (t <= PIECE && t > RAW) {
      return fwAt(this.pcTok, PIECE - t);
    }
    return -1;
  }

  /** Whether directive line `l` continues over an escaped newline. */
  continuedDirective(l: i32): boolean {
    const d = this.d;
    const f = fwAt(d.lFirst, l);
    if (fwAt(d.lPP, l) !== 1 || fwAt(d.kind, f) !== P_HASH) {
      return false;
    }
    // `#if` and `#elif` conditions and split `#define`s are formatted as code.
    // Every directive line is formatted as code, but a #define whose body
    // is not parsed as code is kept as written.
    const pk = fwAt(d.ppKind, f);
    if (pk !== PP_DEFINE || fwAt(d.lDefCode, l) === 1) {
      return false;
    }
    for (let t = fwAt(d.nxt, f); t >= 0; t = fwAt(d.nxt, t)) {
      if (fwAt(d.nl, t) > 0) {
        return true;
      }
    }
    return false;
  }

  /** 1 for an "off" pragma comment, 2 for "on", 0 otherwise. */
  offMarker(t: i32): i32 {
    const d = this.d;
    const st = fwAt(d.start, t);
    const e = fwAt(d.end, t);
    let i = fwAdd(st, 2);
    while (i < e && (d.at(i) === 32 || d.at(i) === 47 || d.at(i) === 42)) {
      i++;
    }
    if (d.startsWithAt(i, e, "nishfmt off")) {
      return 1;
    }
    if (d.startsWithAt(i, e, "nishfmt on")) {
      return 2;
    }
    // clang-format's isClangFormatOff/On: `// clang-format off`, alone or
    // before a `:`, or `/* clang-format off */` exactly.
    if (this.isFormatOff(st, e)) {
      return 1;
    }
    if (this.isFormatOn(st, e)) {
      return 2;
    }
    return 0;
  }

  /**
   * clang-format's switchesFormatting: the comment's text after `//` or `/*`,
   * blanks dropped, starts with `clang-format on` or `off` (so do nishfmt's
   * markers). Such a comment is never reflowed, broken or given a space.
   */
  switchesFormatting(t: i32): boolean {
    const d = this.d;
    const e = fwAt(d.end, t);
    let i = fwAdd(fwAt(d.start, t), 2);
    while (i < e && (isBlankByte(d.at(i)) || d.at(i) === 10)) {
      i++;
    }
    return (
      d.startsWithAt(i, e, "clang-format on") || d.startsWithAt(i, e, "clang-format off") || this.offMarker(t) !== 0
    );
  }

  /** Emits line `l` exactly as it was written. */
  emitVerbatimLine(l: i32): void {
    const d = this.d;
    for (let t = fwAt(d.lFirst, l); t >= 0; t = fwAt(d.nxt, t)) {
      let c = fwAt(d.col, t);
      const p = fwAt(d.prv, t);
      if (
        t !== fwAt(d.lFirst, l) &&
        fwAt(d.nl, t) === 0 &&
        fwAt(d.kind, t) === K_COMMENT &&
        p >= 0 &&
        fwAt(d.multi, p) === 0 &&
        this.offMarker(t) === 2
      ) {
        // A trailing `clang-format on` is formatted: one space before it.
        c = fwAdd(fwAdd(fwAt(d.col, p), fwAt(d.width, p)), 1);
      }
      this.emit(t, this.firstEmitted || t !== fwAt(d.lFirst, l) ? fwAt(d.nl, t) : 0, c);
      this.verbatimChildren(t);
    }
  }

  verbatimChildren(t: i32): void {
    const d = this.d;
    let c = fwAt(d.childHead, t);
    while (c >= 0) {
      this.emitVerbatimLine(c);
      c = fwAt(d.lSibling, c);
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
    this.endCommentsInserted = false;
    while (true) {
      const np = this.planPasses();
      if (getenv("FFPASS") !== null) console.error(`passes ${np} tokens ${d.ntok}`);
      if (np === 0) {
        // One pass over every token.
        const nt = d.ntok;
        const passMul = d.passMul;
        const dec = d.dec;
        const fap = d.fap;
        if (nt > passMul.length || nt > dec.length || nt > fap.length) {
          // (Where `passMul[j]` panicked.)
          fault();
          return false;
        }
        for (let j = 0; j < nt; j++) {
          passMul[j] = 0;
          dec[j] = 0;
          fap[j] = 0;
        }
        scanAfterDirective(d.kind, d.inPP, d.ntok, null, d.fap);
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
        const nt = d.ntok;
        if (toI32(this.offFull.length) < nt) {
          this.offFull = newI32s(fwAdd(nt, 64));
        }
        const offFull = this.offFull;
        const offTok = this.offTok;
        if (nt > offFull.length || nt > offTok.length) {
          // (Where `offTok[t]` panicked.)
          fault();
          return false;
        }
        for (let t = 0; t < nt; t++) {
          offFull[t] = offTok[t];
        }
      }
      this.npass = np;
      this.markUsefulPasses(np);
      // clang-format parses every pass before it formats any, so a token
      // gets FirstAfterPPLine from whichever pass sets it.
      const fullN = this.fullN;
      if (toI32(this.fapFull.length) < fullN) {
        this.fapFull = newI32s(fwAdd(fullN, 64));
      }
      this.fapFull.fill(0);
      for (let p = 0; p < np; p++) {
        const vis = this.vis;
        if (p >= vis.length) {
          fault();
          return false;
        }
        scanAfterDirective(this.sKind, this.sInPP, fullN, vis[p], this.fapFull);
      }
      const decFull = this.decFull;
      if (fullN > decFull.length) {
        fault();
        return false;
      }
      for (let t = 0; t < fullN; t++) {
        decFull[t] = 0;
      }
      let restart = false;
      if (toI32(this.passSeen.length) < fullN) {
        this.passSeen = newI32s(fwAdd(fullN, 64));
        this.finCol = newI32s(fwAdd(fullN, 64));
      }
      const passSeen = this.passSeen;
      const finCol = this.finCol;
      if (fullN > passSeen.length || fullN > finCol.length) {
        fault();
        return false;
      }
      for (let t = 0; t < fullN; t++) {
        finCol[t] = -1;
      }
      for (let t = 0; t < fullN; t++) {
        passSeen[t] = 0;
      }
      for (let p = 0; p < np; p++) {
        // clang-format annotates every pass, useful or not.
        const vis = this.vis;
        if (p >= vis.length) {
          fault();
          return false;
        }
        const vp = vis[p];
        if (fullN > vp.length || fullN > passSeen.length) {
          fault();
          return false;
        }
        for (let t = 0; t < fullN; t++) {
          const sum = toI64(passSeen[t]) + toI64(vp[t]);
          if (sum > toI64(2147483647) || sum < toI64(-2147483648)) {
            // (Where the i32 sum panicked.)
            fault();
            return false;
          }
          passSeen[t] = toI32(sum);
        }
        if (fwAt(this.useful, p) === 0) {
          continue;
        }
        while (p >= toI32(this.passOuts.length)) {
          this.passOuts.push(new Out(1 << 16));
          this.uSs.push(new Array<i32>(0));
          this.uEs.push(new Array<i32>(0));
        }
        const uSs = this.uSs;
        const uEs = this.uEs;
        if (p >= uSs.length || p >= uEs.length) {
          // (Where `uSs[p]` panicked.)
          fault();
          return false;
        }
        let us = uSs[p];
        let ue = uEs[p];
        if (toI32(us.length) < fullN) {
          us = newI32s(fwAdd(fullN, 64));
          ue = newI32s(fwAdd(fullN, 64));
          if (p >= uSs.length || p >= uEs.length) {
            fault();
            return false;
          }
          uSs[p] = us;
          uEs[p] = ue;
        }
        us.fill(-1);
        ue.fill(-1);
        this.filterTokens(vp);
        const nt = d.ntok;
        const passMul = d.passMul;
        const map = this.map;
        if (nt > passMul.length || nt > map.length) {
          fault();
          return false;
        }
        for (let j = 0; j < nt; j++) {
          const m = map[j];
          if (m < 0 || m >= passSeen.length) {
            // (Where `passSeen[map[j]]` panicked.)
            fault();
            return false;
          }
          passMul[j] = passSeen[m];
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
        this.uS = us;
        this.uE = ue;
        const outs = this.passOuts;
        if (p >= outs.length) {
          fault();
          return false;
        }
        const po = outs[p];
        po.n = 0;
        const r = this.runPass(po, prof, mayRestart);
        if (getenv("FFPASS") !== null) {
          writeFileBytesSync(`ffpass${p}.txt`, sliceU8s(po.buf, 0, po.n));
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
        restarts = fwAdd(restarts, 1);
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
    this.cpGen = fwAdd(this.cpGen, 1);
    const t1 = monotonicNanos();
    const p = new Parser(d);
    p.parseFile();
    if (d.failed) {
      return PASS_FAIL;
    }
    this.compoundReqs = p.compoundReqs;
    // Objective-C beyond declarations (literals, @implementation, method
    // bodies): the file is left alone.
    if (d.objcSeen && d.objcOther) {
      return PASS_FAIL;
    }
    if (mayRestart && this.sortUsings()) {
      // The using-declarations were reordered in the text: start over on it.
      return PASS_RESTART;
    }
    if (this.insertContinuedEndComments()) {
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
    this.bracesBalanced = this.bracesBalance();
    const keepWs = d.keepWs;
    const nt = d.ntok;
    if (nt > keepWs.length) {
      // (Where `keepWs[t]` panicked.)
      fault();
      return PASS_FAIL;
    }
    for (let t = 0; t < nt; t++) {
      keepWs[t] = 0;
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
      const nem = this.nem;
      for (let i = 0; i < nem; i++) {
        const emTok = this.emTok;
        const emCol = this.emCol;
        const kind = d.kind;
        if (i >= emTok.length || i >= emCol.length) {
          // (Where `emTok[i]` panicked.)
          fault();
          return PASS_FAIL;
        }
        const t = emTok[i];
        const c = emCol[i];
        if (t >= 0 && t < d.ntok && t < kind.length && kind[t] === K_COMMENT && !this.isFin(i)) {
          fwPut(this.finCol, fwAt(this.map, t), c);
        }
      }
    }
    this.write(out);
    const t5 = monotonicNanos();
    if (prof.length >= 5) {
      prof[1] = fwSpan(prof[1], t1, t2);
      prof[2] = fwSpan(prof[2], t2, t3);
      prof[3] = fwSpan(prof[3], t3, t4);
      prof[4] = fwSpan(prof[4], t4, t5);
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
    const ppKind = d.ppKind;
    let hasCond = false;
    for (let t = 0; t < n; t++) {
      if (t >= ppKind.length) {
        // (Where `ppKind[t]` panicked.)
        fault();
        return 0;
      }
      const k = ppKind[t];
      if (k === PP_IF || k === PP_ELIF || k === PP_ELSE) {
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
      const vis = this.vis;
      if (np < 0 || np > vis.length) {
        // (Never: np counts the passes made, each with its `vis`.)
        fault();
        return 0;
      }
      if (np >= toI32(vis.length)) {
        vis.push(new Array<i32>(0));
      }
      if (np >= vis.length) {
        fault();
        return 0;
      }
      if (toI32(vis[np].length) < n) {
        const fresh = newI32s(fwAdd(n, 64));
        if (np >= vis.length) {
          fault();
          return 0;
        }
        vis[np] = fresh;
      }
      if (np >= vis.length) {
        fault();
        return 0;
      }
      const seen = this.planPass(vis[np]);
      if (np === 0 && !seen) {
        allVisible = false;
      }
      np++;
      // Next combination: drop exhausted levels, step the deepest one.
      const ppIdx = this.ppIdx;
      const ppCnt = this.ppCnt;
      while (true) {
        const ni = ppIdx.length;
        const nc = ppCnt.length;
        if (ni < 1) {
          break;
        }
        if (nc < 1) {
          // (Where `ppCnt[ppCnt.length - 1]` panicked.)
          fault();
          return 0;
        }
        const top = ppIdx[ni - 1];
        if (top >= 2147483647) {
          // (Where `top + 1` panicked.)
          fault();
          return 0;
        }
        if (top + 1 < ppCnt[nc - 1]) {
          break;
        }
        if (ppIdx.length > 0) {
          ppIdx.pop();
        }
        if (ppCnt.length > 0) {
          ppCnt.pop();
        }
      }
      const ni = ppIdx.length;
      if (ni < 1) {
        break;
      }
      const top = ppIdx[ni - 1];
      if (top >= 2147483647) {
        fault();
        return 0;
      }
      ppIdx[ni - 1] = top + 1;
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
      const pk = fwAt(d.ppKind, t);
      if (pk === PP_IF) {
        let u = false;
        // (t < n: the next two indexes fit.)
        const w = t + 1;
        const c = w < n ? w + 1 : n;
        if (w < n && fwAt(d.ppId, w) === t && c < n && fwAt(d.ppId, c) === t) {
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
        if (unreach.length < 1) {
          // (Where `unreach.pop()` panicked.)
          fault();
          return false;
        }
        unreach.pop();
        const nc = chain.length;
        if (nc > 0) {
          const ci = chain[nc - 1];
          if (ci >= 2147483647) {
            fault();
            return false;
          }
          chain[nc - 1] = ci + 1;
        }
        const nc2 = chain.length;
        const skip = level >= 0 && nc2 > 0 && fwAt(this.ppIdx, level) !== chain[nc2 - 1];
        const nu = unreach.length;
        unreach.push(skip || (nu > 0 && unreach[nu - 1] === 1) ? 1 : 0);
      } else if (pk === PP_ENDIF) {
        const nc = chain.length;
        if (level >= 0 && nc > 0) {
          const ci = chain[nc - 1];
          if (ci >= 2147483647) {
            fault();
            return false;
          }
          const k = ci + 1;
          const ppCnt = this.ppCnt;
          if (level >= ppCnt.length) {
            fault();
            return false;
          }
          if (k > ppCnt[level]) {
            ppCnt[level] = k;
          }
        }
        if (level >= 0) {
          level--;
        }
        if (chain.length > 0) {
          chain.pop();
        }
        if (unreach.length > 0) {
          unreach.pop();
        }
      }
      const nu = unreach.length;
      const v =
        fwAt(d.inPP, t) === 1 ||
        fwAt(d.kind, t) === K_EOF ||
        nu === 0 ||
        (nu > 0 && unreach[nu - 1] === 0) ||
        this.readWithDirective(t);
      fwPut(vis, t, v ? 1 : 0);
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
    if (t <= 0 || fwAt(d.kind, t) !== K_COMMENT || fwAt(d.nl, t) !== 1 || d.at(fwAdd(fwAt(d.start, t), 1)) !== 47) {
      return false;
    }
    const p = t - 1;
    if (fwAt(d.kind, p) !== K_COMMENT || d.at(fwAdd(fwAt(d.start, p), 1)) !== 47) {
      return false;
    }
    if (fwAt(d.inPP, p) !== 1 && !this.readWithDirective(p)) {
      return false;
    }
    // (clang-format's directive token source reads on past a newline only
    // for a line comment at or right of the comment before it.)
    return this.origColumn(t) >= this.origColumn(p);
  }

  /** clang-format's conditionalCompilationStart; answers the new level. */
  condStart(level0: i32, chain: i32[], unreach: i32[], u: boolean): i32 {
    const level = fwAdd(level0, 1);
    if (level === toI32(this.ppIdx.length)) {
      this.ppIdx.push(0);
      this.ppCnt.push(0);
    }
    chain.push(u ? -1 : 0);
    const skip = fwAt(this.ppIdx, level) > 0;
    const nu = unreach.length;
    unreach.push(u || skip || (nu > 0 && unreach[nu - 1] === 1) ? 1 : 0);
    return level;
  }

  /**
   * Marks the passes that see a token no earlier pass saw: only those can
   * contribute to the output (pass 0 always does).
   */
  markUsefulPasses(np: i32): void {
    const n = this.fullN;
    if (toI32(this.useful.length) < np) {
      this.useful = newI32s(fwAdd(np, 16));
    }
    if (toI32(this.seenBy.length) < n) {
      this.seenBy = newI32s(fwAdd(n, 64));
    }
    const vis = this.vis;
    const useful = this.useful;
    const seenBy = this.seenBy;
    if (vis.length < 1 || useful.length < 1) {
      // (Where `vis[0]` or `useful[0]` panicked.)
      fault();
      return;
    }
    const v0 = vis[0];
    if (n > v0.length || n > seenBy.length) {
      fault();
      return;
    }
    for (let t = 0; t < n; t++) {
      seenBy[t] = v0[t];
    }
    useful[0] = 1;
    for (let p = 1; p < np; p++) {
      if (p >= vis.length || p >= useful.length) {
        fault();
        return;
      }
      const v = vis[p];
      if (n > v.length) {
        fault();
        return;
      }
      let any = 0;
      for (let t = 0; t < n; t++) {
        if (v[t] === 1 && seenBy[t] === 0) {
          seenBy[t] = 1;
          any = 1;
        }
      }
      useful[p] = any;
    }
  }

  /** Marks the source tokens that a pass before `p` saw. */
  markSeenBefore(p: i32): void {
    const n = this.fullN;
    if (toI32(this.seenBefore.length) < n) {
      this.seenBefore = newI32s(fwAdd(n, 64));
    }
    const seenBefore = this.seenBefore;
    const useful = this.useful;
    const vis = this.vis;
    if (n > seenBefore.length) {
      // (Where `seenBefore[t]` panicked.)
      fault();
      return;
    }
    for (let t = 0; t < n; t++) {
      seenBefore[t] = 0;
    }
    for (let q = 0; q < p; q++) {
      if (q >= useful.length) {
        fault();
        return;
      }
      if (useful[q] === 0) {
        continue;
      }
      if (q >= vis.length) {
        fault();
        return;
      }
      const v = vis[q];
      if (n > v.length) {
        fault();
        return;
      }
      for (let t = 0; t < n; t++) {
        if (v[t] === 1) {
          seenBefore[t] = 1;
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
    const nem = this.nem;
    const emTok = this.emTok;
    const emNl = this.emNl;
    for (let i = 0; i < nem; i++) {
      if (i >= emTok.length || i >= emNl.length) {
        // (Where `emTok[i]` panicked.)
        fault();
        return;
      }
      const t = emTok[i];
      const nl = emNl[i];
      if (t < 0 || t >= d.ntok || fwAt(d.keepWs, t) === 1 || this.untouchedKind(t) > 0) {
        continue;
      }
      const f = fwAt(this.map, t);
      const decFull = this.decFull;
      const seenBefore = this.seenBefore;
      if (f < 0 || f >= seenBefore.length || f >= decFull.length) {
        fault();
        return;
      }
      if (seenBefore[f] === 1 || decFull[f] !== 0) {
        continue;
      }
      decFull[f] = nl > 0 ? 2 : 1;
    }
  }

  /** Copies the lexed token columns aside, before passes filter them. */
  saveTokens(): void {
    const d = this.d;
    const n = d.ntok;
    this.fullN = n;
    if (toI32(this.sKind.length) < n) {
      const c = fwAdd(n, 64);
      this.sKind = newI32s(c);
      this.sStart = newI32s(c);
      this.sEnd = newI32s(c);
      this.sNl = newI32s(c);
      this.sWs = newI32s(c);
      this.sCol = newI32s(c);
      this.sWidth = newI32s(c);
      this.sMulti = newI32s(c);
      this.sPlain = newI32s(c);
      this.sInPP = newI32s(c);
      this.sPPKind = newI32s(c);
      this.sPPId = newI32s(c);
      this.sUnesc = newI32s(c);
      this.sType = newI32s(c);
      this.sFinal = newI32s(c);
      this.o2p = newI32s(c);
      this.map = newI32s(c);
      this.decFull = newI32s(c);
    }
    const kind = d.kind;
    const start = d.start;
    const end = d.end;
    const nl = d.nl;
    const ws = d.ws;
    const col = d.col;
    const width = d.width;
    const multi = d.multi;
    const plain = d.plain;
    const inPP = d.inPP;
    const ppKind = d.ppKind;
    const ppId = d.ppId;
    const unesc = d.unesc;
    const type = d.type;
    const final = d.final;
    const sKind = this.sKind;
    const sStart = this.sStart;
    const sEnd = this.sEnd;
    const sNl = this.sNl;
    const sWs = this.sWs;
    const sCol = this.sCol;
    const sWidth = this.sWidth;
    const sMulti = this.sMulti;
    const sPlain = this.sPlain;
    const sInPP = this.sInPP;
    const sPPKind = this.sPPKind;
    const sPPId = this.sPPId;
    const sUnesc = this.sUnesc;
    const sType = this.sType;
    const sFinal = this.sFinal;
    if (
      n > kind.length ||
      n > start.length ||
      n > end.length ||
      n > nl.length ||
      n > ws.length ||
      n > col.length ||
      n > width.length ||
      n > multi.length ||
      n > plain.length ||
      n > inPP.length ||
      n > ppKind.length ||
      n > ppId.length ||
      n > unesc.length ||
      n > type.length ||
      n > final.length ||
      n > sKind.length ||
      n > sStart.length ||
      n > sEnd.length ||
      n > sNl.length ||
      n > sWs.length ||
      n > sCol.length ||
      n > sWidth.length ||
      n > sMulti.length ||
      n > sPlain.length ||
      n > sInPP.length ||
      n > sPPKind.length ||
      n > sPPId.length ||
      n > sUnesc.length ||
      n > sType.length ||
      n > sFinal.length
    ) {
      // (Where the copy below panicked.)
      fault();
      return;
    }
    for (let t = 0; t < n; t++) {
      sKind[t] = kind[t];
      sStart[t] = start[t];
      sEnd[t] = end[t];
      sNl[t] = nl[t];
      sWs[t] = ws[t];
      sCol[t] = col[t];
      sWidth[t] = width[t];
      sMulti[t] = multi[t];
      sPlain[t] = plain[t];
      sInPP[t] = inPP[t];
      sPPKind[t] = ppKind[t];
      sPPId[t] = ppId[t];
      sUnesc[t] = unesc[t];
      sType[t] = type[t];
      sFinal[t] = final[t];
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
    const n = this.fullN;
    const sKind = this.sKind;
    const sInPP = this.sInPP;
    if (t >= n) {
      return 0;
    }
    let depth = 0;
    for (let q = t + 1; q < n; q++) {
      if (q < 0 || q >= vis.length || q >= sKind.length || q >= sInPP.length) {
        // (Where `vis[q]` or `sKind[q]` panicked.)
        fault();
        return 0;
      }
      if (vis[q] !== 0) {
        break;
      }
      const k = sKind[q];
      if (k === P_LBRACE) {
        if (depth >= 2147483647) {
          fault();
          return 0;
        }
        depth++;
      } else if (k === P_RBRACE) {
        const nd = toI64(depth) - toI64(1);
        if (nd < toI64(-2147483648)) {
          // (Where `depth--` panicked.)
          fault();
          return 0;
        }
        depth = toI32(nd);
      } else if (
        depth === 0 &&
        sInPP[q] === 0 &&
        (k === P_SEMI || k === KW_IF || k === KW_WHILE || k === KW_FOR || k === KW_SWITCH || k === KW_TRY)
      ) {
        return 1;
      }
    }
    return 0;
  }

  filterTokens(vis: i32[]): void {
    this.cpGen = fwAdd(this.cpGen, 1);
    const d = this.d;
    const n = this.fullN;
    const o2p = this.o2p;
    const map = this.map;
    const sKind = this.sKind;
    const sStart = this.sStart;
    const sEnd = this.sEnd;
    const sNl = this.sNl;
    const sWs = this.sWs;
    const sCol = this.sCol;
    const sWidth = this.sWidth;
    const sMulti = this.sMulti;
    const sPlain = this.sPlain;
    const sInPP = this.sInPP;
    const sPPKind = this.sPPKind;
    const sPPId = this.sPPId;
    const sUnesc = this.sUnesc;
    const sType = this.sType;
    const sFinal = this.sFinal;
    const decFull = this.decFull;
    const fapFull = this.fapFull;
    const kind = d.kind;
    const start = d.start;
    const end = d.end;
    const nl = d.nl;
    const ws = d.ws;
    const col = d.col;
    const width = d.width;
    const multi = d.multi;
    const plain = d.plain;
    const inPP = d.inPP;
    const ppKind = d.ppKind;
    const ppId = d.ppId;
    const unesc = d.unesc;
    const type = d.type;
    const final = d.final;
    const dec = d.dec;
    const fap = d.fap;
    const asmFin = d.asmFin;
    const nxt = d.nxt;
    const prv = d.prv;
    const match = d.match;
    const childHead = d.childHead;
    const childTail = d.childTail;
    const childCount = d.childCount;
    const bk = d.bk;
    const nest = d.nest;
    const bind = d.bind;
    const mustBreak = d.mustBreak;
    const spaces = d.spaces;
    // A pass token `j` never passes its source token `t` (j <= t < n), so
    // every array below holding `n` entries is indexed in range.
    if (
      n > vis.length ||
      n > o2p.length ||
      n > map.length ||
      n > sKind.length ||
      n > sStart.length ||
      n > sEnd.length ||
      n > sNl.length ||
      n > sWs.length ||
      n > sCol.length ||
      n > sWidth.length ||
      n > sMulti.length ||
      n > sPlain.length ||
      n > sInPP.length ||
      n > sPPKind.length ||
      n > sPPId.length ||
      n > sUnesc.length ||
      n > sType.length ||
      n > sFinal.length ||
      n > decFull.length ||
      n > fapFull.length ||
      n > kind.length ||
      n > start.length ||
      n > end.length ||
      n > nl.length ||
      n > ws.length ||
      n > col.length ||
      n > width.length ||
      n > multi.length ||
      n > plain.length ||
      n > inPP.length ||
      n > ppKind.length ||
      n > ppId.length ||
      n > unesc.length ||
      n > type.length ||
      n > final.length ||
      n > dec.length ||
      n > fap.length ||
      n > asmFin.length ||
      n > nxt.length ||
      n > prv.length ||
      n > match.length ||
      n > childHead.length ||
      n > childTail.length ||
      n > childCount.length ||
      n > bk.length ||
      n > nest.length ||
      n > bind.length ||
      n > mustBreak.length ||
      n > spaces.length
    ) {
      // (Where the copy below panicked.)
      fault();
      return;
    }
    let j = 0;
    for (let t = 0; t < n; t++) {
      if (vis[t] === 0) {
        o2p[t] = -1;
        continue;
      }
      if (j < 0 || j >= n) {
        // (Never: j counts the visible tokens before `t`, so j <= t < n.)
        fault();
        return;
      }
      o2p[t] = j;
      map[j] = t;
      kind[j] = sKind[t];
      start[j] = sStart[t];
      end[j] = sEnd[t];
      nl[j] = sNl[t];
      ws[j] = sWs[t];
      col[j] = sCol[t];
      width[j] = sWidth[t];
      multi[j] = sMulti[t];
      plain[j] = sPlain[t];
      inPP[j] = sInPP[t];
      ppKind[j] = sPPKind[t];
      const pid = sPPId[t];
      if (pid >= o2p.length) {
        // (Where `o2p[pid]` panicked.)
        fault();
        return;
      }
      ppId[j] = pid >= 0 ? o2p[pid] : -1;
      unesc[j] = sUnesc[t];
      type[j] = sType[t];
      final[j] = sFinal[t];
      dec[j] = decFull[t];
      fap[j] = fapFull[t];
      asmFin[j] = 0;
      nxt[j] = -1;
      prv[j] = -1;
      match[j] = -1;
      childHead[j] = -1;
      childTail[j] = -1;
      childCount[j] = 0;
      bk[j] = 0;
      nest[j] = 0;
      bind[j] = 0;
      mustBreak[j] = 0;
      spaces[j] = 0;
      j++;
    }
    // Each visible token's hidden `;` (hiddenSemi reads only the saved
    // columns and `vis`, none of which the loop above writes).
    for (let t = 0; t < n; t++) {
      if (t >= vis.length || t >= o2p.length) {
        fault();
        return;
      }
      if (vis[t] !== 0) {
        const pj = o2p[t];
        fwPut(d.hidSemi, pj, this.hiddenSemi(t, vis));
      }
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
    const vis = this.vis;
    const uSs = this.uSs;
    const uEs = this.uEs;
    const outs = this.passOuts;
    if (vis.length < 1 || uSs.length < 1 || uEs.length < 1 || outs.length < 1) {
      // (Where `vis[0]` and the rest panicked.)
      fault();
      return;
    }
    const v0 = vis[0];
    const s0 = uSs[0];
    const e0 = uEs[0];
    const b0 = outs[0];
    const ord = this.ord;
    let pos = 0;
    for (let k = 0; k < ord.length; k++) {
      const o = ord[k];
      const eo = fwAt(e0, o);
      fwRange(out, b0.buf, pos, eo);
      pos = eo;
      let q = fwAdd(o, 1);
      while (q < n) {
        if (q < 0 || q >= v0.length || q >= s0.length) {
          // (Where `v0[q]` or `s0[q]` panicked.)
          fault();
          return;
        }
        if (!(v0[q] === 1 && s0[q] < 0)) {
          break;
        }
        q++;
      }
      if (q < n && fwAt(v0, q) === 0) {
        let r = q;
        while (r < n) {
          if (r < 0 || r >= v0.length) {
            fault();
            return;
          }
          if (v0[r] !== 0) {
            break;
          }
          r++;
        }
        this.emitRun(out, q, r);
      }
    }
    fwRange(out, b0.buf, pos, b0.n);
  }

  /** Writes the tokens [q, r), which pass 0 skipped. */
  emitRun(out: Out, q: i32, r: i32): void {
    const vis = this.vis;
    const uSs = this.uSs;
    const uEs = this.uEs;
    const outs = this.passOuts;
    for (let p = 1; p < this.npass; p++) {
      if (fwAt(this.useful, p) === 0) {
        continue;
      }
      if (p >= vis.length) {
        // (Where `vis[p]` panicked.)
        fault();
        return;
      }
      if (fwAt(vis[p], q) !== 1) {
        continue;
      }
      if (p >= uSs.length || p >= uEs.length) {
        fault();
        return;
      }
      const us = uSs[p];
      const ue = uEs[p];
      let lo = -1;
      let hi = -1;
      for (let t = q; t < r; t++) {
        if (t < 0 || t >= us.length || t >= ue.length) {
          // (Where `us[t]` panicked.)
          fault();
          return;
        }
        const s = us[t];
        if (s >= 0 && (lo < 0 || s < lo)) {
          lo = s;
        }
        if (ue[t] > hi) {
          hi = ue[t];
        }
      }
      if (lo >= 0 && hi >= lo) {
        if (p >= outs.length) {
          fault();
          return;
        }
        fwRange(out, outs[p].buf, lo, hi);
        return;
      }
    }
    // No pass saw these tokens: as written.
    const d = this.d;
    fwRange(out, d.src, fwAt(this.sEnd, fwSub(q, 1)), fwAt(this.sEnd, fwSub(r, 1)));
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
    for (let l = d.topHead; l >= 0; l = fwAt(d.lSibling, l)) {
      const lf = fwAt(d.lFirst, l);
      let f = lf;
      while (f >= 0 && fwAt(d.kind, f) === K_COMMENT) {
        f = fwAt(d.nxt, f);
      }
      let label: u8[] = [];
      const candidate = !off && fwAt(d.lPP, l) === 0 && f >= 0 && fwAt(d.kind, f) === KW_USING;
      if (candidate) {
        label = this.usingLabel(f);
      }
      if (!candidate || fwAt(d.nl, lf) > 1 || label.length === 0) {
        this.endUsingRun(run, labels, edits);
        run = [];
        labels = [];
      }
      if (candidate && label.length > 0) {
        run.push(l);
        labels.push(label);
      }
      for (let t = lf; t >= 0; t = fwAt(d.nxt, t)) {
        if (fwAt(d.kind, t) === K_COMMENT) {
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
      const i1 = i + 1;
      if (i1 >= edits.length || i >= 2147483645) {
        // (Where `edits[i + 2]` or `i += 3` panicked.)
        fault();
        return false;
      }
      const i2 = i1 + 1;
      if (i2 >= edits.length) {
        fault();
        return false;
      }
      const ea = edits[i];
      const eb = edits[i1];
      const src = edits[i2];
      fwPushBytes(out, d.src, at, ea);
      if (src >= 0) {
        fwPushBytes(out, d.src, fwAt(d.start, fwAt(d.lFirst, src)), fwAt(d.end, fwAt(d.lLast, src)));
      }
      at = eb;
    }
    fwPushBytes(out, d.src, at, d.n);
    d.reset(out, toI32(out.length));
    return true;
  }

  /** The sort label of the using-declaration at `u`, or empty when it is not one. */
  usingLabel(u: i32): u8[] {
    const d = this.d;
    const label: u8[] = [];
    let t = fwAt(d.nxt, u);
    if (t >= 0 && fwAt(d.kind, t) === KW_TYPENAME) {
      fwPushBytes(label, d.src, fwAt(d.start, t), fwAt(d.end, t));
      label.push(32);
      t = fwAt(d.nxt, t);
    }
    if (t >= 0 && fwAt(d.kind, t) === P_COLONCOLON) {
      label.push(58);
      label.push(58);
      t = fwAt(d.nxt, t);
    }
    let ident = false;
    while (t >= 0 && fwAt(d.kind, t) === K_IDENT) {
      ident = true;
      fwPushBytes(label, d.src, fwAt(d.start, t), fwAt(d.end, t));
      t = fwAt(d.nxt, t);
      if (t < 0 || fwAt(d.kind, t) !== P_COLONCOLON) {
        break;
      }
      label.push(58);
      label.push(58);
      t = fwAt(d.nxt, t);
    }
    if (ident && t >= 0 && (fwAt(d.kind, t) === P_SEMI || fwAt(d.kind, t) === P_COMMA)) {
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
        if (i >= labels.length) {
          // (Where `labels[i]` panicked.)
          fault();
          return;
        }
        const li = labels[i];
        order.push(i);
        let j = i;
        while (j > 0) {
          if (j >= order.length) {
            fault();
            return;
          }
          const oj = order[j - 1];
          if (oj < 0 || oj >= labels.length) {
            fault();
            return;
          }
          if (compareUsingLabels(li, labels[oj]) >= 0) {
            break;
          }
          if (j >= order.length) {
            fault();
            return;
          }
          order[j] = oj;
          j--;
        }
        if (j < 0 || j >= order.length) {
          fault();
          return;
        }
        order[j] = i;
      }
      const kept: i32[] = [];
      for (let i = 0; i < n; i++) {
        const oi = fwAt(order, i);
        const nk = kept.length;
        if (nk > 0) {
          const kl = kept[nk - 1];
          if (kl < 0 || kl >= labels.length || oi < 0 || oi >= labels.length) {
            // (Where `labels[...]` panicked.)
            fault();
            return;
          }
          if (sameBytes(labels[kl], labels[oi])) {
            continue;
          }
        }
        kept.push(oi);
      }
      for (let i = 0; i < n; i++) {
        const l = fwAt(run, i);
        if (i >= toI32(kept.length)) {
          const f = fwAt(d.lFirst, l);
          const pf = fwAt(d.prv, f);
          edits.push(pf >= 0 ? fwAt(d.end, pf) : 0);
          edits.push(fwAt(d.end, fwAt(d.lLast, l)));
          edits.push(-1);
        } else {
          const ki = fwAt(kept, i);
          if (ki !== i) {
            edits.push(fwAt(d.start, fwAt(d.lFirst, l)));
            edits.push(fwAt(d.end, fwAt(d.lLast, l)));
            edits.push(fwAt(run, ki));
          }
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
    const src = d.src;
    if (n > src.length) {
      // (Where reading the text panicked.)
      fault();
      return false;
    }
    // (A file with no include has nothing to sort, and one with no `R"` no
    // raw string.)
    if (fwFind(src, n, "include", 0) < 0 && fwFind(src, n, "import", 0) < 0) {
      return false;
    }
    const anyRaw = fwFind(src, n, 'R"', 0) >= 0;
    let prev =
      n >= 3 && src.length >= 3 && toI32(src[0]) === 0xef && toI32(src[1]) === 0xbb && toI32(src[2]) === 0xbf ? 3 : 0;
    let searchFrom = 0;
    let firstBlock = true;
    let mainFound = false;
    let off = false;
    let rawTerm = ')"';
    while (searchFrom < n) {
      // The next newline, past line splices (clang-format 23).
      let pos = searchFrom;
      if (fwByte(src, searchFrom) !== 10) {
        do {
          pos = fwFind(src, n, "\n", fwAdd(pos, 1));
        } while (pos >= 0 && fwByte(src, pos - 1) === 92);
      }
      let lineEnd = pos >= 0 ? pos : n;
      // Trimmed bounds. (`prev` is never negative and `lineEnd` never past
      // `n`, so the extra tests below never end a loop early.)
      let ta = prev;
      while (ta < lineEnd && ta >= 0 && ta < src.length && isTrimByte(toI32(src[ta]))) {
        ta++;
      }
      let te = lineEnd;
      while (te > ta && te > 0 && te <= src.length && isTrimByte(toI32(src[te - 1]))) {
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
      // A line starting a block comment reaches to its end (clang-format
      // 23): the includes in it are not sorted.
      let blockComment = false;
      if (this.isFormatOff(ta, te)) {
        off = true;
      } else if (this.isFormatOn(ta, te)) {
        off = false;
      } else if (this.textStartsWith(ta, te, "/*")) {
        blockComment = true;
        pos = fwFind(src, n, "*/", fwAdd(searchFrom, 2));
      }
      const merge = te > ta && fwByte(src, fwSub(te, 1)) === 92;
      if (!off && !merge) {
        if (!blockComment && this.matchInclude(prev, lineEnd)) {
          if (this.textContains(prev, lineEnd, "/*") && !this.textContains(prev, lineEnd, "*/")) {
            // An unclosed block comment: the lines up to its end go along.
            const c = this.findText("*/", searchFrom);
            pos = c;
            lineEnd = c >= 0 ? fwAdd(c, 2) : n;
          }
          const name = bytesText(src, this.incNameA, this.incNameE);
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
      // (`pos` is a position in the text: past it, the loop below ends all
      // the same.)
      if (pos < 0 || pos >= n || pos + 1 === n) {
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
    for (let i = 0; i < ed.length; i += 2) {
      const texts = this.incText;
      const ti = i / 2;
      if (i + 1 >= ed.length || ti < 0 || ti >= texts.length || i >= 2147483646) {
        // (Where `incText[i / 2]`, `ed[i + 1]` or `i += 2` panicked.)
        fault();
        return false;
      }
      const ea = ed[i];
      const eb = ed[i + 1];
      const txt = texts[ti];
      fwPushBytes(out, src, at, ea);
      for (let c = 0; c < toI32(txt.length); c++) {
        out.push(txt[c]);
      }
      at = eb;
    }
    fwPushBytes(out, src, at, n);
    d.reset(out, toI32(out.length));
    return true;
  }

  /** Sorts the include block collected in incA..incCat and clears it. */
  sortIncludeBlock(): void {
    const src = this.d.src;
    const incA = this.incA;
    const incE = this.incE;
    const k = toI32(incA.length);
    const idx: i32[] = [];
    for (let i = 0; i < k; i++) {
      idx.push(i);
    }
    // Stable insertion sort by (category, header name bytes).
    for (let i = 1; i < idx.length; i++) {
      const x = idx[i];
      let h = i; // where x goes
      while (h > 0 && h < idx.length && this.includeLess(x, idx[h - 1])) {
        idx[h] = idx[h - 1];
        h--;
      }
      if (h < 0 || h >= idx.length) {
        fault();
        return;
      }
      idx[h] = x;
    }
    // Duplicates (same trimmed line) next to each other are dropped.
    const keep: i32[] = [];
    for (let i = 0; i < idx.length; i++) {
      const xi = idx[i];
      const kl = toI32(keep.length);
      if (kl > 0 && this.sameTrimmed(keep[kl - 1], xi)) {
        continue;
      }
      keep.push(xi);
    }
    let sorted = toI32(keep.length) === k;
    for (let i = 0; sorted && i < keep.length; i++) {
      if (keep[i] !== i) {
        sorted = false;
      }
    }
    if (!sorted) {
      const txt: u8[] = [];
      for (let i = 0; i < keep.length; i++) {
        const ki = keep[i];
        if (i > 0) {
          txt.push(10);
        }
        if (ki < 0 || ki >= incA.length || ki >= incE.length) {
          fault();
          return;
        }
        const ce = incE[ki];
        let c = incA[ki];
        while (c < ce) {
          if (c < 0 || c >= src.length) {
            fault();
            return;
          }
          txt.push(src[c]);
          c++;
        }
      }
      // (The block holds an include: k > 0.)
      const kl = k - 1;
      if (kl < 0 || incA.length < 1 || kl >= incE.length) {
        fault();
        return;
      }
      const a = incA[0];
      const e = incE[kl];
      let same = toI64(txt.length) === toI64(e) - toI64(a);
      // (While same, txt is e - a bytes long.)
      let p = a;
      for (let c = 0; same && c < txt.length; c++) {
        if (p < 0 || p >= src.length) {
          fault();
          return;
        }
        if (txt[c] !== src[p]) {
          same = false;
        }
        p++;
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
    const cat = this.incCat;
    const na = this.incNa;
    const ne = this.incNe;
    if (
      x < 0 ||
      y < 0 ||
      x >= cat.length ||
      y >= cat.length ||
      x >= na.length ||
      y >= na.length ||
      x >= ne.length ||
      y >= ne.length
    ) {
      fault();
      return false;
    }
    const cx = cat[x];
    const cy = cat[y];
    if (cx !== cy) {
      return cx < cy;
    }
    const src = this.d.src;
    const ax = na[x];
    const ay = na[y];
    const ex = ne[x];
    const ey = ne[y];
    // The names' common length, byte by byte.
    let p = ax;
    let q = ay;
    while (p < ex && q < ey) {
      if (p < 0 || p >= src.length || q < 0 || q >= src.length) {
        fault();
        return false;
      }
      const cp = toI32(src[p]);
      const cq = toI32(src[q]);
      if (cp !== cq) {
        return cp < cq;
      }
      p++;
      q++;
    }
    return toI64(ex) - toI64(ax) < toI64(ey) - toI64(ay);
  }

  /** Whether includes `x` and `y` of the block have the same line, trimmed. */
  sameTrimmed(x: i32, y: i32): boolean {
    const src = this.d.src;
    const incA = this.incA;
    const incE = this.incE;
    if (x < 0 || y < 0 || x >= incA.length || y >= incA.length || x >= incE.length || y >= incE.length) {
      fault();
      return false;
    }
    let ax = incA[x];
    let ex = incE[x];
    let ay = incA[y];
    let ey = incE[y];
    // (An include line lies inside the text.)
    if (ax < 0 || ay < 0 || ex > src.length || ey > src.length) {
      fault();
      return false;
    }
    while (ax < ex && isTrimByte(toI32(src[ax]))) {
      ax++;
    }
    while (ex > ax && ex > 0 && isTrimByte(toI32(src[ex - 1]))) {
      ex--;
    }
    while (ay < ey && isTrimByte(toI32(src[ay]))) {
      ay++;
    }
    while (ey > ay && ey > 0 && isTrimByte(toI32(src[ey - 1]))) {
      ey--;
    }
    if (toI64(ex) - toI64(ax) !== toI64(ey) - toI64(ay)) {
      return false;
    }
    let q = ay;
    for (let p = ax; p < ex; p++) {
      if (q < 0 || q >= src.length) {
        fault();
        return false;
      }
      if (src[p] !== src[q]) {
        return false;
      }
      q++;
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
    // (A line lies inside the text.)
    if (a < 0 || e > src.length) {
      fault();
      return false;
    }
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
    if (i >= e) {
      return false;
    }
    // (Past a match, i + its length <= e fits.)
    if (this.textHas(i, e, "include")) {
      i = toI32(toI64(i) + toI64(7));
    } else if (this.textHas(i, e, "import")) {
      i = toI32(toI64(i) + toI64(6));
    } else {
      return false;
    }
    if (i < 0 || e > src.length) {
      fault();
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
    // (A line lies inside the text.)
    if (a < 0 || e > src.length) {
      fault();
      return "";
    }
    if (e < 2) {
      return "";
    }
    const lim = e - 2;
    for (let i = a; i < lim; i++) {
      const i1 = i + 1;
      const i2 = i + 2;
      if (i >= src.length || i1 >= src.length || i2 >= src.length) {
        fault();
        return "";
      }
      if (toI32(src[i]) !== 82 || toI32(src[i1]) !== 34) {
        continue;
      }
      let j = i2;
      // (e <= src.length)
      while (j < e && j < src.length && isRawDelimByte(toI32(src[j]))) {
        j++;
      }
      if (j < e && j < src.length && toI32(src[j]) === 40) {
        return ")" + bytesText(src, i2, j) + '"';
      }
    }
    return "";
  }

  /** Whether trimmed line [a, e) turns formatting off (`// clang-format off`...). */
  isFormatOff(a: i32, e: i32): boolean {
    const src = this.d.src;
    if (toI64(e) - toI64(a) < toI64(2)) {
      return false;
    }
    if (a < 0 || a >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[a]) !== 47) {
      return false;
    }
    return (
      this.textIs(a, e, "/* clang-format off */") ||
      this.markerAt(a, e, "// clang-format off") ||
      this.textIs(a, e, "/* nishfmt off */") ||
      this.markerAt(a, e, "// nishfmt off")
    );
  }

  /** Whether trimmed line [a, e) turns formatting back on. */
  isFormatOn(a: i32, e: i32): boolean {
    const src = this.d.src;
    if (toI64(e) - toI64(a) < toI64(2)) {
      return false;
    }
    if (a < 0 || a >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[a]) !== 47) {
      return false;
    }
    return (
      this.textIs(a, e, "/* clang-format on */") ||
      this.markerAt(a, e, "// clang-format on") ||
      this.textIs(a, e, "/* nishfmt on */") ||
      this.markerAt(a, e, "// nishfmt on")
    );
  }

  /** Whether [a, e) is `m`, or starts with `m` then `:`. */
  markerAt(a: i32, e: i32, m: string): boolean {
    if (!this.textHas(a, e, m)) {
      return false;
    }
    if (toI64(e) - toI64(a) === toI64(m.length)) {
      return true;
    }
    // (textHas read a + n - 1, so a >= 0 and a + n fits.)
    const src = this.d.src;
    const at = toI64(a) + toI64(m.length);
    if (at < toI64(0) || at >= toI64(src.length)) {
      fault();
      return false;
    }
    const p = toI32(at);
    if (p < 0 || p >= src.length) {
      fault();
      return false;
    }
    return toI32(src[p]) === 58;
  }

  /** Whether [a, e) is exactly `m`. */
  textIs(a: i32, e: i32, m: string): boolean {
    return toI64(e) - toI64(a) === toI64(m.length) && this.textHas(a, e, m);
  }

  /** Whether [a, e) starts with `m`. */
  textStartsWith(a: i32, e: i32, m: string): boolean {
    return this.textHas(a, e, m);
  }

  /** Whether `m` occurs at offset `a` within [a, e). */
  textHas(a: i32, e: i32, m: string): boolean {
    const n = toI32(m.length);
    if (toI64(e) - toI64(a) < toI64(n)) {
      return false;
    }
    const src = this.d.src;
    let p = a;
    for (let i = 0; i < n; i++) {
      if (p < 0 || p >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[p]) !== m.charCodeAt(i)) {
        return false;
      }
      p++;
    }
    return true;
  }

  /** Whether `m` occurs anywhere in [a, e). */
  textContains(a: i32, e: i32, m: string): boolean {
    const n = toI32(m.length);
    if (n <= 0 || m.length <= 0) {
      return true;
    }
    const src = this.d.src;
    // (A line lies inside the text.)
    if (a < 0 || e > src.length) {
      fault();
      return false;
    }
    if (e < 0) {
      return false;
    }
    const c0 = m.charCodeAt(0);
    const last = e - n; // the last start that leaves room for m
    for (let i = a; i <= last && i < src.length; i++) {
      if (toI32(src[i]) === c0 && this.textHas(i, e, m)) {
        return true;
      }
    }
    return false;
  }

  /** The offset of `m` at or after `from`, or -1. */
  findText(m: string, from: i32): i32 {
    const n = this.d.n;
    const last = toI64(n) - toI64(m.length); // the last start that leaves room for m
    for (let i = from; toI64(i) <= last && i < 2147483647; i++) {
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
    const emTok = this.emTok;
    const type = d.type;
    const kind = d.kind;
    const prv = d.prv;
    // (Every entry is stored, and a token entry names a token.)
    if (n > emTok.length) {
      fault();
      return;
    }
    // Is there a chained conditional at all?
    let any = false;
    for (let i = 0; i < n && i < emTok.length; i++) {
      const t = emTok[i];
      if (t >= 0) {
        if (t >= type.length) {
          fault();
          return;
        }
        if (type[t] === TT_CONDITIONAL_EXPR) {
          any = true;
          break;
        }
      }
    }
    if (!any) {
      return;
    }
    // Three levels per entry.
    if (n < 0 || n > 715827882) {
      fault();
      return;
    }
    let lev = this.acLev;
    if (lev.length < n * 3) {
      lev = newI32s(n * 3);
      this.acLev = lev;
    }
    const fkHead = a.fkHead;
    const fkNext = a.fkNext;
    const fkPrec = a.fkPrec;
    const ilev = a.ilev;
    const nest = a.nest;
    const fakeR = a.fakeR;
    // Conditional depth: a conditional that follows another's `:` continues its chain.
    const scope: i32[] = [];
    let cl = 0;
    let prev0 = 0; // the entry before's first two levels
    let prev1 = 0;
    for (let i = 0; i < n && i < emTok.length; i++) {
      const b = i * 3;
      if (b + 2 >= lev.length) {
        fault();
        return;
      }
      const t = emTok[i];
      if (t < 0) {
        lev[b] = prev0;
        lev[b + 1] = prev1;
        lev[b + 2] = cl;
        continue;
      }
      if (t >= fkHead.length || t >= prv.length || t >= ilev.length || t >= nest.length || t >= fakeR.length) {
        fault();
        return;
      }
      const head = fkHead[t];
      const p = prv[t];
      prev0 = ilev[t];
      prev1 = nest[t];
      const rs = fakeR[t];
      lev[b] = prev0;
      lev[b + 1] = prev1;
      // Whether the token follows a conditional's `:`.
      let afterColon = false;
      if (p >= 0) {
        if (p >= type.length || p >= kind.length) {
          fault();
          return;
        }
        afterColon = type[p] === TT_CONDITIONAL_EXPR && kind[p] === P_COLON;
      }
      let first = true;
      for (let k = head; k >= 0; ) {
        if (k >= fkNext.length || k >= fkPrec.length) {
          fault();
          return;
        }
        // Outermost first; the first is the one a chain may continue.
        const nested = fkPrec[k] === PREC_CONDITIONAL && !(first && afterColon);
        k = fkNext[k];
        if (nested) {
          // (At most one per conditional in the file.)
          if (cl >= 2147483647) {
            fault();
            return;
          }
          cl++;
        }
        scope.push(nested ? 1 : 0);
        first = false;
      }
      if (b + 2 >= lev.length) {
        fault();
        return;
      }
      lev[b + 2] = cl;
      for (let r = rs; r > 0 && scope.length > 0; r--) {
        if (scope.pop() === 1) {
          // (cl counts the 1s in scope, this one too.)
          if (cl <= 0) {
            fault();
            return;
          }
          cl--;
        }
      }
    }
    this.acTokens(0);
  }

  /** Compares the level tuples of emitted entries `i` and `j`. */
  acCmp(i: i32, j: i32): i32 {
    const lev = this.acLev;
    // (Both are entries, and acLev holds three levels per entry.)
    if (i < 0 || j < 0 || i > 715827881 || j > 715827881) {
      fault();
      return 0;
    }
    const bi = i * 3;
    const bj = j * 3;
    if (bi + 2 >= lev.length || bj + 2 >= lev.length) {
      fault();
      return 0;
    }
    const x0 = lev[bi];
    const y0 = lev[bj];
    if (x0 !== y0) {
      return x0 < y0 ? -1 : 1;
    }
    const x1 = lev[bi + 1];
    const y1 = lev[bj + 1];
    if (x1 !== y1) {
      return x1 < y1 ? -1 : 1;
    }
    const x2 = lev[bi + 2];
    const y2 = lev[bj + 2];
    if (x2 !== y2) {
      return x2 < y2 ? -1 : 1;
    }
    return 0;
  }

  acMatch(i: i32): boolean {
    const d = this.d;
    const emTok = this.emTok;
    if (i < 0 || i >= emTok.length) {
      fault();
      return false;
    }
    const t = emTok[i];
    if (t < 0) {
      return false;
    }
    const type = d.type;
    const kind = d.kind;
    const nxt = d.nxt;
    if (t >= type.length || t >= kind.length || t >= nxt.length) {
      fault();
      return false;
    }
    if (type[t] !== TT_CONDITIONAL_EXPR) {
      return false;
    }
    if (kind[t] === P_QUESTION) {
      const emNl = this.emNl;
      if (i >= emNl.length) {
        fault();
        return false;
      }
      return emNl[i] === 0;
    }
    const nx = nxt[t];
    if (kind[t] !== P_COLON || nx < 0) {
      return false;
    }
    const fkHead = this.ann.fkHead;
    const fkPrec = this.ann.fkPrec;
    if (nx >= fkHead.length) {
      fault();
      return false;
    }
    const h = fkHead[nx];
    if (h < 0) {
      return true;
    }
    if (h >= fkPrec.length) {
      fault();
      return false;
    }
    return fkPrec[h] !== PREC_CONDITIONAL;
  }

  /** The column just past the last entry on `i`'s output line. */
  acLineEnd(i: i32): i32 {
    const n = this.nem;
    const emNl = this.emNl;
    let j = i;
    while (j >= 0 && j < emNl.length) {
      const j1 = j + 1;
      if (j1 >= n) {
        break;
      }
      if (j1 >= emNl.length) {
        fault();
        return 0;
      }
      if (emNl[j1] !== 0) {
        break;
      }
      j = j1;
    }
    const emCol = this.emCol;
    const emTok = this.emTok;
    if (j < 0 || j >= emCol.length || j >= emTok.length) {
      fault();
      return 0;
    }
    return add32(emCol[j], this.emWidth(emTok[j]));
  }

  /** One level's runs of matches, from entry `start`; answers where it stopped. */
  acTokens(start: i32): i32 {
    const n = this.nem;
    const lim = this.d.opts.columnLimit;
    const kind = this.d.kind;
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
      // (acCmp checked 0 <= i.)
      const emTok = this.emTok;
      const emNl = this.emNl;
      if (i < 0 || i >= emTok.length || i >= emNl.length) {
        fault();
        return n;
      }
      const t = emTok[i];
      const nli = emNl[i];
      if (t >= kind.length) {
        fault();
        return n;
      }
      const tk = t >= 0 ? kind[t] : -1;
      if (nli !== 0) {
        commasBefore = 0;
        seqEnd = i;
        if (nli > 1 || (!found && !lineIsComment) || !found) {
          this.acAlign(seqStart, seqEnd, widthLeft);
          widthLeft = 0;
          widthRight = 0;
          seqStart = -1;
        }
        found = false;
        lineIsComment = true;
      }
      if (t < 0 || tk !== K_COMMENT) {
        lineIsComment = false;
      }
      if (t >= 0 && tk === P_COMMA) {
        if (commasBefore >= 2147483647) {
          fault();
          return n;
        }
        commasBefore++;
      } else if (this.acCmp(i, start) > 0) {
        const next = this.acTokens(i);
        // (A nested level ends past its first entry.)
        if (next <= i) {
          fault();
          return n;
        }
        i = next;
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
      const emCol = this.emCol;
      if (i >= emCol.length) {
        fault();
        return n;
      }
      const left = emCol[i];
      const right = sub32(this.acLineEnd(i), left);
      const nl = left > widthLeft ? left : widthLeft;
      const nr = right > widthRight ? right : widthRight;
      if (toI64(lim) < toI64(nl) + toI64(nr)) {
        if (toI64(nl) + toI64(nr) > toI64(2147483647)) {
          fault();
          return n;
        }
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
    const d = this.d;
    const kind = d.kind;
    const type = d.type;
    const prv = d.prv;
    let found = false;
    let shift = 0;
    let eff = 0; // how far the current output line's tokens have moved
    const scope: i32[] = [];
    for (let i = s; i < e; i++) {
      const sl = toI32(scope.length);
      if (sl > 0 && this.acCmp(i, scope[sl - 1]) < 0 && scope.length > 0) {
        scope.pop();
      }
      const emTok = this.emTok;
      const emNl = this.emNl;
      const emCol = this.emCol;
      // (The sequence lies among the entries.)
      if (i >= emTok.length || i >= emNl.length || i >= emCol.length) {
        fault();
        return;
      }
      let pnc = i - 1;
      while (pnc > s && pnc >= 0 && pnc < emTok.length) {
        const tp = emTok[pnc];
        if (tp < 0) {
          break;
        }
        if (tp >= kind.length) {
          fault();
          return;
        }
        if (kind[tp] !== K_COMMENT) {
          break;
        }
        pnc--;
      }
      if (i !== s && this.acCmp(i, pnc) > 0) {
        scope.push(i);
      }
      const inside = scope.length > 0;
      if (i >= emNl.length || i >= emTok.length || i >= emCol.length) {
        fault();
        return;
      }
      const nli = emNl[i];
      if (nli > 0) {
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
        if (i >= emCol.length) {
          fault();
          return;
        }
        shift = sub32(col, emCol[i]);
        eff = add32(eff, shift);
      } else if (shift !== 0 && inside && nli > 0) {
        const t = emTok[i];
        if (t >= 0) {
          if (t >= type.length || t >= prv.length) {
            fault();
            return;
          }
          const p = prv[t];
          if (p >= type.length) {
            fault();
            return;
          }
          if (type[t] === TT_CONDITIONAL_EXPR || (p >= 0 && type[p] === TT_CONDITIONAL_EXPR)) {
            eff = add32(eff, shift);
          }
        }
      }
      if (i >= emCol.length) {
        fault();
        return;
      }
      emCol[i] = add32(emCol[i], eff);
    }
    // The rest of the last output line, past the sequence, moves with it.
    const n = this.nem;
    const emNl = this.emNl;
    const emCol = this.emCol;
    for (let i = e; eff !== 0 && i < n; i++) {
      if (i < 0 || i >= emNl.length || i >= emCol.length) {
        fault();
        return;
      }
      if (emNl[i] !== 0) {
        break;
      }
      emCol[i] = add32(emCol[i], eff);
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
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    // (Every entry is stored; nothing is emitted from here on.)
    if (n > emTok.length || n > emNl.length || n > emCol.length) {
      fault();
      return;
    }
    let pre = this.emColPre;
    if (pre.length < n) {
      if (n > 2147483583) {
        fault();
        return;
      }
      pre = newI32s(n + 64);
      this.emColPre = pre;
    }
    for (let i = 0; i < n && i < pre.length && i < emCol.length; i++) {
      pre[i] = emCol[i];
    }
    const kind = d.kind;
    const type = d.type;
    const tnl = d.nl;
    const inPP = d.inPP;
    const multi = d.multi;
    const tStart = d.start;
    const tEnd = d.end;
    const width = d.width;
    const tcol = d.col;
    const ppId = d.ppId;
    const ppKind = d.ppKind;
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
      const nli = fwAt0(emNl, i);
      newlines = add32(newlines, nli);
      if (!this.isTrailingAt(i)) {
        prevJoined = false;
        continue;
      }
      const t = fwAt0(emTok, i);
      // The token's columns, when it is one.
      let tk = -1;
      let ty = -1;
      let tn = 0;
      let tp = 0;
      let tm = 0;
      let ts = 0;
      let te = 0;
      let tw = 0;
      let tc = 0;
      let tpp = -1;
      if (t >= 0) {
        if (
          t >= kind.length ||
          t >= type.length ||
          t >= tnl.length ||
          t >= inPP.length ||
          t >= multi.length ||
          t >= tStart.length ||
          t >= tEnd.length ||
          t >= width.length ||
          t >= tcol.length ||
          t >= ppId.length
        ) {
          fault();
          return;
        }
        tk = kind[t];
        ty = type[t];
        tn = tnl[t];
        tp = inPP[t];
        tm = multi[t];
        ts = tStart[t];
        te = tEnd[t];
        tw = width[t];
        tc = tcol[t];
        tpp = ppId[t];
      }
      // A line comment under a directive's trailing line comment, starting at
      // or right of it, continues the directive's line for clang-format (its
      // token source reads on): it goes under that comment.
      let joined = false;
      // (Under a directive comment an earlier pass formatted: where that
      // pass left it.)
      if (
        t >= 0 &&
        i > 0 &&
        this.isFin(i - 1) &&
        nli === 1 &&
        tn === 1 &&
        tk === K_COMMENT &&
        ty === TT_LINE_COMMENT &&
        tp === 0 &&
        !this.verbatimAt(i)
      ) {
        const pt = fwAt0(emTok, i - 1);
        if (
          pt >= 0 &&
          fwAt0(kind, pt) === K_COMMENT &&
          fwAt0(type, pt) === TT_LINE_COMMENT &&
          fwAt0(inPP, pt) === 1 &&
          fwAt0(d.prv, pt) >= 0 &&
          this.origColumn(t) >= this.origColumn(pt) &&
          fwAt0(this.finCol, fwAt0(this.map, pt)) >= 0
        ) {
          joined = true;
          cppfSet(emCol, i, fwAt0(this.finCol, fwAt0(this.map, pt)));
        }
      }
      if (
        !joined &&
        t >= 0 &&
        pi >= 0 &&
        pi === i - 1 &&
        nli === 1 &&
        tn === 1 &&
        tk === K_COMMENT &&
        ty === TT_LINE_COMMENT &&
        tp === 0 &&
        !this.verbatimAt(i)
      ) {
        const pt = fwAt0(emTok, i - 1);
        if (
          pt >= 0 &&
          fwAt0(kind, pt) === K_COMMENT &&
          fwAt0(type, pt) === TT_LINE_COMMENT &&
          (fwAt0(inPP, pt) === 1 || prevJoined) &&
          this.origColumn(t) >= this.origColumn(pt)
        ) {
          joined = true;
          cppfSet(emCol, i, fwAt0(emCol, i - 1));
        }
      }
      prevJoined = joined;
      const cmin = fwAt0(emCol, i);
      let w = 0;
      if (t >= 0) {
        w = tk === K_COMMENT && tm === 0 ? sub32(te, ts) : tw;
      } else {
        w = this.emWidth(t);
      }
      // (An include line's comment is never split.)
      if (i <= secEnd) {
        // A line of a section reflowed below: the section's widest line.
        w = secW;
      } else if (
        t >= 0 &&
        tk === K_COMMENT &&
        ty === TT_LINE_COMMENT &&
        !this.verbatimAt(i) &&
        !(tpp >= 0 && fwAt0(ppKind, tpp) === PP_INCLUDE) &&
        d.opts.reflowComments &&
        i + 1 < n &&
        this.continuesSection(i + 1) &&
        i < this.emTok.length &&
        this.sectionOverflows(i, cmin)
      ) {
        // A section that must reflow: clang-format reflows it where the line
        // formatter put it, and each of its lines takes part.
        w = this.secW;
        secW = w;
        secEnd = this.secEnd;
      } else if (
        t >= 0 &&
        tk === K_COMMENT &&
        ty === TT_LINE_COMMENT &&
        !this.verbatimAt(i) &&
        !(tpp >= 0 && fwAt0(ppKind, tpp) === PP_INCLUDE)
      ) {
        w = this.commentPieceMax(t, cmin);
      } else if (
        t >= 0 &&
        tk === K_COMMENT &&
        ty === TT_BLOCK_COMMENT &&
        tm === 0 &&
        tp === 0 &&
        add32(cmin, tw) > lim &&
        !this.verbatimAt(i)
      ) {
        // A block comment reflowed to fit: its first line counts.
        this.blockCommentPenalty(t, cmin);
        w = this.bcFirstW;
      } else if (t >= 0 && tk === K_COMMENT && ty === TT_BLOCK_COMMENT && tm === 1 && tp === 1 && !this.verbatimAt(i)) {
        // Over several lines of a directive: its first line, without the
        // blanks and the backslash that end it.
        let q = ts;
        while (q < te && d.at(q) !== 10) {
          q++;
        }
        while (
          q > ts &&
          q > 0 &&
          (d.at(q - 1) === 32 || d.at(q - 1) === 9 || d.at(q - 1) === 13 || d.at(q - 1) === 92)
        ) {
          q--;
        }
        w = sub32(q, ts);
      }
      let cmax = cmin;
      if (!this.verbatimAt(i) && lim >= w) {
        cmax = sub32(lim, w);
      }
      // (A comment the directive goes on after, past an escaped newline, or
      // whose own lines are, leaves room for the backslash.)
      if (t >= 0 && tm === 1 && tp === 1 && cmax >= 2 && !this.verbatimAt(i)) {
        cmax = cmax - 2;
      }
      let wasAligned = false;
      if (nli >= 1 && t >= 0) {
        const cc = tc;
        // Nothing after it: the end of the file is the next line.
        const eof = sub32(d.ntok, 1);
        wasAligned =
          fwAt0(kind, eof) === K_EOF && (cc === fwAt0(tcol, eof) || cc === add32(fwAt0(tcol, eof), d.opts.indentWidth));
        for (let j = i + 1; j < n; j++) {
          const tj = fwAt0(emTok, j);
          if (tj >= 0 && fwAt0(kind, tj) === K_COMMENT) {
            continue;
          }
          if (tj < 0 && tj > PIECE) {
            continue;
          }
          const nt = tj <= PIECE ? fwAt0(this.pcTok, sub32(PIECE, tj)) : tj;
          const nc = fwAt0(tcol, nt);
          wasAligned = cc === nc || cc === add32(nc, d.opts.indentWidth);
          break;
        }
      }
      if (pi >= 0 && nli === 0 && this.dontAlignAfter(fwAt0(emTok, pi))) {
        this.alignRun(startSeq, i, minCol);
        minCol = 0;
        maxCol = 1 << 30;
        startSeq = i + 1;
      } else if (
        breakBeforeNext ||
        newlines > 1 ||
        cmin > maxCol ||
        cmax < minCol ||
        (nli === 1 && pi >= 0 && (!this.isTrailingAt(pi) || this.endsInTokenChange(pi))) ||
        wasAligned
      ) {
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
      breakBeforeNext = pi < 0 || nli > 1 || (nli === 1 && startSeq === i);
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
    const t = fwAt0(this.emTok, i);
    if (
      t < 0 ||
      fwAt0(d.kind, t) !== K_COMMENT ||
      fwAt0(d.type, t) !== TT_LINE_COMMENT ||
      this.verbatimAt(i) ||
      !d.opts.reflowComments
    ) {
      return false;
    }
    this.lineGeom(t, fwAt0(this.emCol, i));
    if (sub32(this.gStart, fwAt0(this.emCol, i)) === this.gPre) {
      return false; // the prefix is kept as written
    }
    return add32(this.gStart, this.colsAt(this.gA, this.gE, this.gStart)) <= d.opts.columnLimit;
  }

  /** Token `t`'s column as written, tabs expanded. */
  origColumn(t: i32): i32 {
    const d = this.d;
    const st = fwAt0(d.start, t);
    let ls = st;
    while (ls > 0 && d.at(ls - 1) !== 10) {
      ls--;
    }
    if (ls === 0 && d.n >= 3 && d.at(0) === 0xef && d.at(1) === 0xbb && d.at(2) === 0xbf) {
      ls = 3;
    }
    return this.colsAt(ls, st, 0);
  }

  /** Whether token `t` holds a tab. */
  hasTab(t: i32): boolean {
    const d = this.d;
    const st = fwAt0(d.start, t);
    const en = fwAt0(d.end, t);
    for (let i = st; i < en; i++) {
      if (d.at(i) === 9) {
        return true;
      }
    }
    return false;
  }

  /** Moves the trailing comments of entries [s, e) right to `col`. */
  alignRun(s: i32, e: i32, col: i32): void {
    for (let i = s; i < e; i++) {
      if (this.isTrailingAt(i) && fwAt0(this.emCol, i) < col && !this.isFin(i)) {
        cppfSet(this.emCol, i, col);
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
    if (fwAt0(d.kind, t) === P_SEMI) {
      t = a.prevNonComment(t);
      if (t < 0) {
        return false;
      }
    }
    if (fwAt0(d.kind, t) === P_RPAREN) {
      t = fwAt0(d.match, t);
      if (t < 0) {
        return false;
      }
      t = a.prevNonComment(t);
      if (t < 0) {
        return false;
      }
      if (fwAt0(d.kind, t) === KW_WHILE && fwAt0(d.type, t) === TT_DO_WHILE) {
        const p = a.prevNonComment(t);
        if (p < 0) {
          return true;
        }
        t = p;
      }
    }
    const kind = d.kind;
    const prv = d.prv;
    if (t < 0 || t >= kind.length || t >= prv.length) {
      fault();
      return false;
    }
    if (kind[t] !== P_RBRACE) {
      return false;
    }
    // Back over the `}`s right before it (a token's prv is before it).
    let p = prv[t];
    while (p >= 0) {
      if (p >= kind.length || p >= prv.length) {
        fault();
        return false;
      }
      if (kind[p] !== P_RBRACE) {
        break;
      }
      t = p;
      p = prv[p];
    }
    // Whether that `}` starts a line of the output: on its next run
    // clang-format sees the output, and its result stops changing there.
    const outNl = this.outNl;
    const onl = t >= 0 && t < outNl.length && fwAt0(this.outNlStamp, t) === this.fileStamp ? outNl[t] : fwAt0(d.nl, t);
    return onl > 0;
  }

  /** Records, per emitted token, the newlines before it in the output. */
  markOutputNewlines(): void {
    const d = this.d;
    const stamp = add32(this.fileStamp, 1);
    this.fileStamp = stamp;
    const ntok = d.ntok;
    let outNl = this.outNl;
    let outNlStamp = this.outNlStamp;
    if (outNl.length < ntok) {
      if (ntok > 2147483583) {
        fault();
        return;
      }
      outNl = newI32s(ntok + 64);
      outNlStamp = newI32s(ntok + 64);
      this.outNl = outNl;
      this.outNlStamp = outNlStamp;
    }
    const n = this.nem;
    const emTok = this.emTok;
    const emNl = this.emNl;
    // (Every entry is stored.)
    if (n > emTok.length || n > emNl.length) {
      fault();
      return;
    }
    for (let i = 0; i < n && i < emTok.length && i < emNl.length; i++) {
      const t = emTok[i];
      if (t >= 0) {
        if (t >= outNl.length || t >= outNlStamp.length) {
          fault();
          return;
        }
        outNl[t] = emNl[i];
        outNlStamp[t] = stamp;
      }
    }
  }

  /** Whether entry `i` is a comment that ends its output line. */
  isTrailingAt(i: i32): boolean {
    const emTok = this.emTok;
    if (i < 0 || i >= emTok.length) {
      fault();
      return false;
    }
    const t = emTok[i];
    if (t <= PIECE) {
      return false;
    }
    const kind = this.d.kind;
    if (t >= 0) {
      if (t >= kind.length) {
        fault();
        return false;
      }
      if (kind[t] !== K_COMMENT) {
        return false;
      }
    }
    if (this.untouchedKind(t) === 2) {
      return false;
    }
    const i1 = i + 1;
    if (i1 >= this.nem) {
      return true;
    }
    const emNl = this.emNl;
    const emTok1 = this.emTok;
    if (i1 >= emTok1.length || i1 >= emNl.length) {
      fault();
      return false;
    }
    const nx = emTok1[i1];
    // (A block comment over several lines is trailing by its own line
    // breaks: clang-format re-indents them with changes inside the token.)
    if (emNl[i1] > 0) {
      return true;
    }
    if (nx >= 0 && fwAt0(this.d.kind, nx) === K_EOF) {
      return true;
    }
    return t >= 0 && fwAt0(this.d.multi, t) === 1 && fwAt0(this.d.type, t) === TT_BLOCK_COMMENT && !this.verbatimAt(i);
  }

  /** The column a trailing comment at `i` needs: one past the code before it. */
  minCommentCol(i: i32): i32 {
    if (i <= 0) {
      fault();
      return 0;
    }
    const p = fwAt0(this.emTok, i - 1);
    return add32(add32(fwAt0(this.emCol, i - 1), this.emWidth(p)), 1);
  }

  lastLineWidth(t: i32): i32 {
    const d = this.d;
    const multi = d.multi;
    if (t < 0 || t >= multi.length) {
      fault();
      return 0;
    }
    if (multi[t] === 0) {
      const width = d.width;
      if (t >= width.length) {
        fault();
        return 0;
      }
      return width[t];
    }
    const st = fwAt0(d.start, t);
    const en = fwAt0(d.end, t);
    let a = sub32(en, 1);
    while (a > st && a > 0 && d.at(a) !== 10) {
      a--;
    }
    return widthOf(d.src, add32(a, 1), en);
  }

  // ---- Output -----------------------------------------------------------------

  write(out: Out): void {
    const d = this.d;
    let col = 0;
    this.asmSkew = 0;
    this.alignEscapes();
    const n = this.nem;
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    // (Every entry is stored; writing emits nothing.)
    if (n > emTok.length || n > emNl.length || n > emCol.length) {
      fault();
      return;
    }
    const src = d.src;
    const kind = d.kind;
    const type = d.type;
    const tnl = d.nl;
    const keepWs = d.keepWs;
    const ppId = d.ppId;
    const multi = d.multi;
    const tStart = d.start;
    const tEnd = d.end;
    const width = d.width;
    const lim = d.opts.columnLimit;
    for (let i = 0; i >= 0 && i < n && i < emTok.length && i < emNl.length; i++) {
      const t = emTok[i];
      const nl = emNl[i];
      if (this.rec) {
        this.recordSpan(out, t, nl, i);
      }
      if (nl > 0 && i > 0) {
        const pp = this.entryPP(t);
        if (pp >= 0 && pp === this.entryPP(fwAt0(emTok, i - 1))) {
          const pt = fwAt0(emTok, i - 1);
          if (t >= 0 && pt >= 0 && fwAt0(tEnd, pt) <= fwAt0(tStart, t) && this.verbatimAt(i)) {
            // Left as written, escaped newlines and all.
            fwRange(out, src, fwAt0(tEnd, pt), fwAt0(tEnd, t));
            col = fwAt0(multi, t) === 1 ? this.lastLineWidth(t) : add32(fwAt0(d.col, t), fwAt0(width, t));
            continue;
          }
          // A break inside a directive: each newline is escaped, `\` at the directive's column.
          out.trimSpaces();
          const esc = fwAt0(this.escCol, pp);
          // (Measured from where clang-format takes the token before to end.)
          const pt0 = fwAt0(emTok, i - 1);
          const short = pt0 >= 0 && fwAt0(d.multi, pt0) === 0 ? sub32(this.emWidth(pt0), this.escLen(pt0)) : 0;
          let sp = sub32(sub32(esc, sub32(sub32(col, short), this.asmSkew)), 1);
          const esc1 = sub32(esc, 1);
          for (let k = 0; k < nl; k++) {
            out.spaces(sp < 1 && k === 0 ? 1 : sp);
            out.byte(92);
            out.byte(10);
            sp = esc1;
          }
          col = 0;
          this.asmSkew = 0;
          const c0 = fwAt0(emCol, i);
          if (t <= PIECE && t > RAW && t < 0) {
            const k = -1 - t - 1048575; // PIECE - t
            const pt = fwAt0(this.pcTok, k);
            out.spaces(c0);
            const pl = this.pieceLen(pt);
            const ps = fwAt0(tStart, pt);
            fwRange(out, src, ps, add32(ps, pl));
            fwRange(out, src, fwAt0(this.pcA, k), fwAt0(this.pcB, k));
            out.byte(34);
            col = add32(c0, this.pieceWidth(k));
            continue;
          }
          out.spaces(c0);
          col = c0;
          // (A block comment over the limit is reflowed there too.)
          if (
            t >= 0 &&
            fwAt0(kind, t) === K_COMMENT &&
            fwAt0(type, t) !== TT_LINE_COMMENT &&
            (fwAt0(multi, t) === 1 || add32(c0, fwAt0(width, t)) > sub32(lim, 2)) &&
            !this.verbatimAt(i)
          ) {
            col = this.writeComment(out, t, col, i);
            continue;
          }
          fwRange(out, src, fwAt0(tStart, t), fwAt0(tEnd, t));
          col = add32(col, fwAt0(multi, t) === 1 ? sub32(this.lastLineWidth(t), col) : fwAt0(width, t));
          continue;
        }
      }
      if (t <= RAW && t < 0) {
        const k = -1 - t - 2097151; // RAW - t
        const ra = fwAt0(this.rawA, k);
        const rb = fwAt0(this.rawB, k);
        fwRange(out, src, ra, rb);
        // Raw bytes spanning lines end at their last line's width.
        let multiLine = false;
        for (let q = ra; q < rb; q++) {
          if (d.at(q) === 10) {
            multiLine = true;
            break;
          }
        }
        col = multiLine ? this.emWidth(t) : add32(col, this.emWidth(t));
        continue;
      }
      if (t <= PIECE && t < 0) {
        const k = -1 - t - 1048575; // PIECE - t
        const pt = fwAt0(this.pcTok, k);
        if (nl > 0) {
          out.trimSpaces();
          out.newlines(nl);
          col = 0;
        }
        const pc = fwAt0(emCol, i);
        if (pc > col) {
          out.spaces(sub32(pc, col));
          col = pc;
        }
        const pl = this.pieceLen(pt);
        const ps = fwAt0(tStart, pt);
        fwRange(out, src, ps, add32(ps, pl));
        fwRange(out, src, fwAt0(this.pcA, k), fwAt0(this.pcB, k));
        out.byte(34);
        col = add32(col, this.pieceWidth(k));
        continue;
      }
      if (t < 0) {
        const synth = this.synth;
        const si = -1 - t;
        if (si >= synth.length) {
          fault();
          return;
        }
        const txt = synth[si];
        const c0 = fwAt0(emCol, i);
        if (c0 > col) {
          out.spaces(sub32(c0, col));
          col = c0;
        }
        out.str(txt);
        col = add32(col, toI32(txt.length));
        continue;
      }
      // A token: its columns, before any call.
      if (
        t >= kind.length ||
        t >= keepWs.length ||
        t >= tStart.length ||
        t >= tEnd.length ||
        t >= multi.length ||
        t >= width.length ||
        t >= type.length ||
        t >= tnl.length ||
        t >= ppId.length
      ) {
        fault();
        return;
      }
      const tk = kind[t];
      if (tk === K_EOF) {
        break;
      }
      const ts = tStart[t];
      const te = tEnd[t];
      const tm = multi[t];
      const tw = width[t];
      const ty = type[t];
      const tn = tnl[t];
      const tpp = ppId[t];
      const unt = keepWs[t] === 1 ? 3 : this.untouchedKind(t);
      const ws0 = unt > 0 ? this.wsStart(t) : -1;
      if (ws0 >= 0 && (nl === 0 || unt === 3 || (unt === 1 && this.hasOff && fwAt0(this.offTok, t) === 1))) {
        // Whitespace clang-format does not touch: as written.
        fwRange(out, src, ws0, ts);
        for (let k = ws0; k < ts; k++) {
          col = d.at(k) === 10 ? 0 : add32(col, 1);
        }
        fwRange(out, src, ts, te);
        col = tm === 1 ? this.lastLineWidth(t) : add32(col, tw);
        // After a newline before an implicit string literal clang-format's
        // column is the 1-based spelling column, one past the written one,
        // and what follows is placed by spaces from there.
        if (unt === 2 && d.anyImplicit && tn > 0 && ty === TT_IMPLICIT_STRING_LITERAL) {
          col = add32(col, 1);
        }
        continue;
      }
      if (nl > 0) {
        out.trimSpaces();
        out.newlines(nl);
        col = 0;
        this.asmSkew = 0;
      }
      let c = add32(fwAt0(emCol, i), this.asmSkew);
      if (d.anyAsm && nl === 0 && t > 0 && fwAt0(d.prv, t) >= 0 && fwAt0(d.asmFin, fwAt0(d.prv, t)) === 1) {
        // After inline assembly's text (columns as written): its own space,
        // and what follows keeps its distance.
        if (fwAt0(d.ws, t) === 1) {
          out.spaces(1);
          col = add32(col, 1);
        }
        this.asmSkew = sub32(col, fwAt0(emCol, i));
        c = col;
      } else if (c > col) {
        out.spaces(sub32(c, col));
        col = c;
      }
      // clang-format never breaks or reflows an include line's comment.
      const inInclude = tpp >= 0 && fwAt0(d.ppKind, tpp) === PP_INCLUDE;
      // (A line comment a backslash spliced over lines is written as it is:
      // clang-format's multiline token.)
      if (tk === K_COMMENT && ty === TT_LINE_COMMENT && !this.verbatimAt(i) && !inInclude && tm === 0) {
        const last = this.writeSection(out, i, col);
        // (The section's last entry: at or after i, before n.)
        if (last < i || last >= n) {
          fault();
          return;
        }
        i = last;
        col = this.wsCol;
      } else if (tk === K_COMMENT && !this.verbatimAt(i)) {
        const o0 = out.n;
        col = this.writeComment(out, t, col, i);
        // Broken over lines: the tokens after it on its line follow its end.
        if (tm === 0 && i + 1 < n && fwAt0(emNl, i + 1) === 0) {
          let broke = false;
          const buf = out.buf;
          const on = out.n;
          for (let q = o0; q >= 0 && q < on && q < buf.length; q++) {
            if (buf[q] === 10) {
              broke = true;
              break;
            }
          }
          const nt = fwAt0(emTok, i + 1);
          if (broke && nt >= 0) {
            const delta = sub32(add32(col, fwAt0(d.spaces, nt)), fwAt0(emCol, i + 1));
            for (let j = i + 1; j < n && (j === i + 1 || fwAt0(emNl, j) === 0); j++) {
              cppfSet(emCol, j, add32(fwAt0(emCol, j), delta));
            }
          }
        }
      } else if (tm === 1) {
        fwRange(out, src, ts, te);
        col = this.lastLineWidth(t);
      } else {
        fwRange(out, src, ts, te);
        col = add32(col, tw);
        // A string holding a tab is as wide as where it lands, which the
        // layout may have measured differently: clang-format writes the
        // spaces the next token needs, whatever the columns say.
        if (tk === K_STRING && i + 1 < n && fwAt0(emNl, i + 1) === 0 && this.hasTab(t)) {
          const nt = fwAt0(emTok, i + 1);
          if (nt >= 0 && fwAt0(kind, nt) !== K_COMMENT) {
            col = sub32(fwAt0(emCol, i + 1), fwAt0(d.spaces, nt));
          }
        }
      }
    }
    out.trimSpaces();
    if (this.rec && this.recCur >= 0) {
      cppfSet(this.uE, fwAt0(this.map, this.recCur), out.n);
    }
    // End with one newline when the source did.
    const dn = d.n;
    if (dn > 0 && d.at(dn - 1) === 10) {
      out.byte(10);
    }
  }

  /**
   * Where each directive's escaped newlines go: at the column limit, or two
   * past its longest broken line when one is longer.
   */
  alignEscapes(): void {
    const d = this.d;
    const nt1 = add32(d.ntok, 1);
    if (toI32(this.escCol.length) < nt1) {
      this.escCol = growI32(this.escCol, nt1);
      this.escStamp = growI32(this.escStamp, nt1);
    }
    this.fileStamp = add32(this.fileStamp, 1);
    const n = this.nem;
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    // (Every entry is stored.)
    if (n > emTok.length || n > emNl.length) {
      fault();
      return;
    }
    for (let i = 1; i < n && i < emNl.length && i < emTok.length; i++) {
      if (emNl[i] === 0) {
        continue;
      }
      const t = emTok[i];
      const p = emTok[i - 1];
      const pp = this.entryPP(t);
      if (pp < 0 || pp !== this.entryPP(p)) {
        continue;
      }
      // A newline kept as written (a line with no layout, inline assembly)
      // is no line break of clang-format's: it moves no escapes.
      if (t >= 0 && (fwAt0(d.keepWs, t) === 1 || this.untouchedKind(t) === 3)) {
        continue;
      }
      const escStamp = this.escStamp;
      const escCol = this.escCol;
      if (pp >= escStamp.length || pp >= escCol.length) {
        fault();
        return;
      }
      if (escStamp[pp] !== this.fileStamp) {
        escStamp[pp] = this.fileStamp;
        escCol[pp] = d.opts.columnLimit;
      }
      let end = add32(add32(fwAt0(emCol, i - 1), this.escLen(p)), 2);
      if (p >= 0 && fwAt0(d.multi, p) === 1) {
        // A token over several lines ends on its last: a raw string where
        // it was, a block comment's lines moved with it.
        end = add32(
          add32(this.lastLineWidth(p), 2),
          fwAt0(d.kind, p) === K_COMMENT ? sub32(fwAt0(emCol, i - 1), fwAt0(d.col, p)) : 0,
        );
      }
      if (end > fwAt0(this.escCol, pp)) {
        cppfSet(this.escCol, pp, end);
      }
    }
  }

  /**
   * How far past its start clang-format takes token `t` to end where it
   * lines up escaped newlines: WhitespaceManager's TokenLength, the token's
   * bytes in the source or its width, whichever is less, so that a tab
   * counts one column.
   */
  escLen(t: i32): i32 {
    const d = this.d;
    const w = this.emWidth(t);
    if (t < 0 || fwAt0(d.plain, t) === 1) {
      return w;
    }
    const bytes = sub32(fwAt0(d.end, t), fwAt0(d.start, t));
    return bytes < w ? bytes : w;
  }

  /**
   * Whether pass token `t` is finalized in clang-format: an earlier #if pass
   * formatted it (markFinalized skips a conditional directive's `#`, which
   * each pass formats again).
   */
  finalizedTok(t: i32): boolean {
    const d = this.d;
    if (fwAt0(d.kind, t) === P_HASH) {
      const pk = fwAt0(d.ppKind, t);
      if (pk === PP_IF || pk === PP_ELIF || pk === PP_ELSE || pk === PP_ENDIF) {
        return false;
      }
    }
    return this.seenTok(t);
  }

  /** Whether pass token `t` was seen by an earlier #if pass. */
  seenTok(t: i32): boolean {
    return this.rec && this.curPass > 0 && t >= 0 && fwAt0(this.seenBefore, fwAt0(this.map, t)) === 1;
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
    let t = fwAt0(this.emTok, i);
    if (t <= RAW) {
      return false;
    }
    if (t <= PIECE && t < 0) {
      t = fwAt0(this.pcTok, -1 - t - 1048575); // PIECE - t
    } else if (t < 0) {
      return false;
    }
    return this.finalizedTok(t);
  }

  /** Whether emitted entry `i` lies in a `clang-format off` region. */
  verbatimAt(i: i32): boolean {
    const t = fwAt0(this.emTok, i);
    if (this.untouchedKind(t) > 0 || (t >= 0 && fwAt0(this.d.keepWs, t) === 1)) {
      return true;
    }
    if (!this.hasOff) {
      return false;
    }
    return t >= 0 && fwAt0(this.offTok, t) === 1;
  }

  /** Writes comment `t` at column `col`, reflowing a line comment that overflows. */
  writeComment(out: Out, t: i32, col: i32, i: i32): i32 {
    const d = this.d;
    const type = d.type;
    const inPP = d.inPP;
    const multi = d.multi;
    const width = d.width;
    const ppId = d.ppId;
    const tStart = d.start;
    const tEnd = d.end;
    const tcol = d.col;
    if (
      t < 0 ||
      t >= type.length ||
      t >= inPP.length ||
      t >= multi.length ||
      t >= width.length ||
      t >= ppId.length ||
      t >= tStart.length ||
      t >= tEnd.length ||
      t >= tcol.length
    ) {
      fault();
      return col;
    }
    const ty = type[t];
    const tp = inPP[t];
    const tm = multi[t];
    const tw = width[t];
    const tpp = ppId[t];
    const ts = tStart[t];
    const te = tEnd[t];
    const tc = tcol[t];
    const src = d.src;
    const lim = d.opts.columnLimit;
    if (ty !== TT_LINE_COMMENT) {
      if (
        d.opts.reflowComments &&
        tp === 0 &&
        !this.switchesFormatting(t) &&
        (tm === 1 || add32(add32(col, tw), this.unbreakableTail(t)) > lim)
      ) {
        const pre0 = i >= 0 && i < this.nem ? fwAt0(this.emColPre, i) : col;
        if (pre0 < col) {
          // Reflowed where the line formatter put it; trailing comment
          // alignment then shifts every line alike, as clang-format does.
          const o = this.bcShift;
          o.n = 0;
          const r = this.writeBlockComment(o, t, pre0);
          const sh = sub32(col, pre0);
          const ob = o.buf;
          const on = o.n;
          for (let q = 0; q < on && q < ob.length; q++) {
            const b = ob[q];
            out.byte(toI32(b));
            if (b === 10 && q + 1 < on && q + 1 < ob.length && ob[q + 1] !== 10) {
              out.spaces(sh);
            }
          }
          return add32(r, sh);
        }
        return this.writeBlockComment(out, t, col);
      }
      // Several lines inside a directive: each line break is escaped at the
      // directive's column, as for code (clang-format drops the `\` first).
      const pp = this.entryPP(t);
      // (A single line is reflowed where it was placed, before trailing
      // comments were aligned; an include's comment never breaks.)
      const inInclude = tpp >= 0 && fwAt0(d.ppKind, tpp) === PP_INCLUDE;
      const pre = i >= 0 && i < this.nem ? fwAt0(this.emColPre, i) : col;
      if (
        d.opts.reflowComments &&
        tp === 1 &&
        !inInclude &&
        (tm === 1 || add32(add32(pre, tw), this.unbreakableTail(t)) > sub32(lim, 2)) &&
        pp >= 0 &&
        !this.switchesFormatting(t)
      ) {
        this.bcEsc = fwAt0(this.escStamp, pp) === this.fileStamp ? fwAt0(this.escCol, pp) : lim;
        this.bcPP = true;
        const r = this.writeBlockComment(out, t, col);
        this.bcEsc = -1;
        this.bcPP = false;
        return r;
      }
      if (tm === 0) {
        fwRange(out, src, ts, te);
        // (A tab inside it is as wide as where the comment now starts.)
        return add32(col, this.colsAt(ts, te, col));
      }
      // Re-indent continuation lines by the distance the comment moved.
      const delta = sub32(col, tc);
      let a = ts;
      let j = a;
      while (j < te) {
        if (d.at(j) === 10) {
          fwRange(out, src, a, j);
          out.trimSpaces();
          out.byte(10);
          const k0 = j + 1;
          let k = k0;
          while (k < te && (d.at(k) === 32 || d.at(k) === 9)) {
            k++;
          }
          const nw = add32(sub32(k, k0), delta);
          out.spaces(nw < 0 ? 0 : nw);
          a = k;
          j = k; // (past the indent: k > j)
          continue;
        }
        j++;
      }
      fwRange(out, src, a, te);
      return this.lastLineWidth(t);
    }
    fwRange(out, src, ts, te);
    return add32(col, tw);
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
    const lim = sub32(d.opts.columnLimit, this.bcPP ? 2 : 0);
    this.bcTail = this.unbreakableTail(t);
    const tStart = fwAt0(d.start, t);
    const s0 = add32(tStart, 2);
    const s1 = sub32(fwAt0(d.end, t), 2);
    // Lines[i] = [la, le); Content[i] = [ca, ce); ContentColumn[i] = cc.
    let nL = 1;
    for (let q = s0; q < s1; q++) {
      if (d.at(q) === 10) {
        nL = add32(nL, 1);
      }
    }
    if (toI32(this.bcLa.length) < nL) {
      const cap = add32(nL, 8);
      this.bcLa = newI32s(cap);
      this.bcLe = newI32s(cap);
      this.bcCa = newI32s(cap);
      this.bcCe = newI32s(cap);
      this.bcCc = newI32s(cap);
    }
    const la = this.bcLa;
    const le = this.bcLe;
    const ca = this.bcCa;
    const ce = this.bcCe;
    const cc = this.bcCc;
    // (The five hold nL lines.)
    if (
      la.length < 1 ||
      nL < 1 ||
      nL > la.length ||
      nL > le.length ||
      nL > ca.length ||
      nL > ce.length ||
      nL > cc.length
    ) {
      fault();
      return col;
    }
    let k = 0;
    la[0] = s0;
    for (let q = s0; q < s1; q++) {
      if (d.at(q) === 10) {
        // (One line per newline: k + 1 < nL.)
        if (k < 0 || k >= le.length) {
          fault();
          return col;
        }
        le[k] = q;
        const k1 = k + 1;
        if (k1 >= la.length) {
          fault();
          return col;
        }
        la[k1] = q + 1;
        k = k1;
      }
    }
    cppfSet(le, k, s1);
    // The column the comment was written at, tabs expanded.
    let ls = tStart;
    while (ls > 0 && d.at(ls - 1) !== 10) {
      ls--;
    }
    // (A byte order mark before it takes no column.)
    if (ls === 0 && d.n >= 3 && d.at(0) === 0xef && d.at(1) === 0xbb && d.at(2) === 0xbf) {
      ls = 3;
    }
    const origCol = this.colsAt(ls, tStart, 0);
    const delta = sub32(col, origCol);
    if (la.length < 1 || le.length < 1 || ca.length < 1 || ce.length < 1 || cc.length < 1) {
      fault();
      return col;
    }
    ca[0] = la[0];
    ce[0] = le[0];
    cc[0] = add32(col, 2);
    for (let i = 1; i < nL; i++) {
      // adjustWhitespace: trim the previous line's end, skip this one's indent
      // (and a directive's `\` before it).
      const lap = fwAt0(la, i - 1);
      let lnb = sub32(fwAt0(le, i - 1), 1);
      if (this.bcPP && lnb >= lap && d.at(lnb) === 92) {
        lnb = sub32(lnb, 1);
      }
      // (Lines start past the comment's `/*`: lap > 0.)
      while (lnb >= lap && lnb > 0 && isBlankByte(d.at(lnb))) {
        lnb--;
      }
      const endPrev = lnb >= lap ? add32(lnb, 1) : lap;
      const cap = fwAt0(ca, i - 1);
      cppfSet(ce, i - 1, endPrev > cap ? endPrev : cap);
      const lai = fwAt0(la, i);
      const lei = fwAt0(le, i);
      let sol = lai;
      while (sol < lei && isBlankByte(d.at(sol))) {
        sol++;
      }
      cppfSet(ca, i, sol);
      cppfSet(ce, i, lei);
      cppfSet(cc, i, add32(this.colsAt(lai, sol, 0), delta));
    }
    let decoCol = add32(col, 1);
    if (nL >= 2) {
      const ca1 = fwAt0(ca, 1);
      if (sub32(fwAt0(ce, 1), ca1) >= 2 && d.at(ca1) === 42 && d.at(add32(ca1, 1)) === 42 && fwAt0(cc, 1) === col) {
        decoCol = col;
      }
    }
    // The decoration: a prefix of "* " every middle line starts with.
    let deco = 2;
    const firstInLine = fwAt0(d.prv, t) < 0 || this.lineFirstAt(t);
    if (nL === 1 && !firstInLine) {
      deco = 0;
    }
    for (let i = 1; i < nL && deco > 0; i++) {
      const cai = fwAt0(ca, i);
      const cei = fwAt0(ce, i);
      const len = sub32(cei, cai);
      if (i + 1 === nL) {
        if (len === 0) {
          break;
        }
      } else if (len > 0 && this.decoStartsWith(deco, cai, cei)) {
        continue;
      }
      while (deco > 0 && !this.textStartsWithDeco(cai, cei, deco)) {
        deco--;
      }
    }
    let indentAtBreak = add32(fwAt0(cc, 0), 1);
    // An empty last line puts the closing star under the decoration; a last
    // line that held only decoration still writes it.
    let lastNeedsDeco = true;
    for (let i = 1; i < nL; i++) {
      const cai = fwAt0(ca, i);
      const cei = fwAt0(ce, i);
      if (cei === cai) {
        if (i + 1 === nL) {
          lastNeedsDeco = false;
          if (nL >= 2 && deco > 0) {
            cppfSet(cc, i, decoCol);
          }
        } else if (deco === 0) {
          cppfSet(cc, i, 0);
        }
        continue;
      }
      const decoSize = this.decoStartsWith(deco, cai, cei) ? sub32(cei, cai) : deco;
      if (decoSize > 0) {
        cppfSet(cc, i, add32(decoCol, decoSize));
      }
      const cai2 = add32(cai, decoSize);
      cppfSet(ca, i, cai2);
      if (!this.decoStartsWith(deco, cai2, cei)) {
        const cci = fwAt0(cc, i);
        const c0 = cci < 0 ? 0 : cci;
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
    const src = d.src;
    const outStart = out.n;
    out.byte(47);
    out.byte(42);
    let seg = fwAt0(ca, 0);
    let off = 0;
    const cc0 = fwAt0(cc, 0);
    let csc = cc0 < 0 ? 0 : cc0;
    let rem = this.bcRemaining(0, off, csc);
    let reflowing = false;
    for (let i = 0; i < nL; i++) {
      let newBreak = false;
      let tryReflow = reflowing;
      const a = fwAt0(ca, i);
      const e = fwAt0(ce, i);
      while (add32(csc, rem) > lim) {
        // (After a fault the values are no guide: stop.)
        if (faulted()) {
          return col;
        }
        this.splitDecoStar = deco === 1;
        const ok = this.commentSplit(add32(a, off), e, csc, lim);
        if (!ok) {
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const at = add32(a, off);
        const atA = add32(at, sA);
        const toSplit = this.colsAt(at, atA, csc);
        let toNext = 0;
        const after = add32(atA, sN);
        if (!this.commentSplit(after, e, add32(add32(csc, toSplit), 1), lim)) {
          toNext = this.bcRemaining(i, off, csc);
        } else {
          toNext = this.colsAt(at, add32(after, this.scSplitA), csc);
        }
        toNext = sub32(add32(toNext, 1), sN);
        if (add32(csc, toNext) <= lim) {
          // Compress the blanks to one space and keep going on this line.
          tryReflow = true;
          fwRange(out, src, seg, atA);
          out.byte(32);
          seg = after;
          csc = add32(add32(csc, toSplit), 1);
          off = add32(add32(off, sA), sN);
          rem = this.bcRemaining(i, off, csc);
          continue;
        }
        const ncsc = indentAtBreak;
        const nrem = this.bcRemaining(i, add32(add32(off, sA), sN), ncsc);
        if (nrem >= rem) {
          break;
        }
        // insertBreak
        this.bcBreaks = add32(this.bcBreaks, 1);
        fwRange(out, src, seg, atA);
        this.bcNewline(out);
        let ind = indentAtBreak;
        let prefix = deco;
        if (i + 1 === nL && sub32(e, at) === add32(sA, sN)) {
          prefix = 0;
          if (ind >= 2) {
            ind = ind - 2;
          }
        }
        out.spaces(sub32(ind, prefix));
        this.bcPrefix(out, prefix);
        seg = after;
        off = add32(add32(off, sA), sN);
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
          const csc2 = add32(add32(csc, rem), 1);
          const na = fwAt0(ca, i + 1);
          const ne = fwAt0(ce, i + 1);
          if (this.bcMayReflow(i + 1)) {
            let lead = na;
            while (lead < ne && isBlankByte(d.at(lead))) {
              lead++;
            }
            const off2 = lead < ne ? sub32(lead, na) : 0;
            const rem2 = this.bcRemaining(i + 1, off2, csc2);
            reflowing = true;
            if (add32(csc2, rem2) > lim) {
              this.splitDecoStar = deco === 1;
              const at2 = add32(na, off2);
              if (!this.commentSplit(at2, ne, csc2, lim)) {
                reflowing = false;
              } else if (add32(csc2, this.colsAt(at2, add32(at2, this.scSplitA), csc2)) > lim) {
                reflowing = false;
              }
            }
            if (reflowing) {
              // clang-format takes back the new break's penalty: the line
              // break before the next line goes instead.
              if (newBreak) {
                this.bcBreaks = sub32(this.bcBreaks, 1);
              }
              fwRange(out, src, seg, e);
              out.byte(32);
              seg = add32(na, off2);
              off = off2;
              csc = csc2;
              rem = rem2;
            }
          }
        }
        if (!reflowing) {
          // adaptStartOfLine
          fwRange(out, src, seg, e);
          this.bcNewline(out);
          const j = i + 1;
          const caj = fwAt0(ca, j);
          const ccj = fwAt0(cc, j);
          let prefix = deco;
          if (fwAt0(ce, j) === caj) {
            if (j === nL - 1) {
              if (!lastNeedsDeco) {
                prefix = 0;
              }
            } else if (deco > 0) {
              prefix = 1;
            }
          } else if (ccj === 1) {
            prefix = prefix > 1 ? 1 : prefix;
          }
          const sp = sub32(ccj, prefix);
          out.spaces(sp < 0 ? 0 : sp);
          this.bcPrefix(out, prefix);
          seg = caj;
          off = 0;
          csc = ccj < 0 ? 0 : ccj;
          rem = this.bcRemaining(j, 0, csc);
        }
      } else {
        fwRange(out, src, seg, e);
        out.byte(42);
        out.byte(47);
      }
    }
    this.splitDecoStar = false;
    // The column after the comment: its last output line's width.
    const buf = out.buf;
    const on = out.n;
    let q = on;
    while (q > outStart && q > 0 && q <= buf.length && buf[q - 1] !== 10) {
      q--;
    }
    if (q === outStart) {
      return add32(col, widthOf(buf, outStart, on));
    }
    return widthOf(buf, q, on);
  }

  /** A line break inside a block comment; inside a directive, escaped at its column. */
  bcNewline(out: Out): void {
    out.trimSpaces();
    if (this.bcEsc >= 0) {
      const buf = out.buf;
      const on = out.n;
      let q = on;
      while (q > 0 && q <= buf.length && buf[q - 1] !== 10) {
        q--;
      }
      const w = widthOf(buf, q, on);
      const sp = sub32(sub32(this.bcEsc, 1), w);
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
    const len = sub32(e, a);
    if (len > n) {
      return false;
    }
    for (let p = a; p < e; p++) {
      if (this.d.at(p) !== (p === a ? 42 : 32)) {
        return false;
      }
    }
    return true;
  }

  /** Whether the text [a, e) starts with the first `n` bytes of "* ". */
  textStartsWithDeco(a: i32, e: i32, n: i32): boolean {
    if (toI64(e) - toI64(a) < toI64(n)) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (this.d.at(add32(a, i)) !== (i === 0 ? 42 : 32)) {
        return false;
      }
    }
    return true;
  }

  /** getRemainingLength: the columns of content line `i` from `off`, with the closing delimiter on the last. */
  bcRemaining(i: i32, off: i32, startCol: i32): i32 {
    const a = add32(fwAt0(this.bcCa, i), off);
    const e = fwAt0(this.bcCe, i);
    // (clang-format counts the unbreakable tail on every line.)
    let len = add32(a < e ? this.colsAt(a, e, startCol) : 0, this.bcTail);
    if (i === this.bcLast) {
      len = add32(len, 2);
      if (a >= e) {
        // Only `*/` remains: no decoration needed before it.
        const lei = fwAt0(this.bcLe, i);
        let q = fwAt0(this.bcLa, i);
        while (q < lei && isBlankByte(this.d.at(q))) {
          q++;
        }
        if (this.textStartsWithDeco(q, lei, this.bcDeco)) {
          len = sub32(len, this.bcDeco);
        }
      }
    }
    return len;
  }

  /** The line whose token chain holds `t`, or -1. */
  lineOfTok(t: i32): i32 {
    const d = this.d;
    if (t < 0 || t >= d.ntok) {
      if (t < 0 || t >= d.prv.length) {
        fault();
      }
      return -1;
    }
    // The map is rebuilt once an annotation stamp: walking `prv` back to the
    // chain's head on each call made a long line quadratic, since the line
    // breaker asks once a state.
    if (this.tlStamp !== this.ann.stamp) {
      this.tlStamp = this.ann.stamp;
      const nt1 = add32(d.ntok, 1);
      if (toI32(this.tlHead.length) < nt1) {
        this.tlHead = newI32s(nt1);
      }
      if (toI32(this.tlLine.length) < nt1) {
        this.tlLine = newI32s(nt1);
      }
      const tlHead = this.tlHead;
      const tlLine = this.tlLine;
      tlHead.fill(-1);
      const lFirst = d.lFirst;
      const prv = d.prv;
      const nline = d.nline;
      const ntok = d.ntok;
      for (let l = 0; l < nline; l++) {
        if (l >= lFirst.length) {
          fault();
          return -1;
        }
        const h = lFirst[l];
        // (tlHead holds ntok + 1.)
        if (h >= 0 && h < ntok && h < tlHead.length && tlHead[h] < 0) {
          tlHead[h] = l;
        }
      }
      // The head of each token's chain, in one pass: a token's prv is before
      // it, so the head of prv's chain is already known.
      for (let q = 0; q < ntok && q < tlLine.length && q < prv.length; q++) {
        const p = prv[q];
        if (p < 0) {
          tlLine[q] = q;
        } else if (p < q) {
          tlLine[q] = tlLine[p];
        } else {
          fault();
          return -1;
        }
      }
      for (let q = 0; q < ntok && q < tlLine.length; q++) {
        tlLine[q] = fwAt0(tlHead, tlLine[q]);
      }
    }
    return fwAt0(this.tlLine, t);
  }

  /**
   * clang-format's UnbreakableTailLength: the width of the tokens after `t`
   * on its line up to the first one a break may go before.
   */
  unbreakableTail(t: i32): i32 {
    const d = this.d;
    const a = this.ann;
    // clang-format computes every line's CanBreakBefore; here only the line
    // breaker's lines have them, so annotate this token's line in full first
    // (a line that fits, a directive, would otherwise show stale flags).
    // annotateFull's tailsAndLists leaves each token's tail in `tail`, which
    // the line breaker asks for once a state; walking the line each time
    // made a long table line quadratic.
    const l = this.lineOfTok(t);
    if (l >= 0) {
      a.annotateFull(l);
      if (t >= 0 && t < a.tail.length) {
        return a.tail[t];
      }
    }
    const nxt = d.nxt;
    const canB = a.canB;
    const kind = d.kind;
    const spaces = d.spaces;
    const width = d.width;
    let s = 0;
    // (A token's nxt is after it.)
    let q = fwAt0(nxt, t);
    while (q >= 0) {
      if (q >= canB.length || q >= kind.length || q >= spaces.length || q >= width.length || q >= nxt.length) {
        fault();
        return s;
      }
      const k = kind[q];
      if (canB[q] === 1 || k === K_COMMENT || k === K_STRING) {
        break;
      }
      s = add32(add32(s, spaces[q]), width[q]);
      q = nxt[q];
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
    const lei = fwAt0(this.bcLe, i);
    let q = fwAt0(this.bcLa, i);
    while (q < lei && isBlankByte(d.at(q))) {
      q++;
    }
    if (q < lei && d.at(q) === 42) {
      q++;
    }
    if (sub32(lei, q) > 13 && this.textAt(q, " IWYU pragma:")) {
      return false;
    }
    return this.mayReflowContent(fwAt0(this.bcCa, i), fwAt0(this.bcCe, i));
  }

  /** Whether `t` is the first token of an emitted line (no code before it on its line). */
  lineFirstAt(t: i32): boolean {
    const d = this.d;
    const lFirst = d.lFirst;
    const nline = d.nline;
    for (let l = 0; l < nline; l++) {
      if (l >= lFirst.length) {
        fault();
        return false;
      }
      if (lFirst[l] === t) {
        return true;
      }
    }
    return false;
  }

  // ---- Line comment sections ----------------------------------------------

  /** Whether entry `j` continues the line comment section entry `j - 1` belongs to. */
  continuesSection(j: i32): boolean {
    const d = this.d;
    // (An entry after the first.)
    if (j <= 0) {
      fault();
      return false;
    }
    const emTok = this.emTok;
    const emNl = this.emNl;
    const emCol = this.emCol;
    const kind = d.kind;
    const type = d.type;
    const prv = d.prv;
    const t = fwAt0(emTok, j);
    const p = fwAt0(emTok, j - 1);
    if (
      t < 0 ||
      p < 0 ||
      fwAt0(kind, t) !== K_COMMENT ||
      fwAt0(type, t) !== TT_LINE_COMMENT ||
      fwAt0(kind, p) !== K_COMMENT ||
      fwAt0(type, p) !== TT_LINE_COMMENT
    ) {
      return false;
    }
    if (
      fwAt0(emNl, j) !== 1 ||
      fwAt0(d.nl, t) !== 1 ||
      fwAt0(emCol, j) !== fwAt0(emCol, j - 1) ||
      this.verbatimAt(j) ||
      fwAt0(d.multi, t) === 1
    ) {
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
    if (fwAt0(emNl, j - 1) > 0 && this.origColumn(t) < this.origColumn(p)) {
      return false;
    }
    // (The run within this line, by its token links; a token's prv is
    // before it.)
    let before = fwAt0(prv, p);
    while (before >= 0) {
      if (before >= kind.length || before >= type.length || before >= prv.length) {
        fault();
        return false;
      }
      if (kind[before] !== K_COMMENT || type[before] !== TT_LINE_COMMENT) {
        break;
      }
      before = prv[before];
    }
    if (before >= 0 && fwAt0(kind, before) === P_LBRACE && this.origColumn(t) < add32(this.origColumn(before), 1)) {
      return false;
    }
    // A section trailing code takes only the comments the parser put on its
    // line (BreakableLineCommentSection reads its own unwrapped line): one
    // that starts a line of its own is another section.
    if (before >= 0 && fwAt0(prv, t) < 0) {
      return false;
    }
    return !this.isPragma(t) && !this.isPragma(p);
  }

  /** `// clang-format on|off`, `// nishfmt on|off` or an IWYU pragma. */
  isPragma(t: i32): boolean {
    const d = this.d;
    if (this.switchesFormatting(t)) {
      return true;
    }
    const a = add32(fwAt0(d.start, t), 2);
    return d.len(t) > 14 && this.textAt(a, " IWYU pragma:");
  }

  textAt(a: i32, s: string): boolean {
    const d = this.d;
    const n = toI32(s.length);
    for (let i = 0; i < n; i++) {
      if (d.at(add32(a, i)) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** Splits line `t` into its prefix (known prefix plus spaces) and content; fills the sc* fields for slot `k`. */
  scLine(k: i32, t: i32, startCol: i32): void {
    const d = this.d;
    const a = fwAt0(d.start, t);
    const e = fwAt0(d.end, t);
    let kp = 2;
    const c2 = d.at(add32(a, 2));
    if (c2 === 47 && d.at(add32(a, 3)) === 60) {
      kp = 4; // ///<
    } else if (c2 === 33 && d.at(add32(a, 3)) === 60) {
      kp = 4; // //!<
    } else if (c2 === 47 || c2 === 33 || c2 === 58) {
      kp = 3; // ///, //!, //:
    }
    const len = sub32(e, a);
    if (kp > len) {
      kp = len;
    }
    let sp = add32(a, kp);
    while (sp < e && d.at(sp) === 32) {
      sp++;
    }
    // Content: after the prefix, without trailing blanks.
    let ce = e;
    while (ce > sp && ce > 0 && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    const spa = sub32(sp, a);
    const spaces = sub32(spa, kp);
    let extra = 0;
    let keep = spa;
    if (sp < e) {
      const c = d.at(sp);
      const noSpace = c < 128 && (c === 92 || isPunct(c) || c === 32 || c === 9) && !(c === 35);
      if (spaces < 1 && !noSpace && !this.isPragma(t) && d.opts.reflowComments) {
        extra = 1;
      }
    } else {
      keep = kp;
    }
    const scKnown = this.scKnown;
    const scStart = this.scStart;
    const scKeep = this.scKeep;
    const scExtra = this.scExtra;
    const scA = this.scA;
    const scE = this.scE;
    const scCol = this.scCol;
    // (The section's slots were made for its lines.)
    if (
      k < 0 ||
      k >= scKnown.length ||
      k >= scStart.length ||
      k >= scKeep.length ||
      k >= scExtra.length ||
      k >= scA.length ||
      k >= scE.length ||
      k >= scCol.length
    ) {
      fault();
      return;
    }
    scKnown[k] = kp;
    scStart[k] = a;
    scKeep[k] = keep;
    scExtra[k] = extra;
    scA[k] = sp;
    scE[k] = ce;
    scCol[k] = add32(add32(startCol, keep), extra);
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
    const scKnown = this.scKnown;
    const scStart = this.scStart;
    const scKeep = this.scKeep;
    const scExtra = this.scExtra;
    const scA = this.scA;
    const scCol = this.scCol;
    let first = 0;
    for (let k = 0; k < n; k++) {
      const t = fwAt0(this.emTok, add32(i, k));
      const a = fwAt0(scStart, k);
      const kp = fwAt0(scKnown, k);
      const keepk = fwAt0(scKeep, k);
      const sp = add32(a, keepk);
      const spaces = sub32(keepk, kp);
      const sak = fwAt0(scA, k);
      const has = sak < fwAt0(d.end, t);
      let noSpace = false;
      let c = 0;
      if (has) {
        c = d.at(sak);
        noSpace = c < 128 && (c === 92 || isPunct(c) || c === 32 || c === 9) && c !== 35;
      }
      let samePrefix = k > 0 && fwAt0(scKnown, k - 1) === kp;
      const pa = samePrefix ? fwAt0(scStart, k - 1) : 0;
      for (let q = 0; samePrefix && q < kp; q++) {
        if (d.at(add32(a, q)) !== d.at(add32(pa, q))) {
          samePrefix = false;
        }
      }
      if (!samePrefix) {
        first = spaces < 1 && has && !noSpace ? sub32(1, spaces) : 0;
      }
      let extra = 0;
      if (has) {
        let change = first;
        const sc = add32(spaces, change);
        if (sc < 1) {
          change = sub32(add32(change, 1), sc);
        }
        const requires = !noSpace || (c === 125 && first !== 0);
        const allows = !this.switchesFormatting(t) && (spaces !== 0 || requires);
        if (change > 0 && allows) {
          extra = change;
        }
      }
      cppfSet(scExtra, k, extra);
      cppfSet(scCol, k, add32(add32(startCol, sub32(sp, a)), extra));
      if (!has) {
        cppfSet(scCol, k, add32(startCol, fwAt0(scKeep, k)));
      }
    }
  }

  /** Whether lines `k - 1` and `k` have the same original prefix bytes. */
  scSamePrefix(k: i32): boolean {
    const d = this.d;
    // (A line after the first.)
    if (k <= 0) {
      fault();
      return false;
    }
    const scA = this.scA;
    const scStart = this.scStart;
    const s0 = fwAt0(scStart, k - 1);
    const s1 = fwAt0(scStart, k);
    const la = sub32(fwAt0(scA, k - 1), s0);
    const lb = sub32(fwAt0(scA, k), s1);
    if (la !== lb) {
      return false;
    }
    for (let i = 0; i < la; i++) {
      if (d.at(add32(s0, i)) !== d.at(add32(s1, i))) {
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
      if (fwAt0(d.kind, t) !== K_EOF) {
        owner = t;
      }
    } else if (t > RAW && t <= PIECE && t < 0) {
      owner = fwAt0(this.pcTok, -1 - t - 1048575); // PIECE - t
    }
    if (owner === this.recCur) {
      return;
    }
    if (nl > 0 && i > 0) {
      out.trimSpaces();
    }
    if (this.recCur >= 0) {
      cppfSet(this.uE, fwAt0(this.map, this.recCur), out.n);
    }
    cppfSet(this.uS, fwAt0(this.map, owner), out.n);
    if (this.recOrd) {
      this.ord.push(fwAt0(this.map, owner));
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
        w = add32(w, ascii ? sub32(i, s) : utf8Width(d.src, s, i));
        w = add32(w, 8 - (add32(c, w) % 8));
        s = i + 1;
        ascii = true;
      } else if (ch >= 128) {
        ascii = false;
      }
    }
    return add32(w, ascii ? sub32(b, s) : utf8Width(d.src, s, b));
  }

  /** colsAt for bytes [a, b) of token `t`: their count when the token is plain. */
  cw(t: i32, a: i32, b: i32, c: i32): i32 {
    return fwAt0(this.d.plain, t) === 1 ? sub32(b, a) : this.colsAt(a, b, c);
  }

  /** Whether content [a, e) may take the previous line's words (clang-format's rule). */
  mayReflowContent(a0: i32, e0: i32): boolean {
    const d = this.d;
    let a = a0;
    let e = e0;
    while (a < e && isBlankByte(d.at(a))) {
      a++;
    }
    // (d.at answers 0, no blank, before the text.)
    while (e > a && e > 0 && isBlankByte(d.at(e - 1))) {
      e--;
    }
    if (sub32(e, a) < 2) {
      return false;
    }
    const c0 = d.at(a);
    const c1 = d.at(add32(a, 1));
    // (`@`, and since clang-format 23 `\`, commonly have special meaning.)
    if (
      c0 === 64 ||
      c0 === 92 ||
      this.textAt(a, "TODO") ||
      this.textAt(a, "FIXME") ||
      this.textAt(a, "XXX") ||
      this.textAt(a, "-# ") ||
      this.textAt(a, "- ") ||
      this.textAt(a, "+ ") ||
      this.textAt(a, "* ")
    ) {
      return false;
    }
    if (this.numberedItem(a, e, true)) {
      return false;
    }
    if (d.at(sub32(e, 1)) === 92) {
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
    const bytes = sub32(fwAt0(d.end, t), fwAt0(d.start, t));
    const tm = fwAt0(d.multi, t);
    if (!d.opts.reflowComments || this.isPragma(t) || this.switchesFormatting(t) || tm === 1) {
      return tm === 1 ? fwAt0(d.width, t) : bytes;
    }
    // (With the space clang-format puts after a bare `//`.)
    const sp = this.missingCommentSpace(t);
    if (add32(add32(col, fwAt0(d.width, t)), sp) <= lim) {
      return add32(bytes, sp);
    }
    this.commentPenalty(t, col);
    return this.cpMax;
  }

  /** 1 when clang-format puts a space after line comment `t`'s `//`, else 0. */
  missingCommentSpace(t: i32): i32 {
    const d = this.d;
    const a0 = fwAt0(d.start, t);
    const e0 = fwAt0(d.end, t);
    let kp = 2;
    const c2 = d.at(add32(a0, 2));
    if (c2 === 47 || c2 === 33) {
      kp = d.at(add32(a0, 3)) === 60 ? 4 : 3;
    }
    if (kp >= sub32(e0, a0)) {
      return 0;
    }
    const c = d.at(add32(a0, kp));
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
    const tp = fwAt0(d.inPP, t);
    const lim = sub32(d.opts.columnLimit, tp === 1 ? 2 : 0);
    const a = add32(fwAt0(d.start, t), 2);
    const e = sub32(fwAt0(d.end, t), 2);
    if (!d.opts.reflowComments || e < a || this.switchesFormatting(t)) {
      return excessPenalty(sub32(add32(col, fwAt0(d.width, t)), lim));
    }
    if (fwAt0(d.multi, t) === 1) {
      // Several lines: a dry run of the writer, then its breaks and overflow.
      const o = this.bcScratch;
      o.n = 0;
      this.bcBreaks = 0;
      this.bcPP = tp === 1;
      this.writeBlockComment(o, t, col);
      this.bcPP = false;
      let mp: i64 = toI64(this.bcBreaks) * 300;
      let ls = 0;
      let first = true;
      const ob = o.buf;
      const on = o.n;
      // Each line up to its newline (o.n <= o.buf.length), then the last.
      for (let q = 0; q < on && q < ob.length; q++) {
        if (ob[q] === 10) {
          const w = add32(widthOf(ob, ls, q), first ? col : 0);
          if (w > lim) {
            mp = cppfAddPen(mp, excessPenalty(sub32(w, lim)));
          }
          first = false;
          ls = q + 1;
        }
      }
      const wl = add32(widthOf(ob, ls, on), first ? col : 0);
      if (wl > lim) {
        mp = cppfAddPen(mp, excessPenalty(sub32(wl, lim)));
      }
      return mp;
    }
    let off = 0;
    let csc = add32(col, 2);
    const tail = this.unbreakableTail(t);
    let rem = add32(add32(this.colsAt(a, e, csc), 2), tail);
    const ind = add32(col, 3);
    let pen: i64 = 0;
    this.splitDecoStar = false;
    this.bcFirstW = fwAt0(d.width, t);
    this.bcShrink = 0;
    while (add32(csc, rem) > lim) {
      // (After a fault the values are no guide: stop.)
      if (faulted()) {
        return pen;
      }
      const ao = add32(a, off);
      if (!this.commentSplit(ao, e, csc, lim)) {
        break;
      }
      const sA = this.scSplitA;
      const sN = this.scSplitN;
      const aoA = add32(ao, sA);
      const toSplit = this.colsAt(ao, aoA, csc);
      const after = add32(aoA, sN);
      let toNext = 0;
      if (!this.commentSplit(after, e, add32(add32(csc, toSplit), 1), lim)) {
        toNext = add32(add32(this.colsAt(ao, e, csc), 2), tail);
      } else {
        toNext = this.colsAt(ao, add32(after, this.scSplitA), csc);
      }
      toNext = sub32(add32(toNext, 1), sN);
      if (add32(csc, toNext) <= lim) {
        csc = add32(add32(csc, toSplit), 1);
        off = add32(add32(off, sA), sN);
        rem = add32(add32(this.colsAt(add32(a, off), e, csc), 2), tail);
        continue;
      }
      const nrem = add32(add32(this.colsAt(after, e, ind), 2), tail);
      if (nrem >= rem) {
        break;
      }
      if (pen === 0) {
        this.bcFirstW = sub32(add32(csc, toSplit), col);
      }
      pen = cppfAddPen(pen, 300);
      off = add32(add32(off, sA), sN);
      csc = ind;
      rem = nrem;
    }
    // Kept on its line with its blanks squeezed: that much narrower.
    if (pen === 0) {
      this.bcShrink = sub32(add32(col, fwAt0(d.width, t)), sub32(add32(csc, rem), tail));
    }
    return cppfAddPen(pen, excessPenalty(sub32(add32(csc, rem), lim)));
  }

  /**
   * commentPenalty, remembered per comment for the last column and line it
   * was asked for: the line formatter's search asks again and again.
   */
  commentPenalty(t: i32, col: i32): i64 {
    if (toI32(this.cpcVal.length) <= t) {
      const nt = this.d.ntok;
      const n = add32(t > nt ? t : nt, 64);
      this.cpcGen = newI32s(n);
      this.cpcCol = newI32s(n);
      this.cpcLine = newI32s(n);
      this.cpcMax = newI32s(n);
      this.cpcVal = newI64s(n);
      // (What was remembered went with the old array.)
      this.cpGen = add32(this.cpGen, 1);
    }
    const ln = this.ind.line;
    const gen = this.cpcGen;
    const ccol = this.cpcCol;
    const cline = this.cpcLine;
    const cmax = this.cpcMax;
    const cval = this.cpcVal;
    if (t < 0 || t >= gen.length || t >= ccol.length || t >= cline.length || t >= cmax.length || t >= cval.length) {
      fault();
      return 0;
    }
    if (gen[t] === this.cpGen && ccol[t] === col && cline[t] === ln) {
      this.cpMax = cmax[t];
      return cval[t];
    }
    const v = this.commentPenaltyAt(t, col);
    cppfSet(this.cpcGen, t, this.cpGen);
    cppfSet(this.cpcCol, t, col);
    cppfSet(this.cpcLine, t, ln);
    cppfSet(this.cpcMax, t, this.cpMax);
    const vals = this.cpcVal;
    if (t >= vals.length) {
      fault();
      return v;
    }
    vals[t] = v;
    return v;
  }

  commentPenaltyAt(t: i32, col: i32): i64 {
    const d = this.d;
    const lim = d.opts.columnLimit;
    if (!d.opts.reflowComments || this.isPragma(t) || this.switchesFormatting(t) || fwAt0(d.multi, t) === 1) {
      return excessPenalty(sub32(add32(col, fwAt0(d.width, t)), lim));
    }
    const a0 = fwAt0(d.start, t);
    const e0 = fwAt0(d.end, t);
    let kp = 2;
    const c2 = d.at(add32(a0, 2));
    if (c2 === 47 || c2 === 33) {
      kp = d.at(add32(a0, 3)) === 60 ? 4 : 3;
    }
    const len = sub32(e0, a0);
    if (kp > len) {
      kp = len;
    }
    const sp0 = add32(a0, kp);
    let sp = sp0;
    while (sp < e0 && d.at(sp) === 32) {
      sp++;
    }
    let ce = e0;
    // (d.at answers 0, no blank, before the text.)
    while (ce > sp && ce > 0 && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    let prefix = sub32(sp, a0);
    if (sp < ce && sp === sp0) {
      const c = d.at(sp);
      if (!(c < 128 && (c === 92 || isPunct(c))) || c === 35) {
        prefix = add32(prefix, 1);
      }
    }
    const start = add32(col, prefix);
    let a = sp;
    let csc = start;
    let rem = this.cw(t, a, ce, csc);
    let pen: i64 = 0;
    let widest = 0;
    let breaks = 0;
    while (add32(csc, rem) > lim) {
      // (After a fault the values are no guide: stop.)
      if (faulted()) {
        return pen;
      }
      if (!this.commentSplit(a, ce, csc, lim)) {
        break;
      }
      const sA = this.scSplitA;
      const sN = this.scSplitN;
      const aA = add32(a, sA);
      const after = add32(aA, sN);
      // Blanks squeezed to one space may let the next piece stay on the
      // line: clang-format goes on there, at no cost.
      const toSplit = this.cw(t, a, aA, csc);
      let toNext = 0;
      if (!this.commentSplit(after, ce, add32(add32(csc, toSplit), 1), lim)) {
        toNext = this.cw(t, a, ce, csc);
      } else {
        toNext = this.cw(t, a, add32(after, this.scSplitA), csc);
      }
      toNext = sub32(add32(toNext, 1), sN);
      if (add32(csc, toNext) <= lim) {
        csc = add32(add32(csc, toSplit), 1);
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
      const piece = add32(add32(prefix, sub32(csc, start)), this.cw(t, a, add32(a, this.scSplitA), csc));
      if (piece > widest) {
        widest = piece;
      }
      pen = cppfAddPen(pen, 300);
      breaks = add32(breaks, 1);
      a = after;
      csc = start;
      rem = nrem;
    }
    const lastW = add32(add32(prefix, sub32(csc, start)), rem);
    if (lastW > widest) {
      widest = lastW;
    }
    this.cpMax = widest;
    // A section's later lines take what is reflowed onto them: priced as
    // one, as clang-format's line comment section.
    if (this.sectionNext(t) >= 0) {
      return this.sectionPenalty(t, col);
    }
    if (breaks > 0 && this.reflowsIntoNext(t, kp, add32(add32(csc, rem), 1))) {
      // The last piece joins the section's next line instead of the break
      // before it: clang-format takes that break's penalty back.
      pen = cppfAddPen(pen, -300);
    }
    return cppfAddPen(pen, excessPenalty(sub32(add32(csc, rem), lim)));
  }

  /** The line comment continuing `t`'s section on the next line, or -1. */
  sectionNext(t: i32): i32 {
    const d = this.d;
    const n = fwAt0(d.nxt, t);
    if (
      n < 0 ||
      fwAt0(d.kind, n) !== K_COMMENT ||
      fwAt0(d.type, n) !== TT_LINE_COMMENT ||
      fwAt0(d.nl, n) !== 1 ||
      fwAt0(d.multi, n) === 1 ||
      this.switchesFormatting(n)
    ) {
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
    const a0 = fwAt0(d.start, t);
    const e0 = fwAt0(d.end, t);
    let kp = 2;
    const c2 = d.at(add32(a0, 2));
    if (c2 === 47 || c2 === 33) {
      kp = d.at(add32(a0, 3)) === 60 ? 4 : 3;
    }
    const len = sub32(e0, a0);
    if (kp > len) {
      kp = len;
    }
    const sp0 = add32(a0, kp);
    let sp = sp0;
    while (sp < e0 && d.at(sp) === 32) {
      sp++;
    }
    let ce = e0;
    // (d.at answers 0, no blank, before the text.)
    while (ce > sp && ce > 0 && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    const pre = sub32(sp, a0);
    let prefix = pre;
    if (sp < ce && sp === sp0) {
      const c = d.at(sp);
      if (!(c < 128 && (c === 92 || isPunct(c))) || c === 35) {
        prefix = add32(prefix, 1);
      }
    }
    this.gA = sp;
    this.gE = ce;
    this.gStart = add32(col, prefix);
    this.gPre = pre;
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
    // (A section's next line is a later token.)
    while (cur >= 0) {
      if (faulted()) {
        return pen;
      }
      const pragma = this.isPragma(cur);
      const nx = this.sectionNext(cur);
      let newBreak = false;
      let tryReflow = reflowing;
      let noSplit = pragma && add32(csc, rem) > lim;
      while (!pragma && add32(csc, rem) > lim) {
        // (After a fault the values are no guide: stop.)
        if (faulted()) {
          return pen;
        }
        if (!this.commentSplit(a, e, csc, lim)) {
          noSplit = true;
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const aA = add32(a, sA);
        const after = add32(aA, sN);
        const toSplit = this.colsAt(a, aA, csc);
        let toNext = 0;
        if (!this.commentSplit(after, e, add32(add32(csc, toSplit), 1), lim)) {
          toNext = this.colsAt(a, e, csc);
        } else {
          toNext = this.colsAt(a, add32(after, this.scSplitA), csc);
        }
        toNext = sub32(add32(toNext, 1), sN);
        if (add32(csc, toNext) <= lim) {
          // The blanks squeezed to one space: on along the line.
          tryReflow = true;
          csc = add32(add32(csc, toSplit), 1);
          a = after;
          rem = this.colsAt(a, e, csc);
          continue;
        }
        const nrem = this.colsAt(after, e, start);
        if (nrem >= rem) {
          break;
        }
        pen = cppfAddPen(pen, 300);
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
        pen = cppfAddPen(pen, excessPenalty(sub32(add32(csc, rem), lim)));
      }
      const pa0 = fwAt0(d.start, cur);
      const ppre = this.gPre;
      this.lineGeom(nx, col);
      const na0 = fwAt0(d.start, nx);
      let same = ppre === this.gPre;
      for (let q = 0; same && q < ppre; q++) {
        if (d.at(add32(pa0, q)) !== d.at(add32(na0, q))) {
          same = false;
        }
      }
      if (newBreak) {
        tryReflow = true;
      }
      reflowing = false;
      if (tryReflow && same && this.mayReflowContent(add32(na0, this.gPre), this.gE) && !this.isPragma(nx)) {
        const ccsc = add32(add32(csc, rem), 1);
        const rrem = this.colsAt(this.gA, this.gE, ccsc);
        reflowing = true;
        if (add32(ccsc, rrem) > lim) {
          if (
            !this.commentSplit(this.gA, this.gE, ccsc, lim) ||
            add32(ccsc, this.colsAt(this.gA, add32(this.gA, this.scSplitA), ccsc)) > lim
          ) {
            reflowing = false;
          }
        }
        if (reflowing) {
          if (newBreak) {
            pen = cppfAddPen(pen, -300);
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
    return cppfAddPen(pen, excessPenalty(sub32(add32(csc, rem), lim)));
  }

  /**
   * Whether the line comment after `t` (same `//` prefix of `kp` bytes, on
   * the next line, continuing its section) may take text reflowed onto its
   * start at column `ccsc`, as writeSection decides.
   */
  reflowsIntoNext(t: i32, kp: i32, ccsc: i32): boolean {
    const d = this.d;
    const lim = d.opts.columnLimit;
    const n = fwAt0(d.nxt, t);
    if (
      n < 0 ||
      fwAt0(d.kind, n) !== K_COMMENT ||
      fwAt0(d.type, n) !== TT_LINE_COMMENT ||
      fwAt0(d.nl, n) !== 1 ||
      this.isPragma(n) ||
      this.switchesFormatting(n)
    ) {
      return false;
    }
    if (!this.ind.continuesSection(n, t)) {
      return false;
    }
    const a0 = fwAt0(d.start, n);
    const e0 = fwAt0(d.end, n);
    let nkp = 2;
    const c2 = d.at(add32(a0, 2));
    if (c2 === 47 || c2 === 33) {
      nkp = d.at(add32(a0, 3)) === 60 ? 4 : 3;
    }
    if (nkp !== kp || sub32(e0, a0) < kp) {
      return false;
    }
    const ta0 = fwAt0(d.start, t);
    for (let q = 0; q < kp; q++) {
      if (d.at(add32(a0, q)) !== d.at(add32(ta0, q))) {
        return false;
      }
    }
    const sp0 = add32(a0, kp);
    let sp = sp0;
    while (sp < e0 && isBlankByte(d.at(sp))) {
      sp++;
    }
    let ce = e0;
    // (d.at answers 0, no blank, before the text.)
    while (ce > sp && ce > 0 && isBlankByte(d.at(ce - 1))) {
      ce--;
    }
    if (!this.mayReflowContent(sp0, ce)) {
      return false;
    }
    const rrem = this.colsAt(sp, ce, ccsc);
    if (add32(ccsc, rrem) <= lim) {
      return true;
    }
    if (!this.commentSplit(sp, ce, ccsc, lim)) {
      return false;
    }
    return add32(ccsc, this.colsAt(sp, add32(sp, this.scSplitA), ccsc)) <= lim;
  }

  /**
   * Where to break comment text [a, e) placed at column `csc` within `lim`:
   * sets scSplitA (bytes kept) and scSplitN (blanks dropped); false for nowhere.
   */
  commentSplit(a: i32, e: i32, csc: i32, lim: i32): boolean {
    const d = this.d;
    if (lim <= add32(csc, 1)) {
      return false;
    }
    const maxSplit = add32(sub32(lim, csc), 1);
    let msb = 0;
    let chars = 0;
    while (chars < maxSplit && add32(a, msb) < e) {
      const c = d.at(add32(a, msb));
      const nb = utf8LenOf(c);
      if (c === 9) {
        chars = add32(chars, 8 - (add32(csc, chars) % 8));
      } else {
        chars++;
      }
      msb = add32(msb, nb);
      // (After a fault the values are no guide: stop.)
      if (msb === 0) {
        return false;
      }
    }
    const am = add32(a, msb);
    // The last blank before msb (exclusive).
    let sp = this.lastBlank(a, am);
    // (Each step finds a blank further left.)
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
      let from = am > fnw ? am : fnw;
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
    if (sp === add32(a, 1) && d.at(a) === 42) {
      return false;
    }
    let bc = sp;
    // (d.at answers 0, no blank, before the text.)
    while (bc > a && bc > 0 && isBlankByte(d.at(bc - 1))) {
      bc--;
    }
    let ac = sp;
    // (clang-format 23 keeps the blanks after a decoration ending in `*`.)
    if (!this.splitDecoStar) {
      while (ac < e && isBlankByte(d.at(ac))) {
        ac++;
      }
    }
    this.scSplitA = sub32(bc, a);
    this.scSplitN = sub32(ac, bc);
    return true;
  }

  /** The last blank in [a, b), or -1. */
  lastBlank(a: i32, b: i32): i32 {
    // (d.at answers 0, no blank, before the text.)
    for (let i = sub32(b, 1); i >= a && i >= 0; i--) {
      if (isBlankByte(this.d.at(i))) {
        return i;
      }
    }
    return -1;
  }

  /** The last non-blank in [a, b), or -1. */
  lastNonBlank(a: i32, b: i32): i32 {
    // (Before the text d.at answers 0, a non-blank: any i < 0 answers -1,
    // which callers read as none.)
    for (let i = sub32(b, 1); i >= a && i >= 0; i--) {
      if (!isBlankByte(this.d.at(i))) {
        return i;
      }
    }
    return -1;
  }

  /** Writes line `k`'s prefix (known prefix, its spaces, and any added space). */
  scPrefix(out: Out, k: i32): void {
    const d = this.d;
    const ss = fwAt0(this.scStart, k);
    fwRange(out, d.src, ss, add32(ss, fwAt0(this.scKeep, k)));
    out.spaces(fwAt0(this.scExtra, k));
  }

  /**
   * Writes the line comment section starting at entry `i` (column `col`),
   * breaking lines past the limit and reflowing the words that move into
   * the following lines as clang-format does; answers the last entry used.
   */
  writeSection(out: Out, i: i32, col: i32): i32 {
    const d = this.d;
    const nem = this.nem;
    // (An entry.)
    if (i < 0 || i >= nem) {
      fault();
      return i;
    }
    let j = i;
    while (j < nem && j + 1 < nem && this.continuesSection(j + 1)) {
      j++;
    }
    const n = add32(sub32(j, i), 1);
    if (toI32(this.scA.length) < n) {
      this.scKnown = newI32s(n);
      this.scStart = newI32s(n);
      this.scKeep = newI32s(n);
      this.scExtra = newI32s(n);
      this.scA = newI32s(n);
      this.scE = newI32s(n);
      this.scCol = newI32s(n);
    }
    const emTok = this.emTok;
    for (let k = 0; k < n; k++) {
      this.scLine(k, fwAt0(emTok, add32(i, k)), col);
    }
    this.scSpaceChanges(i, n, col);
    const scA = this.scA;
    const scE = this.scE;
    const scCol = this.scCol;
    const src = d.src;
    const lim = d.opts.columnLimit;
    const reflow = d.opts.reflowComments;
    let off = 0; // bytes into the current line's content
    let csc = fwAt0(scCol, 0);
    let rem = this.cw(fwAt0(emTok, i), fwAt0(scA, 0), fwAt0(scE, 0), csc);
    let seg = fwAt0(scA, 0);
    let reflowing = false;
    this.scPrefix(out, 0);
    let lastCol = col;
    for (let k = 0; k < n; k++) {
      const tk = fwAt0(emTok, add32(i, k));
      const a = fwAt0(scA, k);
      const e = fwAt0(scE, k);
      const pragma = this.isPragma(tk);
      let newBreak = false;
      let tryReflow = reflowing;
      while (reflow && !pragma && add32(csc, rem) > lim) {
        // (After a fault the values are no guide: stop.)
        if (faulted()) {
          return i;
        }
        const ao = add32(a, off);
        if (!this.commentSplit(ao, e, csc, lim)) {
          break;
        }
        const sA = this.scSplitA;
        const sN = this.scSplitN;
        const aoA = add32(ao, sA);
        const toSplit = this.cw(tk, ao, aoA, csc);
        let toNext = 0;
        const after = add32(aoA, sN);
        if (!this.commentSplit(after, e, add32(add32(csc, toSplit), 1), lim)) {
          toNext = this.cw(tk, ao, e, csc);
        } else {
          toNext = this.cw(tk, ao, add32(after, this.scSplitA), csc);
        }
        toNext = sub32(add32(toNext, 1), sN);
        if (add32(csc, toNext) <= lim) {
          // Keep going on this line, the blanks squeezed to one space.
          tryReflow = true;
          fwRange(out, src, seg, aoA);
          out.byte(32);
          seg = after;
          csc = add32(add32(csc, toSplit), 1);
          off = add32(add32(off, sA), sN);
          rem = this.cw(tk, add32(a, off), e, csc);
          continue;
        }
        const pad = 0;
        const ncsc = add32(fwAt0(scCol, k), pad);
        const nrem = this.cw(tk, after, e, ncsc);
        if (nrem >= rem) {
          break;
        }
        fwRange(out, src, seg, aoA);
        out.trimSpaces();
        out.byte(10);
        out.spaces(col);
        this.scPrefix(out, k);
        if (pad > 0) {
          out.byte(32);
        }
        seg = after;
        csc = ncsc;
        off = add32(add32(off, sA), sN);
        rem = nrem;
        newBreak = true;
      }
      if (k + 1 < n) {
        const k1 = k + 1;
        if (newBreak) {
          tryReflow = true;
        }
        reflowing = false;
        let roff = 0;
        if (tryReflow && reflow) {
          const ccsc = add32(add32(csc, rem), 1);
          const na = fwAt0(scA, k1);
          const ne = fwAt0(scE, k1);
          const tk1 = fwAt0(emTok, add32(i, k1));
          if (this.scSamePrefix(k1) && this.mayReflowContent(na, ne) && !this.isPragma(tk1)) {
            // (A tab after the prefix is content: clang-format keeps it, but
            // measures and splits the line without it. The next run, which a
            // changed file always gets, measures it where it landed.)
            let lead = na;
            while (lead < ne && d.at(lead) === 32) {
              lead++;
            }
            let mlead = lead;
            while (mlead < ne && (d.at(mlead) === 32 || d.at(mlead) === 9)) {
              mlead++;
            }
            roff = sub32(mlead, na);
            const rrem = this.cw(tk1, mlead, ne, ccsc);
            reflowing = true;
            if (add32(ccsc, rrem) > lim) {
              if (!this.commentSplit(mlead, ne, ccsc, lim)) {
                reflowing = false;
              } else {
                const ts = this.cw(tk1, mlead, add32(mlead, this.scSplitA), ccsc);
                if (add32(ccsc, ts) > lim) {
                  reflowing = false;
                }
              }
            }
            if (reflowing) {
              fwRange(out, src, seg, e);
              out.byte(32);
              seg = lead;
              csc = ccsc;
              off = roff;
              rem = rrem;
            }
          }
        }
        if (!reflowing) {
          fwRange(out, src, seg, e);
          out.trimSpaces();
          out.byte(10);
          out.spaces(col);
          this.scPrefix(out, k1);
          off = 0;
          csc = fwAt0(scCol, k1);
          rem = this.cw(fwAt0(emTok, add32(i, k1)), fwAt0(scA, k1), fwAt0(scE, k1), csc);
          seg = fwAt0(scA, k1);
        }
      } else {
        fwRange(out, src, seg, e);
        lastCol = add32(csc, rem);
      }
    }
    this.wsCol = lastCol;
    return j;
  }
}

/** Compares two byte strings ignoring ASCII case, as LLVM's compare_insensitive. */
function compareInsensitive(a: u8[], a0: i32, a1: i32, b: u8[], b0: i32, b1: i32): i32 {
  const la = sub32(a1, a0);
  const lb = sub32(b1, b0);
  const n = la < lb ? la : lb;
  let p = a0;
  let q = b0;
  for (let i = 0; i < n; i++) {
    if (p < 0 || p >= a.length || q < 0 || q >= b.length) {
      fault();
      return 0;
    }
    let x = toI32(a[p]);
    let y = toI32(b[q]);
    if (x >= 65 && x <= 90) {
      x = x + 32;
    }
    if (y >= 65 && y <= 90) {
      y = y + 32;
    }
    if (x !== y) {
      return x < y ? -1 : 1;
    }
    p++;
    q++;
  }
  if (la === lb) {
    return 0;
  }
  return la < lb ? -1 : 1;
}

/** The non-empty `::`-separated segments of `s`, as start/end pairs. */
function usingSegments(s: u8[]): i32[] {
  const out: i32[] = [];
  let a = 0;
  let i = 0;
  const n = toI32(s.length);
  while (i >= 0 && i <= n) {
    if (i === n || i >= s.length) {
      if (i > a) {
        out.push(a);
        out.push(i);
      }
      break;
    }
    const i1 = i + 1;
    if (s[i] === 58 && i1 < n && i1 < s.length && s[i1] === 58) {
      if (i > a) {
        out.push(a);
        out.push(i);
      }
      i = i1 + 1;
      a = i;
    } else {
      i = i1;
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
  let e = sa;
  if (sb < sa) {
    e = sb;
  }
  for (let i = 0; i < e; i++) {
    // (Two entries per segment.)
    const j = 2 * i;
    const j1 = j + 1;
    if (j >= na.length || j1 >= na.length || j >= nb.length || j1 >= nb.length) {
      fault();
      return 0;
    }
    const c = compareInsensitive(a, na[j], na[j1], b, nb[j], nb[j1]);
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
  for (let i = 0; i < toI32(a.length) && i < b.length; i++) {
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
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  (c >= 48 && c <= 57) ||
  c === 95 ||
  c === 91 ||
  c === 93 ||
  c === 123 ||
  c === 125 ||
  c === 35 ||
  c === 60 ||
  c === 62 ||
  c === 37 ||
  c === 58 ||
  c === 59 ||
  c === 46 ||
  c === 63 ||
  c === 42 ||
  c === 43 ||
  c === 47 ||
  c === 94 ||
  c === 38 ||
  c === 92 ||
  c === 36 ||
  c === 124 ||
  c === 126 ||
  c === 33 ||
  c === 61 ||
  c === 44 ||
  c === 39 ||
  c === 45;

/**
 * The LLVM style's IncludeCategories for header name `name` (with its
 * delimiters): llvm and clang headers 2, angled and gtest/gmock/isl/json
 * headers 3, the rest 1 (regexes matched case-insensitively).
 */
const includeCategoryOf = (name: string): i32 => {
  const s = lower(name);
  if (s.startsWith('"llvm/') || s.startsWith('"llvm-c/') || s.startsWith('"clang/') || s.startsWith('"clang-c/')) {
    return 2;
  }
  if (
    s.startsWith("<") ||
    s.startsWith('"gtest/') ||
    s.startsWith('"gmock/') ||
    s.startsWith('"isl/') ||
    s.startsWith('"json/')
  ) {
    return 3;
  }
  return 1;
};

/**
 * clang-format's FirstAfterPPLine, for one pass (`vis`, or every token when
 * null): a directive read while a line is still open (any code token came
 * before it) marks the next token pushed, a comment or code, in `out`.
 * UnwrappedLineParser reads the next token before it ends a line, so this
 * holds for directives right after a statement.
 */
const scanAfterDirective = (kind: i32[], inPP: i32[], n: i32, vis: i32[] | null, out: i32[]): void => {
  let code = false;
  let armed = false;
  let seen: i32[] = [];
  const all = vis === null;
  if (vis !== null) {
    seen = vis;
  }
  // (Each column holds the n tokens.)
  if (n > kind.length || n > inPP.length || n > out.length || (!all && n > seen.length)) {
    fault();
    return;
  }
  for (let t = 0; t < n && t < kind.length && t < inPP.length && t < out.length; t++) {
    if (!all && t < seen.length && seen[t] === 0) {
      continue;
    }
    if (inPP[t] === 1) {
      if (code) {
        armed = true;
      }
      continue;
    }
    if (kind[t] === K_EOF) {
      continue;
    }
    if (armed) {
      out[t] = 1;
      armed = false;
    }
    if (kind[t] !== K_COMMENT) {
      code = true;
    }
  }
};

/** `xs[i] = v`, or a fault when `i` is outside `xs`. */
const cppfSet = (xs: i32[], i: i32, v: i32): void => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    xs[u] = v;
    return;
  }
  fault();
};

/** Penalty sum `a + b`, or 0 after a fault when it leaves i64. */
const cppfAddPen = (a: i64, b: i64): i64 => {
  // (Unsigned sums wrap: the two's complement sum, wrong only when the signs say so.)
  const r = toI64(toU64(a) + toU64(b));
  if (a >= 0 === b >= 0 && r >= 0 !== a >= 0) {
    fault();
    return 0;
  }
  return r;
};
