// Formatting types, paths, generic arguments and parameters, bounds and
// where predicates.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): types.rs.

import { rsParamSpannedLo, rsRewriteParam } from "./items";
import {
  AT_DOC,
  FN_EXTERN,
  FN_UNSAFE,
  GP_CONST,
  GP_TYPE,
  MUT,
  N_CONSTRAINT,
  N_GARGS,
  N_GARGS_ELIDED,
  N_LIFETIME,
  N_PGARGS,
  N_TRAIT_BOUND,
  N_TY_ARRAY,
  N_TY_CVARARGS,
  N_TY_DYN,
  N_TY_FN,
  N_TY_IMPL,
  N_TY_IMPLICIT_SELF,
  N_TY_INFER,
  N_TY_MAC,
  N_TY_NEVER,
  N_TY_PAREN,
  N_TY_PATH,
  N_TY_PTR,
  N_TY_REF,
  N_TY_SLICE,
  N_TY_TUP,
  N_USE_BOUND,
  N_WPRED_BOUND,
  N_WPRED_EQ,
  N_WPRED_REGION,
  PATH_GLOBAL,
  RsAst,
  TB_ASYNC,
  TB_CONST,
  TB_MAYBE,
  TB_MAYBE_CONST,
  TB_NEGATIVE,
  TY_DYN,
  rsIsExprKind,
} from "./ast";
import { rsRewriteNodeAttrs } from "./attr";
import { rsCombineStrsWithMissingComments, rsContainsComment, rsFirstLineWidth, rsLastLineWidth } from "./comment";
import { RsCtx } from "./context";
import { EXPR_SUB, RHS_BOUNDS, rsFormatExpr, rsRewriteAssignRhs, rsRewriteTuple, rsRewriteUnaryPrefix } from "./expr";
import {
  DLT_HORIZONTAL,
  DLT_VERTICAL,
  LT_HORIZONTAL_VERTICAL,
  RsListFormatting,
  RsListItem,
  SEP_COMMA,
  ST_NEVER,
  ST_VERTICAL,
  rsDefinitiveTactic,
  rsItemizeList,
  rsWriteList,
} from "./lists";
import { rsMacroPosExpr, rsRewriteMacro } from "./macros";
import { OC_PRECISE, OC_SEGMENT_PARAM, OC_TY, rsRewriteWithAngleBrackets } from "./overflow";
import { RsPairParts, SPB_BACK, rsRewritePair } from "./pairs";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeIndented, rsShapeLegacy } from "./shape";
import { rsHasByte, rsTrim, rsTrimEnd, rsTrimStart } from "./str";
import { rsExtraOffset, rsFormatExtern, rsIdentStr, rsLastLineExtendable } from "./utils";

export const PC_EXPR: i32 = 0;
export const PC_TYPE: i32 = 1;
export const PC_IMPORT: i32 = 2;

/** rewrite_path: `qself` is an N_QSELF node or -1. */
export const rsRewritePath = (ctx: RsCtx, pc: i32, qself: i32, path: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const skip = qself >= 0 ? ast.x[qself] : 0;
  let result = "";
  const global = (ast.fl[path] & PATH_GLOBAL) !== 0;
  if (global && qself < 0 && pc !== PC_IMPORT) {
    result = "::";
  }
  let spanLo = ast.lo[path];
  if (qself >= 0) {
    result = result + "<";
    const ft = rsRewriteTy(ctx, ast.a[qself], shape);
    if (ft === null) {
      return null;
    }
    result = result + ft;
    if (skip > 0) {
      result = result + " as ";
      if (global && pc !== PC_IMPORT) {
        result = result + "::";
      }
      const sh = shape.subWidth(3);
      if (sh === null) {
        return null;
      }
      const st = new SegState(spanLo);
      const r = rewritePathSegments(ctx, PC_TYPE, result, path, 0, skip, st, ast.hi[path], sh);
      if (r === null) {
        return null;
      }
      result = r;
    }
    result = result + ">::";
    spanLo = ast.hi[ast.a[qself]] + 1;
  }
  const st = new SegState(spanLo);
  return rewritePathSegments(ctx, pc, result, path, skip, ast.ln[path], st, ast.hi[path], shape);
};

class SegState {
  lo: i32;
  constructor(lo: i32) {
    this.lo = lo;
  }
}

const rewritePathSegments = (
  ctx: RsCtx,
  pc: i32,
  buffer0: string,
  path: i32,
  from: i32,
  to: i32,
  st: SegState,
  spanHi: i32,
  shape0: RsShape,
): string | null => {
  const ast = ctx.ast;
  let buffer = buffer0;
  let first = true;
  const shape = shape0.visualIndent(0);
  for (let i = from; i < to; i++) {
    const seg = ast.kid(path, i);
    if (first) {
      first = false;
    } else {
      buffer = buffer + "::";
    }
    const eo = rsExtraOffset(buffer, shape.usedWidth());
    const ns = shape.shrinkLeft(eo);
    if (ns === null) {
      return null;
    }
    const s = rewriteSegment(ctx, pc, seg, st, spanHi, ns);
    if (s === null) {
      return null;
    }
    buffer = buffer + s;
  }
  return buffer;
};

const rewriteSegment = (ctx: RsCtx, pc: i32, seg: i32, st: SegState, spanHi: i32, shape0: RsShape): string | null => {
  const ast = ctx.ast;
  let result = rsIdentStr(ctx, ast.d[seg]);
  const shape = shape0.offsetLeft(toI32(result.length));
  if (shape === null) {
    return null;
  }
  const args = ast.a[seg];
  if (args >= 0) {
    const gs = rsRewriteGenericArgs(ctx, args, shape, st.lo, spanHi);
    if (gs === null) {
      return null;
    }
    // rustfmt 1.10 drops empty generic args, inside macros too.
    if (ast.kind[args] === N_GARGS && ast.ln[args] > 0) {
      const sepSnippet = rsTrim(ctx.snippet(ctx.f.t.hi[ast.d[seg]], ast.lo[args]));
      const force = ctx.insideMacro && sepSnippet.startsWith("::");
      if (pc === PC_EXPR || force) {
        result = result + "::";
      }
      st.lo = ctx.spanAfter(st.lo, spanHi, "<");
    }
    result = result + gs;
  }
  return result;
};

/** rewrite_generic_args; [lo, hi) is the span for the angle brackets. */
export const rsRewriteGenericArgs = (ctx: RsCtx, args: i32, shape: RsShape, lo: i32, hi: i32): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[args];
  if (k === N_GARGS) {
    if (ast.ln[args] === 0) {
      return "";
    }
    const items: i32[] = [];
    for (let i = 0; i < ast.ln[args]; i++) {
      items.push(ast.kid(args, i));
    }
    return rsRewriteWithAngleBrackets(ctx, "", items, OC_SEGMENT_PARAM, shape, lo, hi);
  }
  if (k === N_PGARGS) {
    return formatFunctionType(ctx, args, ast.a[args], false, ast.lo[args], ast.hi[args], shape);
  }
  if (k === N_GARGS_ELIDED) {
    return "(..)";
  }
  return null;
};

/** Rewrite for SegmentParam (an angle-bracketed generic arg). */
export const rsRewriteSegmentParam = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (k === N_LIFETIME) {
    return rsRewriteLifetimeTok(ctx, ast.d[n]);
  }
  if (k === N_CONSTRAINT) {
    return rewriteConstraint(ctx, n, shape);
  }
  if (rsIsExprKind(k)) {
    return rsFormatExpr(ctx, n, EXPR_SUB, shape);
  }
  return rsRewriteTy(ctx, n, shape);
};

const rewriteConstraint = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  let result = rsIdentStr(ctx, ast.d[n]);
  const ga = ast.a[n];
  if (ga >= 0) {
    const budget = shape.width - toI32(result.length);
    if (budget < 0) {
      return null;
    }
    const sh = rsShapeLegacy(budget, shape.bi, shape.al + toI32(result.length));
    const gs = rsRewriteGenericArgs(ctx, ga, sh, ast.lo[ga], ast.hi[ga]);
    if (gs === null) {
      return null;
    }
    result = result + gs;
  }
  const isBound = ast.c[n] >= 0;
  result = result + (isBound ? ": " : " = ");
  const budget = shape.width - toI32(result.length);
  if (budget < 0) {
    return null;
  }
  const sh = rsShapeLegacy(budget, shape.bi, shape.al + toI32(result.length));
  let rw: string | null = null;
  if (isBound) {
    rw = rsRewriteBounds(ctx, ast.c[n], sh);
  } else if (ast.b[n] >= 0) {
    rw = rsRewriteTy(ctx, ast.b[n], sh);
  } else {
    rw = rsFormatExpr(ctx, ast.e[n], EXPR_SUB, sh);
  }
  if (rw === null) {
    return null;
  }
  return result + rw;
};

/** format_function_type: `decl` lists the input params (an N_PGARGS or N_FNDECL), `output` is -1 or a type. */
const formatFunctionType = (
  ctx: RsCtx,
  decl: i32,
  output: i32,
  variadic: boolean,
  spanLo: i32,
  spanHi: i32,
  shape: RsShape,
): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const tyShape = shape.offsetLeft(4);
  if (tyShape === null) {
    return null;
  }
  let out = "";
  if (output >= 0) {
    const ts = rsRewriteTy(ctx, output, tyShape);
    if (ts === null) {
      return null;
    }
    out = " -> " + ts;
  }
  const listShape = rsShapeIndented(shape.bi + cfg.tabSpaces, 0, cfg);
  const n = ast.ln[decl];
  const listLo = ctx.spanAfter(spanLo, spanHi, "(");
  let listStr = "";
  let tactic = DLT_HORIZONTAL;
  if (n === 0) {
    tactic = getTactics([], out, shape);
    const listHi = ctx.spanBefore(spanLo, spanHi, ")");
    const comment = rsTrim(ctx.snippet(listLo, listHi));
    if (comment.startsWith("//")) {
      listStr = rsIndentStrNl(cfg, listShape.bi, listShape.al) + comment + rsIndentStrNl(cfg, shape.bi, 0);
    } else {
      listStr = comment;
    }
  } else {
    const items = rsItemizeList(
      ctx,
      n,
      ")",
      ",",
      (i: i32): i32 => rsParamSpannedLo(ast, ast.kid(decl, i)),
      (i: i32): i32 => ast.hi[ast.b[ast.kid(decl, i)]],
      (i: i32): string | null => rsRewriteParam(ctx, ast.kid(decl, i), listShape),
      listLo,
      spanHi,
      false,
    );
    tactic = getTactics(items, out, shape);
    const fmt = new RsListFormatting(listShape, cfg);
    fmt.tactic = tactic;
    fmt.trailingSeparator = variadic ? ST_NEVER : ST_VERTICAL;
    fmt.endsWithNewline = tactic !== DLT_HORIZONTAL;
    fmt.preserveNewline = true;
    const ls = rsWriteList(items, fmt);
    if (ls === null) {
      return null;
    }
    listStr = ls;
  }
  let args = "";
  if (tactic === DLT_HORIZONTAL || n === 0) {
    args = "(" + listStr + ")";
  } else {
    args = "(" + rsIndentStrNl(cfg, listShape.bi, listShape.al) + listStr + rsIndentStrNl(cfg, shape.bi, 0) + ")";
  }
  if (out.length === 0 || rsLastLineWidth(args, cfg.tabSpaces) + rsFirstLineWidth(out) <= shape.width) {
    return args + out;
  }
  return args + "\n" + rsIndentStr(cfg, listShape.bi, listShape.al) + rsTrimStart(out);
};

const getTactics = (items: RsListItem[], output: string, shape: RsShape): i32 => {
  if (rsHasByte(output, 10)) {
    return DLT_VERTICAL;
  }
  let w = shape.width - (2 + toI32(output.length));
  if (w < 0) {
    w = 0;
  }
  return rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_COMMA, w);
};

/** The lo of a where predicate (Spanned: with attributes). */
export const rsWherePredLo = (ast: RsAst, p: i32): i32 => (ast.atn[p] > 0 ? ast.lo[ast.attr(p, 0)] : ast.lo[p]);

/** Rewrite for ast::WherePredicate. */
export const rsRewriteWherePred = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const attrsStr = rsRewriteNodeAttrs(ctx, p, shape);
  if (attrsStr === null) {
    return null;
  }
  const k = ast.kind[p];
  let pred: string | null = null;
  if (k === N_WPRED_BOUND) {
    const ts = rsRewriteTy(ctx, ast.a[p], shape);
    if (ts === null) {
      return null;
    }
    const binder = rsRewriteBoundParams(ctx, shape, ast.c[p]);
    const lhs = binder !== null ? `for<${binder}> ${ts}:` : `${ts}:`;
    pred = rsRewriteAssignRhs(ctx, lhs, ast.b[p], RHS_BOUNDS, shape);
  } else if (k === N_WPRED_REGION) {
    pred = rewriteBoundedLifetime(ctx, ast.d[p], ast.b[p], shape);
  } else if (k === N_WPRED_EQ) {
    ctx.unsupported("where equality predicate");
    return null;
  }
  if (pred === null) {
    return null;
  }
  let result = attrsStr;
  const na = ast.atn[p];
  if (na > 0) {
    const last = ast.attr(p, na - 1);
    if (rsContainsComment(ctx.snippet(ast.hi[last], ast.lo[p]))) {
      const isDoc = (ast.fl[last] & AT_DOC) !== 0;
      return rsCombineStrsWithMissingComments(ctx, result, pred, ast.hi[last], ast.lo[p], shape.withWidth(0), !isDoc);
    }
    // inline_attribute_width is 0: always a new line.
    result = result + rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
  }
  return result + pred;
};

const rewriteBoundedLifetime = (ctx: RsCtx, lt: i32, bounds: i32, shape: RsShape): string | null => {
  const result = rsRewriteLifetimeTok(ctx, lt);
  if (bounds < 0 || ctx.ast.ln[bounds] === 0) {
    return result;
  }
  const overhead = rsLastLineWidth(result, ctx.cfg.tabSpaces) + 2;
  const sh = shape.subWidth(overhead);
  if (sh === null) {
    return null;
  }
  const jb = joinBounds(ctx, sh, bounds, true, false);
  if (jb === null) {
    return null;
  }
  return result + ": " + jb;
};

export const rsRewriteLifetimeTok = (ctx: RsCtx, tok: i32): string => ctx.tokStr(tok);

/** Rewrite for GenericBound. */
const rewriteBound = (ctx: RsCtx, b: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[b];
  if (k === N_LIFETIME) {
    return rsRewriteLifetimeTok(ctx, ast.d[b]);
  }
  if (k === N_USE_BOUND) {
    const items: i32[] = [];
    for (let i = 0; i < ast.ln[b]; i++) {
      items.push(ast.kid(b, i));
    }
    return rsRewriteWithAngleBrackets(ctx, "use", items, OC_PRECISE, shape, ast.lo[b], ast.hi[b]);
  }
  const snippet = ctx.snippet(ast.lo[b], ast.hi[b]);
  const hasParen = snippet.startsWith("(") && snippet.endsWith(")");
  const s = rewritePolyTraitRef(ctx, b, shape);
  if (s === null) {
    return null;
  }
  return hasParen ? `(${s})` : s;
};

const rewritePolyTraitRef = (ctx: RsCtx, b: i32, shape0: RsShape): string | null => {
  const ast = ctx.ast;
  let binder = "";
  let shape = shape0;
  const bs = rsRewriteBoundParams(ctx, shape0, ast.c[b]);
  if (bs !== null) {
    const s1 = shape0.offsetLeft(toI32(bs.length) + 6);
    if (s1 === null) {
      return null;
    }
    shape = s1;
    binder = `for<${bs}> `;
  }
  const f = ast.fl[b];
  let constness = "";
  if ((f & TB_MAYBE_CONST) !== 0) {
    constness = "~const ";
  } else if ((f & TB_CONST) !== 0) {
    constness = "const ";
  }
  const asyncness = (f & TB_ASYNC) !== 0 ? "async " : "";
  const polarity = (f & TB_MAYBE) !== 0 ? "?" : (f & TB_NEGATIVE) !== 0 ? "!" : "";
  const sh = shape.offsetLeft(toI32(constness.length) + toI32(polarity.length));
  if (sh === null) {
    return null;
  }
  const ps = rsRewritePath(ctx, PC_TYPE, -1, ast.a[b], sh);
  if (ps === null) {
    return null;
  }
  return `${binder}${constness}${asyncness}${polarity}${ps}`;
};

/** Rewrite for GenericBounds (an N_BOUNDS node). */
export const rsRewriteBounds = (ctx: RsCtx, bounds: i32, shape: RsShape): string | null => {
  if (bounds < 0 || ctx.ast.ln[bounds] === 0) {
    return "";
  }
  return joinBounds(ctx, shape, bounds, true, false);
};

/** The Spanned span of a bound. */
const boundLo = (ast: RsAst, b: i32): i32 => ast.lo[b];
const boundHi = (ast: RsAst, b: i32): i32 => ast.hi[b];

const isTraitBound = (ast: RsAst, b: i32): boolean => ast.kind[b] !== N_LIFETIME;

/** join_bounds_inner's is_item_with_multi_items_array. */
const isItemWithMultiItemsArray = (ast: RsAst, b: i32): boolean => {
  const k = ast.kind[b];
  if (k === N_USE_BOUND) {
    return ast.ln[b] > 1;
  }
  if (k !== N_TRAIT_BOUND) {
    return false;
  }
  const path = ast.a[b];
  if (ast.ln[path] > 1) {
    return true;
  }
  const args = ast.a[ast.kid(path, 0)];
  return args >= 0 && ast.kind[args] === N_GARGS && ast.ln[args] > 1;
};

const joinBounds = (
  ctx: RsCtx,
  shape: RsShape,
  bounds: i32,
  needIndent: boolean,
  forceNewline: boolean,
): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const n = ast.ln[bounds];
  // is_generic_bounds_in_order.
  let lastTrait = -1;
  let firstLifetime = -1;
  for (let i = 0; i < n; i++) {
    const b = ast.kid(bounds, i);
    if (isTraitBound(ast, b)) {
      lastTrait = i;
    } else if (firstLifetime < 0) {
      firstLifetime = i;
    }
  }
  const inOrder = lastTrait < 0 || firstLifetime < 0 || lastTrait < firstLifetime;
  let strs = "";
  let prevTrailingLo = -1;
  let prevTrailingHi = -1;
  let prevExtendable = false;
  for (let i = 0; i < n; i++) {
    const item = ast.kid(bounds, i);
    let trailingLo = -1;
    let trailingHi = -1;
    if (i < n - 1) {
      const next = ast.kid(bounds, i + 1);
      const h = ctx.spanBefore(boundHi(ast, item), boundLo(ast, next), "+");
      trailingLo = boundHi(ast, item);
      trailingHi = h;
    }
    let leadingLo = -1;
    let hasLeadingComment = false;
    if (i > 0) {
      const prev = ast.kid(bounds, i - 1);
      leadingLo = ctx.spanAfter(boundHi(ast, prev), boundLo(ast, item), "+");
      hasLeadingComment = rsContainsComment(ctx.snippet(leadingLo, boundLo(ast, item)));
    }
    const prevHasTrailingComment =
      prevTrailingLo >= 0 && rsContainsComment(ctx.snippet(prevTrailingLo, prevTrailingHi));
    const sh = needIndent && forceNewline ? shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg) : shape;
    const ws = forceNewline && (!prevExtendable || !inOrder) ? rsIndentStrNl(cfg, sh.bi, sh.al) : " ";
    let joiner = ws + "+ ";
    if (hasLeadingComment) {
      joiner = rsTrimEnd(joiner);
    }
    if (prevHasTrailingComment) {
      joiner = rsTrimStart(joiner);
    }
    const boundStr = rewriteBound(ctx, item, sh);
    if (boundStr === null) {
      return null;
    }
    const extendable = !isTraitBound(ast, item) || rsLastLineExtendable(boundStr);
    let trailingStr = "";
    if (i === 0) {
      trailingStr = boundStr;
    } else if (hasLeadingComment) {
      const r = rsCombineStrsWithMissingComments(ctx, joiner, boundStr, leadingLo, boundLo(ast, item), sh, true);
      if (r === null) {
        return null;
      }
      trailingStr = r;
    } else {
      trailingStr = joiner + boundStr;
    }
    if (prevTrailingLo >= 0 && prevHasTrailingComment) {
      const r = rsCombineStrsWithMissingComments(ctx, strs, trailingStr, prevTrailingLo, prevTrailingHi, sh, true);
      if (r === null) {
        return null;
      }
      strs = r;
    } else {
      strs = strs + trailingStr;
    }
    prevTrailingLo = trailingLo;
    prevTrailingHi = trailingHi;
    prevExtendable = extendable;
  }
  // Retry with a forced newline when the result is multiline or too wide
  // and, at style edition 2024, it has more than one bound or its one trait
  // bound holds a list with more than one item.
  const overflows = rsHasByte(strs, 10) || toI32(strs.length) > shape.width;
  let retry = false;
  if (cfg.styleEdition <= 2021) {
    retry = !forceNewline && n > 1 && overflows;
  } else if (!forceNewline && overflows) {
    retry = n > 1 || isItemWithMultiItemsArray(ast, ast.kid(bounds, 0));
  }
  if (retry) {
    return joinBounds(ctx, shape, bounds, needIndent, true);
  }
  return strs;
};

/** rewrite_bound_params over a `for<...>` binder node (N_GPARAMS) or -1; null when empty. */
export const rsRewriteBoundParams = (ctx: RsCtx, shape: RsShape, binder: i32): string | null => {
  if (binder < 0) {
    return null;
  }
  const ast = ctx.ast;
  let result = "";
  for (let i = 0; i < ast.ln[binder]; i++) {
    const s = rsRewriteGenericParam(ctx, ast.kid(binder, i), shape);
    if (s === null) {
      return null;
    }
    if (i > 0) {
      result = result + ", ";
    }
    result = result + s;
  }
  return result.length === 0 ? null : result;
};

/** Rewrite for ast::GenericParam. */
export const rsRewriteGenericParam = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const a0 = rsRewriteNodeAttrs(ctx, p, shape);
  let result = a0 === null ? "" : a0;
  const hasAttrs = result.length !== 0;
  let param = "";
  const f = ast.fl[p];
  const paramStart = ast.lo[p];
  if ((f & GP_CONST) !== 0) {
    param = "const " + rsIdentStr(ctx, ast.d[p]) + ": ";
    const ts = rsRewriteTy(ctx, ast.a[p], shape);
    if (ts === null) {
      return null;
    }
    param = param + ts;
    const def = ast.c[p];
    if (def >= 0) {
      param = param + " = ";
      const budget = shape.width - toI32(param.length);
      if (budget < 0) {
        return null;
      }
      const rw = rsFormatExpr(ctx, def, EXPR_SUB, rsShapeLegacy(budget, shape.bi, shape.al));
      if (rw === null) {
        return null;
      }
      param = param + rw;
    }
  } else {
    param = rsIdentStr(ctx, ast.d[p]);
  }
  const bounds = ast.b[p];
  if (bounds >= 0 && ast.ln[bounds] > 0) {
    param = param + ": ";
    const bs = rsRewriteBounds(ctx, bounds, shape);
    if (bs === null) {
      return null;
    }
    param = param + bs;
  }
  if ((f & GP_TYPE) !== 0 && ast.c[p] >= 0) {
    param = param + " = ";
    const budget = shape.width - toI32(param.length);
    if (budget < 0) {
      return null;
    }
    const rw = rsRewriteTy(ctx, ast.c[p], rsShapeLegacy(budget, shape.bi, shape.al + toI32(param.length)));
    if (rw === null) {
      return null;
    }
    param = param + rw;
  }
  const na = ast.atn[p];
  if (na > 0) {
    const last = ast.attr(p, na - 1);
    if (rsContainsComment(ctx.snippet(ast.hi[last], paramStart))) {
      return rsCombineStrsWithMissingComments(
        ctx,
        result,
        param,
        ast.hi[last],
        paramStart,
        shape,
        (ast.fl[last] & AT_DOC) === 0,
      );
    }
    if ((ast.fl[last] & AT_DOC) !== 0) {
      result = result + rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
    } else if (hasAttrs) {
      result = result + " ";
    }
  }
  return result + param;
};

/** The Spanned span of a GenericParam. */
export const rsGenericParamLo = (ast: RsAst, p: i32): i32 => (ast.atn[p] > 0 ? ast.lo[ast.attr(p, 0)] : ast.lo[p]);
export const rsGenericParamHi = (ctx: RsCtx, p: i32): i32 => {
  const ast = ctx.ast;
  const b = ast.b[p];
  const hi = b >= 0 && ast.ln[b] > 0 ? ast.hi[ast.kid(b, ast.ln[b] - 1)] : ctx.f.t.hi[ast.d[p]];
  let tyHi = hi;
  const f = ast.fl[p];
  if ((f & GP_TYPE) !== 0 && ast.c[p] >= 0) {
    tyHi = ast.hi[ast.c[p]];
  } else if ((f & GP_CONST) !== 0) {
    tyHi = ast.hi[ast.a[p]];
  }
  return hi > tyHi ? hi : tyHi;
};

/** Rewrite of a trait ref (a path type, as in `impl Trait for`). */
export const rsRewriteTraitRefTy = (ctx: RsCtx, ty: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  return rsRewritePath(ctx, PC_TYPE, -1, ast.b[ty], shape);
};

/** Rewrite for ast::Ty. */
export const rsRewriteTy = (ctx: RsCtx, ty: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[ty];
  if (k === N_TY_DYN) {
    let sh: RsShape | null = shape;
    let prefix = "";
    if ((ast.fl[ty] & TY_DYN) !== 0) {
      sh = shape.offsetLeft(4);
      prefix = "dyn ";
    }
    if (sh === null) {
      return null;
    }
    const bounds = ast.b[ty];
    const res0 = rsRewriteBounds(ctx, bounds, sh);
    if (res0 === null) {
      return null;
    }
    let res = res0;
    if (ctx.insideMacro && ast.ln[bounds] === 1 && ctx.snip(ty).endsWith("+") && !res.endsWith("+")) {
      res = res + "+";
    }
    return prefix + res;
  }
  if (k === N_TY_PTR) {
    const prefix = (ast.fl[ty] & MUT) !== 0 ? "*mut " : "*const ";
    return rsRewriteUnaryPrefix(ctx, prefix, ast.a[ty], shape);
  }
  if (k === N_TY_REF) {
    return rewriteRefTy(ctx, ty, shape);
  }
  if (k === N_TY_PAREN) {
    if (ctx.cfg.styleEdition <= 2021) {
      if (shape.width < 2) {
        return null;
      }
      const s = rsRewriteTy(ctx, ast.a[ty], rsShapeLegacy(shape.width - 2, shape.bi, shape.al + 1));
      return s === null ? null : `(${s})`;
    }
    // 2 = ()
    const sh = shape.subWidth(2);
    if (sh !== null) {
      const s = rsRewriteTy(ctx, ast.a[ty], sh);
      if (s !== null && !rsHasByte(s, 10)) {
        return `(${s})`;
      }
    }
    const indentStr = rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
    const bs = shape.blockIndent(ctx.cfg.tabSpaces).withMaxWidth(ctx.cfg);
    const rw = rsRewriteTy(ctx, ast.a[ty], bs);
    if (rw === null) {
      return null;
    }
    return "(" + rsIndentStrNl(ctx.cfg, bs.bi, bs.al) + rw + indentStr + ")";
  }
  if (k === N_TY_SLICE) {
    if (shape.width < 4) {
      return null;
    }
    const s = rsRewriteTy(ctx, ast.a[ty], rsShapeLegacy(shape.width - 4, shape.bi, shape.al + 1));
    return s === null ? null : `[${s}]`;
  }
  if (k === N_TY_TUP) {
    const items: i32[] = [];
    for (let i = 0; i < ast.ln[ty]; i++) {
      items.push(ast.kid(ty, i));
    }
    return rsRewriteTuple(ctx, items, OC_TY, ast.lo[ty], ast.hi[ty], shape, items.length === 1);
  }
  if (k === N_TY_PATH) {
    return rsRewritePath(ctx, PC_TYPE, ast.a[ty], ast.b[ty], shape);
  }
  if (k === N_TY_ARRAY) {
    return rsRewritePair(ctx, ast.a[ty], ast.b[ty], new RsPairParts("[", "; ", "]"), shape, SPB_BACK);
  }
  if (k === N_TY_INFER) {
    return shape.width >= 1 ? "_" : null;
  }
  if (k === N_TY_FN) {
    return rewriteFnPtr(ctx, ty, shape);
  }
  if (k === N_TY_NEVER) {
    return "!";
  }
  if (k === N_TY_MAC) {
    return rsRewriteMacro(ctx, ast.a[ty], shape, rsMacroPosExpr());
  }
  if (k === N_TY_IMPLICIT_SELF) {
    return "";
  }
  if (k === N_TY_IMPL) {
    const b = ast.b[ty];
    if (ast.ln[b] === 0) {
      return "impl";
    }
    // At style edition 2024 the bounds are joined without need_indent.
    const s = ctx.cfg.styleEdition <= 2021 ? rsRewriteBounds(ctx, b, shape) : joinBounds(ctx, shape, b, false, false);
    if (s === null) {
      return null;
    }
    return s.length === 0 ? "impl" : "impl " + s;
  }
  if (k === N_TY_CVARARGS) {
    return "...";
  }
  ctx.unsupported("type kind");
  return null;
};

const rewriteRefTy = (ctx: RsCtx, ty: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const isMut = (ast.fl[ty] & MUT) !== 0;
  const mutStr = isMut ? "mut " : "";
  const mutLen = toI32(mutStr.length);
  let result = "&";
  const refHi = ctx.spanAfter(ast.lo[ty], ast.hi[ty], "&");
  let cmntLo = refHi;
  const lt = ast.d[ty];
  if (lt >= 0) {
    if (shape.width < 2 + mutLen) {
      return null;
    }
    const ltStr = rsRewriteLifetimeTok(ctx, lt);
    const ltLo = ctx.f.t.lo[lt];
    if (rsContainsComment(ctx.snippet(cmntLo, ltLo))) {
      const r = rsCombineStrsWithMissingComments(ctx, result, ltStr, cmntLo, ltLo, shape, true);
      if (r === null) {
        return null;
      }
      result = r;
    } else {
      result = result + ltStr;
    }
    result = result + " ";
    cmntLo = ctx.f.t.hi[lt];
  }
  if (isMut) {
    const mutHi = ctx.spanAfter(ast.lo[ty], ast.hi[ty], "mut");
    const bm = mutHi - 3;
    if (rsContainsComment(ctx.snippet(cmntLo, bm))) {
      const r = rsCombineStrsWithMissingComments(ctx, rsTrimEnd(result), mutStr, cmntLo, bm, shape, true);
      if (r === null) {
        return null;
      }
      result = r;
    } else {
      result = result + mutStr;
    }
    cmntLo = mutHi;
  }
  const inner = ast.a[ty];
  const tyLo = ast.lo[inner];
  if (rsContainsComment(ctx.snippet(cmntLo, tyLo))) {
    const ts = rsRewriteTy(ctx, inner, shape);
    if (ts === null) {
      return null;
    }
    return rsCombineStrsWithMissingComments(ctx, rsTrimEnd(result), ts, cmntLo, tyLo, shape, true);
  }
  const used = rsLastLineWidth(result, cfg.tabSpaces);
  if (shape.width < used) {
    return null;
  }
  const ts = rsRewriteTy(ctx, inner, rsShapeLegacy(shape.width - used, shape.bi, shape.al + used));
  if (ts === null) {
    return null;
  }
  return result + ts;
};

const rewriteFnPtr = (ctx: RsCtx, ty: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  let result = "";
  const bs = rsRewriteBoundParams(ctx, shape, ast.c[ty]);
  if (bs !== null) {
    result = "for<" + bs + "> ";
  }
  const f = ast.fl[ty];
  if ((f & FN_UNSAFE) !== 0) {
    result = result + "unsafe ";
  }
  result = result + rsFormatExtern(ctx, (f & FN_EXTERN) !== 0, ast.x[ty]);
  result = result + "fn";
  const fs = shape.offsetLeft(toI32(result.length));
  if (fs === null) {
    return null;
  }
  const decl = ast.b[ty];
  const n = ast.ln[decl];
  const variadic = n > 0 && ast.kind[ast.b[ast.kid(decl, n - 1)]] === N_TY_CVARARGS;
  // rustfmt 1.10 looks for the parameter list from the start of the whole type.
  const rw = formatFunctionType(ctx, decl, ast.a[decl], variadic, ast.lo[ty], ast.hi[ty], fs);
  if (rw === null) {
    return null;
  }
  return result + rw;
};

/** can_be_overflowed_type. */
export const rsCanBeOverflowedType = (ctx: RsCtx, ty: i32, len: i32): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[ty];
  if (k === N_TY_TUP) {
    return len === 1;
  }
  if (k === N_TY_REF || k === N_TY_PTR) {
    return rsCanBeOverflowedType(ctx, ast.a[ty], len);
  }
  return false;
};

/** Rewrite for a PreciseCapturingArg (a lifetime or a path type). */
export const rsRewritePreciseArg = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (ast.kind[n] === N_LIFETIME) {
    return rsRewriteLifetimeTok(ctx, ast.d[n]);
  }
  return rsRewritePath(ctx, PC_TYPE, -1, ast.b[n], shape);
};

export const rsIsTraitBoundNode = (ast: RsAst, b: i32): boolean => ast.kind[b] === N_TRAIT_BOUND;
