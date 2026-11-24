// Per-line formatting facts for the line breaker.
//
// The classifier decides what each token is; this pass derives what the
// breaker needs to know about it: its bracket depth and binding strength, the
// implicit parentheses of the expression around it (operator precedence),
// where a break may or must go before it and what that break costs, and the
// running width of the line up to it. The rules are clang-format's LLVM
// style, restated for this token table.

import { requiresIsClause, spaceBefore } from "./classify";
import { Doc } from "./doc";
import { add32, growI32, mul32, newI32s } from "../core/arr";
import { fault } from "../core/fault";
import {
  BK_BLOCK,
  BK_BRACED_INIT,
  binPrecedence,
  isIdentKind,
  K_COMMENT,
  K_IDENT,
  P_AT,
  K_STRING,
  KW_CLASS,
  KW_CONCEPT,
  KW_CONST,
  KW_DEFAULT,
  KW_DELETE,
  KW_FOR,
  KW_IF,
  KW_NOEXCEPT,
  KW_OPERATOR,
  KW_REQUIRES,
  KW_RETURN,
  KW_STRUCT,
  KW_SWITCH,
  KW_TEMPLATE,
  KW_TYPENAME,
  KW_UNION,
  KW_ATTRIBUTE,
  KW_CONSTEXPR,
  KW_CONSTEVAL,
  KW_MUTABLE,
  KW_STATIC,
  KW_DECLTYPE,
  KW_TYPEOF,
  LT_IMPORT,
  LT_VIRTUAL_FUNCTION_DECL,
  P_AMP,
  P_AMPAMP,
  P_ARROW,
  P_ARROWSTAR,
  P_COLON,
  P_COLONCOLON,
  P_COMMA,
  P_EQUAL,
  P_GREATER,
  P_HASH,
  P_HASHHASH,
  PP_PRAGMA,
  P_LBRACE,
  P_LESS,
  P_LESSLESS,
  P_LPAREN,
  P_LSQUARE,
  P_PERIOD,
  P_PIPEPIPE,
  P_PLUS,
  P_QUESTION,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  P_STAR,
  PREC_ASSIGNMENT,
  PREC_COMMA,
  PREC_CONDITIONAL,
  PREC_LOGICAL_OR,
  PREC_UNKNOWN,
  TT_ARRAY_INITIALIZER_LSQUARE,
  TT_ARRAY_SUBSCRIPT_LSQUARE,
  TT_ATTRIBUTE_LPAREN,
  TT_ATTRIBUTE_SQUARE,
  TT_BINARY_OPERATOR,
  TT_BLOCK_COMMENT,
  TT_CAST_RPAREN,
  TT_CONDITIONAL_EXPR,
  TT_CTOR_INITIALIZER_COLON,
  TT_DESIGNATED_INITIALIZER_LSQUARE,
  TT_DESIGNATED_INITIALIZER_PERIOD,
  TT_FUNCTION_ANNOTATION_RPAREN,
  TT_FUNCTION_DECLARATION_NAME,
  TT_FUNCTION_LBRACE,
  TT_IMPLICIT_STRING_LITERAL,
  TT_INLINE_ASM_BRACE,
  TT_INHERITANCE_COLON,
  TT_INLINE_ASM_COLON,
  TT_LAMBDA_ARROW,
  TT_BLOCK_LITERAL_LBRACE,
  TT_LAMBDA_LBRACE,
  TT_LAMBDA_LSQUARE,
  TT_LINE_COMMENT,
  TT_OVERLOADED_OPERATOR,
  TT_OVERLOADED_OPERATOR_LPAREN,
  TT_POINTER_OR_REFERENCE,
  TT_RANGE_BASED_FOR_LOOP_COLON,
  TT_START_OF_NAME,
  TT_CLASS_HEAD_NAME,
  TT_TEMPLATE_CLOSER,
  TT_TEMPLATE_OPENER,
  TT_TRAILING_ANNOTATION,
  TT_SELECTOR_NAME,
  TT_OBJC_METHOD_EXPR,
  TT_OBJC_METHOD_SPECIFIER,
  TT_TRAILING_RETURN_ARROW,
  TT_TYPE_DECLARATION_PAREN,
  TT_UNKNOWN,
  TT_UNARY_OPERATOR,
  TT_INHERITANCE_COMMA,
  TT_ATTRIBUTE_RPAREN,
  TT_CTOR_INITIALIZER_COMMA,
} from "./tok";

/**
 * `xs[i]`. Every index here is a token, a line or a pool slot the tables
 * hold; one outside `xs` faults (the file is skipped) and reads as -1, no
 * token.
 */
const annGet = (xs: i32[], i: i32): i32 => {
  if (i >= 0 && i < xs.length) {
    return xs[i];
  }
  fault();
  return -1;
};

/** `xs[i] = v`; an index outside `xs` faults, as in annGet. */
const annSet = (xs: i32[], i: i32, v: i32): void => {
  if (i >= 0 && i < xs.length) {
    xs[i] = v;
  } else {
    fault();
  }
};

/** `r` as an i32; a value outside i32 (where i32 arithmetic overflowed) faults and answers 0. */
const annI32 = (r: i64): i32 => {
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `a + b`; a sum outside i32 faults and answers 0. */
const annAdd = (a: i32, b: i32): i32 => annI32(toI64(a) + toI64(b));

/** `e - s + w`, the width from token `s`'s total to `e`'s; outside i32 it faults and answers 0. */
const annSpan = (e: i32, s: i32, w: i32): i32 => {
  const x = toI64(e) - toI64(s);
  if (x >= toI64(-2147483648) && x <= toI64(2147483647)) {
    return annAdd(toI32(x), w);
  }
  fault();
  return 0;
};

/** `xs[i]++`; an index outside `xs`, or a count past i32, faults. */
const annBump = (xs: i32[], i: i32): void => {
  if (i >= 0 && i < xs.length) {
    const v = xs[i];
    if (v < 2147483647) {
      xs[i] = v + 1;
      return;
    }
  }
  fault();
};

/** Sets `xs[0, n)` to `v`; `xs` holds a slot for each of the `n` tokens. */
const annFill = (xs: i32[], n: i32, v: i32): void => {
  if (n > xs.length) {
    fault();
    return;
  }
  for (let i = 0; i < n; i++) {
    xs[i] = v;
  }
};

export const PREC_ARROW: i32 = 17;

// Per-token step flags for the line breaker (which of its rules a token triggers).
export const M_NOLBOP_CLR: i32 = 1; // a comma or binary operator
export const M_INHCOLON: i32 = 2;
export const M_LESSLESS: i32 = 4; // `<<`, not an overloaded operator
export const M_LOW: i32 = 8; // records whether the operator was wrapped
export const M_SUBSCRIPT: i32 = 16;
export const M_IWC: i32 = 32; // a `?` whose conditional is wrapped
export const M_QUESTION: i32 = 64;
export const M_LOWEST: i32 = 128; // counts toward the lowest level on the line
export const M_MEMBER: i32 = 256;
export const M_CTORCOLON: i32 = 512;
export const M_NBINL: i32 = 1024; // a binary or conditional operator
export const M_LSSET: i32 = 2048; // a lambda's `[` or a trailing `->`
export const M_AFTERBRACE: i32 = 4096; // first after a list's `{`
export const M_NBIPREV: i32 = 8192; // after an operator, `(`, `,` or `:`
export const M_NBIINL: i32 = 16384; // ...where a nested block may stay inline
export const M_FAKEL: i32 = 32768;
export const M_CLOSES: i32 = 65536;
export const M_OPENS: i32 = 131072;
export const M_FAKER: i32 = 262144;
export const M_STRING: i32 = 524288;
export const M_SOSLRESET: i32 = 1048576;
export const M_ROLEAVOID: i32 = 2097152;
export const M_PREVROLE: i32 = 4194304;
export const M_EOL: i32 = 8388608; // multi-line, string or comment: more to do at its end

// Per-token new-line column rules that apply (N_*), checked in order by the breaker.
export const N_BLOCK: i32 = 1;
export const N_CLOSEBR: i32 = 2;
export const N_CLOSEBL: i32 = 4;
export const N_BRINIT: i32 = 8;
export const N_RPAREN: i32 = 16;
export const N_STRING: i32 = 32;
export const N_LESSLESS: i32 = 64;
export const N_MEMBER: i32 = 128;
export const N_QC: i32 = 256;
export const N_QCIND: i32 = 512;
export const N_COMMA: i32 = 1024;
export const N_RQC: i32 = 2048;
export const N_CTORCOL: i32 = 4096;
export const N_MAXLSIND: i32 = 8192;
export const N_SUBSCRIPT: i32 = 16384;
export const N_CI: i32 = 32768;
export const N_IND: i32 = 65536;
export const N_CI2: i32 = 131072;
export const N_PNCOK: i32 = 262144;
export const N_LARROW: i32 = 524288;
export const N_BRSON: i32 = 1048576;
export const N_OMP: i32 = 2097152; // a clause of `#pragma omp`: one continuation indent in

/** Whether line `l` is a `#pragma omp` directive (InPragmaDirective, then `omp`). */
export const isOmpPragmaLine = (d: Doc, l: i32): boolean => {
  const f = annGet(d.lFirst, l);
  if (annGet(d.kind, f) !== P_HASH || annGet(d.ppKind, f) !== PP_PRAGMA) {
    return false;
  }
  const pw = annGet(d.nxt, f);
  const om = pw >= 0 ? annGet(d.nxt, pw) : -1;
  return om >= 0 && d.is(om, "omp");
};

// Per-token rules for placing a token on the current line (C_*).
export const C_NOLB: i32 = 1; // a lambda among other arguments: no breaks on this line
export const C_VP: i32 = 2; // an `=` that records the variable's column
export const C_ALIGN: i32 = 4; // right after an opening bracket: the level aligns here
export const C_NEXTPARAM: i32 = 8;
export const C_BUILDER: i32 = 16;
export const C_MEMBERRP: i32 = 32; // `.`/`->` after a long call: no breaks
export const C_NOLBOP: i32 = 64; // an operand: no breaks inside it
export const C_NOLBOP_LOW: i32 = 128; // ...unless the operator before it was wrapped
export const C_LS_SHIFT: i32 = 8; // three bits: which last-space rule applies
export const PREC_UNARY_OP: i32 = 16;

// LLVM style penalties.
export const PEN_EXCESS: i64 = 1000000;
export const PEN_BREAK_STRING: i32 = 1000;
export const PEN_BREAK_COMMENT: i32 = 300;
export const PEN_FIRST_LESSLESS: i32 = 120;

export class Annot {
  d: Doc;
  // Per token.
  nest: i32[];
  bind: i32[];
  fkHead: i32[]; // implicit open parens: a list, outermost first
  fakeR: i32[];
  sbin: i32[]; // starts a binary expression
  ebin: i32[]; // ends one
  opIdx: i32[];
  nextOp: i32[];
  canB: i32[];
  mustB: i32[];
  /** A break set after the line's width was taken (a parameter before a trailing comment). */
  lateB: i32[];
  pen: i32[];
  tot: i32[];
  tail: i32[];
  pcnt: i32[];
  bpcnt: i32[];
  ctd: i32[]; // closes a template declaration
  pmv: i32[]; // the name a multi-variable declaration's comma follows (PartOfMultiVariableDeclStmt)
  sonStk: i32[]; // per open bracket: the last start of a name in it (FirstStartOfName)
  crc: i32[]; // closes a requires clause
  rqc: i32[]; // a `requires` that starts a clause
  role: i32[]; // comma list of a `{`, or -1
  joined: i32[]; // first token of a line joined onto the one before
  jnl: i32[]; // a joined line's first token: its newlines before the join
  mf: i32[]; // step flags (M_*)
  nlc: i32[]; // new-line column rules (N_*)
  nbb: i32[]; // a function name nameBreakBlocked holds
  cf: i32[]; // current-line rules (C_*)
  strTab: i32[]; // 1 for a string literal holding a tab
  pnc: i32[]; // the previous non-comment token, or -1
  ilev: i32[]; // indent level: the line's, plus blocks opened before it on the line
  // Implicit paren nodes.
  fkPrec: i32[];
  fkNext: i32[];
  nfk: i32 = 0;
  // Comma lists of braced lists: commas, then column formats.
  rlCommaOff: i32[];
  rlCommaN: i32[];
  rlNested: i32[];
  rlFmtOff: i32[];
  rlFmtN: i32[];
  rlItemOff: i32[];
  commaPool: i32[];
  ncomma: i32 = 0;
  itemLen: i32[];
  nitem: i32 = 0;
  fmtCols: i32[];
  fmtLines: i32[];
  fmtTotal: i32[];
  fmtSizeOff: i32[];
  nfmt: i32 = 0;
  sizePool: i32[];
  nsize: i32 = 0;
  nrole: i32 = 0;
  // Per line: annotated in this file.
  lStamp: i32[];
  /** Per line: whether it holds a late break (`lateB`). */
  lLate: i32[];
  lFull: i32[]; // annotated in full (for the line breaker) in this file
  lFnDecl: i32[];
  segParsed: i32[]; // per segment start: implicit parens already found
  stamp: i32 = 1;
  used: i32 = 0; // the most token slots reset() sized since clear()
  // The expression walk.
  cur: i32 = -1;
  segEnd: i32 = -1;
  // Scratch stack for depths.
  stk: i32[];
  stkB: i32[];

  constructor(d: Doc) {
    this.d = d;
    this.nest = new Array<i32>(16);
    this.bind = new Array<i32>(16);
    this.fkHead = new Array<i32>(16);
    this.fakeR = new Array<i32>(16);
    this.sbin = new Array<i32>(16);
    this.ebin = new Array<i32>(16);
    this.opIdx = new Array<i32>(16);
    this.nextOp = new Array<i32>(16);
    this.canB = new Array<i32>(16);
    this.mustB = new Array<i32>(16);
    this.lateB = new Array<i32>(16);
    this.pen = new Array<i32>(16);
    this.tot = new Array<i32>(16);
    this.tail = new Array<i32>(16);
    this.pcnt = new Array<i32>(16);
    this.bpcnt = new Array<i32>(16);
    this.ctd = new Array<i32>(16);
    this.pmv = new Array<i32>(16);
    this.crc = new Array<i32>(16);
    this.rqc = new Array<i32>(16);
    this.role = new Array<i32>(16);
    this.joined = new Array<i32>(16);
    this.ilev = new Array<i32>(16);
    this.mf = new Array<i32>(16);
    this.nlc = new Array<i32>(16);
    this.nbb = new Array<i32>(16);
    this.cf = new Array<i32>(16);
    this.strTab = new Array<i32>(16);
    this.pnc = new Array<i32>(16);
    this.jnl = new Array<i32>(16);
    this.fkPrec = new Array<i32>(64);
    this.fkNext = new Array<i32>(64);
    this.rlCommaOff = new Array<i32>(16);
    this.rlCommaN = new Array<i32>(16);
    this.rlNested = new Array<i32>(16);
    this.rlFmtOff = new Array<i32>(16);
    this.rlFmtN = new Array<i32>(16);
    this.rlItemOff = new Array<i32>(16);
    this.commaPool = new Array<i32>(64);
    this.itemLen = new Array<i32>(64);
    this.fmtCols = new Array<i32>(16);
    this.fmtLines = new Array<i32>(16);
    this.fmtTotal = new Array<i32>(16);
    this.fmtSizeOff = new Array<i32>(16);
    this.sizePool = new Array<i32>(64);
    this.lStamp = new Array<i32>(16);
    this.lLate = new Array<i32>(16);
    this.lFull = new Array<i32>(16);
    this.lFnDecl = new Array<i32>(16);
    this.segParsed = new Array<i32>(16);
    this.stk = new Array<i32>(64);
    this.stkB = new Array<i32>(64);
    this.sonStk = new Array<i32>(64); // grows with stk
  }

  /**
   * Forgets every token's annotation, as a fresh worker has it: reset()
   * keeps what one #if pass leaves for the next, but nothing one file sets
   * may show in the next (a reader of a line never annotated would see it).
   */
  clear(): void {
    const n = this.used;
    annFill(this.nest, n, 0);
    annFill(this.bind, n, 0);
    annFill(this.fkHead, n, 0);
    annFill(this.fakeR, n, 0);
    annFill(this.sbin, n, 0);
    annFill(this.ebin, n, 0);
    annFill(this.opIdx, n, 0);
    annFill(this.nextOp, n, 0);
    annFill(this.canB, n, 0);
    annFill(this.mustB, n, 0);
    annFill(this.lateB, n, 0);
    annFill(this.pen, n, 0);
    annFill(this.tot, n, 0);
    annFill(this.tail, n, 0);
    annFill(this.pcnt, n, 0);
    annFill(this.bpcnt, n, 0);
    annFill(this.ctd, n, 0);
    annFill(this.pmv, n, 0);
    annFill(this.crc, n, 0);
    annFill(this.rqc, n, 0);
    annFill(this.role, n, 0);
    annFill(this.joined, n, 0);
    annFill(this.jnl, n, 0);
    annFill(this.mf, n, 0);
    annFill(this.nlc, n, 0);
    annFill(this.nbb, n, 0);
    annFill(this.cf, n, 0);
    annFill(this.strTab, n, 0);
    annFill(this.pnc, n, 0);
    annFill(this.ilev, n, 0);
    annFill(this.segParsed, n, 0);
    this.used = 0;
  }

  /** Prepares for a new file: sizes the columns and forgets every line. */
  reset(): void {
    const d = this.d;
    const nt = d.ntok;
    if (nt > 2147483646) {
      fault();
      return;
    }
    const n = nt + 1;
    if (toI32(this.nest.length) < n) {
      this.nest = newI32s(n);
      this.bind = newI32s(n);
      this.fkHead = newI32s(n);
      this.fakeR = newI32s(n);
      this.sbin = newI32s(n);
      this.ebin = newI32s(n);
      this.opIdx = newI32s(n);
      this.nextOp = newI32s(n);
      this.canB = newI32s(n);
      this.mustB = newI32s(n);
      this.lateB = newI32s(n);
      this.pen = newI32s(n);
      this.tot = newI32s(n);
      this.tail = newI32s(n);
      this.pcnt = newI32s(n);
      this.bpcnt = newI32s(n);
      this.ctd = newI32s(n);
      this.pmv = newI32s(n);
      this.crc = newI32s(n);
      this.rqc = newI32s(n);
      this.role = newI32s(n);
      this.joined = newI32s(n);
      this.ilev = newI32s(n);
      this.mf = newI32s(n);
      this.nlc = newI32s(n);
      this.nbb = newI32s(n);
      this.cf = newI32s(n);
      this.strTab = newI32s(n);
      this.pnc = newI32s(n);
      this.jnl = newI32s(n);
      this.segParsed = newI32s(n);
    }
    if (n > this.used) {
      this.used = n;
    }
    // (A line never annotated, verbatim or invalid, must not show another
    // pass's fake parentheses: the pool they point into starts over.)
    annFill(this.joined, n, 0);
    annFill(this.fkHead, n, -1);
    annFill(this.fakeR, n, 0);
    const nli = d.nline;
    if (nli > 2147483646) {
      fault();
      return;
    }
    const nl = nli + 1;
    if (toI32(this.lStamp.length) < nl) {
      this.lStamp = growI32(this.lStamp, nl);
      this.lLate = growI32(this.lLate, nl);
      this.lFull = growI32(this.lFull, nl);
      this.lFnDecl = growI32(this.lFnDecl, nl);
    }
    const st = this.stamp;
    if (st > 2147483646) {
      fault();
      return;
    }
    this.stamp = st + 1;
    this.nfk = 0;
    this.ncomma = 0;
    this.nitem = 0;
    this.nfmt = 0;
    this.nsize = 0;
    this.nrole = 0;
  }

  // ---- Token predicates ---------------------------------------------------

  opensScope(t: i32): boolean {
    const k = annGet(this.d.kind, t);
    return k === P_LPAREN || k === P_LBRACE || k === P_LSQUARE || annGet(this.d.type, t) === TT_TEMPLATE_OPENER;
  }

  closesScope(t: i32): boolean {
    const k = annGet(this.d.kind, t);
    return k === P_RPAREN || k === P_RBRACE || k === P_RSQUARE || annGet(this.d.type, t) === TT_TEMPLATE_CLOSER;
  }

  isMemberAccess(t: i32): boolean {
    const d = this.d;
    const k = annGet(d.kind, t);
    if (!(k === P_ARROW || k === P_PERIOD || k === P_ARROWSTAR)) {
      return false;
    }
    const tt = annGet(d.type, t);
    return tt !== TT_DESIGNATED_INITIALIZER_PERIOD && tt !== TT_TRAILING_RETURN_ARROW && tt !== TT_LAMBDA_ARROW;
  }

  /** A comment that ends its line (or a line comment). */
  isTrailingComment(t: i32): boolean {
    const d = this.d;
    if (annGet(d.kind, t) !== K_COMMENT) {
      return false;
    }
    if (annGet(d.type, t) === TT_LINE_COMMENT) {
      return true;
    }
    // (A token starts at an offset into the text, below 2^31 - 1.)
    const s = annGet(d.start, t);
    if (s < 0 || s > 2147483646) {
      fault();
      return false;
    }
    if (d.at(s + 1) === 47) {
      return true;
    }
    const n = annGet(d.nxt, t);
    return n < 0 || annGet(d.nl, n) > 0 || annGet(this.joined, n) > 0;
  }

  /** The precedence of `t`'s kind as a binary operator, by kind alone. */
  prec(t: i32): i32 {
    const k = annGet(this.d.kind, t);
    if (k === P_QUESTION) {
      return PREC_CONDITIONAL;
    }
    return binPrecedence(k);
  }

  isBinaryOperatorKind(t: i32): boolean {
    return this.prec(t) > PREC_COMMA;
  }

  prevNonComment(t: i32): i32 {
    const d = this.d;
    if (t < 0) {
      return -1;
    }
    let p = annGet(d.prv, t);
    while (p >= 0 && annGet(d.kind, p) === K_COMMENT) {
      p = annGet(d.prv, p);
    }
    return p;
  }

  nextNonComment(t: i32): i32 {
    const d = this.d;
    if (t < 0) {
      return -1;
    }
    let n = annGet(d.nxt, t);
    while (n >= 0 && annGet(d.kind, n) === K_COMMENT) {
      n = annGet(d.nxt, n);
    }
    return n;
  }

  /** `if`, `if constexpr`, or a macro before `if`. */
  isIf(t: i32): boolean {
    const d = this.d;
    const k = annGet(d.kind, t);
    if (k === KW_IF) {
      return true;
    }
    const p = annGet(d.prv, t);
    return (k === KW_CONSTEXPR || k === K_IDENT) && p >= 0 && annGet(d.kind, p) === KW_IF;
  }

  /** A string literal whose text (quotes and spaces trimmed) ends in `:` or `=`. */
  isLabelString(t: i32): boolean {
    const d = this.d;
    if (annGet(d.kind, t) !== K_STRING) {
      return false;
    }
    let a = annGet(d.start, t);
    let b = annGet(d.end, t);
    // (A token's bytes: offsets into the text, below 2^31 - 1. So `b > a`
    // has `b > 0`, which the tests below repeat for the compiler.)
    if (a < 0 || b < 0 || b < a || a > 2147483646 || b > 2147483646) {
      fault();
      return false;
    }
    if (d.at(a) === 34 || d.at(a) === 39) {
      a++;
    }
    if (b > a && b > 0 && (d.at(b - 1) === 34 || d.at(b - 1) === 39)) {
      b--;
    }
    while (a < b && (d.at(a) === 32 || d.at(a) === 9)) {
      a++;
    }
    while (b > a && b > 0 && (d.at(b - 1) === 32 || d.at(b - 1) === 9)) {
      b--;
    }
    if (toI64(b) - toI64(a) <= toI64(1) || b <= 0) {
      return false;
    }
    const c = d.at(b - 1);
    return c === 58 || c === 61;
  }

  /** Whether `t` is an opening `{`/`[` whose list is laid out as a block. */
  opensBlockList(t: i32): boolean {
    const d = this.d;
    if (annGet(d.type, t) === TT_ARRAY_INITIALIZER_LSQUARE) {
      return true;
    }
    return annGet(d.kind, t) === P_LBRACE && annGet(d.bk, t) === BK_BLOCK;
  }

  closesBlockList(t: i32): boolean {
    const m = annGet(this.d.match, t);
    return m >= 0 && m < t && this.opensBlockList(m);
  }

  // ---- Annotation ---------------------------------------------------------

  /** Annotates line `l` (and its child lines) once per file. */
  annotate(l: i32): void {
    if (annGet(this.lStamp, l) === this.stamp) {
      return;
    }
    annSet(this.lStamp, l, this.stamp);
    const d = this.d;
    // Child lines first: their widths feed this line's.
    for (let t = annGet(d.lFirst, l); t >= 0; t = annGet(d.nxt, t)) {
      let c = annGet(d.childHead, t);
      while (c >= 0) {
        this.annotate(c);
        c = annGet(d.lSibling, c);
      }
    }
    let a = annGet(d.lFirst, l);
    while (a >= 0) {
      let b = a;
      while (annGet(d.nxt, b) >= 0 && annGet(this.joined, annGet(d.nxt, b)) === 0) {
        b = annGet(d.nxt, b);
      }
      this.annotateSegment(l, a, b);
      a = annGet(d.nxt, b);
    }
    // Totals over the whole (possibly joined) line.
    this.totals(l);
  }

  /**
   * Adds what only the line breaker needs: the implicit parens, where breaks
   * may go and what they cost, unbreakable tails and braced-list columns.
   */
  annotateFull(l: i32): void {
    this.annotate(l);
    if (annGet(this.lFull, l) === this.stamp) {
      return;
    }
    annSet(this.lFull, l, this.stamp);
    const d = this.d;
    let a = annGet(d.lFirst, l);
    while (a >= 0) {
      let b = a;
      while (annGet(d.nxt, b) >= 0 && annGet(this.joined, annGet(d.nxt, b)) === 0) {
        b = annGet(d.nxt, b);
      }
      if (annGet(this.segParsed, a) !== this.stamp) {
        annSet(this.segParsed, a, this.stamp);
        this.segEnd = b;
        this.cur = a;
        this.skipTrailingComments(true);
        this.parse(0);
      }
      const ja = annGet(this.joined, a);
      const sl = ja > 0 ? ja - 1 : l;
      this.breakCosts(sl, a, b);
      a = annGet(d.nxt, b);
    }
    this.tailsAndLists(l);
  }

  /** Annotates one unwrapped line's tokens [a, b]. */
  annotateSegment(l: i32, a: i32, b: i32): void {
    const d = this.d;
    // A joined segment keeps the facts of the line it came from.
    const ja = annGet(this.joined, a);
    const sl = ja > 0 ? ja - 1 : l;
    // Depths, binding strengths and parameter counts. (The depth is `sp`,
    // the open brackets on the stack.)
    let sp = 0;
    let bindS = 1;
    // clang-format's IsMultiVariableDeclStmt: a comma after a name, at the
    // top level or in the head of a `for`, `if` or `switch`.
    const fk = annGet(d.kind, annGet(d.lFirst, sl));
    const initStmt = fk === KW_FOR || fk === KW_IF || fk === KW_SWITCH;
    annSet(this.sonStk, 0, -1);
    for (let t = a; ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      annSet(this.fkHead, t, -1);
      annSet(this.fakeR, t, 0);
      annSet(this.sbin, t, 0);
      annSet(this.ebin, t, 0);
      annSet(this.opIdx, t, 0);
      annSet(this.nextOp, t, -1);
      annSet(this.pcnt, t, 0);
      annSet(this.bpcnt, t, 0);
      annSet(this.ctd, t, 0);
      annSet(this.pmv, t, 0);
      annSet(this.crc, t, 0);
      annSet(this.rqc, t, 0);
      annSet(this.role, t, -1);
      if (t !== a && d.anyAsm && annGet(d.asmFin, t) === 1) {
        // Inline assembly keeps its whitespace, which clang-format's line
        // formatter does not count: what follows on the line is placed by
        // its spaces from where the text really ends (see the emitter).
        annSet(d.spaces, t, 0);
      } else if (t !== a) {
        annSet(d.spaces, t, spaceBefore(d, sl, t) ? 1 : 0);
      } else if (annGet(this.joined, t) > 0) {
        // An empty block's `}` hugs its `{`.
        const jp = annGet(d.prv, t);
        annSet(d.spaces, t, annGet(d.kind, t) === P_RBRACE && jp >= 0 && annGet(d.kind, jp) === P_LBRACE ? 0 : 1);
      }
      const opens = this.opensScope(t) && annGet(d.match, t) > t;
      const closes = this.closesScope(t) && annGet(d.match, t) >= 0 && annGet(d.match, t) < t;
      const tk = annGet(d.kind, t);
      if (annGet(d.type, t) === TT_START_OF_NAME) {
        annSet(this.sonStk, sp, t);
      } else if (tk === P_SEMI) {
        annSet(this.sonStk, sp, -1);
      } else if (
        tk === P_COMMA &&
        annGet(d.type, t) !== TT_CTOR_INITIALIZER_COMMA &&
        annGet(d.type, t) !== TT_INHERITANCE_COMMA &&
        annGet(this.sonStk, sp) >= 0 &&
        (sp === 0 || initStmt)
      ) {
        annSet(this.pmv, annGet(this.sonStk, sp), 1);
        annSet(d.lMultiVar, sl, 1);
      }
      if (sp > 0 && !closes) {
        const o = annGet(this.stk, sp - 1);
        if (tk === P_LBRACE && annGet(d.bk, t) === BK_BLOCK) {
          annBump(this.bpcnt, o);
        }
        if (tk === P_COMMA) {
          annBump(this.pcnt, o);
        } else if (annGet(this.pcnt, o) === 0 && tk !== K_COMMENT) {
          annSet(this.pcnt, o, 1);
        }
      }
      if (closes && sp > 0) {
        const o = annGet(this.stk, sp - 1);
        const m = annGet(d.passMul, o);
        if (m > 1) {
          annSet(this.bpcnt, o, mul32(annGet(this.bpcnt, o), m));
          const pc = annGet(this.pcnt, o);
          if (pc > 0) {
            annSet(this.pcnt, o, add32(1, mul32(pc - 1, m)));
          }
        }
        annSet(this.nest, t, sp);
        annSet(this.bind, t, bindS);
        sp--;
        bindS = annGet(this.stkB, sp);
      } else {
        annSet(this.nest, t, sp);
        annSet(this.bind, t, bindS);
      }
      if (opens) {
        // (A bracket per token at most: far below 2^31.)
        if (sp > 1073741823 || bindS > 2147483635) {
          fault();
          return;
        }
        if (sp + 1 >= toI32(this.stk.length)) {
          this.stk = growI32(this.stk, sp + 2);
          this.stkB = growI32(this.stkB, sp + 2);
          this.sonStk = growI32(this.sonStk, sp + 2);
        }
        annSet(this.stk, sp, t);
        annSet(this.stkB, sp, bindS);
        sp++;
        annSet(this.sonStk, sp, -1);
        const ot = annGet(d.type, t);
        if (ot === TT_TEMPLATE_OPENER) {
          bindS = bindS + 12;
        } else if (ot === TT_ARRAY_SUBSCRIPT_LSQUARE) {
          bindS = bindS + 10;
        } else {
          bindS = bindS + 1;
        }
      }
      if (t === b) {
        break;
      }
    }
    // Template declarations and requires clauses. Only the outermost
    // template declaration's `>` closes one (clang-format 23).
    let tdDepth = 0;
    for (let t = a; ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      if (
        annGet(d.type, t) === TT_TEMPLATE_OPENER &&
        annGet(d.match, t) > t &&
        annGet(d.prv, t) >= 0 &&
        annGet(d.kind, annGet(d.prv, t)) === KW_TEMPLATE
      ) {
        // (A bracket per token at most: far below 2^31.)
        if (tdDepth > 1073741823) {
          fault();
          return;
        }
        tdDepth++;
      }
      if (annGet(d.type, t) === TT_TEMPLATE_CLOSER) {
        const m = annGet(d.match, t);
        if (m >= 0 && m < t && annGet(d.prv, m) >= 0 && annGet(d.kind, annGet(d.prv, m)) === KW_TEMPLATE) {
          if (tdDepth > 0) {
            tdDepth--;
          }
          if (tdDepth === 0) {
            annSet(this.ctd, t, 1);
          }
        }
      }
      if (annGet(d.kind, t) === KW_REQUIRES && this.isRequiresClause(t, a)) {
        annSet(this.rqc, t, 1);
        const e = this.requiresClauseEnd(t, b);
        annSet(this.crc, e, 1);
      }
      if (t === b) {
        break;
      }
    }
    // Implicit parens: now only when a conditional needs them for alignment.
    let cond = false;
    for (let t = a; ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      if (annGet(d.type, t) === TT_CONDITIONAL_EXPR) {
        cond = true;
        break;
      }
      if (t === b) {
        break;
      }
    }
    if (cond) {
      annSet(this.segParsed, a, this.stamp);
      this.segEnd = b;
      this.cur = a;
      this.skipTrailingComments(true);
      this.parse(0);
    }
    // Forced breaks.
    this.breaks(sl, a, b);
  }

  /** Whether `requires` at `t` starts a clause (not a requires-expression). */
  isRequiresClause(t: i32, a: i32): boolean {
    if (t === a) {
      return true;
    }
    const d = this.d;
    const p = this.prevNonComment(t);
    // (A lambda's `]` is no type, yet its requires is a clause.)
    if (p >= 0 && annGet(d.kind, p) === P_RSQUARE) {
      return true;
    }
    return requiresIsClause(d, t);
  }

  /** The last token of the requires clause starting at `t`. */
  requiresClauseEnd(t: i32, b: i32): i32 {
    const d = this.d;
    let q = annGet(d.nxt, t);
    let last = t;
    // Primaries joined by && and ||: `(...)`, `!x`, names with `::` and template arguments.
    while (q >= 0) {
      const k = annGet(d.kind, q);
      if (k === 35) {
        // `!`
        last = q;
        if (q === b) {
          return last;
        }
        q = annGet(d.nxt, q);
        continue;
      }
      if (k === P_LPAREN && annGet(d.match, q) > q) {
        last = annGet(d.match, q);
      } else if (k === K_IDENT || k === P_COLONCOLON || k >= 200 || (k >= 100 && k < 200 && k !== KW_REQUIRES)) {
        last = q;
        while (true) {
          const n = last === b ? -1 : annGet(d.nxt, last);
          if (n < 0) {
            break;
          }
          if (annGet(d.type, n) === TT_TEMPLATE_OPENER && annGet(d.match, n) > n) {
            last = annGet(d.match, n);
            continue;
          }
          const nk = annGet(d.kind, n);
          if (nk === P_COLONCOLON) {
            last = n;
            const nn = n === b ? -1 : annGet(d.nxt, n);
            if (
              nn >= 0 &&
              (annGet(d.kind, nn) === K_IDENT || annGet(d.kind, nn) >= 200 || annGet(d.kind, nn) === KW_TEMPLATE)
            ) {
              last = nn;
            }
            continue;
          }
          if (
            nk === P_LPAREN &&
            annGet(d.kind, last) !== P_COLONCOLON &&
            annGet(d.match, n) > n &&
            annGet(d.type, last) !== TT_TEMPLATE_CLOSER
          ) {
            // A call: `foo(...)`.
            last = annGet(d.match, n);
            continue;
          }
          break;
        }
      } else if (k === KW_REQUIRES) {
        // A requires-expression: `requires (params) { ... }`.
        last = q;
        let n = q === b ? -1 : annGet(d.nxt, q);
        if (n >= 0 && annGet(d.kind, n) === P_LPAREN && annGet(d.match, n) > n) {
          last = annGet(d.match, n);
          n = last === b ? -1 : annGet(d.nxt, last);
        }
        if (n >= 0 && annGet(d.kind, n) === P_LBRACE && annGet(d.match, n) > n) {
          last = annGet(d.match, n);
        }
      } else {
        return last;
      }
      if (last === b) {
        return last;
      }
      q = annGet(d.nxt, last);
      if (q >= 0 && (annGet(d.kind, q) === P_AMPAMP || annGet(d.kind, q) === P_PIPEPIPE)) {
        last = q;
        if (q === b) {
          return last;
        }
        q = annGet(d.nxt, q);
        continue;
      }
      return last;
    }
    return last;
  }

  // ---- The expression walk (implicit parens) -----------------------------

  next(skipLeading: boolean): void {
    if (this.cur < 0) {
      return;
    }
    this.cur = this.cur === this.segEnd ? -1 : annGet(this.d.nxt, this.cur);
    this.skipTrailingComments(skipLeading);
  }

  skipTrailingComments(skipLeading: boolean): void {
    const d = this.d;
    while (this.cur >= 0 && (annGet(d.nl, this.cur) === 0 || skipLeading) && this.isTrailingComment(this.cur)) {
      this.cur = this.cur === this.segEnd ? -1 : annGet(d.nxt, this.cur);
    }
  }

  currentPrecedence(): i32 {
    const d = this.d;
    const c = this.cur;
    if (c < 0) {
      return -1;
    }
    const tt = annGet(d.type, c);
    if (tt === TT_CONDITIONAL_EXPR) {
      return PREC_CONDITIONAL;
    }
    // clang-format 23 gives a lambda's arrow comma precedence; a function's
    // trailing return arrow is no operator at all.
    if (tt === TT_LAMBDA_ARROW) {
      return PREC_COMMA;
    }
    const k = annGet(d.kind, c);
    if (k === P_SEMI || tt === TT_INLINE_ASM_COLON) {
      return 0;
    }
    if (tt === TT_RANGE_BASED_FOR_LOOP_COLON) {
      return PREC_COMMA;
    }
    if (tt === TT_BINARY_OPERATOR || k === P_COMMA) {
      return this.prec(c);
    }
    if ((k === P_PERIOD || k === P_ARROW) && tt !== TT_TRAILING_RETURN_ARROW) {
      return PREC_ARROW;
    }
    return -1;
  }

  addFake(start: i32, prec: i32, endTok: i32): void {
    const i = this.nfk;
    // (A few fake parens per token: far below 2^31.)
    if (i < 0 || i > 2147483646) {
      fault();
      return;
    }
    if (i >= toI32(this.fkPrec.length)) {
      this.fkPrec = growI32(this.fkPrec, i + 1);
      this.fkNext = growI32(this.fkNext, i + 1);
    }
    // Prepend: the list reads outermost first.
    annSet(this.fkPrec, i, prec);
    annSet(this.fkNext, i, annGet(this.fkHead, start));
    annSet(this.fkHead, start, i);
    this.nfk = i + 1;
    if (prec > PREC_UNKNOWN) {
      annSet(this.sbin, start, 1);
    }
    let e = endTok;
    if (e < 0 && this.cur >= 0) {
      e = this.prevNonComment(this.cur);
    }
    if (e < 0 && this.cur < 0) {
      // Past the end of the segment: the last non-comment token.
      e = this.segEnd;
      while (e >= 0 && annGet(this.d.kind, e) === K_COMMENT) {
        e = annGet(this.d.prv, e);
      }
    }
    if (e >= 0) {
      annBump(this.fakeR, e);
      if (prec > PREC_UNKNOWN) {
        annSet(this.ebin, e, 1);
      }
    }
  }

  parse(precedence: i32): void {
    const d = this.d;
    while (this.cur >= 0 && annGet(d.kind, this.cur) === KW_RETURN) {
      this.next(true);
    }
    if (this.cur < 0 || precedence > PREC_ARROW) {
      return;
    }
    if (precedence === PREC_CONDITIONAL) {
      this.parseConditional();
      return;
    }
    if (precedence === PREC_UNARY_OP) {
      this.parseUnary();
      return;
    }
    const start = this.cur;
    let latest = -1;
    let opIndex = 0;
    while (this.cur >= 0) {
      // (`precedence <= PREC_ARROW`: the u32 sum is the true one.)
      this.parse(toI32(toU32(precedence) + 1));
      const cp = this.currentPrecedence();
      const c = this.cur;
      if (
        c < 0 ||
        (this.closesScope(c) && annGet(d.match, c) >= 0) ||
        (cp !== -1 && cp < precedence) ||
        (cp === PREC_CONDITIONAL && precedence === PREC_ASSIGNMENT && annGet(d.kind, c) === P_COLON)
      ) {
        break;
      }
      if (this.opensScope(c) || annGet(this.rqc, c) === 1) {
        while (this.cur >= 0 && (!this.closesScope(this.cur) || this.opensScope(this.cur))) {
          this.next(true);
          this.parse(0);
        }
        this.next(true);
      } else {
        if (cp === precedence) {
          if (latest >= 0) {
            annSet(this.nextOp, latest, c);
          }
          latest = c;
          annSet(this.opIdx, c, opIndex);
          // (An operator per token at most: far below 2^31.)
          if (opIndex > 1073741823) {
            fault();
            return;
          }
          opIndex++;
        }
        this.next(precedence > 0);
      }
    }
    if (latest >= 0 && (this.cur >= 0 || precedence > 0)) {
      let endTok = -1;
      const sp = annGet(d.prv, start);
      if (sp >= 0 && annGet(this.rqc, sp) === 1) {
        let r = this.cur >= 0 ? this.cur : this.segEnd;
        while (annGet(this.crc, r) === 0 && annGet(d.prv, r) >= 0) {
          r = annGet(d.prv, r);
        }
        endTok = r;
      }
      this.addFake(start, precedence === PREC_ARROW ? PREC_UNKNOWN : precedence, endTok);
    }
  }

  parseUnary(): void {
    const d = this.d;
    const first = this.cur;
    let n = 0;
    while (this.cur >= 0 && annGet(d.type, this.cur) === TT_UNARY_OPERATOR) {
      // (An operator per token at most: far below 2^31.)
      if (n > 1073741823) {
        fault();
        return;
      }
      n++;
      this.next(true);
    }
    this.parse(PREC_ARROW);
    // Innermost first: the last operator closes first.
    if (n > 0) {
      const toks = newI32s(n);
      let t = first;
      let i = 0;
      while (i < n) {
        if (annGet(d.kind, t) !== K_COMMENT) {
          annSet(toks, i, t);
          i++;
        }
        t = annGet(d.nxt, t);
      }
      for (let j = n - 1; j >= 0; j--) {
        this.addFake(annGet(toks, j), PREC_UNKNOWN, -1);
      }
    }
  }

  parseConditional(): void {
    const d = this.d;
    while (this.cur >= 0 && this.isTrailingComment(this.cur)) {
      this.next(true);
    }
    const start = this.cur;
    this.parse(PREC_LOGICAL_OR);
    if (this.cur < 0 || annGet(d.kind, this.cur) !== P_QUESTION) {
      return;
    }
    this.next(true);
    this.parse(PREC_ASSIGNMENT);
    if (this.cur < 0 || annGet(d.type, this.cur) !== TT_CONDITIONAL_EXPR) {
      return;
    }
    this.next(true);
    this.parse(PREC_ASSIGNMENT);
    this.addFake(start, PREC_CONDITIONAL, -1);
  }

  // ---- Breaks, penalties and widths --------------------------------------

  /** Where a break must go in segment [a, b] of line `l`. */
  breaks(l: i32, a: i32, b: i32): void {
    const d = this.d;
    annSet(this.mustB, a, annGet(d.mustBreak, a) === 1 && annGet(this.joined, a) === 0 ? 1 : 0);
    annSet(this.lateB, a, 0);
    if (a === b) {
      return;
    }
    for (let t = annGet(d.nxt, a); ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      const p = annGet(d.prv, t);
      let must = this.mustBreakBefore(l, t);
      const pc = annGet(d.childHead, p);
      if (pc >= 0) {
        // A child block ending in a line comment forces the break.
        let lastChild = pc;
        while (annGet(d.lSibling, lastChild) >= 0) {
          lastChild = annGet(d.lSibling, lastChild);
        }
        const lt = annGet(d.lLast, lastChild);
        if (annGet(d.kind, lt) === K_COMMENT && this.isTrailingComment(lt)) {
          must = true;
        }
      }
      annSet(this.mustB, t, must ? 1 : 0);
      annSet(this.lateB, t, 0);
      if (t === b) {
        break;
      }
    }
    // A parameter that started its own line before a trailing line comment keeps it.
    for (let t = annGet(d.nxt, a); ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      if (annGet(d.kind, t) === K_COMMENT && annGet(d.type, t) === TT_LINE_COMMENT && annGet(d.unesc, t) === 0) {
        for (let q = annGet(d.prv, t); q >= 0 && q !== annGet(d.prv, a); q = annGet(d.prv, q)) {
          const qk = annGet(d.kind, q);
          if (qk === K_COMMENT || qk === P_RBRACE) {
            break;
          }
          const qp = annGet(d.prv, q);
          if (qp >= 0 && annGet(d.kind, qp) === P_COMMA) {
            // Constructor initializers stay bin-packed.
            if (annGet(d.unesc, q) === 1 && annGet(d.type, qp) !== TT_CTOR_INITIALIZER_COMMA) {
              // clang-format sets it after taking the line's width: a line
              // that fits without it is laid out by its no-break formatter.
              if (annGet(this.mustB, q) === 0) {
                annSet(this.lateB, q, 1);
              }
              annSet(this.mustB, q, 1);
            }
            break;
          }
        }
      }
      if (t === b) {
        break;
      }
    }
  }

  /**
   * The binding part of token `t`'s split penalty: 20 per level, but for an
   * Objective-C file's selector parts after the first (clang-format's
   * ParameterIndex), 5 per level for the second and none after.
   */
  bindingPenalty(t: i32): i32 {
    const d = this.d;
    if (d.objcLang && annGet(d.type, t) === TT_SELECTOR_NAME) {
      let idx = 0;
      const lv = annGet(this.nest, t);
      for (let q = annGet(d.prv, t); q >= 0; q = annGet(d.prv, q)) {
        if (annGet(this.nest, q) < lv) {
          break;
        }
        if (annGet(d.type, q) === TT_SELECTOR_NAME && annGet(this.nest, q) === lv) {
          // (A selector part per token at most: far below 2^31.)
          if (idx > 1073741823) {
            fault();
            return 0;
          }
          idx++;
        }
      }
      if (idx > 0) {
        if (idx !== 1) {
          return 0;
        }
        return annI32(toI64(5) * toI64(annGet(this.bind, t)));
      }
    }
    return annI32(toI64(20) * toI64(annGet(this.bind, t)));
  }

  /** Where a break may go in segment [a, b] of line `l`, and what each costs. */
  breakCosts(l: i32, a: i32, b: i32): void {
    const d = this.d;
    let inFnDecl = annGet(d.lMightFn, l) === 1;
    annSet(this.canB, a, annGet(this.mustB, a) === 1 || annGet(this.joined, a) > 0 ? 1 : 0);
    annSet(this.pen, a, 0);
    if (a === b) {
      return;
    }
    for (let t = annGet(d.nxt, a); ; t = annGet(d.nxt, t)) {
      if (t < 0) {
        // (The chain reaches `b`: a token, always.)
        fault();
        break;
      }
      annSet(this.canB, t, annGet(this.mustB, t) === 1 || this.canBreakBefore(l, t) ? 1 : 0);
      if (annGet(d.type, t) === TT_CTOR_INITIALIZER_COLON) {
        inFnDecl = false;
      }
      annSet(this.pen, t, annAdd(this.splitPenalty(l, t, inFnDecl), this.bindingPenalty(t)));
      if (t === b) {
        break;
      }
    }
  }

  totals(l: i32): void {
    const d = this.d;
    const lim = d.opts.columnLimit;
    const f = annGet(d.lFirst, l);
    annSet(this.tot, f, annGet(d.multi, f) === 1 ? lim : annGet(d.width, f));
    let late = 0;
    for (let t = annGet(d.nxt, f); t >= 0; t = annGet(d.nxt, t)) {
      const p = annGet(d.prv, t);
      const nch = annGet(d.childCount, p);
      let childSize = 0;
      let childMust = false;
      if (annGet(d.childHead, p) >= 0 && nch === 1) {
        const c = annGet(d.childHead, p);
        const cl = annGet(d.lLast, c);
        childSize = this.isTrailingComment(cl) ? lim : annAdd(annGet(this.tot, cl), 1);
        // A block literal's body must break after its `{`.
        childMust = annGet(this.mustB, annGet(d.lFirst, c)) === 1 || annGet(d.type, p) === TT_BLOCK_LITERAL_LBRACE;
      }
      late = late | annGet(this.lateB, t);
      if (
        (annGet(this.mustB, t) === 1 && annGet(this.lateB, t) === 0) ||
        (annGet(d.childHead, p) >= 0 && nch > 1) ||
        childMust ||
        annGet(d.multi, t) === 1
      ) {
        annSet(this.tot, t, annAdd(annGet(this.tot, p), lim));
      } else {
        const w = annAdd(annAdd(annGet(this.tot, p), annGet(d.width, t)), childSize);
        annSet(this.tot, t, annAdd(w, annGet(d.spaces, t)));
      }
    }
    annSet(this.lLate, l, late);
    // Indent levels: one deeper after a block's `{`, back at its `}`.
    let lev = annGet(d.lLevel, l);
    for (let q = f; q >= 0; q = annGet(d.nxt, q)) {
      const m = annGet(d.match, q);
      if (m >= 0 && m < q && this.opensBlockList(m) && lev > 0) {
        lev--;
      }
      annSet(this.ilev, q, lev);
      if (this.opensBlockList(q)) {
        // (A level per token at most: far below 2^31.)
        if (lev > 2147483646) {
          fault();
          return;
        }
        lev++;
      }
    }
  }

  /** Unbreakable tails and braced-list column layouts of line `l`. */
  tailsAndLists(l: i32): void {
    const d = this.d;
    const f = annGet(d.lFirst, l);
    // Unbreakable tails, from the end.
    let tail = 0;
    let t = annGet(d.lLast, l);
    while (t >= 0) {
      annSet(this.tail, t, tail);
      if (annGet(this.canB, t) === 1 || annGet(d.kind, t) === K_COMMENT || annGet(d.kind, t) === K_STRING) {
        tail = 0;
      } else {
        tail = annAdd(annAdd(tail, annGet(d.width, t)), annGet(d.spaces, t));
      }
      if (t === f) {
        break;
      }
      t = annGet(d.prv, t);
    }
    // Braced-list column layouts.
    for (let q = f; q >= 0; q = annGet(d.nxt, q)) {
      if (annGet(d.kind, q) === P_LBRACE && annGet(d.match, q) > q && annGet(this.pcnt, q) > 1) {
        this.precomputeList(q);
      }
    }
    this.stepFlags(l);
  }

  /** Which rules placing token `t` (previous non-comment `pc`) on the current line triggers. */
  currentLineRules(l: i32, t: i32, pc: i32): i32 {
    const d = this.d;
    const prev = annGet(d.prv, t);
    if (prev < 0) {
      return 0;
    }
    const ck = annGet(d.kind, t);
    const pk = annGet(d.kind, prev);
    const pt = annGet(d.type, prev);
    let r = 0;
    if (
      pc >= 0 &&
      annGet(d.kind, pc) === P_LPAREN &&
      !(ck === K_COMMENT || ck === P_LPAREN || annGet(d.type, t) === TT_LAMBDA_LSQUARE) &&
      // (clang-format 23: not right after a `/*name=*/` comment it is glued to.)
      !(pt === TT_BLOCK_COMMENT && annGet(d.spaces, t) === 0)
    ) {
      const bpc = annGet(this.bpcnt, pc);
      if (bpc > 1) {
        r = r | C_NOLB;
      } else if (bpc === 1 && annGet(this.pcnt, pc) > 1) {
        const lc = this.lastCommaIn(pc);
        if (lc >= 0) {
          const n = this.nextNonComment(lc);
          if (
            n >= 0 &&
            !(annGet(d.type, n) === TT_LAMBDA_LSQUARE || annGet(d.kind, n) === P_LBRACE || annGet(d.kind, n) === 55)
          ) {
            r = r | C_NOLB;
          }
        }
      }
    }
    if (ck === P_EQUAL && (annGet(d.kind, annGet(d.lFirst, l)) === KW_FOR || annGet(this.nest, t) === 0)) {
      const pp = annGet(d.prv, prev);
      if (pp < 0 || annGet(d.type, pp) !== TT_DESIGNATED_INITIALIZER_PERIOD) {
        r = r | C_VP;
      }
    }
    if (
      this.opensScope(prev) &&
      (annGet(d.type, t) !== TT_LINE_COMMENT || (annGet(d.bk, prev) === BK_BRACED_INIT && annGet(d.eqList, prev) === 0))
    ) {
      r = r | C_ALIGN;
    }
    if (pk === P_COMMA && !this.isTrailingComment(t)) {
      r = r | C_NEXTPARAM;
    }
    if (this.isMemberAccess(t) && this.closesScope(prev)) {
      r = r | C_BUILDER;
    }
    if (this.isMemberAccess(t) && pk === P_RPAREN) {
      const m = annGet(d.match, prev);
      if (m >= 0 && toI64(annGet(this.tot, prev)) - toI64(annGet(this.tot, m)) > toI64(10)) {
        r = r | C_MEMBERRP;
      }
    }
    if (ck !== K_COMMENT && pc >= 0) {
      const ptt = annGet(d.type, pc);
      const pkk = annGet(d.kind, pc);
      if (
        (ptt === TT_BINARY_OPERATOR || pkk === P_COMMA || (ptt === TT_CONDITIONAL_EXPR && pkk === P_COLON)) &&
        ptt !== TT_OVERLOADED_OPERATOR &&
        ptt !== TT_CTOR_INITIALIZER_COMMA
      ) {
        const pr = pkk === P_COMMA ? PREC_COMMA : this.prec(pc);
        if (pr !== PREC_ASSIGNMENT && pr !== 10 && pr !== 11) {
          const bbo = annGet(this.mustB, pc) === 1 || pkk === P_LESSLESS || ptt === TT_CONDITIONAL_EXPR;
          const two = annGet(this.opIdx, pc) === 0 && annGet(this.nextOp, pc) < 0 && ptt !== TT_CONDITIONAL_EXPR;
          if (!bbo && !two) {
            r = r | C_NOLBOP;
          } else if (bbo) {
            r = r | C_NOLBOP_LOW;
          }
        }
      }
    }
    // The last-space rule: the first that applies.
    let ls = 0;
    const pp = annGet(d.prv, prev);
    if (
      ck !== K_COMMENT &&
      pk === P_LPAREN &&
      pp >= 0 &&
      (annGet(d.kind, pp) === KW_FOR ||
        annGet(d.kind, pp) === KW_IF ||
        ((annGet(d.kind, pp) === KW_CONSTEXPR || annGet(d.kind, pp) === K_IDENT) &&
          annGet(d.prv, pp) >= 0 &&
          annGet(d.kind, annGet(d.prv, pp)) === KW_IF))
    ) {
      ls = 1;
    } else if (ck !== K_COMMENT && ck !== 55 && pk === P_COMMA && pt !== TT_OVERLOADED_OPERATOR) {
      ls = 2;
    } else if (pt === TT_CONDITIONAL_EXPR || pt === TT_CTOR_INITIALIZER_COLON) {
      ls = 2;
    } else if (
      pt === TT_BINARY_OPERATOR &&
      ((this.prec(prev) !== PREC_ASSIGNMENT &&
        (pk !== P_LESSLESS || annGet(this.opIdx, prev) !== 0 || annGet(this.nextOp, prev) >= 0)) ||
        annGet(this.sbin, t) === 1)
    ) {
      ls = 2;
    } else if (pt === TT_INHERITANCE_COLON) {
      ls = 3;
    } else if (this.opensScope(prev)) {
      const m = annGet(d.match, prev);
      if (m >= 0) {
        const n = this.nextNonComment(m);
        if (n >= 0 && this.isMemberAccess(n)) {
          ls = 4;
        }
      }
    }
    return r | (ls << C_LS_SHIFT);
  }

  /** The last comma directly inside the bracket `o`, or -1. */
  lastCommaIn(o: i32): i32 {
    const d = this.d;
    const c = annGet(d.match, o);
    if (c < 0) {
      return -1;
    }
    let last = -1;
    for (let t = annGet(d.nxt, o); t >= 0 && t !== c; t = annGet(d.nxt, t)) {
      if (this.opensScope(t) && annGet(d.match, t) > t) {
        t = annGet(d.match, t);
        continue;
      }
      if (annGet(d.kind, t) === P_COMMA) {
        last = t;
      }
    }
    return last;
  }

  /** Which of the new-line column rules token `t` (previous non-comment `pc`) can meet. */
  newLineRules(l: i32, t: i32, pc: i32): i32 {
    const d = this.d;
    const prev = annGet(d.prv, t);
    if (prev < 0) {
      return 0;
    }
    let nnc = t;
    if (annGet(d.kind, t) === K_COMMENT) {
      const n = this.nextNonComment(t);
      if (n >= 0) {
        nnc = n;
      }
    }
    const ck = annGet(d.kind, t);
    const nk = annGet(d.kind, nnc);
    const nt = annGet(d.type, nnc);
    const pk = annGet(d.kind, prev);
    const pt = annGet(d.type, prev);
    let r = 0;
    if (nk === P_LBRACE && annGet(d.bk, nnc) === BK_BLOCK) {
      r = r | N_BLOCK;
    }
    // A lambda's arrow after a specifier or an attribute (clang-format 23).
    if (
      annGet(d.type, t) === TT_LAMBDA_ARROW &&
      (pk === KW_NOEXCEPT ||
        pk === KW_MUTABLE ||
        pk === KW_CONSTEXPR ||
        pk === KW_CONSTEVAL ||
        pk === KW_STATIC ||
        (pk === P_RSQUARE &&
          annGet(d.match, prev) >= 0 &&
          annGet(d.type, annGet(d.match, prev)) === TT_ATTRIBUTE_SQUARE))
    ) {
      r = r | N_LARROW;
    }
    if (ck === P_RBRACE || ck === P_RSQUARE) {
      r = r | N_CLOSEBR;
      if (this.closesBlockList(t)) {
        r = r | N_CLOSEBL;
      }
      const m = annGet(d.match, t);
      // (A `{` reached through `=` has no kind for clang-format: its `}`
      // goes to the line's first indent.)
      if (m >= 0 && annGet(d.bk, m) === BK_BRACED_INIT && annGet(d.eqList, m) === 0) {
        r = r | N_BRINIT;
        const mp = this.prevNonComment(m);
        if (mp >= 0 && annGet(d.type, mp) === TT_START_OF_NAME) {
          r = r | N_BRSON;
        }
      }
    }
    if (ck === P_RPAREN) {
      const n = annGet(d.nxt, t);
      if (
        n < 0 ||
        t === annGet(d.lLast, l) ||
        annGet(d.kind, n) === P_SEMI ||
        annGet(d.kind, n) === KW_CONST ||
        annGet(d.kind, n) === P_LBRACE
      ) {
        r = r | N_RPAREN;
      }
    }
    if (nk === K_STRING) {
      r = r | N_STRING;
    }
    if (nk === P_LESSLESS) {
      r = r | N_LESSLESS;
    }
    if (this.isMemberAccess(nnc)) {
      r = r | N_MEMBER;
    }
    if ((nk === P_COLON && nt === TT_CONDITIONAL_EXPR) || pt === TT_CONDITIONAL_EXPR) {
      r = r | N_QC;
      const nn = annGet(d.nxt, nnc);
      const fn = nn >= 0 ? annGet(this.fkHead, nn) : -1;
      const fc = annGet(this.fkHead, t);
      if (
        (nk === P_COLON && fn >= 0 && annGet(this.fkPrec, fn) === PREC_CONDITIONAL) ||
        (pk === P_COLON && fc >= 0 && annGet(this.fkPrec, fc) === PREC_CONDITIONAL)
      ) {
        r = r | N_QCIND;
      }
    }
    if (pk === P_COMMA) {
      r = r | N_COMMA;
    }
    if (annGet(this.rqc, t) === 1) {
      r = r | N_RQC;
    }
    if (nt === TT_CTOR_INITIALIZER_COLON || nt === TT_INHERITANCE_COLON || nt === TT_INHERITANCE_COMMA) {
      r = r | N_CTORCOL;
    }
    const pnt = pc >= 0 ? annGet(d.type, pc) : -1;
    if (
      (pc >= 0 &&
        (annGet(this.ctd, pc) === 1 ||
          annGet(this.crc, pc) === 1 ||
          pnt === TT_ATTRIBUTE_RPAREN ||
          pnt === TT_ATTRIBUTE_SQUARE ||
          pnt === TT_FUNCTION_ANNOTATION_RPAREN)) ||
      nk === KW_OPERATOR ||
      nt === TT_FUNCTION_DECLARATION_NAME
    ) {
      r = r | N_MAXLSIND;
    }
    if (nt === TT_ARRAY_SUBSCRIPT_LSQUARE) {
      r = r | N_SUBSCRIPT;
    }
    // getNewLineColumn: OpenMP clauses pushed onto the next line.
    if (isOmpPragmaLine(d, l)) {
      r = r | N_OMP;
    }
    if (nt === TT_START_OF_NAME || nt === TT_POINTER_OR_REFERENCE || pk === P_COLONCOLON || pk === P_EQUAL) {
      r = r | N_CI;
    }
    if (nt === TT_CTOR_INITIALIZER_COMMA) {
      r = r | N_IND;
    }
    if (pk === P_RPAREN && !this.isBinaryOperatorKind(t) && ck !== P_COLON && ck !== K_COMMENT) {
      r = r | N_CI2;
    }
    if (pc >= 0 && annGet(d.kind, pc) !== P_RBRACE && pnt !== TT_CTOR_INITIALIZER_COMMA) {
      r = r | N_PNCOK;
    }
    return r;
  }

  /** The step flags and previous non-comment token of every token of line `l`. */
  stepFlags(l: i32): void {
    const d = this.d;
    let pc = -1;
    for (let t = annGet(d.lFirst, l); t >= 0; t = annGet(d.nxt, t)) {
      annSet(this.pnc, t, pc);
      const k = annGet(d.kind, t);
      const tt = annGet(d.type, t);
      let m = 0;
      if (k === P_COMMA || tt === TT_BINARY_OPERATOR) {
        m = m | M_NOLBOP_CLR;
      }
      if (tt === TT_INHERITANCE_COLON) {
        m = m | M_INHCOLON;
      }
      if (k === P_LESSLESS && tt !== TT_OVERLOADED_OPERATOR) {
        m = m | M_LESSLESS;
      }
      const p0 = annGet(d.prv, t);
      if (
        (tt === TT_BINARY_OPERATOR && k !== P_LESSLESS) ||
        (tt === TT_CONDITIONAL_EXPR && p0 >= 0 && annGet(d.type, p0) !== TT_CONDITIONAL_EXPR)
      ) {
        m = m | M_LOW;
      }
      if (tt === TT_ARRAY_SUBSCRIPT_LSQUARE) {
        m = m | M_SUBSCRIPT;
      }
      if (tt === TT_CONDITIONAL_EXPR && k === P_QUESTION) {
        const nn = this.nextNonComment(t);
        if (annGet(this.mustB, t) === 1 || (nn >= 0 && annGet(this.mustB, nn) === 1)) {
          m = m | M_IWC;
        }
      }
      if (k === P_QUESTION) {
        m = m | M_QUESTION;
      }
      const opens = this.opensScope(t);
      const closes = this.closesScope(t);
      if (!opens && !closes && tt !== TT_POINTER_OR_REFERENCE) {
        m = m | M_LOWEST;
      }
      if (this.isMemberAccess(t)) {
        m = m | M_MEMBER;
      }
      if (tt === TT_CTOR_INITIALIZER_COLON) {
        m = m | M_CTORCOLON;
      }
      if (tt === TT_BINARY_OPERATOR || tt === TT_CONDITIONAL_EXPR) {
        m = m | M_NBINL;
      }
      if (tt === TT_LAMBDA_LSQUARE || tt === TT_LAMBDA_ARROW) {
        m = m | M_LSSET;
      }
      if (
        k !== K_COMMENT &&
        annGet(this.crc, t) === 0 &&
        pc >= 0 &&
        (annGet(d.kind, pc) === P_LBRACE || annGet(d.type, pc) === TT_ARRAY_INITIALIZER_LSQUARE)
      ) {
        m = m | M_AFTERBRACE;
      }
      if (pc >= 0) {
        const pt = annGet(d.type, pc);
        const pk = annGet(d.kind, pc);
        if (
          pt === TT_BINARY_OPERATOR ||
          pt === TT_CONDITIONAL_EXPR ||
          pk === P_LPAREN ||
          pk === P_COMMA ||
          pk === P_COLON
        ) {
          m = m | M_NBIPREV;
          if (!(pk === P_LPAREN && annGet(this.pcnt, pc) <= 1)) {
            m = m | M_NBIINL;
          }
        }
        if (annGet(this.role, pc) >= 0) {
          m = m | M_PREVROLE;
        }
      }
      if (annGet(this.fkHead, t) >= 0) {
        m = m | M_FAKEL;
      }
      if (closes) {
        m = m | M_CLOSES;
      }
      if (opens) {
        m = m | M_OPENS;
      }
      if (annGet(this.fakeR, t) > 0 || annGet(this.crc, t) === 1) {
        m = m | M_FAKER;
      }
      if (k === K_STRING) {
        m = m | M_STRING;
      } else if (!(k === K_COMMENT || k === K_IDENT || k >= 200 || k === 58)) {
        m = m | M_SOSLRESET;
      }
      const r = annGet(this.role, t);
      if (r >= 0 && (annGet(this.rlFmtN, r) === 1 || annGet(this.rlNested, r) === 1)) {
        m = m | M_ROLEAVOID;
      }
      if (annGet(d.multi, t) === 1 || k === K_STRING || k === K_COMMENT) {
        m = m | M_EOL;
      }
      if (k === K_STRING) {
        let tab = 0;
        for (let i = annGet(d.start, t); i < annGet(d.end, t); i++) {
          if (d.at(i) === 9) {
            tab = 1;
            break;
          }
        }
        annSet(this.strTab, t, tab);
      }
      annSet(this.mf, t, m);
      annSet(this.nlc, t, this.newLineRules(l, t, pc));
      annSet(
        this.nbb,
        t,
        annGet(d.type, t) === TT_FUNCTION_DECLARATION_NAME && this.nameBreakBlocked(t, annGet(d.lFirst, l)) ? 1 : 0,
      );
      annSet(this.cf, t, this.currentLineRules(l, t, pc));
      if (k !== K_COMMENT) {
        pc = t;
      }
      if (t === annGet(d.lLast, l)) {
        break;
      }
    }
  }

  mustBreakBefore(l: i32, t: i32): boolean {
    const d = this.d;
    const left = annGet(d.prv, t);
    const lk = annGet(d.kind, left);
    const rk = annGet(d.kind, t);
    if (annGet(d.nl, t) > 1 || annGet(d.mustBreak, t) === 2) {
      return true;
    }
    // The braces of `asm { ... }` stay where they were written.
    // (Only an unescaped newline counts.)
    if (annGet(d.type, t) === TT_INLINE_ASM_BRACE) {
      return annGet(d.nl, t) > 0 && annGet(d.inPP, t) === 0;
    }
    // A directive between the two (taken out of the line) ends the line before it.
    if (this.directiveBefore(t)) {
      return true;
    }
    if (lk === K_STRING && rk === K_STRING) {
      return true;
    }
    // `__attribute__((x))` then `@interface`: a line of its own.
    if (annGet(d.type, left) === TT_ATTRIBUTE_RPAREN && rk === P_AT && isObjCDeclAt(d, t)) {
      return true;
    }
    if (annGet(d.lType, l) !== LT_IMPORT) {
      let bcb = -1;
      if (
        (lk === P_LBRACE || annGet(d.type, left) === TT_ARRAY_INITIALIZER_LSQUARE) &&
        annGet(d.bk, left) !== BK_BLOCK &&
        annGet(d.match, left) > left
      ) {
        bcb = annGet(d.prv, annGet(d.match, left));
      } else {
        const m = annGet(d.match, t);
        if (m >= 0 && m < t && (annGet(d.kind, m) === P_LBRACE || annGet(d.type, m) === TT_ARRAY_INITIALIZER_LSQUARE)) {
          bcb = left;
        }
      }
      if (bcb >= 0 && (annGet(d.kind, bcb) === P_COMMA || this.isTrailingComment(bcb))) {
        return true;
      }
    }
    if (rk === K_COMMENT) {
      return (
        (annGet(d.bk, left) !== BK_BRACED_INIT || annGet(d.eqList, left) === 1) &&
        annGet(d.type, left) !== TT_CTOR_INITIALIZER_COLON &&
        annGet(d.nl, t) > 0 &&
        annGet(d.unesc, t) === 1
      );
    }
    if (this.isTrailingComment(left)) {
      return true;
    }
    // `<< "a" << "b"`: a break between two plain string literals is kept
    // where the source has one, and only there.
    if (rk === P_LESSLESS && this.isPlainString(left)) {
      const bl = annGet(d.prv, left);
      const n = annGet(d.nxt, t);
      if (bl >= 0 && annGet(d.kind, bl) === P_LESSLESS && n >= 0 && this.isPlainString(n)) {
        return annGet(d.nl, t) > 0;
      }
    }
    if (annGet(this.rqc, t) === 1) {
      return true;
    }
    if (annGet(this.ctd, left) === 1) {
      const m = annGet(d.match, left);
      if (annGet(this.nest, m) === 0) {
        return rk === KW_CONCEPT;
      }
    }
    if (annGet(this.crc, left) === 1 && rk !== P_SEMI) {
      return true;
    }
    const rs = annGet(d.start, t);
    // (A byte of the text sits below 2^31 - 1.)
    if (rk === K_STRING && d.at(rs) === 82 && rs < 2147483647 && d.at(rs + 1) === 34) {
      return annGet(d.multi, t) === 1 && annGet(d.nl, t) > 0;
    }
    return false;
  }

  /** A directive (taken out of the line) sits between `t` and the token before it: clang's FirstAfterPPLine. */
  directiveBefore(t: i32): boolean {
    const d = this.d;
    const p = annGet(d.prv, t);
    if (p < 0) {
      return false;
    }
    if (p > 2147483646) {
      fault();
      return false;
    }
    if (t <= p + 1) {
      return false;
    }
    // (`t > p + 1 >= 1`: the u32 difference is the true one.)
    return annGet(d.inPP, toI32(toU32(t) - 1)) === 1 && annGet(d.inPP, t) === 0;
  }

  /**
   * clang-format 23 never forces the break before a function's name past a
   * line comment or a directive inside the line before it.
   */
  nameBreakBlocked(t: i32, first: i32): boolean {
    const d = this.d;
    for (let q = annGet(d.prv, t); q >= 0; q = annGet(d.prv, q)) {
      if (annGet(d.type, q) === TT_LINE_COMMENT) {
        return true;
      }
      if (annGet(d.type, q) === TT_TEMPLATE_CLOSER) {
        q = annGet(d.match, q);
        if (q < 0) {
          return true;
        }
      }
      // (clang's FirstAfterPPLine: a directive read just before `q`.)
      if (q === first) {
        return annGet(d.fap, q) === 1;
      }
      if (this.directiveBefore(q)) {
        return true;
      }
    }
    return false;
  }

  /** clang's tok::string_literal: a string with no encoding prefix (raw or not). */
  isPlainString(t: i32): boolean {
    const d = this.d;
    if (annGet(d.kind, t) !== K_STRING) {
      return false;
    }
    const c = d.at(annGet(d.start, t));
    return c === 34 || c === 82;
  }

  canBreakBefore(l: i32, t: i32): boolean {
    const d = this.d;
    const left = annGet(d.prv, t);
    const lk = annGet(d.kind, left);
    const lt = annGet(d.type, left);
    const rk = annGet(d.kind, t);
    const rt = annGet(d.type, t);
    if (rt === TT_POINTER_OR_REFERENCE) {
      const n = annGet(d.nxt, t);
      return (
        annGet(d.lMultiVar, l) === 1 ||
        n < 0 ||
        (annGet(d.type, n) !== TT_FUNCTION_DECLARATION_NAME && annGet(d.kind, n) !== KW_CONST)
      );
    }
    // Never next to a `##` (clang-format 23).
    if (lk === P_HASHHASH || rk === P_HASHHASH) {
      return false;
    }
    if (
      rt === TT_START_OF_NAME ||
      rt === TT_FUNCTION_DECLARATION_NAME ||
      rt === TT_CLASS_HEAD_NAME ||
      rk === KW_OPERATOR
    ) {
      return true;
    }
    if (lt === TT_POINTER_OR_REFERENCE) {
      return false;
    }
    // Never right after an attribute's `(` (clang-format's TT_AttributeLParen).
    if (
      lk === P_LPAREN &&
      annGet(d.prv, left) >= 0 &&
      annGet(d.kind, annGet(d.prv, left)) === KW_ATTRIBUTE &&
      rk === P_LPAREN
    ) {
      return false;
    }
    if (this.isTrailingComment(t)) {
      return annGet(d.bk, left) === BK_BRACED_INIT && annGet(d.eqList, left) === 0;
    }
    if (lk === P_QUESTION && rk === P_COLON) {
      return false;
    }
    if (rt === TT_CONDITIONAL_EXPR || rk === P_QUESTION) {
      return true;
    }
    if (lt === TT_CONDITIONAL_EXPR || lk === P_QUESTION) {
      return false;
    }
    if (lt === TT_INHERITANCE_COLON) {
      return false;
    }
    if (rt === TT_INHERITANCE_COLON) {
      return true;
    }
    // Objective-C: before a `:` no selector part precedes, after a
    // selector's `:`, and before a selector part.
    if (rt === TT_OBJC_METHOD_EXPR && lt !== TT_SELECTOR_NAME) {
      return true;
    }
    if (rk === P_COLON && rt !== TT_CTOR_INITIALIZER_COLON && rt !== TT_INLINE_ASM_COLON) {
      return false;
    }
    if (lk === P_COLON && lt === TT_OBJC_METHOD_EXPR) {
      return true;
    }
    if (
      rt === TT_SELECTOR_NAME ||
      (isIdentKind(rk) && annGet(d.nxt, t) >= 0 && annGet(d.type, annGet(d.nxt, t)) === TT_OBJC_METHOD_EXPR)
    ) {
      return lk !== P_PERIOD;
    }
    if (rk === KW_CONCEPT) {
      return true;
    }
    if (annGet(this.rqc, t) === 1) {
      return true;
    }
    if (annGet(this.ctd, left) === 1 || lt === TT_FUNCTION_ANNOTATION_RPAREN) {
      return true;
    }
    if (annGet(this.crc, left) === 1) {
      return true;
    }
    if (rt === TT_RANGE_BASED_FOR_LOOP_COLON || rt === TT_OVERLOADED_OPERATOR_LPAREN || rt === TT_OVERLOADED_OPERATOR) {
      return false;
    }
    if (lt === TT_RANGE_BASED_FOR_LOOP_COLON) {
      return true;
    }
    if (lt === TT_TEMPLATE_CLOSER && rt === TT_TEMPLATE_OPENER) {
      return true;
    }
    if ((lk === P_GREATER && rk === P_GREATER) || (lk === P_LESS && rk === P_LESS)) {
      return false;
    }
    if (lt === TT_TEMPLATE_CLOSER || lt === TT_UNARY_OPERATOR || lk === KW_OPERATOR) {
      return false;
    }
    if (
      lk === P_EQUAL &&
      rk !== KW_DEFAULT &&
      rk !== KW_DELETE &&
      annGet(d.lType, l) === LT_VIRTUAL_FUNCTION_DECL &&
      annGet(this.nest, left) === 0
    ) {
      return false;
    }
    if (lt === TT_ATTRIBUTE_LPAREN || (lk === P_LPAREN && lt === TT_TYPE_DECLARATION_PAREN)) {
      return false;
    }
    // `decltype(` and `typeof(`: clang-format's TypeDeclarationParen.
    if (lk === P_LPAREN && lt === TT_UNKNOWN) {
      let pp = annGet(d.prv, left);
      while (pp >= 0 && annGet(d.kind, pp) === K_COMMENT) {
        pp = annGet(d.prv, pp);
      }
      if (pp >= 0 && (annGet(d.kind, pp) === KW_DECLTYPE || annGet(d.kind, pp) === KW_TYPEOF)) {
        return false;
      }
    }
    if (lk === P_LPAREN) {
      const lp = annGet(d.prv, left);
      if (lp >= 0 && (annGet(d.type, lp) === TT_BINARY_OPERATOR || annGet(d.type, lp) === TT_CAST_RPAREN)) {
        return false;
      }
    }
    if (d.anyImplicit && rt === TT_IMPLICIT_STRING_LITERAL) {
      return false;
    }
    if (rt === TT_TEMPLATE_CLOSER) {
      return false;
    }
    if (rk === P_RSQUARE) {
      const m = annGet(d.match, t);
      if (m >= 0 && annGet(d.type, m) === TT_LAMBDA_LSQUARE) {
        return false;
      }
    }
    if (rk === P_RBRACE) {
      const m = annGet(d.match, t);
      return m >= 0 && annGet(d.bk, m) === BK_BLOCK;
    }
    if (rk === P_RPAREN) {
      return false;
    }
    if (lt === TT_TRAILING_ANNOTATION) {
      return !(
        rk === P_LBRACE ||
        rk === P_SEMI ||
        rk === P_EQUAL ||
        rk === P_LPAREN ||
        rk === P_LESS ||
        rk === P_COLONCOLON
      );
    }
    if (rk === KW_ATTRIBUTE) {
      return true;
    }
    if (rk === P_LSQUARE && rt === TT_ATTRIBUTE_SQUARE) {
      return lt !== TT_ATTRIBUTE_SQUARE;
    }
    if (lk === K_IDENT && rk === K_STRING) {
      return true;
    }
    if (lt === TT_CTOR_INITIALIZER_COLON) {
      return false;
    }
    if (rt === TT_CTOR_INITIALIZER_COLON) {
      return true;
    }
    if (lt === TT_ARRAY_INITIALIZER_LSQUARE) {
      return true;
    }
    if (rk === KW_TYPENAME && lk !== KW_CONST) {
      return true;
    }
    if ((this.isBinaryOperatorKind(left) || lt === TT_BINARY_OPERATOR) && lk !== P_ARROWSTAR && lk !== P_LESSLESS) {
      return true;
    }
    if ((lt === TT_ATTRIBUTE_SQUARE && rk === P_LSQUARE) || (lk === P_RSQUARE && rt === TT_ATTRIBUTE_SQUARE)) {
      return false;
    }
    if (rk === KW_NOEXCEPT && rt === TT_TRAILING_ANNOTATION) {
      return false;
    }
    return (
      lk === P_COMMA ||
      lk === P_COLONCOLON ||
      lk === P_SEMI ||
      lk === P_LBRACE ||
      lk === KW_CLASS ||
      lk === KW_STRUCT ||
      lk === K_COMMENT ||
      this.isMemberAccess(t) ||
      rt === TT_TRAILING_RETURN_ARROW ||
      rt === TT_LAMBDA_ARROW ||
      rk === P_LESSLESS ||
      rk === P_COLON ||
      rk === P_LSQUARE ||
      (lk === P_RPAREN && (rk === K_IDENT || rk >= 200 || rk === KW_CONST)) ||
      (lk === P_LPAREN && rk !== P_RPAREN) ||
      (lt === TT_TEMPLATE_OPENER && rt !== TT_TEMPLATE_CLOSER)
    );
  }

  splitPenalty(l: i32, t: i32, inFnDecl: boolean): i32 {
    const d = this.d;
    const left = annGet(d.prv, t);
    const lk = annGet(d.kind, left);
    const lt = annGet(d.type, left);
    const rk = annGet(d.kind, t);
    const rt = annGet(d.type, t);
    if (lk === P_SEMI) {
      return 0;
    }
    if (rk === P_LSQUARE) {
      if (lk === P_RSQUARE) {
        return 200;
      }
      if (rt === TT_LAMBDA_LSQUARE && lk === P_EQUAL) {
        return 35;
      }
      if (
        !(
          rt === TT_LAMBDA_LSQUARE ||
          rt === TT_ARRAY_INITIALIZER_LSQUARE ||
          rt === TT_DESIGNATED_INITIALIZER_LSQUARE ||
          rt === TT_ATTRIBUTE_SQUARE
        )
      ) {
        return 500;
      }
    }
    if (lk === P_COLONCOLON) {
      return 500;
    }
    if (rt === TT_START_OF_NAME || rt === TT_FUNCTION_DECLARATION_NAME || rk === KW_OPERATOR) {
      if (annGet(d.kind, annGet(d.lFirst, l)) === KW_FOR && annGet(this.pmv, t) === 1) {
        return 3;
      }
      if (lt === TT_START_OF_NAME) {
        return 110;
      }
      if (inFnDecl && annGet(this.nest, t) === 0) {
        return 60;
      }
      return 200;
    }
    if (rt === TT_POINTER_OR_REFERENCE) {
      return 190;
    }
    if (rt === TT_LAMBDA_ARROW) {
      return 110;
    }
    if (lk === P_EQUAL && rk === P_LBRACE) {
      return 160;
    }
    if (lt === TT_CAST_RPAREN) {
      return 100;
    }
    if (lk === KW_CLASS || lk === KW_STRUCT || lk === KW_UNION) {
      return 5000;
    }
    if (lk === K_COMMENT) {
      return 1000;
    }
    if (lt === TT_RANGE_BASED_FOR_LOOP_COLON || lt === TT_INHERITANCE_COLON || lt === TT_CTOR_INITIALIZER_COLON) {
      return 2;
    }
    if (this.isMemberAccess(t)) {
      const no = annGet(this.nextOp, t);
      return no < 0 || !this.closesScope(annGet(d.prv, no)) ? 150 : 35;
    }
    if (rt === TT_TRAILING_ANNOTATION) {
      const n = annGet(d.nxt, t);
      if (n < 0 || annGet(d.kind, n) !== P_LPAREN) {
        // (Fine to move to the next line in an Objective-C method declaration.)
        if (annGet(d.type, annGet(d.lFirst, l)) === TT_OBJC_METHOD_SPECIFIER) {
          return 10;
        }
        if (d.len(t) < 10) {
          return lk === P_RPAREN ? 150 : 170;
        }
        return lk === P_RPAREN ? 100 : 120;
      }
    }
    const lineFor = annGet(d.kind, annGet(d.lFirst, l)) === KW_FOR;
    if (lineFor && lk === P_EQUAL) {
      return 4;
    }
    // Objective-C: breaking before a selector part over after its `:`.
    if (rt === TT_SELECTOR_NAME) {
      return 0;
    }
    if (lk === P_COLON && lt === TT_OBJC_METHOD_EXPR) {
      return annGet(d.lMightFn, l) === 1 ? 50 : 500;
    }
    if (lk === P_LPAREN && inFnDecl) {
      return 100;
    }
    if (lk === P_LPAREN) {
      const lp = annGet(d.prv, left);
      if (
        lp >= 0 &&
        (annGet(d.kind, lp) === KW_FOR ||
          annGet(d.kind, lp) === KW_IF ||
          (annGet(d.kind, lp) === KW_CONSTEXPR &&
            annGet(d.prv, lp) >= 0 &&
            annGet(d.kind, annGet(d.prv, lp)) === KW_IF))
      ) {
        return 1000;
      }
    }
    if (lk === P_EQUAL && inFnDecl) {
      return 110;
    }
    if (rk === P_RBRACE) {
      return 1;
    }
    if (lt === TT_TEMPLATE_OPENER) {
      return 100;
    }
    if (this.opensScope(left)) {
      return 19;
    }
    if (lt === TT_UNARY_OPERATOR) {
      return 60;
    }
    if (lk === P_PLUS || lk === P_COMMA) {
      const lp = annGet(d.prv, left);
      if (lp >= 0 && this.isLabelString(lp) && (annGet(this.nextOp, left) >= 0 || annGet(this.opIdx, left) !== 0)) {
        return 50;
      }
    }
    if (rk === P_PLUS && this.isLabelString(left) && (annGet(this.nextOp, t) >= 0 || annGet(this.opIdx, t) !== 0)) {
      return 25;
    }
    if (lk === P_COMMA) {
      return 1;
    }
    if (rk === P_LESSLESS && this.isLabelString(left) && (annGet(this.nextOp, t) >= 0 || annGet(this.opIdx, t) !== 1)) {
      return 25;
    }
    if (rk === P_LESSLESS) {
      if (lk !== P_RPAREN || annGet(this.opIdx, t) > 0) {
        return 2;
      }
      return 1;
    }
    if (annGet(this.ctd, left) === 1) {
      return 10;
    }
    if (annGet(this.crc, left) === 1) {
      return 0;
    }
    if (lt === TT_CONDITIONAL_EXPR) {
      return PREC_CONDITIONAL;
    }
    let level = this.prec(left);
    if (level === PREC_UNKNOWN) {
      level = this.prec(t);
    }
    if (level === PREC_ASSIGNMENT) {
      return 2;
    }
    if (level !== PREC_UNKNOWN) {
      return level;
    }
    return 3;
  }

  // ---- Braced-list columns ------------------------------------------------

  /** Commas directly inside `{`'s list, and its column formats. */
  precomputeList(o: i32): void {
    const d = this.d;
    const c = annGet(d.match, o);
    const r = this.nrole;
    // (A list per token at most: far below 2^31.)
    if (r > 2147483646) {
      fault();
      return;
    }
    if (r >= toI32(this.rlCommaOff.length)) {
      this.rlCommaOff = growI32(this.rlCommaOff, r + 1);
      this.rlCommaN = growI32(this.rlCommaN, r + 1);
      this.rlNested = growI32(this.rlNested, r + 1);
      this.rlFmtOff = growI32(this.rlFmtOff, r + 1);
      this.rlFmtN = growI32(this.rlFmtN, r + 1);
      this.rlItemOff = growI32(this.rlItemOff, r + 1);
    }
    this.nrole = r + 1;
    annSet(this.role, o, r);
    annSet(this.rlCommaOff, r, this.ncomma);
    annSet(this.rlNested, r, 0);
    annSet(this.rlFmtOff, r, this.nfmt);
    annSet(this.rlFmtN, r, 0);
    let nc = 0;
    for (let t = annGet(d.nxt, o); t >= 0 && t !== c; t = annGet(d.nxt, t)) {
      if (this.opensScope(t) && annGet(d.match, t) > t) {
        t = annGet(d.match, t);
        continue;
      }
      if (annGet(d.kind, t) === P_COMMA) {
        this.pushComma(t);
        // (A comma per token at most: far below 2^31.)
        if (nc > 1073741822) {
          fault();
          return;
        }
        nc++;
      }
    }
    if (nc > 1073741823) {
      fault();
      return;
    }
    annSet(this.rlCommaN, r, nc);
    // Item lengths; a nested braced list or separating comment noted.
    annSet(this.rlItemOff, r, this.nitem);
    const mbi = newI32s(nc + 1);
    const eol = newI32s(nc + 1);
    let item = annGet(d.nxt, o);
    while (item >= 0 && this.isTrailingComment(item)) {
      item = annGet(d.nxt, item);
    }
    let sepComment = false;
    let nItems = 0;
    for (let i = 0; i <= nc; i++) {
      while (annGet(d.unesc, item) === 1 && this.isTrailingComment(item)) {
        item = annGet(d.nxt, item);
        sepComment = i > 0;
      }
      annSet(mbi, i, annGet(this.mustB, item));
      if (annGet(d.kind, item) === P_LBRACE) {
        annSet(this.rlNested, r, 1);
      }
      let itemEnd = -1;
      if (i === nc) {
        itemEnd = c;
        const nce = this.prevNonComment(c);
        this.pushItem(annSpan(annGet(this.tot, nce), annGet(this.tot, item), annGet(d.width, item)));
        if (!this.isTrailingComment(annGet(d.prv, c))) {
          while (annGet(d.nxt, itemEnd) >= 0 && annGet(this.canB, annGet(d.nxt, itemEnd)) === 0) {
            itemEnd = annGet(d.nxt, itemEnd);
          }
        } else {
          itemEnd = annGet(d.prv, c);
        }
      } else {
        itemEnd = annGet(this.commaPool, annAdd(annGet(this.rlCommaOff, r), i));
        this.pushItem(annSpan(annGet(this.tot, itemEnd), annGet(this.tot, item), annGet(d.width, item)));
        const ne = annGet(d.nxt, itemEnd);
        if (ne >= 0 && annGet(d.unesc, ne) === 0 && this.isTrailingComment(ne)) {
          itemEnd = ne;
        }
      }
      annSet(eol, i, annSpan(annGet(this.tot, itemEnd), annGet(this.tot, item), annGet(d.width, item)));
      // (An item per comma, and one more: `nItems <= i <= nc`.)
      if (nItems > 1073741823) {
        fault();
        return;
      }
      nItems++;
      if (this.nextNonComment(itemEnd) === c) {
        break;
      }
      item = annGet(d.nxt, itemEnd);
    }
    if (nc < 5 || sepComment) {
      return;
    }
    if (annGet(this.nest, o) !== 0 && nc < 19) {
      return;
    }
    const lim = d.opts.columnLimit;
    const maxItems = lim / 3;
    const io = annGet(this.rlItemOff, r);
    const minSize = newI32s(maxItems + 1);
    const sizes = newI32s(maxItems + 1);
    for (let cols = 1; cols <= maxItems; cols++) {
      for (let i = 0; i < cols; i++) {
        annSet(sizes, i, 0);
        annSet(minSize, i, 1 << 30);
      }
      let lines = 1;
      let enough = false;
      let col = 0;
      for (let i = 0; i < nItems; i++) {
        if (annGet(mbi, i) === 1 || col === cols) {
          // (A line per item at most: `lines <= i + 1`.)
          if (lines > 1073741823) {
            fault();
            return;
          }
          lines++;
          col = 0;
        }
        if (col === cols - 1) {
          enough = true;
        }
        const len = col === cols - 1 ? annGet(eol, i) : annGet(this.itemLen, annAdd(io, i));
        if (len > annGet(sizes, col)) {
          annSet(sizes, col, len);
        }
        if (len < annGet(minSize, col)) {
          annSet(minSize, col, len);
        }
        // (`col < cols`: it starts over at `cols`.)
        if (col > 1073741823) {
          fault();
          return;
        }
        col++;
      }
      if (!enough) {
        break;
      }
      let total = cols - 1;
      for (let i = 0; i < cols; i++) {
        total = annAdd(total, annGet(sizes, i));
      }
      let uneven = false;
      for (let i = 0; i < cols - 1; i++) {
        if (toI64(annGet(sizes, i)) - toI64(annGet(minSize, i)) > toI64(10)) {
          uneven = true;
        }
      }
      if (uneven) {
        continue;
      }
      if (total > lim && cols > 1) {
        continue;
      }
      const f = this.nfmt;
      // (Formats number at most a few per list: far below 2^31.)
      if (f > 2147483646) {
        fault();
        return;
      }
      if (f >= toI32(this.fmtCols.length)) {
        this.fmtCols = growI32(this.fmtCols, f + 1);
        this.fmtLines = growI32(this.fmtLines, f + 1);
        this.fmtTotal = growI32(this.fmtTotal, f + 1);
        this.fmtSizeOff = growI32(this.fmtSizeOff, f + 1);
      }
      annSet(this.fmtCols, f, cols);
      annSet(this.fmtLines, f, lines);
      annSet(this.fmtTotal, f, total);
      annSet(this.fmtSizeOff, f, this.nsize);
      for (let i = 0; i < cols; i++) {
        const s = this.nsize;
        if (s > 2147483646) {
          fault();
          return;
        }
        if (s >= toI32(this.sizePool.length)) {
          this.sizePool = growI32(this.sizePool, s + 1);
        }
        annSet(this.sizePool, s, annGet(sizes, i));
        this.nsize = s + 1;
      }
      this.nfmt = f + 1;
      annBump(this.rlFmtN, r);
    }
  }

  pushComma(t: i32): void {
    const i = this.ncomma;
    // (A comma per token at most: far below 2^31.)
    if (i > 2147483646) {
      fault();
      return;
    }
    if (i >= toI32(this.commaPool.length)) {
      this.commaPool = growI32(this.commaPool, i + 1);
    }
    annSet(this.commaPool, i, t);
    this.ncomma = i + 1;
  }

  pushItem(v: i32): void {
    const i = this.nitem;
    // (An item per token at most: far below 2^31.)
    if (i > 2147483646) {
      fault();
      return;
    }
    if (i >= toI32(this.itemLen.length)) {
      this.itemLen = growI32(this.itemLen, i + 1);
    }
    annSet(this.itemLen, i, v);
    this.nitem = i + 1;
  }

  /** The best column format of list `r` for `remaining` columns, or -1. */
  columnFormat(r: i32, remaining: i32): i32 {
    let best = -1;
    const off = annGet(this.rlFmtOff, r);
    const nf = annGet(this.rlFmtN, r);
    if (nf <= 0) {
      return best;
    }
    for (let i = nf - 1; i >= 0; i--) {
      const f = annAdd(off, i);
      if (annGet(this.fmtTotal, f) <= remaining || annGet(this.fmtCols, f) === 1) {
        if (best >= 0 && annGet(this.fmtLines, f) > annGet(this.fmtLines, best)) {
          break;
        }
        best = f;
      }
    }
    return best;
  }
}

export const ANNOT_KINDS: i32 = P_STAR + TT_LAMBDA_LBRACE + TT_FUNCTION_LBRACE + TT_DESIGNATED_INITIALIZER_PERIOD;

/** Whether `@` at `t` starts `@interface`, `@implementation` or `@protocol` (clang-format's TT_ObjCDecl). */
export const isObjCDeclAt = (d: Doc, t: i32): boolean => {
  const n = annGet(d.nxt, t);
  return (
    n >= 0 &&
    annGet(d.kind, n) === K_IDENT &&
    (d.is(n, "interface") || d.is(n, "implementation") || d.is(n, "protocol"))
  );
};
