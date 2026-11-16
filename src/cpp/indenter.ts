// The line breaker: the cheapest way to break one unwrapped line.
//
// A layout is built token by token. Each step either keeps the next token on
// the current line or starts a new line before it, and the state after the
// step (the column, and one record per open bracket or implicit expression
// paren: its indent, where the last item started, and the flags that forbid
// or force later breaks) decides what the following steps may do and cost.
// The search expands states cheapest first, ties going to the state made
// first, and skips a state it has already expanded; the first complete state
// is the answer. These are clang-format's rules and penalties (LLVM style),
// kept in flat arrays: a state is a header and a stack of fixed-size records
// copied into one pool.

import { uncheckedGet, uncheckedSet, wrappingAdd } from "nish:unsafe";
import {
  Annot,
  M_AFTERBRACE,
  M_CLOSES,
  M_CTORCOLON,
  M_EOL,
  M_FAKEL,
  M_FAKER,
  M_INHCOLON,
  M_IWC,
  M_LESSLESS,
  M_LOW,
  M_LOWEST,
  M_LSSET,
  M_MEMBER,
  M_NBINL,
  M_NBIINL,
  M_NBIPREV,
  M_NOLBOP_CLR,
  M_OPENS,
  M_PREVROLE,
  M_QUESTION,
  M_ROLEAVOID,
  M_SOSLRESET,
  M_STRING,
  M_SUBSCRIPT,
  C_ALIGN,
  C_BUILDER,
  C_LS_SHIFT,
  C_MEMBERRP,
  C_NEXTPARAM,
  C_NOLB,
  C_NOLBOP,
  C_NOLBOP_LOW,
  C_VP,
  N_BLOCK,
  N_BRINIT,
  N_CI,
  N_CI2,
  N_CLOSEBL,
  N_CLOSEBR,
  N_COMMA,
  N_CTORCOL,
  N_IND,
  N_LESSLESS,
  N_MAXLSIND,
  N_MEMBER,
  N_PNCOK,
  N_QC,
  N_QCIND,
  N_RPAREN,
  N_RQC,
  N_STRING,
  N_SUBSCRIPT,
  PEN_BREAK_STRING,
  PEN_EXCESS,
  PEN_FIRST_LESSLESS,
} from "./annotate";
import { Doc } from "./doc";
import { growI32 } from "../core/arr";
import { utf8Width } from "../core/uwidth";
import { Formatter } from "./format";
import { requiresExprBrace } from "./classify";
import {
  BK_BLOCK,
  BK_BRACED_INIT,
  K_COMMENT,
  K_IDENT,
  K_NUMBER,
  K_CHAR,
  K_STRING,
  KW_ENUM,
  KW_CONST,
  KW_FOR,
  KW_IF,
  KW_GENERIC,
  KW_OPERATOR,
  KW_RETURN,
  KW_CONSTEXPR,
  KW_TEMPLATE,
  KW_WHILE,
  KW_SWITCH,
  KW_CONCEPT,
  LT_IMPORT,
  LT_PREPROCESSOR,
  P_CARET,
  P_COLON,
  P_COLONCOLON,
  P_COMMA,
  P_EQUAL,
  P_HASH,
  P_LBRACE,
  P_LESS,
  P_LESSLESS,
  P_LPAREN,
  P_LSQUARE,
  P_QUESTION,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  PREC_ASSIGNMENT,
  PREC_COMMA,
  PREC_CONDITIONAL,
  PREC_EQUALITY,
  PREC_RELATIONAL,
  PREC_SPACESHIP,
  PREC_UNKNOWN,
  TT_ARRAY_INITIALIZER_LSQUARE,
  TT_IMPLICIT_STRING_LITERAL,
  TT_ARRAY_SUBSCRIPT_LSQUARE,
  TT_ATTRIBUTE_RPAREN,
  TT_ATTRIBUTE_SQUARE,
  TT_BINARY_OPERATOR,
  TT_BLOCK_COMMENT,
  TT_CAST_RPAREN,
  TT_CONDITIONAL_EXPR,
  TT_BLOCK_LITERAL_LBRACE,
  TT_CTOR_INITIALIZER_COLON,
  TT_INLINE_ASM_COLON,
  TT_CTOR_INITIALIZER_COMMA,
  TT_DESIGNATED_INITIALIZER_LSQUARE,
  TT_DESIGNATED_INITIALIZER_PERIOD,
  TT_FUNCTION_ANNOTATION_RPAREN,
  TT_FUNCTION_DECLARATION_NAME,
  TT_INHERITANCE_COLON,
  TT_INHERITANCE_COMMA,
  TT_LAMBDA_LSQUARE,
  TT_LINE_COMMENT,
  TT_OVERLOADED_OPERATOR,
  TT_POINTER_OR_REFERENCE,
  TT_START_OF_NAME,
  TT_TEMPLATE_CLOSER,
  TT_TEMPLATE_OPENER,
  TT_TRAILING_RETURN_ARROW,
  TT_UNARY_OPERATOR,
} from "./tok";

// State header.
const H: i32 = 9;
const S_COL: i32 = 0;
const S_NEXT: i32 = 1;
const S_NOCONT: i32 = 2;
const S_SOL: i32 = 3; // start-of-line nesting level
const S_LOWEST: i32 = 4; // lowest nesting level on the line
const S_SOSL: i32 = 5; // start of a string literal run
const S_NOLB: i32 = 6;
const S_DEPTH: i32 = 7;
const S_TOP: i32 = 8; // the top record

// One record per open bracket or implicit paren.
const PS: i32 = 11;
// A record in the pool: its parent, its hash (with everything under it), then the PS fields.
const RS: i32 = 13;
const RP: i32 = 0;
const RH: i32 = 1;
const RF: i32 = 2;
const R_TOK: i32 = 0;
const R_IND: i32 = 1;
const R_LS: i32 = 2; // last space: where the current item started
const R_NBI: i32 = 3; // nested block indent
const R_FLL: i32 = 4; // column of the first `<<`
const R_QC: i32 = 5; // column of the `?`
const R_SOFC: i32 = 6; // start of the function call
const R_SOAS: i32 = 7; // start of array subscripts
const R_CC: i32 = 8; // call continuation column
const R_VP: i32 = 9; // variable position (after `=`)
const R_FL: i32 = 10;

const F_ALIGNED: i32 = 1;
const F_BBCB: i32 = 2; // break before the closing brace
const F_AVOID: i32 = 8; // avoid bin packing
const F_BBP: i32 = 16; // break before the next parameter
const F_NOLB: i32 = 32;
const F_NOLBOP: i32 = 64; // no line break in this operand
const F_LOW: i32 = 128; // the last operator was wrapped
const F_CLB: i32 = 256; // contains a line break
const F_CUB: i32 = 512; // contains an unwrapped builder call
const F_HMNB: i32 = 1024; // has multiple nested blocks
const F_NBI: i32 = 2048; // nested block inlined
const F_ICC: i32 = 4096; // chained conditional
const F_IWC: i32 = 8192; // wrapped conditional
const F_CMP: i32 = 0x7ffffbbf; // every flag but NOLBOP and HMNB

const MAXCOUNT: i32 = 25000000;
// clang-format keeps penalties in 32-bit unsigned integers: sums wrap.
const U32: i64 = 4294967295;
// Child blocks are counted eagerly from this penalty on, well before a wrap.
const LAZY_LIMIT: i64 = 1073741824;
const RC_SIZE: i32 = 8192; // power of two
const CC_SIZE: i32 = 65536; // power of two
const IGNORE_AFTER: i32 = 50000;

const isHex = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

const isAlnum = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90);

/** Bytes in the UTF-8 sequence led by `c`. */
const utf8Len = (c: i32): i32 => {
  if (c < 0xc0) {
    return 1;
  }
  if (c < 0xe0) {
    return 2;
  }
  if (c < 0xf0) {
    return 3;
  }
  return 4;
};

/**
 * The column of implicit string literal `t` after a token ending at `col`:
 * clang-format keeps the whitespace before it byte for byte, and after a
 * newline in it takes the written 1-based spelling column.
 */
const implicitColumn = (d: Doc, t: i32, col: i32): i32 => {
  if (d.nl[t] > 0) {
    return d.col[t] + 1;
  }
  return col + d.start[t] - d.end[d.prv[t]];
};

export class Indenter {
  d: Doc;
  a: Annot;
  fm: Formatter | null = null;
  // The working state.
  col: i32 = 0;
  next: i32 = -1;
  noCont: i32 = 0;
  sol: i32 = 0;
  lowest: i32 = 0;
  sosl: i32 = 0;
  noLB: i32 = 0;
  sp: i32 = 0;
  // The stack is a chain of records shared between states: a step copies
  // only the records it changes (those at or above fresh0 are its own).
  topRec: i32 = -1;
  fresh0: i32 = 0;
  rec: i32[];
  nrec: i32 = 0;
  path: i32[];
  // The line being broken.
  line: i32 = -1;
  firstIndent: i32 = 0;
  lim: i32 = 120;
  lineLast: i32 = -1;
  dry: boolean = true;
  // Nodes, the state pool, the queue and the seen table (stack-allocated by search depth).
  nOff: i32[];
  nPrev: i32[];
  nNl: i32[];
  nIgn: i32[];
  nn: i32 = 0;
  pool: i32[];
  pn: i32 = 0;
  // The queue: one FIFO bucket of nodes per penalty value (equal penalties
  // pop in creation order), and a heap of the buckets' distinct penalties.
  vhPen: i64[];
  vhB: i32[];
  vn: i32 = 0;
  bHead: i32[];
  bTail: i32[];
  bn: i32 = 0;
  nNextB: i32[];
  // A node whose child block's penalty is not counted yet: the block and its indent.
  nPendH: i32[];
  nPendI: i32[];
  nCnt: i32[];
  lazyKids: boolean = false;
  asWritten: boolean = false; // noLineBreak for a line with no layout: its blocks' lines are written too
  pendHead: i32 = -1;
  childPen: i64 = 0;
  pendInd: i32 = 0;
  // Per search depth: penalty -> bucket, stamped by search generation.
  pmKey: i64[][];
  pmVal: i32[][];
  pmStamp: i32[][];
  pmUsed: i32[];
  pmGen: i32 = 0;
  seenNode: i32[];
  seenStamp: i32[];
  seenGen: i32 = 1;
  depth: i32 = 0;
  // Penalties of child block lists already formatted (dry): by line and indent.
  cacheKey: i32[];
  cacheVal: i64[];
  cacheStamp: i32[];
  fileStamp: i32 = 1;
  ignoreStack: boolean = false;
  debug: boolean = false;
  // Results of lines already broken in this file: by line and indent, the
  // penalty and the break decisions (a line's layout depends on nothing else).
  rcLine: i32[];
  rcInd: i32[];
  rcStamp: i32[];
  rcPen: i64[];
  rcOff: i32[];
  rcN: i32[];
  rcBits: i32[];
  rcUsed: i32 = 0;
  // Results by content, kept across files: a 64-bit hash of everything the
  // search reads from a line (token facts, string bytes, indent) -> penalty and decisions.
  ccH1: i32[];
  ccH2: i32[];
  ccLen: i32[];
  ccPen: i64[];
  ccOff: i32[];
  ccN: i32[];
  ccBits: i32[];
  ccNb: i32 = 0;
  ccUsed: i32 = 0;
  hh1: i32 = 0;
  hh2: i32 = 0;
  hlen: i32 = 0;
  nbits: i32 = 0;
  pathBits: i32[];
  pathN: i32 = 0;
  pathOff: i32 = 0;
  stSearches: i64 = 0;
  stNodes: i64 = 0;
  stPops: i64 = 0;
  stDepth: i64 = 0;
  stListMiss: i64 = 0;
  stListHit: i64 = 0;
  cuts: i32[];

  constructor(d: Doc, a: Annot) {
    this.d = d;
    this.a = a;
    this.rec = new Array<i32>(RS * 4096);
    this.path = new Array<i32>(64);
    this.cuts = new Array<i32>(16);
    this.rcLine = new Array<i32>(RC_SIZE);
    this.rcInd = new Array<i32>(RC_SIZE);
    this.rcStamp = new Array<i32>(RC_SIZE);
    this.rcPen = new Array<i64>(RC_SIZE);
    this.rcOff = new Array<i32>(RC_SIZE);
    this.rcN = new Array<i32>(RC_SIZE);
    this.rcBits = new Array<i32>(4096);
    this.ccH1 = new Array<i32>(CC_SIZE);
    this.ccH2 = new Array<i32>(CC_SIZE);
    this.ccLen = new Array<i32>(CC_SIZE);
    this.ccPen = new Array<i64>(CC_SIZE);
    this.ccOff = new Array<i32>(CC_SIZE);
    this.ccN = new Array<i32>(CC_SIZE);
    this.ccBits = new Array<i32>(65536);
    this.pathBits = new Array<i32>(256);
    this.nOff = new Array<i32>(1024);
    this.nPrev = new Array<i32>(1024);
    this.nNl = new Array<i32>(1024);
    this.nIgn = new Array<i32>(1024);
    this.pool = new Array<i32>(65536);
    this.vhPen = new Array<i64>(1024);
    this.vhB = new Array<i32>(1024);
    this.bHead = new Array<i32>(1024);
    this.bTail = new Array<i32>(1024);
    this.nNextB = new Array<i32>(1024);
    this.nPendH = new Array<i32>(1024);
    this.nPendI = new Array<i32>(1024);
    this.nCnt = new Array<i32>(1024);
    this.pmKey = [];
    this.pmVal = [];
    this.pmStamp = [];
    this.pmUsed = new Array<i32>(64);
    this.seenNode = new Array<i32>(1 << 16);
    this.seenStamp = new Array<i32>(1 << 16);
    this.cacheKey = new Array<i32>(4096);
    this.cacheVal = new Array<i64>(4096);
    this.cacheStamp = new Array<i32>(4096);
  }

  reset(): void {
    this.fileStamp = this.fileStamp + 1;
    this.rcUsed = 0;
    this.nbits = 0;
  }

  /** The cache slot of line `l` at `ind`: found (stamp current) or free; -1 when full. */
  rcSlot(l: i32, ind: i32): i32 {
    let h = Math.imul(l, 0x2545f491) ^ Math.imul(ind, 0x01000193);
    h = h & (RC_SIZE - 1);
    for (let i = 0; i < 64; i++) {
      const s = (h + i) & (RC_SIZE - 1);
      if (this.rcStamp[s] !== this.fileStamp) {
        return s;
      }
      if (this.rcLine[s] === l && this.rcInd[s] === ind) {
        return s;
      }
    }
    return -1;
  }

  rcHit(s: i32): boolean {
    return s >= 0 && this.rcStamp[s] === this.fileStamp;
  }

  rcStore(s: i32, l: i32, ind: i32, pen: i64, withPath: boolean): void {
    if (s < 0 || this.rcUsed * 2 > RC_SIZE) {
      return;
    }
    this.rcStamp[s] = this.fileStamp;
    this.rcLine[s] = l;
    this.rcInd[s] = ind;
    this.rcPen[s] = pen;
    this.rcN[s] = -1;
    if (withPath) {
      const n = this.pathN;
      if (this.nbits + n > toI32(this.rcBits.length)) {
        this.rcBits = growI32(this.rcBits, (this.nbits + n) * 2);
      }
      for (let i = 0; i < n; i++) {
        this.rcBits[this.nbits + i] = this.pathBits[i];
      }
      this.rcOff[s] = this.nbits;
      this.rcN[s] = n;
      this.nbits = this.nbits + n;
    }
    this.rcUsed = this.rcUsed + 1;
  }

  // ---- Stack access -------------------------------------------------------

  top(f: i32): i32 {
    return uncheckedGet(this.rec, this.topRec * RS + RF + f);
  }

  /** The record `k` levels under the top (0 is the top). */
  below(k: i32): i32 {
    let r = this.topRec;
    for (let i = 0; i < k; i++) {
      r = uncheckedGet(this.rec, r * RS + RP);
    }
    return r;
  }

  /** Field `f` of the record at depth `i` (0 is the bottom). */
  at(i: i32, f: i32): i32 {
    return uncheckedGet(this.rec, this.below(this.sp - 1 - i) * RS + RF + f);
  }

  newRec(parent: i32): i32 {
    const r = this.nrec;
    if ((r + 1) * RS > toI32(this.rec.length)) {
      this.rec = growI32(this.rec, (r + 1) * RS * 2);
    }
    uncheckedSet(this.rec, r * RS + RP, parent);
    uncheckedSet(this.rec, r * RS + RH, 0);
    this.nrec = r + 1;
    return r;
  }

  /** A mutable copy of record `r` (same parent). */
  cloneRec(r: i32): i32 {
    const c = this.newRec(uncheckedGet(this.rec, r * RS + RP));
    const a = r * RS + RF;
    const b = c * RS + RF;
    for (let i = 0; i < PS; i++) {
      uncheckedSet(this.rec, b + i, uncheckedGet(this.rec, a + i));
    }
    return c;
  }

  setTop(f: i32, v: i32): void {
    if (this.topRec < this.fresh0) {
      if (uncheckedGet(this.rec, this.topRec * RS + RF + f) === v) {
        return;
      }
      this.topRec = this.cloneRec(this.topRec);
    }
    uncheckedSet(this.rec, this.topRec * RS + RF + f, v);
  }

  /** Makes the records from depth `i` to the top this step's own, re-linking parents. */
  ownFrom(i: i32): void {
    const n = this.sp - i;
    if (n > toI32(this.path.length)) {
      this.path = growI32(this.path, n);
    }
    let r = this.topRec;
    for (let k = 0; k < n; k++) {
      this.path[k] = r;
      r = uncheckedGet(this.rec, r * RS + RP);
    }
    // r is the parent of depth i's record; walk back up, copying what is shared.
    let parent = r;
    for (let k = n - 1; k >= 0; k--) {
      let x = this.path[k];
      if (x < this.fresh0) {
        x = this.cloneRec(x);
      }
      uncheckedSet(this.rec, x * RS + RP, parent);
      this.path[k] = x;
      parent = x;
    }
    this.topRec = parent;
  }

  setAt(i: i32, f: i32, v: i32): void {
    if (this.at(i, f) === v) {
      return;
    }
    this.ownFrom(i);
    uncheckedSet(this.rec, this.path[this.sp - 1 - i] * RS + RF + f, v);
  }

  /** Sets flag `fl` on every level below the top (and the top too when `withTop`). */
  flagAll(fl: i32, withTop: boolean): void {
    // The lowest level missing the flag; nothing to do when none is.
    let lowest = -1;
    let r = this.topRec;
    for (let k = 0; k < this.sp; k++) {
      if ((k > 0 || withTop) && (uncheckedGet(this.rec, r * RS + RF + R_FL) & fl) === 0) {
        lowest = this.sp - 1 - k;
      }
      r = uncheckedGet(this.rec, r * RS + RP);
    }
    if (lowest < 0) {
      return;
    }
    this.ownFrom(lowest);
    const n = this.sp - lowest;
    for (let k = withTop ? 0 : 1; k < n; k++) {
      const x = this.path[k];
      uncheckedSet(this.rec, x * RS + RF + R_FL, uncheckedGet(this.rec, x * RS + RF + R_FL) | fl);
    }
  }

  topHas(fl: i32): boolean {
    return (this.top(R_FL) & fl) !== 0;
  }

  setTopFlag(fl: i32, on: boolean): void {
    const v = this.top(R_FL);
    this.setTop(R_FL, on ? v | fl : v & ~fl);
  }

  push(tok: i32, ind: i32, ls: i32, avoid: boolean, noLB: boolean): void {
    const r = this.newRec(this.topRec);
    const o = r * RS + RF;
    const x = this.rec;
    x[o + R_TOK] = tok;
    x[o + R_IND] = ind;
    x[o + R_LS] = ls;
    x[o + R_NBI] = ind;
    x[o + R_FLL] = 0;
    x[o + R_QC] = 0;
    x[o + R_SOFC] = 0;
    x[o + R_SOAS] = 0;
    x[o + R_CC] = 0;
    x[o + R_VP] = 0;
    x[o + R_FL] = F_LOW | (avoid ? F_AVOID : 0) | (noLB ? F_NOLB : 0);
    this.topRec = r;
    this.sp = this.sp + 1;
  }

  /** Pushes a copy of the top record. */
  dupTop(): void {
    const c = this.cloneRec(this.topRec);
    uncheckedSet(this.rec, c * RS + RP, this.topRec);
    this.topRec = c;
    this.sp = this.sp + 1;
  }

  pop(): void {
    this.topRec = uncheckedGet(this.rec, this.topRec * RS + RP);
    this.sp = this.sp - 1;
  }

  // ---- Snapshots ----------------------------------------------------------

  /** Hashes this step's records (bottom up), so a saved state's stack hash is at its top. */
  hashFresh(): void {
    let n = 0;
    let r = this.topRec;
    while (r >= this.fresh0) {
      if (n >= toI32(this.path.length)) {
        this.path = growI32(this.path, n + 1);
      }
      this.path[n] = r;
      n++;
      r = uncheckedGet(this.rec, r * RS + RP);
    }
    for (let k = n - 1; k >= 0; k--) {
      const x = this.path[k];
      const p = uncheckedGet(this.rec, x * RS + RP);
      let h = p >= 0 ? uncheckedGet(this.rec, p * RS + RH) : 0x2545f491;
      const o = x * RS + RF;
      for (let f = 1; f < PS - 1; f++) {
        h = Math.imul(h ^ uncheckedGet(this.rec, o + f), 0x01000193);
      }
      h = Math.imul(h ^ (uncheckedGet(this.rec, o + R_FL) & F_CMP), 0x01000193);
      uncheckedSet(this.rec, x * RS + RH, h);
    }
  }

  /** Copies the working state's header to the pool; answers its offset. */
  save(): i32 {
    this.hashFresh();
    const o = this.pn;
    if (o + H > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, (o + H) * 2);
    }
    const p = this.pool;
    uncheckedSet(p, o + S_COL, this.col);
    uncheckedSet(p, o + S_NEXT, this.next);
    uncheckedSet(p, o + S_NOCONT, this.noCont);
    uncheckedSet(p, o + S_SOL, this.sol);
    uncheckedSet(p, o + S_LOWEST, this.lowest);
    uncheckedSet(p, o + S_SOSL, this.sosl);
    uncheckedSet(p, o + S_NOLB, this.noLB);
    uncheckedSet(p, o + S_DEPTH, this.sp);
    uncheckedSet(p, o + S_TOP, this.topRec);
    this.pn = o + H;
    this.fresh0 = this.nrec;
    return o;
  }

  load(o: i32): void {
    const p = this.pool;
    this.col = uncheckedGet(p, o + S_COL);
    this.next = uncheckedGet(p, o + S_NEXT);
    this.noCont = uncheckedGet(p, o + S_NOCONT);
    this.sol = uncheckedGet(p, o + S_SOL);
    this.lowest = uncheckedGet(p, o + S_LOWEST);
    this.sosl = uncheckedGet(p, o + S_SOSL);
    this.noLB = uncheckedGet(p, o + S_NOLB);
    this.sp = uncheckedGet(p, o + S_DEPTH);
    this.topRec = uncheckedGet(p, o + S_TOP);
    this.fresh0 = this.nrec;
  }

  // ---- Token helpers ------------------------------------------------------

  isStringLit(t: i32): boolean {
    return this.d.kind[t] === K_STRING;
  }

  isIdent(t: i32): boolean {
    const k = this.d.kind[t];
    return k === K_IDENT || k >= 200;
  }

  startsNextParameter(t: i32): boolean {
    const p = this.d.prv[t];
    return p >= 0 && this.d.kind[p] === P_COMMA && !this.a.isTrailingComment(t);
  }

  startsBuilderSegment(t: i32): boolean {
    const p = this.d.prv[t];
    return this.a.isMemberAccess(t) && p >= 0 && this.a.closesScope(p);
  }

  closesScopeAfterBlock(t: i32): boolean {
    const d = this.d;
    let q = t;
    while (q >= 0) {
      if (d.kind[q] === P_RBRACE || d.kind[q] === P_LBRACE) {
        const m = d.kind[q] === P_RBRACE ? d.match[q] : q;
        if (m >= 0 && d.bk[m] === BK_BLOCK) {
          return true;
        }
      }
      if (!this.a.closesScope(q)) {
        return false;
      }
      q = d.prv[q];
    }
    return false;
  }

  /** `if`, or `if constexpr`, before an opening paren. */
  isIfKw(t: i32): boolean {
    const d = this.d;
    if (t < 0) {
      return false;
    }
    if (d.kind[t] === KW_IF) {
      return true;
    }
    const p = d.prv[t];
    return p >= 0 && d.kind[p] === KW_IF && (d.kind[t] === KW_CONSTEXPR || d.kind[t] === K_IDENT);
  }

  /** Width up to the first possible break after the bracket closing `t`'s. */
  lengthToMatchingParen(t: i32): i32 {
    const d = this.d;
    const a = this.a;
    const m = d.match[t];
    if (m < 0) {
      return 0;
    }
    let end = m;
    let r = this.topRec;
    while (end !== this.lineLast && d.nxt[end] >= 0) {
      const n = d.nxt[end];
      if (a.canB[n] === 1) {
        break;
      }
      if (a.closesScope(n)) {
        const nm = d.match[n];
        if (nm >= 0 && (d.kind[nm] === P_LBRACE || d.type[nm] === TT_ARRAY_INITIALIZER_LSQUARE || d.kind[nm] === P_LESS)) {
          while (r >= 0 && uncheckedGet(this.rec, r * RS + RF + R_TOK) !== nm) {
            r = uncheckedGet(this.rec, r * RS + RP);
          }
          if (r >= 0 && (uncheckedGet(this.rec, r * RS + RF + R_FL) & F_BBCB) !== 0) {
            break;
          }
        }
      }
      end = n;
    }
    return a.tot[end] - a.tot[t] + 1;
  }

  // ---- Can, must, where ---------------------------------------------------

  canBreak(): boolean {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = d.prv[cur];
    if (a.canB[cur] === 0 && !(this.topHas(F_BBCB) && a.closesBlockList(cur))) {
      return false;
    }
    const pk = d.kind[prev];
    if (a.mustB[cur] === 0 && pk === P_LBRACE && d.bk[prev] === BK_BRACED_INIT) {
      const pp = d.prv[prev];
      if (pp >= 0 && (d.kind[pp] === P_LBRACE || d.kind[pp] === P_LPAREN || d.kind[pp] === P_COMMA)) {
        return false;
      }
    }
    if (a.opensScope(prev) && pk !== P_LBRACE && this.lowest < this.sol && this.lowest < a.nest[cur]) {
      return false;
    }
    if (a.isMemberAccess(cur) && this.topHas(F_CUB)) {
      return false;
    }
    if (pk === P_LBRACE && this.sp > 1) {
      const fl = this.at(this.sp - 2, R_FL);
      if ((fl & F_NBI) !== 0 && (fl & F_HMNB) !== 0) {
        return false;
      }
    }
    if (d.type[cur] === TT_FUNCTION_DECLARATION_NAME && this.col < 6) {
      return false;
    }
    if (!(d.type[cur] === TT_BINARY_OPERATOR || d.kind[cur] === P_COMMA) && this.topHas(F_NOLBOP)) {
      return false;
    }
    return this.noLB === 0 && !this.topHas(F_NOLB);
  }

  mustBreak(): boolean {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = d.prv[cur];
    const ck = d.kind[cur];
    const ct = d.type[cur];
    const pk = d.kind[prev];
    const pt = d.type[prev];
    // BreakBeforeInlineASMColon OnlyMultiline: every operand colon of a
    // line that does not fit.
    if (a.mustB[cur] === 1 || ct === TT_INLINE_ASM_COLON) {
      return true;
    }
    if (this.topHas(F_BBCB) && a.closesBlockList(cur)) {
      return true;
    }
    if (
      (this.startsNextParameter(cur) ||
        pk === P_SEMI ||
        (pt === TT_TEMPLATE_CLOSER && ct === TT_START_OF_NAME && d.type[d.lFirst[this.line]] !== TT_ATTRIBUTE_SQUARE) ||
        (ct === TT_CONDITIONAL_EXPR && pk !== P_QUESTION)) &&
      this.topHas(F_BBP) &&
      !a.isTrailingComment(cur) &&
      ck !== P_RPAREN &&
      ck !== P_RBRACE
    ) {
      return true;
    }
    if (this.topHas(F_ICC) && ct === TT_CONDITIONAL_EXPR && ck === P_COLON) {
      return true;
    }
    if (ct === TT_CTOR_INITIALIZER_COLON && (this.col + a.tot[this.lineLast] - a.tot[prev] > this.lim || this.topHas(F_BBP)) && (!a.isTrailingComment(cur) || d.nl[cur] > 0)) {
      return true;
    }
    const nlc = this.newLineColumn();
    if (a.isMemberAccess(cur) && this.col + this.lengthToNextOperator(cur) > d.opts.columnLimit && (this.col > nlc || a.nest[cur] < this.sol)) {
      return true;
    }
    if (this.startsBuilderSegment(cur) && (this.top(R_CC) !== 0 || this.topHas(F_BBP)) && !(this.closesScopeAfterBlock(prev) && this.col <= nlc)) {
      return true;
    }
    if (a.ctd[prev] === 1 && this.topHas(F_BBP) && a.canB[cur] === 1) {
      return true;
    }
    if (d.kind[d.lFirst[this.line]] !== KW_ENUM && this.col <= nlc) {
      return false;
    }
    if (pt === TT_BINARY_OPERATOR && a.canB[cur] === 1) {
      const pp = a.prec(prev);
      if (pp !== PREC_ASSIGNMENT && this.topHas(F_BBP) && !a.isTrailingComment(cur)) {
        const lhs = d.prv[prev];
        if (lhs >= 0 && a.ebin[lhs] === 1) {
          return true;
        }
        const isCmp = (pp === PREC_RELATIONAL || pp === PREC_EQUALITY || pp === PREC_SPACESHIP) && lhs >= 0 && d.type[lhs] !== TT_BINARY_OPERATOR;
        if (!isCmp) {
          return true;
        }
      }
    } else if (ct === TT_BINARY_OPERATOR && a.canB[cur] === 1 && this.topHas(F_BBP)) {
      return true;
    }
    if (ck === P_LESSLESS && ct !== TT_OVERLOADED_OPERATOR && this.topHas(F_BBP) && this.top(R_FLL) === 0) {
      return true;
    }
    if (a.nest[cur] === 0 && !a.isTrailingComment(cur)) {
      if (a.ctd[prev] === 1) {
        return true;
      }
      if (pt === TT_FUNCTION_ANNOTATION_RPAREN && d.lType[this.line] !== LT_PREPROCESSOR) {
        return true;
      }
    }
    if (ct === TT_FUNCTION_DECLARATION_NAME && pk !== KW_TEMPLATE && d.lRetWrap[this.line] === 0 && this.topHas(F_BBP)) {
      return true;
    }
    if (pk === P_LBRACE && d.bk[prev] === BK_BLOCK && ck !== P_RBRACE && ck !== K_COMMENT) {
      return true;
    }
    if (ck === P_LESSLESS && this.endsLine(prev)) {
      return true;
    }
    if (pt === TT_BLOCK_COMMENT && d.multi[prev] === 1) {
      return true;
    }
    return this.noCont === 1;
  }

  /** `endl`, or a literal ending in a `\n`. */
  endsLine(t: i32): boolean {
    const d = this.d;
    const k = d.kind[t];
    if (k === K_IDENT && d.len(t) === 4 && d.at(d.start[t]) === 101 && d.at(d.start[t] + 1) === 110 && d.at(d.start[t] + 2) === 100 && d.at(d.start[t] + 3) === 108) {
      return true;
    }
    if (k === K_STRING || k === K_CHAR || k === K_NUMBER) {
      const e = d.end[t];
      if (k === K_STRING && e - d.start[t] >= 3 && d.at(e - 1) === 34 && d.at(e - 2) === 110 && d.at(e - 3) === 92) {
        return true;
      }
      if (k === K_CHAR && e - d.start[t] === 4 && d.at(d.start[t] + 1) === 92 && d.at(d.start[t] + 2) === 110) {
        return true;
      }
    }
    return false;
  }

  lengthToNextOperator(t: i32): i32 {
    const n = this.a.nextOp[t];
    return n < 0 ? 0 : this.a.tot[n] - this.a.tot[t];
  }

  newLineColumn(): i32 {
    const cur = this.next;
    if (cur < 0 || uncheckedGet(this.d.prv, cur) < 0) {
      return 0;
    }
    const r = uncheckedGet(this.a.nlc, cur);
    const rc = this.rec;
    const o = this.topRec * RS + RF;
    const ind = uncheckedGet(rc, o + R_IND);
    const ls = uncheckedGet(rc, o + R_LS);
    const ci = (ls > ind ? ls : ind) + this.d.opts.continuationIndent;
    if ((r & N_BLOCK) !== 0) {
      return uncheckedGet(this.a.nest, cur) === 0 ? this.firstIndent : ind;
    }
    if ((r & N_CLOSEBR) !== 0 && this.sp > 1) {
      const b = uncheckedGet(rc, this.topRec * RS + RP) * RS + RF;
      if ((r & N_CLOSEBL) !== 0) {
        return uncheckedGet(rc, b + R_NBI);
      }
      if ((r & N_BRINIT) !== 0) {
        return uncheckedGet(rc, b + R_LS);
      }
      return this.firstIndent;
    }
    if ((r & N_RPAREN) !== 0 && this.sp > 1) {
      return uncheckedGet(rc, uncheckedGet(rc, this.topRec * RS + RP) * RS + RF + R_LS);
    }
    if ((r & N_STRING) !== 0 && this.sosl !== 0) {
      return this.sosl;
    }
    if ((r & N_LESSLESS) !== 0) {
      const fll = uncheckedGet(rc, o + R_FLL);
      if (fll !== 0) {
        return fll;
      }
    }
    if ((r & N_MEMBER) !== 0) {
      const cc = uncheckedGet(rc, o + R_CC);
      return cc === 0 ? ci : cc;
    }
    if ((r & N_QC) !== 0) {
      const qc = uncheckedGet(rc, o + R_QC);
      if (qc !== 0) {
        if ((r & N_QCIND) !== 0 && (uncheckedGet(rc, o + R_FL) & F_IWC) === 0) {
          return ind - this.d.opts.continuationIndent;
        }
        return qc;
      }
    }
    if ((r & N_COMMA) !== 0) {
      const vp = uncheckedGet(rc, o + R_VP);
      if (vp !== 0) {
        return vp;
      }
    }
    if ((r & N_RQC) !== 0) {
      return ind + this.d.opts.indentWidth;
    }
    if ((r & N_CTORCOL) !== 0) {
      return this.firstIndent + 4;
    }
    if ((r & N_MAXLSIND) !== 0) {
      return ls > ind ? ls : ind;
    }
    if ((r & N_SUBSCRIPT) !== 0) {
      const so = uncheckedGet(rc, o + R_SOAS);
      return so !== 0 ? so : ci;
    }
    if ((r & N_CI) !== 0) {
      return ci;
    }
    if ((r & N_IND) !== 0) {
      return ind;
    }
    if ((r & N_CI2) !== 0) {
      return ci;
    }
    if ((r & N_PNCOK) !== 0 && ind === this.firstIndent) {
      return ind + this.d.opts.continuationIndent;
    }
    return ind;
  }

  /** The outermost implicit paren starting at `t`, or -1. */
  outerFake(t: i32): i32 {
    const h = this.a.fkHead[t];
    return h < 0 ? -1 : this.a.fkPrec[h];
  }

  // ---- Steps ----------------------------------------------------------------

  addToken(newline: boolean, extra: i32): i64 {
    this.noCont = 0;
    let pen: i64 = 0;
    if (newline) {
      pen = this.addOnNewLine();
    } else {
      this.addOnCurrentLine(extra);
    }
    return this.moveToNext(newline) + pen;
  }

  addOnCurrentLine(extra: i32): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    // An implicit string literal keeps the whitespace before it as written:
    // after a newline in it, the column is the written one (clang-format's
    // 1-based spelling column).
    if (d.anyImplicit && d.type[cur] === TT_IMPLICIT_STRING_LITERAL) {
      this.col = implicitColumn(d, cur, this.col);
      const fm0 = this.fm;
      if (!this.dry && fm0 !== null) {
        fm0.emit(cur, 0, this.col);
      }
      return;
    }
    const r = uncheckedGet(a.cf, cur);
    if ((r & C_NOLB) !== 0) {
      this.noLB = 1;
    }
    if ((r & C_VP) !== 0 && this.top(R_VP) === 0) {
      let vp = this.col;
      let tk = d.prv[cur];
      while (tk >= 0 && vp >= d.width[tk]) {
        vp = vp - d.width[tk];
        if (d.spaces[tk] !== 0) {
          break;
        }
        tk = d.prv[tk];
      }
      this.setTop(R_VP, vp);
    }
    const spaces = d.spaces[cur] + extra;
    const fm = this.fm;
    if (!this.dry && fm !== null) {
      fm.emit(cur, 0, this.col + spaces);
    }
    if ((r & C_ALIGN) !== 0) {
      this.setTop(R_IND, this.col + spaces);
      this.setTopFlag(F_ALIGNED, true);
    }
    if ((r & C_NEXTPARAM) !== 0 && this.topHas(F_AVOID)) {
      this.setTopFlag(F_NOLB, true);
    }
    if ((r & C_BUILDER) !== 0 && this.col > this.newLineColumn()) {
      this.setTopFlag(F_CUB, true);
    }
    if ((r & C_MEMBERRP) !== 0) {
      this.setTopFlag(F_NOLB, true);
    }
    if ((r & C_NOLBOP) !== 0 || ((r & C_NOLBOP_LOW) !== 0 && !this.topHas(F_LOW))) {
      this.setTopFlag(F_NOLBOP, true);
    }
    this.col = this.col + spaces;
    const ls = (r >> C_LS_SHIFT) & 7;
    if (ls === 1) {
      this.setTop(R_LS, this.col);
      this.setTop(R_NBI, this.col);
    } else if (ls === 2) {
      this.setTop(R_LS, this.col);
    } else if (ls === 3) {
      this.setTop(R_IND, this.col);
      this.setTop(R_LS, this.col);
    } else if (ls === 4) {
      if (this.sp > 1 && this.at(this.sp - 2, R_CC) === 0) {
        this.setTop(R_LS, this.col);
      }
    }
  }

  /** The last comma directly inside the bracket `o`, or -1. */
  lastComma(o: i32): i32 {
    const d = this.d;
    const c = d.match[o];
    if (c < 0) {
      return -1;
    }
    let last = -1;
    for (let t = d.nxt[o]; t >= 0 && t !== c; t = d.nxt[t]) {
      if (this.a.opensScope(t) && d.match[t] > t) {
        t = d.match[t];
        continue;
      }
      if (d.kind[t] === P_COMMA) {
        last = t;
      }
    }
    return last;
  }

  addOnNewLine(): i64 {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = d.prv[cur];
    let pen: i64 = 0;
    const pnc = a.prevNonComment(cur);
    let nnc = a.nextNonComment(prev);
    if (nnc < 0) {
      nnc = cur;
    }
    if (!this.topHas(F_CLB)) {
      pen = pen + 15;
    }
    this.setTopFlag(F_CLB, true);
    pen = pen + toI64(a.pen[cur]);
    if (d.kind[nnc] === P_LESSLESS && this.top(R_FLL) === 0 && (this.col <= d.opts.columnLimit / 3 || this.topHas(F_BBP))) {
      pen = pen + toI64(PEN_FIRST_LESSLESS);
    }
    this.col = this.newLineColumn();
    if (d.type[cur] !== TT_TRAILING_RETURN_ARROW && !a.isTrailingReturnArrow(cur)) {
      this.setTop(R_NBI, this.col);
    }
    if (a.isMemberAccess(nnc)) {
      if (this.top(R_CC) === 0) {
        this.setTop(R_CC, this.col);
      }
    }
    const pnk = pnc >= 0 ? d.kind[pnc] : -1;
    const pnt = pnc >= 0 ? d.type[pnc] : -1;
    if ((pnc >= 0 && (pnk === P_COMMA || pnk === P_SEMI) && !this.topHas(F_AVOID)) || d.type[prev] === TT_BINARY_OPERATOR) {
      this.setTopFlag(F_BBP, false);
    }
    if (pnc >= 0 && (pnt === TT_TEMPLATE_CLOSER || a.crc[pnc] === 1) && a.nest[cur] === 0) {
      this.setTopFlag(F_BBP, false);
    }
    if (d.kind[nnc] === P_QUESTION || pnk === P_QUESTION) {
      this.setTopFlag(F_BBP, true);
    }
    if (d.type[cur] === TT_BINARY_OPERATOR && a.canB[cur] === 1) {
      this.setTopFlag(F_BBP, false);
    }
    if (!this.dry) {
      let nls = d.nl[cur];
      if (nls > 2) {
        nls = 2;
      }
      if (nls < 1) {
        nls = 1;
      }
      if (d.kind[cur] === P_RBRACE) {
        const m = d.match[cur];
        if (m >= 0 && d.childHead[m] >= 0) {
          nls = 1;
        }
      }
      const fm = this.fm;
      if (fm !== null) {
        fm.emit(cur, nls, this.col);
      }
    }
    if (!a.isTrailingComment(cur)) {
      this.setTop(R_LS, this.col);
    }
    if (d.kind[cur] === P_LESSLESS) {
      this.setTop(R_LS, this.top(R_LS) + 3);
    }
    this.sol = a.nest[cur];
    this.lowest = a.nest[cur];
    // Any break means the levels around have broken (clang-format's
    // NestedBlockSpecialCase: not for the `}` of a requires expression).
    if (!(d.kind[cur] === P_RBRACE && d.match[cur] >= 0 && requiresExprBrace(d, d.match[cur]))) {
      this.flagAll(F_BBP, false);
    }
    if (
      pnc >= 0 &&
      pnk !== P_COMMA &&
      pnk !== P_COLON &&
      pnk !== P_SEMI &&
      ((pnt !== TT_TEMPLATE_CLOSER && a.crc[pnc] === 0) || a.nest[cur] !== 0) &&
      pnt !== TT_BINARY_OPERATOR &&
      pnt !== TT_FUNCTION_ANNOTATION_RPAREN &&
      d.type[cur] !== TT_BINARY_OPERATOR &&
      !a.opensScope(pnc)
    ) {
      this.setTopFlag(F_BBP, true);
    }
    if (pnc >= 0 && (pnk === P_LBRACE || pnt === TT_ARRAY_INITIALIZER_LSQUARE)) {
      this.setTopFlag(F_BBCB, true);
    }
    if (this.topHas(F_AVOID)) {
      const pk = d.kind[prev];
      if (!(pk === P_LPAREN || pk === P_LBRACE || d.type[prev] === TT_BINARY_OPERATOR)) {
        this.setTopFlag(F_BBP, true);
      }
    }
    return pen;
  }

  moveToNext(newline: boolean): i64 {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const mf = uncheckedGet(a.mf, cur);
    if ((mf & M_NOLBOP_CLR) !== 0) {
      this.setTopFlag(F_NOLBOP, false);
    }
    if ((mf & M_INHCOLON) !== 0) {
      this.setTopFlag(F_AVOID, true);
    }
    if ((mf & M_LESSLESS) !== 0) {
      if (this.top(R_FLL) === 0) {
        this.setTop(R_FLL, this.col);
      } else {
        this.setTopFlag(F_LOW, newline);
      }
    }
    if ((mf & M_LOW) !== 0) {
      this.setTopFlag(F_LOW, newline);
    }
    if ((mf & M_SUBSCRIPT) !== 0 && this.top(R_SOAS) === 0) {
      this.setTop(R_SOAS, this.col);
    }
    if ((mf & M_IWC) !== 0) {
      this.setTopFlag(F_IWC, true);
    }
    if ((mf & M_QUESTION) !== 0) {
      this.setTop(R_QC, this.col);
    }
    if ((mf & M_LOWEST) !== 0) {
      const nst = uncheckedGet(a.nest, cur);
      if (nst < this.lowest) {
        this.lowest = nst;
      }
    }
    if ((mf & M_MEMBER) !== 0) {
      this.setTop(R_SOFC, a.nextOp[cur] < 0 ? 0 : this.col);
    }
    if ((mf & M_CTORCOLON) !== 0) {
      this.setTop(R_IND, this.col + 2);
      this.setTop(R_NBI, this.top(R_IND));
      this.setTopFlag(F_BBP, false);
    }
    if ((mf & M_INHCOLON) !== 0) {
      this.setTop(R_IND, this.firstIndent + 4);
    }
    if ((mf & M_NBINL) !== 0 && newline) {
      this.setTop(R_NBI, this.col + d.width[cur] + 1);
    }
    if ((mf & M_LSSET) !== 0) {
      this.setTop(R_LS, this.col);
    }
    if ((mf & M_AFTERBRACE) !== 0 && this.sp > 1 && !this.topHas(F_HMNB)) {
      if ((this.at(this.sp - 2, R_FL) & F_NBI) !== 0 && newline) {
        this.flagAll(F_NOLB, false);
      }
      this.setAt(this.sp - 2, R_FL, this.at(this.sp - 2, R_FL) & ~F_NBI);
    }
    if ((mf & M_NBIPREV) !== 0) {
      this.setTopFlag(F_NBI, !newline && (mf & M_NBIINL) !== 0);
    }
    if ((mf & M_FAKEL) !== 0) {
      this.pastFakeL(newline);
    }
    if ((mf & M_CLOSES) !== 0) {
      this.pastScopeCloser();
    }
    const allowBreak = (this.top(R_FL) & (F_NOLB | F_NOLBOP)) === 0;
    if ((mf & M_OPENS) !== 0) {
      this.pastScopeOpener(newline);
    }
    if ((mf & M_FAKER) !== 0) {
      this.pastFakeR();
    }
    if ((mf & M_STRING) !== 0) {
      if (this.sosl === 0) {
        this.sosl = this.col;
      }
    } else if ((mf & M_SOSLRESET) !== 0) {
      this.sosl = 0;
    }
    this.col = this.col + (d.kind[cur] !== K_COMMENT ? d.width[cur] : this.widthAt(cur, this.col));
    this.next = cur === this.lineLast ? -1 : d.nxt[cur];
    let pen: i64 = 0;
    if ((mf & M_EOL) !== 0) {
      pen = this.endOfLine(cur, allowBreak);
    } else if (this.col > this.lim) {
      pen = PEN_EXCESS * toI64(this.col - this.lim);
    }
    if ((mf & M_ROLEAVOID) !== 0) {
      this.setTopFlag(F_AVOID, true);
    }
    if ((mf & M_PREVROLE) !== 0) {
      pen = pen + this.formatListAfter(a.pnc[cur], cur);
    }
    return pen;
  }

  pastFakeL(newline: boolean): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    let node = a.fkHead[cur];
    if (node < 0) {
      return;
    }
    const prev = a.prevNonComment(cur);
    let skipFirst = false;
    if (prev >= 0) {
      const pk = d.kind[prev];
      skipFirst = a.opensScope(prev) || pk === P_SEMI || pk === KW_RETURN || a.rqc[prev] === 1 || a.prec(prev) === PREC_ASSIGNMENT;
    }
    const trailing = a.isTrailingComment(cur);
    let first = true;
    while (node >= 0) {
      const p = a.fkPrec[node];
      const topNoLbop = this.topHas(F_NOLBOP);
      const topLs = this.top(R_LS);
      const topIwc = this.topHas(F_IWC);
      this.dupTop();
      let fl = this.top(R_FL);
      fl = fl & ~(F_CLB | F_ICC | F_IWC);
      fl = fl | F_LOW;
      if (topNoLbop) {
        fl = fl | F_NOLB;
      }
      if (p > PREC_COMMA) {
        fl = fl & ~F_AVOID;
      }
      this.setTop(R_TOK, -1);
      if (!trailing && (prev < 0 || d.kind[prev] !== KW_RETURN || p > 0)) {
        let ind = this.top(R_IND);
        if (this.col > ind) {
          ind = this.col;
        }
        if (topLs > ind) {
          ind = topLs;
        }
        this.setTop(R_IND, ind);
      }
      // A `_Generic` selection's associations indent from the keyword's
      // line, not under the parenthesis.
      if (prev >= 0 && d.kind[prev] === P_LPAREN) {
        const gk = a.prevNonComment(prev);
        if (gk >= 0 && d.kind[gk] === KW_GENERIC) {
          this.setTop(R_IND, topLs);
        }
      }
      if ((this.unindentNext(cur) || (prev >= 0 && p === PREC_CONDITIONAL && d.kind[prev] === P_QUESTION && d.type[prev] === TT_CONDITIONAL_EXPR)) && !newline) {
        fl = fl | F_ALIGNED;
      }
      if (p > PREC_UNKNOWN && this.col > this.top(R_LS)) {
        this.setTop(R_LS, this.col);
      }
      if (p !== PREC_CONDITIONAL && d.type[cur] !== TT_UNARY_OPERATOR) {
        this.setTop(R_SOFC, this.col);
      }
      if (p === PREC_CONDITIONAL && prev >= 0 && d.kind[prev] === P_COLON && d.type[prev] === TT_CONDITIONAL_EXPR && first && !topIwc) {
        fl = fl | F_ICC;
      } else if (p === PREC_CONDITIONAL || (!skipFirst && p > PREC_ASSIGNMENT && !trailing)) {
        this.setTop(R_IND, this.top(R_IND) + d.opts.continuationIndent);
      }
      if ((prev >= 0 && !a.opensScope(prev)) || p !== PREC_COMMA) {
        fl = fl & ~F_BBP;
      }
      this.setTop(R_FL, fl);
      skipFirst = false;
      first = false;
      node = a.fkNext[node];
    }
  }

  unindentNext(t: i32): boolean {
    const p = this.a.prevNonComment(t);
    return p >= 0 && (this.a.prec(p) === PREC_ASSIGNMENT || this.d.kind[p] === KW_RETURN || this.a.rqc[p] === 1);
  }

  pastFakeR(): void {
    const n = this.a.fakeR[this.next];
    for (let i = 0; i < n; i++) {
      const vp = this.top(R_VP);
      if (this.sp === 1) {
        break;
      }
      this.pop();
      this.setTop(R_VP, vp);
    }
    if (this.a.crc[this.next] === 1) {
      this.setTop(R_LS, this.top(R_LS) - this.d.opts.indentWidth);
    }
  }

  pastScopeOpener(newline: boolean): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    if (!a.opensScope(cur)) {
      return;
    }
    if (d.match[cur] >= 0 && d.kind[cur] === P_LBRACE && d.bk[cur] === BK_BLOCK) {
      const nbi = this.top(R_NBI);
      this.push(cur, nbi + d.opts.indentWidth, this.top(R_LS), true, false);
      this.setTop(R_NBI, nbi);
      this.setTopFlag(F_BBP, true);
      return;
    }
    let newIndent = 0;
    let ls = this.top(R_LS);
    let avoid = false;
    let bbp = false;
    let nbi = this.top(R_SOFC) > this.top(R_NBI) ? this.top(R_SOFC) : this.top(R_NBI);
    const ck = d.kind[cur];
    const m = d.match[cur];
    if (ck === P_LBRACE || d.type[cur] === TT_ARRAY_INITIALIZER_LSQUARE) {
      if (a.opensBlockList(cur)) {
        newIndent = d.opts.indentWidth + (this.col < this.top(R_NBI) ? this.col : this.top(R_NBI));
      } else {
        newIndent = this.top(R_LS) + d.opts.continuationIndent;
      }
      const nn = a.nextNonComment(cur);
      const endsInComma = m >= 0 && d.kind[d.prv[m]] === P_COMMA;
      avoid = endsInComma || (nn >= 0 && (d.type[nn] === TT_DESIGNATED_INITIALIZER_PERIOD || d.type[nn] === TT_DESIGNATED_INITIALIZER_LSQUARE));
      bbp = endsInComma;
      if (a.pcnt[cur] > 1 && this.col + 1 > nbi) {
        nbi = this.col + 1;
      }
    } else {
      const base = this.top(R_LS) > this.top(R_SOFC) ? this.top(R_LS) : this.top(R_SOFC);
      newIndent = d.opts.continuationIndent + base;
      // A `_Generic` selection takes one association per line.
      const gp = a.prevNonComment(cur);
      if (ck === P_LPAREN && gp >= 0 && d.kind[gp] === KW_GENERIC) {
        avoid = true;
      }
      if (ck === P_LESS && this.parentIsParen(cur)) {
        if (this.top(R_IND) > newIndent) {
          newIndent = this.top(R_IND);
        }
        if (this.top(R_IND) > ls) {
          ls = this.top(R_IND);
        }
      }
    }
    const noLB = d.childHead[cur] < 0 && d.type[cur] !== TT_ARRAY_INITIALIZER_LSQUARE && (this.topHas(F_NOLB) || this.topHas(F_NOLBOP) || (d.type[cur] === TT_TEMPLATE_OPENER && this.topHas(F_CUB)));
    this.push(cur, newIndent, ls, avoid, noLB);
    this.setTop(R_NBI, nbi);
    this.setTopFlag(F_BBP, bbp);
    this.setTopFlag(F_HMNB, a.bpcnt[cur] > 1);
  }

  /** Whether the bracket enclosing `t` is a `(`. */
  parentIsParen(t: i32): boolean {
    const d = this.d;
    let r = this.topRec;
    while (r >= 0) {
      const tok = uncheckedGet(this.rec, r * RS + RF + R_TOK);
      if (tok >= 0) {
        return d.kind[tok] === P_LPAREN;
      }
      r = uncheckedGet(this.rec, r * RS + RP);
    }
    return t < 0;
  }

  pastScopeCloser(): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    if (!a.closesScope(cur)) {
      return;
    }
    const ck = d.kind[cur];
    if (this.sp > 1 && (ck === P_RPAREN || ck === P_RSQUARE || (ck === P_RBRACE && cur !== d.lFirst[this.line]) || d.type[cur] === TT_TEMPLATE_CLOSER)) {
      this.pop();
    }
    if (ck === P_RSQUARE) {
      const n = a.nextNonComment(cur);
      if (n >= 0 && d.kind[n] !== P_LSQUARE) {
        this.setTop(R_SOAS, 0);
      }
    }
  }

  endOfLine(cur: i32, allowBreak: boolean): i64 {
    const d = this.d;
    const a = this.a;
    let pen: i64 = 0;
    if (d.multi[cur] === 1 && d.type[cur] !== TT_BLOCK_COMMENT) {
      this.flagAll(F_BBP, true);
      const used = this.col;
      const fm = this.fm;
      this.col = fm !== null ? fm.lastLineWidth(cur) : d.width[cur];
      if (used > this.lim) {
        pen = pen + PEN_EXCESS * toI64(used - this.lim);
      }
    } else if (d.lType[this.line] !== LT_IMPORT && allowBreak && d.kind[cur] === K_STRING && d.lType[this.line] !== LT_PREPROCESSOR) {
      pen = pen + this.breakString(cur);
    }
    const fmc = this.fm;
    if (d.kind[cur] === K_COMMENT && d.type[cur] === TT_LINE_COMMENT && fmc !== null && d.lType[this.line] !== LT_IMPORT) {
      // A line comment is split to fit, as clang-format's breakProtrudingToken.
      pen = pen + fmc.commentPenalty(cur, this.col - d.width[cur]);
    } else if (d.kind[cur] === K_COMMENT && d.type[cur] === TT_BLOCK_COMMENT && fmc !== null && (this.col > this.lim || d.multi[cur] === 1 || (this.col + a.tot[this.lineLast] - a.tot[cur] > this.lim && this.col + fmc.unbreakableTail(cur) > this.lim))) {
      // So is a block comment, reflowed; one whose blanks were squeezed to
      // fit ends that much sooner.
      pen = pen + fmc.blockCommentPenalty(cur, this.col - d.width[cur]);
      if (d.multi[cur] === 0 && fmc.bcShrink > 0) {
        this.col = this.col - fmc.bcShrink;
      }
    } else if (this.col > this.lim) {
      pen = pen + PEN_EXCESS * toI64(this.col - this.lim);
    }
    // Line comments continuing this one's section go under it, each on its own line.
    if (d.kind[cur] === K_COMMENT && d.type[cur] === TT_LINE_COMMENT) {
      const startCol = this.col - d.width[cur];
      while (this.next >= 0 && d.kind[this.next] === K_COMMENT && d.type[this.next] === TT_LINE_COMMENT && d.nl[this.next] === 1 && this.continuesSection(this.next, d.prv[this.next])) {
        const fm = this.fm;
        if (!this.dry && fm !== null) {
          fm.emit(this.next, 1, startCol);
        }
        // Each is split or overflows where the section's column puts it.
        if (fm !== null && d.lType[this.line] !== LT_PREPROCESSOR) {
          pen = pen + fm.commentPenalty(this.next, startCol);
        }
        this.next = this.next === this.lineLast ? -1 : d.nxt[this.next];
      }
    }
    return pen;
  }

  /**
   * clang-format's continuesLineComment: whether own-line comment `c` after
   * line comment `prev` continues its section, by where it was written.
   */
  continuesSection(c: i32, prev: i32): boolean {
    const d = this.d;
    const f = d.lFirst[this.line];
    let minTok = f;
    for (let q = f; q >= 0; q = d.nxt[q]) {
      const n = d.nxt[q];
      if (n >= 0 && d.kind[q] === P_LBRACE && d.kind[n] === K_COMMENT && d.type[n] === TT_LINE_COMMENT) {
        minTok = q;
        break;
      }
      if (d.nl[q] > 0) {
        minTok = q;
      }
      if (q === prev) {
        break;
      }
    }
    const isLine = d.kind[minTok] === K_COMMENT && d.type[minTok] === TT_LINE_COMMENT;
    return d.origCol(c) >= d.origCol(minTok) + (isLine ? 0 : 1);
  }

  /** The prefix length (through the quote) of a breakable string literal, or 0. */
  stringPrefix(t: i32): i32 {
    const d = this.d;
    const a = d.start[t];
    const n = d.end[t] - a;
    if (n < 2 || d.at(d.end[t] - 1) !== 34) {
      return 0;
    }
    const c0 = d.at(a);
    if (c0 === 34) {
      return 1;
    }
    if ((c0 === 117 || c0 === 85 || c0 === 76 || c0 === 64) && d.at(a + 1) === 34) {
      return 2;
    }
    if (c0 === 117 && d.at(a + 1) === 56 && d.at(a + 2) === 34) {
      return 3;
    }
    return 0;
  }

  /** Columns of source bytes [a, b) starting at column `c` (tabs to stops of 8). */
  cols(a: i32, b: i32, c: i32): i32 {
    // Between tabs, clang-format's columnWidth: display columns, or the
    // byte count when a code point is not printable.
    const src = this.d.src;
    let w = 0;
    let seg = a;
    let high = false;
    for (let i = a; i < b; i++) {
      const ch = toI32(uncheckedGet(src, i));
      if (ch === 9) {
        w = w + (high ? utf8Width(src, seg, i) : i - seg);
        w = w + 8 - ((c + w) % 8);
        seg = i + 1;
        high = false;
      } else if (ch >= 128) {
        high = true;
      }
    }
    return w + (high ? utf8Width(src, seg, b) : b - seg);
  }

  /** The length of the escape sequence at `i` (a backslash), bounded by `e`. */
  escapeLen(i: i32, e: i32): i32 {
    const d = this.d;
    if (i + 1 >= e) {
      return 1;
    }
    const c = d.at(i + 1);
    if (c === 117) {
      return 6;
    }
    if (c === 85) {
      return 10;
    }
    if (c === 120) {
      let k = 2;
      while (i + k < e && isHex(d.at(i + k))) {
        k++;
      }
      return k;
    }
    if (c >= 48 && c <= 55) {
      let k = 1;
      while (i + k < e && k < 4 && d.at(i + k) >= 48 && d.at(i + k) <= 55) {
        k++;
      }
      return k;
    }
    return 1 + utf8Len(c);
  }

  /** Where to split string content [a, e) placed at `used`, within `limit`; -1 for nowhere. */
  stringSplit(a: i32, e: i32, used: i32, limit: i32): i32 {
    const d = this.d;
    if (a >= e || limit <= used) {
      return -1;
    }
    const maxSplit = limit - used;
    let spaceOff = 0;
    let slashOff = 0;
    let wordOff = 0;
    let split = 0;
    let chars = 0;
    let i = a;
    while (true) {
      const c = d.at(i);
      let adv = 1;
      if (c === 92) {
        adv = this.escapeLen(i, e);
        chars = chars + adv;
      } else {
        adv = utf8Len(c);
        if (c === 9) {
          chars = chars + 8 - ((used + chars) % 8);
        } else {
          chars = chars + 1;
        }
      }
      if (chars > maxSplit || e - i <= adv) {
        break;
      }
      if (c === 32 || c === 9 || c === 11 || c === 12 || c === 13) {
        spaceOff = split;
      }
      if (c === 47) {
        slashOff = split;
      }
      if (adv === 1 && !isAlnum(c)) {
        wordOff = split;
      }
      split = split + adv;
      i = i + adv;
    }
    if (spaceOff !== 0) {
      return spaceOff + 1;
    }
    if (slashOff !== 0) {
      return slashOff + 1;
    }
    if (wordOff !== 0) {
      return wordOff + 1;
    }
    if (split !== 0) {
      return split;
    }
    return -1;
  }

  /** Splits an overflowing string literal into adjacent literals; answers the penalty. */
  breakString(cur: i32): i64 {
    const d = this.d;
    const a = this.a;
    // Nothing to split when even the unbreakable tail after it fits.
    if (this.col + a.tail[cur] <= this.lim && a.strTab[cur] === 0) {
      return 0;
    }
    const pl = this.stringPrefix(cur);
    if (pl === 0) {
      return 0;
    }
    const utl = this.next >= 0 && this.canBreak() ? 0 : a.tail[cur];
    if (a.tail[cur] >= this.lim) {
      return 0;
    }
    const startCol = this.col - d.width[cur];
    const e = d.end[cur] - 1;
    let off = d.start[cur] + pl;
    let csc = startCol + pl;
    let rem = utl + 1 + this.cols(off, e, csc);
    let pen: i64 = 0;
    let n = 0;
    while (csc + rem > this.lim) {
      const sp = this.stringSplit(off, e, csc, this.lim - 1);
      if (sp < 0) {
        break;
      }
      csc = startCol + pl;
      const nr = utl + 1 + this.cols(off + sp, e, csc);
      if (nr >= rem) {
        break;
      }
      if (n >= toI32(this.cuts.length)) {
        this.cuts = growI32(this.cuts, n + 1);
      }
      this.cuts[n] = off + sp;
      n++;
      pen = pen + toI64(PEN_BREAK_STRING);
      off = off + sp;
      rem = nr;
    }
    this.col = csc + rem - a.tail[cur];
    if (n > 0) {
      // A string after others in a run of adjacent literals: on its next run
      // clang-format aligns each piece, now a literal of its own, under the
      // run's first string.
      let pieceCol = startCol;
      if (this.sosl > 0 && this.sosl < startCol) {
        pieceCol = this.sosl;
        this.col = this.col - (startCol - pieceCol);
      }
      this.flagAll(F_BBP, true);
      this.setTop(R_LS, pieceCol);
      const fm = this.fm;
      if (!this.dry && fm !== null) {
        fm.splitString(cur, pl, this.cuts, n, pieceCol);
      }
    }
    return pen;
  }

  /** Lays a braced list out in columns once its first item is placed. */
  formatListAfter(lb: i32, cur: i32): i64 {
    const d = this.d;
    const a = this.a;
    const r = a.role[lb];
    if (a.rlFmtN[r] <= 1 || this.next < 0) {
      return 0;
    }
    if (!(d.kind[lb] === P_LBRACE || d.type[lb] === TT_ARRAY_INITIALIZER_LSQUARE) || d.bk[lb] === BK_BLOCK || (d.nxt[lb] >= 0 && d.type[d.nxt[lb]] === TT_DESIGNATED_INITIALIZER_PERIOD)) {
      return 0;
    }
    const remaining = d.opts.columnLimit - this.col + d.width[cur];
    const f = a.columnFormat(r, remaining);
    if (f < 0) {
      return 10000;
    }
    let pen: i64 = 0;
    let column = 0;
    let item = 0;
    const co = a.rlCommaOff[r];
    const nc = a.rlCommaN[r];
    const cols = a.fmtCols[f];
    const so = a.fmtSizeOff[f];
    const io = a.rlItemOff[r];
    const close = d.match[lb];
    while (this.next >= 0 && this.next !== close) {
      let nl = false;
      let extra = 0;
      if (item < nc && d.prv[this.next] === a.commaPool[co + item]) {
        if (!a.isTrailingComment(this.next)) {
          extra = extra + a.sizePool[so + column] - a.itemLen[io + item];
          column++;
        }
        item++;
      }
      if (column === cols || a.mustB[this.next] === 1) {
        column = 0;
        nl = true;
      }
      // clang-format's column layout places no child block: a lambda body
      // in the list keeps its whitespace as written.
      const pv = d.prv[this.next];
      const fm = this.fm;
      if (!this.dry && fm !== null && pv >= 0 && d.childHead[pv] >= 0) {
        let c = d.childHead[pv];
        let last = -1;
        while (c >= 0) {
          while (d.lSibling[c] >= 0) {
            c = d.lSibling[c];
          }
          last = d.lLast[c];
          c = d.childHead[last];
        }
        if (last >= 0) {
          const e = d.end[last];
          fm.emitRaw(d.end[pv], d.at(e) === 32 ? e + 1 : e);
        }
      }
      pen = pen + this.addToken(nl, extra);
    }
    return pen;
  }

  // ---- Children ---------------------------------------------------------

  /** Places a child block before the next token; false when it cannot go on this line. */
  formatChildren(newline: boolean): i64 {
    const d = this.d;
    const a = this.a;
    const nt = this.next;
    const prev = d.prv[nt];
    const lb = a.prevNonComment(nt);
    if (d.childHead[prev] < 0 || lb < 0 || !(d.kind[lb] === P_LBRACE && d.bk[lb] === BK_BLOCK)) {
      return 0;
    }
    const c0 = d.childHead[prev];
    if (newline) {
      let lv = c0;
      while (d.lAbs[lv] === 1 && d.lSibling[lv] >= 0) {
        lv = d.lSibling[lv];
      }
      const addInd = this.top(R_IND) - d.lLevel[lv] * d.opts.indentWidth;
      if (this.lazyKids) {
        // Counted when the state reaches the front of the queue.
        this.pendHead = c0;
        this.pendInd = addInd;
        return 0;
      }
      return this.childList(c0, addInd);
    }
    const cf = d.lFirst[c0];
    // A block literal's body never shares its line (AllowShortBlocksOnASingleLine: Never).
    if (a.mustB[cf] === 1 || d.kind[prev] === K_COMMENT || d.childCount[prev] > 1 || d.type[prev] === TT_BLOCK_LITERAL_LBRACE) {
      return -1;
    }
    const cl = d.lLast[c0];
    if (a.isTrailingComment(cl)) {
      return -1;
    }
    if (a.tot[cl] + this.col + 2 > this.lim) {
      return -1;
    }
    const at = this.col + 1;
    const o = this.save();
    const saved = this.saveLine();
    const rb = this.nrec;
    const pen = this.formatLine(c0, at, 0, this.dry, true);
    this.restoreLine(saved);
    this.nrec = rb;
    this.load(o);
    this.pn = o;
    this.col = this.col + 1 + a.tot[cl];
    return pen;
  }

  /** The penalty of child block list `head` at `addInd` (emitted unless dry). */
  childList(head: i32, addInd: i32): i64 {
    const o = this.save();
    const saved = this.saveLine();
    const rb = this.nrec;
    let pen: i64 = 0;
    if (this.dry) {
      const key = head * 4096 + (addInd & 4095);
      let h = Math.imul(key, 0x2545f491) >>> 20;
      let found = false;
      for (let i = 0; i < 4096; i++) {
        const s = (h + i) & 4095;
        if (this.cacheStamp[s] !== this.fileStamp) {
          break;
        }
        if (this.cacheKey[s] === key) {
          pen = this.cacheVal[s];
          found = true;
          break;
        }
      }
      if (found) {
        this.stListHit = this.stListHit + 1;
      }
      if (!found) {
        this.stListMiss = this.stListMiss + 1;
        const fm = this.fm;
        pen = fm !== null ? fm.listPenalty(head, addInd) & U32 : 0;
        for (let i = 0; i < 4096; i++) {
          const s = (h + i) & 4095;
          if (this.cacheStamp[s] !== this.fileStamp) {
            this.cacheStamp[s] = this.fileStamp;
            this.cacheKey[s] = key;
            this.cacheVal[s] = pen;
            break;
          }
        }
      }
      h = 0;
    } else {
      const fm = this.fm;
      if (fm !== null) {
        fm.emitList(head, addInd, true);
      }
    }
    this.restoreLine(saved);
    this.nrec = rb;
    this.load(o);
    this.pn = o;
    return pen;
  }

  saveLine(): i32 {
    // line, firstIndent, lim, lineLast, dry packed into the pool.
    const o = this.pn;
    if (o + 5 > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, o + 5);
    }
    this.pool[o] = this.line;
    this.pool[o + 1] = this.firstIndent;
    this.pool[o + 2] = this.lim;
    this.pool[o + 3] = this.lineLast;
    this.pool[o + 4] = this.dry ? 1 : 0;
    this.pn = o + 5;
    return o;
  }

  restoreLine(o: i32): void {
    this.line = this.pool[o];
    this.firstIndent = this.pool[o + 1];
    this.lim = this.pool[o + 2];
    this.lineLast = this.pool[o + 3];
    this.dry = this.pool[o + 4] === 1;
  }

  // ---- Lines ------------------------------------------------------------

  /** Mixes `v` into the two running hashes. */
  mix(v: i32): void {
    this.hh1 = Math.imul(this.hh1 ^ v, 0x01000193);
    this.hh2 = Math.imul(wrappingAdd(this.hh2, v), 0x2545f491) ^ (this.hh2 >>> 15);
  }

  /**
   * Hashes everything a search of line `l` at `indent` reads; false when the
   * line has child blocks (their layout feeds in) and so is not cached by content.
   */
  contentHash(l: i32, indent: i32): boolean {
    // What a line's annotation and search are computed from: its tokens'
    // bytes, roles, spacing, widths and bracket structure, and its line facts.
    const d = this.d;
    const a = this.a;
    this.hh1 = 0x011c9dc5;
    this.hh2 = 0x5bd1e995;
    this.mix(indent);
    this.mix(this.lim);
    this.mix(d.lType[l] | (d.lMightFn[l] << 4) | (d.lMultiVar[l] << 5) | (d.lMustDecl[l] << 6));
    const f = d.lFirst[l];
    const last = d.lLast[l];
    this.hlen = 0;
    const src = d.src;
    for (let t = f; ; t = d.nxt[t]) {
      if (d.childHead[t] >= 0) {
        return false;
      }
      this.hlen = this.hlen + 1;
      this.mix(d.kind[t] | (d.type[t] << 8) | (d.bk[t] << 16) | (d.multi[t] << 18) | (a.mustB[t] << 19) | (d.spaces[t] << 20) | (d.unesc[t] << 21) | (d.inPP[t] << 23) | (d.mustBreak[t] << 24) | (d.dec[t] << 25));
      this.mix(d.width[t] | ((d.nl[t] > 2 ? 2 : d.nl[t]) << 16));
      if (d.anyImplicit && d.type[t] === TT_IMPLICIT_STRING_LITERAL && t !== f) {
        this.mix(implicitColumn(d, t, 0));
      }
      this.mix(d.match[t] < 0 ? -1 : d.match[t] - t);
      if (d.kind[t] === K_COMMENT || d.nl[t] > 0) {
        // Comment sections continue by the columns tokens were written at.
        this.mix(d.col[t]);
      }
      const pp = d.prv[t];
      this.mix((a.joined[t] > 0 ? 1 : 0) | (pp >= 0 && t > pp + 1 && d.inPP[t - 1] === 1 ? 2 : 0) | (d.len(t) << 2));
      const k = d.kind[t];
      if (k === K_STRING || k === K_CHAR || d.multi[t] === 1) {
        // Splitting and the `<<` rules read literal bytes; names matter only as `endl`.
        for (let i = d.start[t]; i < d.end[t]; i++) {
          this.mix(toI32(uncheckedGet(src, i)));
        }
      } else if (k === K_IDENT && this.endsLine(t)) {
        this.mix(-11);
      }
      if (t === last) {
        break;
      }
    }
    return true;
  }

  /** The content cache slot for the current hash (found or free); -1 when the probe runs out. */
  ccSlot(len: i32): i32 {
    let i = this.hh1 & (CC_SIZE - 1);
    for (let k = 0; k < 32; k++) {
      const s = (i + k) & (CC_SIZE - 1);
      if (this.ccLen[s] === 0) {
        return s;
      }
      if (this.ccH1[s] === this.hh1 && this.ccH2[s] === this.hh2 && this.ccLen[s] === len) {
        return s;
      }
    }
    return -1;
  }

  /**
   * Formats line `l` at `indent` (its first token after `nl` newlines, which
   * the caller has not emitted); answers the penalty. `inline` marks a child
   * line placed after its `{` on the parent's line.
   */
  formatLine(l: i32, indent: i32, nl: i32, dry: boolean, inline: boolean): i64 {
    const d = this.d;
    const a = this.a;
    a.annotate(l);
    this.line = l;
    this.firstIndent = indent;
    this.lim = d.opts.columnLimit;
    this.lineLast = d.lLast[l];
    this.dry = dry;
    const f = d.lFirst[l];
    const fm = this.fm;
    if (!dry && fm !== null) {
      fm.emit(f, inline ? 0 : nl, indent);
    }
    let fitLim = this.lim;
    if (d.lPP[l] === 1) {
      // A directive leaves room for ` \`; only a line the directive continues past must.
      this.lim = this.lim - 2;
      const nx = d.lSibling[l];
      const pp = d.ppId[f];
      if (pp >= 0 && nx >= 0 && d.ppId[d.lFirst[nx]] === pp) {
        fitLim = this.lim;
      }
    }
    const fits = a.tot[this.lineLast] + indent <= fitLim || d.lType[l] === LT_IMPORT;
    if (this.debug && !dry) {
      this.dump(l, fits);
    }
    // A string holding a tab is measured again where it lands: clang-format
    // splits it there even on a line that fits by its written width.
    if (fits && !inline && d.strTabs && this.lineHasTabString(l)) {
      a.annotateFull(l);
      return this.noLineBreak();
    }
    if (fits && !inline && a.lLate[l] === 1) {
      // It fits but for a break clang-format sets late: only that break.
      a.annotateFull(l);
      return this.noLineBreak();
    }
    if (fits || inline) {
      // It fits (an inline child was checked by its parent): no break, no cost.
      if (!dry) {
        this.emitFlat(l, indent);
      }
      return 0;
    }
    const slot = this.rcSlot(l, indent);
    if (this.rcHit(slot) && this.rcN[slot] >= 0) {
      if (!dry) {
        a.annotateFull(l);
        this.replayBits(this.rcOff[slot], this.rcN[slot]);
      }
      return this.rcPen[slot];
    }
    // The same line (by content) broken before, in this file or an earlier one.
    let ntok = 0;
    let cslot = -1;
    if (this.contentHash(l, indent)) {
      ntok = this.hlen;
      cslot = this.ccSlot(ntok);
      if (cslot >= 0 && this.ccLen[cslot] === ntok && this.ccH1[cslot] === this.hh1 && this.ccH2[cslot] === this.hh2) {
        const n = this.ccN[cslot];
        if (n > toI32(this.pathBits.length)) {
          this.pathBits = growI32(this.pathBits, n * 2);
        }
        for (let i = 0; i < n; i++) {
          this.pathBits[i] = this.ccBits[this.ccOff[cslot] + i];
        }
        this.pathN = n;
        const cpen = this.ccPen[cslot];
        this.rcStore(slot, l, indent, cpen, true);
        if (!dry) {
          a.annotateFull(l);
          this.replayPath();
        }
        return cpen;
      }
    }
    const h1 = this.hh1;
    const h2 = this.hh2;
    a.annotateFull(l);
    const pen = this.search();
    if (cslot >= 0 && this.pathN >= 0 && this.ccLen[cslot] === 0 && this.ccUsed * 2 < CC_SIZE) {
      const n = this.pathN;
      if (this.ccNb + n > toI32(this.ccBits.length)) {
        this.ccBits = growI32(this.ccBits, (this.ccNb + n) * 2);
      }
      for (let i = 0; i < n; i++) {
        this.ccBits[this.ccNb + i] = this.pathBits[i];
      }
      this.ccH1[cslot] = h1;
      this.ccH2[cslot] = h2;
      this.ccLen[cslot] = ntok;
      this.ccPen[cslot] = pen;
      this.ccOff[cslot] = this.ccNb;
      this.ccN[cslot] = n;
      this.ccNb = this.ccNb + n;
      this.ccUsed = this.ccUsed + 1;
    }
    if (this.pathN >= 0) {
      this.rcStore(slot, l, indent, pen, true);
      if (!dry) {
        this.pathOff = this.nbits - this.pathN;
        if (this.rcHit(slot) && this.rcN[slot] >= 0) {
          this.replayBits(this.rcOff[slot], this.rcN[slot]);
        } else {
          this.replayPath();
        }
      }
    } else if (!dry) {
      // No layout found: clang-format does nothing, so the line's tokens
      // after the first and its blocks' lines keep their whitespace.
      this.keepAsWritten(l, false);
      this.dry = false;
      this.asWritten = true;
      const kp = this.noLineBreak();
      this.asWritten = false;
      return kp;
    }
    return pen;
  }

  /** Marks line `l`'s tokens (from the second, unless `all`) and its blocks' lines to keep their whitespace. */
  keepAsWritten(l: i32, all: boolean): void {
    const d = this.d;
    const f = d.lFirst[l];
    for (let t = f; t >= 0; t = d.nxt[t]) {
      // An earlier pass's tokens are finalized: that pass's layout stands.
      const fm = this.fm;
      if ((t !== f || all) && !(fm !== null && fm.seenTok(t))) {
        d.keepWs[t] = 1;
      }
      for (let c = d.childHead[t]; c >= 0; c = d.lSibling[c]) {
        this.keepAsWritten(c, true);
      }
    }
  }

  dump(l: i32, fits: boolean): void {
    const d = this.d;
    const a = this.a;
    console.error(`line ${l} level ${d.lLevel[l]} type ${d.lType[l]} fn ${d.lMightFn[l]} decl ${d.lMustDecl[l]} fits ${fits}`);
    for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
      let fk = "";
      for (let n = a.fkHead[t]; n >= 0; n = a.fkNext[n]) {
        fk = fk + `${a.fkPrec[n]} `;
      }
      console.error(`  ${d.text(t)}  tt=${d.type[t]} nest=${a.nest[t]} bind=${a.bind[t]} can=${a.canB[t]} must=${a.mustB[t]} pen=${a.pen[t]} tot=${a.tot[t]} sp=${d.spaces[t]} fk=[${fk}] fr=${a.fakeR[t]} pc=${a.pcnt[t]} ch=${d.childHead[t]}`);
      if (t === d.lLast[l]) {
        break;
      }
    }
  }

  /** Emits line `l` (its first token already at `col`) on one line, child blocks inline. */
  emitFlat(l: i32, col0: i32): i32 {
    const d = this.d;
    const fm = this.fm;
    const f = d.lFirst[l];
    const last = d.lLast[l];
    let col = col0;
    for (let t = f; ; t = d.nxt[t]) {
      if (t !== f) {
        col = d.anyImplicit && d.type[t] === TT_IMPLICIT_STRING_LITERAL ? implicitColumn(d, t, col) : col + d.spaces[t];
        if (fm !== null) {
          fm.emit(t, 0, col);
        }
      }
      col = col + (d.kind[t] !== K_COMMENT ? d.width[t] : this.widthAt(t, col));
      const c = d.childHead[t];
      if (c >= 0) {
        if (fm !== null) {
          fm.emit(d.lFirst[c], 0, col + 1);
        }
        col = this.emitFlat(c, col + 1);
      }
      if (t === last) {
        break;
      }
    }
    return col;
  }

  /**
   * Token `t`'s width at column `col`: a one-line block comment holding a tab
   * is measured where it lands, as clang-format's breakable comment does.
   */
  widthAt(t: i32, col: i32): i32 {
    const d = this.d;
    const fm = this.fm;
    if (d.kind[t] !== K_COMMENT || d.multi[t] === 1 || d.type[t] === TT_LINE_COMMENT || fm === null || !fm.hasTab(t)) {
      return d.width[t];
    }
    return fm.colsAt(d.start[t], d.end[t], col);
  }

  initialState(): i64 {
    const f = this.d.lFirst[this.line];
    this.col = this.firstIndent;
    this.next = f;
    this.noCont = 0;
    this.sol = 0;
    this.lowest = 0;
    this.sosl = 0;
    this.noLB = 0;
    this.sp = 0;
    this.topRec = -1;
    this.fresh0 = this.nrec;
    this.push(-1, this.firstIndent, this.firstIndent, false, false);
    return this.moveToNext(false);
  }

  /** Whether line `l` holds a string literal with a tab in it. */
  lineHasTabString(l: i32): boolean {
    const d = this.d;
    for (let t = d.lFirst[l]; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] === K_STRING) {
        for (let i = d.start[t]; i < d.end[t]; i++) {
          if (d.at(i) === 9) {
            return true;
          }
        }
      }
    }
    return false;
  }

  noLineBreak(): i64 {
    let pen: i64 = 0;
    this.initialState();
    while (this.next >= 0) {
      let cp = this.formatChildren(false);
      // A line written as it is still has its blocks' lines, as written.
      if (cp < 0 && this.asWritten) {
        cp = this.formatChildren(true);
      }
      if (cp > 0) {
        pen = pen + cp;
      }
      pen = pen + this.addToken(this.a.mustB[this.next] === 1, 0);
    }
    return pen & U32;
  }

  // ---- The search ---------------------------------------------------------

  newNode(prev: i32, nl: i32): i32 {
    const i = this.nn;
    if (i >= toI32(this.nOff.length)) {
      const n = i * 2;
      this.nOff = growI32(this.nOff, n);
      this.nPrev = growI32(this.nPrev, n);
      this.nNl = growI32(this.nNl, n);
      this.nIgn = growI32(this.nIgn, n);
      this.nNextB = growI32(this.nNextB, n);
      this.nPendH = growI32(this.nPendH, n);
      this.nPendI = growI32(this.nPendI, n);
      this.nCnt = growI32(this.nCnt, n);
    }
    this.nOff[i] = this.save();
    this.nPrev[i] = prev;
    this.nNl[i] = nl;
    this.nIgn[i] = 0;
    this.nPendH[i] = -1;
    this.nn = i + 1;
    return i;
  }

  /** The bucket of penalty `pen` in this search (depth `dd`, generation `gen`), made when missing. */
  bucketOf(pen: i64, dd: i32, gen: i32): i32 {
    let keys = this.pmKey[dd];
    let mask = toI32(keys.length) - 1;
    const h = Math.imul(toI32(pen & toI64(0x7fffffff)) ^ toI32(pen >> 31), 0x2545f491);
    let i = h & mask;
    let st = this.pmStamp[dd];
    while (st[i] === gen) {
      if (keys[i] === pen) {
        return this.pmVal[dd][i];
      }
      i = (i + 1) & mask;
    }
    if (this.pmUsed[dd] * 2 >= mask) {
      this.growPm(dd, gen);
      keys = this.pmKey[dd];
      mask = toI32(keys.length) - 1;
      st = this.pmStamp[dd];
      i = h & mask;
      while (st[i] === gen) {
        i = (i + 1) & mask;
      }
    }
    const b = this.bn;
    if (b >= toI32(this.bHead.length)) {
      this.bHead = growI32(this.bHead, (b + 1) * 2);
      this.bTail = growI32(this.bTail, (b + 1) * 2);
    }
    this.bHead[b] = -1;
    this.bTail[b] = -1;
    this.bn = b + 1;
    st[i] = gen;
    keys[i] = pen;
    this.pmVal[dd][i] = b;
    this.pmUsed[dd] = this.pmUsed[dd] + 1;
    return b;
  }

  /** Doubles depth `dd`'s penalty map, keeping this generation's entries. */
  growPm(dd: i32, gen: i32): void {
    const ok = this.pmKey[dd];
    const ov = this.pmVal[dd];
    const os = this.pmStamp[dd];
    const n = toI32(ok.length) * 2;
    const nk = new Array<i64>(n);
    const nv = new Array<i32>(n);
    const ns = new Array<i32>(n);
    const mask = n - 1;
    for (let i = 0; i < toI32(ok.length); i++) {
      if (os[i] !== gen) {
        continue;
      }
      const pen = ok[i];
      let j = Math.imul(toI32(pen & toI64(0x7fffffff)) ^ toI32(pen >> 31), 0x2545f491) & mask;
      while (ns[j] === gen) {
        j = (j + 1) & mask;
      }
      ns[j] = gen;
      nk[j] = pen;
      nv[j] = ov[i];
    }
    this.pmKey[dd] = nk;
    this.pmVal[dd] = nv;
    this.pmStamp[dd] = ns;
  }

  /** Queues node `node` at penalty `pen`. */
  qPush(vBase: i32, dd: i32, gen: i32, pen: i64, node: i32): void {
    const b = this.bucketOf(pen, dd, gen);
    this.nNextB[node] = -1;
    const t = this.bTail[b];
    if (t >= 0) {
      this.nNextB[t] = node;
      this.bTail[b] = node;
      return;
    }
    this.bHead[b] = node;
    this.bTail[b] = node;
    // The bucket joins the heap of penalties.
    let i = this.vn;
    if (i >= toI32(this.vhB.length)) {
      const hp = new Array<i64>(i * 2);
      hp.set(this.vhPen);
      this.vhPen = hp;
      this.vhB = growI32(this.vhB, i * 2);
    }
    this.vn = i + 1;
    while (i > vBase) {
      const par = vBase + ((i - vBase - 1) >> 1);
      const pp = this.vhPen[par];
      if (pp < pen) {
        break;
      }
      this.vhPen[i] = pp;
      this.vhB[i] = this.vhB[par];
      i = par;
    }
    this.vhPen[i] = pen;
    this.vhB[i] = b;
  }

  /** Removes the cheapest bucket's head (the bucket leaves the heap when it empties). */
  qPop(vBase: i32): void {
    const b = this.vhB[vBase];
    const h = this.bHead[b];
    const nx = this.nNextB[h];
    this.bHead[b] = nx;
    if (nx >= 0) {
      return;
    }
    this.bTail[b] = -1;
    const last = this.vn - 1;
    this.vn = last;
    if (last === vBase) {
      return;
    }
    const pen = this.vhPen[last];
    const lb = this.vhB[last];
    let i = vBase;
    const n = last - vBase;
    while (true) {
      const rel = i - vBase;
      if (rel * 2 + 1 >= n) {
        break;
      }
      let c = vBase + rel * 2 + 1;
      if (rel * 2 + 2 < n && this.vhPen[c + 1] < this.vhPen[c]) {
        c = c + 1;
      }
      if (pen < this.vhPen[c]) {
        break;
      }
      this.vhPen[i] = this.vhPen[c];
      this.vhB[i] = this.vhB[c];
      i = c;
    }
    this.vhPen[i] = pen;
    this.vhB[i] = lb;
  }

  /** A hash of node `n`'s state over the compared fields. */
  stateHash(n: i32, withStack: boolean): i32 {
    const p = this.pool;
    const o = this.nOff[n];
    let h = 0x011c9dc5;
    for (let i = 0; i < 6; i++) {
      h = Math.imul(h ^ uncheckedGet(p, o + i), 0x01000193);
    }
    if (withStack) {
      h = Math.imul(h ^ uncheckedGet(p, o + S_DEPTH), 0x01000193);
      const t = uncheckedGet(p, o + S_TOP);
      h = Math.imul(h ^ uncheckedGet(this.rec, t * RS + RH), 0x01000193);
    }
    return h;
  }

  sameState(x: i32, y: i32, withStack: boolean): boolean {
    const p = this.pool;
    const ox = this.nOff[x];
    const oy = this.nOff[y];
    for (let i = 0; i < 6; i++) {
      if (uncheckedGet(p, ox + i) !== uncheckedGet(p, oy + i)) {
        return false;
      }
    }
    if (!withStack) {
      return true;
    }
    if (uncheckedGet(p, ox + S_DEPTH) !== uncheckedGet(p, oy + S_DEPTH)) {
      return false;
    }
    let rx = uncheckedGet(p, ox + S_TOP);
    let ry = uncheckedGet(p, oy + S_TOP);
    const rc = this.rec;
    while (rx !== ry) {
      const a = rx * RS + RF;
      const b = ry * RS + RF;
      for (let f = 1; f < PS - 1; f++) {
        if (uncheckedGet(rc, a + f) !== uncheckedGet(rc, b + f)) {
          return false;
        }
      }
      if ((uncheckedGet(rc, a + R_FL) & F_CMP) !== (uncheckedGet(rc, b + R_FL) & F_CMP)) {
        return false;
      }
      rx = uncheckedGet(rc, rx * RS + RP);
      ry = uncheckedGet(rc, ry * RS + RP);
    }
    return true;
  }

  /** Records node `n` as expanded; false when an equal state already was. */
  seenInsert(n: i32, gen: i32): boolean {
    const ign = this.nIgn[n] === 1;
    const h = this.stateHash(n, !ign);
    const mask = toI32(this.seenNode.length) - 1;
    let s = h & mask;
    while (this.seenStamp[s] === gen) {
      const o = this.seenNode[s];
      if (this.sameState(o, n, !(ign || this.nIgn[o] === 1))) {
        return false;
      }
      s = (s + 1) & mask;
    }
    this.seenStamp[s] = gen;
    this.seenNode[s] = n;
    return true;
  }

  search(): i64 {
    const nodeBase = this.nn;
    const poolBase = this.pn;
    const vBase = this.vn;
    const bBase = this.bn;
    const recBase = this.nrec;
    // A fresh seen table generation; a nested search takes the next ones.
    this.seenGen = this.seenGen + 1;
    const gen = this.seenGen;
    if (this.depth === 0 && this.seenGen > 1 << 30) {
      this.seenGen = 1;
    }
    this.depth = this.depth + 1;
    const dd = this.depth;
    while (toI32(this.pmKey.length) <= dd) {
      this.pmKey.push(new Array<i64>(1024));
      this.pmVal.push(new Array<i32>(1024));
      this.pmStamp.push(new Array<i32>(1024));
    }
    if (dd >= toI32(this.pmUsed.length)) {
      this.pmUsed = growI32(this.pmUsed, dd + 1);
    }
    this.pmUsed[dd] = 0;
    const dry = this.dry;
    this.dry = true;
    this.initialState();
    const root = this.newNode(-1, 0);
    let count = 0;
    this.nCnt[root] = 0;
    this.qPush(vBase, dd, gen, toI64(0), root);
    count++;
    let pen: i64 = 0;
    let best = -1;
    let inserted = 0;
    // `carry`: the no-break successor of the last state, when it is surely the
    // next to pop (nothing queued is cheaper): expanded without queueing.
    let carry = -1;
    let carryPen: i64 = 0;
    let flat = false;
    while (true) {
      if (count > MAXCOUNT) {
        break;
      }
      let node = -1;
      if (carry >= 0) {
        node = carry;
        pen = carryPen;
        carry = -1;
        if (this.pool[this.nOff[node] + S_NEXT] < 0) {
          best = node;
          break;
        }
      } else {
        if (this.vn <= vBase) {
          break;
        }
        pen = this.vhPen[vBase];
        node = this.bHead[this.vhB[vBase]];
        if (this.nPendH[node] >= 0) {
          // Count the child block now; requeue the node at its true key when it costs.
          const cp = this.childList(this.nPendH[node], this.nPendI[node]);
          this.nPendH[node] = -1;
          if (cp > 0) {
            this.qPop(vBase);
            this.qInsert(vBase, dd, gen, (pen + cp) & U32, node);
            continue;
          }
        }
        if (this.pool[this.nOff[node] + S_NEXT] < 0) {
          best = node;
          break;
        }
        this.qPop(vBase);
      }
      if (count > IGNORE_AFTER) {
        this.nIgn[node] = 1;
        if (!flat) {
          // clang-format now compares states without their stacks, against
          // every state already seen: rehash those without their stacks too.
          flat = true;
          this.growSeen(gen, nodeBase, false, true);
        }
      }
      if (inserted * 2 > toI32(this.seenNode.length)) {
        this.growSeen(gen, nodeBase, true, flat);
      }
      if (!this.seenInsert(node, gen)) {
        continue;
      }
      inserted++;
      this.stPops = this.stPops + 1;
      this.load(this.nOff[node]);
      this.stDepth = this.stDepth + toI64(this.sp);
      const can = this.canBreak();
      const must = this.mustBreak();
      let s0 = -1;
      let p0: i64 = 0;
      // A token an earlier pass formatted keeps that pass's decision.
      const dec = this.d.dec[this.next];
      if (!must && dec !== 2) {
        s0 = this.makeChild(node, pen, false);
        p0 = this.childPen;
      }
      let s1 = -1;
      let p1: i64 = 0;
      if (can && dec !== 1) {
        s1 = this.makeChild(node, pen, true);
        p1 = this.childPen;
      }
      if (s0 >= 0) {
        this.nCnt[s0] = count;
        count++;
      }
      if (s1 >= 0) {
        this.nCnt[s1] = count;
        count++;
      }
      if (s0 >= 0) {
        if ((this.vn <= vBase || this.vhPen[vBase] > p0) && (s1 < 0 || p1 >= p0)) {
          carry = s0;
          carryPen = p0;
        } else {
          this.qPush(vBase, dd, gen, p0, s0);
        }
      }
      if (s1 >= 0) {
        this.qPush(vBase, dd, gen, p1, s1);
      }
    }
    this.stSearches = this.stSearches + 1;
    if (this.debug) {
      console.error(`search depth=${this.depth} line=${this.line} nodes=${this.nn - nodeBase} pen=${pen} ind=${this.firstIndent} first=${this.d.text(this.d.lFirst[this.line])}`);
    }
    this.stNodes = this.stNodes + toI64(this.nn - nodeBase);
    let result: i64 = 0;
    this.pathN = -1;
    if (best >= 0) {
      result = pen;
      let n = 0;
      for (let q = best; q >= 0 && this.nPrev[q] >= 0; q = this.nPrev[q]) {
        n++;
      }
      if (n > toI32(this.pathBits.length)) {
        this.pathBits = growI32(this.pathBits, n * 2);
      }
      let i = n - 1;
      for (let q = best; q >= 0 && this.nPrev[q] >= 0; q = this.nPrev[q]) {
        this.pathBits[i] = this.nNl[q];
        i--;
      }
      this.pathN = n;
    }
    this.dry = dry;
    this.depth = this.depth - 1;
    this.nn = nodeBase;
    this.pn = poolBase;
    this.vn = vBase;
    this.bn = bBase;
    this.nrec = recBase;
    this.fresh0 = recBase;
    return result;
  }

  /**
   * Rebuilds the seen table holding this search's expanded nodes: twice as
   * large when `grow`, and hashed without their stacks once `flat`.
   */
  growSeen(gen: i32, nodeBase: i32, grow: boolean, flat: boolean): void {
    const n = toI32(this.seenNode.length) * (grow ? 2 : 1);
    const oldNode = this.seenNode;
    const oldStamp = this.seenStamp;
    this.seenNode = new Array<i32>(n);
    this.seenStamp = new Array<i32>(n);
    const mask = n - 1;
    for (let i = 0; i < toI32(oldNode.length); i++) {
      const st = oldStamp[i];
      if (st === 0) {
        continue;
      }
      const node = oldNode[i];
      if (st !== gen || node < nodeBase) {
        continue;
      }
      let s = this.stateHash(node, !flat && this.nIgn[node] === 0) & mask;
      while (this.seenStamp[s] !== 0) {
        s = (s + 1) & mask;
      }
      this.seenStamp[s] = st;
      this.seenNode[s] = node;
    }
  }

  /** Adds the state after placing the next token (with or without a break). */
  /** The state after placing the next token of node `node` (with or without a break); -1 when it cannot be. */
  makeChild(node: i32, pen: i64, nl: boolean): i32 {
    this.load(this.nOff[node]);
    let p = pen;
    this.pendHead = -1;
    // Child blocks are counted when their state reaches the front of the
    // queue, which assumes a cost only raises a key; near the 32-bit wrap
    // (below) they are counted now.
    this.lazyKids = pen < LAZY_LIMIT;
    const cp = this.formatChildren(nl);
    this.lazyKids = false;
    if (cp < 0) {
      return -1;
    }
    p = p + cp;
    const ph = this.pendHead;
    const pi = this.pendInd;
    // clang-format's penalties are 32-bit unsigned and wrap.
    p = (p + this.addToken(nl, 0)) & U32;
    const n = this.newNode(node, nl ? 1 : 0);
    this.nPendH[n] = ph;
    this.nPendI[n] = pi;
    this.childPen = p;
    return n;
  }

  /** Queues node `n` (key `pen`) after the nodes of its bucket made before it. */
  qInsert(vBase: i32, dd: i32, gen: i32, pen: i64, n: i32): void {
    const b = this.bucketOf(pen, dd, gen);
    if (this.bHead[b] < 0) {
      this.qPush(vBase, dd, gen, pen, n);
      return;
    }
    const cnt = this.nCnt[n];
    let prev = -1;
    let q = this.bHead[b];
    while (q >= 0 && this.nCnt[q] < cnt) {
      prev = q;
      q = this.nNextB[q];
    }
    this.nNextB[n] = q;
    if (prev < 0) {
      this.bHead[b] = n;
    } else {
      this.nNextB[prev] = n;
    }
    if (q < 0) {
      this.bTail[b] = n;
    }
  }


  /** Re-runs the decisions of path bits [off, off + n) for real (emitting). */
  replayBits(off: i32, n: i32): void {
    this.dry = false;
    this.initialState();
    for (let k = 0; k < n; k++) {
      const nl = this.rcBits[off + k] === 1;
      this.formatChildren(nl);
      this.addToken(nl, 0);
    }
  }

  /** Re-runs the last search's decisions (kept in pathBits) for real. */
  replayPath(): void {
    const n = this.pathN;
    const bits = new Array<i32>(n);
    for (let k = 0; k < n; k++) {
      bits[k] = this.pathBits[k];
    }
    this.dry = false;
    this.initialState();
    for (let k = 0; k < n; k++) {
      const nl = bits[k] === 1;
      this.formatChildren(nl);
      this.addToken(nl, 0);
    }
  }

}

export const INDENTER_KINDS: i32 = KW_WHILE + KW_SWITCH + KW_CONCEPT + KW_FOR + TT_CAST_RPAREN + P_RSQUARE + K_IDENT;
