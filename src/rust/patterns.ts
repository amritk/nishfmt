// Formatting patterns.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
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
import { rsCanBeOverflowedExpr, rsRewriteExpr, rsRewriteNode, rsRewriteRange, rsRewriteUnaryPrefix } from "./expr";
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
import { OC_PAT, OC_TUPLE_PAT, rsRewriteWithParens, rsRewriteWithSquareBrackets } from "./overflow";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeLegacy } from "./shape";
import { rsHasByte } from "./str";
import { PC_EXPR, rsRewritePath } from "./types";
import { rsIdentStr, rsLoWithAttrs } from "./utils";
import { add32, atI32, sub32 } from "../core/arr";

const isShortPatternInner = (ast: RsAst, p: i32): boolean => {
  const k = atI32(ast.kind, p);
  if (k === N_PAT_REST || k === N_PAT_NEVER || k === N_PAT_WILD) {
    return true;
  }
  if (k === N_PAT_LIT) {
    return true;
  }
  if (k === N_PAT_IDENT) {
    return atI32(ast.a, p) < 0;
  }
  if (k === N_PAT_STRUCT || k === N_PAT_MAC || k === N_PAT_SLICE || k === N_PAT_PATH || k === N_PAT_RANGE) {
    return false;
  }
  if (k === N_PAT_TUPLE) {
    return atI32(ast.ln, p) <= 1;
  }
  if (k === N_PAT_TUPLE_STRUCT) {
    return atI32(ast.ln, atI32(ast.b, p)) <= 1 && atI32(ast.ln, p) <= 1;
  }
  if (k === N_PAT_REF || k === N_PAT_PAREN || k === N_PAT_BOX) {
    return isShortPatternInner(ast, atI32(ast.a, p));
  }
  if (k === N_PAT_OR) {
    for (let i = 0; i < atI32(ast.ln, p); i++) {
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
  const k = atI32(ast.kind, p);
  if (k === N_PAT_OR) {
    const strs: string[] = [];
    let mixed = true;
    for (let i = 0; i < atI32(ast.ln, p); i++) {
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
    const f = atI32(ast.fl, p);
    const delim = (f & RANGE_CLOSED) !== 0 ? "..=" : (f & RANGE_DOTDOTDOT) !== 0 ? "..." : "..";
    // rustfmt 1.10.0 formats range patterns with range.rs, as range expressions.
    return rsRewriteRange(ctx, shape, atI32(ast.a, p), atI32(ast.b, p), delim);
  }
  if (k === N_PAT_REF) {
    const prefix = (atI32(ast.fl, p) & MUT) !== 0 ? "&mut " : "&";
    return rsRewriteUnaryPrefix(ctx, prefix, atI32(ast.a, p), shape);
  }
  if (k === N_PAT_BOX) {
    return rsRewriteUnaryPrefix(ctx, "box ", atI32(ast.a, p), shape);
  }
  if (k === N_PAT_TUPLE) {
    return rewriteTuplePat(ctx, p, "", false, shape);
  }
  if (k === N_PAT_PATH) {
    return rsRewritePath(ctx, PC_EXPR, atI32(ast.a, p), atI32(ast.b, p), shape);
  }
  if (k === N_PAT_TUPLE_STRUCT) {
    const ps = rsRewritePath(ctx, PC_EXPR, atI32(ast.a, p), atI32(ast.b, p), shape);
    if (ps === null) {
      return null;
    }
    return rewriteTuplePat(ctx, p, ps, true, shape);
  }
  if (k === N_PAT_LIT) {
    return rsRewriteExpr(ctx, atI32(ast.a, p), shape);
  }
  if (k === N_PAT_SLICE && ctx.cfg.styleEdition > 2021) {
    const items: i32[] = [];
    for (let i = 0; i < atI32(ast.ln, p); i++) {
      items.push(ast.kid(p, i));
    }
    return rsRewriteWithSquareBrackets(ctx, "", items, OC_PAT, shape, atI32(ast.lo, p), atI32(ast.hi, p), -1, -1);
  }
  if (k === N_PAT_SLICE) {
    const parts: string[] = [];
    for (let i = 0; i < atI32(ast.ln, p); i++) {
      const q = ast.kid(p, i);
      const r = rsRewritePat(ctx, q, shape);
      parts.push(r !== null ? r : ctx.snippet(atI32(ast.lo, q), atI32(ast.hi, q)));
    }
    return "[" + parts.join(", ") + "]";
  }
  if (k === N_PAT_STRUCT) {
    return rewriteStructPat(ctx, p, shape);
  }
  if (k === N_PAT_MAC) {
    return rsRewriteMacro(ctx, atI32(ast.a, p), shape, rsMacroPosPat());
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
    const r = rsRewritePat(ctx, atI32(ast.a, p), s1);
    return r === null ? null : "(" + r + ")";
  }
  ctx.unsupported("pattern kind");
  return null;
};

const rewriteIdentPat = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const lo = atI32(ast.lo, p);
  const hi = atI32(ast.hi, p);
  const f = atI32(ast.fl, p);
  const mutPrefix = (f & BM_MUT) !== 0 ? "mut" : "";
  const refKw = (f & (BM_REF | BM_REF_MUT)) !== 0 ? "ref" : "";
  const mutInfix = (f & BM_REF_MUT) !== 0 ? "mut" : "";
  const ident = atI32(ast.d, p);
  const idStr = rsIdentStr(ctx, ident);
  const sub = atI32(ast.a, p);
  let subPat = "";
  if (sub >= 0) {
    const width = sub32(
      shape.width,
      add32(
        add32(add32(add32(toI32(mutPrefix.length), toI32(refKw.length)), toI32(mutInfix.length)), toI32(idStr.length)),
        2,
      ),
    );
    if (width < 0) {
      return null;
    }
    const at = ctx.spanAfter(lo, hi, "@");
    const sp = rsRewritePat(ctx, sub, rsShapeLegacy(width, shape.bi, shape.al));
    if (sp === null) {
      return null;
    }
    const r = rsCombineStrsWithMissingComments(ctx, "@", sp, at, atI32(ast.lo, sub), shape, true);
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
    const r = rsCombineStrsWithMissingComments(ctx, idStr, subPat, atI32(ctx.f.t.hi, ident), h, shape, true);
    if (r === null) {
      return null;
    }
    next = r;
  }
  return rsCombineStrsWithMissingComments(ctx, third, next, thirdLo, atI32(ctx.f.t.lo, ident), shape, true);
};

const rewriteStructPat = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const lo = atI32(ast.lo, p);
  const hi = atI32(ast.hi, p);
  const ps = shape.subWidth(2);
  if (ps === null) {
    return null;
  }
  const pathStr = rsRewritePath(ctx, PC_EXPR, atI32(ast.a, p), atI32(ast.b, p), ps);
  if (pathStr === null) {
    return null;
  }
  const n = atI32(ast.ln, p);
  const ellipsis = (atI32(ast.fl, p) & PS_REST) !== 0;
  if (n === 0 && !ellipsis) {
    return pathStr + " {}";
  }
  const ellipsisStr = ellipsis ? ", .." : "";
  const terminator = ellipsis ? ".." : "}";
  const pair = rsStructLitShape(shape, ctx, add32(toI32(pathStr.length), 3), add32(toI32(ellipsisStr.length), 2));
  const vShape = pair.v;
  const items = rsItemizeList(
    ctx,
    n,
    terminator,
    ",",
    (i: i32): i32 => {
      const f = ast.kid(p, i);
      return atI32(ast.atn, f) === 0 ? atI32(ast.lo, f) : atI32(ast.lo, ast.attr(f, 0));
    },
    (i: i32): i32 => atI32(ast.hi, ast.kid(p, i)),
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
  const pat = atI32(ast.a, f);
  const na = atI32(ast.atn, f);
  const hiPos = na > 0 ? atI32(ast.hi, ast.attr(f, na - 1)) : atI32(ast.lo, pat);
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
  if ((atI32(ast.fl, f) & SHORTHAND) !== 0) {
    return rsCombineStrsWithMissingComments(ctx, attrsStr, patStr, hiPos, atI32(ast.lo, pat), shape, false);
  }
  const nested = shape.blockIndent(ctx.cfg.tabSpaces);
  const idStr = rsIdentStr(ctx, atI32(ast.d, f));
  const olw = add32(add32(toI32(idStr.length), 2), toI32(patStr.length));
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
  // rustfmt 1.10 takes the missing span up to the pattern, so it covers `ident:` too.
  return rsCombineStrsWithMissingComments(ctx, attrsStr, s, hiPos, atI32(ast.lo, pat), nested, false);
};

/** The span of a tuple pattern field. */
export const rsTuplePatFieldLo = (ast: RsAst, p: i32): i32 => atI32(ast.lo, p);
export const rsTuplePatFieldHi = (ast: RsAst, p: i32): i32 => atI32(ast.hi, p);

/** can_be_overflowed_pat. */
export const rsCanBeOverflowedPat = (ctx: RsCtx, p: i32, len: i32): boolean => {
  const ast = ctx.ast;
  const k = atI32(ast.kind, p);
  if (k === N_PAT_PATH || k === N_PAT_TUPLE || k === N_PAT_STRUCT || k === N_PAT_TUPLE_STRUCT) {
    return len === 1;
  }
  if (k === N_PAT_REF) {
    return rsCanBeOverflowedPat(ctx, atI32(ast.a, p), len);
  }
  if (k === N_PAT_LIT) {
    return rsCanBeOverflowedExpr(ctx, atI32(ast.a, p), len);
  }
  return false;
};

const rewriteTuplePat = (ctx: RsCtx, p: i32, pathStr: string, hasPath: boolean, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const n = atI32(ast.ln, p);
  if (n === 0) {
    return pathStr + "()";
  }
  const items: i32[] = [];
  for (let i = 0; i < n; i++) {
    items.push(ast.kid(p, i));
  }
  const isLastDotdot = atI32(ast.kind, atI32(items, sub32(n, 1))) === N_PAT_REST;
  const addComma = !hasPath && n === 1 && !isLastDotdot;
  return rsRewriteWithParens(
    ctx,
    pathStr,
    items,
    OC_TUPLE_PAT,
    shape,
    atI32(ast.lo, p),
    atI32(ast.hi, p),
    ctx.cfg.maxWidth,
    addComma ? ST_ALWAYS : -1,
  );
};

export const rsPatIsLitNeg = (ast: RsAst, e: i32): boolean =>
  atI32(ast.kind, e) === N_EX_UNARY && atI32(ast.kind, atI32(ast.a, e)) === N_EX_LIT;
export const rsPatRewriteNode = (ctx: RsCtx, n: i32, shape: RsShape): string | null => rsRewriteNode(ctx, n, shape);
export const rsPatLoWithAttrs = (ast: RsAst, n: i32): i32 => rsLoWithAttrs(ast, n);
