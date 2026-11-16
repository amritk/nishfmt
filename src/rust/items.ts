// Formatting top-level items: functions, structs, enums, traits, impls,
// type aliases, statics, extern blocks; and `let` statements.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): items.rs, vertical.rs.

import {
  AT_DOC,
  AT_INNER,
  FN_EXTERN,
  IT_AUTO,
  IT_CONST,
  IT_DEFAULT,
  IT_MUT,
  IT_NEGATIVE,
  IT_SAFE,
  IT_UNSAFE,
  N_CONST,
  N_FN,
  N_LOCAL,
  N_MAC_ITEM,
  N_STATIC,
  N_TY_IMPL,
  N_TY_IMPLICIT_SELF,
  N_TY_INFER,
  N_TYPE_ALIAS,
  N_UNION,
  PA_MUT,
  PA_REF_MUT,
  PA_SELF_EXPLICIT,
  PA_SELF_REF,
  PA_SELF_VALUE,
  RsAst,
  VD_STRUCT,
  VD_TUPLE,
  VD_UNIT,
  VIS_CRATE,
  VIS_RESTRICTED,
} from "./ast";
import { rsAttrsContainSkip, rsRewriteNodeAttrs, rsRewriteAttrs } from "./attr";
import {
  rsCombineStrsWithMissingComments,
  rsContainsComment,
  rsFindUncommented,
  rsFirstLineWidth,
  rsIsLastCommentBlock,
  rsLastLineUsedWidth,
  rsLastLineWidth,
  rsRecoverCommentRemoved,
  rsRecoverMissingCommentInSpan,
  rsRewriteMissingComment,
  rsTrimmedLastLineWidth,
} from "./comment";
import { RsCtx } from "./context";
import {
  RHS_BOUNDS,
  RHS_EXPR,
  RHS_OPAQUE,
  RHS_TRAIT_ALIAS,
  RHS_TY,
  RT_ALLOW_OVERFLOW,
  RT_DEFAULT,
  RT_FORCE_NEXT_LINE_WITHOUT_INDENT,
  rsFormatStmtOfBlock,
  rsIsEmptyBlock,
  rsRewriteAssignRhs,
  rsRewriteAssignRhsWith,
  rsRewriteAssignRhsWithComments,
  rsRewriteElseKwWithComments,
  rsRewriteExpr,
  rsRewriteLetElseBlock,
} from "./expr";
import {
  DLT_HORIZONTAL,
  DLT_VERTICAL,
  LT_HORIZONTAL_VERTICAL,
  RsListFormatting,
  RsListItem,
  SEP_COMMA,
  ST_ALWAYS,
  ST_NEVER,
  ST_VERTICAL,
  rsDefinitiveTactic,
  rsItemizeList,
  rsWriteList,
} from "./lists";
import { rsMacroPosItem, rsRewriteMacro } from "./macros";
import { OC_FIELD_DEF, OC_GENERIC_PARAM, rsRewriteWithAngleBrackets, rsRewriteWithParens } from "./overflow";
import { rsRewritePat } from "./patterns";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeIndented, rsShapeLegacy } from "./shape";
import { rsHasByte, rsIndexOfByte, rsIsBlank, rsLines, rsTrim, rsTrimEnd, rsTrimStart, rsWidth } from "./str";
import { rsRewriteBounds, rsRewriteLifetimeTok, rsRewriteTraitRefTy, rsRewriteTy, rsRewriteWherePred, rsWherePredLo } from "./types";
import {
  rsFirstLineContainsSingleLineComment,
  rsFnHeaderStr,
  rsFormatExtern,
  rsFormatVisibility,
  rsIdentStr,
  rsIsAttributesExtendable,
  rsLastLineContainsSingleLineComment,
  rsLoWithAttrs,
} from "./utils";
import { RsVisitor } from "./visitor";

// ---------------------------------------------------------------- Local (let)

/** Rewrite for ast::Local. */
export const rsRewriteLocal = (ctx: RsCtx, s: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  if (rsAttrsContainSkip(ctx, s)) {
    return null;
  }
  const let_ = "let ";
  const attrsStr = rsRewriteNodeAttrs(ctx, s, shape);
  if (attrsStr === null) {
    return null;
  }
  let result = "";
  if (attrsStr.length === 0) {
    result = let_;
  } else {
    const lastAttr = ast.attr(s, ast.atn[s] - 1);
    const r = rsCombineStrsWithMissingComments(ctx, attrsStr, let_, ast.hi[lastAttr], ast.lo[s], shape, false);
    if (r === null) {
      return null;
    }
    result = r;
  }
  const patShape0 = shape.offsetLeft(toI32(let_.length));
  if (patShape0 === null) {
    return null;
  }
  const patShape = patShape0.subWidth(1);
  if (patShape === null) {
    return null;
  }
  const pat = ast.a[s];
  const patStr = rsRewritePat(ctx, pat, patShape);
  if (patStr === null) {
    return null;
  }
  result = result + patStr;
  let infix = "";
  const ty = ast.b[s];
  if (ty >= 0) {
    const sep = ": ";
    const base = rsHasByte(patStr, 10) ? shape.withMaxWidth(cfg) : shape;
    const s1 = base.offsetLeft(rsLastLineWidth(result, cfg.tabSpaces) + toI32(sep.length));
    if (s1 === null) {
      return null;
    }
    const tyShape = s1.subWidth(2);
    if (tyShape === null) {
      return null;
    }
    const rw = rsRewriteTy(ctx, ty, tyShape);
    if (rw === null) {
      return null;
    }
    infix = infix + sep + rw;
  }
  const init = ast.c[s];
  if (init >= 0) {
    infix = infix + " =";
  }
  result = result + infix;
  if (init >= 0) {
    const nested = shape.subWidth(1);
    if (nested === null) {
      return null;
    }
    const r = rsRewriteAssignRhs(ctx, result, init, RHS_EXPR, nested);
    if (r === null) {
      return null;
    }
    result = r;
    const block = ast.x[s];
    if (block >= 0) {
      const ekLo = ast.hi[init];
      const ekHi = ast.lo[block];
      const forceNewlineElse = rsHasByte(patStr, 10) || !sameLineElseKwAndBrace(ctx, result, ekLo, ekHi, nested);
      const elseKw = rsRewriteElseKwWithComments(forceNewlineElse, true, ctx, ekLo, ekHi, shape);
      result = result + elseKw;
      const maxWidth = shape.width < cfg.singleLineLetElseMaxWidth ? shape.width : cfg.singleLineLetElseMaxWidth;
      let avail = maxWidth - toI32(result.length);
      if (avail < 0) {
        avail = 0;
      }
      const allowSingle = !forceNewlineElse && avail > 0 && allowSingleLineLetElseBlock(ast, result, block);
      const rwElse0 = rsRewriteLetElseBlock(ctx, block, allowSingle, shape);
      if (rwElse0 === null) {
        return null;
      }
      let rwElse = rwElse0;
      const singleLineElse = !rsHasByte(rwElse, 10);
      const exceeds = toI32(rwElse.length) + 1 > avail;
      if (allowSingle && singleLineElse && exceeds) {
        const rwElse1 = rsRewriteLetElseBlock(ctx, block, false, shape);
        if (rwElse1 === null) {
          return null;
        }
        rwElse = rwElse1;
      }
      result = result + rwElse;
    }
  }
  return result + ";";
};

const sameLineElseKwAndBrace = (ctx: RsCtx, initStr: string, ekLo: i32, ekHi: i32, initShape: RsShape): boolean => {
  if (!rsHasByte(initStr, 10)) {
    let w = initShape.width - toI32(initStr.length);
    if (w < 0) {
      w = 0;
    }
    return w >= 7;
  }
  if (!(initStr.endsWith(")") || initStr.endsWith("]") || initStr.endsWith("}"))) {
    return false;
  }
  if (rsTrim(ctx.snippet(ekLo, ekHi)) !== "else") {
    return false;
  }
  const indent = rsIndentStr(ctx.cfg, initShape.bi, initShape.al);
  const ls = rsLines(initStr);
  const last = ls[ls.length - 1];
  if (!last.startsWith(indent)) {
    return false;
  }
  const rest = last.slice(toI32(indent.length), toI32(last.length));
  return !(rest.length > 0 && (rest.charCodeAt(0) === 32 || rest.charCodeAt(0) === 9 || rest.charCodeAt(0) === 10 || rest.charCodeAt(0) === 13));
};

const allowSingleLineLetElseBlock = (ast: RsAst, result: string, block: i32): boolean => {
  if (rsHasByte(result, 10)) {
    return false;
  }
  return ast.ln[block] <= 1;
};

// ---------------------------------------------------------------- extern blocks

/** format_foreign_mod / format_item. */
export const rsFormatForeignMod = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const ctx = v.ctx();
  if ((ast.fl[item] & IT_UNSAFE) !== 0) {
    v.pushStr("unsafe ");
  }
  v.pushStr(rsFormatExtern(ctx, true, ast.x[item]));
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const snippet = ctx.snippet(lo, hi);
  const bracePos = rsFindUncommented(snippet, "{");
  if (bracePos < 0) {
    v.f.broken = true;
    return;
  }
  v.pushStr("{");
  const n = ast.ln[item];
  if (n > 0 || rsContainsComment(snippet.slice(bracePos, toI32(snippet.length)))) {
    v.lastPos = lo + bracePos + 1;
    v.blockIndent();
    for (let i = 0; i < n; i++) {
      formatForeignItem(v, ast.kid(item, i));
    }
    v.formatMissingNoIndent(hi - 1);
    v.blockUnindent();
    v.pushStr(v.indentStr());
  }
  v.pushStr("}");
  v.lastPos = hi;
};

const formatForeignItem = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const rw = rsRewriteForeignItem(v.ctx(), item, v.shape());
  const hi = ast.hi[item];
  const lo = ast.atn[item] === 0 ? ast.lo[item] : ast.lo[ast.attr(item, 0)];
  v.pushRewrite(lo, hi, rw);
  v.lastPos = hi;
};

/** Rewrite for ast::ForeignItem. */
const rsRewriteForeignItem = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const attrsStr = rsRewriteNodeAttrs(ctx, item, shape);
  if (attrsStr === null) {
    return null;
  }
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const k = ast.kind[item];
  let itemStr: string | null = null;
  if (k === N_FN) {
    if (ast.c[item] >= 0) {
      const sub = new RsVisitor(ctx.f);
      sub.bi = shape.bi;
      sub.al = shape.al;
      sub.lastPos = lo;
      visitFn(sub, item);
      sub.giveTo(ctx);
      itemStr = String.fromBytes(sub.buf.buf, 0, sub.buf.n);
    } else {
      const fb = rewriteFnBase(ctx, shape.bi, shape.al, item, lo, hi - 1, FBS_NONE);
      itemStr = fb === null ? null : fb.result + ";";
    }
  } else if (k === N_STATIC) {
    const vis = rsFormatVisibility(ctx, ast.e[item]);
    const f = ast.fl[item];
    const safety = (f & IT_UNSAFE) !== 0 ? "unsafe " : (f & IT_SAFE) !== 0 ? "safe " : "";
    const mutStr = (f & IT_MUT) !== 0 ? "mut " : "";
    const prefix = `${vis}${safety}static ${mutStr}${rsIdentStr(ctx, ast.d[item])}:`;
    const sh = shape.subWidth(1);
    if (sh === null) {
      return null;
    }
    const r = rsRewriteAssignRhs(ctx, prefix, ast.b[item], RHS_TY, sh);
    itemStr = r === null ? null : r + ";";
  } else if (k === N_TYPE_ALIAS) {
    itemStr = rsRewriteTypeAlias(ctx, item, shape.bi, shape.al, IVK_FOREIGN);
  } else if (k === N_MAC_ITEM) {
    itemStr = rsRewriteMacro(ctx, ast.a[item], shape, rsMacroPosItem());
  } else {
    ctx.unsupported("foreign item");
    return null;
  }
  if (itemStr === null) {
    return null;
  }
  const mlo = ast.atn[item] === 0 ? lo : ast.hi[ast.attr(item, ast.atn[item] - 1)];
  return rsCombineStrsWithMissingComments(ctx, attrsStr, itemStr, mlo, lo, shape, false);
};

// ---------------------------------------------------------------- functions

export const FBS_SAME_LINE: i32 = 0;
export const FBS_NEXT_LINE: i32 = 1;
export const FBS_NONE: i32 = 2;

/** visit_item / visit_assoc_item for a fn: with a body or required. */
export const rsVisitFnItem = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  if (ast.c[item] >= 0) {
    visitFn(v, item);
  } else {
    const rw = rewriteRequiredFn(v, item);
    v.pushRewrite(ast.lo[item], ast.hi[item], rw);
  }
};

/** visit_fn: the signature, then the body block. */
const visitFn = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const block = ast.c[item];
  const lo = ast.lo[item];
  const rw = rewriteFnBeforeBlock(v, item, lo, ast.lo[block]);
  if (rw !== null) {
    v.formatMissingWithIndent(lo);
    const sl = singleLineFn(v, rw.result, block);
    if (sl !== null) {
      v.pushStr(sl);
      v.lastPos = ast.hi[item];
      return;
    }
    v.pushStr(rw.result);
    if (rw.braceStyle === FBS_SAME_LINE) {
      v.pushStr(" ");
    } else {
      v.pushStr(v.indentStrNl());
    }
    v.lastPos = ast.lo[block];
  } else {
    v.formatMissing(ast.lo[block]);
  }
  v.visitBlock(block, true);
};

class FnBeforeBlock {
  result: string;
  braceStyle: i32;
  constructor(result: string, braceStyle: i32) {
    this.result = result;
    this.braceStyle = braceStyle;
  }
}

const whereOf = (ast: RsAst, item: i32): i32 => ast.a[ast.a[item]];

const newlineForBrace = (ast: RsAst, w: i32): i32 => (ast.ln[w] > 0 ? FBS_NEXT_LINE : FBS_SAME_LINE);

const rewriteFnBeforeBlock = (v: RsVisitor, item: i32, lo: i32, hi: i32): FnBeforeBlock | null => {
  const ctx = v.ctx();
  const ast = v.ast;
  let bs = newlineForBrace(ast, whereOf(ast, item));
  const fb = rewriteFnBase(ctx, v.bi, v.al, item, lo, hi, bs);
  if (fb === null) {
    return null;
  }
  if (fb.forceNewlineBrace || rsLastLineWidth(fb.result, ctx.cfg.tabSpaces) + 2 > v.shape().width) {
    bs = FBS_NEXT_LINE;
  }
  return new FnBeforeBlock(fb.result, bs);
};

const rewriteRequiredFn = (v: RsVisitor, item: i32): string | null => {
  const ast = v.ast;
  const ctx = v.ctx();
  const fb = rewriteFnBase(ctx, v.bi, v.al, item, ast.lo[item], ast.hi[item] - 1, FBS_NONE);
  if (fb === null) {
    return null;
  }
  let result = fb.result;
  if (fb.endsWithComment) {
    result = result + rsIndentStrNl(ctx.cfg, v.bi, v.al);
  }
  return result + ";";
};

const singleLineFn = (v: RsVisitor, fnStr: string, block: i32): string | null => {
  const ast = v.ast;
  // Inner attributes of the body block count as the fn's.
  let hasInner = false;
  for (let i = 0; i < ast.atn[block]; i++) {
    if ((ast.fl[ast.attr(block, i)] & AT_INNER) !== 0) {
      hasInner = true;
    }
  }
  if (rsHasByte(fnStr, 10) || hasInner) {
    return null;
  }
  const ctx = v.ctx();
  if (
    rsIsEmptyBlock(ctx, block) &&
    v.bi + v.al + toI32(fnStr.length) + 3 <= ctx.cfg.maxWidth &&
    !rsLastLineContainsSingleLineComment(fnStr)
  ) {
    return fnStr + " {}";
  }
  // fn_single_line is off.
  return null;
};

class FnBase {
  result: string;
  endsWithComment: boolean;
  forceNewlineBrace: boolean;
  constructor(result: string, endsWithComment: boolean, forceNewlineBrace: boolean) {
    this.result = result;
    this.endsWithComment = endsWithComment;
    this.forceNewlineBrace = forceNewlineBrace;
  }
}

/** The return type's span end: `-> Ty` or the FnRetTy::Default span (just after `)`). */
const retSpanHi = (ast: RsAst, decl: i32): i32 => {
  const out = ast.a[decl];
  return out >= 0 ? ast.hi[out] : ast.hi[decl];
};

/** rewrite of FnRetTy. */
const rewriteFnRetTy = (ctx: RsCtx, decl: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const out = ast.a[decl];
  if (out < 0) {
    return "";
  }
  if (shape.width < 3) {
    return null;
  }
  const r = rsRewriteTy(ctx, out, rsShapeLegacy(shape.width - 3, shape.bi, shape.al + 3));
  return r === null ? null : "-> " + r;
};

/** rewrite_fn_base for N_FN `item`, span [lo, hi). */
const rewriteFnBase = (ctx: RsCtx, bi: i32, al: i32, item: i32, lo: i32, hi: i32, fbs: i32): FnBase | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  let forceNewlineBrace = false;
  const g = ast.a[item];
  const w = ast.a[g];
  const decl = ast.b[item];
  let result = rsFnHeaderStr(ctx, ast.e[item], ast.fl[item], ast.x[item]) + "fn ";
  const overhead = fbs === FBS_SAME_LINE ? 4 : 2;
  const usedWidth = rsLastLineUsedWidth(result, bi + al, cfg.tabSpaces);
  const olb0 = ctx.budget(usedWidth + overhead);
  const shape = new RsShape(olb0, bi, al, usedWidth);
  const genericsStr = rsRewriteGenerics(ctx, rsIdentStr(ctx, ast.d[item]), g, shape);
  if (genericsStr === null) {
    return null;
  }
  result = result + genericsStr;
  const gls = rsLines(genericsStr);
  const snuggleAngle = gls.length > 0 && toI32(rsTrimStart(gls[gls.length - 1]).length) === 1;
  const retStr = rewriteFnRetTy(ctx, decl, rsShapeIndented(bi, al, cfg));
  if (retStr === null) {
    return null;
  }
  const multiLineRet = rsHasByte(retStr, 10);
  const retStrLen = multiLineRet ? 0 : toI32(retStr.length);
  const bud = computeBudgetsForParams(ctx, result, bi, al, retStrLen, fbs, multiLineRet);
  const oneLineBudget = bud[0];
  const multiLineBudget = bud[1];
  let pbi = bud[2];
  let pal = bud[3];
  if (snuggleAngle && oneLineBudget < 0) {
    return null;
  }
  result = result + "(";
  const np = ast.ln[decl];
  let paramsEnd = 0;
  if (np === 0) {
    paramsEnd = ctx.spanAfter(ast.hi[g], hi, ")");
  } else {
    const last = ast.kid(decl, np - 1);
    paramsEnd = ctx.spanAfter(rsParamSpanHi(ast, last), hi, ")");
  }
  const paramsLo = ctx.spanAfter(ast.hi[g], hi, "(");
  const lastTy = np > 0 ? ast.b[ast.kid(decl, np - 1)] : -1;
  const variadic = lastTy >= 0 && ast.kind[lastTy] === 64; // N_TY_CVARARGS
  const paramStr = rewriteParams(ctx, decl, oneLineBudget, multiLineBudget, bi, al, pbi, pal, paramsLo, paramsEnd, variadic);
  if (paramStr === null) {
    return null;
  }
  const putParamsInBlock = (rsHasByte(paramStr, 10) || toI32(paramStr.length) > oneLineBudget) && np > 0;
  let paramsLastLineContainsComment = false;
  if (putParamsInBlock) {
    pbi = bi + cfg.tabSpaces;
    pal = al;
    result = result + rsIndentStrNl(cfg, pbi, pal) + paramStr + rsIndentStrNl(cfg, bi, al) + ")";
  } else {
    result = result + paramStr;
    const uw = rsLastLineUsedWidth(result, bi + al, cfg.tabSpaces) + rsFirstLineWidth(retStr);
    const closingOverflow = np === 0 && uw + 1 > cfg.maxWidth;
    const pls = rsLines(paramStr);
    paramsLastLineContainsComment = pls.length > 0 && pls[pls.length - 1].indexOf("//") >= 0;
    if (closingOverflow || paramsLastLineContainsComment) {
      result = result + rsIndentStrNl(cfg, bi, al);
    }
    result = result + ")";
  }
  if (ast.a[decl] >= 0) {
    let retShouldIndent = false;
    if (putParamsInBlock || np === 0) {
      retShouldIndent = false;
    } else if (paramsLastLineContainsComment) {
      retShouldIndent = false;
    } else if (rsHasByte(result, 10) || multiLineRet) {
      retShouldIndent = true;
    } else {
      let sigLength = toI32(result.length) + bi + al + retStrLen + 1;
      if (ast.ln[w] === 0) {
        sigLength += 2;
      }
      retShouldIndent = sigLength > cfg.maxWidth;
    }
    let retShape: RsShape = rsShapeIndented(bi, al, cfg);
    if (retShouldIndent) {
      let ibi = pbi;
      let ial = pal;
      if (paramStr.length === 0) {
        forceNewlineBrace = true;
        ibi = bi;
        ial = al + 4;
      }
      result = result + rsIndentStrNl(cfg, ibi, ial);
      retShape = rsShapeIndented(ibi, ial, cfg);
    } else {
      result = result + " ";
      const rs = rsShapeIndented(bi, al, cfg);
      const o = rs.offsetLeft(rsLastLineWidth(result, cfg.tabSpaces));
      retShape = o === null ? rs : o;
    }
    if (multiLineRet || retShouldIndent) {
      const r2 = rewriteFnRetTy(ctx, decl, retShape);
      if (r2 === null) {
        return null;
      }
      result = result + r2;
    } else {
      result = result + retStr;
    }
    if (ast.ln[w] === 0) {
      const snippetLo = retSpanHi(ast, decl);
      const snippet = ctx.snippet(snippetLo, hi);
      let i = 0;
      while (i < toI32(snippet.length) && snippet.charCodeAt(i) === 32) {
        i++;
      }
      const startsNl = i < toI32(snippet.length) && (snippet.charCodeAt(i) === 10 || (snippet.charCodeAt(i) === 13 && i + 1 < toI32(snippet.length) && snippet.charCodeAt(i + 1) === 10));
      let j = toI32(snippet.length) - 1;
      while (j >= 0 && snippet.charCodeAt(j) === 32) {
        j--;
      }
      const endsNl = j >= 0 && snippet.charCodeAt(j) === 10;
      const t = rsTrim(snippet);
      if (t.length !== 0) {
        result = result + (startsNl ? "\n" : " ") + t;
        if (endsNl) {
          forceNewlineBrace = true;
        }
      }
    }
  }
  const posBeforeWhere = ast.a[decl] >= 0 ? ast.hi[ast.a[decl]] : paramsEnd;
  const isParamsMultiLined = rsHasByte(paramStr, 10);
  const space = putParamsInBlock && retStr.length === 0 ? WCS_SPACE : WCS_NEWLINE;
  const option = new WhereClauseOption(fbs === FBS_NONE, space);
  if (isParamsMultiLined) {
    option.vetoSingleLine = true;
  }
  const whereStr = rewriteWhereClause(ctx, w, rsShapeIndented(bi, al, cfg), true, "{", hi, posBeforeWhere, option);

  if (whereStr === null) {
    return null;
  }
  if (whereStr.length === 0 && ast.a[decl] < 0) {
    // FnRetTy::Default(span): an empty span just after the `)`.
    const mc = rsRecoverMissingCommentInSpan(ctx.snippet(paramsEnd, hi), shape, cfg, rsLastLineWidth(result, cfg.tabSpaces));
    if (mc !== null && mc.length !== 0) {
      result = result + mc;
      forceNewlineBrace = true;
    }
  }
  result = result + whereStr;
  const endsWithComment = rsLastLineContainsSingleLineComment(result);
  forceNewlineBrace = forceNewlineBrace || endsWithComment;
  return new FnBase(result, endsWithComment, forceNewlineBrace);
};

/** compute_budgets_for_params: [one_line_budget, multi_line_budget, indent.bi, indent.al]. */
const computeBudgetsForParams = (ctx: RsCtx, result: string, bi: i32, al: i32, retStrLen: i32, fbs: i32, forceVertical: boolean): i32[] => {
  const cfg = ctx.cfg;
  if (!rsHasByte(result, 10) && !forceVertical) {
    const overhead = retStrLen === 0 ? 2 : 3;
    let used = bi + al + toI32(result.length) + retStrLen + overhead;
    if (fbs === FBS_NONE) {
      used += 1;
    } else if (fbs === FBS_SAME_LINE) {
      used += 2;
    }
    const olb = ctx.budget(used);
    if (olb > 0) {
      const nbi = bi + cfg.tabSpaces;
      return [olb, ctx.budget(nbi + al + 1), nbi, al];
    }
  }
  const nbi = bi + cfg.tabSpaces;
  return [0, ctx.budget(nbi + al + 1), nbi, al];
};

/** is_named_param: params of fn pointer types may have no pattern. */
const isNamedParam = (ast: RsAst, p: i32): boolean => ast.a[p] >= 0 || isSelfParam(ast, p);

const isSelfParam = (ast: RsAst, p: i32): boolean => (ast.fl[p] & (PA_SELF_VALUE | PA_SELF_REF | PA_SELF_EXPLICIT)) !== 0;

/** span_lo_for_param. */
export const rsParamSpanLo = (ast: RsAst, p: i32): i32 => {
  if (ast.atn[p] > 0) {
    return ast.lo[ast.attr(p, 0)];
  }
  if (isSelfParam(ast, p)) {
    return ast.lo[p];
  }
  if (ast.a[p] >= 0) {
    return ast.lo[ast.a[p]];
  }
  return ast.lo[ast.b[p]];
};

/** param.ty.span.hi(): the end of the type (for a self param, of `self` or the explicit type). */
export const rsParamSpanHi = (ast: RsAst, p: i32): i32 => {
  if (isSelfParam(ast, p)) {
    if ((ast.fl[p] & PA_SELF_EXPLICIT) !== 0) {
      return ast.hi[ast.b[p]];
    }
    return ast.hi[p];
  }
  return ast.hi[ast.b[p]];
};

/** Rewrite for ast::Param. */
export const rsRewriteParam = (ctx: RsCtx, p: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const paramAttrs = rsRewriteNodeAttrs(ctx, p, rsShapeLegacy(shape.width, shape.bi, shape.al));
  if (paramAttrs === null) {
    return null;
  }
  const na = ast.atn[p];
  let spLo = 0;
  let spHi = 0;
  let multiAttrLines = false;
  let hasDocs = false;
  if (na > 0) {
    spLo = ast.hi[ast.attr(p, na - 1)];
    spHi = isSelfParam(ast, p) ? ast.lo[p] : ast.a[p] >= 0 ? ast.lo[ast.a[p]] : ast.lo[ast.b[p]];
    multiAttrLines = rsHasByte(paramAttrs, 10);
    for (let i = 0; i < na; i++) {
      if ((ast.fl[ast.attr(p, i)] & AT_DOC) !== 0) {
        hasDocs = true;
      }
    }
  } else {
    spLo = ast.lo[p];
    spHi = ast.lo[p];
  }
  if (isSelfParam(ast, p)) {
    const f = ast.fl[p];
    let selfStr = "";
    if ((f & PA_SELF_REF) !== 0) {
      const lt = ast.d[p] >= 0 ? rsRewriteLifetimeTok(ctx, ast.d[p]) + " " : "";
      selfStr = "&" + lt + ((f & PA_REF_MUT) !== 0 ? "mut " : "") + "self";
    } else if ((f & PA_SELF_EXPLICIT) !== 0) {
      const ts = rsRewriteTy(ctx, ast.b[p], rsShapeLegacy(cfg.maxWidth, 0, 0));
      if (ts === null) {
        return null;
      }
      selfStr = ((f & PA_MUT) !== 0 ? "mut " : "") + "self: " + ts;
    } else {
      selfStr = ((f & PA_MUT) !== 0 ? "mut " : "") + "self";
    }
    return rsCombineStrsWithMissingComments(ctx, paramAttrs, selfStr, spLo, spHi, shape, !multiAttrLines);
  }
  const pat = ast.a[p];
  const ty = ast.b[p];
  if (pat >= 0) {
    const paramName = rsRewritePat(ctx, pat, rsShapeLegacy(shape.width, shape.bi, shape.al));
    if (paramName === null) {
      return null;
    }
    const result0 = rsCombineStrsWithMissingComments(ctx, paramAttrs, paramName, spLo, spHi, shape, !multiAttrLines && !hasDocs);
    if (result0 === null) {
      return null;
    }
    let result = result0;
    const isEmptyInfer = ast.kind[ty] === N_TY_INFER && ast.hi[ty] === ast.hi[pat];
    if (!isEmptyInfer) {
      // get_missing_param_comments.
      const mlo = ast.hi[pat];
      const mhi = ast.lo[ty];
      const colonLo = ctx.spanBefore(mlo, mhi, ":");
      const colonHi = ctx.spanAfter(mlo, mhi, ":");
      const cb = rsRewriteMissingComment(ctx.snippet(mlo, colonLo), shape, cfg);
      const ca = rsRewriteMissingComment(ctx.snippet(colonHi, mhi), shape, cfg);
      const before = cb === null || cb.length === 0 ? "" : " " + cb;
      const after = ca === null || ca.length === 0 ? "" : ca + " ";
      result = result + before + ": " + after;
      const ov = rsLastLineWidth(result, cfg.tabSpaces);
      if (ov > shape.width) {
        return null;
      }
      const tyStr = rsRewriteTy(ctx, ty, rsShapeLegacy(shape.width - ov, shape.bi, shape.al));
      if (tyStr !== null) {
        result = result + tyStr;
      } else {
        const prevStr = paramAttrs.length === 0 ? paramAttrs : paramAttrs + shape.strNl(cfg);
        const r2 = rsCombineStrsWithMissingComments(ctx, prevStr, paramName, spLo, spHi, shape, !multiAttrLines);
        if (r2 === null) {
          return null;
        }
        let res2 = r2 + before + ": " + after;
        const ov2 = rsLastLineWidth(res2, cfg.tabSpaces);
        if (ov2 > shape.width) {
          return null;
        }
        const t2 = rsRewriteTy(ctx, ty, rsShapeLegacy(shape.width - ov2, shape.bi, shape.al));
        if (t2 === null) {
          return null;
        }
        res2 = res2 + t2;
        result = res2;
      }
    }
    return result;
  }
  const ts = rsRewriteTy(ctx, ty, shape);
  if (ts === null) {
    return null;
  }
  return rsCombineStrsWithMissingComments(ctx, paramAttrs, ts, spLo, spHi, shape, !multiAttrLines && !hasDocs);
};

/** The Spanned span of a param: [lo, hi). */
export const rsParamSpannedLo = (ast: RsAst, p: i32): i32 => (isNamedParam(ast, p) ? rsParamSpanLo(ast, p) : ast.lo[ast.b[p]]);

const rewriteParams = (
  ctx: RsCtx,
  decl: i32,
  oneLineBudget: i32,
  multiLineBudget: i32,
  bi: i32,
  al: i32,
  pbi: i32,
  pal: i32,
  spanLo: i32,
  spanHi: i32,
  variadic: boolean,
): string | null => {
  const ast = ctx.ast;
  const n = ast.ln[decl];
  if (n === 0) {
    return rsTrim(ctx.snippet(spanLo, spanHi - 1));
  }
  const items = rsItemizeList(
    ctx,
    n,
    ")",
    ",",
    (i: i32): i32 => rsParamSpanLo(ast, ast.kid(decl, i)),
    (i: i32): i32 => rsParamSpanHi(ast, ast.kid(decl, i)),
    (i: i32): string | null => {
      const p = ast.kid(decl, i);
      const r = rsRewriteParam(ctx, p, rsShapeLegacy(multiLineBudget, pbi, pal));
      if (r !== null) {
        return r;
      }
      return ctx.snippet(rsParamSpannedLo(ast, p), rsParamSpanHi(ast, p));
    },
    spanLo,
    spanHi,
    false,
  );
  const tactic = rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_COMMA, oneLineBudget);
  const budget = tactic === DLT_HORIZONTAL ? oneLineBudget : multiLineBudget;
  const fmt = new RsListFormatting(rsShapeLegacy(budget, bi + ctx.cfg.tabSpaces, al), ctx.cfg);
  fmt.tactic = tactic;
  fmt.trailingSeparator = variadic ? ST_NEVER : ST_VERTICAL;
  fmt.endsWithNewline = tactic !== DLT_HORIZONTAL;
  fmt.preserveNewline = true;
  return rsWriteList(items, fmt);
};

// ---------------------------------------------------------------- generics and where clauses

/** rewrite_generics. */
export const rsRewriteGenerics = (ctx: RsCtx, ident: string, g: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const n = ast.ln[g];
  if (n === 0) {
    return ident;
  }
  const items: i32[] = [];
  for (let i = 0; i < n; i++) {
    items.push(ast.kid(g, i));
  }
  return rsRewriteWithAngleBrackets(ctx, ident, items, OC_GENERIC_PARAM, shape, ast.lo[g], ast.hi[g]);
};

const generics_shape_from_config = (ctx: RsCtx, shape: RsShape): RsShape | null =>
  shape.block().blockIndent(ctx.cfg.tabSpaces).withMaxWidth(ctx.cfg).subWidth(1);

// WhereClauseSpace.
const WCS_SPACE: i32 = 0;
const WCS_NEWLINE: i32 = 1;
const WCS_NONE: i32 = 2;

class WhereClauseOption {
  suppressComma: boolean;
  snuggle: i32;
  allowSingleLine: boolean = false;
  vetoSingleLine: boolean = false;
  constructor(suppressComma: boolean, snuggle: i32) {
    this.suppressComma = suppressComma;
    this.snuggle = snuggle;
  }
}

const whereSnuggled = (current: string, tabSpaces: i32): WhereClauseOption =>
  new WhereClauseOption(false, rsLastLineWidth(current, tabSpaces) === 1 ? WCS_SPACE : WCS_NEWLINE);

/** rewrite_where_clause (block indent style); spanEnd < 0 for None. */
const rewriteWhereClause = (
  ctx: RsCtx,
  w: i32,
  shape: RsShape,
  onNewLine: boolean,
  terminator: string,
  spanEnd: i32,
  spanEndBeforeWhere: i32,
  opt: WhereClauseOption,
): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const n = ast.ln[w];
  if (n === 0) {
    return "";
  }
  const whereLo = ast.lo[w];
  // rewrite_where_keyword.
  const blockShape = shape.block().withMaxWidth(cfg);
  const cl0 = blockShape.blockLeft(cfg.tabSpaces);
  if (cl0 === null) {
    return null;
  }
  const clauseShape = cl0.subWidth(1);
  if (clauseShape === null) {
    return null;
  }
  const firstPredLo = rsWherePredLo(ast, ast.kid(w, 0));
  const commentBefore = rsRewriteMissingComment(ctx.snippet(spanEndBeforeWhere, whereLo), blockShape, cfg);
  const commentAfter = rsRewriteMissingComment(ctx.snippet(whereLo + 5, firstPredLo), clauseShape, cfg);
  if (commentBefore === null || commentAfter === null) {
    return null;
  }
  let startingNewline = "";
  if (opt.snuggle === WCS_SPACE && commentBefore.length === 0) {
    startingNewline = " ";
  } else if (opt.snuggle === WCS_NONE) {
    startingNewline = "";
  } else {
    startingNewline = rsIndentStrNl(cfg, blockShape.bi, blockShape.al);
  }
  const nlBefore = commentBefore.length === 0 ? "" : rsIndentStrNl(cfg, shape.bi, shape.al);
  const nlAfter = commentAfter.length === 0 ? "" : rsIndentStrNl(cfg, clauseShape.bi, clauseShape.al);
  const whereKeyword = `${startingNewline}${commentBefore}${nlBefore}where${nlAfter}${commentAfter}`;
  const allowSingleLine = opt.allowSingleLine && commentBefore.length === 0 && commentAfter.length === 0;
  // rewrite_bounds_on_where_clause.
  const lastPred = ast.kid(w, n - 1);
  const se = spanEnd >= 0 ? spanEnd : ast.hi[lastPred];
  const items = rsItemizeList(
    ctx,
    n,
    terminator,
    ",",
    (i: i32): i32 => rsWherePredLo(ast, ast.kid(w, i)),
    (i: i32): i32 => ast.hi[ast.kid(w, i)],
    (i: i32): string | null => rsRewriteWherePred(ctx, ast.kid(w, i), clauseShape),
    firstPredLo,
    se,
    false,
  );
  const fmt = new RsListFormatting(clauseShape, cfg);
  fmt.tactic = DLT_VERTICAL;
  fmt.trailingSeparator = opt.suppressComma ? ST_NEVER : ST_VERTICAL;
  fmt.preserveNewline = true;
  const predsStr = rsWriteList(items, fmt);
  if (predsStr === null) {
    return null;
  }
  let clauseSep = "";
  if (allowSingleLine && !rsHasByte(predsStr, 10) && 6 + toI32(predsStr.length) <= shape.width) {
    clauseSep = " ";
  } else {
    clauseSep = rsIndentStrNl(cfg, clauseShape.bi, clauseShape.al);
  }
  if (onNewLine) {
    // (on_new_line only matters for the visual style)
  }
  return `${whereKeyword}${clauseSep}${predsStr}`;
};

// BracePos.
const BP_NONE: i32 = 0;
const BP_AUTO: i32 = 1;
const BP_FORCE_SAME_LINE: i32 = 2;

/** format_generics; [lo, hi) is the span after the ident. */
const formatGenerics = (ctx: RsCtx, g: i32, bracePos: i32, bi: i32, al: i32, lo: i32, hi: i32, usedWidth: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const shape = rsShapeLegacy(ctx.budget(usedWidth + bi + al), bi, al);
  const result0 = rsRewriteGenerics(ctx, "", g, shape);
  if (result0 === null) {
    return null;
  }
  let result = result0;
  const spanEndBeforeWhere = ast.ln[g] > 0 ? ast.hi[g] : lo;
  const w = ast.a[g];
  let sameLineBrace = false;
  let missed: string | null = null;
  if (ast.ln[w] > 0) {
    const budget = ctx.budget(rsLastLineUsedWidth(result, bi + al, cfg.tabSpaces));
    const option = whereSnuggled(result, cfg.tabSpaces);
    if (bracePos === BP_NONE) {
      option.suppressComma = true;
    }
    const wc = rewriteWhereClause(ctx, w, rsShapeLegacy(budget, bi, 0), true, "{", hi, spanEndBeforeWhere, option);
    if (wc === null) {
      return null;
    }
    result = result + wc;
    sameLineBrace = bracePos === BP_FORCE_SAME_LINE;
  } else {
    sameLineBrace = true; // brace_style is SameLineWhere, never AlwaysNextLine
    const end = bracePos === BP_NONE ? hi : ctx.spanBeforeLast(lo, hi, "{");
    missed = rsRewriteMissingComment(ctx.snippet(spanEndBeforeWhere, end), shape, cfg);
  }
  let missedLineComments = false;
  if (missed !== null && missed.length !== 0) {
    const isBlock = rsIsLastCommentBlock(missed);
    result = result + (isBlock ? " " : "\n") + missed;
    missedLineComments = !isBlock;
  }
  if (bracePos === BP_NONE) {
    return result;
  }
  const totalUsed = rsLastLineUsedWidth(result, usedWidth, cfg.tabSpaces);
  const remaining = ctx.budget(totalUsed);
  const overhead = bracePos === BP_FORCE_SAME_LINE ? 3 : 2;
  const forbid = missedLineComments || overhead > remaining;
  if (!forbid && sameLineBrace) {
    result = result + " ";
  } else {
    result = result + "\n" + rsIndentStr(cfg, bi, 0);
  }
  return result + "{";
};

/** format_header. `visLo`/`visHi` is the visibility span. */
const formatHeader = (ctx: RsCtx, itemName: string, ident: i32, vis: i32, visLo: i32, visHi: i32, bi: i32, al: i32): string => {
  const shape = rsShapeIndented(bi, al, ctx.cfg);
  let result = rsTrim(rsFormatVisibility(ctx, vis));
  const identHi = ctx.f.t.hi[ident];
  const before = ctx.optSpanBefore(visLo, identHi, rsTrim(itemName));
  if (before >= 0) {
    const r = rsCombineStrsWithMissingComments(ctx, result, itemName, visHi, before, shape, true);
    if (r !== null) {
      result = r;
    }
  }
  return result + rsIdentStr(ctx, ident);
};

/** The visibility span: the node's, or an empty span at `itemLo` when inherited. */
const visLoOf = (ast: RsAst, vis: i32, itemLo: i32): i32 => (vis >= 0 ? ast.lo[vis] : itemLo);
const visHiOf = (ast: RsAst, vis: i32, itemLo: i32): i32 => (vis >= 0 ? ast.hi[vis] : itemLo);

// ---------------------------------------------------------------- structs and enums

class StructParts {
  prefix: string;
  ident: i32;
  vis: i32;
  visLo: i32;
  visHi: i32;
  def: i32;
  generics: i32;
  lo: i32;
  hi: i32;
  constructor(prefix: string, ident: i32, vis: i32, visLo: i32, visHi: i32, def: i32, generics: i32, lo: i32, hi: i32) {
    this.prefix = prefix;
    this.ident = ident;
    this.vis = vis;
    this.visLo = visLo;
    this.visHi = visHi;
    this.def = def;
    this.generics = generics;
    this.lo = lo;
    this.hi = hi;
  }
}

export const rsVisitStruct = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const lo = ast.lo[item];
  const vis = ast.e[item];
  const sp = new StructParts(
    ast.kind[item] === N_UNION ? "union " : "struct ",
    ast.d[item],
    vis,
    visLoOf(ast, vis, lo),
    visHiOf(ast, vis, lo),
    ast.b[item],
    ast.a[item],
    lo,
    ast.hi[item],
  );
  const isTuple = (ast.fl[ast.b[item]] & VD_TUPLE) !== 0;
  let rw = formatStruct(v.ctx(), sp, v.bi, v.al, -1);
  if (rw !== null && isTuple) {
    rw = rw + ";";
  }
  v.pushRewrite(lo, ast.hi[item], rw);
};

const formatStruct = (ctx: RsCtx, p: StructParts, bi: i32, al: i32, oneLineWidth: i32): string | null => {
  const f = ctx.ast.fl[p.def];
  if ((f & VD_UNIT) !== 0) {
    return formatUnitStruct(ctx, p, bi, al);
  }
  if ((f & VD_TUPLE) !== 0) {
    return formatTupleStruct(ctx, p, bi, al);
  }
  return formatStructStruct(ctx, p, bi, al, oneLineWidth);
};

const formatUnitStruct = (ctx: RsCtx, p: StructParts, bi: i32, al: i32): string | null => {
  const header = formatHeader(ctx, p.prefix, p.ident, p.vis, p.visLo, p.visHi, bi, al);
  let gs = "";
  if (p.generics >= 0) {
    const h = ctx.spanBeforeLast(p.lo, p.hi, ";");
    const r = formatGenerics(ctx, p.generics, BP_NONE, bi, al, ctx.f.t.hi[p.ident], h, rsLastLineWidth(header, ctx.cfg.tabSpaces));
    if (r === null) {
      return null;
    }
    gs = r;
  }
  return header + gs + ";";
};

/** format_struct_struct. */
const formatStructStruct = (ctx: RsCtx, p: StructParts, bi: i32, al: i32, oneLineWidth: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  let result = formatHeader(ctx, p.prefix, p.ident, p.vis, p.visLo, p.visHi, bi, al);
  const headerHi = ctx.f.t.hi[p.ident];
  let bodyLo = 0;
  if (p.generics >= 0) {
    bodyLo = ctx.spanAfter(ast.hi[ast.a[p.generics]], p.hi, "{");
  } else {
    bodyLo = ctx.spanAfter(p.lo, p.hi, "{");
  }
  const nf = ast.ln[p.def];
  let gs = "";
  if (p.generics >= 0) {
    const r = formatGenerics(ctx, p.generics, nf === 0 ? BP_FORCE_SAME_LINE : BP_AUTO, bi, al, headerHi, bodyLo, rsLastLineWidth(result, cfg.tabSpaces));
    if (r === null) {
      return null;
    }
    gs = r;
  } else {
    const overhead = nf === 0 ? 3 : 2;
    if (cfg.maxWidth < overhead + toI32(result.length)) {
      gs = "\n" + rsIndentStr(cfg, bi, 0) + "{";
    } else {
      gs = " {";
    }
  }
  const ov = nf === 0 ? 1 : 0;
  const total = toI32(result.length) + toI32(gs.length) + ov;
  if (gs.length !== 0 && !rsHasByte(gs, 10) && total > cfg.maxWidth) {
    result = result + "\n" + rsIndentStr(cfg, bi, al) + rsTrimStart(gs);
  } else {
    result = result + gs;
  }
  if (nf === 0) {
    return formatEmptyStructOrTuple(ctx, bodyLo, p.hi - 1, bi, al, result, "", "}");
  }
  let olb = ctx.budget(toI32(result.length) + 3 + bi + al);
  olb = oneLineWidth < 0 ? 0 : oneLineWidth < olb ? oneLineWidth : olb;
  const fs = rsShapeIndented(bi + cfg.tabSpaces, al, cfg).subWidth(1);
  if (fs === null) {
    return null;
  }
  const itemsStr = rewriteFieldsWithAlignment(ctx, p.def, fs, bodyLo, p.hi, olb);
  if (itemsStr === null) {
    return null;
  }
  if (!rsHasByte(itemsStr, 10) && !rsHasByte(result, 10) && toI32(itemsStr.length) <= olb && !rsLastLineContainsSingleLineComment(itemsStr)) {
    return `${result} ${itemsStr} }`;
  }
  return `${result}\n${rsIndentStr(cfg, bi + cfg.tabSpaces, al)}${itemsStr}\n${rsIndentStr(cfg, bi, al)}}`;
};

/** format_empty_struct_or_tuple: appends to `result0` and answers it. */
const formatEmptyStructOrTuple = (ctx: RsCtx, lo: i32, hi: i32, bi: i32, al: i32, result0: string, opener: string, closer: string): string => {
  const cfg = ctx.cfg;
  let result = result0;
  const used = rsLastLineUsedWidth(result, bi + al, cfg.tabSpaces) + 3;
  if (used > cfg.maxWidth) {
    result = result + rsIndentStrNl(cfg, bi, al);
  }
  result = result + opener;
  const shape = rsShapeIndented(bi + cfg.tabSpaces, al, cfg);
  const s = rsRewriteMissingComment(ctx.snippet(lo, hi), shape, cfg);
  if (s === null) {
    result = result + ctx.snippet(lo, hi);
  } else if (s.length !== 0) {
    const multi = rsHasByte(s, 10);
    if (multi || rsFirstLineContainsSingleLineComment(s)) {
      result = result + rsIndentStrNl(cfg, bi + cfg.tabSpaces, al);
    }
    result = result + s;
    if (multi || rsLastLineContainsSingleLineComment(s)) {
      result = result + rsIndentStrNl(cfg, bi, al);
    }
  }
  return result + closer;
};

/** Spanned for FieldDef: attrs lo .. ty hi. */
const fieldSpanLo = (ast: RsAst, f: i32): i32 => rsLoWithAttrs(ast, f);
const fieldSpanHi = (ast: RsAst, f: i32): i32 => ast.hi[ast.a[f]];

/** rewrite_with_alignment for struct fields (struct_field_align_threshold is 0). */
const rewriteFieldsWithAlignment = (ctx: RsCtx, def: i32, shape: RsShape, lo: i32, hi: i32, oneLineWidth: i32): string | null => {
  const ast = ctx.ast;
  const n = ast.ln[def];
  const itemShape0 = rsShapeIndented(shape.bi, shape.al, ctx.cfg).subWidth(1);
  if (itemShape0 === null) {
    return null;
  }
  const itemShape = itemShape0;
  const items = rsItemizeList(
    ctx,
    n,
    "}",
    ",",
    (i: i32): i32 => fieldSpanLo(ast, ast.kid(def, i)),
    (i: i32): i32 => fieldSpanHi(ast, ast.kid(def, i)),
    (i: i32): string | null => rsRewriteStructField(ctx, ast.kid(def, i), itemShape, 0),
    lo,
    hi,
    false,
  );
  const tactic = rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_COMMA, oneLineWidth);
  const fmt = new RsListFormatting(itemShape, ctx.cfg);
  fmt.tactic = tactic;
  fmt.trailingSeparator = ST_VERTICAL;
  fmt.preserveNewline = true;
  return rsWriteList(items, fmt);
};

/** rewrite_struct_field_prefix. */
const structFieldPrefix = (ctx: RsCtx, f: i32): string => {
  const ast = ctx.ast;
  const vis = rsFormatVisibility(ctx, ast.e[f]);
  const safety = (ast.fl[f] & 1) !== 0 ? "safe " : "";
  if (ast.d[f] >= 0) {
    return `${vis}${safety}${rsIdentStr(ctx, ast.d[f])}:`;
  }
  return `${vis}${safety}`;
};

/** rewrite_struct_field. */
export const rsRewriteStructField = (ctx: RsCtx, f: i32, shape: RsShape, lhsMaxWidth: i32): string | null => {
  const ast = ctx.ast;
  if (ast.c[f] >= 0) {
    return null; // a default value
  }
  if (rsAttrsContainSkip(ctx, f)) {
    return ctx.snippet(fieldSpanLo(ast, f), fieldSpanHi(ast, f));
  }
  const prefix = structFieldPrefix(ctx, f);
  const attrsStr = rsRewriteNodeAttrs(ctx, f, shape);
  if (attrsStr === null) {
    return null;
  }
  const attrsExtendable = ast.d[f] < 0 && rsIsAttributesExtendable(attrsStr);
  const na = ast.atn[f];
  const mlo = na === 0 ? ast.lo[f] : ast.hi[ast.attr(f, na - 1)];
  const mhi = ast.lo[f];
  let spacing = ast.d[f] >= 0 ? " " : "";
  const attrPrefix = rsCombineStrsWithMissingComments(ctx, attrsStr, prefix, mlo, mhi, shape, attrsExtendable);
  if (attrPrefix === null) {
    return null;
  }
  const overhead = rsTrimmedLastLineWidth(attrPrefix);
  let lhsOffset = lhsMaxWidth - overhead;
  for (let i = 0; i < lhsOffset; i++) {
    spacing = spacing + " ";
  }
  lhsOffset = 0;
  if (prefix.length === 0 && attrsStr.length !== 0 && attrsExtendable && spacing.length === 0) {
    spacing = spacing + " ";
  }
  const tyShape = shape.offsetLeft(overhead + toI32(spacing.length));
  const origTy: string | null = tyShape === null ? null : rsRewriteTy(ctx, ast.a[f], tyShape);
  if (origTy !== null) {
    if (!rsHasByte(origTy, 10) && !rsContainsComment(ctx.snippet(mlo, mhi))) {
      return attrPrefix + spacing + origTy;
    }
  }
  const isPrefixEmpty = prefix.length === 0;
  const fs0 = rsRewriteAssignRhs(ctx, prefix, ast.a[f], RHS_TY, shape);
  if (fs0 === null) {
    return null;
  }
  const fieldStr = isPrefixEmpty ? rsTrimStart(fs0) : fs0;
  return rsCombineStrsWithMissingComments(ctx, attrsStr, fieldStr, mlo, mhi, shape, false);
};

/** format_tuple_struct. */
const formatTupleStruct = (ctx: RsCtx, p: StructParts, bi: i32, al: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const header = formatHeader(ctx, p.prefix, p.ident, p.vis, p.visLo, p.visHi, bi, al);
  let result = header;
  const nf = ast.ln[p.def];
  let bodyLo = 0;
  if (nf === 0) {
    const restricted = p.vis >= 0 && (ast.fl[p.vis] & (VIS_CRATE | VIS_RESTRICTED)) !== 0;
    const lo = restricted ? p.visHi : p.lo;
    bodyLo = ctx.spanAfter(lo, p.hi, "(");
  } else {
    bodyLo = rsLoWithAttrsField(ast, ast.kid(p.def, 0));
  }
  let bodyHi = 0;
  if (nf === 0) {
    bodyHi = ctx.spanAfter(bodyLo, p.hi, ")");
  } else {
    const lastHi = ast.hi[ast.kid(p.def, nf - 1)];
    const k = ctx.optSpanAfter(lastHi, p.hi, ")");
    bodyHi = k < 0 ? lastHi : k;
  }
  let whereStr = "";
  if (p.generics >= 0) {
    const budget = ctx.budget(rsLastLineWidth(header, cfg.tabSpaces));
    const gs = rsRewriteGenerics(ctx, "", p.generics, rsShapeLegacy(budget, bi, al));
    if (gs === null) {
      return null;
    }
    result = result + gs;
    const wb = ctx.budget(rsLastLineWidth(result, cfg.tabSpaces));
    const option = new WhereClauseOption(true, WCS_NEWLINE);
    const ws = rewriteWhereClause(ctx, ast.a[p.generics], rsShapeLegacy(wb, bi, 0), false, ";", -1, bodyHi, option);
    if (ws === null) {
      return null;
    }
    whereStr = ws;
  }
  if (nf === 0) {
    const bh = ctx.spanBefore(bodyLo, p.hi, ")");
    result = formatEmptyStructOrTuple(ctx, bodyLo, bh, bi, al, result, "(", ")");
  } else {
    const lo = p.generics >= 0 ? ast.hi[p.generics] : ctx.f.t.hi[p.ident];
    const shape = rsShapeIndented(bi, al, cfg).subWidth(1);
    if (shape === null) {
      return null;
    }
    const fields: i32[] = [];
    for (let i = 0; i < nf; i++) {
      fields.push(ast.kid(p.def, i));
    }
    const r = rsRewriteWithParens(ctx, result, fields, OC_FIELD_DEF, shape, lo, p.hi, cfg.fnCallWidth, -1);
    if (r === null) {
      return null;
    }
    result = r;
  }
  if (whereStr.length !== 0 && !rsHasByte(whereStr, 10) && (rsHasByte(result, 10) || bi + toI32(result.length) + toI32(whereStr.length) + 1 > cfg.maxWidth)) {
    result = result + "\n" + rsIndentStr(cfg, bi, cfg.tabSpaces - 1);
  }
  return result + whereStr;
};

const rsLoWithAttrsField = (ast: RsAst, f: i32): i32 => ast.lo[f];

/** visit_enum / format_enum. */
export const rsVisitEnum = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const rw = formatEnum(v, item, lo, hi);
  v.pushRewrite(lo, hi, rw);
};

const formatEnum = (v: RsVisitor, item: i32, lo: i32, hi: i32): string | null => {
  const ast = v.ast;
  const ctx = v.ctx();
  const vis = ast.e[item];
  const header = formatHeader(ctx, "enum ", ast.d[item], vis, visLoOf(ast, vis, lo), visHiOf(ast, vis, lo), v.bi, v.al);
  const snippet = ctx.snippet(lo, hi);
  const bracePos = rsFindUncommented(snippet, "{");
  if (bracePos < 0) {
    return null;
  }
  const bodyStart = lo + bracePos + 1;
  const nv = ast.ln[item];
  const gs = formatGenerics(ctx, ast.a[item], nv === 0 ? BP_FORCE_SAME_LINE : BP_AUTO, v.bi, v.al, ctx.f.t.hi[ast.d[item]], bodyStart, rsLastLineWidth(header, ctx.cfg.tabSpaces));
  if (gs === null) {
    return null;
  }
  const s = formatVariantList(v, item, bodyStart, hi);
  if (s !== null && nv === 0) {
    return header + gs + s;
  }
  if (s !== null) {
    const indent = v.indentStr();
    v.blockUnindent();
    return `${header}${gs}\n${indent}${s}`;
  }
  v.blockUnindent();
  return null;
};

const formatVariantList = (v: RsVisitor, item: i32, bodyLo: i32, bodyHi: i32): string | null => {
  const ast = v.ast;
  const cfg = v.f.cfg;
  const nv = ast.ln[item];
  if (nv === 0) {
    return formatEmptyStructOrTuple(v.ctx(), bodyLo, bodyHi - 1, v.bi, v.al, "", "", "}");
  }
  const obi = v.bi;
  const oal = v.al;
  v.blockIndent();
  let items = variantItems(v, item, bodyLo, bodyHi, cfg.structVariantWidth);
  let multi = false;
  let single = false;
  for (const it of items) {
    if (rsHasByte(it.inner(), 10)) {
      multi = true;
    } else {
      single = true;
    }
  }
  if (multi && single) {
    items = variantItems(v, item, bodyLo, bodyHi, 0);
  }
  const shape = v.shape().subWidth(2);
  if (shape === null) {
    return null;
  }
  const fmt = new RsListFormatting(shape, cfg);
  fmt.trailingSeparator = ST_VERTICAL;
  fmt.preserveNewline = true;
  const list = rsWriteList(items, fmt);
  if (list === null) {
    return null;
  }
  return list + rsIndentStrNl(cfg, obi, oal) + "}";
};

const variantItems = (v: RsVisitor, item: i32, bodyLo: i32, bodyHi: i32, oneLineWidth: i32): RsListItem[] => {
  const ast = v.ast;
  const ctx = v.ctx();
  return rsItemizeList(
    ctx,
    ast.ln[item],
    "}",
    ",",
    (i: i32): i32 => {
      const f = ast.kid(item, i);
      return ast.atn[f] > 0 ? ast.lo[ast.attr(f, 0)] : ast.lo[f];
    },
    (i: i32): i32 => ast.hi[ast.kid(item, i)],
    (i: i32): string | null => formatVariant(v, ast.kid(item, i), oneLineWidth),
    bodyLo,
    bodyHi,
    false,
  );
};

const formatVariant = (v: RsVisitor, field: i32, oneLineWidth: i32): string | null => {
  const ast = v.ast;
  const ctx = v.ctx();
  if (rsAttrsContainSkip(ctx, field)) {
    return ctx.snippet(ast.lo[ast.attr(field, 0)], ast.hi[field]);
  }
  const shape0 = v.shape();
  const s1 = shape0.subWidth(1);
  if (s1 === null) {
    return null;
  }
  const attrsStr = rsRewriteNodeAttrs(ctx, field, s1);
  if (attrsStr === null) {
    return null;
  }
  const shape = s1;
  const na = ast.atn[field];
  const lo = na === 0 ? ast.lo[field] : ast.hi[ast.attr(field, na - 1)];
  const def = ast.b[field];
  let body = "";
  if ((ast.fl[def] & VD_UNIT) === 0) {
    // enum_variant_span.
    let vhi = ast.hi[field];
    const disr = ast.c[field];
    if (disr >= 0) {
      const before = ast.lo[disr];
      if ((ast.fl[def] & VD_STRUCT) !== 0) {
        vhi = ctx.spanAfterLast(ast.lo[field], before, "}");
      } else {
        vhi = ctx.spanAfterLast(ast.lo[field], before, ")");
      }
    }
    const sp = new StructParts("", ast.d[field], -1, 0, 0, def, -1, ast.lo[field], vhi);
    const r = formatStruct(ctx, sp, v.bi, v.al, oneLineWidth);
    if (r === null) {
      return null;
    }
    body = r;
  } else {
    body = rsIdentStr(ctx, ast.d[field]);
  }
  const disr = ast.c[field];
  if (disr >= 0) {
    const lhs = body + " =";
    const r = rsRewriteAssignRhsWith(ctx, lhs, disr, RHS_EXPR, shape, RT_ALLOW_OVERFLOW);
    if (r === null) {
      return null;
    }
    body = r;
  }
  return rsCombineStrsWithMissingComments(ctx, attrsStr, body, lo, ast.lo[field], shape, false);
};

// ---------------------------------------------------------------- statics and consts

export const rsVisitStatic = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const rw = rewriteStatic(v.ctx(), item, v.bi, v.al);
  v.pushRewrite(ast.lo[item], ast.hi[item], rw);
};

const rewriteStatic = (ctx: RsCtx, item: i32, bi: i32, al: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const isConst = ast.kind[item] === N_CONST;
  const g = isConst ? ast.a[item] : -1;
  if (g >= 0 && ast.ln[ast.a[g]] > 0) {
    return null;
  }
  const ty = ast.b[item];
  let generics = "";
  if (g >= 0) {
    const r = formatGenerics(ctx, g, BP_NONE, bi, al, ctx.f.t.hi[ast.d[item]], ast.lo[ty], bi);
    if (r !== null) {
      generics = r;
    }
  }
  const f = ast.fl[item];
  const defaultness = isConst && (f & IT_DEFAULT) !== 0 ? "default " : "";
  const safety = !isConst && (f & IT_UNSAFE) !== 0 ? "unsafe " : !isConst && (f & IT_SAFE) !== 0 ? "safe " : "";
  const mutStr = !isConst && (f & IT_MUT) !== 0 ? "mut " : "";
  let prefix = `${rsFormatVisibility(ctx, ast.e[item])}${defaultness}${safety}${isConst ? "const" : "static"} ${mutStr}${rsIdentStr(ctx, ast.d[item])}${generics}: `;
  const ts0 = rsShapeIndented(bi, 0, cfg).offsetLeft(rsLastLineWidth(prefix, cfg.tabSpaces) + 2);
  if (ts0 === null) {
    return null;
  }
  const ty0 = rsRewriteTy(ctx, ty, ts0);
  let tyStr = "";
  if (ty0 !== null) {
    tyStr = ty0;
  } else {
    if (prefix.endsWith(" ")) {
      prefix = prefix.slice(0, toI32(prefix.length) - 1);
    }
    const nbi = bi + cfg.tabSpaces;
    const t2 = rsRewriteTy(ctx, ty, rsShapeIndented(nbi, al, cfg));
    if (t2 === null) {
      return null;
    }
    tyStr = rsIndentStrNl(cfg, nbi, al) + t2;
  }
  const expr = ast.c[item];
  if (expr >= 0) {
    const commentsLo = ctx.spanAfter(ast.lo[item], ast.hi[item], "=");
    const exprLo = rsLoWithAttrs(ast, expr);
    const lhs = `${prefix}${tyStr} =`;
    const remaining = ctx.budget(bi + 1);
    const r = rsRewriteAssignRhsWithComments(ctx, lhs, expr, rsShapeLegacy(remaining, bi, 0), RHS_EXPR, RT_DEFAULT, commentsLo, exprLo, true);
    if (r === null) {
      return null;
    }
    const s = rsRecoverCommentRemoved(ctx, r, ast.lo[item], ast.hi[item]);
    return s.endsWith(";") ? s : s + ";";
  }
  return `${prefix}${tyStr};`;
};

// ---------------------------------------------------------------- type aliases

const IVK_ITEM: i32 = 0;
const IVK_TRAIT: i32 = 1;
const IVK_IMPL: i32 = 2;
const IVK_FOREIGN: i32 = 3;

export const rsVisitTypeAlias = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const rw = rsRewriteTypeAlias(v.ctx(), item, v.bi, v.al, IVK_ITEM);
  v.pushRewrite(ast.lo[item], ast.hi[item], rw);
};

/** rewrite_type_alias / rewrite_ty. The visitor kind does not change the output here. */
export const rsRewriteTypeAlias = (ctx: RsCtx, item: i32, bi: i32, al: i32, kind: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const g = ast.a[item];
  const w = ast.a[g];
  const bounds = ast.b[item];
  const ty = ast.c[item];
  const afterWhere = ast.x[item];
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const rhsHi = ty >= 0 ? ast.hi[ty] : ast.hi[w];
  let result = `${rsFormatVisibility(ctx, ast.e[item])}${(ast.fl[item] & IT_DEFAULT) !== 0 ? "default " : ""}type `;
  const identStr = rsIdentStr(ctx, ast.d[item]);
  if (ast.ln[g] === 0) {
    result = result + identStr;
  } else {
    const gs0 = rsShapeIndented(bi, al, cfg).offsetLeft(toI32(result.length));
    if (gs0 === null) {
      return null;
    }
    const gs1 = gs0.subWidth(2);
    if (gs1 === null) {
      return null;
    }
    const gstr = rsRewriteGenerics(ctx, identStr, g, gs1);
    if (gstr === null) {
      return null;
    }
    result = result + gstr;
  }
  if (bounds >= 0 && ast.ln[bounds] > 0) {
    const sh = rsShapeIndented(bi, al, cfg).offsetLeft(toI32(result.length) + 2);
    if (sh === null) {
      return null;
    }
    const bs = rsRewriteBounds(ctx, bounds, sh);
    if (bs === null) {
      return null;
    }
    result = result + ": " + bs;
  }
  const wb = ctx.budget(rsLastLineWidth(result, cfg.tabSpaces));
  const option = whereSnuggled(result, cfg.tabSpaces);
  if (ty < 0) {
    option.suppressComma = true;
  }
  const bw = rewriteWhereClause(ctx, w, rsShapeLegacy(wb, bi, al), false, "=", -1, ast.hi[g], option);
  if (bw === null) {
    return null;
  }
  result = result + bw;
  if (ty >= 0) {
    const afterPreds = afterWhere >= 0 ? ast.ln[afterWhere] : 0;
    if (ast.ln[w] > 0) {
      result = result + rsIndentStrNl(cfg, bi, al);
    } else if (afterPreds > 0) {
      result = result + rsIndentStrNl(cfg, bi + cfg.tabSpaces, al);
    } else {
      result = result + " ";
    }
    const opLo = ctx.optSpanBefore(lo, hi, "=");
    let lhs = "";
    if (opLo >= 0 && rsContainsComment(ctx.snippet(ast.hi[w], opLo))) {
      let cs: RsShape | null = rsShapeIndented(bi, al, cfg);
      if (ast.ln[w] === 0) {
        cs = rsShapeIndented(bi, al, cfg).blockLeft(cfg.tabSpaces);
      }
      if (cs === null) {
        return null;
      }
      const r = rsCombineStrsWithMissingComments(ctx, rsTrimEnd(result), "=", ast.hi[w], opLo, cs, true);
      if (r === null) {
        return null;
      }
      lhs = r;
    } else {
      lhs = result + "=";
    }
    let shape: RsShape | null = rsShapeIndented(bi, al, cfg);
    if (afterPreds === 0) {
      shape = rsShapeIndented(bi, al, cfg).subWidth(1);
    }
    if (shape === null) {
      return null;
    }
    const isOpaque = ast.kind[ty] === N_TY_IMPL;
    const r = rsRewriteAssignRhs(ctx, lhs, isOpaque ? ast.b[ty] : ty, isOpaque ? RHS_OPAQUE : RHS_TY, shape);
    if (r === null) {
      return null;
    }
    result = r;
  }
  if (afterWhere >= 0 && ast.ln[afterWhere] > 0) {
    const option2 = new WhereClauseOption(true, WCS_NEWLINE);
    const aw = rewriteWhereClause(ctx, afterWhere, rsShapeIndented(bi, al, cfg), false, ";", -1, rhsHi, option2);
    if (aw === null) {
      return null;
    }
    result = result + aw;
  }
  if (kind < 0) {
    return null;
  }
  return result + ";";
};

// ---------------------------------------------------------------- impls and traits

/** format_impl. */
export const rsFormatImpl = (ctx: RsCtx, item: i32, bi: i32, al: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const g = ast.a[item];
  const w = ast.a[g];
  const selfTy = ast.c[item];
  const ni = ast.ln[item];
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const refAndType = formatImplRefAndType(ctx, item, bi, al);
  if (refAndType === null) {
    return null;
  }
  const sep = rsIndentStrNl(cfg, bi, al);
  let result = refAndType;
  const whereBudget = rsHasByte(result, 10) ? cfg.maxWidth : ctx.budget(rsLastLineWidth(result, cfg.tabSpaces));
  const option = whereSnuggled(refAndType, cfg.tabSpaces);
  const snippet = ctx.snippet(lo, hi);
  const op = rsFindUncommented(snippet, "{");
  if (op < 0) {
    return null;
  }
  const openPos = op + 1;
  if (!rsContainsComment(snippet.slice(openPos, toI32(snippet.length))) && ni === 0 && ast.ln[w] === 1 && !rsHasByte(result, 10)) {
    option.suppressComma = true;
    option.snuggle = WCS_SPACE;
    option.allowSingleLine = true;
  }
  const whereSpanEnd = ctx.optSpanBefore(ast.hi[selfTy], hi, "{");
  const whereStr = rewriteWhereClause(ctx, w, rsShapeLegacy(whereBudget, bi, 0), false, "{", whereSpanEnd, ast.hi[selfTy], option);
  if (whereStr === null) {
    return null;
  }
  if (ast.ln[w] === 0 && whereSpanEnd >= 0) {
    const mc = rsRecoverMissingCommentInSpan(ctx.snippet(ast.hi[selfTy], whereSpanEnd), rsShapeIndented(bi, al, cfg), cfg, rsLastLineWidth(result, cfg.tabSpaces));
    if (mc !== null && mc.length !== 0) {
      result = result + mc;
    }
  }
  // is_impl_single_line.
  if (ni === 0 && !rsHasByte(result, 10) && toI32(result.length) + toI32(whereStr.length) <= cfg.maxWidth && !rsContainsComment(snippet.slice(openPos, toI32(snippet.length)))) {
    result = result + whereStr;
    if (rsHasByte(whereStr, 10) && ast.ln[w] === 1) {
      result = result + ",";
    }
    if (rsHasByte(whereStr, 10) || rsLastLineContainsSingleLineComment(result)) {
      result = result + sep + "{" + sep + "}";
    } else {
      result = result + " {}";
    }
    return result;
  }
  result = result + whereStr;
  const needNewline = rsLastLineContainsSingleLineComment(result) || rsHasByte(result, 10);
  if (needNewline) {
    result = result + sep;
  } else if (whereStr.length !== 0) {
    result = result + sep;
  } else {
    result = result + " ";
  }
  result = result + "{";
  const blo = ast.hi[selfTy] > ast.hi[w] ? ast.hi[selfTy] : ast.hi[w];
  const sn2 = ctx.snippet(blo, hi);
  const op2 = rsFindUncommented(sn2, "{");
  if (op2 < 0) {
    return null;
  }
  const openPos2 = op2 + 1;
  if (ni > 0 || rsContainsComment(sn2.slice(openPos2, toI32(sn2.length)))) {
    const sub = new RsVisitor(ctx.f);
    sub.bi = bi + cfg.tabSpaces;
    sub.al = 0;
    sub.lastPos = blo + openPos2;
    sub.visitAttrs(item, true);
    for (let i = 0; i < ni; i++) {
      sub.visitAssocItem(ast.kid(item, i));
    }
    sub.formatMissing(hi - 1);
    sub.giveTo(ctx);
    const inner = rsIndentStrNl(cfg, sub.bi, sub.al);
    const outer = rsIndentStrNl(cfg, bi, 0);
    result = result + inner + rsTrim(String.fromBytes(sub.buf.buf, 0, sub.buf.n)) + outer;
  } else if (needNewline) {
    result = result + sep;
  }
  return result + "}";
};

const formatImplRefAndType = (ctx: RsCtx, item: i32, bi: i32, al: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const g = ast.a[item];
  const ofTrait = ast.b[item];
  const selfTy = ast.c[item];
  const f = ast.fl[item];
  let result = rsFormatVisibility(ctx, ast.e[item]);
  if (ofTrait >= 0) {
    if ((f & IT_DEFAULT) !== 0) {
      result = result + "default ";
    }
    if ((f & IT_CONST) !== 0) {
      result = result + "const ";
    }
    if ((f & IT_UNSAFE) !== 0) {
      result = result + "unsafe ";
    }
  } else {
    if ((f & IT_CONST) !== 0) {
      result = result + "const ";
    }
  }
  const s0 = rsShapeIndented(bi, al + rsLastLineWidth(result, cfg.tabSpaces), cfg);
  const shape = generics_shape_from_config(ctx, s0);
  if (shape === null) {
    return null;
  }
  const gs = rsRewriteGenerics(ctx, "impl", g, shape);
  if (gs === null) {
    return null;
  }
  result = result + gs;
  let traitRefOverhead = 0;
  if (ofTrait >= 0) {
    const polarity = (f & IT_NEGATIVE) !== 0 ? "!" : "";
    const rl = rsLastLineWidth(result, cfg.tabSpaces);
    const tr = rewriteTraitRef(ctx, ofTrait, bi, al, polarity, rl);
    if (tr === null) {
      return null;
    }
    result = result + tr;
    traitRefOverhead = 4;
  }
  const curly = ast.ln[ast.a[g]] === 0 ? 2 : 0;
  const used = rsLastLineWidth(result, cfg.tabSpaces) + traitRefOverhead + curly;
  const budget = ctx.budget(used + 1);
  const st = rsRewriteTy(ctx, selfTy, rsShapeLegacy(budget, bi, al));
  if (st !== null && !rsHasByte(st, 10)) {
    result = result + (ofTrait >= 0 ? " for " : " ") + st;
    return result;
  }
  result = result + "\n";
  const nbi = bi + cfg.tabSpaces;
  result = result + rsIndentStr(cfg, nbi, al);
  if (ofTrait >= 0) {
    result = result + "for ";
  }
  const b2 = ctx.budget(rsLastLineWidth(result, cfg.tabSpaces));
  const st2 = rsRewriteTy(ctx, selfTy, rsShapeLegacy(b2, nbi, al));
  if (st2 === null) {
    return null;
  }
  return result + st2;
};

const rewriteTraitRef = (ctx: RsCtx, tr: i32, bi: i32, al: i32, polarity: string, resultLen: i32): string | null => {
  const cfg = ctx.cfg;
  const used = 1 + toI32(polarity.length) + resultLen;
  const shape = rsShapeIndented(bi, al + used, cfg);
  const s = rsRewriteTraitRefTy(ctx, tr, shape);
  if (s !== null && !rsHasByte(s, 10)) {
    return ` ${polarity}${s}`;
  }
  const nbi = bi + cfg.tabSpaces;
  const s2 = rsRewriteTraitRefTy(ctx, tr, rsShapeIndented(nbi, al, cfg));
  if (s2 === null) {
    return null;
  }
  return `${rsIndentStrNl(cfg, nbi, al)}${polarity}${s2}`;
};

/** format_trait. */
export const rsFormatTrait = (ctx: RsCtx, item: i32, bi: i32, al: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const g = ast.a[item];
  const w = ast.a[g];
  const bounds = ast.b[item];
  const ni = ast.ln[item];
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const f = ast.fl[item];
  let result = `${rsFormatVisibility(ctx, ast.e[item])}${(f & IT_CONST) !== 0 ? "const " : ""}${(f & IT_UNSAFE) !== 0 ? "unsafe " : ""}${(f & IT_AUTO) !== 0 ? "auto " : ""}trait `;
  const bodyLo = ctx.spanAfter(lo, hi, "{");
  const shape = rsShapeIndented(bi, al, cfg).offsetLeft(toI32(result.length));
  if (shape === null) {
    return null;
  }
  const gs = rsRewriteGenerics(ctx, rsIdentStr(ctx, ast.d[item]), g, shape);
  if (gs === null) {
    return null;
  }
  result = result + gs;
  const hasBounds = bounds >= 0 && ast.ln[bounds] > 0;
  if (hasBounds) {
    const identHi = ctx.spanAfter(lo, hi, rsIdentStr(ctx, ast.d[item]));
    const boundHi = ast.hi[ast.kid(bounds, ast.ln[bounds] - 1)];
    if (rsContainsComment(ctx.snippet(identHi, boundHi))) {
      return null;
    }
    const r = rsRewriteAssignRhsWith(ctx, result + ":", bounds, RHS_BOUNDS, shape, RT_FORCE_NEXT_LINE_WITHOUT_INDENT);
    if (r === null) {
      return null;
    }
    result = r;
  }
  if (ast.ln[w] > 0) {
    const wb = ctx.budget(rsLastLineWidth(result, cfg.tabSpaces));
    const posBeforeWhere = hasBounds ? ast.hi[ast.kid(bounds, ast.ln[bounds] - 1)] : ast.lo[w];
    const option = whereSnuggled(gs, cfg.tabSpaces);
    const ws = rewriteWhereClause(ctx, w, rsShapeLegacy(wb, bi, 0), false, "{", -1, posBeforeWhere, option);
    if (ws === null) {
      return null;
    }
    if (!rsHasByte(ws, 10) && rsLastLineWidth(result, cfg.tabSpaces) + toI32(ws.length) + bi + al > cfg.commentWidth) {
      const width = bi + cfg.tabSpaces - 1;
      result = result + rsIndentStrNl(cfg, 0, width);
    }
    result = result + ws;
  } else {
    const itemSnippet = ctx.snippet(lo, hi);
    const sl = rsIndexOfByte(itemSnippet, 47, 0);
    if (sl >= 0) {
      const commentHi = ast.ln[g] > 0 ? ast.lo[g] - 1 : bodyLo - 1;
      const commentLo = lo + sl;
      if (commentLo < commentHi) {
        const mc = rsRecoverMissingCommentInSpan(ctx.snippet(commentLo, commentHi), rsShapeIndented(bi, al, cfg), cfg, rsLastLineWidth(result, cfg.tabSpaces));
        if (mc !== null && mc.length !== 0) {
          result = result + mc;
        }
      }
    }
  }
  const blockLo = ast.hi[w];
  const sn = ctx.snippet(blockLo, hi);
  const op = rsFindUncommented(sn, "{");
  if (op < 0) {
    return null;
  }
  const openPos = op + 1;
  const restHasComment = rsContainsComment(sn.slice(openPos, toI32(sn.length)));
  if (rsLastLineContainsSingleLineComment(result) || rsLastLineWidth(result, cfg.tabSpaces) + 2 > ctx.budget(bi + al)) {
    result = result + rsIndentStrNl(cfg, bi, al);
  } else if (ni === 0 && !rsHasByte(result, 10) && !restHasComment) {
    return result + " {}";
  } else if (rsHasByte(result, 10) || (ast.ln[w] > 0 && ni > 0)) {
    result = result + rsIndentStrNl(cfg, bi, al);
  } else {
    result = result + " ";
  }
  result = result + "{";
  const outer = rsIndentStrNl(cfg, bi, 0);
  if (ni > 0 || restHasComment) {
    const sub = new RsVisitor(ctx.f);
    sub.bi = bi + cfg.tabSpaces;
    sub.al = 0;
    sub.lastPos = blockLo + openPos;
    for (let i = 0; i < ni; i++) {
      sub.visitAssocItem(ast.kid(item, i));
    }
    sub.formatMissing(hi - 1);
    sub.giveTo(ctx);
    result = result + rsIndentStrNl(cfg, sub.bi, sub.al) + rsTrim(String.fromBytes(sub.buf.buf, 0, sub.buf.n)) + outer;
  } else if (rsHasByte(result, 10)) {
    result = result + outer;
  }
  return result + "}";
};

/** format_trait_alias. */
export const rsFormatTraitAlias = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const alias = rsIdentStr(ctx, ast.d[item]);
  const g0 = shape.offsetLeft(6);
  if (g0 === null) {
    return null;
  }
  const gShape = g0.subWidth(2);
  if (gShape === null) {
    return null;
  }
  const g = ast.a[item];
  const gs = rsRewriteGenerics(ctx, alias, g, gShape);
  if (gs === null) {
    return null;
  }
  const vis = rsFormatVisibility(ctx, ast.e[item]);
  const constness = (ast.fl[item] & IT_CONST) !== 0 ? "const " : "";
  const lhs = `${vis}${constness}trait ${gs} =`;
  const sh = shape.subWidth(1);
  if (sh === null) {
    return null;
  }
  const r = rsRewriteAssignRhs(ctx, lhs, item, RHS_TRAIT_ALIAS, sh);
  return r === null ? null : r + ";";
};

/** TraitAliasBounds::rewrite: `item` is the trait alias. */
export const rsRewriteTraitAliasBounds = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const g = ast.a[item];
  const w = ast.a[g];
  const bs = rsRewriteBounds(ctx, ast.b[item], shape);
  if (bs === null) {
    return null;
  }
  const option = new WhereClauseOption(true, WCS_NONE);
  option.allowSingleLine = true;
  const ws = rewriteWhereClause(ctx, w, shape, false, ";", -1, ast.lo[w], option);
  if (ws === null) {
    return null;
  }
  const fits = !rsHasByte(bs, 10) && !rsHasByte(ws, 10) && toI32(bs.length) + toI32(ws.length) < shape.width;
  let space = "";
  if (bs.length === 0 || ws.length === 0) {
    space = "";
  } else if (fits) {
    space = " ";
  } else {
    space = rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
  }
  return bs + space + ws;
};

// ---------------------------------------------------------------- extern crate

/** rewrite_extern_crate. */
export const rsRewriteExternCrate = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const s = ctx.snippet(ast.lo[item], ast.hi[item]);
  let itemStr = "";
  if (rsContainsComment(s)) {
    itemStr = s;
  } else {
    // split_whitespace joined by " ", then `\s;` replaced by ";".
    let out = "";
    let i = 0;
    const n = toI32(s.length);
    let first = true;
    while (i < n) {
      while (i < n && (s.charCodeAt(i) === 32 || (s.charCodeAt(i) >= 9 && s.charCodeAt(i) <= 13))) {
        i++;
      }
      if (i >= n) {
        break;
      }
      let j = i;
      while (j < n && !(s.charCodeAt(j) === 32 || (s.charCodeAt(j) >= 9 && s.charCodeAt(j) <= 13))) {
        j++;
      }
      if (!first) {
        out = out + " ";
      }
      out = out + s.slice(i, j);
      first = false;
      i = j;
    }
    const k = out.indexOf(" ;");
    if (k >= 0) {
      out = out.slice(0, k) + ";" + out.slice(k + 2, toI32(out.length));
    }
    itemStr = out;
  }
  return rewriteAttrsOfItem(ctx, item, itemStr, shape);
};

/** rewrite_attrs: the item's outer attributes, then the item string. */
const rewriteAttrsOfItem = (ctx: RsCtx, item: i32, itemStr: string, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const attrs: i32[] = [];
  for (let i = 0; i < ast.atn[item]; i++) {
    attrs.push(ast.attr(item, i));
  }
  const attrsStr = rsRewriteAttrs(ctx, attrs, shape);
  if (attrsStr === null) {
    return null;
  }
  const mlo = attrs.length === 0 ? ast.lo[item] : ast.hi[attrs[attrs.length - 1]];
  // inline_attribute_width is 0: allow_extend is false.
  return rsCombineStrsWithMissingComments(ctx, attrsStr, itemStr, mlo, ast.lo[item], shape, false);
};

/** rewrite_mod for `mod foo;` (used when reordering). */
export const rsRewriteModDecl = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const s = rsFormatVisibility(ctx, ast.e[item]) + "mod " + rsIdentStr(ctx, ast.d[item]) + ";";
  return rewriteAttrsOfItem(ctx, item, s, shape);
};

export const rsIsLocal = (ast: RsAst, s: i32): boolean => ast.kind[s] === N_LOCAL;
export const rsFnHasExtern = (ast: RsAst, f: i32): boolean => (ast.fl[f] & FN_EXTERN) !== 0;
export const rsIsImplicitSelfTy = (ast: RsAst, t: i32): boolean => ast.kind[t] === N_TY_IMPLICIT_SELF;
export const rsListWidthUnused = (s: string): i32 => rsWidth(s);
export const rsIsBlankStr = (s: string): boolean => rsIsBlank(s);
