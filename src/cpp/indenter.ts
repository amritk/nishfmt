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
  N_LARROW,
  N_BRSON,
  N_OMP,
  isOmpPragmaLine,
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
import { growI32, mul32, newI32s, newI64s } from "../core/arr";
import { fault, faulted } from "../core/fault";
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
  KW_CLASS,
  KW_STRUCT,
  KW_UNION,
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
  TT_SELECTOR_NAME,
  TT_OBJC_METHOD_EXPR,
  TT_OBJC_METHOD_SPECIFIER,
  P_AT,
  TT_CTOR_INITIALIZER_COMMA,
  TT_DESIGNATED_INITIALIZER_LSQUARE,
  TT_DESIGNATED_INITIALIZER_PERIOD,
  TT_FUNCTION_ANNOTATION_RPAREN,
  TT_FUNCTION_DECLARATION_NAME,
  TT_INHERITANCE_COLON,
  TT_INHERITANCE_COMMA,
  TT_LAMBDA_ARROW,
  TT_LAMBDA_LSQUARE,
  TT_LINE_COMMENT,
  TT_OVERLOADED_OPERATOR,
  TT_POINTER_OR_REFERENCE,
  TT_START_OF_NAME,
  TT_TEMPLATE_CLOSER,
  TT_TEMPLATE_OPENER,
  TT_UNARY_OPERATOR,
} from "./tok";

// State header, H fields: S_COL (0), S_NEXT (1), S_NOCONT (2), S_SOL (3,
// the start-of-line nesting level), S_LOWEST (4, the lowest nesting level on
// the line), S_SOSL (5, the start of a string literal run), S_NOLB (6),
// S_DEPTH (7) and S_TOP (8, the top record). The code that copies a header
// writes the offsets as literals, which the compiler's proofs read.
const H: i32 = 9;
const S_NEXT: i32 = 1;

// One record per open bracket or implicit paren: PS (14) fields, R_TOK to R_AL.
// A record in the pool: its parent, its hash (with everything under it), then the PS fields.
const RS: i32 = 16;
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
const R_COLON: i32 = 10; // where an Objective-C selector's colons align (ColonPos)
const R_FL: i32 = 11;
// clang-format 23's IndentationAndAlignment: the column R_IND was indented
// from, which the whitespace pass reads; states compare R_IND alone.
const R_INDF: i32 = 12;
// The token the level's continuation lines are aligned to (AlignedTo), or -1.
const R_AL: i32 = 13;

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
const F_OSNF: i32 = 16384; // an Objective-C selector part was placed (ObjCSelectorNameFound)
const F_NOALIGN: i32 = 32768; // the selector's colons are not aligned (AlignColons off)
const F_CMP: i32 = 0x7ffffbbf; // every flag but NOLBOP and HMNB

// A search makes at most MAXCOUNT (25000000) states.
// clang-format keeps penalties in 32-bit unsigned integers: sums wrap.
const U32: i64 = 4294967295;
// The per-file caches (line results, child block penalties) start at these
// sizes, powers of two, and double when half full: clang-format's PenaltyCache
// is unbounded, and a cache that stopped storing would search a deeply nested
// block again for every state that reaches it.
const RC_SIZE: i32 = 8192;
const LC_SIZE: i32 = 4096;
const CC_SIZE: i32 = 65536; // power of two
const IGNORE_AFTER: i32 = 50000;
// The guards below write their bounds as literals, which the compiler's
// proofs read: 134217727 records is what a pool of i32 length can hold (the
// last field of record 134217726 still has an i32 offset), and 14 is PS.
const REC0: i32 = 65536; // RS * 4096
// A depth's seen table starts small and doubles as it fills (search), so a
// nested depth that expands few states costs a few KB, not 512 KB.
const SEEN0: i32 = 1024;

/** An implicit paren's record has no token: its R_TOK holds its precedence. */
const fakeTok = (prec: i32): i32 => indSub(-2, prec);

/** `xs[t]` of a token or line link, or -1 (none) after a fault when `t` is outside `xs`. */
const indLink = (xs: i32[], t: i32): i32 => {
  // (A negative `t` is a u32 past any length: one compare tests both ends.)
  const u = toU32(t);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return -1;
};

/** `a + b`, or 0 after a fault when the sum leaves i32. */
const indAdd = (a: i32, b: i32): i32 => {
  // The u32 sum has the true sum's bits; it left i32 when its sign differs
  // from both operands'.
  const r = toI32(toU32(a) + toU32(b));
  if (((a ^ r) & (b ^ r)) < 0) {
    fault();
    return 0;
  }
  return r;
};

/** `a - b`, or 0 after a fault when the difference leaves i32. */
const indSub = (a: i32, b: i32): i32 => {
  // The u32 difference has the true one's bits; it left i32 when the
  // operands' signs differ and its sign differs from `a`'s.
  const r = toI32(toU32(a) - toU32(b));
  if (((a ^ b) & (a ^ r)) < 0) {
    fault();
    return 0;
  }
  return r;
};

/** `xs[i]`, or 0 after a fault when `i` is outside `xs`. */
const indAt = (xs: i32[], i: i32): i32 => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return 0;
};

/** `a + b` of two penalties or counts, or 0 after a fault when the sum leaves i64. */
const indAdd64 = (a: i64, b: i64): i64 => {
  // The u64 sum has the true sum's bits; it left i64 when its sign differs
  // from both operands'.
  const r = toI64(toU64(a) + toU64(b));
  if (((a ^ r) & (b ^ r)) < toI64(0)) {
    fault();
    return toI64(0);
  }
  return r;
};

/** Sets `xs[i]`; faults when `i` is outside `xs`. */
const indPut = (xs: i32[], i: i32, v: i32): void => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    xs[u] = v;
    return;
  }
  fault();
};

/** `xs[i]`, or 0 after a fault when `i` is outside `xs`. */
const indAtI64 = (xs: i64[], i: i32): i64 => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return toI64(0);
};

// A record index is -1 or one newRec made, below 134217727: its u32 offset
// is the true one, or (for -1) past any pool, so one compare tests both ends.

/** The u32 offset of slot `k` (RP, RH, or RF + an R_* field) of record `r`. */
const indSlot = (r: i32, k: i32): u32 => toU32(r) * toU32(RS) + toU32(k);

/** Field `f` (an R_* index) of record `r` in pool `rec`, or 0 after a fault when it is outside. */
const indField = (rec: i32[], r: i32, f: i32): i32 => {
  if (f >= 0 && f < 14) {
    const i = indSlot(r, RF + f);
    if (i < toU32(rec.length)) {
      return rec[i];
    }
  }
  fault();
  return 0;
};

/** Sets field `f` of record `r`; faults when it is outside the pool. */
const indSetField = (rec: i32[], r: i32, f: i32, v: i32): void => {
  if (f >= 0 && f < 14) {
    const i = indSlot(r, RF + f);
    if (i < toU32(rec.length)) {
      rec[i] = v;
      return;
    }
  }
  fault();
};

/** Record `r`'s parent, or -1 (none) after a fault when it is outside the pool. */
const indParent = (rec: i32[], r: i32): i32 => {
  const i = indSlot(r, RP);
  if (i < toU32(rec.length)) {
    return rec[i];
  }
  fault();
  return -1;
};

/** Sets record `r`'s parent; faults when it is outside the pool. */
const indSetParent = (rec: i32[], r: i32, v: i32): void => {
  const i = indSlot(r, RP);
  if (i < toU32(rec.length)) {
    rec[i] = v;
    return;
  }
  fault();
};

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
  if (indAt(d.nl, t) > 0) {
    return indAdd(indAt(d.col, t), 1);
  }
  return indSub(indAdd(col, indAt(d.start, t)), indAt(d.end, indLink(d.prv, t)));
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
  /** The column newLineColumn's answer was indented from (its IndentedFrom). */
  nlFrom: i32 = 0;
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
  asWritten: boolean = false; // noLineBreak for a line with no layout: its blocks' lines are written too
  childPen: i64 = 0;
  // Per search depth: penalty -> bucket, stamped by search generation.
  pmKey: i64[][];
  pmVal: i32[][];
  pmStamp: i32[][];
  pmUsed: i32[];
  pmGen: i32 = 0;
  // Per search depth, as each of clang-format's analyzeSolutionSpace calls
  // has a seen set of its own: the expanded nodes, stamped by search
  // generation. One table shared by the depths lost an enclosing search's
  // entries whenever a nested search grew it, so a fresh engine (small
  // tables) laid some files out unlike a warm one.
  seenNodes: i32[][];
  seenStamps: i32[][];
  seenGen: i32 = 1;
  depth: i32 = 0;
  // Penalties of child block lists already formatted (dry): by line and indent.
  // Child block penalties of the current file, by block (the list's first
  // line) and extra indent: clang-format's PenaltyCache.
  cacheKey: i32[];
  cacheInd: i32[];
  cacheVal: i64[];
  cacheStamp: i32[];
  cacheUsed: i32 = 0;
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
    this.rec = new Array<i32>(REC0);
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
    this.pmKey = [];
    this.pmVal = [];
    this.pmStamp = [];
    this.pmUsed = new Array<i32>(64);
    this.seenNodes = [];
    this.seenStamps = [];
    this.cacheKey = new Array<i32>(LC_SIZE);
    this.cacheInd = new Array<i32>(LC_SIZE);
    this.cacheVal = new Array<i64>(LC_SIZE);
    this.cacheStamp = new Array<i32>(LC_SIZE);
  }

  reset(): void {
    this.fileStamp = indAdd(this.fileStamp, 1);
    this.rcUsed = 0;
    this.cacheUsed = 0;
    this.nbits = 0;
  }

  /** The cache slot of line `l` at `ind`: found (stamp current) or free; -1 after a fault. */
  rcSlot(l: i32, ind: i32): i32 {
    const stamp = this.rcStamp;
    const line = this.rcLine;
    const rind = this.rcInd;
    // The length is a power of two, and the table at most half full.
    const mask = toI32(stamp.length) - 1;
    const h = (Math.imul(l, 0x2545f491) ^ Math.imul(ind, 0x01000193)) & mask;
    for (let i = 0; i < stamp.length; i++) {
      // `h` lies in [0, mask] and `i` below the length, so the u32 sum is exact.
      const s = toI32((toU32(h) + toU32(i)) & toU32(mask));
      if (s < 0 || s >= stamp.length || s >= line.length || s >= rind.length) {
        fault();
        return -1;
      }
      if (stamp[s] !== this.fileStamp) {
        return s;
      }
      if (line[s] === l && rind[s] === ind) {
        return s;
      }
    }
    fault();
    return -1;
  }

  /** Doubles the line cache, keeping the current file's entries. */
  rcGrow(): void {
    const oStamp = this.rcStamp;
    const oLine = this.rcLine;
    const oInd = this.rcInd;
    const oPen = this.rcPen;
    const oOff = this.rcOff;
    const oN = this.rcN;
    const n = mul32(toI32(oStamp.length), 2);
    this.rcStamp = newI32s(n);
    this.rcLine = newI32s(n);
    this.rcInd = newI32s(n);
    this.rcPen = newI64s(n);
    this.rcOff = newI32s(n);
    this.rcN = newI32s(n);
    for (let i = 0; i < oStamp.length; i++) {
      if (i >= oLine.length || i >= oInd.length || i >= oPen.length || i >= oOff.length || i >= oN.length) {
        fault();
        return;
      }
      if (oStamp[i] !== this.fileStamp) {
        continue;
      }
      const s = this.rcSlot(oLine[i], oInd[i]);
      const stamp = this.rcStamp;
      const line = this.rcLine;
      const rind = this.rcInd;
      const rpen = this.rcPen;
      const off = this.rcOff;
      const rn = this.rcN;
      if (s < 0 || s >= stamp.length || s >= line.length || s >= rind.length || s >= rpen.length) {
        fault();
        return;
      }
      if (s >= off.length || s >= rn.length) {
        fault();
        return;
      }
      stamp[s] = oStamp[i];
      line[s] = oLine[i];
      rind[s] = oInd[i];
      rpen[s] = oPen[i];
      off[s] = oOff[i];
      rn[s] = oN[i];
    }
  }

  rcHit(s: i32): boolean {
    return s >= 0 && indAt(this.rcStamp, s) === this.fileStamp;
  }

  /**
   * Stores line `l`'s result at `ind` (with the last search's decisions when
   * `withPath`) and answers its slot, or -1 after a fault. The slot is looked
   * up here, not before the search: the nested searches store too, and may
   * grow the table.
   */
  rcStore(l: i32, ind: i32, pen: i64, withPath: boolean): i32 {
    const used = this.rcUsed;
    // Kept at most half full.
    if (toI64(used) * toI64(2) >= toI64(this.rcStamp.length)) {
      this.rcGrow();
    }
    const s = this.rcSlot(l, ind);
    if (s < 0) {
      return -1;
    }
    const fresh = indAt(this.rcStamp, s) !== this.fileStamp;
    const stamp = this.rcStamp;
    const line = this.rcLine;
    const rind = this.rcInd;
    const rpen = this.rcPen;
    const rn = this.rcN;
    if (s >= stamp.length || s >= line.length || s >= rind.length || s >= rpen.length || s >= rn.length) {
      fault();
      return -1;
    }
    stamp[s] = this.fileStamp;
    line[s] = l;
    rind[s] = ind;
    rpen[s] = pen;
    rn[s] = -1;
    if (withPath) {
      const n = this.pathN;
      const nb = this.nbits;
      const end = indAdd(nb, n);
      if (end > toI32(this.rcBits.length)) {
        this.rcBits = growI32(this.rcBits, mul32(end, 2));
      }
      const bits = this.rcBits;
      const src = this.pathBits;
      let j = nb;
      for (let i = 0; i < n; i++) {
        if (i >= src.length || j < 0 || j >= bits.length) {
          fault();
          return -1;
        }
        bits[j] = src[i];
        j++;
      }
      const off = this.rcOff;
      if (s >= off.length || s >= rn.length) {
        fault();
        return -1;
      }
      off[s] = nb;
      rn[s] = n;
      this.nbits = end;
    }
    if (fresh) {
      this.rcUsed = indAdd(used, 1);
    }
    return s;
  }

  // ---- Stack access -------------------------------------------------------

  top(f: i32): i32 {
    return indField(this.rec, this.topRec, f);
  }

  /** The record `k` levels under the top (0 is the top). */
  below(k: i32): i32 {
    const rec = this.rec;
    let r = this.topRec;
    for (let i = 0; i < k; i++) {
      r = indParent(rec, r);
    }
    return r;
  }

  /** Field `f` of the record at depth `i` (0 is the bottom). */
  at(i: i32, f: i32): i32 {
    return indField(this.rec, this.below(indSub(indSub(this.sp, 1), i)), f);
  }

  newRec(parent: i32): i32 {
    const r = this.nrec;
    // (`(r + 1) * RS` leaves i32 from 134217727 on.)
    if (r < 0 || r >= 134217727) {
      fault();
      return -1;
    }
    const end = (r + 1) * RS;
    if (end > toI32(this.rec.length)) {
      this.rec = growI32(this.rec, mul32(end, 2));
    }
    const rec = this.rec;
    const o = r * RS;
    if (o + 1 < rec.length) {
      rec[o] = parent; // RP
      rec[o + 1] = 0; // RH
    } else {
      fault();
    }
    this.nrec = r + 1;
    return r;
  }

  /** A mutable copy of record `r` (same parent). */
  cloneRec(r: i32): i32 {
    const c = this.newRec(indParent(this.rec, r));
    const rec = this.rec;
    if (r >= 0 && r < 134217727 && c >= 0 && c < 134217727) {
      const a = r * RS + RF;
      const b = c * RS + RF;
      // The PS fields, R_TOK (+0) to R_AL (+13).
      if (a + 13 < rec.length && b + 13 < rec.length) {
        rec[b] = rec[a];
        rec[b + 1] = rec[a + 1];
        rec[b + 2] = rec[a + 2];
        rec[b + 3] = rec[a + 3];
        rec[b + 4] = rec[a + 4];
        rec[b + 5] = rec[a + 5];
        rec[b + 6] = rec[a + 6];
        rec[b + 7] = rec[a + 7];
        rec[b + 8] = rec[a + 8];
        rec[b + 9] = rec[a + 9];
        rec[b + 10] = rec[a + 10];
        rec[b + 11] = rec[a + 11];
        rec[b + 12] = rec[a + 12];
        rec[b + 13] = rec[a + 13];
        return c;
      }
    }
    fault();
    return c;
  }

  /** Sets the top record's indent, indented from column `from`. */
  setInd(v: i32, from: i32): void {
    this.setTop(R_IND, v);
    this.setTop(R_INDF, from);
  }

  setTop(f: i32, v: i32): void {
    if (this.topRec < this.fresh0) {
      if (indField(this.rec, this.topRec, f) === v) {
        return;
      }
      this.topRec = this.cloneRec(this.topRec);
    }
    indSetField(this.rec, this.topRec, f, v);
  }

  /** Makes the records from depth `i` to the top this step's own, re-linking parents. */
  ownFrom(i: i32): void {
    const n = indSub(this.sp, i);
    if (n > toI32(this.path.length)) {
      this.path = growI32(this.path, n);
    }
    const path = this.path;
    let r = this.topRec;
    for (let k = 0; k < n; k++) {
      if (k >= path.length) {
        fault();
        return;
      }
      path[k] = r;
      r = indParent(this.rec, r);
    }
    // r is the parent of depth i's record; walk back up, copying what is shared.
    let parent = r;
    let k = n;
    while (k > 0) {
      k--;
      if (k >= path.length) {
        fault();
        return;
      }
      let x = path[k];
      if (x < this.fresh0) {
        x = this.cloneRec(x);
      }
      indSetParent(this.rec, x, parent);
      if (k >= path.length) {
        fault();
        return;
      }
      path[k] = x;
      parent = x;
    }
    this.topRec = parent;
  }

  setAt(i: i32, f: i32, v: i32): void {
    if (this.at(i, f) === v) {
      return;
    }
    this.ownFrom(i);
    indSetField(this.rec, indAt(this.path, indSub(indSub(this.sp, 1), i)), f, v);
  }

  /** Sets flag `fl` on every level below the top (and the top too when `withTop`). */
  flagAll(fl: i32, withTop: boolean): void {
    // The lowest level missing the flag; nothing to do when none is.
    let lowest = -1;
    const sp = this.sp;
    const rec = this.rec;
    let r = this.topRec;
    for (let k = 0; k < sp; k++) {
      if ((k > 0 || withTop) && (indField(rec, r, R_FL) & fl) === 0) {
        lowest = indSub(indSub(sp, 1), k);
      }
      r = indParent(rec, r);
    }
    if (lowest < 0) {
      return;
    }
    this.ownFrom(lowest);
    const n = indSub(sp, lowest);
    const path = this.path;
    const rec2 = this.rec;
    let k0 = 1;
    if (withTop) {
      k0 = 0;
    }
    for (let k = k0; k < n; k++) {
      if (k >= path.length) {
        fault();
        return;
      }
      const x = path[k];
      indSetField(rec2, x, R_FL, indField(rec2, x, R_FL) | fl);
    }
  }

  topHas(fl: i32): boolean {
    return (this.top(R_FL) & fl) !== 0;
  }

  setTopFlag(fl: i32, on: boolean): void {
    const v = this.top(R_FL);
    this.setTop(R_FL, on ? v | fl : v & ~fl);
  }

  push(tok: i32, ind: i32, indFrom: i32, ls: i32, avoid: boolean, noLB: boolean): void {
    const r = this.newRec(this.topRec);
    const x = this.rec;
    let ok = false;
    if (r >= 0 && r < 134217727) {
      const o = r * RS + RF;
      if (o + 13 < x.length) {
        x[o] = tok; // R_TOK
        x[o + 1] = ind; // R_IND
        x[o + 2] = ls; // R_LS
        x[o + 3] = ind; // R_NBI
        x[o + 4] = 0; // R_FLL
        x[o + 5] = 0; // R_QC
        x[o + 6] = 0; // R_SOFC
        x[o + 7] = 0; // R_SOAS
        x[o + 8] = 0; // R_CC
        x[o + 9] = 0; // R_VP
        x[o + 10] = 0; // R_COLON
        x[o + 11] = F_LOW | (avoid ? F_AVOID : 0) | (noLB ? F_NOLB : 0); // R_FL
        x[o + 12] = indFrom; // R_INDF
        x[o + 13] = -1; // R_AL
        ok = true;
      }
    }
    if (!ok) {
      fault();
    }
    this.topRec = r;
    this.sp = indAdd(this.sp, 1);
  }

  /** Pushes a copy of the top record. */
  dupTop(): void {
    const c = this.cloneRec(this.topRec);
    indSetParent(this.rec, c, this.topRec);
    this.topRec = c;
    this.sp = indAdd(this.sp, 1);
  }

  pop(): void {
    this.topRec = indParent(this.rec, this.topRec);
    this.sp = indSub(this.sp, 1);
  }

  // ---- Snapshots ----------------------------------------------------------

  /** Hashes this step's records (bottom up), so a saved state's stack hash is at its top. */
  hashFresh(): void {
    let n = 0;
    let r = this.topRec;
    const f0 = this.fresh0;
    while (r >= f0) {
      if (n >= toI32(this.path.length)) {
        this.path = growI32(this.path, indAdd(n, 1));
      }
      const path = this.path;
      if (n >= path.length) {
        fault();
        return;
      }
      path[n] = r;
      n++;
      r = indParent(this.rec, r);
    }
    const rec = this.rec;
    const path = this.path;
    let k = n;
    while (k > 0) {
      k--;
      if (k >= path.length) {
        fault();
        return;
      }
      const x = path[k];
      const p = indParent(rec, x);
      let h = 0x2545f491;
      if (p >= 0) {
        // The parent's hash, its RH.
        if (p >= 134217727) {
          fault();
          return;
        }
        const ph = p * RS + RH;
        if (ph >= rec.length) {
          fault();
          return;
        }
        h = rec[ph];
      }
      if (x < 0 || x >= 134217727) {
        fault();
        return;
      }
      const o = x * RS + RF;
      if (o + 13 >= rec.length) {
        fault();
        return;
      }
      // The PS fields from R_IND (+1) to R_COLON (+10), then R_FL (+11) and
      // R_AL (+13), not R_INDF; the record's own hash is its RH (-1).
      const f1 = rec[o + 1];
      const f2 = rec[o + 2];
      const f3 = rec[o + 3];
      const f4 = rec[o + 4];
      const f5 = rec[o + 5];
      const f6 = rec[o + 6];
      const f7 = rec[o + 7];
      const f8 = rec[o + 8];
      const f9 = rec[o + 9];
      const f10 = rec[o + 10];
      const f11 = rec[o + 11] & F_CMP;
      const f13 = rec[o + 13];
      h = Math.imul(h ^ f1, 0x01000193);
      h = Math.imul(h ^ f2, 0x01000193);
      h = Math.imul(h ^ f3, 0x01000193);
      h = Math.imul(h ^ f4, 0x01000193);
      h = Math.imul(h ^ f5, 0x01000193);
      h = Math.imul(h ^ f6, 0x01000193);
      h = Math.imul(h ^ f7, 0x01000193);
      h = Math.imul(h ^ f8, 0x01000193);
      h = Math.imul(h ^ f9, 0x01000193);
      h = Math.imul(h ^ f10, 0x01000193);
      h = Math.imul(h ^ f11, 0x01000193);
      h = Math.imul(h ^ f13, 0x01000193);
      if (o + 11 >= rec.length) {
        fault();
        return;
      }
      rec[o - 1] = h;
    }
  }

  /** Copies the working state's header to the pool; answers its offset. */
  save(): i32 {
    this.hashFresh();
    const o = this.pn;
    const end = indAdd(o, H);
    if (end > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, mul32(end, 2));
    }
    const p = this.pool;
    // The H header fields, S_COL (+0) to S_TOP (+8).
    if (o >= 0 && o < p.length - 8) {
      p[o] = this.col; // S_COL
      p[o + 1] = this.next; // S_NEXT
      p[o + 2] = this.noCont; // S_NOCONT
      p[o + 3] = this.sol; // S_SOL
      p[o + 4] = this.lowest; // S_LOWEST
      p[o + 5] = this.sosl; // S_SOSL
      p[o + 6] = this.noLB; // S_NOLB
      p[o + 7] = this.sp; // S_DEPTH
      p[o + 8] = this.topRec; // S_TOP
    } else {
      fault();
    }
    this.pn = end;
    this.fresh0 = this.nrec;
    return o;
  }

  load(o: i32): void {
    const p = this.pool;
    if (o >= 0 && o < p.length - 8) {
      this.col = p[o]; // S_COL
      this.next = p[o + 1]; // S_NEXT
      this.noCont = p[o + 2]; // S_NOCONT
      this.sol = p[o + 3]; // S_SOL
      this.lowest = p[o + 4]; // S_LOWEST
      this.sosl = p[o + 5]; // S_SOSL
      this.noLB = p[o + 6]; // S_NOLB
      this.sp = p[o + 7]; // S_DEPTH
      this.topRec = p[o + 8]; // S_TOP
    } else {
      // No such state: nothing more to place.
      fault();
      this.next = -1;
    }
    this.fresh0 = this.nrec;
  }

  // ---- Token helpers ------------------------------------------------------

  isStringLit(t: i32): boolean {
    return indAt(this.d.kind, t) === K_STRING;
  }

  isIdent(t: i32): boolean {
    const k = indAt(this.d.kind, t);
    return k === K_IDENT || k >= 200;
  }

  startsNextParameter(t: i32): boolean {
    const p = indLink(this.d.prv, t);
    return p >= 0 && indAt(this.d.kind, p) === P_COMMA && !this.a.isTrailingComment(t);
  }

  startsBuilderSegment(t: i32): boolean {
    const p = indLink(this.d.prv, t);
    return this.a.isMemberAccess(t) && p >= 0 && this.a.closesScope(p);
  }

  closesScopeAfterBlock(t: i32): boolean {
    const d = this.d;
    let q = t;
    while (q >= 0) {
      if (indAt(d.kind, q) === P_RBRACE || indAt(d.kind, q) === P_LBRACE) {
        const m = indAt(d.kind, q) === P_RBRACE ? indLink(d.match, q) : q;
        if (m >= 0 && indAt(d.bk, m) === BK_BLOCK) {
          return true;
        }
      }
      if (!this.a.closesScope(q)) {
        return false;
      }
      q = indLink(d.prv, q);
    }
    return false;
  }

  /** `if`, or `if constexpr`, before an opening paren. */
  isIfKw(t: i32): boolean {
    const d = this.d;
    if (t < 0) {
      return false;
    }
    if (indAt(d.kind, t) === KW_IF) {
      return true;
    }
    const p = indLink(d.prv, t);
    return p >= 0 && indAt(d.kind, p) === KW_IF && (indAt(d.kind, t) === KW_CONSTEXPR || indAt(d.kind, t) === K_IDENT);
  }

  /** Width up to the first possible break after the bracket closing `t`'s. */
  lengthToMatchingParen(t: i32): i32 {
    const d = this.d;
    const a = this.a;
    const m = indLink(d.match, t);
    if (m < 0) {
      return 0;
    }
    let end = m;
    let r = this.topRec;
    const rec = this.rec;
    while (end !== this.lineLast) {
      const n = indLink(d.nxt, end);
      if (n < 0) {
        break;
      }
      if (indAt(a.canB, n) === 1) {
        break;
      }
      if (a.closesScope(n)) {
        const nm = indLink(d.match, n);
        if (
          nm >= 0 &&
          (indAt(d.kind, nm) === P_LBRACE ||
            indAt(d.type, nm) === TT_ARRAY_INITIALIZER_LSQUARE ||
            indAt(d.kind, nm) === P_LESS)
        ) {
          while (r >= 0 && indField(rec, r, R_TOK) !== nm) {
            r = indParent(rec, r);
          }
          if (r >= 0 && (indField(rec, r, R_FL) & F_BBCB) !== 0) {
            break;
          }
        }
      }
      end = n;
    }
    return indAdd(indSub(indAt(a.tot, end), indAt(a.tot, t)), 1);
  }

  // ---- Can, must, where ---------------------------------------------------

  canBreak(): boolean {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = indLink(d.prv, cur);
    if (indAt(a.canB, cur) === 0 && !(this.topHas(F_BBCB) && a.closesBlockList(cur))) {
      return false;
    }
    const pk = indAt(d.kind, prev);
    if (indAt(a.mustB, cur) === 0 && pk === P_LBRACE && indAt(d.bk, prev) === BK_BRACED_INIT) {
      const pp = indLink(d.prv, prev);
      if (
        pp >= 0 &&
        (indAt(d.kind, pp) === P_LBRACE || indAt(d.kind, pp) === P_LPAREN || indAt(d.kind, pp) === P_COMMA)
      ) {
        return false;
      }
    }
    if (a.opensScope(prev) && pk !== P_LBRACE && this.lowest < this.sol && this.lowest < indAt(a.nest, cur)) {
      return false;
    }
    if (a.isMemberAccess(cur) && this.topHas(F_CUB)) {
      return false;
    }
    const sp = this.sp;
    if (pk === P_LBRACE && sp > 1) {
      const fl = this.at(sp - 2, R_FL);
      if ((fl & F_NBI) !== 0 && (fl & F_HMNB) !== 0) {
        return false;
      }
    }
    if (indAt(d.type, cur) === TT_FUNCTION_DECLARATION_NAME && this.col < 6) {
      return false;
    }
    if (!(indAt(d.type, cur) === TT_BINARY_OPERATOR || indAt(d.kind, cur) === P_COMMA) && this.topHas(F_NOLBOP)) {
      return false;
    }
    return this.noLB === 0 && !this.topHas(F_NOLB);
  }

  mustBreak(): boolean {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = indLink(d.prv, cur);
    const ck = indAt(d.kind, cur);
    const ct = indAt(d.type, cur);
    const pk = indAt(d.kind, prev);
    const pt = indAt(d.type, prev);
    // BreakBeforeInlineASMColon OnlyMultiline: every operand colon of a
    // line that does not fit.
    if (indAt(a.mustB, cur) === 1 || ct === TT_INLINE_ASM_COLON) {
      return true;
    }
    if (this.topHas(F_BBCB) && a.closesBlockList(cur)) {
      return true;
    }
    if (
      (this.startsNextParameter(cur) ||
        pk === P_SEMI ||
        (pt === TT_TEMPLATE_CLOSER &&
          ct === TT_START_OF_NAME &&
          indAt(d.type, indLink(d.lFirst, this.line)) !== TT_ATTRIBUTE_SQUARE) ||
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
    if (
      ct === TT_CTOR_INITIALIZER_COLON &&
      (indSub(indAdd(this.col, indAt(a.tot, this.lineLast)), indAt(a.tot, prev)) > this.lim || this.topHas(F_BBP)) &&
      (!a.isTrailingComment(cur) || indAt(d.nl, cur) > 0)
    ) {
      return true;
    }
    // An Objective-C method declaration: a `:` after no selector part, and
    // every selector part once one broke before a parameter.
    if (
      ct === TT_OBJC_METHOD_EXPR &&
      pt !== TT_SELECTOR_NAME &&
      indAt(d.type, indLink(d.lFirst, this.line)) === TT_OBJC_METHOD_SPECIFIER
    ) {
      return true;
    }
    if (ct === TT_SELECTOR_NAME && pk !== P_AT && this.topHas(F_OSNF) && this.topHas(F_BBP)) {
      return true;
    }
    const nlc = this.newLineColumn();
    if (
      a.isMemberAccess(cur) &&
      indAdd(this.col, this.lengthToNextOperator(cur)) > d.opts.columnLimit &&
      (this.col > nlc || indAt(a.nest, cur) < this.sol)
    ) {
      return true;
    }
    if (
      this.startsBuilderSegment(cur) &&
      (this.top(R_CC) !== 0 || this.topHas(F_BBP)) &&
      !(this.closesScopeAfterBlock(prev) && this.col <= nlc)
    ) {
      return true;
    }
    if (indAt(a.ctd, prev) === 1 && this.topHas(F_BBP) && indAt(a.canB, cur) === 1) {
      return true;
    }
    if (indAt(d.kind, indLink(d.lFirst, this.line)) !== KW_ENUM && this.col <= nlc) {
      return false;
    }
    if (pt === TT_BINARY_OPERATOR && indAt(a.canB, cur) === 1) {
      const pp = a.prec(prev);
      if (pp !== PREC_ASSIGNMENT && this.topHas(F_BBP) && !a.isTrailingComment(cur)) {
        const lhs = indLink(d.prv, prev);
        if (lhs >= 0 && indAt(a.ebin, lhs) === 1) {
          return true;
        }
        const isCmp =
          (pp === PREC_RELATIONAL || pp === PREC_EQUALITY || pp === PREC_SPACESHIP) &&
          lhs >= 0 &&
          indAt(d.type, lhs) !== TT_BINARY_OPERATOR;
        if (!isCmp) {
          return true;
        }
      }
    } else if (
      ct === TT_BINARY_OPERATOR &&
      indAt(a.canB, cur) === 1 &&
      a.prec(cur) !== PREC_ASSIGNMENT &&
      this.topHas(F_BBP)
    ) {
      return true;
    }
    if (ck === P_LESSLESS && ct !== TT_OVERLOADED_OPERATOR && this.topHas(F_BBP) && this.top(R_FLL) === 0) {
      return true;
    }
    if (indAt(a.nest, cur) === 0 && !a.isTrailingComment(cur)) {
      if (indAt(a.ctd, prev) === 1) {
        return true;
      }
      if (pt === TT_FUNCTION_ANNOTATION_RPAREN && indAt(d.lType, this.line) !== LT_PREPROCESSOR) {
        return true;
      }
    }
    if (
      ct === TT_FUNCTION_DECLARATION_NAME &&
      pk !== KW_TEMPLATE &&
      indAt(d.lRetWrap, this.line) === 0 &&
      this.topHas(F_BBP)
    ) {
      // (clang-format 23: not past a line comment or an inner directive.)
      return indAt(a.nbb, cur) === 0;
    }
    if (pk === P_LBRACE && indAt(d.bk, prev) === BK_BLOCK && ck !== P_RBRACE && ck !== K_COMMENT) {
      return true;
    }
    if (ck === P_LESSLESS && this.endsLine(prev)) {
      return true;
    }
    if (pt === TT_BLOCK_COMMENT && indAt(d.multi, prev) === 1) {
      return true;
    }
    return this.noCont === 1;
  }

  /** `endl`, or a literal ending in a `\n`. */
  endsLine(t: i32): boolean {
    const d = this.d;
    const k = indAt(d.kind, t);
    if (k === K_IDENT && d.len(t) === 4) {
      const s = indAt(d.start, t);
      if (d.at(s) === 101 && d.at(indAdd(s, 1)) === 110 && d.at(indAdd(s, 2)) === 100 && d.at(indAdd(s, 3)) === 108) {
        return true;
      }
    }
    if (k === K_STRING || k === K_CHAR || k === K_NUMBER) {
      const e = indAt(d.end, t);
      const s = indAt(d.start, t);
      if (
        k === K_STRING &&
        indSub(e, s) >= 3 &&
        d.at(indSub(e, 1)) === 34 &&
        d.at(indSub(e, 2)) === 110 &&
        d.at(indSub(e, 3)) === 92
      ) {
        return true;
      }
      if (k === K_CHAR && indSub(e, s) === 4 && d.at(indAdd(s, 1)) === 92 && d.at(indAdd(s, 2)) === 110) {
        return true;
      }
    }
    return false;
  }

  lengthToNextOperator(t: i32): i32 {
    const n = indLink(this.a.nextOp, t);
    return n < 0 ? 0 : indSub(indAt(this.a.tot, n), indAt(this.a.tot, t));
  }

  /**
   * clang-format's getNewLineColumn for a selector part: before the first is
   * placed, indented so its colon is past the longest of the others; after,
   * at the aligned colons.
   */
  /** A selector part's new-line column; sets nlFrom (newLineTotal's). */
  selectorColumn(cur: i32, ind: i32, indF: i32): i32 {
    const d = this.d;
    const w = indAt(d.width, cur);
    this.nlFrom = indF;
    if (!this.topHas(F_OSNF)) {
      let minInd = ind;
      const fi = this.firstIndent;
      const ci = indAdd(fi, d.opts.continuationIndent);
      // max(Indent, FirstIndent + ContinuationIndentWidth): of equal
      // columns, the one indented from further left.
      if (
        indAt(d.type, indLink(d.lFirst, this.line)) === TT_OBJC_METHOD_SPECIFIER &&
        (ci > minInd || (ci === minInd && fi < indF))
      ) {
        minInd = ci;
        this.nlFrom = fi;
      }
      const longest = this.longestSelector(cur);
      // addPadding keeps what the indent was indented from.
      return indSub(indAdd(minInd, longest > w ? longest : w), w);
    }
    if (this.topHas(F_NOALIGN)) {
      return ind;
    }
    const cp = this.top(R_COLON);
    if (cp > w) {
      this.nlFrom = -1;
      return indSub(cp, w);
    }
    return ind;
  }

  /**
   * clang-format's LongestObjCSelectorName of selector part `t`: for the
   * first part of a method declaration, the widest of the parts after it at
   * its level; 0 for any other.
   */
  longestSelector(t: i32): i32 {
    const d = this.d;
    const a = this.a;
    const f = indLink(d.lFirst, this.line);
    if (indAt(d.type, f) !== TT_OBJC_METHOD_SPECIFIER) {
      return 0;
    }
    const lv = indAt(a.nest, t);
    let first = -1;
    let longest = 0;
    for (let q = f; q >= 0; q = indLink(d.nxt, q)) {
      if (indAt(d.type, q) !== TT_SELECTOR_NAME || indAt(a.nest, q) !== lv) {
        continue;
      }
      if (first < 0) {
        first = q;
        if (q !== t) {
          return 0;
        }
      } else if (indAt(d.width, q) > longest) {
        longest = indAt(d.width, q);
      }
    }
    return longest;
  }

  newLineColumn(): i32 {
    this.nlFrom = 0;
    const cur = this.next;
    if (cur < 0 || indLink(this.d.prv, cur) < 0) {
      return 0;
    }
    const r = indAt(this.a.nlc, cur);
    const rc = this.rec;
    const tr = this.topRec;
    if (tr < 0 || tr >= 134217727) {
      fault();
      return 0;
    }
    const o = tr * RS + RF;
    if (o + 13 >= rc.length) {
      fault();
      return 0;
    }
    // The top record's fields, at o + R_*.
    const ind = rc[o + 1];
    const ls = rc[o + 2];
    const fll = rc[o + 4];
    const qc = rc[o + 5];
    const soas = rc[o + 7];
    const cc = rc[o + 8];
    const vp = rc[o + 9];
    const fl = rc[o + 11];
    const indF = rc[o + 12];
    const parent = rc[o - 2];
    // clang-format 23 keeps where each indent was indented from: `x + n`
    // is indented from x, a plain column from itself, and the larger of two
    // equal columns is the one indented from further left.
    const lsInd = ls > ind ? ls : ind;
    const ci = indAdd(lsInd, this.d.opts.continuationIndent);
    const col = this.newLineTotal(r, cur, parent, ind, indF, ls, fll, qc, soas, cc, vp, fl, ci);
    const from = this.nlFrom;
    // A plain column (-1) is indented from itself; -2 is `ci`'s base.
    this.nlFrom = from === -1 ? col : from === -2 ? lsInd : from;
    return col;
  }

  /** newLineColumn's column; sets nlFrom to its IndentedFrom, -1 for the column itself, -2 for `ci`'s. */
  newLineTotal(
    r: i32,
    cur: i32,
    parent: i32,
    ind: i32,
    indF: i32,
    ls: i32,
    fll: i32,
    qc: i32,
    soas: i32,
    cc: i32,
    vp: i32,
    fl: i32,
    ci: i32,
  ): i32 {
    const rc = this.rec;
    this.nlFrom = -1;
    if ((r & N_BLOCK) !== 0) {
      if (indAt(this.a.nest, cur) === 0) {
        return this.firstIndent;
      }
      this.nlFrom = indF;
      return ind;
    }
    if ((r & N_LARROW) !== 0) {
      this.nlFrom = -2;
      return ci;
    }
    if ((r & N_CLOSEBR) !== 0 && this.sp > 1) {
      if ((r & N_CLOSEBL) !== 0) {
        return indField(rc, parent, R_NBI);
      }
      if ((r & N_BRINIT) !== 0) {
        // At the top level, or right inside an assignment, the brace lines
        // up with the start of the line (clang-format 23).
        if (
          (this.sp === 2 && (r & N_BRSON) !== 0) ||
          (this.sp === 3 && this.at(1, R_TOK) === fakeTok(PREC_ASSIGNMENT))
        ) {
          return this.firstIndent;
        }
        return indField(rc, parent, R_LS);
      }
      return this.firstIndent;
    }
    if ((r & N_RPAREN) !== 0 && this.sp > 1) {
      return indField(rc, parent, R_LS);
    }
    if ((r & N_STRING) !== 0 && this.sosl !== 0) {
      return this.sosl;
    }
    if (indAt(this.d.type, cur) === TT_SELECTOR_NAME) {
      return this.selectorColumn(cur, ind, indF);
    }
    if ((r & N_LESSLESS) !== 0) {
      if (fll !== 0) {
        return fll;
      }
    }
    if ((r & N_MEMBER) !== 0) {
      if (cc === 0) {
        this.nlFrom = -2;
        return ci;
      }
      return cc;
    }
    if ((r & N_QC) !== 0) {
      if (qc !== 0) {
        if ((r & N_QCIND) !== 0 && (fl & F_IWC) === 0) {
          return indSub(ind, this.d.opts.continuationIndent);
        }
        return qc;
      }
    }
    if ((r & N_COMMA) !== 0) {
      if (vp !== 0) {
        return vp;
      }
    }
    if ((r & N_RQC) !== 0) {
      this.nlFrom = ind;
      return indAdd(ind, this.d.opts.indentWidth);
    }
    if ((r & N_CTORCOL) !== 0) {
      return indAdd(this.firstIndent, 4);
    }
    if ((r & N_MAXLSIND) !== 0) {
      if (ind > ls) {
        this.nlFrom = indF;
        return ind;
      }
      if (ind === ls && indF < ls) {
        this.nlFrom = indF;
      }
      return ls;
    }
    if ((r & N_SUBSCRIPT) !== 0) {
      if (soas !== 0) {
        return soas;
      }
      this.nlFrom = -2;
      return ci;
    }
    if ((r & N_OMP) !== 0) {
      this.nlFrom = ind;
      return indAdd(ind, this.d.opts.continuationIndent);
    }
    if ((r & N_CI) !== 0) {
      this.nlFrom = -2;
      return ci;
    }
    if ((r & N_IND) !== 0) {
      this.nlFrom = indF;
      return ind;
    }
    if ((r & N_CI2) !== 0) {
      this.nlFrom = -2;
      return ci;
    }
    if ((r & N_PNCOK) !== 0 && ind === this.firstIndent) {
      this.nlFrom = ind;
      return indAdd(ind, this.d.opts.continuationIndent);
    }
    this.nlFrom = indF;
    return ind;
  }

  /** The outermost implicit paren starting at `t`, or -1. */
  outerFake(t: i32): i32 {
    const h = indLink(this.a.fkHead, t);
    return h < 0 ? -1 : indAt(this.a.fkPrec, h);
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
    return indAdd64(this.moveToNext(newline), pen);
  }

  addOnCurrentLine(extra: i32): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    // An implicit string literal keeps the whitespace before it as written:
    // after a newline in it, the column is the written one (clang-format's
    // 1-based spelling column).
    if (d.anyImplicit && indAt(d.type, cur) === TT_IMPLICIT_STRING_LITERAL) {
      this.col = implicitColumn(d, cur, this.col);
      const fm0 = this.fm;
      if (!this.dry && fm0 !== null) {
        fm0.emit(cur, 0, this.col);
      }
      return;
    }
    const r = indAt(a.cf, cur);
    if ((r & C_NOLB) !== 0) {
      this.noLB = 1;
    }
    if ((r & C_VP) !== 0 && this.top(R_VP) === 0) {
      let vp = this.col;
      let tk = indLink(d.prv, cur);
      while (tk >= 0 && vp >= indAt(d.width, tk)) {
        vp = indSub(vp, indAt(d.width, tk));
        if (indAt(d.spaces, tk) !== 0) {
          break;
        }
        tk = indLink(d.prv, tk);
      }
      this.setTop(R_VP, vp);
      if (indAt(a.pmv, indLink(d.prv, cur)) === 1) {
        this.setTop(R_LS, vp);
      }
    }
    const spaces = indAdd(indAt(d.spaces, cur), extra);
    const fm = this.fm;
    if (!this.dry && fm !== null) {
      fm.emit(cur, 0, indAdd(this.col, spaces));
    }
    if ((r & C_ALIGN) !== 0) {
      this.setInd(indAdd(this.col, spaces), indAdd(this.col, spaces));
      this.setTop(R_AL, indLink(d.prv, cur));
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
    if (indAt(d.type, cur) === TT_SELECTOR_NAME && !this.topHas(F_OSNF)) {
      // The first selector part on the line sets where the colons align.
      const ci = indAdd(this.firstIndent, d.opts.continuationIndent);
      const ind = this.top(R_IND);
      const minInd = ci > ind ? ci : ind;
      const firstColon = indAdd(indAdd(this.col, spaces), indAt(d.width, cur));
      const longest = this.longestSelector(cur);
      if (longest === 0) {
        this.setTopFlag(F_NOALIGN, true);
      } else {
        const ml = indAdd(minInd, longest);
        this.setTop(R_COLON, ml > firstColon ? ml : firstColon);
      }
    }
    this.col = indAdd(this.col, spaces);
    const ls = (r >> C_LS_SHIFT) & 7;
    if (ls === 1) {
      this.setTop(R_LS, this.col);
      this.setTop(R_NBI, this.col);
    } else if (ls === 2) {
      this.setTop(R_LS, this.col);
    } else if (ls === 3) {
      this.setInd(this.col, this.col);
      this.setTop(R_LS, this.col);
    } else if (ls === 4) {
      const sp = this.sp;
      if (sp > 1 && this.at(sp - 2, R_CC) === 0) {
        this.setTop(R_LS, this.col);
      }
    }
  }

  /** The last comma directly inside the bracket `o`, or -1. */
  lastComma(o: i32): i32 {
    const d = this.d;
    const c = indLink(d.match, o);
    if (c < 0) {
      return -1;
    }
    let last = -1;
    for (let t = indLink(d.nxt, o); t >= 0 && t !== c; t = indLink(d.nxt, t)) {
      if (this.a.opensScope(t) && indLink(d.match, t) > t) {
        t = indLink(d.match, t);
        continue;
      }
      if (indAt(d.kind, t) === P_COMMA) {
        last = t;
      }
    }
    return last;
  }

  addOnNewLine(): i64 {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const prev = indLink(d.prv, cur);
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
    pen = indAdd64(pen, toI64(indAt(a.pen, cur)));
    if (
      indAt(d.kind, nnc) === P_LESSLESS &&
      this.top(R_FLL) === 0 &&
      (this.col <= d.opts.columnLimit / 3 || this.topHas(F_BBP))
    ) {
      pen = indAdd64(pen, toI64(PEN_FIRST_LESSLESS));
    }
    this.col = this.newLineColumn();
    const from = this.nlFrom;
    if (indAt(d.type, nnc) === TT_SELECTOR_NAME) {
      const w = indAt(d.width, nnc);
      if (!this.topHas(F_OSNF)) {
        const longest = this.longestSelector(nnc);
        if (longest === 0) {
          this.setTopFlag(F_NOALIGN, true);
        } else {
          let base = this.top(R_IND);
          const ci = indAdd(this.firstIndent, d.opts.continuationIndent);
          if (indAt(d.type, indLink(d.lFirst, this.line)) === TT_OBJC_METHOD_SPECIFIER && ci > base) {
            base = ci;
          }
          this.setTop(R_COLON, indAdd(base, longest > w ? longest : w));
        }
      } else if (!this.topHas(F_NOALIGN) && this.top(R_COLON) <= w) {
        this.setTop(R_COLON, indAdd(this.col, w));
      }
    }
    if (indAt(d.type, cur) !== TT_LAMBDA_ARROW) {
      this.setTop(R_NBI, this.col);
    }
    if (a.isMemberAccess(nnc)) {
      if (this.top(R_CC) === 0) {
        this.setTop(R_CC, this.col);
      }
    }
    const pnk = pnc >= 0 ? indAt(d.kind, pnc) : -1;
    const pnt = pnc >= 0 ? indAt(d.type, pnc) : -1;
    if (
      (pnc >= 0 && (pnk === P_COMMA || pnk === P_SEMI) && !this.topHas(F_AVOID)) ||
      indAt(d.type, prev) === TT_BINARY_OPERATOR
    ) {
      this.setTopFlag(F_BBP, false);
    }
    if (pnc >= 0 && (pnt === TT_TEMPLATE_CLOSER || indAt(a.crc, pnc) === 1) && indAt(a.nest, cur) === 0) {
      this.setTopFlag(F_BBP, false);
    }
    if (indAt(d.kind, nnc) === P_QUESTION || pnk === P_QUESTION) {
      this.setTopFlag(F_BBP, true);
    }
    // What the line is aligned to (BreakInheritanceList BeforeColon).
    if (indAt(d.type, cur) === TT_INHERITANCE_COLON || indAt(d.type, prev) === TT_INHERITANCE_COMMA) {
      let k = indLink(d.prv, prev);
      while (k >= 0) {
        const kk = indAt(d.kind, k);
        if (kk === KW_CLASS || kk === KW_STRUCT || kk === KW_UNION) {
          break;
        }
        k = indLink(d.prv, k);
      }
      this.setTop(R_AL, k);
    }
    if (indAt(d.type, cur) === TT_BINARY_OPERATOR && indAt(a.canB, cur) === 1) {
      this.setTopFlag(F_BBP, false);
      this.setTop(R_AL, cur);
    }
    if (indAt(d.type, cur) === TT_CONDITIONAL_EXPR) {
      // AlignOperands Align: a `?` to the `=` before it, a `:` to its `?`.
      const want = indAt(d.kind, cur) === P_QUESTION ? P_EQUAL : P_QUESTION;
      let k = prev;
      while (k >= 0 && indAt(d.kind, k) !== want) {
        k = indLink(d.prv, k);
      }
      this.setTop(R_AL, k);
    }
    if (!this.dry) {
      let nls = indAt(d.nl, cur);
      if (nls > 2) {
        nls = 2;
      }
      if (nls < 1) {
        nls = 1;
      }
      if (indAt(d.kind, cur) === P_RBRACE) {
        const m = indLink(d.match, cur);
        if (m >= 0 && indLink(d.childHead, m) >= 0) {
          nls = 1;
        }
      }
      const fm = this.fm;
      if (fm !== null) {
        fm.emitAligned(cur, nls, this.col, from, this.top(R_AL));
      }
    }
    if (!a.isTrailingComment(cur)) {
      this.setTop(R_LS, this.col);
    }
    if (indAt(d.kind, cur) === P_LESSLESS) {
      this.setTop(R_LS, indAdd(this.top(R_LS), 3));
    }
    this.sol = indAt(a.nest, cur);
    this.lowest = indAt(a.nest, cur);
    // Any break means the levels around have broken (clang-format's
    // NestedBlockSpecialCase: not for the `}` of a requires expression).
    if (
      !(indAt(d.kind, cur) === P_RBRACE && indLink(d.match, cur) >= 0 && requiresExprBrace(d, indLink(d.match, cur)))
    ) {
      this.flagAll(F_BBP, false);
    }
    if (
      pnc >= 0 &&
      pnk !== P_COMMA &&
      pnk !== P_COLON &&
      pnk !== P_SEMI &&
      ((pnt !== TT_TEMPLATE_CLOSER && indAt(a.crc, pnc) === 0) || indAt(a.nest, cur) !== 0) &&
      pnt !== TT_BINARY_OPERATOR &&
      pnt !== TT_FUNCTION_ANNOTATION_RPAREN &&
      indAt(d.type, cur) !== TT_BINARY_OPERATOR &&
      !a.opensScope(pnc)
    ) {
      this.setTopFlag(F_BBP, true);
    }
    if (pnc >= 0 && (pnk === P_LBRACE || pnt === TT_ARRAY_INITIALIZER_LSQUARE)) {
      this.setTopFlag(F_BBCB, true);
    }
    if (this.topHas(F_AVOID)) {
      const pk = indAt(d.kind, prev);
      if (!(pk === P_LPAREN || pk === P_LBRACE || indAt(d.type, prev) === TT_BINARY_OPERATOR)) {
        this.setTopFlag(F_BBP, true);
      }
    }
    return pen;
  }

  moveToNext(newline: boolean): i64 {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    const mf = indAt(a.mf, cur);
    if (indAt(d.type, cur) === TT_SELECTOR_NAME) {
      this.setTopFlag(F_OSNF, true);
    }
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
      const nst = indAt(a.nest, cur);
      if (nst < this.lowest) {
        this.lowest = nst;
      }
    }
    if ((mf & M_MEMBER) !== 0) {
      this.setTop(R_SOFC, indLink(a.nextOp, cur) < 0 ? 0 : this.col);
    }
    if ((mf & M_CTORCOLON) !== 0) {
      this.setInd(indAdd(this.col, 2), indAdd(this.col, 2));
      this.setTop(R_NBI, this.top(R_IND));
      this.setTopFlag(F_BBP, false);
    }
    if ((mf & M_INHCOLON) !== 0) {
      this.setInd(indAdd(this.firstIndent, 4), indAdd(this.firstIndent, 4));
    }
    if ((mf & M_NBINL) !== 0 && newline) {
      this.setTop(R_NBI, indAdd(indAdd(this.col, indAt(d.width, cur)), 1));
    }
    if ((mf & M_LSSET) !== 0) {
      this.setTop(R_LS, this.col);
    }
    const sp = this.sp;
    if ((mf & M_AFTERBRACE) !== 0 && sp > 1 && !this.topHas(F_HMNB)) {
      if ((this.at(sp - 2, R_FL) & F_NBI) !== 0 && newline) {
        this.flagAll(F_NOLB, false);
      }
      this.setAt(sp - 2, R_FL, this.at(sp - 2, R_FL) & ~F_NBI);
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
    this.col = indAdd(this.col, indAt(d.kind, cur) !== K_COMMENT ? indAt(d.width, cur) : this.widthAt(cur, this.col));
    this.next = cur === this.lineLast ? -1 : indLink(d.nxt, cur);
    let pen: i64 = 0;
    if ((mf & M_EOL) !== 0) {
      pen = this.endOfLine(cur, allowBreak);
    } else if (this.col > this.lim) {
      pen = PEN_EXCESS * toI64(indSub(this.col, this.lim));
    }
    if ((mf & M_ROLEAVOID) !== 0) {
      this.setTopFlag(F_AVOID, true);
    }
    if ((mf & M_PREVROLE) !== 0) {
      pen = indAdd64(pen, this.formatListAfter(indLink(a.pnc, cur), cur));
    }
    return pen;
  }

  pastFakeL(newline: boolean): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    let node = indLink(a.fkHead, cur);
    if (node < 0) {
      return;
    }
    const prev = a.prevNonComment(cur);
    let skipFirst = false;
    if (prev >= 0) {
      const pk = indAt(d.kind, prev);
      skipFirst =
        a.opensScope(prev) ||
        pk === P_SEMI ||
        pk === KW_RETURN ||
        indAt(a.rqc, prev) === 1 ||
        a.prec(prev) === PREC_ASSIGNMENT;
    }
    const trailing = a.isTrailingComment(cur);
    let first = true;
    while (node >= 0) {
      const p = indAt(a.fkPrec, node);
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
      this.setTop(R_TOK, fakeTok(p));
      if (!trailing && (prev < 0 || indAt(d.kind, prev) !== KW_RETURN || p > 0)) {
        // max({Column, Indent, LastSpace}): of equal columns, the one
        // indented from further left.
        let ind = this.top(R_IND);
        let from = this.top(R_INDF);
        const c = this.col;
        if (c > ind || (c === ind && c < from)) {
          ind = c;
          from = c;
        }
        if (topLs > ind || (topLs === ind && topLs < from)) {
          ind = topLs;
          from = topLs;
        }
        this.setInd(ind, from);
      }
      // A `_Generic` selection's associations are continuation-indented
      // from the state around the keyword's parenthesis, not under it
      // (clang-format 23: `Stack[size - 2].Indent + ContinuationIndentWidth`;
      // `dupTop` has pushed the new state, so that one is `sp - 3`).
      const sp = this.sp;
      if (prev >= 0 && indAt(d.kind, prev) === P_LPAREN && sp > 2) {
        const gk = a.prevNonComment(prev);
        if (gk >= 0 && indAt(d.kind, gk) === KW_GENERIC) {
          const base = this.at(sp - 3, R_IND);
          this.setInd(indAdd(base, d.opts.continuationIndent), base);
        }
      }
      if (
        (this.unindentNext(cur) ||
          (prev >= 0 &&
            p === PREC_CONDITIONAL &&
            indAt(d.kind, prev) === P_QUESTION &&
            indAt(d.type, prev) === TT_CONDITIONAL_EXPR)) &&
        !newline
      ) {
        this.setTop(R_AL, prev);
      }
      if (p > PREC_UNKNOWN && this.col > this.top(R_LS)) {
        this.setTop(R_LS, this.col);
      }
      if (p !== PREC_CONDITIONAL && indAt(d.type, cur) !== TT_UNARY_OPERATOR) {
        this.setTop(R_SOFC, this.col);
      }
      if (
        p === PREC_CONDITIONAL &&
        prev >= 0 &&
        indAt(d.kind, prev) === P_COLON &&
        indAt(d.type, prev) === TT_CONDITIONAL_EXPR &&
        first &&
        !topIwc
      ) {
        fl = fl | F_ICC;
      } else if (p === PREC_CONDITIONAL || (!skipFirst && p > PREC_ASSIGNMENT && !trailing)) {
        const base = this.top(R_IND);
        this.setInd(indAdd(base, d.opts.continuationIndent), base);
      }
      if ((prev >= 0 && !a.opensScope(prev)) || p !== PREC_COMMA) {
        fl = fl & ~F_BBP;
      }
      this.setTop(R_FL, fl);
      skipFirst = false;
      first = false;
      node = indLink(a.fkNext, node);
    }
  }

  unindentNext(t: i32): boolean {
    const p = this.a.prevNonComment(t);
    return (
      p >= 0 &&
      (this.a.prec(p) === PREC_ASSIGNMENT || indAt(this.d.kind, p) === KW_RETURN || indAt(this.a.rqc, p) === 1)
    );
  }

  pastFakeR(): void {
    const n = indAt(this.a.fakeR, this.next);
    for (let i = 0; i < n; i++) {
      const vp = this.top(R_VP);
      if (this.sp === 1) {
        break;
      }
      this.pop();
      this.setTop(R_VP, vp);
    }
    if (indAt(this.a.crc, this.next) === 1) {
      this.setTop(R_LS, indSub(this.top(R_LS), this.d.opts.indentWidth));
    }
  }

  pastScopeOpener(newline: boolean): void {
    const d = this.d;
    const a = this.a;
    const cur = this.next;
    if (!a.opensScope(cur)) {
      return;
    }
    if (indLink(d.match, cur) >= 0 && indAt(d.kind, cur) === P_LBRACE && indAt(d.bk, cur) === BK_BLOCK) {
      const nbi = this.top(R_NBI);
      const bi = indAdd(nbi, d.opts.indentWidth);
      this.push(cur, bi, bi, this.top(R_LS), true, false);
      this.setTop(R_NBI, nbi);
      this.setTopFlag(F_BBP, true);
      return;
    }
    let newIndent = 0;
    let newFrom = 0; // what newIndent is indented from
    let ls = this.top(R_LS);
    let avoid = false;
    let bbp = false;
    let nbi = this.top(R_SOFC) > this.top(R_NBI) ? this.top(R_SOFC) : this.top(R_NBI);
    const ck = indAt(d.kind, cur);
    const m = indLink(d.match, cur);
    if (ck === P_LBRACE || indAt(d.type, cur) === TT_ARRAY_INITIALIZER_LSQUARE) {
      if (a.opensBlockList(cur)) {
        newIndent = indAdd(d.opts.indentWidth, this.col < this.top(R_NBI) ? this.col : this.top(R_NBI));
        newFrom = newIndent;
      } else {
        newIndent = indAdd(this.top(R_LS), d.opts.continuationIndent);
        // A braced list's indent is LastSpace's plus the width; an array
        // initializer's is a plain column.
        newFrom = ck === P_LBRACE ? this.top(R_LS) : newIndent;
      }
      const nn = a.nextNonComment(cur);
      // (clang-format 23 looks past comments before the `}`.)
      const lc = m >= 0 ? a.prevNonComment(m) : -1;
      const endsInComma = lc >= 0 && indAt(d.kind, lc) === P_COMMA;
      avoid =
        endsInComma ||
        (nn >= 0 &&
          (indAt(d.type, nn) === TT_DESIGNATED_INITIALIZER_PERIOD ||
            indAt(d.type, nn) === TT_DESIGNATED_INITIALIZER_LSQUARE));
      bbp = endsInComma;
      if (indAt(a.pcnt, cur) > 1 && indAdd(this.col, 1) > nbi) {
        nbi = indAdd(this.col, 1);
      }
    } else {
      const base = this.top(R_LS) > this.top(R_SOFC) ? this.top(R_LS) : this.top(R_SOFC);
      newIndent = indAdd(d.opts.continuationIndent, base);
      newFrom = base;
      // A `_Generic` selection takes one association per line.
      const gp = a.prevNonComment(cur);
      if (ck === P_LPAREN && gp >= 0 && indAt(d.kind, gp) === KW_GENERIC) {
        avoid = true;
      }
      if (ck === P_LESS && this.parentIsParen(cur)) {
        const ti = this.top(R_IND);
        const tf = this.top(R_INDF);
        if (ti > newIndent || (ti === newIndent && tf < newFrom)) {
          newIndent = ti;
          newFrom = tf;
        }
        if (this.top(R_IND) > ls) {
          ls = this.top(R_IND);
        }
      }
    }
    const noLB =
      indLink(d.childHead, cur) < 0 &&
      indAt(d.type, cur) !== TT_ARRAY_INITIALIZER_LSQUARE &&
      (this.topHas(F_NOLB) ||
        this.topHas(F_NOLBOP) ||
        (indAt(d.type, cur) === TT_TEMPLATE_OPENER && this.topHas(F_CUB)));
    this.push(cur, newIndent, newFrom, ls, avoid, noLB);
    this.setTop(R_NBI, nbi);
    this.setTopFlag(F_BBP, bbp);
    this.setTopFlag(F_HMNB, indAt(a.bpcnt, cur) > 1);
  }

  /** Whether the bracket enclosing `t` is a `(`. */
  parentIsParen(t: i32): boolean {
    const d = this.d;
    const rec = this.rec;
    let r = this.topRec;
    while (r >= 0) {
      const tok = indField(rec, r, R_TOK);
      if (tok >= 0) {
        return indAt(d.kind, tok) === P_LPAREN;
      }
      r = indParent(rec, r);
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
    const ck = indAt(d.kind, cur);
    if (
      this.sp > 1 &&
      (ck === P_RPAREN ||
        ck === P_RSQUARE ||
        (ck === P_RBRACE && cur !== indLink(d.lFirst, this.line)) ||
        indAt(d.type, cur) === TT_TEMPLATE_CLOSER)
    ) {
      this.pop();
    }
    if (ck === P_RSQUARE) {
      const n = a.nextNonComment(cur);
      if (n >= 0 && indAt(d.kind, n) !== P_LSQUARE) {
        this.setTop(R_SOAS, 0);
      }
    }
  }

  endOfLine(cur: i32, allowBreak: boolean): i64 {
    const d = this.d;
    const a = this.a;
    let pen: i64 = 0;
    if (indAt(d.multi, cur) === 1 && indAt(d.type, cur) !== TT_BLOCK_COMMENT) {
      this.flagAll(F_BBP, true);
      const used = this.col;
      const fm = this.fm;
      this.col = fm !== null ? fm.lastLineWidth(cur) : indAt(d.width, cur);
      if (used > this.lim) {
        pen = indAdd64(pen, PEN_EXCESS * toI64(indSub(used, this.lim)));
      }
    } else if (
      indAt(d.lType, this.line) !== LT_IMPORT &&
      allowBreak &&
      indAt(d.kind, cur) === K_STRING &&
      indAt(d.lType, this.line) !== LT_PREPROCESSOR
    ) {
      pen = pen + this.breakString(cur);
    }
    const fmc = this.fm;
    if (
      indAt(d.kind, cur) === K_COMMENT &&
      indAt(d.type, cur) === TT_LINE_COMMENT &&
      fmc !== null &&
      indAt(d.lType, this.line) !== LT_IMPORT
    ) {
      // A line comment is split to fit, as clang-format's breakProtrudingToken.
      pen = indAdd64(pen, fmc.commentPenalty(cur, indSub(this.col, indAt(d.width, cur))));
    } else if (
      indAt(d.kind, cur) === K_COMMENT &&
      indAt(d.type, cur) === TT_BLOCK_COMMENT &&
      fmc !== null &&
      (this.col > this.lim ||
        indAt(d.multi, cur) === 1 ||
        (indSub(indAdd(this.col, indAt(a.tot, this.lineLast)), indAt(a.tot, cur)) > this.lim &&
          indAdd(this.col, fmc.unbreakableTail(cur)) > this.lim))
    ) {
      // So is a block comment, reflowed; one whose blanks were squeezed to
      // fit ends that much sooner.
      pen = indAdd64(pen, fmc.blockCommentPenalty(cur, indSub(this.col, indAt(d.width, cur))));
      if (indAt(d.multi, cur) === 0 && fmc.bcShrink > 0) {
        this.col = indSub(this.col, fmc.bcShrink);
      }
    } else if (this.col > this.lim) {
      pen = indAdd64(pen, PEN_EXCESS * toI64(indSub(this.col, this.lim)));
    }
    // Line comments continuing this one's section go under it, each on its own line.
    if (indAt(d.kind, cur) === K_COMMENT && indAt(d.type, cur) === TT_LINE_COMMENT) {
      const startCol = indSub(this.col, indAt(d.width, cur));
      while (
        this.next >= 0 &&
        indAt(d.kind, this.next) === K_COMMENT &&
        indAt(d.type, this.next) === TT_LINE_COMMENT &&
        indAt(d.nl, this.next) === 1 &&
        this.continuesSection(this.next, indLink(d.prv, this.next))
      ) {
        const fm = this.fm;
        if (!this.dry && fm !== null) {
          // Aligned to the section's first comment when that one trails code.
          fm.emitAligned(this.next, 1, startCol, startCol, indAt(d.nl, cur) === 0 ? cur : -1);
        }
        // Each is split or overflows where the section's column puts it.
        if (fm !== null && indAt(d.lType, this.line) !== LT_PREPROCESSOR) {
          pen = indAdd64(pen, fm.commentPenalty(this.next, startCol));
        }
        this.next = this.next === this.lineLast ? -1 : indLink(d.nxt, this.next);
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
    const f = indLink(d.lFirst, this.line);
    let minTok = f;
    for (let q = f; q >= 0; q = indLink(d.nxt, q)) {
      const n = indLink(d.nxt, q);
      if (
        n >= 0 &&
        indAt(d.kind, q) === P_LBRACE &&
        indAt(d.kind, n) === K_COMMENT &&
        indAt(d.type, n) === TT_LINE_COMMENT
      ) {
        minTok = q;
        break;
      }
      if (indAt(d.nl, q) > 0) {
        minTok = q;
      }
      if (q === prev) {
        break;
      }
    }
    const isLine = indAt(d.kind, minTok) === K_COMMENT && indAt(d.type, minTok) === TT_LINE_COMMENT;
    return d.origCol(c) >= indAdd(d.origCol(minTok), isLine ? 0 : 1);
  }

  /** The prefix length (through the quote) of a breakable string literal, or 0. */
  stringPrefix(t: i32): i32 {
    const d = this.d;
    const a = indAt(d.start, t);
    const e = indAt(d.end, t);
    const n = indSub(e, a);
    if (n < 2 || d.at(indSub(e, 1)) !== 34) {
      return 0;
    }
    const c0 = d.at(a);
    if (c0 === 34) {
      return 1;
    }
    if ((c0 === 117 || c0 === 85 || c0 === 76 || c0 === 64) && d.at(indAdd(a, 1)) === 34) {
      return 2;
    }
    if (c0 === 117 && d.at(indAdd(a, 1)) === 56 && d.at(indAdd(a, 2)) === 34) {
      return 3;
    }
    return 0;
  }

  /** Columns of source bytes [a, b) starting at column `c` (tabs to stops of 8). */
  cols(a: i32, b: i32, c: i32): i32 {
    // Between tabs, clang-format's columnWidth: display columns, or the
    // byte count when a code point is not printable.
    const src = this.d.src;
    if (a < b && (a < 0 || b > src.length)) {
      fault();
      return 0;
    }
    let w = 0;
    let seg = a;
    let high = false;
    for (let i = a; i >= 0 && i < b && i < src.length; i++) {
      const ch = toI32(src[i]);
      if (ch === 9) {
        // (`a <= seg <= i`: the u32 difference is the true one.)
        w = indAdd(w, high ? utf8Width(src, seg, i) : toI32(toU32(i) - toU32(seg)));
        w = indSub(indAdd(w, 8), indAdd(c, w) % 8);
        seg = i + 1;
        high = false;
      } else if (ch >= 128) {
        high = true;
      }
    }
    return indAdd(w, high ? utf8Width(src, seg, b) : indSub(b, seg));
  }

  /** The length of the escape sequence at `i` (a backslash), bounded by `e`. */
  escapeLen(i: i32, e: i32): i32 {
    const d = this.d;
    const i1 = indAdd(i, 1);
    if (i1 >= e) {
      return 1;
    }
    const c = d.at(i1);
    if (c === 117) {
      return 6;
    }
    if (c === 85) {
      return 10;
    }
    if (c === 120) {
      // p is i + k.
      let p = indAdd(i, 2);
      while (p < e && isHex(d.at(p))) {
        p++;
      }
      return indSub(p, i);
    }
    if (c >= 48 && c <= 55) {
      let k = 1;
      while (true) {
        const p = indAdd(i, k);
        if (!(p < e && k < 4 && d.at(p) >= 48 && d.at(p) <= 55)) {
          break;
        }
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
    const maxSplit = indSub(limit, used);
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
        chars = indAdd(chars, adv);
      } else {
        adv = utf8Len(c);
        if (c === 9) {
          chars = indSub(indAdd(chars, 8), indAdd(used, chars) % 8);
        } else {
          chars = indAdd(chars, 1);
        }
      }
      if (chars > maxSplit || indSub(e, i) <= adv || faulted()) {
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
      split = indAdd(split, adv);
      i = indAdd(i, adv);
    }
    if (spaceOff !== 0) {
      return indAdd(spaceOff, 1);
    }
    if (slashOff !== 0) {
      return indAdd(slashOff, 1);
    }
    if (wordOff !== 0) {
      return indAdd(wordOff, 1);
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
    if (indAdd(this.col, indAt(a.tail, cur)) <= this.lim && indAt(a.strTab, cur) === 0) {
      return 0;
    }
    const pl = this.stringPrefix(cur);
    if (pl === 0) {
      return 0;
    }
    const utl = this.next >= 0 && this.canBreak() ? 0 : indAt(a.tail, cur);
    if (indAt(a.tail, cur) >= this.lim) {
      return 0;
    }
    const startCol = indSub(this.col, indAt(d.width, cur));
    const e = indSub(indAt(d.end, cur), 1);
    let off = indAdd(indAt(d.start, cur), pl);
    let csc = indAdd(startCol, pl);
    let rem = indAdd(indAdd(utl, 1), this.cols(off, e, csc));
    let pen: i64 = 0;
    let n = 0;
    while (indAdd(csc, rem) > this.lim && !faulted()) {
      const sp = this.stringSplit(off, e, csc, indSub(this.lim, 1));
      if (sp < 0) {
        break;
      }
      csc = indAdd(startCol, pl);
      const nr = indAdd(indAdd(utl, 1), this.cols(indAdd(off, sp), e, csc));
      if (nr >= rem) {
        break;
      }
      if (n >= toI32(this.cuts.length)) {
        this.cuts = growI32(this.cuts, indAdd(n, 1));
      }
      const cuts = this.cuts;
      if (n < 0 || n >= cuts.length) {
        fault();
        return pen;
      }
      cuts[n] = indAdd(off, sp);
      n++;
      pen = indAdd64(pen, toI64(PEN_BREAK_STRING));
      off = indAdd(off, sp);
      rem = nr;
    }
    this.col = indSub(indAdd(csc, rem), indAt(a.tail, cur));
    if (n > 0) {
      // A string after others in a run of adjacent literals: on its next run
      // clang-format aligns each piece, now a literal of its own, under the
      // run's first string.
      let pieceCol = startCol;
      if (this.sosl > 0 && this.sosl < startCol) {
        pieceCol = this.sosl;
        this.col = indSub(this.col, indSub(startCol, pieceCol));
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
    const r = indAt(a.role, lb);
    if (indAt(a.rlFmtN, r) <= 1 || this.next < 0) {
      return 0;
    }
    if (
      !(indAt(d.kind, lb) === P_LBRACE || indAt(d.type, lb) === TT_ARRAY_INITIALIZER_LSQUARE) ||
      indAt(d.bk, lb) === BK_BLOCK ||
      (indLink(d.nxt, lb) >= 0 && indAt(d.type, indLink(d.nxt, lb)) === TT_DESIGNATED_INITIALIZER_PERIOD)
    ) {
      return 0;
    }
    const remaining = indAdd(indSub(d.opts.columnLimit, this.col), indAt(d.width, cur));
    // (Read just above: `r` is a list; columnFormat's proofs read this test.)
    if (r < 0 || r >= a.rlFmtN.length) {
      fault();
      return 0;
    }
    const f = a.columnFormat(r, remaining);
    if (f < 0) {
      return 10000;
    }
    let pen: i64 = 0;
    let column = 0;
    let item = 0;
    const co = indAt(a.rlCommaOff, r);
    const nc = indAt(a.rlCommaN, r);
    const cols = indAt(a.fmtCols, f);
    const so = indAt(a.fmtSizeOff, f);
    const io = indAt(a.rlItemOff, r);
    const close = indLink(d.match, lb);
    while (this.next >= 0 && this.next !== close) {
      let nl = false;
      let extra = 0;
      if (item < nc && indLink(d.prv, this.next) === indAt(a.commaPool, indAdd(co, item))) {
        if (!a.isTrailingComment(this.next)) {
          extra = indSub(indAdd(extra, indAt(a.sizePool, indAdd(so, column))), indAt(a.itemLen, indAdd(io, item)));
          column = indAdd(column, 1);
        }
        item++;
      }
      if (column === cols || indAt(a.mustB, this.next) === 1) {
        column = 0;
        nl = true;
      }
      // clang-format's column layout places no child block: a lambda body
      // in the list keeps its whitespace as written.
      const pv = indLink(d.prv, this.next);
      const fm = this.fm;
      if (!this.dry && fm !== null && pv >= 0 && indLink(d.childHead, pv) >= 0) {
        let c = indLink(d.childHead, pv);
        let last = -1;
        while (c >= 0) {
          while (indLink(d.lSibling, c) >= 0) {
            c = indLink(d.lSibling, c);
          }
          last = indLink(d.lLast, c);
          c = indLink(d.childHead, last);
        }
        if (last >= 0) {
          const e = indAt(d.end, last);
          fm.emitRaw(indAt(d.end, pv), d.at(e) === 32 ? indAdd(e, 1) : e);
        }
      }
      pen = indAdd64(pen, this.addToken(nl, extra));
    }
    return pen;
  }

  // ---- Children ---------------------------------------------------------

  /** Places a child block before the next token; false when it cannot go on this line. */
  formatChildren(newline: boolean): i64 {
    const d = this.d;
    const a = this.a;
    const nt = this.next;
    const prev = indLink(d.prv, nt);
    const lb = a.prevNonComment(nt);
    if (indLink(d.childHead, prev) < 0 || lb < 0 || !(indAt(d.kind, lb) === P_LBRACE && indAt(d.bk, lb) === BK_BLOCK)) {
      return 0;
    }
    const c0 = indLink(d.childHead, prev);
    if (newline) {
      let lv = c0;
      while (indAt(d.lAbs, lv) === 1 && indLink(d.lSibling, lv) >= 0) {
        lv = indLink(d.lSibling, lv);
      }
      const addInd = indSub(this.top(R_IND), mul32(indAt(d.lLevel, lv), d.opts.indentWidth));
      return this.childList(c0, addInd);
    }
    const cf = indLink(d.lFirst, c0);
    // A block literal's body never shares its line (AllowShortBlocksOnASingleLine: Never).
    if (
      indAt(a.mustB, cf) === 1 ||
      indAt(d.kind, prev) === K_COMMENT ||
      indAt(d.childCount, prev) > 1 ||
      indAt(d.type, prev) === TT_BLOCK_LITERAL_LBRACE
    ) {
      return -1;
    }
    const cl = indLink(d.lLast, c0);
    if (a.isTrailingComment(cl)) {
      return -1;
    }
    if (indAdd(indAdd(indAt(a.tot, cl), this.col), 2) > this.lim) {
      return -1;
    }
    const at = indAdd(this.col, 1);
    const o = this.save();
    const saved = this.saveLine();
    const rb = this.nrec;
    const pen = this.formatLine(c0, at, 0, this.dry, true);
    this.restoreLine(saved);
    this.nrec = rb;
    this.load(o);
    this.pn = o;
    this.col = indAdd(indAdd(this.col, 1), indAt(a.tot, cl));
    return pen;
  }

  /** The child cache slot of block `head` at `ind`: found (stamp current) or free; -1 after a fault. */
  lcSlot(head: i32, ind: i32): i32 {
    const stamp = this.cacheStamp;
    const key = this.cacheKey;
    const kind = this.cacheInd;
    // The length is a power of two, and the table at most half full.
    const mask = toI32(stamp.length) - 1;
    const h = (Math.imul(head, 0x2545f491) ^ Math.imul(ind, 0x01000193)) & mask;
    for (let i = 0; i < stamp.length; i++) {
      // `h` lies in [0, mask] and `i` below the length, so the u32 sum is exact.
      const s = toI32((toU32(h) + toU32(i)) & toU32(mask));
      if (s < 0 || s >= stamp.length || s >= key.length || s >= kind.length) {
        fault();
        return -1;
      }
      if (stamp[s] !== this.fileStamp) {
        return s;
      }
      if (key[s] === head && kind[s] === ind) {
        return s;
      }
    }
    fault();
    return -1;
  }

  lcHit(s: i32): boolean {
    return s >= 0 && indAt(this.cacheStamp, s) === this.fileStamp;
  }

  /** Stores child block `head`'s penalty at `ind`, doubling the table when half full. */
  lcStore(head: i32, ind: i32, pen: i64): void {
    if (toI64(this.cacheUsed) * toI64(2) >= toI64(this.cacheStamp.length)) {
      const oStamp = this.cacheStamp;
      const oKey = this.cacheKey;
      const oInd = this.cacheInd;
      const oVal = this.cacheVal;
      const n = mul32(toI32(oStamp.length), 2);
      this.cacheStamp = newI32s(n);
      this.cacheKey = newI32s(n);
      this.cacheInd = newI32s(n);
      this.cacheVal = newI64s(n);
      for (let i = 0; i < oStamp.length; i++) {
        if (i >= oKey.length || i >= oInd.length || i >= oVal.length) {
          fault();
          return;
        }
        if (oStamp[i] === this.fileStamp) {
          this.lcPut(this.lcSlot(oKey[i], oInd[i]), oKey[i], oInd[i], oVal[i]);
        }
      }
    }
    const s = this.lcSlot(head, ind);
    if (s >= 0 && !this.lcHit(s)) {
      this.cacheUsed = indAdd(this.cacheUsed, 1);
    }
    this.lcPut(s, head, ind, pen);
  }

  lcPut(s: i32, head: i32, ind: i32, pen: i64): void {
    const stamp = this.cacheStamp;
    const key = this.cacheKey;
    const kind = this.cacheInd;
    const val = this.cacheVal;
    if (s < 0 || s >= stamp.length || s >= key.length || s >= kind.length || s >= val.length) {
      fault();
      return;
    }
    stamp[s] = this.fileStamp;
    key[s] = head;
    kind[s] = ind;
    val[s] = pen;
  }

  /** The penalty of child block list `head` at `addInd` (emitted unless dry). */
  childList(head: i32, addInd: i32): i64 {
    const o = this.save();
    const saved = this.saveLine();
    const rb = this.nrec;
    let pen: i64 = 0;
    if (this.dry) {
      const s = this.lcSlot(head, addInd);
      if (this.lcHit(s)) {
        this.stListHit = indAdd64(this.stListHit, toI64(1));
        pen = indAtI64(this.cacheVal, s);
      } else {
        this.stListMiss = indAdd64(this.stListMiss, toI64(1));
        const fm = this.fm;
        pen = fm !== null ? fm.listPenalty(head, addInd) & U32 : 0;
        // The nested searches stored too, and may have grown the table.
        this.lcStore(head, addInd, pen);
      }
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
    const end = indAdd(o, 5);
    if (end > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, end);
    }
    const p = this.pool;
    if (o >= 0 && o < p.length - 4) {
      p[o] = this.line;
      p[o + 1] = this.firstIndent;
      p[o + 2] = this.lim;
      p[o + 3] = this.lineLast;
      p[o + 4] = this.dry ? 1 : 0;
    } else {
      fault();
    }
    this.pn = end;
    return o;
  }

  restoreLine(o: i32): void {
    const p = this.pool;
    if (o >= 0 && o < p.length - 4) {
      this.line = p[o];
      this.firstIndent = p[o + 1];
      this.lim = p[o + 2];
      this.lineLast = p[o + 3];
      this.dry = p[o + 4] === 1;
    } else {
      fault();
    }
  }

  // ---- Lines ------------------------------------------------------------

  /** Mixes `v` into the two running hashes. */
  mix(v: i32): void {
    this.hh1 = Math.imul(this.hh1 ^ v, 0x01000193);
    // (The sum wraps: u32 arithmetic has the same bits.)
    this.hh2 = Math.imul(toI32(toU32(this.hh2) + toU32(v)), 0x2545f491) ^ (this.hh2 >>> 15);
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
    this.mix(
      indAt(d.lType, l) | (indAt(d.lMightFn, l) << 4) | (indAt(d.lMultiVar, l) << 5) | (indAt(d.lMustDecl, l) << 6),
    );
    const f = indLink(d.lFirst, l);
    // (`#pragma omp` clauses take their own indent: the word is read.)
    this.mix(isOmpPragmaLine(d, l) ? 1 : 0);
    const last = indLink(d.lLast, l);
    this.hlen = 0;
    const src = d.src;
    for (let t = f; ; t = indLink(d.nxt, t)) {
      if (t < 0) {
        fault();
        return false;
      }
      if (indLink(d.childHead, t) >= 0) {
        return false;
      }
      this.hlen = indAdd(this.hlen, 1);
      this.mix(
        indAt(d.kind, t) |
          (indAt(d.type, t) << 8) |
          (indAt(d.bk, t) << 16) |
          (indAt(d.multi, t) << 18) |
          (indAt(a.mustB, t) << 19) |
          (indAt(d.spaces, t) << 20) |
          (indAt(d.unesc, t) << 21) |
          (indAt(d.inPP, t) << 23) |
          (indAt(d.mustBreak, t) << 24) |
          (indAt(d.dec, t) << 25),
      );
      this.mix(indAt(d.width, t) | ((indAt(d.nl, t) > 2 ? 2 : indAt(d.nl, t)) << 16));
      if (d.anyImplicit && indAt(d.type, t) === TT_IMPLICIT_STRING_LITERAL && t !== f) {
        this.mix(implicitColumn(d, t, 0));
      }
      const m = indLink(d.match, t);
      this.mix(m < 0 ? -1 : m - t);
      if (indAt(d.kind, t) === K_COMMENT || indAt(d.nl, t) > 0) {
        // Comment sections continue by the columns tokens were written at.
        this.mix(indAt(d.col, t));
      }
      const pp = indLink(d.prv, t);
      this.mix(
        (indAt(a.joined, t) > 0 ? 1 : 0) |
          (pp >= 0 && t > indAdd(pp, 1) && indAt(d.inPP, t - 1) === 1 ? 2 : 0) |
          (d.len(t) << 2),
      );
      const k = indAt(d.kind, t);
      if (k === K_STRING || k === K_CHAR || indAt(d.multi, t) === 1) {
        // Splitting and the `<<` rules read literal bytes; names matter only as `endl`.
        const s0 = indAt(d.start, t);
        const e = indAt(d.end, t);
        if (s0 < e && (s0 < 0 || e > src.length)) {
          fault();
          return false;
        }
        for (let i = s0; i >= 0 && i < e && i < src.length; i++) {
          this.mix(toI32(src[i]));
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
    const i = this.hh1 & (CC_SIZE - 1);
    const cl = this.ccLen;
    const c1 = this.ccH1;
    const c2 = this.ccH2;
    for (let k = 0; k < 32; k++) {
      const s = (i + k) & (CC_SIZE - 1);
      if (s >= cl.length) {
        fault();
        return -1;
      }
      if (cl[s] === 0) {
        return s;
      }
      if (s >= c1.length || s >= c2.length) {
        fault();
        return -1;
      }
      if (c1[s] === this.hh1 && c2[s] === this.hh2 && cl[s] === len) {
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
    this.lineLast = indLink(d.lLast, l);
    this.dry = dry;
    const f = indLink(d.lFirst, l);
    const fm = this.fm;
    if (!dry && fm !== null) {
      fm.emit(f, inline ? 0 : nl, indent);
    }
    let fitLim = this.lim;
    if (indAt(d.lPP, l) === 1) {
      // A directive leaves room for ` \`; only a line the directive continues past must.
      this.lim = indSub(this.lim, 2);
      const nx = indLink(d.lSibling, l);
      const pp = indLink(d.ppId, f);
      if (pp >= 0 && nx >= 0 && indLink(d.ppId, indLink(d.lFirst, nx)) === pp) {
        fitLim = this.lim;
      }
    }
    const fits = indAdd(indAt(a.tot, this.lineLast), indent) <= fitLim || indAt(d.lType, l) === LT_IMPORT;
    if (this.debug && !dry) {
      this.dump(l, fits);
    }
    // A string holding a tab is measured again where it lands: clang-format
    // splits it there even on a line that fits by its written width.
    if (fits && !inline && d.strTabs && this.lineHasTabString(l)) {
      a.annotateFull(l);
      return this.noLineBreak();
    }
    if (fits && !inline && indAt(a.lLate, l) === 1) {
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
    if (this.rcHit(slot) && indAt(this.rcN, slot) >= 0) {
      if (!dry) {
        a.annotateFull(l);
        this.replayBits(indAt(this.rcOff, slot), indAt(this.rcN, slot));
      }
      return indAtI64(this.rcPen, slot);
    }
    // The same line (by content) broken before, in this file or an earlier one.
    let ntok = 0;
    let cslot = -1;
    if (this.contentHash(l, indent)) {
      ntok = this.hlen;
      cslot = this.ccSlot(ntok);
      if (
        cslot >= 0 &&
        indAt(this.ccLen, cslot) === ntok &&
        indAt(this.ccH1, cslot) === this.hh1 &&
        indAt(this.ccH2, cslot) === this.hh2
      ) {
        const n = indAt(this.ccN, cslot);
        if (n > toI32(this.pathBits.length)) {
          this.pathBits = growI32(this.pathBits, mul32(n, 2));
        }
        const pb = this.pathBits;
        const cb = this.ccBits;
        let j = indAt(this.ccOff, cslot);
        for (let i = 0; i < n; i++) {
          if (i >= pb.length || j < 0 || j >= cb.length) {
            fault();
            return toI64(0);
          }
          pb[i] = cb[j];
          j++;
        }
        this.pathN = n;
        const cpen = indAtI64(this.ccPen, cslot);
        this.rcStore(l, indent, cpen, true);
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
    // (32768 is CC_SIZE / 2: the table stays at most half full.) The table
    // outlives the file, so a search that faulted stores nothing in it.
    const used = this.ccUsed;
    if (cslot >= 0 && this.pathN >= 0 && indAt(this.ccLen, cslot) === 0 && used < 32768 && !faulted()) {
      this.ccStore(cslot, h1, h2, ntok, pen);
      this.ccUsed = used + 1;
    }
    if (this.pathN >= 0) {
      const stored = this.rcStore(l, indent, pen, true);
      if (!dry) {
        this.pathOff = indSub(this.nbits, this.pathN);
        if (this.rcHit(stored) && indAt(this.rcN, stored) >= 0) {
          this.replayBits(indAt(this.rcOff, stored), indAt(this.rcN, stored));
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

  /** Stores the last search's decisions (pathN of pathBits) and penalty in content cache slot `cs`. */
  ccStore(cs: i32, h1: i32, h2: i32, ntok: i32, pen: i64): void {
    const n = this.pathN;
    const nb = this.ccNb;
    const end = indAdd(nb, n);
    if (end > toI32(this.ccBits.length)) {
      this.ccBits = growI32(this.ccBits, mul32(end, 2));
    }
    const cb = this.ccBits;
    const pb = this.pathBits;
    let j = nb;
    for (let i = 0; i < n; i++) {
      if (i >= pb.length || j < 0 || j >= cb.length) {
        fault();
        return;
      }
      cb[j] = pb[i];
      j++;
    }
    const c1 = this.ccH1;
    const c2 = this.ccH2;
    const cl = this.ccLen;
    const cp = this.ccPen;
    const co = this.ccOff;
    const cn = this.ccN;
    // The entry is written whole or not at all: it is read by later files.
    if (
      cs < 0 ||
      cs >= c1.length ||
      cs >= c2.length ||
      cs >= cl.length ||
      cs >= cp.length ||
      cs >= co.length ||
      cs >= cn.length
    ) {
      fault();
      return;
    }
    c1[cs] = h1;
    c2[cs] = h2;
    cl[cs] = ntok;
    cp[cs] = pen;
    co[cs] = nb;
    cn[cs] = n;
    this.ccNb = end;
  }

  /** Marks line `l`'s tokens (from the second, unless `all`) and its blocks' lines to keep their whitespace. */
  keepAsWritten(l: i32, all: boolean): void {
    const d = this.d;
    const f = indLink(d.lFirst, l);
    for (let t = f; t >= 0; t = indLink(d.nxt, t)) {
      // An earlier pass's tokens are finalized: that pass's layout stands.
      const fm = this.fm;
      if ((t !== f || all) && !(fm !== null && fm.seenTok(t))) {
        const kw = d.keepWs;
        if (t >= kw.length) {
          fault();
          return;
        }
        kw[t] = 1;
      }
      for (let c = indLink(d.childHead, t); c >= 0; c = indLink(d.lSibling, c)) {
        this.keepAsWritten(c, true);
      }
    }
  }

  dump(l: i32, fits: boolean): void {
    const d = this.d;
    const a = this.a;
    console.error(
      `line ${l} level ${indAt(d.lLevel, l)} type ${indAt(d.lType, l)} fn ${indAt(d.lMightFn, l)} decl ${indAt(d.lMustDecl, l)} fits ${fits}`,
    );
    for (let t = indLink(d.lFirst, l); t >= 0; t = indLink(d.nxt, t)) {
      let fk = "";
      for (let n = indLink(a.fkHead, t); n >= 0; n = indLink(a.fkNext, n)) {
        fk = fk + `${indAt(a.fkPrec, n)} `;
      }
      console.error(
        `  ${d.text(t)}  tt=${indAt(d.type, t)} nest=${indAt(a.nest, t)} bind=${indAt(a.bind, t)} can=${indAt(a.canB, t)} must=${indAt(a.mustB, t)} pen=${indAt(a.pen, t)} tot=${indAt(a.tot, t)} sp=${indAt(d.spaces, t)} fk=[${fk}] fr=${indAt(a.fakeR, t)} pc=${indAt(a.pcnt, t)} ch=${indLink(d.childHead, t)}`,
      );
      if (t === indLink(d.lLast, l)) {
        break;
      }
    }
  }

  /** Emits line `l` (its first token already at `col`) on one line, child blocks inline. */
  emitFlat(l: i32, col0: i32): i32 {
    const d = this.d;
    const fm = this.fm;
    const f = indLink(d.lFirst, l);
    const last = indLink(d.lLast, l);
    let col = col0;
    for (let t = f; ; t = indLink(d.nxt, t)) {
      if (t < 0) {
        fault();
        return col;
      }
      if (t !== f) {
        col =
          d.anyImplicit && indAt(d.type, t) === TT_IMPLICIT_STRING_LITERAL
            ? implicitColumn(d, t, col)
            : indAdd(col, indAt(d.spaces, t));
        if (fm !== null) {
          fm.emit(t, 0, col);
        }
      }
      col = indAdd(col, indAt(d.kind, t) !== K_COMMENT ? indAt(d.width, t) : this.widthAt(t, col));
      const c = indLink(d.childHead, t);
      if (c >= 0) {
        if (fm !== null) {
          fm.emit(indLink(d.lFirst, c), 0, indAdd(col, 1));
        }
        col = this.emitFlat(c, indAdd(col, 1));
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
    if (
      indAt(d.kind, t) !== K_COMMENT ||
      indAt(d.multi, t) === 1 ||
      indAt(d.type, t) === TT_LINE_COMMENT ||
      fm === null ||
      !fm.hasTab(t)
    ) {
      return indAt(d.width, t);
    }
    return fm.colsAt(indAt(d.start, t), indAt(d.end, t), col);
  }

  initialState(): i64 {
    const f = indLink(this.d.lFirst, this.line);
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
    this.push(-1, this.firstIndent, this.firstIndent, this.firstIndent, false, false);
    return this.moveToNext(false);
  }

  /** Whether line `l` holds a string literal with a tab in it. */
  lineHasTabString(l: i32): boolean {
    const d = this.d;
    for (let t = indLink(d.lFirst, l); t >= 0; t = indLink(d.nxt, t)) {
      if (indAt(d.kind, t) === K_STRING) {
        for (let i = indAt(d.start, t); i < indAt(d.end, t); i++) {
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
        pen = indAdd64(pen, cp);
      }
      pen = indAdd64(pen, this.addToken(indAt(this.a.mustB, this.next) === 1, 0));
    }
    return pen & U32;
  }

  // ---- The search ---------------------------------------------------------

  newNode(prev: i32, nl: i32): i32 {
    const i = this.nn;
    if (i >= toI32(this.nOff.length)) {
      const n = mul32(i, 2);
      this.nOff = growI32(this.nOff, n);
      this.nPrev = growI32(this.nPrev, n);
      this.nNl = growI32(this.nNl, n);
      this.nIgn = growI32(this.nIgn, n);
      this.nNextB = growI32(this.nNextB, n);
    }
    const off = this.save();
    const no = this.nOff;
    const np = this.nPrev;
    const nnl = this.nNl;
    const ni = this.nIgn;
    if (i < 0 || i >= no.length || i >= np.length || i >= nnl.length || i >= ni.length) {
      fault();
      return -1;
    }
    no[i] = off;
    np[i] = prev;
    nnl[i] = nl;
    ni[i] = 0;
    this.nn = i + 1;
    return i;
  }

  /** The bucket of penalty `pen` in this search (depth `dd`, generation `gen`), made when missing. */
  bucketOf(pen: i64, dd: i32, gen: i32): i32 {
    if (dd < 0 || dd >= this.pmKey.length || dd >= this.pmVal.length || dd >= this.pmStamp.length) {
      fault();
      return -1;
    }
    let keys = this.pmKey[dd];
    let st = this.pmStamp[dd];
    let mask = toI32(keys.length) - 1;
    const h = Math.imul(toI32(pen & toI64(0x7fffffff)) ^ toI32(pen >> 31), 0x2545f491);
    let i = h & mask;
    while (true) {
      if (i < 0 || i >= st.length || i >= keys.length) {
        fault();
        return -1;
      }
      if (st[i] !== gen) {
        break;
      }
      if (keys[i] === pen) {
        return indAt(this.pmVal[dd], i);
      }
      i = (i + 1) & mask;
    }
    if (toI64(indAt(this.pmUsed, dd)) * toI64(2) >= toI64(mask)) {
      this.growPm(dd, gen);
      if (dd >= this.pmKey.length || dd >= this.pmStamp.length) {
        fault();
        return -1;
      }
      keys = this.pmKey[dd];
      mask = toI32(keys.length) - 1;
      st = this.pmStamp[dd];
      i = h & mask;
      while (true) {
        if (i < 0 || i >= st.length) {
          fault();
          return -1;
        }
        if (st[i] !== gen) {
          break;
        }
        i = (i + 1) & mask;
      }
    }
    const b = this.bn;
    if (b >= toI32(this.bHead.length)) {
      const n = mul32(indAdd(b, 1), 2);
      this.bHead = growI32(this.bHead, n);
      this.bTail = growI32(this.bTail, n);
    }
    const bh = this.bHead;
    const bt = this.bTail;
    if (b < 0 || b >= bh.length || b >= bt.length) {
      fault();
      return -1;
    }
    bh[b] = -1;
    bt[b] = -1;
    this.bn = b + 1;
    if (dd >= this.pmVal.length) {
      fault();
      return -1;
    }
    const vals = this.pmVal[dd];
    const pu = this.pmUsed;
    if (i < 0 || i >= st.length || i >= keys.length || i >= vals.length || dd >= pu.length) {
      fault();
      return -1;
    }
    st[i] = gen;
    keys[i] = pen;
    vals[i] = b;
    pu[dd] = indAdd(pu[dd], 1);
    return b;
  }

  /** Doubles depth `dd`'s penalty map, keeping this generation's entries. */
  growPm(dd: i32, gen: i32): void {
    if (dd < 0 || dd >= this.pmKey.length || dd >= this.pmVal.length || dd >= this.pmStamp.length) {
      fault();
      return;
    }
    const ok = this.pmKey[dd];
    const ov = this.pmVal[dd];
    const os = this.pmStamp[dd];
    const n = mul32(toI32(ok.length), 2);
    const nk = newI64s(n);
    const nv = newI32s(n);
    const ns = newI32s(n);
    const mask = indSub(n, 1);
    for (let i = 0; i < toI32(ok.length); i++) {
      const pen = ok[i];
      if (i >= os.length || i >= ov.length) {
        fault();
        return;
      }
      if (os[i] !== gen) {
        continue;
      }
      let j = Math.imul(toI32(pen & toI64(0x7fffffff)) ^ toI32(pen >> 31), 0x2545f491) & mask;
      while (true) {
        if (j < 0 || j >= ns.length) {
          fault();
          return;
        }
        if (ns[j] !== gen) {
          break;
        }
        j = (j + 1) & mask;
      }
      if (j < 0 || j >= ns.length || j >= nk.length || j >= nv.length) {
        fault();
        return;
      }
      ns[j] = gen;
      nk[j] = pen;
      nv[j] = ov[i];
    }
    const pk = this.pmKey;
    const pv = this.pmVal;
    const ps = this.pmStamp;
    if (dd >= pk.length || dd >= pv.length || dd >= ps.length) {
      fault();
      return;
    }
    pk[dd] = nk;
    pv[dd] = nv;
    ps[dd] = ns;
  }

  /** Queues node `node` at penalty `pen`. */
  qPush(vBase: i32, dd: i32, gen: i32, pen: i64, node: i32): void {
    const b = this.bucketOf(pen, dd, gen);
    const nb = this.nNextB;
    const bh = this.bHead;
    const bt = this.bTail;
    if (node < 0 || node >= nb.length || b < 0 || b >= bh.length || b >= bt.length) {
      fault();
      return;
    }
    nb[node] = -1;
    const t = bt[b];
    if (t >= 0) {
      if (t >= nb.length) {
        fault();
        return;
      }
      nb[t] = node;
      bt[b] = node;
      return;
    }
    bh[b] = node;
    bt[b] = node;
    // The bucket joins the heap of penalties.
    let i = this.vn;
    if (i >= toI32(this.vhB.length)) {
      const n = mul32(i, 2);
      const hp = newI64s(n);
      const old = this.vhPen;
      if (old.length > hp.length) {
        fault();
        return;
      }
      for (let k = 0; k < old.length && k < hp.length; k++) {
        hp[k] = old[k];
      }
      this.vhPen = hp;
      this.vhB = growI32(this.vhB, n);
    }
    this.vn = indAdd(i, 1);
    const vp = this.vhPen;
    const vb = this.vhB;
    // The heap starts at vBase, this search's first entry.
    if (vBase < 0) {
      fault();
      return;
    }
    while (i > vBase) {
      // (0 <= vBase < i: the u32 sum is the true parent, below i.)
      const par = toI32(toU32(vBase) + (toU32(i) - toU32(vBase) - toU32(1)) / toU32(2));
      if (par < 0 || par >= vp.length || par >= vb.length || i >= vp.length || i >= vb.length) {
        fault();
        return;
      }
      const pp = vp[par];
      if (pp < pen) {
        break;
      }
      if (i < 0) {
        fault();
        return;
      }
      vp[i] = pp;
      vb[i] = vb[par];
      i = par;
    }
    if (i < 0 || i >= vp.length || i >= vb.length) {
      fault();
      return;
    }
    vp[i] = pen;
    vb[i] = b;
  }

  /** Removes the cheapest bucket's head (the bucket leaves the heap when it empties). */
  qPop(vBase: i32): void {
    const vp = this.vhPen;
    const vb = this.vhB;
    const bh = this.bHead;
    const bt = this.bTail;
    const nb = this.nNextB;
    if (vBase < 0 || vBase >= vb.length) {
      fault();
      return;
    }
    const b = vb[vBase];
    if (b < 0 || b >= bh.length || b >= bt.length) {
      fault();
      return;
    }
    const h = bh[b];
    if (h < 0 || h >= nb.length) {
      fault();
      return;
    }
    const nx = nb[h];
    bh[b] = nx;
    if (nx >= 0) {
      return;
    }
    bt[b] = -1;
    const last = indSub(this.vn, 1);
    this.vn = last;
    if (last === vBase) {
      return;
    }
    // A pop leaves the heap's last entry in [vBase, last); it sifts down
    // from vBase.
    if (last < vBase || last < 0 || last >= vp.length || last >= vb.length) {
      fault();
      return;
    }
    const pen = vp[last];
    const lb = vb[last];
    // (0 <= vBase <= i < last below: each u32 difference and sum is the
    // true one while it stays below last.)
    const n = toU32(last) - toU32(vBase);
    let i = vBase;
    while (i >= vBase && i < last) {
      const rel = toU32(i) - toU32(vBase);
      if (rel * toU32(2) + toU32(1) >= n) {
        break;
      }
      let c = toI32(toU32(vBase) + rel * toU32(2) + toU32(1));
      if (c < 0 || c >= vp.length || c >= vb.length) {
        fault();
        return;
      }
      if (rel * toU32(2) + toU32(2) < n) {
        // c + 1 < last
        const c1 = toI32(toU32(c) + toU32(1));
        if (c1 < 0 || c1 >= vp.length) {
          fault();
          return;
        }
        if (vp[c1] < vp[c]) {
          c = c1;
        }
      }
      if (c >= vp.length || c >= vb.length || i < 0 || i >= vp.length || i >= vb.length) {
        fault();
        return;
      }
      if (pen < vp[c]) {
        break;
      }
      vp[i] = vp[c];
      vb[i] = vb[c];
      i = c;
    }
    if (i < 0 || i >= vp.length || i >= vb.length) {
      fault();
      return;
    }
    vp[i] = pen;
    vb[i] = lb;
  }

  /** A hash of node `n`'s state over the compared fields. */
  stateHash(n: i32, withStack: boolean): i32 {
    const p = this.pool;
    const o = indAt(this.nOff, n);
    if (o < 0 || o >= p.length - 8) {
      fault();
      return 0;
    }
    // The header's first six fields, S_COL (+0) to S_SOSL (+5).
    let h = 0x011c9dc5;
    h = Math.imul(h ^ p[o], 0x01000193);
    h = Math.imul(h ^ p[o + 1], 0x01000193);
    h = Math.imul(h ^ p[o + 2], 0x01000193);
    h = Math.imul(h ^ p[o + 3], 0x01000193);
    h = Math.imul(h ^ p[o + 4], 0x01000193);
    h = Math.imul(h ^ p[o + 5], 0x01000193);
    if (withStack) {
      h = Math.imul(h ^ p[o + 7], 0x01000193); // S_DEPTH
      const t = p[o + 8]; // S_TOP
      const rc = this.rec;
      if (t < 0 || t >= 134217727) {
        fault();
        return 0;
      }
      const th = t * RS + RH;
      if (th >= rc.length) {
        fault();
        return 0;
      }
      h = Math.imul(h ^ rc[th], 0x01000193);
    }
    return h;
  }

  sameState(x: i32, y: i32, withStack: boolean): boolean {
    const p = this.pool;
    const ox = indAt(this.nOff, x);
    const oy = indAt(this.nOff, y);
    if (ox < 0 || ox >= p.length - 8 || oy < 0 || oy >= p.length - 8) {
      fault();
      return false;
    }
    // The header's first six fields, S_COL (+0) to S_SOSL (+5).
    if (
      p[ox] !== p[oy] ||
      p[ox + 1] !== p[oy + 1] ||
      p[ox + 2] !== p[oy + 2] ||
      p[ox + 3] !== p[oy + 3] ||
      p[ox + 4] !== p[oy + 4] ||
      p[ox + 5] !== p[oy + 5]
    ) {
      return false;
    }
    if (!withStack) {
      return true;
    }
    if (p[ox + 7] !== p[oy + 7]) {
      // S_DEPTH
      return false;
    }
    let rx = p[ox + 8]; // S_TOP
    let ry = p[oy + 8];
    const rc = this.rec;
    while (rx !== ry) {
      if (rx < 0 || rx >= 134217727 || ry < 0 || ry >= 134217727) {
        fault();
        return false;
      }
      const a = rx * RS + RF;
      const b = ry * RS + RF;
      if (a + 13 >= rc.length || b + 13 >= rc.length) {
        fault();
        return false;
      }
      // The PS fields from R_IND (+1) to R_COLON (+10), then R_FL (+11) and
      // R_AL (+13): clang-format compares an Indent by its Total alone.
      if (
        rc[a + 1] !== rc[b + 1] ||
        rc[a + 2] !== rc[b + 2] ||
        rc[a + 3] !== rc[b + 3] ||
        rc[a + 4] !== rc[b + 4] ||
        rc[a + 5] !== rc[b + 5] ||
        rc[a + 6] !== rc[b + 6] ||
        rc[a + 7] !== rc[b + 7] ||
        rc[a + 8] !== rc[b + 8] ||
        rc[a + 9] !== rc[b + 9] ||
        rc[a + 10] !== rc[b + 10]
      ) {
        return false;
      }
      if ((rc[a + 11] & F_CMP) !== (rc[b + 11] & F_CMP) || rc[a + 13] !== rc[b + 13]) {
        return false;
      }
      // The parents, at RP (-2).
      rx = rc[a - 2];
      ry = rc[b - 2];
    }
    return true;
  }

  /** Records node `n` as expanded; false when an equal state already was. */
  seenInsert(n: i32, gen: i32): boolean {
    const ign = indAt(this.nIgn, n) === 1;
    const h = this.stateHash(n, !ign);
    const dd = this.depth;
    if (dd < 0 || dd >= this.seenNodes.length || dd >= this.seenStamps.length) {
      fault();
      return false;
    }
    const sn = this.seenNodes[dd];
    const ss = this.seenStamps[dd];
    const mask = toI32(sn.length) - 1;
    let s = h & mask;
    while (true) {
      if (s < 0 || s >= ss.length || s >= sn.length) {
        fault();
        return false;
      }
      if (ss[s] !== gen) {
        break;
      }
      const o = sn[s];
      if (this.sameState(o, n, !(ign || indAt(this.nIgn, o) === 1))) {
        return false;
      }
      s = (s + 1) & mask;
    }
    if (s < 0 || s >= ss.length || s >= sn.length) {
      fault();
      return false;
    }
    ss[s] = gen;
    sn[s] = n;
    return true;
  }

  search(): i64 {
    const nodeBase = this.nn;
    const poolBase = this.pn;
    const vBase = this.vn;
    const bBase = this.bn;
    const recBase = this.nrec;
    // A fresh seen table generation; a nested search takes the next ones.
    this.seenGen = indAdd(this.seenGen, 1);
    const gen = this.seenGen;
    if (this.depth === 0 && this.seenGen > 1 << 30) {
      // A stamp left from before the wrap would read as current again.
      this.seenGen = 1;
      for (const st of this.seenStamps) {
        st.fill(0);
      }
      for (const st of this.pmStamp) {
        st.fill(0);
      }
    }
    this.depth = indAdd(this.depth, 1);
    const dd = this.depth;
    while (toI32(this.pmKey.length) <= dd) {
      this.pmKey.push(new Array<i64>(1024));
      this.pmVal.push(new Array<i32>(1024));
      this.pmStamp.push(new Array<i32>(1024));
    }
    while (toI32(this.seenNodes.length) <= dd) {
      this.seenNodes.push(new Array<i32>(SEEN0));
      this.seenStamps.push(new Array<i32>(SEEN0));
    }
    if (dd >= toI32(this.pmUsed.length)) {
      this.pmUsed = growI32(this.pmUsed, indAdd(dd, 1));
    }
    indPut(this.pmUsed, dd, 0);
    const dry = this.dry;
    this.dry = true;
    this.initialState();
    // clang-format's OptimizingLineFormatter: an Objective-C method
    // declaration that does not fit takes one selector part per line.
    if (indAt(this.d.type, indLink(this.d.lFirst, this.line)) === TT_OBJC_METHOD_SPECIFIER) {
      this.setTopFlag(F_BBP, true);
    }
    const root = this.newNode(-1, 0);
    let count = 0;
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
      // (25000000 is MAXCOUNT.) A fault leaves the search: its state is not
      // one the formatter's invariants allow.
      if (count > 25000000 || faulted()) {
        break;
      }
      let node = -1;
      if (carry >= 0) {
        node = carry;
        pen = carryPen;
        carry = -1;
        if (indAt(this.pool, indAdd(indAt(this.nOff, node), S_NEXT)) < 0) {
          best = node;
          break;
        }
      } else {
        if (this.vn <= vBase) {
          break;
        }
        pen = indAtI64(this.vhPen, vBase);
        node = indAt(this.bHead, indAt(this.vhB, vBase));
        if (indAt(this.pool, indAdd(indAt(this.nOff, node), S_NEXT)) < 0) {
          best = node;
          break;
        }
        this.qPop(vBase);
      }
      if (count > IGNORE_AFTER) {
        indPut(this.nIgn, node, 1);
        if (!flat) {
          // clang-format now compares states without their stacks, against
          // every state already seen: rehash those without their stacks too.
          flat = true;
          this.growSeen(gen, nodeBase, false, true);
        }
      }
      // (Twice `inserted` passes the length just when it passes half of it,
      // and a length is not negative.)
      if (inserted > this.seenLength() >> 1) {
        this.growSeen(gen, nodeBase, true, flat);
      }
      if (!this.seenInsert(node, gen)) {
        continue;
      }
      inserted = indAdd(inserted, 1);
      this.stPops = indAdd64(this.stPops, toI64(1));
      this.load(indAt(this.nOff, node));
      this.stDepth = indAdd64(this.stDepth, toI64(this.sp));
      const can = this.canBreak();
      const must = this.mustBreak();
      let s0 = -1;
      let p0: i64 = 0;
      // A token an earlier pass formatted keeps that pass's decision.
      const dec = indAt(this.d.dec, this.next);
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
        count++;
      }
      if (s1 >= 0) {
        count = indAdd(count, 1);
      }
      if (s0 >= 0) {
        if ((this.vn <= vBase || indAtI64(this.vhPen, vBase) > p0) && (s1 < 0 || p1 >= p0)) {
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
    this.stSearches = indAdd64(this.stSearches, toI64(1));
    if (this.debug) {
      console.error(
        `search depth=${this.depth} line=${this.line} nodes=${toI64(this.nn) - toI64(nodeBase)} pen=${pen} ind=${this.firstIndent} first=${this.d.text(indLink(this.d.lFirst, this.line))}`,
      );
    }
    this.stNodes = indAdd64(this.stNodes, toI64(this.nn) - toI64(nodeBase));
    let result: i64 = 0;
    this.pathN = -1;
    if (best >= 0) {
      result = pen;
      let n = 0;
      for (let q = best; q >= 0 && indLink(this.nPrev, q) >= 0; q = indLink(this.nPrev, q)) {
        n = indAdd(n, 1);
      }
      if (n > toI32(this.pathBits.length)) {
        this.pathBits = growI32(this.pathBits, mul32(n, 2));
      }
      const pb = this.pathBits;
      let i = indSub(n, 1);
      for (let q = best; q >= 0 && indLink(this.nPrev, q) >= 0; q = indLink(this.nPrev, q)) {
        const v = indAt(this.nNl, q);
        if (i < 0 || i >= pb.length) {
          fault();
          break;
        }
        pb[i] = v;
        i--;
      }
      this.pathN = n;
    }
    this.dry = dry;
    this.depth = indSub(this.depth, 1);
    this.nn = nodeBase;
    this.pn = poolBase;
    this.vn = vBase;
    this.bn = bBase;
    this.nrec = recBase;
    this.fresh0 = recBase;
    return result;
  }

  /** The length of this depth's seen table; 0 (after a fault) when it has none. */
  seenLength(): i32 {
    const dd = this.depth;
    if (dd < 0 || dd >= this.seenNodes.length) {
      fault();
      return 0;
    }
    return toI32(this.seenNodes[dd].length);
  }

  /**
   * Rebuilds the seen table holding this search's expanded nodes: twice as
   * large when `grow`, and hashed without their stacks once `flat`.
   */
  growSeen(gen: i32, nodeBase: i32, grow: boolean, flat: boolean): void {
    const dd = this.depth;
    if (dd < 0 || dd >= this.seenNodes.length || dd >= this.seenStamps.length) {
      fault();
      return;
    }
    const oldNode = this.seenNodes[dd];
    const oldStamp = this.seenStamps[dd];
    const n = mul32(toI32(oldNode.length), grow ? 2 : 1);
    const sn = newI32s(n);
    const ss = newI32s(n);
    const nodes = this.seenNodes;
    const stamps = this.seenStamps;
    if (dd >= nodes.length || dd >= stamps.length) {
      fault();
      return;
    }
    nodes[dd] = sn;
    stamps[dd] = ss;
    const mask = indSub(n, 1);
    for (let i = 0; i < toI32(oldNode.length); i++) {
      const node = oldNode[i];
      if (i >= oldStamp.length) {
        fault();
        return;
      }
      const st = oldStamp[i];
      if (st === 0) {
        continue;
      }
      if (st !== gen || node < nodeBase) {
        continue;
      }
      let s = this.stateHash(node, !flat && indAt(this.nIgn, node) === 0) & mask;
      while (true) {
        if (s < 0 || s >= ss.length || s >= sn.length) {
          fault();
          return;
        }
        if (ss[s] === 0) {
          break;
        }
        s = (s + 1) & mask;
      }
      if (s < 0 || s >= ss.length || s >= sn.length) {
        fault();
        return;
      }
      ss[s] = st;
      sn[s] = node;
    }
  }

  /** Adds the state after placing the next token (with or without a break). */
  /** The state after placing the next token of node `node` (with or without a break); -1 when it cannot be. */
  makeChild(node: i32, pen: i64, nl: boolean): i32 {
    this.load(indAt(this.nOff, node));
    let p = pen;
    // A child block's penalty is counted as the state is made, as in
    // clang-format's addNextStateToQueue. Counting it only once the state
    // reached the front of the queue assumed the penalty can only raise the
    // state's key, which a sum that wraps past 2^32 breaks.
    const cp = this.formatChildren(nl);
    if (cp < 0) {
      return -1;
    }
    p = indAdd64(p, cp);
    // clang-format's penalties are 32-bit unsigned and wrap.
    p = indAdd64(p, this.addToken(nl, 0)) & U32;
    const n = this.newNode(node, nl ? 1 : 0);
    this.childPen = p;
    return n;
  }

  /** Re-runs the decisions of path bits [off, off + n) for real (emitting). */
  replayBits(off: i32, n: i32): void {
    this.dry = false;
    this.initialState();
    for (let k = 0; k < n; k++) {
      const nl = indAt(this.rcBits, indAdd(off, k)) === 1;
      this.formatChildren(nl);
      this.addToken(nl, 0);
    }
  }

  /** Re-runs the last search's decisions (kept in pathBits) for real. */
  replayPath(): void {
    const n = this.pathN;
    const bits = newI32s(n);
    const pb = this.pathBits;
    for (let k = 0; k < n; k++) {
      if (k >= bits.length || k >= pb.length) {
        fault();
        return;
      }
      bits[k] = pb[k];
    }
    this.dry = false;
    this.initialState();
    for (let k = 0; k < n; k++) {
      if (k >= bits.length) {
        fault();
        return;
      }
      const nl = bits[k] === 1;
      this.formatChildren(nl);
      this.addToken(nl, 0);
    }
  }
}

export const INDENTER_KINDS: i32 = KW_WHILE + KW_SWITCH + KW_CONCEPT + KW_FOR + TT_CAST_RPAREN + P_RSQUARE + K_IDENT;
