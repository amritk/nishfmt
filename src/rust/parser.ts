// A Rust parser for editions 2021 and 2024 (`RsTokens.edition`): rustc_parse's
// grammar and spans, building the RsAst table. It fails (sets `failed`) where
// rustc would refuse to parse; formatting is then skipped.
//
// Ported from rustc_parse (MIT OR Apache-2.0, Copyright The Rust Project
// Developers), for rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust
// Project Developers).

import { growI32 } from "../core/arr";
import {
  KW_AS,
  KW_ASYNC,
  KW_AUTO,
  KW_AWAIT,
  KW_BECOME,
  KW_BOX,
  KW_BREAK,
  KW_CONST,
  KW_CONTINUE,
  KW_CRATE,
  KW_DEFAULT,
  KW_DO,
  KW_DYN,
  KW_TYPEOF,
  KW_ELSE,
  KW_ENUM,
  KW_EXTERN,
  KW_FALSE,
  KW_FN,
  KW_FOR,
  KW_IF,
  KW_IMPL,
  KW_IN,
  KW_LET,
  KW_LOOP,
  KW_MACRO,
  KW_MACRO_RULES,
  KW_MATCH,
  KW_MOD,
  KW_MOVE,
  KW_MUT,
  KW_PUB,
  KW_RAW,
  KW_REF,
  KW_RETURN,
  KW_SAFE,
  KW_SELF,
  KW_SELF_TY,
  KW_STATIC,
  KW_STRUCT,
  KW_SUPER,
  KW_TRAIT,
  KW_TRUE,
  KW_TRY,
  KW_TYPE,
  KW_UNDERSCORE,
  KW_UNION,
  KW_UNSAFE,
  KW_USE,
  KW_WHERE,
  KW_WHILE,
  KW_YIELD,
  RsTokens,
  T_AND,
  T_ANDAND,
  T_ANDEQ,
  T_AT,
  T_CARET,
  T_CARETEQ,
  T_COLON,
  T_COLONCOLON,
  T_COMMA,
  T_DOC_BLOCK_INNER,
  T_DOC_BLOCK_OUTER,
  T_DOC_LINE_INNER,
  T_DOC_LINE_OUTER,
  T_DOT,
  T_DOTDOT,
  T_DOTDOTDOT,
  T_DOTDOTEQ,
  T_EOF,
  T_EQ,
  T_EQEQ,
  T_FATARROW,
  T_FLOAT,
  T_GE,
  T_GT,
  T_IDENT,
  T_INT,
  T_LBRACE,
  T_LBRACKET,
  T_LE,
  T_LIFETIME,
  T_LPAREN,
  T_LT,
  T_MINUS,
  T_MINUSEQ,
  T_NE,
  T_NOT,
  T_OR,
  T_OREQ,
  T_OROR,
  T_PERCENT,
  T_PERCENTEQ,
  T_PLUS,
  T_PLUSEQ,
  T_POUND,
  T_QUESTION,
  T_RARROW,
  T_RBRACE,
  T_RBRACKET,
  T_RCSTR,
  T_RPAREN,
  T_RSTR,
  T_SEMI,
  T_SHL,
  T_SHLEQ,
  T_SHR,
  T_SHREQ,
  T_SLASH,
  T_SLASHEQ,
  T_STAR,
  T_STAREQ,
  T_STR,
  T_TILDE,
  rsIsReserved,
} from "./lexer";
import {
  ADDR_RAW,
  AT_DOC,
  AT_DOC_BLOCK,
  AT_INNER,
  AT_UNSAFE,
  BLK_UNSAFE,
  BM_MUT,
  BM_REF,
  BM_REF_MUT,
  CL_ASYNC,
  CL_CONST,
  CL_MOVE,
  CL_STATIC,
  FD_SAFE,
  FN_ASYNC,
  FN_CONST,
  FN_DEFAULT,
  FN_EXTERN,
  FN_SAFE,
  FN_UNSAFE,
  FOR_AWAIT,
  GP_CONST,
  GP_LIFETIME,
  GP_TYPE,
  IT_AUTO,
  IT_CONST,
  IT_DEFAULT,
  IT_LOADED,
  IT_MACRO_RULES,
  IT_MUT,
  IT_NEGATIVE,
  IT_SAFE,
  IT_SEMI,
  IT_UNSAFE,
  MS_BRACES,
  MS_NOBRACES,
  MS_SEMI,
  MUT,
  N_ARM,
  N_ATTR,
  N_BLOCK,
  N_BOUNDS,
  N_CONST,
  N_CONSTRAINT,
  N_CRATE,
  N_ENUM,
  N_EXFIELD,
  N_EXTERN_CRATE,
  N_EX_ADDR_OF,
  N_EX_ARRAY,
  N_EX_ASSIGN,
  N_EX_ASSIGN_OP,
  N_EX_ASYNC,
  N_EX_AWAIT,
  N_EX_BECOME,
  N_EX_BINARY,
  N_EX_BLOCK,
  N_EX_BREAK,
  N_EX_CALL,
  N_EX_CAST,
  N_EX_CLOSURE,
  N_EX_CONST_BLOCK,
  N_EX_CONTINUE,
  N_EX_FIELD,
  N_EX_FOR,
  N_EX_IF,
  N_EX_INDEX,
  N_EX_LET,
  N_EX_LIT,
  N_EX_LOOP,
  N_EX_MAC,
  N_EX_MATCH,
  N_EX_METHOD,
  N_EX_PAREN,
  N_EX_PATH,
  N_EX_RANGE,
  N_EX_REPEAT,
  N_EX_RET,
  N_EX_STRUCT,
  N_EX_TRY,
  N_EX_TRY_BLOCK,
  N_EX_TUP,
  N_EX_UNARY,
  N_EX_UNDERSCORE,
  N_EX_WHILE,
  N_EX_YIELD,
  N_FIELD,
  N_FN,
  N_FNDECL,
  N_FOREIGN_MOD,
  N_GARGS,
  N_GARGS_ELIDED,
  N_GENERICS,
  N_GPARAM,
  N_GPARAMS,
  N_IMPL,
  N_LIFETIME,
  N_LOCAL,
  N_MAC,
  N_MACRO_DEF,
  N_MAC_ITEM,
  N_MOD,
  N_PARAM,
  N_PATFIELD,
  N_PATH,
  N_PAT_BOX,
  N_PAT_IDENT,
  N_PAT_LIT,
  N_PAT_MAC,
  N_PAT_NEVER,
  N_PAT_OR,
  N_PAT_PAREN,
  N_PAT_PATH,
  N_PAT_RANGE,
  N_PAT_REF,
  N_PAT_REST,
  N_PAT_SLICE,
  N_PAT_STRUCT,
  N_PAT_TUPLE,
  N_PAT_TUPLE_STRUCT,
  N_PAT_WILD,
  N_PGARGS,
  N_QSELF,
  N_SEG,
  N_STATIC,
  N_STMT_EMPTY,
  N_STMT_EXPR,
  N_STMT_ITEM,
  N_STMT_MAC,
  N_STMT_SEMI,
  N_STRUCT,
  N_TRAIT,
  N_TRAIT_ALIAS,
  N_TRAIT_BOUND,
  N_TTS,
  N_TYPE_ALIAS,
  N_TY_ARRAY,
  N_TY_CVARARGS,
  N_TY_DYN,
  N_TY_FN,
  N_TY_IMPL,
  N_TY_INFER,
  N_TY_MAC,
  N_TY_NEVER,
  N_TY_PAREN,
  N_TY_PATH,
  N_TY_PTR,
  N_TY_REF,
  N_TY_SLICE,
  N_TY_TUP,
  N_UNION,
  N_USE,
  N_USE_BOUND,
  N_USE_TREE,
  N_VARIANT,
  N_VDATA,
  N_VIS,
  N_WHERE,
  N_WPRED_BOUND,
  N_WPRED_EQ,
  N_WPRED_REGION,
  PATH_GLOBAL,
  PA_MUT,
  PA_REF_MUT,
  PA_SELF_EXPLICIT,
  PA_SELF_REF,
  PA_SELF_VALUE,
  PS_REST,
  PTR_CONST,
  RANGE_CLOSED,
  RANGE_DOTDOTDOT,
  RANGE_HALF_OPEN,
  RsAst,
  SHORTHAND,
  ST_BASE,
  ST_REST,
  TB_ASYNC,
  TB_CONST,
  TB_MAYBE,
  TB_MAYBE_CONST,
  TB_NEGATIVE,
  TB_PAREN,
  TY_DYN,
  UN_DEREF,
  UN_NEG,
  UN_NOT,
  UT_GLOB,
  UT_NESTED,
  UT_RENAME,
  UT_SIMPLE,
  VD_STRUCT,
  VD_TUPLE,
  VD_UNIT,
  VIS_CRATE,
  VIS_IN,
  VIS_PUB,
  VIS_RESTRICTED,
  WH_HAS_WHERE,
} from "./ast";

// Restrictions.
const R_STMT_EXPR: i32 = 1;
const R_NO_STRUCT: i32 = 2;
const R_ALLOW_LET: i32 = 4;

// Binary operator precedences (rustc's ExprPrecedence).
const P_ASSIGN: i32 = 2;
const P_RANGE: i32 = 3;
const P_LOR: i32 = 4;
const P_LAND: i32 = 5;
const P_COMPARE: i32 = 7;
const P_BITOR: i32 = 8;
const P_BITXOR: i32 = 9;
const P_BITAND: i32 = 10;
const P_SHIFT: i32 = 11;
const P_SUM: i32 = 12;
const P_PRODUCT: i32 = 13;
const P_CAST: i32 = 14;

const isCompareTok = (k: i32): boolean =>
  k === T_EQEQ || k === T_NE || k === T_LT || k === T_GT || k === T_LE || k === T_GE;

// Path styles.
const PS_EXPR: i32 = 0;
const PS_TYPE: i32 = 1;
const PS_MOD: i32 = 2;

export class RsParser {
  t: RsTokens;
  src: u8[];
  ast: RsAst;
  p: i32 = 0;
  // A split token: `off` >= 0 is the byte where the rest of token p starts, of kind `sk`.
  off: i32 = -1;
  sk: i32 = 0;
  end: i32 = 0;
  ph: i32 = 0; // the end of the previous token
  failed: boolean = false;
  stk: i32[];
  sp: i32 = 0;
  res: i32 = 0;
  innerS: i32[];
  innerN: i32[];
  innerNode: i32[];
  nInner: i32 = 0;
  // The inner attributes of the block parsed last.
  lastBlockInner: i32 = 0;

  constructor(t: RsTokens, ast: RsAst) {
    this.t = t;
    this.src = t.src;
    this.ast = ast;
    this.end = t.nt - 1;
    this.stk = new Array<i32>(256);
    this.innerS = new Array<i32>(16);
    this.innerN = new Array<i32>(16);
    this.innerNode = new Array<i32>(16);
  }

  // ---------------------------------------------------------------- tokens

  tk(): i32 {
    if (this.off >= 0) {
      return this.sk;
    }
    if (this.p >= this.end) {
      return T_EOF;
    }
    return this.t.kind[this.p];
  }

  la(k: i32): i32 {
    const i = this.p + k;
    if (i >= this.end) {
      return T_EOF;
    }
    return this.t.kind[i];
  }

  kw(): i32 {
    if (this.off >= 0 || this.p >= this.end) {
      return 0;
    }
    return this.t.kind[this.p] === T_IDENT ? this.t.kw[this.p] : 0;
  }

  laKw(k: i32): i32 {
    const i = this.p + k;
    if (i >= this.end) {
      return 0;
    }
    return this.t.kind[i] === T_IDENT ? this.t.kw[i] : 0;
  }

  lo(): i32 {
    if (this.off >= 0) {
      return this.off;
    }
    if (this.p >= this.end) {
      return this.end < this.t.nt ? this.t.lo[this.end] : this.t.n;
    }
    return this.t.lo[this.p];
  }

  bump(): void {
    if (this.p < this.end) {
      this.ph = this.t.hi[this.p];
      this.p = this.p + 1;
    }
    this.off = -1;
  }

  fail(): i32 {
    this.failed = true;
    return -1;
  }

  is(k: i32): boolean {
    return this.tk() === k;
  }

  eat(k: i32): boolean {
    if (this.tk() === k) {
      this.bump();
      return true;
    }
    return false;
  }

  expect(k: i32): boolean {
    if (this.tk() === k) {
      this.bump();
      return true;
    }
    this.failed = true;
    return false;
  }

  isKw(k: i32): boolean {
    return this.kw() === k;
  }

  eatKw(k: i32): boolean {
    if (this.kw() === k) {
      this.bump();
      return true;
    }
    return false;
  }

  /** Whether the current token is an identifier (not a reserved word, unless raw). */
  isIdent(): boolean {
    return this.tk() === T_IDENT && !rsIsReserved(this.kw());
  }

  laIsIdent(k: i32): boolean {
    return this.la(k) === T_IDENT && !rsIsReserved(this.laKw(k));
  }

  /** An identifier, `_` included where rustc allows it (non-reserved or a path segment keyword). */
  isPathSegIdent(): boolean {
    if (this.tk() !== T_IDENT) {
      return false;
    }
    const k = this.kw();
    return !rsIsReserved(k) || k === KW_SELF || k === KW_SELF_TY || k === KW_SUPER || k === KW_CRATE;
  }

  // Consumes the first byte of a glued token.
  splitFirst(rest: i32): void {
    const lo = this.lo();
    this.ph = lo + 1;
    this.off = lo + 1;
    this.sk = rest;
  }

  eatLt(): boolean {
    const k = this.tk();
    if (k === T_LT) {
      this.bump();
      return true;
    }
    if (k === T_SHL) {
      this.splitFirst(T_LT);
      return true;
    }
    if (k === T_LE) {
      this.splitFirst(T_EQ);
      return true;
    }
    if (k === T_SHLEQ) {
      this.splitFirst(T_LE);
      return true;
    }
    return false;
  }

  isLt(): boolean {
    const k = this.tk();
    return k === T_LT || k === T_SHL;
  }

  eatGt(): boolean {
    const k = this.tk();
    if (k === T_GT) {
      this.bump();
      return true;
    }
    if (k === T_SHR) {
      this.splitFirst(T_GT);
      return true;
    }
    if (k === T_GE) {
      this.splitFirst(T_EQ);
      return true;
    }
    if (k === T_SHREQ) {
      this.splitFirst(T_GE);
      return true;
    }
    return false;
  }

  isGt(): boolean {
    const k = this.tk();
    return k === T_GT || k === T_SHR || k === T_GE || k === T_SHREQ;
  }

  eatAnd(): boolean {
    const k = this.tk();
    if (k === T_AND) {
      this.bump();
      return true;
    }
    if (k === T_ANDAND) {
      this.splitFirst(T_AND);
      return true;
    }
    return false;
  }

  eatOr(): boolean {
    const k = this.tk();
    if (k === T_OR) {
      this.bump();
      return true;
    }
    if (k === T_OROR) {
      this.splitFirst(T_OR);
      return true;
    }
    return false;
  }

  eatPlus(): boolean {
    if (this.tk() === T_PLUS) {
      this.bump();
      return true;
    }
    if (this.tk() === T_PLUSEQ) {
      this.splitFirst(T_EQ);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- state

  save(): i32[] {
    return [
      this.p,
      this.off,
      this.sk,
      this.ph,
      this.ast.n,
      this.ast.nk,
      this.sp,
      this.failed ? 1 : 0,
      this.res,
      this.nInner,
    ];
  }

  restore(s: i32[]): void {
    this.p = s[0];
    this.off = s[1];
    this.sk = s[2];
    this.ph = s[3];
    this.ast.n = s[4];
    this.ast.nk = s[5];
    this.sp = s[6];
    this.failed = s[7] !== 0;
    this.res = s[8];
    this.nInner = s[9];
  }

  // ---------------------------------------------------------------- building

  nd(kind: i32, lo: i32): i32 {
    return this.ast.add(kind, lo);
  }

  fin(n: i32): i32 {
    this.ast.hi[n] = this.ph;
    return n;
  }

  push(x: i32): void {
    this.stk = growI32(this.stk, this.sp + 1);
    this.stk[this.sp] = x;
    this.sp = this.sp + 1;
  }

  endList(n: i32, mark: i32): void {
    this.ast.ls[n] = this.ast.addKids(this.stk, mark, this.sp);
    this.ast.ln[n] = this.sp - mark;
    this.sp = mark;
  }

  setAttrs(n: i32, mark: i32, count: i32): void {
    if (n >= 0 && count > 0) {
      this.ast.ats[n] = this.ast.addKids(this.stk, mark, mark + count);
      this.ast.atn[n] = count;
    }
    this.sp = mark;
  }

  /** Drops outer attributes pushed at `mark` without attaching them. */
  dropTo(mark: i32): void {
    this.sp = mark;
  }

  // ---------------------------------------------------------------- crate

  parseCrate(): i32 {
    const c = this.nd(N_CRATE, 0);
    const am = this.sp;
    const na = this.innerAttrs();
    const items = this.sp;
    while (!this.failed && !this.is(T_EOF)) {
      const it = this.parseItem(true);
      if (this.failed) {
        return -1;
      }
      if (it < 0) {
        // Not an item: rustc refuses the file.
        return this.fail();
      }
      this.push(it);
    }
    this.endList(c, items);
    this.setAttrs(c, am, na);
    this.ast.hi[c] = this.t.n;
    return c;
  }

  // ---------------------------------------------------------------- attributes

  isDocOuter(): boolean {
    const k = this.tk();
    return k === T_DOC_LINE_OUTER || k === T_DOC_BLOCK_OUTER;
  }

  isDocInner(): boolean {
    const k = this.tk();
    return k === T_DOC_LINE_INNER || k === T_DOC_BLOCK_INNER;
  }

  /** Parses inner attributes onto the stack; answers how many. */
  innerAttrs(): i32 {
    let n = 0;
    while (!this.failed) {
      if (this.isDocInner()) {
        this.push(this.docAttr(true));
        n++;
      } else if (this.is(T_POUND) && this.la(1) === T_NOT && this.la(2) === T_LBRACKET) {
        this.push(this.parseAttr(true));
        n++;
      } else {
        break;
      }
    }
    return n;
  }

  /** Parses outer attributes onto the stack; answers how many. */
  outerAttrs(): i32 {
    let n = 0;
    while (!this.failed) {
      if (this.isDocOuter()) {
        this.push(this.docAttr(false));
        n++;
      } else if (this.is(T_POUND) && this.la(1) === T_LBRACKET) {
        this.push(this.parseAttr(false));
        n++;
      } else {
        break;
      }
    }
    return n;
  }

  docAttr(inner: boolean): i32 {
    const k = this.tk();
    const a = this.nd(N_ATTR, this.lo());
    let f = AT_DOC;
    if (inner) {
      f = f | AT_INNER;
    }
    if (k === T_DOC_BLOCK_OUTER || k === T_DOC_BLOCK_INNER) {
      f = f | AT_DOC_BLOCK;
    }
    this.ast.fl[a] = f;
    this.ast.x[a] = this.p;
    this.bump();
    return this.fin(a);
  }

  parseAttr(inner: boolean): i32 {
    const a = this.nd(N_ATTR, this.lo());
    this.bump(); // #
    if (inner) {
      this.bump(); // !
      this.ast.fl[a] = AT_INNER;
    }
    this.expect(T_LBRACKET);
    let unsafeWrap = false;
    if (this.isKw(KW_UNSAFE) && this.la(1) === T_LPAREN) {
      this.bump();
      this.bump();
      unsafeWrap = true;
      this.ast.fl[a] = this.ast.fl[a] | AT_UNSAFE;
    }
    const gv1 = this.parsePath(PS_MOD);
    this.ast.a[a] = gv1;
    if (this.failed) {
      return -1;
    }
    this.parseAttrArgs(a);
    if (unsafeWrap) {
      this.expect(T_RPAREN);
    }
    this.expect(T_RBRACKET);
    return this.fin(a);
  }

  parseAttrArgs(a: i32): void {
    const k = this.tk();
    if (k === T_LPAREN || k === T_LBRACKET || k === T_LBRACE) {
      const gv2 = this.parseTts();
      this.ast.b[a] = gv2;
    } else if (k === T_EQ) {
      this.bump();
      const gv3 = this.parseExpr();
      this.ast.c[a] = gv3;
    }
  }

  /** A delimited token tree at the current open delimiter. */
  parseTts(): i32 {
    const k = this.tk();
    if (this.off >= 0 || (k !== T_LPAREN && k !== T_LBRACKET && k !== T_LBRACE)) {
      return this.fail();
    }
    const n = this.nd(N_TTS, this.lo());
    const close = this.t.match[this.p];
    if (close < 0 || close >= this.end) {
      return this.fail();
    }
    this.ast.a[n] = this.p;
    this.ast.b[n] = close;
    this.ast.x[n] = k;
    this.p = close;
    this.bump();
    return this.fin(n);
  }

  // ---------------------------------------------------------------- visibility

  parseVis(): i32 {
    if (!this.isKw(KW_PUB)) {
      return -1;
    }
    const v = this.nd(N_VIS, this.lo());
    this.bump();
    this.ast.fl[v] = VIS_PUB;
    if (this.is(T_LPAREN)) {
      const k1 = this.laKw(1);
      if ((k1 === KW_CRATE || k1 === KW_SELF || k1 === KW_SUPER) && this.la(2) === T_RPAREN) {
        this.bump();
        const pa = this.parsePath(PS_MOD);
        this.expect(T_RPAREN);
        this.ast.a[v] = pa;
        this.ast.fl[v] = k1 === KW_CRATE ? VIS_CRATE : VIS_RESTRICTED;
      } else if (k1 === KW_IN) {
        this.bump();
        this.bump();
        const pa = this.parsePath(PS_MOD);
        this.expect(T_RPAREN);
        this.ast.a[v] = pa;
        this.ast.fl[v] = VIS_RESTRICTED | VIS_IN;
      }
    }
    return this.fin(v);
  }

  // ---------------------------------------------------------------- items

  /** Whether the tokens at the current position start a fn's front matter. */
  isFnFront(): boolean {
    let i = 0;
    for (;;) {
      const k = this.laKwAt(i);
      if (k === KW_FN) {
        return true;
      }
      if (k === KW_CONST || k === KW_ASYNC || k === KW_UNSAFE || k === KW_SAFE) {
        i++;
        continue;
      }
      if (k === KW_EXTERN) {
        i++;
        const lk = this.laAt(i);
        if (lk === T_STR || lk === T_RSTR) {
          i++;
        }
        continue;
      }
      return false;
    }
  }

  laAt(i: number): i32 {
    if (i === 0) {
      return this.tk();
    }
    return this.la(i);
  }

  laKwAt(i: number): i32 {
    if (i === 0) {
      return this.kw();
    }
    return this.laKw(i);
  }

  /** Parses an item with its outer attributes; answers -1 (with failed unset) when there is none. */
  parseItem(macAllowed: boolean): i32 {
    const am = this.sp;
    const na = this.outerAttrs();
    if (this.failed) {
      return -1;
    }
    const it = this.parseItemAfterAttrs(macAllowed, false);
    if (it < 0) {
      if (!this.failed && na > 0) {
        this.failed = true;
      }
      this.dropTo(am);
      return -1;
    }
    this.setAttrs(it, am, na);
    return it;
  }

  /** The item kinds after outer attributes. `assoc`: an item of a trait, impl or extern block. */
  parseItemAfterAttrs(macAllowed: boolean, assoc: boolean): i32 {
    const lo = this.lo();
    const save = this.save();
    const vis = this.parseVis();
    if (this.failed) {
      return -1;
    }
    const it = this.parseItemKind(lo, macAllowed, assoc);
    if (it < 0) {
      if (!this.failed && vis >= 0) {
        this.failed = true;
        return -1;
      }
      if (!this.failed) {
        this.restore(save);
      }
      return -1;
    }
    this.ast.e[it] = vis;
    this.ast.lo[it] = lo;
    return it;
  }

  parseItemKind(lo: i32, macAllowed: boolean, assoc: boolean): i32 {
    const k = this.kw();
    // `default` (impl items, specialization).
    let def = false;
    if (k === KW_DEFAULT && this.la(1) === T_IDENT) {
      const k1 = this.laKw(1);
      if (
        k1 === KW_FN ||
        k1 === KW_TYPE ||
        k1 === KW_CONST ||
        k1 === KW_UNSAFE ||
        k1 === KW_ASYNC ||
        k1 === KW_EXTERN ||
        k1 === KW_IMPL ||
        k1 === KW_STATIC
      ) {
        this.bump();
        def = true;
      }
    }
    const kk = this.kw();
    if (kk === KW_USE) {
      return this.parseUse(lo);
    }
    if (this.isFnFront()) {
      const f = this.parseFn(lo, assoc);
      if (def && f >= 0) {
        this.ast.fl[f] = this.ast.fl[f] | FN_DEFAULT;
      }
      return f;
    }
    if (kk === KW_EXTERN) {
      if (this.laKw(1) === KW_CRATE) {
        return this.parseExternCrate(lo);
      }
      return this.parseForeignMod(lo, false);
    }
    if (kk === KW_UNSAFE) {
      const k1 = this.laKw(1);
      if (k1 === KW_EXTERN && (this.la(2) === T_LBRACE || this.la(3) === T_LBRACE)) {
        this.bump();
        return this.parseForeignMod(lo, true);
      }
      if (k1 === KW_IMPL) {
        this.bump();
        const im = this.parseImpl(lo);
        if (im >= 0) {
          this.ast.fl[im] = this.ast.fl[im] | IT_UNSAFE | (def ? IT_DEFAULT : 0);
        }
        return im;
      }
      if (k1 === KW_TRAIT || (k1 === KW_AUTO && this.laKw(2) === KW_TRAIT)) {
        this.bump();
        const tr = this.parseTrait(lo);
        if (tr >= 0) {
          this.ast.fl[tr] = this.ast.fl[tr] | IT_UNSAFE;
        }
        return tr;
      }
      if (k1 === KW_MOD) {
        this.bump();
        const m = this.parseMod(lo);
        if (m >= 0) {
          this.ast.fl[m] = this.ast.fl[m] | IT_UNSAFE;
        }
        return m;
      }
      return -1;
    }
    if (kk === KW_IMPL) {
      const im = this.parseImpl(lo);
      if (im >= 0 && def) {
        this.ast.fl[im] = this.ast.fl[im] | IT_DEFAULT;
      }
      return im;
    }
    if (kk === KW_CONST) {
      const k1 = this.la(1);
      if (k1 === T_LBRACE || k1 === T_OR || k1 === T_OROR || this.laKw(1) === KW_MOVE) {
        return -1; // a const block or const closure
      }
      if (this.laKw(1) === KW_IMPL) {
        this.bump();
        const im = this.parseImpl(lo);
        if (im >= 0) {
          this.ast.fl[im] = this.ast.fl[im] | IT_CONST;
        }
        return im;
      }
      if (this.laKw(1) === KW_TRAIT) {
        this.bump();
        const tr = this.parseTrait(lo);
        if (tr >= 0) {
          this.ast.fl[tr] = this.ast.fl[tr] | IT_CONST;
        }
        return tr;
      }
      const c = this.parseConst(lo);
      if (c >= 0 && def) {
        this.ast.fl[c] = this.ast.fl[c] | IT_DEFAULT;
      }
      return c;
    }
    if (kk === KW_STATIC) {
      const k1 = this.la(1);
      if (k1 === T_OR || k1 === T_OROR || this.laKw(1) === KW_MOVE || this.laKw(1) === KW_ASYNC) {
        return -1; // a static closure
      }
      return this.parseStatic(lo, 0);
    }
    if (kk === KW_SAFE && this.laKw(1) === KW_STATIC) {
      this.bump();
      return this.parseStatic(lo, IT_SAFE);
    }
    if (kk === KW_UNSAFE && this.laKw(1) === KW_STATIC) {
      this.bump();
      return this.parseStatic(lo, IT_UNSAFE);
    }
    if (kk === KW_TRAIT || (kk === KW_AUTO && this.laKw(1) === KW_TRAIT)) {
      return this.parseTrait(lo);
    }
    if (kk === KW_MOD) {
      return this.parseMod(lo);
    }
    if (kk === KW_TYPE) {
      const ta = this.parseTypeAlias(lo);
      if (ta >= 0 && def) {
        this.ast.fl[ta] = this.ast.fl[ta] | IT_DEFAULT;
      }
      return ta;
    }
    if (kk === KW_ENUM) {
      return this.parseEnum(lo);
    }
    if (kk === KW_STRUCT) {
      return this.parseStruct(lo, N_STRUCT);
    }
    if (kk === KW_UNION && this.laIsIdent(1)) {
      return this.parseStruct(lo, N_UNION);
    }
    if (kk === KW_MACRO_RULES && this.la(1) === T_NOT && (this.laIsIdent(2) || this.la(2) === T_IDENT)) {
      return this.parseMacroRules(lo);
    }
    if (kk === KW_MACRO && (this.laIsIdent(1) || this.la(1) === T_IDENT)) {
      return this.parseMacro2(lo);
    }
    if (macAllowed && this.isPathStart() && !this.isKw(KW_SELF_TY)) {
      // A macro invocation item: `path!(...)`.
      const save = this.save();
      const pa = this.parsePath(PS_MOD);
      if (this.failed || !this.is(T_NOT)) {
        this.restore(save);
        return -1;
      }
      this.bump();
      const mac = this.nd(N_MAC, lo);
      this.ast.a[mac] = pa;
      const tts = this.parseTts();
      if (this.failed) {
        return -1;
      }
      this.ast.b[mac] = tts;
      this.fin(mac);
      const it = this.nd(N_MAC_ITEM, lo);
      this.ast.a[it] = mac;
      if (this.ast.x[tts] !== T_LBRACE) {
        if (!this.expect(T_SEMI)) {
          return -1;
        }
        this.ast.fl[it] = IT_SEMI;
      }
      return this.fin(it);
    }
    return -1;
  }

  isPathStart(): boolean {
    const k = this.tk();
    if (k === T_COLONCOLON || k === T_LT || k === T_SHL) {
      return true;
    }
    return this.isPathSegIdent();
  }

  identTok(): i32 {
    if (this.tk() !== T_IDENT || this.off >= 0) {
      return this.fail();
    }
    const i = this.p;
    this.bump();
    return i;
  }

  /** An item name: an identifier that is not a reserved word. */
  itemIdent(): i32 {
    if (!this.isIdent()) {
      return this.fail();
    }
    return this.identTok();
  }

  parseUse(lo: i32): i32 {
    const n = this.nd(N_USE, lo);
    this.bump(); // use
    const gv4 = this.parseUseTree();
    this.ast.a[n] = gv4;
    this.expect(T_SEMI);
    return this.fin(n);
  }

  parseUseTree(): i32 {
    const lo = this.lo();
    const n = this.nd(N_USE_TREE, lo);
    // A prefix path, maybe empty.
    const pa = this.nd(N_PATH, lo);
    const mark = this.sp;
    if (this.is(T_COLONCOLON)) {
      this.bump();
      this.ast.fl[pa] = PATH_GLOBAL;
    }
    let glob = false;
    let nested = false;
    while (!this.failed) {
      if (this.is(T_STAR)) {
        this.bump();
        glob = true;
        break;
      }
      if (this.is(T_LBRACE)) {
        nested = true;
        break;
      }
      if (!this.isPathSegIdent()) {
        this.failed = true;
        return -1;
      }
      const sg = this.nd(N_SEG, this.lo());
      this.ast.d[sg] = this.identTok();
      this.fin(sg);
      this.push(sg);
      if (this.is(T_COLONCOLON)) {
        this.bump();
        continue;
      }
      break;
    }
    this.endList(pa, mark);
    this.fin(pa);
    this.ast.a[n] = pa;
    if (glob) {
      this.ast.fl[n] = UT_GLOB;
    } else if (nested) {
      this.ast.fl[n] = UT_NESTED;
      this.bump(); // {
      const m2 = this.sp;
      while (!this.failed && !this.is(T_RBRACE)) {
        this.push(this.parseUseTree());
        if (!this.eat(T_COMMA)) {
          break;
        }
      }
      this.expect(T_RBRACE);
      this.endList(n, m2);
    } else {
      this.ast.fl[n] = UT_SIMPLE;
      if (this.eatKw(KW_AS)) {
        if (this.tk() !== T_IDENT) {
          return this.fail();
        }
        this.ast.d[n] = this.identTok();
        this.ast.fl[n] = UT_SIMPLE | UT_RENAME;
      }
    }
    return this.fin(n);
  }

  parseExternCrate(lo: i32): i32 {
    const n = this.nd(N_EXTERN_CRATE, lo);
    this.bump();
    this.bump();
    if (this.tk() !== T_IDENT) {
      return this.fail();
    }
    const orig = this.identTok();
    if (this.eatKw(KW_AS)) {
      this.ast.d[n] = this.identTok();
      this.ast.c[n] = orig;
    } else {
      this.ast.d[n] = orig;
    }
    this.expect(T_SEMI);
    return this.fin(n);
  }

  parseAbi(): i32 {
    const k = this.tk();
    if (k === T_STR || k === T_RSTR) {
      const i = this.p;
      this.bump();
      return i;
    }
    return -1;
  }

  parseForeignMod(lo: i32, isUnsafe: boolean): i32 {
    const n = this.nd(N_FOREIGN_MOD, lo);
    this.bump(); // extern
    const gv5 = this.parseAbi();
    this.ast.x[n] = gv5;
    if (isUnsafe) {
      this.ast.fl[n] = IT_UNSAFE;
    }
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    this.ast.b[n] = this.p;
    this.bump();
    this.parseItemListBody(n, 2);
    return this.fin(n);
  }

  /** After `{`: inner attributes, then items until `}`. mode 0: module, 1: trait/impl, 2: extern block. */
  parseItemListBody(n: i32, mode: i32): void {
    const am = this.sp;
    const na = this.innerAttrs();

    // Inner attributes of the item go into the item's attribute list after its outer ones: keep them aside.
    const innerKids = this.ast.addKids(this.stk, am, am + na);
    this.sp = am;
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      if (this.is(T_EOF)) {
        this.failed = true;
        return;
      }
      let it = -1;
      if (mode === 0) {
        it = this.parseItem(true);
      } else {
        it = this.parseAssocItem();
      }
      if (this.failed) {
        return;
      }
      if (it < 0) {
        if (this.is(T_SEMI) && mode === 0) {
          // A stray `;` after an item: rustc errors.
          this.failed = true;
          return;
        }
        this.failed = true;
        return;
      }
      this.push(it);
    }
    this.expect(T_RBRACE);
    this.endList(n, mark);
    this.innerOf(n, innerKids, na);
  }

  // Inner attributes go after a node's outer ones, which are attached later: keep them in a side
  // table until `finishInnerAttrs`.
  innerOf(n: i32, s: i32, k: i32): void {
    if (k === 0) {
      return;
    }
    const i = this.nInner;
    this.innerNode = growI32(this.innerNode, i + 1);
    this.innerS = growI32(this.innerS, i + 1);
    this.innerN = growI32(this.innerN, i + 1);
    this.innerNode[i] = n;
    this.innerS[i] = s;
    this.innerN[i] = k;
    this.nInner = i + 1;
  }

  parseAssocItem(): i32 {
    const am = this.sp;
    const na = this.outerAttrs();
    if (this.failed) {
      return -1;
    }
    const it = this.parseItemAfterAttrs(true, true);
    if (it < 0) {
      this.dropTo(am);
      if (!this.failed) {
        this.failed = true;
      }
      return -1;
    }
    this.setAttrs(it, am, na);
    return it;
  }

  parseFn(lo: i32, assoc: boolean): i32 {
    const n = this.nd(N_FN, lo);
    let f = 0;
    for (;;) {
      const k = this.kw();
      if (k === KW_CONST) {
        f = f | FN_CONST;
        this.bump();
      } else if (k === KW_ASYNC) {
        f = f | FN_ASYNC;
        this.bump();
      } else if (k === KW_UNSAFE) {
        f = f | FN_UNSAFE;
        this.bump();
      } else if (k === KW_SAFE) {
        f = f | FN_SAFE;
        this.bump();
      } else if (k === KW_EXTERN) {
        f = f | FN_EXTERN;
        this.bump();
        const gv6 = this.parseAbi();
        this.ast.x[n] = gv6;
      } else {
        break;
      }
    }
    if (!this.eatKw(KW_FN)) {
      return this.fail();
    }
    this.ast.fl[n] = f;
    this.ast.d[n] = this.itemIdent();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    const gv7 = this.parseFnDecl(true);
    this.ast.b[n] = gv7;
    this.parseWhereInto(g);
    if (this.failed) {
      return -1;
    }
    if (this.eat(T_SEMI)) {
      return this.fin(n);
    }
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv8 = this.parseBlock(this.lo(), 0);
    this.ast.c[n] = gv8;
    return this.fin(n);
  }

  parseFnDecl(items: boolean): i32 {
    const d = this.nd(N_FNDECL, this.lo());
    if (!this.expect(T_LPAREN)) {
      return -1;
    }
    const mark = this.sp;
    let first = true;
    while (!this.failed && !this.is(T_RPAREN)) {
      this.push(this.parseParam(first, items));
      first = false;
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RPAREN);
    this.endList(d, mark);
    if (this.eat(T_RARROW)) {
      const gv9 = this.parseTyNoPlusOpt(true);
      this.ast.a[d] = gv9;
    }
    return this.fin(d);
  }

  parseParam(first: boolean, items: boolean): i32 {
    const lo = this.lo();
    const am = this.sp;
    const na = this.outerAttrs();
    const sp = first ? this.parseSelfParam() : -1;
    if (sp >= 0) {
      this.setAttrs(sp, am, na);
      return sp;
    }
    const n = this.nd(N_PARAM, lo);
    if (this.is(T_DOTDOTDOT)) {
      // C variadic.
      const ty = this.nd(N_TY_CVARARGS, this.lo());
      this.bump();
      this.fin(ty);
      this.ast.b[n] = ty;
      this.fin(n);
      this.setAttrs(n, am, na);
      return n;
    }
    if (items || this.isNamedParam()) {
      const gv10 = this.parsePatNoTopAlt();
      this.ast.a[n] = gv10;
      if (!this.expect(T_COLON)) {
        return -1;
      }
      if (this.is(T_DOTDOTDOT)) {
        const ty = this.nd(N_TY_CVARARGS, this.lo());
        this.bump();
        const gv11 = this.fin(ty);
        this.ast.b[n] = gv11;
      } else {
        const gv12 = this.parseTy();
        this.ast.b[n] = gv12;
      }
    } else {
      const gv13 = this.parseTy();
      this.ast.b[n] = gv13;
    }
    this.fin(n);
    this.setAttrs(n, am, na);
    return n;
  }

  isNamedParam(): boolean {
    let off = 0;
    const k = this.tk();
    if (k === T_AND || k === T_ANDAND || this.kw() === KW_MUT) {
      off = 1;
    }
    return this.laAt(off) === T_IDENT && this.laAt(off + 1) === T_COLON;
  }

  isSelfAt(i: i32): boolean {
    return this.laKwAt(i) === KW_SELF && this.laAt(i + 1) !== T_COLONCOLON;
  }

  parseSelfParam(): i32 {
    const lo = this.lo();
    const k = this.tk();
    if (k === T_AND) {
      const hasLt = this.la(1) === T_LIFETIME;
      const s = hasLt ? 1 : 0;
      let f = 0;
      if (this.isSelfAt(s + 1)) {
        f = PA_SELF_REF;
      } else if (this.laKwAt(s + 1) === KW_MUT && this.isSelfAt(s + 2)) {
        f = PA_SELF_REF | PA_REF_MUT;
      } else {
        return -1;
      }
      const n = this.nd(N_PARAM, lo);
      this.bump();
      if (hasLt) {
        this.ast.d[n] = this.p;
        this.bump();
      }
      if ((f & PA_REF_MUT) !== 0) {
        this.bump();
      }
      this.bump(); // self
      this.ast.fl[n] = f;
      return this.fin(n);
    }
    let mutSelf = false;
    if (this.isSelfAt(0)) {
      mutSelf = false;
    } else if (this.kw() === KW_MUT && this.isSelfAt(1)) {
      mutSelf = true;
    } else {
      return -1;
    }
    const n = this.nd(N_PARAM, lo);
    if (mutSelf) {
      this.bump();
    }
    this.bump(); // self
    this.fin(n);
    let f = PA_SELF_VALUE | (mutSelf ? PA_MUT : 0);
    if (this.eat(T_COLON)) {
      f = PA_SELF_EXPLICIT | (mutSelf ? PA_MUT : 0);
      const gv14 = this.parseTy();
      this.ast.b[n] = gv14;
    }
    this.ast.fl[n] = f;
    return n;
  }

  // ---- generics

  /** Generics at `<`, or empty ones at the current position. */
  parseGenerics(): i32 {
    const g = this.nd(N_GENERICS, this.lo());
    if (this.isLt()) {
      this.eatLt();
      const mark = this.sp;
      while (!this.failed && !this.isGt()) {
        this.push(this.parseGenericParam());
        if (!this.eat(T_COMMA)) {
          break;
        }
      }
      if (!this.eatGt()) {
        return this.fail();
      }
      this.endList(g, mark);
      this.fin(g);
    } else {
      // Empty generics: an empty span at the previous token's end, as rustc's `Generics::default()` (DUMMY) span.
      this.ast.lo[g] = this.ph;
      this.ast.hi[g] = this.ph;
    }
    const w = this.nd(N_WHERE, this.ph);
    this.ast.hi[w] = this.ph;
    this.ast.a[g] = w;
    return g;
  }

  parseGenericParam(): i32 {
    const am = this.sp;
    const na = this.outerAttrs();
    const lo = this.lo();
    const n = this.nd(N_GPARAM, lo);
    if (this.is(T_LIFETIME)) {
      this.ast.fl[n] = GP_LIFETIME;
      this.ast.d[n] = this.p;
      this.bump();
      if (this.is(T_COLON)) {
        this.ast.x[n] = this.p;
        this.bump();
        const gv15 = this.parseLtBounds();
        this.ast.b[n] = gv15;
      }
    } else if (this.isKw(KW_CONST)) {
      this.ast.fl[n] = GP_CONST;
      this.bump();
      this.ast.d[n] = this.identTok();
      this.expect(T_COLON);
      const gv16 = this.parseTy();
      this.ast.a[n] = gv16;
      if (this.eat(T_EQ)) {
        const gv17 = this.parseConstArg();
        this.ast.c[n] = gv17;
      }
    } else {
      this.ast.fl[n] = GP_TYPE;
      this.ast.d[n] = this.identTok();
      if (this.is(T_COLON)) {
        this.ast.x[n] = this.p;
        this.bump();
        const gv18 = this.parseBounds(true);
        this.ast.b[n] = gv18;
      }
      if (this.eat(T_EQ)) {
        const gv19 = this.parseTy();
        this.ast.c[n] = gv19;
      }
    }
    this.fin(n);
    this.setAttrs(n, am, na);
    return n;
  }

  parseLtBounds(): i32 {
    const b = this.nd(N_BOUNDS, this.lo());
    const mark = this.sp;
    while (this.is(T_LIFETIME)) {
      const l = this.nd(N_LIFETIME, this.lo());
      this.ast.d[l] = this.p;
      this.bump();
      this.push(this.fin(l));
      if (!this.eatPlus()) {
        break;
      }
    }
    this.endList(b, mark);
    return this.fin(b);
  }

  /** `for<...>` binder params, at `for`. */
  parseForBinder(): i32 {
    const n = this.nd(N_GPARAMS, this.lo());
    this.bump(); // for
    if (!this.eatLt()) {
      return this.fail();
    }
    const mark = this.sp;
    while (!this.failed && !this.isGt()) {
      this.push(this.parseGenericParam());
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    if (!this.eatGt()) {
      return this.fail();
    }
    this.endList(n, mark);
    return this.fin(n);
  }

  /** A where clause into generics `g` (its where node is replaced). */
  parseWhereInto(g: i32): void {
    if (!this.isKw(KW_WHERE)) {
      const w0 = this.ast.a[g];
      this.ast.lo[w0] = this.ph;
      this.ast.hi[w0] = this.ph;
      return;
    }
    const gv20 = this.parseWhere();
    this.ast.a[g] = gv20;
  }

  parseWhere(): i32 {
    const w = this.nd(N_WHERE, this.lo());
    this.bump(); // where
    this.ast.fl[w] = WH_HAS_WHERE;
    const mark = this.sp;
    while (!this.failed) {
      const k = this.tk();
      if (k === T_LBRACE || k === T_SEMI || k === T_EOF || k === T_EQ) {
        break;
      }
      const lo = this.lo();
      if (this.is(T_LIFETIME)) {
        const pr = this.nd(N_WPRED_REGION, lo);
        this.ast.d[pr] = this.p;
        this.bump();
        this.expect(T_COLON);
        const gv21 = this.parseLtBounds();
        this.ast.b[pr] = gv21;
        this.push(this.fin(pr));
      } else {
        let binder = -1;
        if (this.isKw(KW_FOR) && this.la(1) === T_LT) {
          binder = this.parseForBinder();
        }
        const ty = this.parseTy();
        if (this.failed) {
          return -1;
        }
        if (this.is(T_COLON)) {
          this.bump();
          const pr = this.nd(N_WPRED_BOUND, lo);
          this.ast.a[pr] = ty;
          this.ast.c[pr] = binder;
          const gv22 = this.parseBounds(true);
          this.ast.b[pr] = gv22;
          this.push(this.fin(pr));
        } else if (this.is(T_EQ) || this.is(T_EQEQ)) {
          this.bump();
          const pr = this.nd(N_WPRED_EQ, lo);
          this.ast.a[pr] = ty;
          const gv23 = this.parseTy();
          this.ast.b[pr] = gv23;
          this.push(this.fin(pr));
        } else {
          return this.fail();
        }
      }
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.endList(w, mark);
    return this.fin(w);
  }

  /** Generic bounds, `+`-separated. */
  parseBounds(allowPlus: boolean): i32 {
    const b = this.nd(N_BOUNDS, this.lo());
    const mark = this.sp;
    while (!this.failed && this.canBeginBound()) {
      this.push(this.parseBound());
      if (!allowPlus || !this.eatPlus()) {
        break;
      }
    }
    this.endList(b, mark);
    return this.fin(b);
  }

  canBeginBound(): boolean {
    const k = this.tk();
    if (k === T_LIFETIME || k === T_QUESTION || k === T_TILDE || k === T_LPAREN || k === T_NOT) {
      return true;
    }
    if (k === T_COLONCOLON || k === T_LT || k === T_SHL) {
      return true;
    }
    const kk = this.kw();
    if (kk === KW_FOR || kk === KW_CONST || kk === KW_ASYNC || kk === KW_USE) {
      return true;
    }
    return this.isPathSegIdent();
  }

  parseBound(): i32 {
    const lo = this.lo();
    if (this.is(T_LIFETIME)) {
      const l = this.nd(N_LIFETIME, lo);
      this.ast.d[l] = this.p;
      this.bump();
      return this.fin(l);
    }
    if (this.isKw(KW_USE) && this.isLtAt(1)) {
      const u = this.nd(N_USE_BOUND, lo);
      this.bump();
      this.eatLt();
      const mark = this.sp;
      while (!this.failed && !this.isGt()) {
        if (this.is(T_LIFETIME)) {
          const l = this.nd(N_LIFETIME, this.lo());
          this.ast.d[l] = this.p;
          this.bump();
          this.push(this.fin(l));
        } else {
          const ty = this.nd(N_TY_PATH, this.lo());
          const gv24 = this.parsePath(PS_TYPE);
          this.ast.b[ty] = gv24;
          this.push(this.fin(ty));
        }
        if (!this.eat(T_COMMA)) {
          break;
        }
      }
      if (!this.eatGt()) {
        return this.fail();
      }
      this.endList(u, mark);
      return this.fin(u);
    }
    if (this.is(T_LPAREN)) {
      // A parenthesized bound.
      this.bump();
      const inner = this.parseBound();
      this.expect(T_RPAREN);
      if (inner >= 0) {
        this.ast.lo[inner] = lo;
        this.ast.hi[inner] = this.ph;
        this.ast.fl[inner] = this.ast.fl[inner] | TB_PAREN;
      }
      return inner;
    }
    const n = this.nd(N_TRAIT_BOUND, lo);
    let f = 0;
    if (this.isKw(KW_FOR) && this.isLtAt(1)) {
      const gv25 = this.parseForBinder();
      this.ast.c[n] = gv25;
    }
    if (this.is(T_TILDE) && this.laKw(1) === KW_CONST) {
      this.bump();
      this.bump();
      f = f | TB_MAYBE_CONST;
    } else if (this.isKw(KW_CONST)) {
      this.bump();
      f = f | TB_CONST;
    }
    if (this.isKw(KW_ASYNC)) {
      this.bump();
      f = f | TB_ASYNC;
    }
    if (this.eat(T_QUESTION)) {
      f = f | TB_MAYBE;
    } else if (this.eat(T_NOT)) {
      f = f | TB_NEGATIVE;
    }
    // rustc reports a binder with `?`/`!` (BinderAndPolarity) and a binder after the
    // modifiers (BinderBeforeModifiers): errors it recovers from.
    if (this.ast.c[n] >= 0 && (f & (TB_MAYBE | TB_NEGATIVE)) !== 0) {
      return this.fail();
    }
    if (this.isKw(KW_FOR) && this.isLtAt(1)) {
      return this.fail();
    }
    this.ast.fl[n] = f;
    const gv27 = this.parsePath(PS_TYPE);
    this.ast.a[n] = gv27;
    return this.fin(n);
  }

  isLtAt(i: i32): boolean {
    const k = this.laAt(i);
    return k === T_LT || k === T_SHL;
  }

  // ---- ADTs

  parseStruct(lo: i32, kind: i32): i32 {
    const n = this.nd(kind, lo);
    this.bump(); // struct / union
    this.ast.d[n] = this.itemIdent();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    const vd = this.nd(N_VDATA, this.lo());
    this.ast.b[n] = vd;
    if (this.isKw(KW_WHERE)) {
      this.parseWhereInto(g);
      if (this.eat(T_SEMI)) {
        this.ast.fl[vd] = VD_UNIT;
        this.ast.lo[vd] = this.ph;
        this.ast.hi[vd] = this.ph;
        return this.fin(n);
      }
      this.parseRecordBody(vd);
    } else if (this.is(T_SEMI)) {
      this.parseWhereInto(g);
      this.bump();
      this.ast.fl[vd] = VD_UNIT;
      this.ast.lo[vd] = this.ph;
      this.ast.hi[vd] = this.ph;
    } else if (this.is(T_LPAREN)) {
      this.parseTupleBody(vd);
      this.parseWhereInto(g);
      this.expect(T_SEMI);
    } else if (this.is(T_LBRACE)) {
      this.parseWhereInto(g);
      this.parseRecordBody(vd);
    } else {
      return this.fail();
    }
    return this.fin(n);
  }

  parseRecordBody(vd: i32): void {
    this.ast.fl[vd] = VD_STRUCT;
    this.ast.lo[vd] = this.lo();
    if (!this.expect(T_LBRACE)) {
      return;
    }
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      const am = this.sp;
      const na = this.outerAttrs();
      const lo = this.lo();
      const f = this.nd(N_FIELD, lo);
      const gv28 = this.parseVis();
      this.ast.e[f] = gv28;
      if (this.isKw(KW_SAFE) && this.laIsIdent(1)) {
        this.bump();
        this.ast.fl[f] = FD_SAFE;
      }
      if (this.tk() !== T_IDENT) {
        this.failed = true;
        return;
      }
      this.ast.d[f] = this.identTok();
      this.expect(T_COLON);
      const gv29 = this.parseTy();
      this.ast.a[f] = gv29;
      if (this.eat(T_EQ)) {
        const gv30 = this.parseExpr();
        this.ast.c[f] = gv30;
      }
      this.fin(f);
      this.setAttrs(f, am, na);
      this.push(f);
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RBRACE);
    this.endList(vd, mark);
    this.fin(vd);
  }

  parseTupleBody(vd: i32): void {
    this.ast.fl[vd] = VD_TUPLE;
    this.ast.lo[vd] = this.lo();
    this.bump(); // (
    const mark = this.sp;
    while (!this.failed && !this.is(T_RPAREN)) {
      const am = this.sp;
      const na = this.outerAttrs();
      const lo = this.lo();
      const f = this.nd(N_FIELD, lo);
      const gv31 = this.parseVis();
      this.ast.e[f] = gv31;
      const gv32 = this.parseTy();
      this.ast.a[f] = gv32;
      if (this.eat(T_EQ)) {
        const gv33 = this.parseExpr();
        this.ast.c[f] = gv33;
      }
      this.fin(f);
      this.setAttrs(f, am, na);
      this.push(f);
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RPAREN);
    this.endList(vd, mark);
    this.fin(vd);
  }

  parseEnum(lo: i32): i32 {
    const n = this.nd(N_ENUM, lo);
    this.bump();
    this.ast.d[n] = this.itemIdent();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    this.parseWhereInto(g);
    if (!this.expect(T_LBRACE)) {
      return -1;
    }
    this.ast.x[n] = this.p - 1;
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      const am = this.sp;
      const na = this.outerAttrs();
      const vlo = this.lo();
      const v = this.nd(N_VARIANT, vlo);
      const gv34 = this.parseVis();
      this.ast.e[v] = gv34;
      this.ast.d[v] = this.identTok();
      const vd = this.nd(N_VDATA, this.lo());
      this.ast.b[v] = vd;
      if (this.is(T_LBRACE)) {
        this.parseRecordBody(vd);
      } else if (this.is(T_LPAREN)) {
        this.parseTupleBody(vd);
      } else {
        this.ast.fl[vd] = VD_UNIT;
        this.ast.lo[vd] = this.ph;
        this.ast.hi[vd] = this.ph;
      }
      if (this.eat(T_EQ)) {
        const gv35 = this.parseExpr();
        this.ast.c[v] = gv35;
      }
      this.fin(v);
      this.setAttrs(v, am, na);
      this.push(v);
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RBRACE);
    this.endList(n, mark);
    return this.fin(n);
  }

  parseTrait(lo: i32): i32 {
    const n = this.nd(N_TRAIT, lo);
    if (this.eatKw(KW_AUTO)) {
      this.ast.fl[n] = IT_AUTO;
    }
    this.bump(); // trait
    this.ast.d[n] = this.itemIdent();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    if (this.eat(T_COLON)) {
      const gv36 = this.parseBounds(true);
      this.ast.b[n] = gv36;
    }
    if (this.eat(T_EQ)) {
      // A trait alias.
      this.ast.kind[n] = N_TRAIT_ALIAS;
      const gv37 = this.parseBounds(true);
      this.ast.b[n] = gv37;
      this.parseWhereInto(g);
      this.expect(T_SEMI);
      return this.fin(n);
    }
    this.parseWhereInto(g);
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    this.ast.x[n] = this.p;
    this.bump();
    this.parseItemListBody(n, 1);
    return this.fin(n);
  }

  /** Whether `impl <...` starts generics rather than a qualified path. */
  chooseGenerics(): boolean {
    if (!this.isLt()) {
      return false;
    }
    if (this.tk() === T_SHL) {
      return false;
    }
    const k1 = this.la(1);
    if (k1 === T_POUND || k1 === T_GT || k1 === T_LIFETIME) {
      return true;
    }
    if (this.laKw(1) === KW_CONST) {
      return true;
    }
    if (k1 === T_IDENT) {
      const k2 = this.la(2);
      return k2 === T_GT || k2 === T_COMMA || k2 === T_COLON || k2 === T_EQ;
    }
    return false;
  }

  parseImpl(lo: i32): i32 {
    const n = this.nd(N_IMPL, lo);
    this.bump(); // impl
    let g = -1;
    if (this.chooseGenerics()) {
      g = this.parseGenerics();
    } else {
      g = this.parseGenerics();
    }
    this.ast.a[n] = g;
    if (this.isKw(KW_CONST)) {
      this.bump();
      this.ast.fl[n] = this.ast.fl[n] | IT_CONST;
    }
    if (this.is(T_NOT) && this.la(1) !== T_LBRACE) {
      this.bump();
      this.ast.fl[n] = this.ast.fl[n] | IT_NEGATIVE;
    }
    const ty1 = this.parseTy();
    if (this.failed) {
      return -1;
    }
    if (this.eatKw(KW_FOR)) {
      this.ast.b[n] = ty1;
      const gv38 = this.parseTy();
      this.ast.c[n] = gv38;
    } else {
      this.ast.c[n] = ty1;
    }
    this.parseWhereInto(g);
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    this.ast.x[n] = this.p;
    this.bump();
    this.parseItemListBody(n, 1);
    return this.fin(n);
  }

  parseMod(lo: i32): i32 {
    const n = this.nd(N_MOD, lo);
    this.bump(); // mod
    this.ast.d[n] = this.itemIdent();
    if (this.eat(T_SEMI)) {
      return this.fin(n);
    }
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    this.ast.x[n] = this.p;
    this.bump();
    this.ast.fl[n] = this.ast.fl[n] | IT_LOADED;
    this.parseItemListBody(n, 0);
    return this.fin(n);
  }

  parseTypeAlias(lo: i32): i32 {
    const n = this.nd(N_TYPE_ALIAS, lo);
    this.bump(); // type
    this.ast.d[n] = this.itemIdent();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    if (this.eat(T_COLON)) {
      const gv39 = this.parseBounds(true);
      this.ast.b[n] = gv39;
    }
    this.parseWhereInto(g);
    if (this.eat(T_EQ)) {
      const gv40 = this.parseTy();
      this.ast.c[n] = gv40;
      if (this.isKw(KW_WHERE)) {
        const gv41 = this.parseWhere();
        this.ast.x[n] = gv41;
      }
    }
    this.expect(T_SEMI);
    return this.fin(n);
  }

  parseConst(lo: i32): i32 {
    const n = this.nd(N_CONST, lo);
    this.bump(); // const
    if (this.tk() !== T_IDENT || (rsIsReserved(this.kw()) && this.kw() !== KW_UNDERSCORE)) {
      return this.fail();
    }
    this.ast.d[n] = this.identTok();
    const g = this.parseGenerics();
    this.ast.a[n] = g;
    if (this.eat(T_COLON)) {
      const gv42 = this.parseTy();
      this.ast.b[n] = gv42;
    } else {
      return this.fail();
    }
    if (this.eat(T_EQ)) {
      const gv43 = this.parseExpr();
      this.ast.c[n] = gv43;
    }
    this.parseWhereInto(g);
    this.expect(T_SEMI);
    return this.fin(n);
  }

  parseStatic(lo: i32, f0: i32): i32 {
    const n = this.nd(N_STATIC, lo);
    this.bump(); // static
    let f = f0;
    if (this.eatKw(KW_MUT)) {
      f = f | IT_MUT;
    }
    this.ast.fl[n] = f;
    this.ast.d[n] = this.itemIdent();
    this.expect(T_COLON);
    const gv44 = this.parseTy();
    this.ast.b[n] = gv44;
    if (this.eat(T_EQ)) {
      const gv45 = this.parseExpr();
      this.ast.c[n] = gv45;
    }
    this.expect(T_SEMI);
    return this.fin(n);
  }

  parseMacroRules(lo: i32): i32 {
    const n = this.nd(N_MACRO_DEF, lo);
    this.bump(); // macro_rules
    this.bump(); // !
    this.ast.d[n] = this.identTok();
    this.ast.fl[n] = IT_MACRO_RULES;
    const tts = this.parseTts();
    if (this.failed) {
      return -1;
    }
    this.ast.a[n] = tts;
    if (this.ast.x[tts] !== T_LBRACE) {
      this.expect(T_SEMI);
    }
    return this.fin(n);
  }

  parseMacro2(lo: i32): i32 {
    const n = this.nd(N_MACRO_DEF, lo);
    this.bump(); // macro
    this.ast.d[n] = this.identTok();
    if (this.is(T_LPAREN)) {
      const gv46 = this.parseTts();
      this.ast.b[n] = gv46;
    }
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv47 = this.parseTts();
    this.ast.a[n] = gv47;
    return this.fin(n);
  }

  // ---------------------------------------------------------------- paths

  /** A path in `style`; generic args in type style need no `::`. */
  parsePath(style: i32): i32 {
    const n = this.nd(N_PATH, this.lo());
    const mark = this.sp;
    if (this.is(T_COLONCOLON)) {
      this.bump();
      this.ast.fl[n] = PATH_GLOBAL;
    }
    this.parsePathSegments(style, n, mark);
    return n;
  }

  parsePathSegments(style: i32, n: i32, mark: i32): void {
    while (!this.failed) {
      if (!this.isPathSegIdent()) {
        this.failed = true;
        return;
      }
      const sg = this.nd(N_SEG, this.lo());
      this.ast.d[sg] = this.identTok();
      if (style === PS_TYPE) {
        if (this.is(T_COLONCOLON) && this.isLtAt(1)) {
          this.bump();
        }
        if (this.isLt()) {
          const gv48 = this.parseAngleArgs();
          this.ast.a[sg] = gv48;
        } else if (this.is(T_LPAREN)) {
          const gv49 = this.parseParenArgs();
          this.ast.a[sg] = gv49;
        }
      } else if (style === PS_EXPR) {
        if (this.is(T_COLONCOLON) && this.isLtAt(1)) {
          this.bump();
          const gv50 = this.parseAngleArgs();
          this.ast.a[sg] = gv50;
        }
      }
      this.fin(sg);
      this.push(sg);
      if (this.is(T_COLONCOLON) && this.isPathSegAt(1)) {
        this.bump();
        continue;
      }
      break;
    }
    this.endList(n, mark);
    this.fin(n);
  }

  isPathSegAt(i: i32): boolean {
    if (this.laAt(i) !== T_IDENT) {
      return false;
    }
    const k = this.laKwAt(i);
    return !rsIsReserved(k) || k === KW_SELF || k === KW_SELF_TY || k === KW_SUPER || k === KW_CRATE;
  }

  /** `<...>` generic args. */
  parseAngleArgs(): i32 {
    const g = this.nd(N_GARGS, this.lo());
    this.eatLt();
    const mark = this.sp;
    while (!this.failed && !this.isGt()) {
      this.push(this.parseGenericArg());
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    if (!this.eatGt()) {
      return this.fail();
    }
    this.endList(g, mark);
    return this.fin(g);
  }

  parseGenericArg(): i32 {
    const lo = this.lo();
    const k = this.tk();
    if (k === T_LIFETIME) {
      const l = this.nd(N_LIFETIME, lo);
      this.ast.d[l] = this.p;
      this.bump();
      return this.fin(l);
    }
    // An associated item constraint: `Ident (<args>)? (= | :)`.
    if (k === T_IDENT && !rsIsReserved(this.kw())) {
      const k1 = this.la(1);
      if ((k1 === T_EQ && this.la(2) !== T_EQ) || (k1 === T_COLON && this.la(2) !== T_COLON)) {
        return this.parseConstraint(lo, -1);
      }
      if (k1 === T_LT || k1 === T_LPAREN) {
        // Maybe `Ident<args> = ...`: try it.
        const save = this.save();
        const id = this.identTok();
        const ga = k1 === T_LT ? this.parseAngleArgs() : this.parseParenArgs();
        if (!this.failed && ((this.is(T_EQ) && this.la(1) !== T_EQ) || (this.is(T_COLON) && this.la(1) !== T_COLON))) {
          const c = this.parseConstraintRest(lo, id, ga);
          return c;
        }
        this.restore(save);
      }
    }
    if (this.isConstArgStart()) {
      return this.parseConstArg();
    }
    return this.parseTy();
  }

  isConstArgStart(): boolean {
    const k = this.tk();
    if (k === T_LBRACE) {
      return true;
    }
    if (k >= T_INT && k <= T_RCSTR) {
      return true;
    }
    if (k === T_MINUS && this.la(1) >= T_INT && this.la(1) <= T_RCSTR) {
      return true;
    }
    const kk = this.kw();
    return kk === KW_TRUE || kk === KW_FALSE;
  }

  parseConstArg(): i32 {
    if (this.is(T_LBRACE)) {
      const lo = this.lo();
      const e = this.nd(N_EX_BLOCK, lo);
      const gv51 = this.parseBlock(lo, 0);
      this.ast.a[e] = gv51;
      return this.fin(e);
    }
    if (this.isConstArgStart()) {
      return this.parseLitMaybeNeg();
    }
    // A path.
    const lo = this.lo();
    const e = this.nd(N_EX_PATH, lo);
    const gv52 = this.parsePath(PS_EXPR);
    this.ast.b[e] = gv52;
    return this.fin(e);
  }

  parseLitMaybeNeg(): i32 {
    const lo = this.lo();
    if (this.is(T_MINUS)) {
      const u = this.nd(N_EX_UNARY, lo);
      this.bump();
      this.ast.x[u] = UN_NEG;
      const gv53 = this.parseLit();
      this.ast.a[u] = gv53;
      return this.fin(u);
    }
    return this.parseLit();
  }

  parseLit(): i32 {
    const k = this.tk();
    const kk = this.kw();
    if ((k >= T_INT && k <= T_RCSTR) || kk === KW_TRUE || kk === KW_FALSE) {
      const e = this.nd(N_EX_LIT, this.lo());
      this.ast.d[e] = this.p;
      this.bump();
      return this.fin(e);
    }
    return this.fail();
  }

  parseConstraint(lo: i32, ga: i32): i32 {
    const id = this.identTok();
    return this.parseConstraintRest(lo, id, ga);
  }

  parseConstraintRest(lo: i32, id: i32, ga: i32): i32 {
    const c = this.nd(N_CONSTRAINT, lo);
    this.ast.d[c] = id;
    this.ast.a[c] = ga;
    if (this.eat(T_EQ)) {
      if (this.isConstArgStart()) {
        const gv54 = this.parseConstArg();
        this.ast.e[c] = gv54;
      } else {
        const gv55 = this.parseTy();
        this.ast.b[c] = gv55;
      }
    } else {
      this.expect(T_COLON);
      const gv56 = this.parseBounds(true);
      this.ast.c[c] = gv56;
    }
    return this.fin(c);
  }

  /** `(A, B) -> C` parenthesized args. */
  parseParenArgs(): i32 {
    const g = this.nd(N_PGARGS, this.lo());
    this.bump(); // (
    if (this.is(T_DOTDOT) && this.la(1) === T_RPAREN) {
      this.bump();
      this.bump();
      this.ast.kind[g] = N_GARGS_ELIDED;
      return this.fin(g);
    }
    // rustc 1.99 parses the inputs as params with an optional name (the
    // feature gate named_fn_trait_parameters is checked after parsing);
    // attributes and `...` there are errors.
    const mark = this.sp;
    while (!this.failed && !this.is(T_RPAREN)) {
      if (this.is(T_POUND) || this.is(T_DOTDOTDOT)) {
        this.fail();
        return -1;
      }
      this.push(this.parseParam(false, false));
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RPAREN);
    this.endList(g, mark);
    if (this.eat(T_RARROW)) {
      const gv57 = this.parseTyNoPlusOpt(false);
      this.ast.a[g] = gv57;
    }
    return this.fin(g);
  }

  /** A qualified path `<T as Trait>::rest` at `<`; answers the QSelf node and sets `qpPath` to the path. */
  qpPath: i32 = -1;

  parseQPath(style: i32): i32 {
    const lo = this.lo();
    const q = this.nd(N_QSELF, lo);
    this.eatLt();
    const gv58 = this.parseTy();
    this.ast.a[q] = gv58;
    const pa = this.nd(N_PATH, lo);
    const mark = this.sp;
    let pos = 0;
    if (this.eatKw(KW_AS)) {
      const tp = this.parsePath(PS_TYPE);
      if (this.failed) {
        return -1;
      }
      this.ast.b[q] = tp;
      // The trait's segments are the first of the full path.
      const n = this.ast.ln[tp];
      for (let i = 0; i < n; i++) {
        this.push(this.ast.kid(tp, i));
      }
      pos = n;
      if ((this.ast.fl[tp] & PATH_GLOBAL) !== 0) {
        this.ast.fl[pa] = PATH_GLOBAL;
      }
    }
    if (!this.eatGt()) {
      return this.fail();
    }
    this.ast.x[q] = pos;
    this.fin(q);
    if (!this.expect(T_COLONCOLON)) {
      return -1;
    }
    this.parsePathSegments(style, pa, mark);
    this.qpPath = pa;
    return q;
  }

  // ---------------------------------------------------------------- types

  parseTy(): i32 {
    return this.parseTyCommon(true, true);
  }

  parseTyNoPlus(): i32 {
    return this.parseTyCommon(false, true);
  }

  // Return types: plus is allowed in `->` of fn items (`impl A + B`).
  parseTyNoPlusOpt(allowPlus: boolean): i32 {
    return this.parseTyCommon(allowPlus, true);
  }

  parseTyCommon(allowPlus: boolean, allowQ: boolean): i32 {
    const lo = this.lo();
    const k = this.tk();
    const kk = this.kw();
    let ty = -1;
    if (k === T_LPAREN) {
      this.bump();
      const mark = this.sp;
      let trailing = false;
      let count = 0;
      while (!this.failed && !this.is(T_RPAREN)) {
        this.push(this.parseTy());
        count++;
        trailing = false;
        if (!this.eat(T_COMMA)) {
          break;
        }
        trailing = true;
      }
      this.expect(T_RPAREN);
      if (count === 1 && !trailing) {
        const inner = this.stk[mark];
        this.sp = mark;
        ty = this.nd(N_TY_PAREN, lo);
        this.ast.a[ty] = inner;
        this.fin(ty);
        // `(Trait) + Send`: a trait object.
        if (allowPlus && this.is(T_PLUS) && (this.ast.kind[inner] === N_TY_PATH || this.ast.kind[inner] === N_TY_DYN)) {
          return this.parseBareTraitObjectFrom(lo, ty);
        }
        return ty;
      }
      ty = this.nd(N_TY_TUP, lo);
      this.endList(ty, mark);
      return this.fin(ty);
    }
    if (k === T_NOT) {
      ty = this.nd(N_TY_NEVER, lo);
      this.bump();
      return this.fin(ty);
    }
    if (k === T_STAR) {
      ty = this.nd(N_TY_PTR, lo);
      this.bump();
      if (this.eatKw(KW_MUT)) {
        this.ast.fl[ty] = MUT;
      } else if (this.eatKw(KW_CONST)) {
        this.ast.fl[ty] = PTR_CONST;
      } else {
        return this.fail();
      }
      const gv59 = this.parseTyNoPlus();
      this.ast.a[ty] = gv59;
      return this.fin(ty);
    }
    if (k === T_LBRACKET) {
      this.bump();
      const elem = this.parseTy();
      if (this.eat(T_SEMI)) {
        ty = this.nd(N_TY_ARRAY, lo);
        this.ast.a[ty] = elem;
        const gv60 = this.parseExpr();
        this.ast.b[ty] = gv60;
      } else {
        ty = this.nd(N_TY_SLICE, lo);
        this.ast.a[ty] = elem;
      }
      this.expect(T_RBRACKET);
      return this.fin(ty);
    }
    if (k === T_AND || k === T_ANDAND) {
      ty = this.nd(N_TY_REF, lo);
      this.eatAnd();
      if (this.is(T_LIFETIME)) {
        this.ast.d[ty] = this.p;
        this.bump();
      }
      if (this.eatKw(KW_MUT)) {
        this.ast.fl[ty] = MUT;
      }
      const gv61 = this.parseTyNoPlus();
      this.ast.a[ty] = gv61;
      return this.fin(ty);
    }
    if (kk === KW_UNDERSCORE) {
      ty = this.nd(N_TY_INFER, lo);
      this.bump();
      return this.fin(ty);
    }
    if (this.isFnPtrFront()) {
      return this.parseFnPtr(lo, -1);
    }
    if (kk === KW_FOR && this.isLtAt(1)) {
      const binder = this.parseForBinder();
      if (this.isFnPtrFront()) {
        return this.parseFnPtr(lo, binder);
      }
      // `for<'a> Trait`: a bare trait object with a binder.
      const b = this.nd(N_BOUNDS, lo);
      const tb = this.nd(N_TRAIT_BOUND, lo);
      this.ast.c[tb] = binder;
      const gv62 = this.parsePath(PS_TYPE);
      this.ast.a[tb] = gv62;
      this.fin(tb);
      const mark = this.sp;
      this.push(tb);
      if (allowPlus) {
        while (this.eatPlus()) {
          if (!this.canBeginBound()) {
            break;
          }
          this.push(this.parseBound());
        }
      }
      this.endList(b, mark);
      this.fin(b);
      ty = this.nd(N_TY_DYN, lo);
      this.ast.b[ty] = b;
      return this.fin(ty);
    }
    if (kk === KW_IMPL) {
      ty = this.nd(N_TY_IMPL, lo);
      this.bump();
      const gv63 = this.parseBounds(allowPlus);
      this.ast.b[ty] = gv63;
      return this.fin(ty);
    }
    if (kk === KW_DYN && this.canBeginBoundAt1()) {
      ty = this.nd(N_TY_DYN, lo);
      this.bump();
      this.ast.fl[ty] = TY_DYN;
      const gv64 = this.parseBounds(allowPlus);
      this.ast.b[ty] = gv64;
      return this.fin(ty);
    }
    if (k === T_LT || k === T_SHL) {
      const q = this.parseQPath(PS_TYPE);
      if (this.failed) {
        return -1;
      }
      ty = this.nd(N_TY_PATH, lo);
      this.ast.a[ty] = q;
      this.ast.b[ty] = this.qpPath;
      return this.fin(ty);
    }
    if (k === T_QUESTION || (k === T_TILDE && this.laKw(1) === KW_CONST)) {
      // `?Sized` as a bare trait object (only valid in bounds; rustc parses it).
      return this.parseBareTraitObject(lo, allowPlus);
    }
    if (k === T_LIFETIME && allowPlus) {
      return this.parseBareTraitObject(lo, allowPlus);
    }
    if (this.isPathStart()) {
      const pa = this.parsePath(PS_TYPE);
      if (this.failed) {
        return -1;
      }
      if (this.is(T_NOT) && this.la(1) !== T_EQ) {
        // A type macro.
        this.bump();
        const mac = this.nd(N_MAC, lo);
        this.ast.a[mac] = pa;
        const gv65 = this.parseTts();
        this.ast.b[mac] = gv65;
        this.fin(mac);
        ty = this.nd(N_TY_MAC, lo);
        this.ast.a[ty] = mac;
        return this.fin(ty);
      }
      ty = this.nd(N_TY_PATH, lo);
      this.ast.b[ty] = pa;
      this.fin(ty);
      if (allowPlus && this.is(T_PLUS)) {
        return this.parseBareTraitObjectFrom(lo, ty);
      }
      return ty;
    }
    if (k === T_DOTDOTDOT) {
      ty = this.nd(N_TY_CVARARGS, lo);
      this.bump();
      return this.fin(ty);
    }
    return this.fail();
  }

  canBeginBoundAt1(): boolean {
    const k = this.la(1);
    if (k === T_LIFETIME || k === T_QUESTION || k === T_LPAREN || k === T_COLONCOLON || k === T_LT || k === T_TILDE) {
      return true;
    }
    if (k !== T_IDENT) {
      return false;
    }
    const kk = this.laKw(1);
    return (
      !rsIsReserved(kk) ||
      kk === KW_FOR ||
      kk === KW_SELF_TY ||
      kk === KW_SUPER ||
      kk === KW_CRATE ||
      kk === KW_SELF ||
      kk === KW_CONST ||
      kk === KW_ASYNC
    );
  }

  /** A bare trait object whose first bound is the path type (or parenthesized type) `first`. */
  parseBareTraitObjectFrom(lo: i32, first: i32): i32 {
    const b = this.nd(N_BOUNDS, lo);
    const mark = this.sp;
    let fb = -1;
    if (this.ast.kind[first] === N_TY_PAREN) {
      const inner = this.ast.a[first];
      if (this.ast.kind[inner] === N_TY_PATH && this.ast.a[inner] < 0) {
        fb = this.nd(N_TRAIT_BOUND, this.ast.lo[first]);
        this.ast.a[fb] = this.ast.b[inner];
        this.ast.hi[fb] = this.ast.hi[first];
        this.ast.fl[fb] = TB_PAREN;
      } else {
        return this.fail();
      }
    } else {
      if (this.ast.a[first] >= 0) {
        return this.fail();
      }
      fb = this.nd(N_TRAIT_BOUND, this.ast.lo[first]);
      this.ast.a[fb] = this.ast.b[first];
      this.ast.hi[fb] = this.ast.hi[first];
    }
    this.push(fb);
    while (this.eatPlus()) {
      if (!this.canBeginBound()) {
        break;
      }
      this.push(this.parseBound());
    }
    this.endList(b, mark);
    this.fin(b);
    const ty = this.nd(N_TY_DYN, lo);
    this.ast.b[ty] = b;
    return this.fin(ty);
  }

  parseBareTraitObject(lo: i32, allowPlus: boolean): i32 {
    const ty = this.nd(N_TY_DYN, lo);
    const gv66 = this.parseBounds(allowPlus);
    this.ast.b[ty] = gv66;
    return this.fin(ty);
  }

  isFnPtrFront(): boolean {
    let i = 0;
    for (;;) {
      const k = this.laKwAt(i);
      if (k === KW_FN) {
        return true;
      }
      if (k === KW_UNSAFE) {
        i++;
        continue;
      }
      if (k === KW_EXTERN) {
        i++;
        const lk = this.laAt(i);
        if (lk === T_STR || lk === T_RSTR) {
          i++;
        }
        continue;
      }
      return false;
    }
  }

  parseFnPtr(lo: i32, binder: i32): i32 {
    const ty = this.nd(N_TY_FN, lo);
    this.ast.c[ty] = binder;
    let f = 0;
    for (;;) {
      const k = this.kw();
      if (k === KW_UNSAFE) {
        f = f | FN_UNSAFE;
        this.bump();
      } else if (k === KW_EXTERN) {
        f = f | FN_EXTERN;
        this.bump();
        const gv67 = this.parseAbi();
        this.ast.x[ty] = gv67;
      } else {
        break;
      }
    }
    this.ast.fl[ty] = f;
    this.bump(); // fn
    const gv68 = this.parseFnDecl(false);
    this.ast.b[ty] = gv68;
    return this.fin(ty);
  }

  // ---------------------------------------------------------------- patterns

  /** A pattern allowing top-level alternatives, with an optional leading `|`. */
  /**
   * A pattern that may start with `|`. As in rustc, a leading `|` makes an or-pattern
   * whose span starts at the `|`, even with one alternative.
   */
  parsePatTopAlt(): i32 {
    const vlo = this.lo();
    if (!this.eatOr()) {
      return this.parsePatAlts();
    }
    const first = this.parsePatNoTopAlt();
    if (this.failed) {
      return -1;
    }
    const n = this.nd(N_PAT_OR, vlo);
    const mark = this.sp;
    this.push(first);
    while (this.isOrForPat()) {
      this.bump();
      this.push(this.parsePatNoTopAlt());
    }
    this.endList(n, mark);
    return this.fin(n);
  }

  parsePatAlts(): i32 {
    const lo = this.lo();
    const first = this.parsePatNoTopAlt();
    if (this.failed || !this.isOrForPat()) {
      return first;
    }
    const n = this.nd(N_PAT_OR, lo);
    const mark = this.sp;
    this.push(first);
    while (this.isOrForPat()) {
      this.bump();
      this.push(this.parsePatNoTopAlt());
    }
    this.endList(n, mark);
    return this.fin(n);
  }

  isOrForPat(): boolean {
    return this.tk() === T_OR;
  }

  parsePatNoTopAlt(): i32 {
    return this.parsePatRange(true);
  }

  isPatRangeEnd(): boolean {
    const k = this.tk();
    if (k >= T_INT && k <= T_RCSTR) {
      return true;
    }
    if (k === T_MINUS) {
      return true;
    }
    const kk = this.kw();
    if (kk === KW_TRUE || kk === KW_FALSE) {
      return true;
    }
    if (kk === KW_CONST && this.la(1) === T_LBRACE) {
      return true;
    }
    return this.isPathStart();
  }

  parseRangeEnd(): i32 {
    const lo = this.lo();
    if (this.isKw(KW_CONST) && this.la(1) === T_LBRACE) {
      this.bump();
      const e = this.nd(N_EX_CONST_BLOCK, lo);
      const gv69 = this.parseBlock(this.lo(), 0);
      this.ast.a[e] = gv69;
      return this.fin(e);
    }
    if (this.isPathStart()) {
      const e = this.nd(N_EX_PATH, lo);
      if (this.isLt()) {
        const gv70 = this.parseQPath(PS_EXPR);
        this.ast.a[e] = gv70;
        this.ast.b[e] = this.qpPath;
      } else {
        const gv71 = this.parsePath(PS_EXPR);
        this.ast.b[e] = gv71;
      }
      return this.fin(e);
    }
    return this.parseLitMaybeNeg();
  }

  /** Finishes a range pattern whose start expression is `start` (or -1). */
  parsePatRangeRest(lo: i32, start: i32): i32 {
    const k = this.tk();
    const n = this.nd(N_PAT_RANGE, lo);
    this.ast.a[n] = start;
    if (k === T_DOTDOTEQ) {
      this.ast.fl[n] = RANGE_CLOSED;
    } else if (k === T_DOTDOTDOT) {
      this.ast.fl[n] = RANGE_DOTDOTDOT;
    } else {
      this.ast.fl[n] = RANGE_HALF_OPEN;
    }
    this.bump();
    if (this.isPatRangeEnd() && !(k === T_DOTDOT && this.isPatTerminator())) {
      const gv72 = this.parseRangeEnd();
      this.ast.b[n] = gv72;
    }
    return this.fin(n);
  }

  isPatTerminator(): boolean {
    const k = this.tk();
    return (
      k === T_COMMA ||
      k === T_RPAREN ||
      k === T_RBRACKET ||
      k === T_RBRACE ||
      k === T_FATARROW ||
      k === T_OR ||
      k === T_EQ ||
      k === T_COLON ||
      this.kw() === KW_IF
    );
  }

  isRangeOp(): boolean {
    const k = this.tk();
    return k === T_DOTDOTEQ || k === T_DOTDOTDOT || k === T_DOTDOT;
  }

  parsePatRange(allowRange: boolean): i32 {
    const lo = this.lo();
    const k = this.tk();
    const kk = this.kw();
    let pat = -1;
    if (k === T_AND || k === T_ANDAND) {
      pat = this.nd(N_PAT_REF, lo);
      this.eatAnd();
      if (this.eatKw(KW_MUT)) {
        this.ast.fl[pat] = MUT;
      }
      const gv73 = this.parsePatRange(false);
      this.ast.a[pat] = gv73;
      return this.fin(pat);
    }
    if (k === T_LPAREN) {
      this.bump();
      const mark = this.sp;
      let count = 0;
      let trailing = false;
      while (!this.failed && !this.is(T_RPAREN)) {
        this.push(this.parsePatTopAlt());
        count++;
        trailing = false;
        if (!this.eat(T_COMMA)) {
          break;
        }
        trailing = true;
      }
      this.expect(T_RPAREN);
      if (this.failed) {
        return -1;
      }
      if (count === 1 && !trailing && this.ast.kind[this.stk[mark]] !== N_PAT_REST) {
        const inner = this.stk[mark];
        this.sp = mark;
        pat = this.nd(N_PAT_PAREN, lo);
        this.ast.a[pat] = inner;
      } else {
        pat = this.nd(N_PAT_TUPLE, lo);
        this.endList(pat, mark);
      }
      return this.fin(pat);
    }
    if (k === T_LBRACKET) {
      this.bump();
      pat = this.nd(N_PAT_SLICE, lo);
      const mark = this.sp;
      while (!this.failed && !this.is(T_RBRACKET)) {
        this.push(this.parsePatTopAlt());
        if (!this.eat(T_COMMA)) {
          break;
        }
      }
      this.expect(T_RBRACKET);
      this.endList(pat, mark);
      return this.fin(pat);
    }
    if (k === T_DOTDOT) {
      // `..` rest, or `..hi`.
      const k1 = this.la(1);
      if (
        k1 === T_COMMA ||
        k1 === T_RPAREN ||
        k1 === T_RBRACKET ||
        k1 === T_RBRACE ||
        k1 === T_OR ||
        k1 === T_FATARROW ||
        k1 === T_EOF
      ) {
        pat = this.nd(N_PAT_REST, lo);
        this.bump();
        return this.fin(pat);
      }
      return this.parsePatRangeRest(lo, -1);
    }
    if (k === T_DOTDOTEQ) {
      return this.parsePatRangeRest(lo, -1);
    }
    if (k === T_NOT) {
      pat = this.nd(N_PAT_NEVER, lo);
      this.bump();
      return this.fin(pat);
    }
    if (kk === KW_UNDERSCORE) {
      pat = this.nd(N_PAT_WILD, lo);
      this.bump();
      return this.fin(pat);
    }
    if (kk === KW_MUT || kk === KW_REF) {
      return this.parsePatIdent(lo);
    }
    if (kk === KW_BOX) {
      pat = this.nd(N_PAT_BOX, lo);
      this.bump();
      const gv74 = this.parsePatRange(false);
      this.ast.a[pat] = gv74;
      return this.fin(pat);
    }
    if (kk === KW_CONST && this.la(1) === T_LBRACE) {
      const e = this.parseRangeEnd();
      if (allowRange && this.isRangeOp()) {
        return this.parsePatRangeRest(lo, e);
      }
      pat = this.nd(N_PAT_LIT, lo);
      this.ast.a[pat] = e;
      return this.fin(pat);
    }
    if ((k >= T_INT && k <= T_RCSTR) || k === T_MINUS || kk === KW_TRUE || kk === KW_FALSE) {
      const e = this.parseLitMaybeNeg();
      if (allowRange && this.isRangeOp()) {
        return this.parsePatRangeRest(lo, e);
      }
      pat = this.nd(N_PAT_LIT, lo);
      this.ast.a[pat] = e;
      return this.fin(pat);
    }
    // An identifier binding.
    if (k === T_IDENT && this.canBeIdentPat()) {
      return this.parsePatIdent(lo);
    }
    if (this.isPathStart()) {
      let q = -1;
      let pa = -1;
      if (this.isLt()) {
        q = this.parseQPath(PS_EXPR);
        pa = this.qpPath;
      } else {
        pa = this.parsePath(PS_EXPR);
      }
      if (this.failed) {
        return -1;
      }
      if (this.is(T_NOT) && q < 0) {
        this.bump();
        const mac = this.nd(N_MAC, lo);
        this.ast.a[mac] = pa;
        const gv75 = this.parseTts();
        this.ast.b[mac] = gv75;
        this.fin(mac);
        pat = this.nd(N_PAT_MAC, lo);
        this.ast.a[pat] = mac;
        return this.fin(pat);
      }
      if (this.is(T_LPAREN)) {
        pat = this.nd(N_PAT_TUPLE_STRUCT, lo);
        this.ast.a[pat] = q;
        this.ast.b[pat] = pa;
        this.bump();
        const mark = this.sp;
        while (!this.failed && !this.is(T_RPAREN)) {
          this.push(this.parsePatTopAlt());
          if (!this.eat(T_COMMA)) {
            break;
          }
        }
        this.expect(T_RPAREN);
        this.endList(pat, mark);
        return this.fin(pat);
      }
      if (this.is(T_LBRACE)) {
        return this.parsePatStruct(lo, q, pa);
      }
      if (allowRange && this.isRangeOp()) {
        const e = this.nd(N_EX_PATH, lo);
        this.ast.a[e] = q;
        this.ast.b[e] = pa;
        this.fin(e);
        return this.parsePatRangeRest(lo, e);
      }
      pat = this.nd(N_PAT_PATH, lo);
      this.ast.a[pat] = q;
      this.ast.b[pat] = pa;
      return this.fin(pat);
    }
    return this.fail();
  }

  canBeIdentPat(): boolean {
    const kk = this.kw();
    if (rsIsReserved(kk)) {
      return false;
    }
    const k1 = this.la(1);
    return (
      k1 !== T_LPAREN &&
      k1 !== T_LBRACKET &&
      k1 !== T_COLONCOLON &&
      k1 !== T_NOT &&
      k1 !== T_LBRACE &&
      k1 !== T_DOTDOTDOT &&
      k1 !== T_DOTDOTEQ &&
      k1 !== T_DOTDOT &&
      k1 !== T_LT
    );
  }

  parsePatIdent(lo: i32): i32 {
    const pat = this.nd(N_PAT_IDENT, lo);
    let f = 0;
    if (this.eatKw(KW_REF)) {
      f = BM_REF;
      if (this.eatKw(KW_MUT)) {
        f = BM_REF_MUT;
      }
    } else if (this.eatKw(KW_MUT)) {
      f = BM_MUT;
    }
    this.ast.fl[pat] = f;
    if (this.tk() !== T_IDENT) {
      return this.fail();
    }
    this.ast.d[pat] = this.identTok();
    if (this.eat(T_AT)) {
      const gv76 = this.parsePatRange(true);
      this.ast.a[pat] = gv76;
    }
    return this.fin(pat);
  }

  parsePatStruct(lo: i32, q: i32, pa: i32): i32 {
    const pat = this.nd(N_PAT_STRUCT, lo);
    this.ast.a[pat] = q;
    this.ast.b[pat] = pa;
    this.bump(); // {
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      const am = this.sp;
      const na = this.outerAttrs();
      if (this.is(T_DOTDOT)) {
        this.bump();
        this.ast.fl[pat] = PS_REST;
        this.dropTo(am);
        break;
      }
      const flo = this.lo();
      const f = this.nd(N_PATFIELD, flo);
      if ((this.tk() === T_IDENT || this.tk() === T_INT) && this.la(1) === T_COLON) {
        this.ast.d[f] = this.p;
        this.bump();
        this.bump();
        const gv77 = this.parsePatTopAlt();
        this.ast.a[f] = gv77;
      } else {
        // Shorthand: `ref mut x`, `box x`, `x`.
        let isBox = false;
        if (this.isKw(KW_BOX)) {
          this.bump();
          isBox = true;
        }
        const plo = this.lo();
        const ip = this.nd(N_PAT_IDENT, plo);
        let bf = 0;
        if (this.eatKw(KW_REF)) {
          bf = BM_REF;
          if (this.eatKw(KW_MUT)) {
            bf = BM_REF_MUT;
          }
        } else if (this.eatKw(KW_MUT)) {
          bf = BM_MUT;
        }
        this.ast.fl[ip] = bf;
        const id = this.identTok();
        this.ast.d[ip] = id;
        this.fin(ip);
        this.ast.d[f] = id;
        if (isBox) {
          const bx = this.nd(N_PAT_BOX, flo);
          this.ast.a[bx] = ip;
          this.fin(bx);
          this.ast.a[f] = bx;
        } else {
          this.ast.a[f] = ip;
        }
        this.ast.fl[f] = SHORTHAND;
      }
      this.fin(f);
      this.setAttrs(f, am, na);
      this.push(f);
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RBRACE);
    this.endList(pat, mark);
    return this.fin(pat);
  }

  // ---------------------------------------------------------------- expressions

  parseExpr(): i32 {
    return this.parseExprRes(0);
  }

  parseExprRes(r: i32): i32 {
    const old = this.res;
    this.res = r;
    const e = this.parseExprAssoc(0);
    this.res = old;
    return e;
  }

  /** An expression with outer attributes (statement or argument position). */
  parseExprWithAttrs(): i32 {
    return this.parseExprAssoc(0);
  }

  binPrec(): i32 {
    const k = this.tk();
    if (k === T_STAR || k === T_SLASH || k === T_PERCENT) return P_PRODUCT;
    if (k === T_PLUS || k === T_MINUS) return P_SUM;
    if (k === T_SHL || k === T_SHR) return P_SHIFT;
    if (k === T_AND) return P_BITAND;
    if (k === T_CARET) return P_BITXOR;
    if (k === T_OR) return P_BITOR;
    if (
      k === T_LT &&
      this.off < 0 &&
      this.p + 1 < this.end &&
      this.t.kind[this.p + 1] === T_MINUS &&
      this.t.hi[this.p] === this.t.lo[this.p + 1]
    ) {
      // `<-` lexes as one token (the obsolete in-place arrow), not an operator.
      return -1;
    }
    if (k === T_EQEQ || k === T_NE || k === T_LT || k === T_GT || k === T_LE || k === T_GE) return P_COMPARE;
    if (k === T_ANDAND) return P_LAND;
    if (k === T_OROR) return P_LOR;
    if (k === T_DOTDOT || k === T_DOTDOTEQ || k === T_DOTDOTDOT) return P_RANGE;
    if (
      k === T_EQ ||
      k === T_PLUSEQ ||
      k === T_MINUSEQ ||
      k === T_STAREQ ||
      k === T_SLASHEQ ||
      k === T_PERCENTEQ ||
      k === T_CARETEQ ||
      k === T_ANDEQ ||
      k === T_OREQ ||
      k === T_SHLEQ ||
      k === T_SHREQ
    )
      return P_ASSIGN;
    if (this.kw() === KW_AS) return P_CAST;
    return -1;
  }

  /** Whether `e` is complete as a statement (block-like), under STMT_EXPR. */
  exprIsComplete(e: i32): boolean {
    if ((this.res & R_STMT_EXPR) === 0) {
      return false;
    }
    return this.isBlockLike(e);
  }

  isBlockLike(e: i32): boolean {
    const k = this.ast.kind[e];
    return (
      k === N_EX_IF ||
      k === N_EX_MATCH ||
      k === N_EX_BLOCK ||
      k === N_EX_WHILE ||
      k === N_EX_LOOP ||
      k === N_EX_FOR ||
      k === N_EX_TRY_BLOCK ||
      k === N_EX_CONST_BLOCK
    );
  }

  parseExprAssoc(minPrec: i32): i32 {
    const lo = this.lo();
    let lhs = -1;
    if (this.tk() === T_DOTDOT || this.tk() === T_DOTDOTEQ) {
      lhs = this.parsePrefixRange(lo);
    } else {
      lhs = this.parseExprPrefix();
    }
    if (this.failed) {
      return -1;
    }
    return this.parseExprAssocRest(minPrec, lhs, lo);
  }

  parseExprAssocRest(minPrec: i32, lhs0: i32, lo: i32): i32 {
    let lhs = lhs0;
    while (!this.failed) {
      if (this.exprIsComplete(lhs)) {
        return lhs;
      }
      const prec = this.binPrec();
      if (prec < 0 || prec < minPrec) {
        break;
      }
      const opTok = this.p;
      const k = this.tk();
      if (prec === P_CAST) {
        this.bump();
        const c = this.nd(N_EX_CAST, lo);
        this.ast.a[c] = lhs;
        const gv78 = this.parseTyNoPlus();
        this.ast.b[c] = gv78;
        lhs = this.fin(c);
        continue;
      }
      if (prec === P_COMPARE && this.ast.kind[lhs] === N_EX_BINARY && isCompareTok(this.ast.x[lhs])) {
        // rustc: comparison operators cannot be chained (an error it recovers from).
        return this.fail();
      }
      if (prec === P_RANGE) {
        if (k === T_DOTDOTDOT) {
          return this.fail(); // `...` in an expression: an error rustc recovers from
        }
        this.bump();
        const r = this.nd(N_EX_RANGE, lo);
        this.ast.a[r] = lhs;
        if (k !== T_DOTDOT) {
          this.ast.fl[r] = RANGE_CLOSED;
        }
        if (this.isRangeRhsStart()) {
          const gv79 = this.parseExprAssoc(P_RANGE + 1);
          this.ast.b[r] = gv79;
        }
        lhs = this.fin(r);
        break;
      }
      this.bump();
      // Assignment is right-associative.
      const rhs = this.parseExprAssoc(prec === P_ASSIGN ? prec : prec + 1);
      if (this.failed) {
        return -1;
      }
      let e = -1;
      if (k === T_EQ) {
        e = this.nd(N_EX_ASSIGN, lo);
      } else if (prec === P_ASSIGN) {
        e = this.nd(N_EX_ASSIGN_OP, lo);
        this.ast.x[e] = k;
      } else {
        e = this.nd(N_EX_BINARY, lo);
        this.ast.x[e] = k;
        this.ast.c[e] = opTok;
      }
      this.ast.a[e] = lhs;
      this.ast.b[e] = rhs;
      lhs = this.fin(e);
    }
    return lhs;
  }

  parsePrefixRange(lo: i32): i32 {
    const k = this.tk();
    this.bump();
    const r = this.nd(N_EX_RANGE, lo);
    if (k === T_DOTDOTEQ) {
      this.ast.fl[r] = RANGE_CLOSED;
    }
    if (this.isRangeRhsStart()) {
      const gv80 = this.parseExprAssoc(P_RANGE + 1);
      this.ast.b[r] = gv80;
    }
    return this.fin(r);
  }

  isRangeRhsStart(): boolean {
    return this.canBeginExpr() && !(this.is(T_LBRACE) && (this.res & R_NO_STRUCT) !== 0);
  }

  canBeginExpr(): boolean {
    const k = this.tk();
    if (k === T_IDENT) {
      const kk = this.kw();
      if (!rsIsReserved(kk)) {
        return true;
      }
      return (
        kk === KW_SELF ||
        kk === KW_SELF_TY ||
        kk === KW_SUPER ||
        kk === KW_CRATE ||
        kk === KW_TRUE ||
        kk === KW_FALSE ||
        kk === KW_IF ||
        kk === KW_MATCH ||
        kk === KW_LOOP ||
        kk === KW_WHILE ||
        kk === KW_FOR ||
        kk === KW_UNSAFE ||
        kk === KW_RETURN ||
        kk === KW_BREAK ||
        kk === KW_CONTINUE ||
        kk === KW_MOVE ||
        kk === KW_STATIC ||
        kk === KW_ASYNC ||
        kk === KW_YIELD ||
        kk === KW_LET ||
        kk === KW_CONST ||
        kk === KW_UNDERSCORE ||
        kk === KW_BOX ||
        kk === KW_TRY ||
        kk === KW_BECOME ||
        kk === KW_DO
      );
    }
    return (
      (k >= T_INT && k <= T_RCSTR) ||
      k === T_LIFETIME ||
      k === T_LPAREN ||
      k === T_LBRACKET ||
      k === T_LBRACE ||
      k === T_NOT ||
      k === T_MINUS ||
      k === T_STAR ||
      k === T_AND ||
      k === T_ANDAND ||
      k === T_OR ||
      k === T_OROR ||
      k === T_DOTDOT ||
      k === T_DOTDOTEQ ||
      k === T_DOTDOTDOT ||
      k === T_LT ||
      k === T_SHL ||
      k === T_COLONCOLON ||
      k === T_POUND
    );
  }

  parseExprPrefix(): i32 {
    const lo = this.lo();
    // Outer attributes on an expression.
    if (this.is(T_POUND) && this.la(1) === T_LBRACKET) {
      const am = this.sp;
      const na = this.outerAttrs();
      const e = this.parseExprPrefix();
      if (this.failed) {
        return -1;
      }
      this.setAttrs(e, am, na);
      return e;
    }
    const k = this.tk();
    if (k === T_NOT || k === T_MINUS || k === T_STAR) {
      this.bump();
      const u = this.nd(N_EX_UNARY, lo);
      this.ast.x[u] = k === T_NOT ? UN_NOT : k === T_MINUS ? UN_NEG : UN_DEREF;
      const gv81 = this.parseExprPrefix();
      this.ast.a[u] = gv81;
      return this.fin(u);
    }
    if (k === T_AND || k === T_ANDAND) {
      this.eatAnd();
      const u = this.nd(N_EX_ADDR_OF, lo);
      let f = 0;
      if (this.isKw(KW_RAW) && (this.laKw(1) === KW_CONST || this.laKw(1) === KW_MUT)) {
        this.bump();
        f = ADDR_RAW;
        if (this.eatKw(KW_MUT)) {
          f = f | MUT;
        } else {
          this.bump();
        }
      } else if (this.eatKw(KW_MUT)) {
        f = MUT;
      }
      this.ast.fl[u] = f;
      const gv82 = this.parseExprPrefix();
      this.ast.a[u] = gv82;
      return this.fin(u);
    }
    if (this.isKw(KW_BOX) && this.canBeginExprAt1()) {
      return this.fail();
    }
    const e = this.parseExprBottom();
    if (this.failed) {
      return -1;
    }
    return this.parseExprDotOrCall(e, lo);
  }

  /** Token::can_begin_type. */
  canBeginType(): boolean {
    const k = this.tk();
    if (k === T_IDENT) {
      const kk = this.kw();
      return (
        !rsIsReserved(kk) ||
        kk === KW_SELF ||
        kk === KW_SELF_TY ||
        kk === KW_SUPER ||
        kk === KW_CRATE ||
        kk === KW_UNDERSCORE ||
        kk === KW_FOR ||
        kk === KW_IMPL ||
        kk === KW_FN ||
        kk === KW_UNSAFE ||
        kk === KW_EXTERN ||
        kk === KW_TYPEOF ||
        kk === KW_DYN
      );
    }
    return (
      k === T_LPAREN ||
      k === T_LBRACKET ||
      k === T_NOT ||
      k === T_STAR ||
      k === T_AND ||
      k === T_ANDAND ||
      k === T_QUESTION ||
      k === T_LIFETIME ||
      k === T_LT ||
      k === T_SHL ||
      k === T_COLONCOLON
    );
  }

  /** Token::can_begin_pattern (PatParam). */
  canBeginPat(): boolean {
    const k = this.tk();
    return (
      k === T_IDENT ||
      (k >= T_INT && k <= T_RCSTR) ||
      k === T_LPAREN ||
      k === T_LBRACKET ||
      k === T_AND ||
      k === T_MINUS ||
      k === T_ANDAND ||
      k === T_DOTDOT ||
      k === T_DOTDOTDOT ||
      k === T_COLONCOLON ||
      k === T_LT ||
      k === T_SHL
    );
  }

  canBeginExprAt1(): boolean {
    const save = this.save();
    this.bump();
    const r = this.canBeginExpr();
    this.restore(save);
    return r;
  }

  parseExprDotOrCall(e0: i32, lo: i32): i32 {
    let e = e0;
    while (!this.failed) {
      if (this.eat(T_QUESTION)) {
        const t = this.nd(N_EX_TRY, lo);
        this.ast.a[t] = e;
        e = this.fin(t);
        continue;
      }
      if (this.eat(T_DOT)) {
        e = this.parseDotSuffix(e, lo);
        continue;
      }
      if (this.exprIsComplete(e)) {
        return e;
      }
      const k = this.tk();
      if (k === T_LPAREN) {
        const c = this.nd(N_EX_CALL, lo);
        this.ast.a[c] = e;
        this.parseCallArgs(c);
        e = this.fin(c);
        continue;
      }
      if (k === T_LBRACKET) {
        this.bump();
        const ix = this.nd(N_EX_INDEX, lo);
        this.ast.a[ix] = e;
        const gv83 = this.parseExprRes(0);
        this.ast.b[ix] = gv83;
        this.expect(T_RBRACKET);
        e = this.fin(ix);
        continue;
      }
      break;
    }
    return e;
  }

  parseCallArgs(c: i32): void {
    this.bump(); // (
    const mark = this.sp;
    while (!this.failed && !this.is(T_RPAREN)) {
      this.push(this.parseExprRes(0));
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.expect(T_RPAREN);
    this.endList(c, mark);
  }

  parseDotSuffix(e: i32, lo: i32): i32 {
    const k = this.tk();
    if (k === T_IDENT && this.kw() === KW_AWAIT) {
      this.bump();
      const a = this.nd(N_EX_AWAIT, lo);
      this.ast.a[a] = e;
      return this.fin(a);
    }
    if (k === T_INT) {
      const f = this.nd(N_EX_FIELD, lo);
      this.ast.a[f] = e;
      this.ast.d[f] = this.p;
      this.bump();
      return this.fin(f);
    }
    if (k === T_FLOAT) {
      // `x.0.1`: two field accesses from one float token.
      const ti = this.p;
      const tlo = this.t.lo[ti];
      const thi = this.t.hi[ti];
      let dot = tlo;
      while (dot < thi && toI32(this.src[dot]) !== 46) {
        dot++;
      }
      if (dot >= thi - 1) {
        return this.fail();
      }
      const f1 = this.nd(N_EX_FIELD, lo);
      this.ast.a[f1] = e;
      this.ast.d[f1] = ti;
      this.ast.x[f1] = dot; // the field name is src[tlo, dot)
      this.ast.hi[f1] = dot;
      this.bump();
      const f2 = this.nd(N_EX_FIELD, lo);
      this.ast.a[f2] = f1;
      this.ast.d[f2] = ti;
      this.ast.x[f2] = -2 - (dot + 1); // the field name is src[dot + 1, thi)
      return this.fin(f2);
    }
    if (k === T_IDENT) {
      if (this.kw() === KW_MATCH) {
        // Postfix match (unstable).
        return this.fail();
      }
      const segLo = this.lo();
      const id = this.identTok();
      let ga = -1;
      if (this.is(T_COLONCOLON) && this.isLtAt(1)) {
        this.bump();
        ga = this.parseAngleArgs();
      }
      if (this.is(T_LPAREN)) {
        const sg = this.nd(N_SEG, segLo);
        this.ast.d[sg] = id;
        this.ast.a[sg] = ga;
        this.fin(sg);
        const m = this.nd(N_EX_METHOD, lo);
        this.ast.a[m] = e;
        this.ast.b[m] = sg;
        this.ast.x[m] = this.p;
        this.parseCallArgs(m);
        return this.fin(m);
      }
      if (ga >= 0) {
        return this.fail();
      }
      const f = this.nd(N_EX_FIELD, lo);
      this.ast.a[f] = e;
      this.ast.d[f] = id;
      return this.fin(f);
    }
    return this.fail();
  }

  parseExprBottom(): i32 {
    const lo = this.lo();
    const k = this.tk();
    const kk = this.kw();
    if ((k >= T_INT && k <= T_RCSTR) || kk === KW_TRUE || kk === KW_FALSE) {
      return this.parseLit();
    }
    if (k === T_LPAREN) {
      this.bump();
      const mark = this.sp;
      let count = 0;
      let trailing = false;
      const old = this.res;
      this.res = 0;
      while (!this.failed && !this.is(T_RPAREN)) {
        this.push(this.parseExprAssoc(0));
        count++;
        trailing = false;
        if (!this.eat(T_COMMA)) {
          break;
        }
        trailing = true;
      }
      this.res = old;
      this.expect(T_RPAREN);
      if (count === 1 && !trailing) {
        const inner = this.stk[mark];
        this.sp = mark;
        const pe = this.nd(N_EX_PAREN, lo);
        this.ast.a[pe] = inner;
        return this.fin(pe);
      }
      const t = this.nd(N_EX_TUP, lo);
      this.endList(t, mark);
      return this.fin(t);
    }
    if (k === T_LBRACE) {
      return this.parseBlockExpr(lo, -1, 0);
    }
    if (k === T_OR || k === T_OROR) {
      return this.parseClosure(lo);
    }
    if (k === T_LBRACKET) {
      this.bump();
      const old = this.res;
      this.res = 0;
      if (this.eat(T_RBRACKET)) {
        this.res = old;
        const ar = this.nd(N_EX_ARRAY, lo);
        return this.fin(ar);
      }
      const first = this.parseExprAssoc(0);
      if (this.eat(T_SEMI)) {
        const rp = this.nd(N_EX_REPEAT, lo);
        this.ast.a[rp] = first;
        const gv84 = this.parseExprAssoc(0);
        this.ast.b[rp] = gv84;
        this.expect(T_RBRACKET);
        this.res = old;
        return this.fin(rp);
      }
      const ar = this.nd(N_EX_ARRAY, lo);
      const mark = this.sp;
      this.push(first);
      while (!this.failed && this.eat(T_COMMA)) {
        if (this.is(T_RBRACKET)) {
          break;
        }
        this.push(this.parseExprAssoc(0));
      }
      this.expect(T_RBRACKET);
      this.res = old;
      this.endList(ar, mark);
      return this.fin(ar);
    }
    if (k === T_LIFETIME) {
      // A label: `'a: loop`, `'a: {`.
      if (this.la(1) !== T_COLON) {
        return this.fail();
      }
      const label = this.p;
      this.bump();
      this.bump();
      const k2 = this.kw();
      if (k2 === KW_LOOP) {
        return this.parseLoop(lo, label);
      }
      if (k2 === KW_WHILE) {
        return this.parseWhile(lo, label);
      }
      if (k2 === KW_FOR) {
        return this.parseFor(lo, label);
      }
      if (this.is(T_LBRACE)) {
        return this.parseBlockExpr(lo, label, 0);
      }
      return this.fail();
    }
    if (kk === KW_MOVE || kk === KW_STATIC) {
      return this.parseClosure(lo);
    }
    if (kk === KW_IF) {
      return this.parseIf(lo);
    }
    if (kk === KW_FOR) {
      if (this.isLtAt(1)) {
        return this.parseClosure(lo);
      }
      return this.parseFor(lo, -1);
    }
    if (kk === KW_WHILE) {
      return this.parseWhile(lo, -1);
    }
    if (kk === KW_LOOP) {
      return this.parseLoop(lo, -1);
    }
    if (kk === KW_MATCH) {
      return this.parseMatch(lo);
    }
    if (kk === KW_UNSAFE) {
      this.bump();
      return this.parseBlockExpr(lo, -1, BLK_UNSAFE);
    }
    if (kk === KW_CONST) {
      if (this.la(1) === T_LBRACE) {
        this.bump();
        const cb = this.nd(N_EX_CONST_BLOCK, lo);
        const gv85 = this.parseBlock(this.lo(), 0);
        this.ast.a[cb] = gv85;
        return this.fin(cb);
      }
      return this.parseClosure(lo);
    }
    if (kk === KW_TRY && this.la(1) === T_LBRACE) {
      this.bump();
      const tb = this.nd(N_EX_TRY_BLOCK, lo);
      const gv86 = this.parseBlock(this.lo(), 0);
      this.ast.a[tb] = gv86;
      return this.fin(tb);
    }
    if (kk === KW_RETURN) {
      this.bump();
      const r = this.nd(N_EX_RET, lo);
      if (this.canBeginExpr()) {
        const gv87 = this.parseExprAssoc(0);
        this.ast.a[r] = gv87;
      }
      return this.fin(r);
    }
    if (kk === KW_CONTINUE) {
      this.bump();
      const c = this.nd(N_EX_CONTINUE, lo);
      if (this.is(T_LIFETIME)) {
        this.ast.d[c] = this.p;
        this.bump();
      }
      return this.fin(c);
    }
    if (kk === KW_BREAK) {
      this.bump();
      const b = this.nd(N_EX_BREAK, lo);
      if (this.is(T_LIFETIME) && this.la(1) !== T_COLON) {
        this.ast.d[b] = this.p;
        this.bump();
      }
      if (this.canBeginExpr() && !(this.is(T_LBRACE) && (this.res & R_NO_STRUCT) !== 0)) {
        const gv88 = this.parseExprAssoc(0);
        this.ast.a[b] = gv88;
      }
      return this.fin(b);
    }
    if (kk === KW_YIELD) {
      this.bump();
      const y = this.nd(N_EX_YIELD, lo);
      if (this.canBeginExpr()) {
        const gv89 = this.parseExprAssoc(0);
        this.ast.a[y] = gv89;
      }
      return this.fin(y);
    }
    if (kk === KW_BECOME) {
      this.bump();
      const y = this.nd(N_EX_BECOME, lo);
      const gv90 = this.parseExprAssoc(0);
      this.ast.a[y] = gv90;
      return this.fin(y);
    }
    if (kk === KW_DO && this.la(1) === T_IDENT) {
      return this.fail();
    }
    if (kk === KW_LET) {
      this.bump();
      const le = this.nd(N_EX_LET, lo);
      const gv91 = this.parsePatTopAlt();
      this.ast.a[le] = gv91;
      if (!this.expect(T_EQ)) {
        return -1;
      }
      const old = this.res;
      this.res = old & ~R_STMT_EXPR;
      // The scrutinee stops before `&&` and `||`.
      const gv92 = this.parseExprAssoc(P_COMPARE);
      this.ast.b[le] = gv92;
      this.res = old;
      return this.fin(le);
    }
    if (kk === KW_UNDERSCORE) {
      this.bump();
      const u = this.nd(N_EX_UNDERSCORE, lo);
      return this.fin(u);
    }
    if (kk === KW_ASYNC) {
      const k1 = this.laKw(1);
      if (this.la(1) === T_LBRACE || (k1 === KW_MOVE && this.la(2) === T_LBRACE)) {
        this.bump();
        const ab = this.nd(N_EX_ASYNC, lo);
        if (this.eatKw(KW_MOVE)) {
          this.ast.fl[ab] = CL_MOVE;
        }
        const gv93 = this.parseBlock(this.lo(), 0);
        this.ast.a[ab] = gv93;
        return this.fin(ab);
      }
      return this.parseClosure(lo);
    }
    if (this.isPathStart()) {
      return this.parsePathStartExpr(lo);
    }
    return this.fail();
  }

  parsePathStartExpr(lo: i32): i32 {
    let q = -1;
    let pa = -1;
    if (this.isLt()) {
      q = this.parseQPath(PS_EXPR);
      pa = this.qpPath;
    } else {
      pa = this.parsePath(PS_EXPR);
    }
    if (this.failed) {
      return -1;
    }
    if (q < 0 && this.is(T_NOT) && this.la(1) !== T_EQ) {
      const nk = this.la(1);
      if (nk === T_LPAREN || nk === T_LBRACKET || nk === T_LBRACE) {
        this.bump();
        const mac = this.nd(N_MAC, lo);
        this.ast.a[mac] = pa;
        const gv94 = this.parseTts();
        this.ast.b[mac] = gv94;
        this.fin(mac);
        const e = this.nd(N_EX_MAC, lo);
        this.ast.a[e] = mac;
        return this.fin(e);
      }
    }
    if (this.is(T_LBRACE) && (this.res & R_NO_STRUCT) === 0) {
      return this.parseStructExpr(lo, q, pa);
    }
    const e = this.nd(N_EX_PATH, lo);
    this.ast.a[e] = q;
    this.ast.b[e] = pa;
    return this.fin(e);
  }

  parseStructExpr(lo: i32, q: i32, pa: i32): i32 {
    const s = this.nd(N_EX_STRUCT, lo);
    this.ast.a[s] = q;
    this.ast.b[s] = pa;
    this.bump(); // {
    const old = this.res;
    this.res = 0;
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      if (this.is(T_DOTDOT)) {
        this.ast.e[s] = this.lo(); // the `..`
        this.bump();
        if (this.is(T_RBRACE)) {
          this.ast.fl[s] = ST_REST;
        } else {
          this.ast.fl[s] = ST_BASE;
          const gv95 = this.parseExprAssoc(0);
          this.ast.c[s] = gv95;
        }
        break;
      }
      const am = this.sp;
      const na = this.outerAttrs();
      const flo = this.lo();
      const f = this.nd(N_EXFIELD, flo);
      const tk = this.tk();
      if (tk === T_IDENT && this.off < 0 && rsIsReserved(this.kw())) {
        // parse_field_name: a keyword (`_` too) is not a field name.
        this.failed = true;
        break;
      }
      if ((tk === T_IDENT || tk === T_INT) && this.la(1) === T_COLON) {
        this.ast.d[f] = this.p;
        this.bump();
        this.bump();
        const gv96 = this.parseExprAssoc(0);
        this.ast.a[f] = gv96;
      } else if (tk === T_IDENT) {
        // Shorthand.
        const pe = this.nd(N_EX_PATH, flo);
        const pp = this.nd(N_PATH, flo);
        const sg = this.nd(N_SEG, flo);
        this.ast.d[f] = this.p;
        this.ast.d[sg] = this.identTok();
        this.fin(sg);
        const m2 = this.sp;
        this.push(sg);
        this.endList(pp, m2);
        this.fin(pp);
        this.ast.b[pe] = pp;
        this.fin(pe);
        this.ast.a[f] = pe;
        this.ast.fl[f] = SHORTHAND;
      } else {
        this.failed = true;
        break;
      }
      this.fin(f);
      this.setAttrs(f, am, na);
      this.push(f);
      if (!this.eat(T_COMMA)) {
        break;
      }
    }
    this.res = old;
    this.expect(T_RBRACE);
    this.endList(s, mark);
    return this.fin(s);
  }

  parseClosure(lo: i32): i32 {
    const c = this.nd(N_EX_CLOSURE, lo);
    let f = 0;
    if (this.isKw(KW_FOR) && this.isLtAt(1)) {
      const gv97 = this.parseForBinder();
      this.ast.c[c] = gv97;
    }
    if (this.eatKw(KW_CONST)) {
      f = f | CL_CONST;
    }
    if (this.eatKw(KW_STATIC)) {
      f = f | CL_STATIC;
    }
    if (this.eatKw(KW_ASYNC)) {
      f = f | CL_ASYNC;
    }
    if (this.eatKw(KW_MOVE)) {
      f = f | CL_MOVE;
    }
    this.ast.fl[c] = f;
    const decl = this.nd(N_FNDECL, this.lo());
    this.ast.x[c] = this.p;
    const mark = this.sp;
    if (this.eat(T_OROR)) {
      // No parameters.
    } else {
      if (!this.expect(T_OR)) {
        return -1;
      }
      while (!this.failed && !this.is(T_OR)) {
        const plo = this.lo();
        const am = this.sp;
        const na = this.outerAttrs();
        const pn = this.nd(N_PARAM, plo);
        const pat = this.parsePatNoTopAlt();
        this.ast.a[pn] = pat;
        if (this.eat(T_COLON)) {
          const gv98 = this.parseTy();
          this.ast.b[pn] = gv98;
        } else if (pat >= 0) {
          const it = this.nd(N_TY_INFER, this.ast.lo[pat]);
          this.ast.hi[it] = this.ast.hi[pat];
          this.ast.b[pn] = it;
        }
        this.fin(pn);
        this.setAttrs(pn, am, na);
        this.push(pn);
        if (!this.eat(T_COMMA)) {
          break;
        }
      }
      if (!this.expect(T_OR)) {
        return -1;
      }
    }
    this.endList(decl, mark);
    const old = this.res;
    if (this.eat(T_RARROW)) {
      const gv99 = this.parseTyNoPlus();
      this.ast.a[decl] = gv99;
      this.fin(decl);
      if (!this.is(T_LBRACE)) {
        return this.fail();
      }
      this.res = old & ~(R_STMT_EXPR | R_ALLOW_LET);
      const gv100 = this.parseBlockExpr(this.lo(), -1, 0);
      this.ast.a[c] = gv100;
      this.res = old;
      if (!this.failed && this.lastBlockInner > 0) {
        return this.fail(); // parse_simple_block: no inner attributes
      }
    } else {
      this.fin(decl);
      this.res = old & ~(R_STMT_EXPR | R_ALLOW_LET);
      const gv101 = this.parseExprAssoc(0);
      this.ast.a[c] = gv101;
      this.res = old;
    }
    this.ast.b[c] = decl;
    return this.fin(c);
  }

  parseCond(): i32 {
    const e = this.parseExprRes(R_NO_STRUCT | R_ALLOW_LET);
    if (!this.failed && this.t.edition < 2024 && this.ast.kind[e] === N_EX_BINARY && this.hasLetInAndChain(e)) {
      // CondChecker: let chains are only allowed in Rust 2024 or later.
      return this.fail();
    }
    return e;
  }

  hasLetInAndChain(e: i32): boolean {
    const k = this.ast.kind[e];
    if (k === N_EX_LET) {
      return true;
    }
    if (k === N_EX_BINARY && this.ast.x[e] === T_ANDAND) {
      return this.hasLetInAndChain(this.ast.a[e]) || this.hasLetInAndChain(this.ast.b[e]);
    }
    return false;
  }

  parseIf(lo: i32): i32 {
    const n = this.nd(N_EX_IF, lo);
    this.bump(); // if
    const gv102 = this.parseCond();
    this.ast.a[n] = gv102;
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv103 = this.parseBlock(this.lo(), 0);
    this.ast.b[n] = gv103;
    // parse_block: an inner attribute is not permitted in an `if` or `else` block.
    if (!this.failed && this.lastBlockInner > 0) {
      return this.fail();
    }
    if (this.isKw(KW_ELSE)) {
      this.bump();
      const elo = this.lo();
      if (this.isKw(KW_IF)) {
        const gv104 = this.parseIf(elo);
        this.ast.c[n] = gv104;
      } else if (this.is(T_LBRACE)) {
        const gv105 = this.parseBlockExpr(elo, -1, 0);
        this.ast.c[n] = gv105;
        if (!this.failed && this.lastBlockInner > 0) {
          return this.fail();
        }
      } else {
        return this.fail();
      }
    }
    return this.fin(n);
  }

  parseWhile(lo: i32, label: i32): i32 {
    const n = this.nd(N_EX_WHILE, lo);
    this.ast.d[n] = label;
    this.bump(); // while
    const gv106 = this.parseCond();
    this.ast.a[n] = gv106;
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv107 = this.parseBlock(this.lo(), 0);
    this.ast.b[n] = gv107;
    return this.fin(n);
  }

  parseLoop(lo: i32, label: i32): i32 {
    const n = this.nd(N_EX_LOOP, lo);
    this.ast.d[n] = label;
    this.bump(); // loop
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv108 = this.parseBlock(this.lo(), 0);
    this.ast.b[n] = gv108;
    return this.fin(n);
  }

  parseFor(lo: i32, label: i32): i32 {
    const n = this.nd(N_EX_FOR, lo);
    this.ast.d[n] = label;
    this.bump(); // for
    if (this.isKw(KW_AWAIT)) {
      this.bump();
      this.ast.fl[n] = FOR_AWAIT;
    }
    const gv109 = this.parsePatTopAlt();
    this.ast.a[n] = gv109;
    if (!this.eatKw(KW_IN)) {
      return this.fail();
    }
    const gv110 = this.parseExprRes(R_NO_STRUCT);
    this.ast.b[n] = gv110;
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    const gv111 = this.parseBlock(this.lo(), 0);
    this.ast.c[n] = gv111;
    return this.fin(n);
  }

  parseMatch(lo: i32): i32 {
    const n = this.nd(N_EX_MATCH, lo);
    this.bump(); // match
    const gv112 = this.parseExprRes(R_NO_STRUCT);
    this.ast.a[n] = gv112;
    if (!this.is(T_LBRACE)) {
      return this.fail();
    }
    this.ast.x[n] = this.p;
    this.bump();
    const am = this.sp;
    const na = this.innerAttrs();
    const innerKids = this.ast.addKids(this.stk, am, am + na);
    this.sp = am;
    const mark = this.sp;
    const old = this.res;
    while (!this.failed && !this.is(T_RBRACE)) {
      const aam = this.sp;
      const ana = this.outerAttrs();
      const alo = this.lo();
      const arm = this.nd(N_ARM, alo);
      this.res = 0;
      const gv113 = this.parsePatTopAlt();
      this.ast.a[arm] = gv113;
      if (this.eatKw(KW_IF)) {
        // expect_match_arm_guard_cond: let chains are allowed in a guard at
        // every edition (LetChainsPolicy::AlwaysAllowed).
        const gv114 = this.parseExprRes(R_ALLOW_LET);
        this.ast.b[arm] = gv114;
      }
      if (this.failed) {
        break;
      }
      if (!this.expect(T_FATARROW)) {
        break;
      }
      const body = this.parseExprRes(R_STMT_EXPR);
      if (this.failed) {
        break;
      }
      this.ast.c[arm] = body;
      this.fin(arm);
      this.setAttrs(arm, aam, ana);
      this.push(arm);
      const requireComma = !this.isBlockLike(body) && !this.is(T_RBRACE);
      if (requireComma) {
        if (!this.expect(T_COMMA)) {
          break;
        }
      } else {
        this.eat(T_COMMA);
      }
    }
    this.res = old;
    this.expect(T_RBRACE);
    this.endList(n, mark);
    this.innerOf(n, innerKids, na);
    return this.fin(n);
  }

  // ---------------------------------------------------------------- blocks and statements

  parseBlockExpr(lo: i32, label: i32, rules: i32): i32 {
    const e = this.nd(N_EX_BLOCK, lo);
    this.ast.d[e] = label;
    const gv115 = this.parseBlock(lo, rules);
    this.ast.a[e] = gv115;
    return this.fin(e);
  }

  /** A block at `{`; its span starts at `lo` (the `unsafe` or label before it, if any). */
  parseBlock(lo: i32, rules: i32): i32 {
    const b = this.nd(N_BLOCK, lo);
    this.ast.fl[b] = rules;
    if (!this.expect(T_LBRACE)) {
      return -1;
    }
    const old = this.res;
    this.res = 0;
    const am = this.sp;
    const na = this.innerAttrs();
    const innerKids = this.ast.addKids(this.stk, am, am + na);
    this.sp = am;
    const mark = this.sp;
    while (!this.failed && !this.is(T_RBRACE)) {
      if (this.is(T_EOF)) {
        this.failed = true;
        break;
      }
      const s = this.parseFullStmt();
      if (this.failed) {
        break;
      }
      if (s >= 0) {
        this.push(s);
      }
    }
    this.res = old;
    this.expect(T_RBRACE);
    this.endList(b, mark);
    this.innerOf(b, innerKids, na);
    this.lastBlockInner = na;
    return this.fin(b);
  }

  isItemStartForStmt(): boolean {
    const k = this.kw();
    if (k === KW_PUB) {
      return true;
    }
    if (k === KW_USE) {
      return true;
    }
    if (this.isFnFront()) {
      return true;
    }
    if (
      k === KW_EXTERN ||
      k === KW_MOD ||
      k === KW_TRAIT ||
      k === KW_TYPE ||
      k === KW_ENUM ||
      k === KW_STRUCT ||
      k === KW_IMPL
    ) {
      return true;
    }
    if (k === KW_UNSAFE) {
      const k1 = this.laKw(1);
      return k1 === KW_IMPL || k1 === KW_TRAIT || k1 === KW_AUTO || k1 === KW_EXTERN || k1 === KW_MOD;
    }
    if (k === KW_CONST) {
      const k1 = this.la(1);
      return !(k1 === T_LBRACE || k1 === T_OR || k1 === T_OROR || this.laKw(1) === KW_MOVE);
    }
    if (k === KW_STATIC) {
      const k1 = this.la(1);
      return !(k1 === T_OR || k1 === T_OROR || this.laKw(1) === KW_MOVE || this.laKw(1) === KW_ASYNC);
    }
    if (k === KW_UNION && this.laIsIdent(1)) {
      return true;
    }
    if (k === KW_AUTO && this.laKw(1) === KW_TRAIT) {
      return true;
    }
    if (k === KW_MACRO_RULES && this.la(1) === T_NOT && this.la(2) === T_IDENT) {
      return true;
    }
    if (k === KW_MACRO && this.la(1) === T_IDENT) {
      return true;
    }
    if (k === KW_DEFAULT && this.la(1) === T_IDENT) {
      const k1 = this.laKw(1);
      return k1 === KW_FN || k1 === KW_IMPL || k1 === KW_UNSAFE || k1 === KW_TYPE || k1 === KW_CONST;
    }
    return false;
  }

  /** Whether the current token starts a path that is not an item (rustc's check for `parse_stmt_path_start`). */
  isStmtPathStart(): boolean {
    if (this.isLt()) {
      return false; // a qualified path goes through the expression parser
    }
    if (!this.isPathStart()) {
      return false;
    }
    const k = this.kw();
    if (k === KW_UNION && this.laIsIdent(1)) {
      return false;
    }
    if (k === KW_AUTO && this.laKw(1) === KW_TRAIT) {
      return false;
    }
    if (k === KW_MACRO_RULES && this.la(1) === T_NOT && this.la(2) === T_IDENT) {
      return false;
    }
    return true;
  }

  /** A statement with its trailing semicolon; answers -1 when there is none (`failed` tells errors). */
  parseFullStmt(): i32 {
    const am = this.sp;
    const na = this.outerAttrs();
    if (this.failed) {
      return -1;
    }
    const lo = this.lo();
    let s = -1;
    if (this.isKw(KW_LET)) {
      s = this.nd(N_LOCAL, lo);
      this.bump();
      const gv116 = this.parsePatTopAlt();
      this.ast.a[s] = gv116;
      if (!this.failed && this.ast.kind[gv116] === N_PAT_OR) {
        return this.fail(); // `let` bindings require top-level or-patterns in parentheses
      }
      if (this.eat(T_COLON)) {
        const gv117 = this.parseTy();
        this.ast.b[s] = gv117;
      }
      if (this.eat(T_EQ)) {
        const gv118 = this.parseExprRes(0);
        this.ast.c[s] = gv118;
        if (this.isKw(KW_ELSE)) {
          this.bump();
          if (!this.is(T_LBRACE)) {
            return this.fail();
          }
          const gv119 = this.parseBlock(this.lo(), 0);
          this.ast.x[s] = gv119;
          if (!this.failed && this.lastBlockInner > 0) {
            return this.fail(); // parse_block: no inner attributes in a let-else block
          }
        }
      }
      if (!this.expect(T_SEMI)) {
        return -1;
      }
      this.fin(s);
      this.setAttrs(s, am, na);
      return s;
    }
    if (this.isStmtPathStart() && !this.isItemStartForStmt()) {
      s = this.parseStmtPathStart(lo);
    } else if (this.isItemStartForStmt()) {
      const it = this.parseItemAfterAttrs(false, false);
      if (this.failed) {
        return -1;
      }
      if (it < 0) {
        return this.fail();
      }
      this.setAttrs(it, am, na);
      s = this.nd(N_STMT_ITEM, this.ast.lo[it]);
      this.ast.a[s] = it;
      this.ast.hi[s] = this.ast.hi[it];
      return s;
    } else if (this.is(T_SEMI)) {
      s = this.nd(N_STMT_EMPTY, lo);
      this.bump();
      this.fin(s);
      this.dropTo(am);
      if (na > 0) {
        return this.fail();
      }
      return s;
    } else {
      const old = this.res;
      this.res = R_STMT_EXPR;
      const e = this.parseExprAssoc(0);
      this.res = old;
      if (this.failed) {
        return -1;
      }
      s = this.nd(N_STMT_EXPR, lo);
      this.ast.a[s] = e;
      this.ast.hi[s] = this.ast.hi[e];
    }
    if (this.failed) {
      return -1;
    }
    // The trailing semicolon.
    const sk = this.ast.kind[s];
    if (sk === N_STMT_EXPR) {
      const e = this.ast.a[s];
      if (this.eat(T_SEMI)) {
        this.ast.kind[s] = N_STMT_SEMI;
      } else if (!this.isBlockLike(e) && !this.is(T_RBRACE) && !this.is(T_EOF)) {
        return this.fail();
      }
      // Outer attributes of an expression statement are the expression's.
      this.setAttrs(e, am, na);
    } else if (sk === N_STMT_MAC) {
      if (this.eat(T_SEMI)) {
        this.ast.fl[s] = MS_SEMI;
      } else if ((this.ast.fl[s] & MS_BRACES) !== 0) {
        // `m! {}` needs no semicolon.
      } else if (!this.is(T_RBRACE) && !this.is(T_EOF)) {
        return this.fail();
      }
      this.setAttrs(s, am, na);
    } else {
      this.setAttrs(s, am, na);
    }
    this.ast.hi[s] = this.ph;
    return s;
  }

  parseStmtPathStart(lo: i32): i32 {
    const pa = this.parsePath(PS_EXPR);
    if (this.failed) {
      return -1;
    }
    if (this.is(T_NOT) && this.la(1) !== T_EQ) {
      const nk = this.la(1);
      if (nk === T_LPAREN || nk === T_LBRACKET || nk === T_LBRACE) {
        this.bump();
        const mac = this.nd(N_MAC, lo);
        this.ast.a[mac] = pa;
        const tts = this.parseTts();
        this.ast.b[mac] = tts;
        this.fin(mac);
        const braces = this.ast.x[tts] === T_LBRACE;
        const t = this.tk();
        if ((braces && t !== T_DOT && t !== T_QUESTION) || t === T_SEMI || t === T_EOF) {
          const s = this.nd(N_STMT_MAC, lo);
          this.ast.a[s] = mac;
          this.ast.fl[s] = braces ? MS_BRACES : MS_NOBRACES;
          return this.fin(s);
        }
        const me = this.nd(N_EX_MAC, lo);
        this.ast.a[me] = mac;
        this.fin(me);
        const old = this.res;
        this.res = R_STMT_EXPR;
        const e1 = this.parseExprDotOrCall(me, lo);
        const e2 = this.parseExprAssocRest(0, e1, lo);
        this.res = old;
        const s = this.nd(N_STMT_EXPR, lo);
        this.ast.a[s] = e2;
        return this.fin(s);
      }
    }
    let e = -1;
    if (this.is(T_LBRACE)) {
      e = this.parseStructExpr(lo, -1, pa);
    } else {
      e = this.nd(N_EX_PATH, lo);
      this.ast.b[e] = pa;
      this.fin(e);
    }
    const old = this.res;
    this.res = R_STMT_EXPR;
    const e1 = this.parseExprDotOrCall(e, lo);
    const e2 = this.parseExprAssocRest(0, e1, lo);
    this.res = old;
    const s = this.nd(N_STMT_EXPR, lo);
    this.ast.a[s] = e2;
    return this.fin(s);
  }

  /** Moves the inner attributes recorded by `innerOf` onto their nodes, after the outer ones. */
  finishInnerAttrs(): void {
    const k = this.nInner;
    for (let i = 0; i < k; i++) {
      const n = this.innerNode[i];
      const s = this.innerS[i];
      const c = this.innerN[i];
      const on = this.ast.atn[n];
      const os = this.ast.ats[n];
      const start = this.ast.nk;
      this.ast.kids = growI32(this.ast.kids, start + on + c);
      for (let j = 0; j < on; j++) {
        this.ast.kids[start + j] = this.ast.kids[os + j];
      }
      for (let j = 0; j < c; j++) {
        this.ast.kids[start + on + j] = this.ast.kids[s + j];
      }
      this.ast.nk = start + on + c;
      this.ast.ats[n] = start;
      this.ast.atn[n] = on + c;
    }
  }
}
