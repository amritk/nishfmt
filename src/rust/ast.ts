// The parts of rustc_ast that rustfmt reads, as one table of nodes in
// parallel arrays. Every node has a kind, a byte span [lo, hi) as rustc's
// parser gives it, five child or data fields (a..e, -1 when absent), an
// extra field x, flags, one list of children (ls/ln into `kids`) and its
// outer attributes (ats/atn into `kids`). The layout of each kind is in the
// comment by its constant.
//
// Ported from rustc_ast (MIT OR Apache-2.0, Copyright The Rust Project
// Developers), for rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust
// Project Developers).

import { growI32, newI32s } from "../core/arr";
import { fault } from "../core/fault";

// ---- Crate, attributes, visibility, macros
export const N_CRATE: i32 = 1; // list: items; attrs: inner attributes
export const N_ATTR: i32 = 2; // a: path, b: N_TTS args or -1, c: `= expr` value; fl: AT_*; x: doc token
export const N_VIS: i32 = 3; // a: path (restricted); fl: VIS_*
export const N_TTS: i32 = 4; // delimited token trees; a: open token, b: close token, x: delimiter token kind
export const N_MAC: i32 = 5; // a: path, b: N_TTS
export const N_LIFETIME: i32 = 6; // d: token
export const N_LABEL: i32 = 7; // d: token

// ---- Items
export const N_FN: i32 = 10; // a: generics, b: N_FNDECL, c: body block, d: ident, e: vis; x: abi token; fl: FN_*
export const N_STRUCT: i32 = 11; // a: generics, b: N_VDATA, d: ident, e: vis
export const N_UNION: i32 = 12; // as N_STRUCT
export const N_ENUM: i32 = 13; // a: generics, d: ident, e: vis; list: N_VARIANT
export const N_TRAIT: i32 = 14; // a: generics, b: N_BOUNDS, d: ident, e: vis; list: items; fl: IT_UNSAFE, IT_AUTO, IT_CONST
export const N_TRAIT_ALIAS: i32 = 15; // a: generics, b: N_BOUNDS, d: ident, e: vis
export const N_IMPL: i32 = 16; // a: generics, b: trait path ty or -1, c: self ty, e: vis; list: items; fl: IT_*
export const N_MOD: i32 = 17; // d: ident, e: vis; list: items; fl: IT_LOADED (has a body), IT_UNSAFE; x: `{` token
export const N_USE: i32 = 18; // a: N_USE_TREE, e: vis
export const N_EXTERN_CRATE: i32 = 19; // d: ident, c: original name token or -1, e: vis
export const N_FOREIGN_MOD: i32 = 20; // x: abi token or -1, e: vis; list: items; fl: IT_UNSAFE; b: `{` token
export const N_TYPE_ALIAS: i32 = 21; // a: generics, b: N_BOUNDS or -1, c: ty or -1, d: ident, e: vis; x: where clause after `=` or -1; fl: IT_DEFAULT
export const N_CONST: i32 = 22; // a: generics, b: ty, c: expr or -1, d: ident, e: vis; fl: IT_DEFAULT
export const N_STATIC: i32 = 23; // b: ty, c: expr or -1, d: ident, e: vis; fl: IT_MUT, IT_UNSAFE, IT_SAFE
export const N_MACRO_DEF: i32 = 24; // d: ident, a: N_TTS body, e: vis; fl: IT_MACRO_RULES; b: N_TTS params for `macro`
export const N_MAC_ITEM: i32 = 25; // a: N_MAC; fl: IT_SEMI when the item ends with `;`
export const N_USE_TREE: i32 = 26; // a: prefix N_PATH, d: rename token or -1; fl: UT_*; list: nested N_USE_TREE

// ---- Item parts
export const N_GENERICS: i32 = 30; // list: N_GPARAM; a: N_WHERE (always); span: `<...>` or empty
export const N_GPARAM: i32 = 31; // d: ident or lifetime token, b: N_BOUNDS or -1, a: const ty, c: default; fl: GP_*; x: colon token or -1
export const N_WHERE: i32 = 32; // list: predicates; fl: WH_HAS_WHERE
export const N_WPRED_BOUND: i32 = 33; // a: bounded ty, b: N_BOUNDS, c: N_GPARAMS (for<..>) or -1
export const N_WPRED_REGION: i32 = 34; // d: lifetime token, b: N_BOUNDS
export const N_WPRED_EQ: i32 = 35; // a: lhs ty, b: rhs ty
export const N_BOUNDS: i32 = 36; // list: N_TRAIT_BOUND, N_LIFETIME, N_USE_BOUND
export const N_TRAIT_BOUND: i32 = 37; // a: path, c: N_GPARAMS or -1; fl: TB_*
export const N_USE_BOUND: i32 = 38; // list: args (N_LIFETIME / N_TY_PATH)
export const N_GPARAMS: i32 = 39; // list: N_GPARAM (a `for<...>` binder)
export const N_VDATA: i32 = 40; // list: N_FIELD; fl: VD_STRUCT, VD_TUPLE, VD_UNIT
export const N_FIELD: i32 = 41; // d: ident or -1, a: ty, e: vis, b: mut restriction path or -1, c: default expr; fl: FD_*
export const N_VARIANT: i32 = 42; // d: ident, b: N_VDATA, c: discriminant expr or -1, e: vis
export const N_FNDECL: i32 = 43; // list: N_PARAM; a: return ty or -1
export const N_PARAM: i32 = 44; // a: pat, b: ty; fl: PA_*; d: lifetime token for `&'a self`

// ---- Types
export const N_TY_PATH: i32 = 50; // a: N_QSELF or -1, b: path
export const N_TY_REF: i32 = 51; // a: ty, d: lifetime token or -1; fl: MUT
export const N_TY_PTR: i32 = 52; // a: ty; fl: MUT
export const N_TY_SLICE: i32 = 53; // a: ty
export const N_TY_ARRAY: i32 = 54; // a: ty, b: expr
export const N_TY_TUP: i32 = 55; // list: tys
export const N_TY_PAREN: i32 = 56; // a: ty
export const N_TY_FN: i32 = 57; // c: N_GPARAMS or -1, b: N_FNDECL; x: abi token or -1; fl: FN_UNSAFE, FN_EXTERN
export const N_TY_NEVER: i32 = 58;
export const N_TY_INFER: i32 = 59;
export const N_TY_IMPLICIT_SELF: i32 = 60;
export const N_TY_IMPL: i32 = 61; // b: N_BOUNDS
export const N_TY_DYN: i32 = 62; // b: N_BOUNDS; fl: TY_DYN when written with `dyn`
export const N_TY_MAC: i32 = 63; // a: N_MAC
export const N_TY_CVARARGS: i32 = 64;
export const N_QSELF: i32 = 65; // a: ty, x: position (segments of the path that belong to the trait); b: `as` path or -1
export const N_TY_PAT: i32 = 66;

// ---- Paths
export const N_PATH: i32 = 70; // list: N_SEG; fl: PATH_GLOBAL
export const N_SEG: i32 = 71; // d: ident token, a: generic args or -1
export const N_GARGS: i32 = 72; // angle-bracketed; list: tys, N_LIFETIME, const exprs, N_CONSTRAINT
export const N_PGARGS: i32 = 73; // parenthesized; list: N_PARAM inputs; a: output ty or -1
export const N_CONSTRAINT: i32 = 74; // d: ident, a: generic args or -1, b: ty (`= Ty`) or -1, c: N_BOUNDS or -1, e: const expr
export const N_GARGS_ELIDED: i32 = 75; // `(..)`

// ---- Patterns
export const N_PAT_WILD: i32 = 80;
export const N_PAT_IDENT: i32 = 81; // d: ident token, a: sub pattern or -1; fl: BM_REF, BM_MUT, BM_REF_MUT
export const N_PAT_STRUCT: i32 = 82; // a: qself or -1, b: path; list: N_PATFIELD; fl: PS_REST
export const N_PAT_TUPLE_STRUCT: i32 = 83; // a: qself or -1, b: path; list: pats
export const N_PAT_OR: i32 = 84; // list: pats
export const N_PAT_PATH: i32 = 85; // a: qself or -1, b: path
export const N_PAT_TUPLE: i32 = 86; // list: pats
export const N_PAT_BOX: i32 = 87; // a: pat
export const N_PAT_DEREF: i32 = 88; // a: pat
export const N_PAT_REF: i32 = 89; // a: pat; fl: MUT
export const N_PAT_LIT: i32 = 90; // a: expr
export const N_PAT_RANGE: i32 = 91; // a: lo expr or -1, b: hi expr or -1; fl: RANGE_CLOSED (..=), RANGE_DOTDOTDOT (...)
export const N_PAT_SLICE: i32 = 92; // list: pats
export const N_PAT_REST: i32 = 93;
export const N_PAT_NEVER: i32 = 94;
export const N_PAT_PAREN: i32 = 95; // a: pat
export const N_PAT_MAC: i32 = 96; // a: N_MAC
export const N_PATFIELD: i32 = 97; // d: ident token, a: pat; fl: SHORTHAND

// ---- Expressions
export const N_EX_ARRAY: i32 = 100; // list: exprs
export const N_EX_CONST_BLOCK: i32 = 101; // a: block
export const N_EX_CALL: i32 = 102; // a: callee; list: args
export const N_EX_METHOD: i32 = 103; // a: receiver, b: N_SEG; list: args; x: `(` token
export const N_EX_TUP: i32 = 104; // list: exprs
export const N_EX_BINARY: i32 = 105; // a, b; x: operator token kind; c: operator token
export const N_EX_UNARY: i32 = 106; // a; x: UN_*
export const N_EX_LIT: i32 = 107; // d: token
export const N_EX_CAST: i32 = 108; // a: expr, b: ty
export const N_EX_LET: i32 = 109; // a: pat, b: expr
export const N_EX_IF: i32 = 110; // a: cond, b: block, c: else expr or -1
export const N_EX_WHILE: i32 = 111; // a: cond, b: block, d: label token or -1
export const N_EX_FOR: i32 = 112; // a: pat, b: iter, c: block, d: label token or -1; fl: FOR_AWAIT
export const N_EX_LOOP: i32 = 113; // b: block, d: label token or -1
export const N_EX_MATCH: i32 = 114; // a: scrutinee; list: N_ARM; x: `{` token; fl: MATCH_POSTFIX
export const N_EX_CLOSURE: i32 = 115; // a: body, b: N_FNDECL, c: N_GPARAMS (binder) or -1; fl: CL_*; x: `|` token (start of params)
export const N_EX_BLOCK: i32 = 116; // a: block, d: label token or -1
export const N_EX_ASYNC: i32 = 117; // ExprKind::Gen. a: block; fl: CL_MOVE, CL_USE, CL_GEN (`gen`, with CL_ASYNC `async gen`; neither: `async`)
export const N_EX_AWAIT: i32 = 118; // a
export const N_EX_TRY_BLOCK: i32 = 119; // a: block
export const N_EX_ASSIGN: i32 = 120; // a, b
export const N_EX_ASSIGN_OP: i32 = 121; // a, b; x: operator token kind
export const N_EX_FIELD: i32 = 122; // a: expr, d: ident token; x: byte span end override for split floats
export const N_EX_INDEX: i32 = 123; // a, b
export const N_EX_RANGE: i32 = 124; // a or -1, b or -1; fl: RANGE_CLOSED
export const N_EX_UNDERSCORE: i32 = 125;
export const N_EX_PATH: i32 = 126; // a: qself or -1, b: path
export const N_EX_ADDR_OF: i32 = 127; // a; fl: MUT, ADDR_RAW
export const N_EX_BREAK: i32 = 128; // d: label token or -1, a: expr or -1
export const N_EX_CONTINUE: i32 = 129; // d: label token or -1
export const N_EX_RET: i32 = 130; // a or -1
export const N_EX_MAC: i32 = 131; // a: N_MAC
export const N_EX_STRUCT: i32 = 132; // a: qself or -1, b: path, c: base expr or -1; list: N_EXFIELD; fl: ST_REST (`..` with no base), ST_BASE
export const N_EX_REPEAT: i32 = 133; // a: expr, b: count expr
export const N_EX_PAREN: i32 = 134; // a
export const N_EX_TRY: i32 = 135; // a
export const N_EX_YIELD: i32 = 136; // a or -1
export const N_EX_YEET: i32 = 137; // a or -1
export const N_EX_BECOME: i32 = 138; // a
export const N_EX_GEN: i32 = 139;
export const N_EXFIELD: i32 = 140; // d: ident token, a: expr; fl: SHORTHAND
export const N_ARM: i32 = 141; // a: pat, b: guard or -1, c: body or -1
export const N_EX_TYPE_ASCRIPTION: i32 = 142;

// ---- Blocks and statements
export const N_BLOCK: i32 = 150; // list: stmts; fl: BLK_UNSAFE; attrs: inner attributes
export const N_LOCAL: i32 = 151; // a: pat, b: ty or -1, c: init or -1, x: else block or -1; fl: LOCAL_SUPER
export const N_STMT_ITEM: i32 = 152; // a: item
export const N_STMT_EXPR: i32 = 153; // a: expr (no semicolon)
export const N_STMT_SEMI: i32 = 154; // a: expr
export const N_STMT_EMPTY: i32 = 155;
export const N_STMT_MAC: i32 = 156; // a: N_MAC; fl: MS_*

// ---- Formatter-made nodes
export const N_META: i32 = 160; // a: path, b: list args node or -1 (list: inner metas), d: name-value lit token or -1; x: MK_*
export const N_META_LIT: i32 = 161; // d: literal token
export const N_MACRO_KW: i32 = 162; // d: keyword token (a macro argument)
export const N_MACRO_ARGS: i32 = 163; // list: parsed macro args; x: delimiter style; fl: MA_*

// ---- Flags
export const AT_INNER: i32 = 1;
export const AT_DOC: i32 = 2;
export const AT_DOC_BLOCK: i32 = 4;
export const AT_UNSAFE: i32 = 8; // #[unsafe(...)]

export const VIS_PUB: i32 = 1;
export const VIS_CRATE: i32 = 2; // pub(crate)
export const VIS_RESTRICTED: i32 = 4; // pub(in path), pub(self), pub(super)
export const VIS_IN: i32 = 8; // written with `in`

export const FN_CONST: i32 = 1;
export const FN_ASYNC: i32 = 2;
export const FN_UNSAFE: i32 = 4;
export const FN_EXTERN: i32 = 8;
export const FN_DEFAULT: i32 = 16;
export const FN_SAFE: i32 = 32;
export const FN_GEN: i32 = 64;

export const IT_UNSAFE: i32 = 1;
export const IT_AUTO: i32 = 2;
export const IT_NEGATIVE: i32 = 4;
export const IT_DEFAULT: i32 = 8;
export const IT_CONST: i32 = 16;
export const IT_LOADED: i32 = 32;
export const IT_MUT: i32 = 64;
export const IT_SAFE: i32 = 128;
export const IT_MACRO_RULES: i32 = 256;
export const IT_SEMI: i32 = 512;

export const UT_SIMPLE: i32 = 1;
export const UT_NESTED: i32 = 2;
export const UT_GLOB: i32 = 4;
export const UT_RENAME: i32 = 8;

export const GP_LIFETIME: i32 = 1;
export const GP_TYPE: i32 = 2;
export const GP_CONST: i32 = 4;

export const WH_HAS_WHERE: i32 = 1;

export const TB_MAYBE: i32 = 1; // ?Trait
export const TB_MAYBE_CONST: i32 = 2; // ~const
export const TB_CONST: i32 = 4; // const
export const TB_ASYNC: i32 = 8; // async
export const TB_NEGATIVE: i32 = 16; // !Trait
export const TB_PAREN: i32 = 32; // (Trait)

export const VD_STRUCT: i32 = 1;
export const VD_TUPLE: i32 = 2;
export const VD_UNIT: i32 = 4;

// N_FIELD fl: `unsafe` (unsafe_fields), and a `mut(in path)` restriction (not the
// `mut(crate|self|super)` shorthand).
export const FD_UNSAFE: i32 = 1;
export const FD_MUT_IN: i32 = 2;

export const PA_SELF_VALUE: i32 = 1; // self / mut self
export const PA_SELF_REF: i32 = 2; // &self / &mut self / &'a self
export const PA_SELF_EXPLICIT: i32 = 4; // self: Ty
export const PA_MUT: i32 = 8; // the self is `mut`
export const PA_REF_MUT: i32 = 16; // &mut self

export const MUT: i32 = 1;
export const ADDR_RAW: i32 = 2;
export const PTR_CONST: i32 = 4;

export const BM_REF: i32 = 1;
export const BM_MUT: i32 = 2;
export const BM_REF_MUT: i32 = 4; // ref mut

export const PS_REST: i32 = 1;
export const SHORTHAND: i32 = 1;

export const RANGE_CLOSED: i32 = 1;
export const RANGE_DOTDOTDOT: i32 = 2;
export const RANGE_HALF_OPEN: i32 = 4;

export const UN_DEREF: i32 = 1;
export const UN_NOT: i32 = 2;
export const UN_NEG: i32 = 3;

export const FOR_AWAIT: i32 = 1;
export const MATCH_POSTFIX: i32 = 1;

export const CL_MOVE: i32 = 1;
export const CL_ASYNC: i32 = 2;
export const CL_STATIC: i32 = 4;
export const CL_CONST: i32 = 8;
export const CL_GEN: i32 = 16;
export const CL_USE: i32 = 32;

export const ST_REST: i32 = 1;
export const ST_BASE: i32 = 2;

export const BLK_UNSAFE: i32 = 1;

export const MS_SEMI: i32 = 1;
export const MS_BRACES: i32 = 2;
export const MS_NOBRACES: i32 = 4;

export const TY_DYN: i32 = 1;
// N_LOCAL fl: `super let`.
export const LOCAL_SUPER: i32 = 1;
export const PATH_GLOBAL: i32 = 1;

/** `xs[i] = v`; a fault when `i` is outside `xs` (a node or token the formatter never made). */
export const rsAstPut = (xs: i32[], i: i32, v: i32): void => {
  if (i >= 0 && i < xs.length) {
    xs[i] = v;
  } else {
    fault();
  }
};

/** `kids[starts[n] + i]`, or -1 after a fault when that is outside the arrays. */
const rsAstListAt = (starts: i32[], kids: i32[], n: i32, i: i32): i32 => {
  if (n >= 0 && n < starts.length) {
    // In i64 the sum is exact; an index of `kids` fits an i32.
    const p = toI64(starts[n]) + toI64(i);
    const q = toI32(p);
    if (toI64(q) === p && q >= 0 && q < kids.length) {
      return kids[q];
    }
  }
  fault();
  return -1;
};

export class RsAst {
  n: i32 = 0;
  kind: i32[];
  lo: i32[];
  hi: i32[];
  a: i32[];
  b: i32[];
  c: i32[];
  d: i32[];
  e: i32[];
  x: i32[];
  fl: i32[];
  ls: i32[];
  ln: i32[];
  ats: i32[];
  atn: i32[];
  kids: i32[];
  nk: i32 = 0;

  constructor(cap: i32) {
    const c = cap < 64 ? 64 : cap;
    // The node arrays grow a node at a time (`add`); `kids` starts `c` long.
    this.kind = [];
    this.lo = [];
    this.hi = [];
    this.a = [];
    this.b = [];
    this.c = [];
    this.d = [];
    this.e = [];
    this.x = [];
    this.fl = [];
    this.ls = [];
    this.ln = [];
    this.ats = [];
    this.atn = [];
    this.kids = newI32s(c);
  }

  add(kind: i32, lo: i32): i32 {
    const i = this.n;
    // A node takes a token: an AST this large is out of reach.
    if (i < 0 || i > 1073741800) {
      fault();
      return -1;
    }
    const kinds = this.kind;
    const los = this.lo;
    const his = this.hi;
    const as = this.a;
    const bs = this.b;
    const cs = this.c;
    const ds = this.d;
    const es = this.e;
    const xs = this.x;
    const fls = this.fl;
    const lss = this.ls;
    const lns = this.ln;
    const atss = this.ats;
    const atns = this.atn;
    if (
      i < kinds.length &&
      i < los.length &&
      i < his.length &&
      i < as.length &&
      i < bs.length &&
      i < cs.length &&
      i < ds.length &&
      i < es.length &&
      i < xs.length &&
      i < fls.length &&
      i < lss.length &&
      i < lns.length &&
      i < atss.length &&
      i < atns.length
    ) {
      // A node the parser backtracked over: made again in place.
      kinds[i] = kind;
      los[i] = lo;
      his[i] = lo;
      as[i] = -1;
      bs[i] = -1;
      cs[i] = -1;
      ds[i] = -1;
      es[i] = -1;
      xs[i] = -1;
      fls[i] = 0;
      lss[i] = 0;
      lns[i] = 0;
      atss[i] = 0;
      atns[i] = 0;
    } else if (i === toI32(kinds.length)) {
      // The arrays grow together, a node at a time.
      kinds.push(kind);
      los.push(lo);
      his.push(lo);
      as.push(-1);
      bs.push(-1);
      cs.push(-1);
      ds.push(-1);
      es.push(-1);
      xs.push(-1);
      fls.push(0);
      lss.push(0);
      lns.push(0);
      atss.push(0);
      atns.push(0);
    } else {
      fault();
      return -1;
    }
    this.n = i + 1;
    return i;
  }

  /** Appends `xs[from, to)` to `kids`; answers where they start. */
  addKids(xs: i32[], from: i32, to: i32): i32 {
    const s = this.nk;
    // `xs[from, to)` is a list the parser built, and `kids` stays below 2^30.
    if (from < 0 || to < from || to > xs.length || s < 0 || s > 1073741823) {
      fault();
      return s;
    }
    const k = toI32(toU32(to) - toU32(from)); // exact: to >= from >= 0
    if (k > 1073741823) {
      fault();
      return s;
    }
    this.kids = growI32(this.kids, s + k);
    const kids = this.kids;
    let p = s;
    for (let j = from; j >= 0 && j < to && j < xs.length; j++) {
      // growI32 made room for `s + k`.
      if (p < 0 || p >= kids.length) {
        fault();
        return s;
      }
      kids[p] = xs[j];
      p++;
    }
    this.nk = s + k;
    return s;
  }

  /** The `i`th element of `n`'s list. */
  kid(n: i32, i: i32): i32 {
    return rsAstListAt(this.ls, this.kids, n, i);
  }

  /** The `i`th outer attribute of `n`. */
  attr(n: i32, i: i32): i32 {
    return rsAstListAt(this.ats, this.kids, n, i);
  }
}

export const rsIsExprKind = (k: i32): boolean => k >= 100 && k < 140;
export const rsIsTyKind = (k: i32): boolean => k >= 50 && k < 70;
export const rsIsPatKind = (k: i32): boolean => k >= 80 && k < 97;
export const rsIsItemKind = (k: i32): boolean => k >= 10 && k <= 25;
