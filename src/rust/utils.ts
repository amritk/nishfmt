// rustfmt's utils.rs: visibility and keyword formatting, small string
// tests, and expression classifications used across the formatter.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): utils.rs.

import {
  AT_INNER,
  FN_ASYNC,
  FN_CONST,
  FN_DEFAULT,
  FN_EXTERN,
  FN_SAFE,
  FN_UNSAFE,
  N_EX_ADDR_OF,
  N_EX_ARRAY,
  N_EX_ASSIGN,
  N_EX_ASSIGN_OP,
  N_EX_ASYNC,
  N_EX_BINARY,
  N_EX_BLOCK,
  N_EX_CALL,
  N_EX_CAST,
  N_EX_CLOSURE,
  N_EX_CONST_BLOCK,
  N_EX_FIELD,
  N_EX_FOR,
  N_EX_IF,
  N_EX_INDEX,
  N_EX_LIT,
  N_EX_LOOP,
  N_EX_MAC,
  N_EX_MATCH,
  N_EX_METHOD,
  N_EX_PAREN,
  N_EX_RANGE,
  N_EX_STRUCT,
  N_EX_TRY,
  N_EX_TRY_BLOCK,
  N_EX_UNARY,
  N_EX_WHILE,
  N_EX_YIELD,
  N_PATH,
  RsAst,
  VIS_CRATE,
  VIS_IN,
  VIS_RESTRICTED,
} from "./ast";
import { rsTrimmedLastLineWidth } from "./comment";
import { RsCtx } from "./context";
import { T_RSTR } from "./lexer";
import { rsFirstLineOpt, rsHasByte, rsIndexOfByte, rsLastLineOpt, rsLines, rsWsLenAt } from "./str";

/** rewrite_ident: the snippet of the ident token `tok`. */
export const rsIdentStr = (ctx: RsCtx, tok: i32): string => {
  if (tok < 0) {
    return "";
  }
  return ctx.tokStr(tok);
};

/** The text of a path's segments joined by `::` (pprust-like, no generic args). */
export const rsPathSegmentsStr = (ctx: RsCtx, path: i32): string => {
  const ast = ctx.ast;
  let out = "";
  for (let i = 0; i < ast.ln[path]; i++) {
    if (i > 0) {
      out = out + "::";
    }
    out = out + rsIdentStr(ctx, ast.d[ast.kid(path, i)]);
  }
  return out;
};

/** format_visibility for vis node `v` (or -1 for inherited). */
export const rsFormatVisibility = (ctx: RsCtx, v: i32): string => {
  if (v < 0) {
    return "";
  }
  const ast = ctx.ast;
  const f = ast.fl[v];
  if ((f & (VIS_CRATE | VIS_RESTRICTED)) === 0) {
    return "pub ";
  }
  const pa = ast.a[v];
  const path = pa >= 0 && ast.kind[pa] === N_PATH ? rsPathSegmentsStr(ctx, pa) : "";
  const isKw = path === "crate" || path === "self" || path === "super";
  const inStr = isKw ? "" : "in ";
  return `pub(${inStr}${path}) `;
};

/** is_same_visibility. */
export const rsIsSameVisibility = (ctx: RsCtx, a: i32, b: i32): boolean => {
  if (a < 0 || b < 0) {
    return a < 0 && b < 0;
  }
  const ast = ctx.ast;
  const ra = (ast.fl[a] & (VIS_CRATE | VIS_RESTRICTED)) !== 0;
  const rb = (ast.fl[b] & (VIS_CRATE | VIS_RESTRICTED)) !== 0;
  if (ra && rb) {
    return rsPathSegmentsStr(ctx, ast.a[a]) === rsPathSegmentsStr(ctx, ast.a[b]);
  }
  return !ra && !rb;
};

/** The unescaped text of an ABI string literal token. */
export const rsAbiStr = (ctx: RsCtx, tok: i32): string => {
  const s = ctx.tokStr(tok);
  if (ctx.f.t.kind[tok] === T_RSTR) {
    let i = 1;
    while (i < toI32(s.length) && s.charCodeAt(i) === 35) {
      i++;
    }
    const h = i - 1;
    return s.slice(i + 1, toI32(s.length) - 1 - h);
  }
  return s.slice(1, toI32(s.length) - 1);
};

/** format_extern with force_explicit_abi = true: `extern` flag, abi token or -1. */
export const rsFormatExtern = (ctx: RsCtx, isExtern: boolean, abi: i32): string => {
  if (!isExtern && abi < 0) {
    return "";
  }
  if (abi < 0) {
    return 'extern "C" ';
  }
  return `extern "${rsAbiStr(ctx, abi)}" `;
};

/** FnSig::to_str for N_FN or N_TY_FN flags. */
export const rsFnHeaderStr = (ctx: RsCtx, vis: i32, fl: i32, abi: i32): string => {
  let r = rsFormatVisibility(ctx, vis);
  if ((fl & FN_DEFAULT) !== 0) {
    r = r + "default ";
  }
  if ((fl & FN_CONST) !== 0) {
    r = r + "const ";
  }
  if ((fl & FN_ASYNC) !== 0) {
    r = r + "async ";
  }
  if ((fl & FN_UNSAFE) !== 0) {
    r = r + "unsafe ";
  } else if ((fl & FN_SAFE) !== 0) {
    r = r + "safe ";
  }
  r = r + rsFormatExtern(ctx, (fl & FN_EXTERN) !== 0, abi);
  return r;
};

export const rsIsSingleLineStr = (s: string): boolean => !rsHasByte(s, 10);

export const rsFirstLineContainsSingleLineComment = (s: string): boolean => {
  const l = rsFirstLineOpt(s);
  return l !== null && l.indexOf("//") >= 0;
};

export const rsLastLineContainsSingleLineComment = (s: string): boolean => {
  const l = rsLastLineOpt(s);
  return l !== null && l.indexOf("//") >= 0;
};

export const rsIsAttributesExtendable = (s: string): boolean =>
  !rsHasByte(s, 10) && !rsLastLineContainsSingleLineComment(s);

/** last_line_extendable. */
export const rsLastLineExtendable = (s: string): boolean => {
  if (s.endsWith('"#')) {
    return true;
  }
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c === 40 || c === 41 || c === 93 || c === 125 || c === 63 || c === 62) {
      continue;
    }
    if (c === 10) {
      break;
    }
    if (rsWsLenAt(s, i) > 0) {
      continue;
    }
    return false;
  }
  return true;
};

/** extra_offset. */
export const rsExtraOffset = (text: string, usedWidth: i32): i32 => {
  let i = toI32(text.length) - 1;
  while (i >= 0 && text.charCodeAt(i) !== 10) {
    i--;
  }
  if (i < 0) {
    return toI32(text.length);
  }
  const r = toI32(text.length) - (i + 1 + usedWidth);
  return r < 0 ? 0 : r;
};

export const rsStartsWithNewline = (s: string): boolean => s.startsWith("\n") || s.startsWith("\r\n");

export const rsFirstLineEndsWith = (s: string, c: i32): boolean => {
  const l = rsFirstLineOpt(s);
  return l !== null && l.length > 0 && l.charCodeAt(toI32(l.length) - 1) === c;
};

/**
 * `!expr.attrs.is_empty()`: rustc keeps a block-like expression's inner
 * attributes (those of its block) in the expression's attributes too.
 */
export const rsExprHasAttrs = (ast: RsAst, e: i32): boolean => {
  if (ast.atn[e] > 0) {
    return true;
  }
  const b = rsExprInnerBlock(ast, e);
  return b >= 0 && ast.atn[b] > 0;
};

/** The block whose inner attributes rustc files under block-like expression `e`, or -1. */
export const rsExprInnerBlock = (ast: RsAst, e: i32): i32 => {
  const k = ast.kind[e];
  if (k === N_EX_BLOCK || k === N_EX_ASYNC || k === N_EX_TRY_BLOCK || k === N_EX_CONST_BLOCK) {
    return ast.a[e];
  }
  if (k === N_EX_WHILE || k === N_EX_LOOP) {
    return ast.b[e];
  }
  if (k === N_EX_FOR) {
    return ast.c[e];
  }
  return -1;
};

/** Whether node `n` has outer attributes. */
export const rsHasOuterAttrs = (ast: RsAst, n: i32): boolean => {
  for (let i = 0; i < ast.atn[n]; i++) {
    if ((ast.fl[ast.attr(n, i)] & AT_INNER) === 0) {
      return true;
    }
  }
  return false;
};

/** The first outer attribute of `n`, or -1. */
export const rsFirstOuterAttr = (ast: RsAst, n: i32): i32 => {
  for (let i = 0; i < ast.atn[n]; i++) {
    const a = ast.attr(n, i);
    if ((ast.fl[a] & AT_INNER) === 0) {
      return a;
    }
  }
  return -1;
};

/** Spanned::span lo for a node with attributes (span_with_attrs). */
export const rsLoWithAttrs = (ast: RsAst, n: i32): i32 => {
  const a = rsFirstOuterAttr(ast, n);
  return a >= 0 ? ast.lo[a] : ast.lo[n];
};

/** left_most_sub_expr. */
export const rsLeftMostSubExpr = (ast: RsAst, e0: i32): i32 => {
  let e = e0;
  for (;;) {
    const k = ast.kind[e];
    if (
      k === N_EX_CALL ||
      k === N_EX_BINARY ||
      k === N_EX_CAST ||
      k === N_EX_ASSIGN ||
      k === N_EX_ASSIGN_OP ||
      k === N_EX_FIELD ||
      k === N_EX_INDEX ||
      k === N_EX_TRY
    ) {
      e = ast.a[e];
      continue;
    }
    if (k === N_EX_RANGE && ast.a[e] >= 0) {
      e = ast.a[e];
      continue;
    }
    return e;
  }
};

/** is_block_expr. */
export const rsIsBlockExpr = (ctx: RsCtx, e: i32, repr: string): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[e];
  if (
    k === N_EX_MAC ||
    k === N_EX_CALL ||
    k === N_EX_METHOD ||
    k === N_EX_ARRAY ||
    k === N_EX_STRUCT ||
    k === N_EX_WHILE ||
    k === N_EX_IF ||
    k === N_EX_BLOCK ||
    k === N_EX_CONST_BLOCK ||
    k === N_EX_ASYNC ||
    k === N_EX_LOOP ||
    k === N_EX_FOR ||
    k === N_EX_TRY_BLOCK ||
    k === N_EX_MATCH
  ) {
    return rsHasByte(repr, 10);
  }
  if (k === N_EX_PAREN || k === N_EX_UNARY || k === N_EX_TRY) {
    return rsIsBlockExpr(ctx, ast.a[e], repr);
  }
  if (k === N_EX_BINARY || k === N_EX_INDEX) {
    return rsIsBlockExpr(ctx, ast.b[e], repr);
  }
  if (k === N_EX_YIELD) {
    return ast.a[e] >= 0 ? rsIsBlockExpr(ctx, ast.a[e], repr) : false;
  }
  if (k === N_EX_CLOSURE) {
    return rsIsBlockExpr(ctx, ast.a[e], repr);
  }
  if (k === N_EX_LIT) {
    return rsHasByte(repr, 10) && rsTrimmedLastLineWidth(repr) <= ctx.cfg.tabSpaces;
  }
  if (k === N_EX_ADDR_OF) {
    return false;
  }
  return false;
};

/** The index of the first non-whitespace char in `s`, or -1. */
export const rsFirstNonWs = (s: string): i32 => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const w = rsWsLenAt(s, i);
    if (w === 0) {
      return i;
    }
    i += w;
  }
  return -1;
};

export const rsContainsNl = (s: string): boolean => rsIndexOfByte(s, 10, 0) >= 0;
