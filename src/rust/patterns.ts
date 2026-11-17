// Formatting patterns.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): patterns.rs.

import {
  BM_MUT,
  BM_REF,
  BM_REF_MUT,
  MUT,
  N_EX_LIT,
  N_EX_UNARY,
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
  PS_REST,
  RANGE_CLOSED,
  RANGE_DOTDOTDOT,
  RsAst,
  SHORTHAND,
} from "./ast";
import { rsRewriteNodeAttrs } from "./attr";
import { rsCombineStrsWithMissingComments } from "./comment";
import { RsCtx } from "./context";
import {
  rsCanBeOverflowedExpr,
  rsRewriteExpr,
  rsRewriteNode,
  rsRewriteUnaryPrefix,
  rsRewriteUnarySuffix,
} from "./expr";
import {
  DLT_MIXED,
  LT_HORIZONTAL_VERTICAL,
  RsListFormatting,
  RsListItem,
  SEP_VERTICAL_BAR,
  SP_FRONT,
  ST_ALWAYS,
  rsDefinitiveTactic,
  rsItemizeList,
  rsListItemFromStr,
  rsShapeForTactic,
  rsStructLitFormatting,
  rsStructLitShape,
  rsStructLitTactic,
  rsWriteList,
} from "./lists";
import { rsMacroPosPat, rsRewriteMacro } from "./macros";
import { OC_TUPLE_PAT, rsRewriteWithParens } from "./overflow";
import { RsPairParts, SPB_FRONT, rsRewritePair } from "./pairs";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeLegacy } from "./shape";
import { rsHasByte } from "./str";
import { PC_EXPR, rsRewritePath } from "./types";
import { rsIdentStr, rsLoWithAttrs } from "./utils";

const isShortPatternInner = (ast: RsAst, p: i32): boolean => {
  const k = ast.kind[p];
  if (k === N_PAT_REST || k === N_PAT_NEVER || k === N_PAT_WILD) {
    return true;
  }
  if (k === N_PAT_LIT) {
    return true;
  }
  if (k === N_PAT_IDENT) {
    return ast.a[p] < 0;
  }
  if (k === N_PAT_STRUCT || k === N_PAT_MAC || k === N_PAT_SLICE || k === N_PAT_PATH || k === N_PAT_RANGE) {
    return false;
  }
  if (k === N_PAT_TUPLE) {
    return ast.ln[p] <= 1;
  }
  if (k === N_PAT_TUPLE_STRUCT) {
    return ast.ln[ast.b[p]] <= 1 && ast.ln[p] <= 1;
  }
  if (k === N_PAT_REF || k === N_PAT_PAREN || k === N_PAT_BOX) {
    return isShortPatternInner(ast, ast.a[p]);
  }
  if (k === N_PAT_OR) {
    for (let i = 0; i < ast.ln[p]; i++) {
      if (!isShortPatternInner(ast, ast.kid(p, i))) {
        return false;
      }
    }
    return true;
  }
  return false;
};

const isShortPattern = (ast: RsAst, p: i32, s: string): boolean =>
  toI32(s.length) <= 20 && !rsHasByte(s, 10) && isShortPatternInner(ast, p);

/** Rewrite for ast::Pat. */
export const rsRewritePat = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[p];
  if (k === N_PAT_OR) {
    const strs: string[] = [];
    let mixed = true;
    for (let i = 0; i < ast.ln[p]; i++) {
      const q = ast.kid(p, i);
      const s = rsRewritePat(ctx, q, shape);
      if (s === null) {
        return null;
      }
      strs.push(s);
      if (!isShortPattern(ast, q, s)) {
        mixed = false;
      }
    }
    const items: RsListItem[] = [];
    for (const s of strs) {
      items.push(rsListItemFromStr(s));
    }
    const tactic = mixed ? DLT_MIXED : rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_VERTICAL_BAR, shape.width);
    const fmt = new RsListFormatting(shape, ctx.cfg);
    fmt.tactic = tactic;
    fmt.separator = " |";
    fmt.separatorPlace = SP_FRONT;
    fmt.endsWithNewline = false;
    return rsWriteList(items, fmt);
  }
  if (k === N_PAT_IDENT) {
    return rewriteIdentPat(ctx, p, shape);
  }
  if (k === N_PAT_WILD) {
    return shape.width >= 1 ? "_" : null;
  }
  if (k === N_PAT_REST) {
    return shape.width >= 1 ? ".." : null;
  }
  if (k === N_PAT_NEVER) {
    return null;
  }
  if (k === N_PAT_RANGE) {
    const f = ast.fl[p];
    const delim = (f & RANGE_CLOSED) !== 0 ? "..=" : (f & RANGE_DOTDOTDOT) !== 0 ? "..." : "..";
    return rewritePatRange(ctx, shape, ast.a[p], ast.b[p], delim);
  }
  if (k === N_PAT_REF) {
    const prefix = (ast.fl[p] & MUT) !== 0 ? "&mut " : "&";
    return rsRewriteUnaryPrefix(ctx, prefix, ast.a[p], shape);
  }
  if (k === N_PAT_BOX) {
    return rsRewriteUnaryPrefix(ctx, "box ", ast.a[p], shape);
  }
  if (k === N_PAT_TUPLE) {
    return rewriteTuplePat(ctx, p, "", false, shape);
  }
  if (k === N_PAT_PATH) {
    return rsRewritePath(ctx, PC_EXPR, ast.a[p], ast.b[p], shape);
  }
  if (k === N_PAT_TUPLE_STRUCT) {
    const ps = rsRewritePath(ctx, PC_EXPR, ast.a[p], ast.b[p], shape);
    if (ps === null) {
      return null;
    }
    return rewriteTuplePat(ctx, p, ps, true, shape);
  }
  if (k === N_PAT_LIT) {
    return rsRewriteExpr(ctx, ast.a[p], shape);
  }
  if (k === N_PAT_SLICE) {
    const parts: string[] = [];
    for (let i = 0; i < ast.ln[p]; i++) {
      const q = ast.kid(p, i);
      const r = rsRewritePat(ctx, q, shape);
      parts.push(r !== null ? r : ctx.snippet(ast.lo[q], ast.hi[q]));
    }
    return "[" + parts.join(", ") + "]";
  }
  if (k === N_PAT_STRUCT) {
    return rewriteStructPat(ctx, p, shape);
  }
  if (k === N_PAT_MAC) {
    return rsRewriteMacro(ctx, ast.a[p], shape, rsMacroPosPat());
  }
  if (k === N_PAT_PAREN) {
    const s0 = shape.offsetLeft(1);
    if (s0 === null) {
      return null;
    }
    const s1 = s0.subWidth(1);
    if (s1 === null) {
      return null;
    }
    const r = rsRewritePat(ctx, ast.a[p], s1);
    return r === null ? null : "(" + r + ")";
  }
  ctx.unsupported("pattern kind");
  return null;
};

const rewritePatRange = (ctx: RsCtx, shape: RsShape, lhs: i32, rhs: i32, delim: string): string | null => {
  // rewrite_range: the bounds are expressions; no spaces are needed around the delimiter here.
  if (lhs >= 0 && rhs >= 0) {
    return rsRewritePair(ctx, lhs, rhs, new RsPairParts("", delim, ""), shape, SPB_FRONT);
  }
  if (rhs >= 0) {
    return rsRewriteUnaryPrefix(ctx, delim, rhs, shape);
  }
  if (lhs >= 0) {
    return rsRewriteUnarySuffix(ctx, delim, lhs, shape);
  }
  return delim;
};

const rewriteIdentPat = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const lo = ast.lo[p];
  const hi = ast.hi[p];
  const f = ast.fl[p];
  const mutPrefix = (f & BM_MUT) !== 0 ? "mut" : "";
  const refKw = (f & (BM_REF | BM_REF_MUT)) !== 0 ? "ref" : "";
  const mutInfix = (f & BM_REF_MUT) !== 0 ? "mut" : "";
  const ident = ast.d[p];
  const idStr = rsIdentStr(ctx, ident);
  const sub = ast.a[p];
  let subPat = "";
  if (sub >= 0) {
    const width =
      shape.width - (toI32(mutPrefix.length) + toI32(refKw.length) + toI32(mutInfix.length) + toI32(idStr.length) + 2);
    if (width < 0) {
      return null;
    }
    const at = ctx.spanAfter(lo, hi, "@");
    const sp = rsRewritePat(ctx, sub, rsShapeLegacy(width, shape.bi, shape.al));
    if (sp === null) {
      return null;
    }
    const r = rsCombineStrsWithMissingComments(ctx, "@", sp, at, ast.lo[sub], shape, true);
    if (r === null) {
      return null;
    }
    subPat = r;
  }
  let firstLo = lo;
  let first = "";
  if (mutPrefix.length !== 0 && refKw.length !== 0) {
    ctx.unsupported("mut ref binding");
    return null;
  } else if (mutPrefix.length !== 0) {
    firstLo = ctx.spanAfter(lo, hi, "mut");
    first = mutPrefix;
  } else if (refKw.length !== 0) {
    firstLo = ctx.spanAfter(lo, hi, "ref");
    first = refKw;
  }
  const second = first;
  const secondLo = first.length !== 0 ? firstLo : lo;
  let thirdLo = lo;
  let third = "";
  if (second.length !== 0 && mutInfix.length !== 0) {
    const l = ctx.spanAfter(lo, hi, "ref");
    const h = ctx.spanBefore(secondLo, hi, mutInfix);
    thirdLo = ctx.spanAfter(secondLo, hi, mutInfix);
    const r = rsCombineStrsWithMissingComments(ctx, second, mutInfix, l, h, shape, true);
    if (r === null) {
      return null;
    }
    third = r;
  } else if (second.length !== 0) {
    thirdLo = secondLo;
    third = second;
  }
  let next = idStr;
  if (subPat.length !== 0) {
    const h = ctx.spanBefore(lo, hi, "@");
    const r = rsCombineStrsWithMissingComments(ctx, idStr, subPat, ctx.f.t.hi[ident], h, shape, true);
    if (r === null) {
      return null;
    }
    next = r;
  }
  return rsCombineStrsWithMissingComments(ctx, third, next, thirdLo, ctx.f.t.lo[ident], shape, true);
};

const rewriteStructPat = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const lo = ast.lo[p];
  const hi = ast.hi[p];
  const ps = shape.subWidth(2);
  if (ps === null) {
    return null;
  }
  const pathStr = rsRewritePath(ctx, PC_EXPR, ast.a[p], ast.b[p], ps);
  if (pathStr === null) {
    return null;
  }
  const n = ast.ln[p];
  const ellipsis = (ast.fl[p] & PS_REST) !== 0;
  if (n === 0 && !ellipsis) {
    return pathStr + " {}";
  }
  const ellipsisStr = ellipsis ? ", .." : "";
  const terminator = ellipsis ? ".." : "}";
  const pair = rsStructLitShape(shape, ctx, toI32(pathStr.length) + 3, toI32(ellipsisStr.length) + 2);
  const vShape = pair.v;
  const items = rsItemizeList(
    ctx,
    n,
    terminator,
    ",",
    (i: i32): i32 => {
      const f = ast.kid(p, i);
      return ast.atn[f] === 0 ? ast.lo[f] : ast.lo[ast.attr(f, 0)];
    },
    (i: i32): i32 => ast.hi[ast.kid(p, i)],
    (i: i32): string | null => rewritePatField(ctx, ast.kid(p, i), vShape),
    ctx.spanAfter(lo, hi, "{"),
    hi,
    false,
  );
  const tactic = rsStructLitTactic(pair.h, ctx, items);
  const nested = rsShapeForTactic(tactic, pair.h, vShape);
  const fmt = rsStructLitFormatting(nested, tactic, ctx, false);
  const fieldsStr0 = rsWriteList(items, fmt);
  if (fieldsStr0 === null) {
    return null;
  }
  let fieldsStr = fieldsStr0;
  const h = pair.h;
  const oneLineWidth = h === null ? 0 : h.width;
  const hasTrailingComma = fmt.needsTrailingSeparator();
  if (ellipsis) {
    if (rsHasByte(fieldsStr, 10) || toI32(fieldsStr.length) > oneLineWidth) {
      if (!hasTrailingComma) {
        fieldsStr = fieldsStr + ",";
      }
      fieldsStr = fieldsStr + "\n" + rsIndentStr(ctx.cfg, nested.bi, nested.al);
    } else if (fieldsStr.length !== 0) {
      fieldsStr = fieldsStr + (hasTrailingComma ? " " : ", ");
    }
    fieldsStr = fieldsStr + "..";
  }
  // wrap_struct_field.
  const shouldVertical = rsHasByte(fieldsStr, 10) || toI32(fieldsStr.length) > oneLineWidth;
  let wrapped = "";
  if (shouldVertical) {
    wrapped = rsIndentStrNl(ctx.cfg, vShape.bi, vShape.al) + fieldsStr + rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
  } else {
    wrapped = " " + fieldsStr + " ";
  }
  return `${pathStr} {${wrapped}}`;
};

const rewritePatField = (ctx: RsCtx, f: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const pat = ast.a[f];
  const na = ast.atn[f];
  const hiPos = na > 0 ? ast.hi[ast.attr(f, na - 1)] : ast.lo[pat];
  let attrsStr = "";
  if (na > 0) {
    const s = rsRewriteNodeAttrs(ctx, f, shape);
    if (s === null) {
      return null;
    }
    attrsStr = s;
  }
  const patStr = rsRewritePat(ctx, pat, shape);
  if (patStr === null) {
    return null;
  }
  if ((ast.fl[f] & SHORTHAND) !== 0) {
    return rsCombineStrsWithMissingComments(ctx, attrsStr, patStr, hiPos, ast.lo[pat], shape, false);
  }
  const nested = shape.blockIndent(ctx.cfg.tabSpaces);
  const idStr = rsIdentStr(ctx, ast.d[f]);
  const olw = toI32(idStr.length) + 2 + toI32(patStr.length);
  let s = "";
  if (olw <= shape.width) {
    s = `${idStr}: ${patStr}`;
  } else {
    const r = rsRewritePat(ctx, pat, nested);
    if (r === null) {
      return null;
    }
    s = `${idStr}:\n${rsIndentStr(ctx.cfg, nested.bi, nested.al)}${r}`;
  }
  // rustfmt 1.9 takes the missing span up to the pattern, so it covers `ident:` too.
  return rsCombineStrsWithMissingComments(ctx, attrsStr, s, hiPos, ast.lo[pat], nested, false);
};

/** The span of a tuple pattern field. */
export const rsTuplePatFieldLo = (ast: RsAst, p: i32): i32 => ast.lo[p];
export const rsTuplePatFieldHi = (ast: RsAst, p: i32): i32 => ast.hi[p];

/** can_be_overflowed_pat. */
export const rsCanBeOverflowedPat = (ctx: RsCtx, p: i32, len: i32): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[p];
  if (k === N_PAT_PATH || k === N_PAT_TUPLE || k === N_PAT_STRUCT || k === N_PAT_TUPLE_STRUCT) {
    return len === 1;
  }
  if (k === N_PAT_REF) {
    return rsCanBeOverflowedPat(ctx, ast.a[p], len);
  }
  if (k === N_PAT_LIT) {
    return rsCanBeOverflowedExpr(ctx, ast.a[p], len);
  }
  return false;
};

const rewriteTuplePat = (ctx: RsCtx, p: i32, pathStr: string, hasPath: boolean, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const n = ast.ln[p];
  if (n === 0) {
    return pathStr + "()";
  }
  const items: i32[] = [];
  for (let i = 0; i < n; i++) {
    items.push(ast.kid(p, i));
  }
  const isLastDotdot = ast.kind[items[n - 1]] === N_PAT_REST;
  const addComma = !hasPath && n === 1 && !isLastDotdot;
  return rsRewriteWithParens(
    ctx,
    pathStr,
    items,
    OC_TUPLE_PAT,
    shape,
    ast.lo[p],
    ast.hi[p],
    ctx.cfg.maxWidth,
    addComma ? ST_ALWAYS : -1,
  );
};

export const rsPatIsLitNeg = (ast: RsAst, e: i32): boolean =>
  ast.kind[e] === N_EX_UNARY && ast.kind[ast.a[e]] === N_EX_LIT;
export const rsPatRewriteNode = (ctx: RsCtx, n: i32, shape: RsShape): string | null => rsRewriteNode(ctx, n, shape);
export const rsPatLoWithAttrs = (ast: RsAst, n: i32): i32 => rsLoWithAttrs(ast, n);
