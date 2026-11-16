// Formatting match expressions.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): matches.rs.

import {
  AT_INNER,
  BLK_UNSAFE,
  N_EX_ADDR_OF,
  N_EX_ARRAY,
  N_EX_BLOCK,
  N_EX_CALL,
  N_EX_CAST,
  N_EX_CLOSURE,
  N_EX_INDEX,
  N_EX_LOOP,
  N_EX_MAC,
  N_EX_MATCH,
  N_EX_METHOD,
  N_EX_STRUCT,
  N_EX_TRY,
  N_EX_TUP,
  N_EX_UNARY,
  N_STMT_EXPR,
  RsAst,
} from "./ast";
import { rsAttrsContainSkip, rsRewriteAttrs } from "./attr";
import { rsCombineStrsWithMissingComments, rsFirstLineWidth, rsRewriteComment, rsTrimmedLastLineWidth } from "./comment";
import { RsCtx } from "./context";
import { EXPR_STMT, RT_DEFAULT, rsFormatExpr, rsIsEmptyBlock, rsIsSimpleBlock, rsPreferNextLine, rsRewriteCond, rsRewriteExpr } from "./expr";
import { RsListFormatting, rsItemizeList, rsWriteList } from "./lists";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeIndented } from "./shape";
import { rsHasByte, rsLastIndexOf, rsTrim, rsWidth, rsWsLenAt } from "./str";
import { rsExtraOffset, rsLastLineExtendable, rsLoWithAttrs } from "./utils";
import { rsRewritePat } from "./patterns";

/** The Spanned span of arm `a`: [lo, hi). */
const armLo = (ast: RsAst, a: i32): i32 => rsLoWithAttrs(ast, a);
const armHi = (ast: RsAst, a: i32): i32 => (ast.c[a] >= 0 ? ast.hi[ast.c[a]] : ast.hi[ast.a[a]]);

/** rewrite_match for match expr `e`. */
export const rsRewriteMatch = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const cond = ast.a[e];
  const lo = ast.lo[e];
  const hi = ast.hi[e];
  const cs0 = shape.withWidth(ctx.budget(shape.usedWidth())).offsetLeft(6);
  if (cs0 === null) {
    return null;
  }
  const condStr = rsRewriteExpr(ctx, cond, cs0);
  if (condStr === null) {
    return null;
  }
  const altBlockSep = rsIndentStrNl(cfg, shape.bi, shape.al);
  let blockSep = " ";
  if (rsLastLineExtendable(condStr)) {
    blockSep = " ";
  } else if (rsHasByte(condStr, 10) || toI32(condStr.length) + 2 > cs0.width) {
    blockSep = altBlockSep;
  }
  const nbi = shape.bi + cfg.tabSpaces;
  const nestedIndentStr = rsIndentStr(cfg, nbi, shape.al);
  const inner: i32[] = [];
  for (let i = 0; i < ast.atn[e]; i++) {
    const a = ast.attr(e, i);
    if ((ast.fl[a] & AT_INNER) !== 0) {
      inner.push(a);
    }
  }
  let innerStr = "";
  if (inner.length > 0) {
    const s = rsRewriteAttrs(ctx, inner, shape);
    if (s === null) {
      return null;
    }
    innerStr = nestedIndentStr + s + "\n";
  }
  const na = ast.ln[e];
  let openBrace = 0;
  if (inner.length === 0) {
    const h = na === 0 ? hi : armLo(ast, ast.kid(e, 0));
    openBrace = ctx.spanAfter(ast.hi[cond], h, "{");
  } else {
    openBrace = ast.hi[inner[inner.length - 1]];
  }
  if (na === 0) {
    const sn = ctx.snippet(openBrace, hi - 1);
    if (rsTrim(sn).length === 0) {
      return `match ${condStr} {}`;
    }
    return ctx.snippet(lo, hi);
  }
  const arms = rewriteMatchArms(ctx, e, shape, ast.hi[cond], hi, openBrace);
  if (arms === null) {
    return null;
  }
  return `match ${condStr}${blockSep}{\n${innerStr}${nestedIndentStr}${arms}\n${rsIndentStr(cfg, shape.bi, shape.al)}}`;
};

const armComma = (ast: RsAst, body: i32, isLast: boolean): string => {
  if (isLast && false) {
    return "";
  }
  if (ast.kind[body] === N_EX_BLOCK) {
    const block = ast.a[body];
    if ((ast.fl[block] & BLK_UNSAFE) === 0) {
      return "";
    }
    return ",";
  }
  return ",";
};

const rewriteMatchArms = (ctx: RsCtx, e: i32, shape: RsShape, lo: i32, hi: i32, openBrace: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const armShape = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg);
  const n = ast.ln[e];
  // collect_beginning_verts.
  const verts: i32[] = [];
  for (let i = 0; i < n; i++) {
    const a = ast.kid(e, i);
    const pat = ast.a[a];
    verts.push(ctx.snippet(ast.lo[pat], ast.hi[pat]).startsWith("|") ? ast.lo[pat] : -1);
  }
  if (lo < 0) {
    return null;
  }
  const items = rsItemizeList(
    ctx,
    n,
    "}",
    "|",
    (i: i32): i32 => {
      const a = ast.kid(e, i);
      const l = armLo(ast, a);
      return verts[i] >= 0 && verts[i] < l ? verts[i] : l;
    },
    (i: i32): i32 => armHi(ast, ast.kid(e, i)),
    (i: i32): string | null => rewriteMatchArm(ctx, ast.kid(e, i), armShape, i === n - 1, verts[i] >= 0),
    openBrace,
    hi,
    false,
  );
  const fmt = new RsListFormatting(armShape, cfg);
  fmt.separator = "";
  fmt.preserveNewline = true;
  return rsWriteList(items, fmt);
};

const rewriteMatchArm = (ctx: RsCtx, arm: i32, shape: RsShape, isLast: boolean, hasLeadingPipe: boolean): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const pat = ast.a[arm];
  const body = ast.c[arm];
  if (body < 0) {
    ctx.unsupported("arm without body");
    return null;
  }
  let mlo = armLo(ast, arm);
  let mhi = mlo;
  let attrsStr = "";
  const na = ast.atn[arm];
  if (na > 0) {
    if (rsAttrsContainSkip(ctx, arm)) {
      const fb = flattenArmBody(ctx, body, null);
      return ctx.snippet(armLo(ast, arm), armHi(ast, arm)) + armComma(ast, fb.body, isLast);
    }
    mlo = ast.hi[ast.attr(arm, na - 1)];
    mhi = ast.lo[pat];
    const attrs: i32[] = [];
    for (let i = 0; i < na; i++) {
      attrs.push(ast.attr(arm, i));
    }
    const s = rsRewriteAttrs(ctx, attrs, shape);
    if (s === null) {
      return null;
    }
    attrsStr = s;
  }
  if (hasLeadingPipe) {
    // match_arm_leading_pipes is Never.
  }
  let ps0: RsShape | null = null;
  if (ast.kind[body] === N_EX_BLOCK && ast.d[body] >= 0) {
    const labelLen = toI32(ctx.tokStr(ast.d[body]).length);
    ps0 = shape.subWidth(7 + labelLen);
  } else {
    ps0 = shape.subWidth(5);
  }
  if (ps0 === null) {
    return null;
  }
  const patShape = ps0.offsetLeft(0);
  if (patShape === null) {
    return null;
  }
  const patsStr = rsRewritePat(ctx, pat, patShape);
  if (patsStr === null) {
    return null;
  }
  const blockLikePat = rsTrimmedLastLineWidth(patsStr) <= cfg.tabSpaces;
  const newLineGuard = rsHasByte(patsStr, 10) && !blockLikePat;
  const guardStr = rewriteGuard(ctx, ast.b[arm], shape, rsTrimmedLastLineWidth(patsStr), newLineGuard);
  if (guardStr === null) {
    return null;
  }
  const lhs = rsCombineStrsWithMissingComments(ctx, attrsStr, patsStr + guardStr, mlo, mhi, shape, false);
  if (lhs === null) {
    return null;
  }
  return rewriteMatchBody(ctx, body, lhs, shape, rsHasByte(guardStr, 10), ast.hi[pat], rsLoWithAttrs(ast, body), isLast);
};

const stmtIsExprMac = (ast: RsAst, s: i32): boolean => ast.kind[s] === N_STMT_EXPR && ast.kind[ast.a[s]] === N_EX_MAC;

/** block_can_be_flattened: the block, or -1. */
const blockCanBeFlattened = (ctx: RsCtx, e: i32): i32 => {
  const ast = ctx.ast;
  if (ast.kind[e] !== N_EX_BLOCK) {
    return -1;
  }
  const block = ast.a[e];
  if (ast.d[e] < 0 && (ast.fl[block] & BLK_UNSAFE) === 0 && !ctx.insideMacro && rsIsSimpleBlock(ctx, block, true) && ast.atn[e] === 0 && !stmtIsExprMac(ast, ast.kid(block, 0))) {
    return block;
  }
  return -1;
};

class Flattened {
  extend: boolean;
  body: i32;
  constructor(extend: boolean, body: i32) {
    this.extend = extend;
    this.body = body;
  }
}

const canFlattenBlockAroundThis = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  if (
    k === N_EX_LOOP ||
    k === N_EX_MATCH ||
    k === N_EX_BLOCK ||
    k === N_EX_CLOSURE ||
    k === N_EX_ARRAY ||
    k === N_EX_CALL ||
    k === N_EX_METHOD ||
    k === N_EX_MAC ||
    k === N_EX_STRUCT ||
    k === N_EX_TUP
  ) {
    return true;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_TRY || k === N_EX_UNARY || k === N_EX_INDEX || k === N_EX_CAST) {
    return canFlattenBlockAroundThis(ast, ast.a[e]);
  }
  return false;
};

const flattenArmBody = (ctx: RsCtx, body: i32, optShape: RsShape | null): Flattened => {
  const ast = ctx.ast;
  const block = blockCanBeFlattened(ctx, body);
  if (block >= 0) {
    const s = ast.kid(block, 0);
    if (ast.kind[s] === N_STMT_EXPR) {
      const expr = ast.a[s];
      if (ast.kind[expr] === N_EX_BLOCK) {
        if (ast.atn[expr] === 0) {
          return flattenArmBody(ctx, expr, null);
        }
        return new Flattened(true, body);
      }
      let multi = false;
      if (optShape !== null) {
        const c = rsRewriteCond(ctx, expr, optShape);
        multi = c !== null && rsHasByte(c, 10);
      }
      if (multi) {
        return new Flattened(false, body);
      }
      return new Flattened(canFlattenBlockAroundThis(ast, expr), expr);
    }
    return new Flattened(false, body);
  }
  return new Flattened(canFlattenBlockAroundThis(ast, body), body);
};

const nopBlockCollapse = (s: string | null, budget: number): string | null => {
  if (s === null) {
    return null;
  }
  if (s.startsWith("{") && budget >= 2) {
    let k = 1;
    while (k < toI32(s.length) && rsWsLenAt(s, k) > 0) {
      k += rsWsLenAt(s, k);
    }
    if (k === toI32(s.length) - 1) {
      return "{}";
    }
  }
  return s;
};

/** rewrite_match_body; [arrowLo, arrowHi) is the span between the pattern and the body. */
const rewriteMatchBody = (ctx: RsCtx, body0: i32, patsStr: string, shape: RsShape, hasGuard: boolean, arrowLo: i32, arrowHi: i32, isLast: boolean): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const fl = flattenArmBody(ctx, body0, shape.offsetLeft(rsExtraOffset(patsStr, shape.usedWidth()) + 4));
  const extend = fl.extend;
  const body = fl.body;
  let isBlock = false;
  let isEmptyBlock = false;
  if (ast.kind[body] === N_EX_BLOCK) {
    isBlock = true;
    isEmptyBlock = rsIsEmptyBlock(ctx, ast.a[body]) && !hasInnerAttrs(ast, ast.a[body]);
  }
  const comma = armComma(ast, body, isLast);
  const altBlockSep = rsIndentStrNl(cfg, shape.bi, shape.al);
  let nbi = shape.bi;
  if (!isBlock || isEmptyBlock) {
    nbi = shape.bi + cfg.tabSpaces;
  }
  const forbidSameLine = (hasGuard && rsHasByte(patsStr, 10) && !isEmptyBlock) || ast.atn[body] > 0;
  // The comment after `=>`.
  const arrowSnippet = rsTrim(ctx.snippet(arrowLo, arrowHi));
  const ai = rsLastIndexOf(arrowSnippet, "=>");
  const commentStr = ai < 0 ? "" : rsTrim(arrowSnippet.slice(ai + 2, toI32(arrowSnippet.length)));
  let arrowComment = "";
  if (commentStr.length !== 0) {
    const c = rsRewriteComment(commentStr, shape, cfg);
    if (c === null) {
      return null;
    }
    arrowComment = c;
  }
  const origShape0 = shape.offsetLeft(rsExtraOffset(patsStr, shape.usedWidth()) + 4);
  const origShape: RsShape | null = origShape0 === null ? null : origShape0.subWidth(toI32(comma.length));
  let origBody: string | null = null;
  if (forbidSameLine || arrowComment.length !== 0) {
    origBody = null;
  } else if (origShape !== null) {
    const rw = nopBlockCollapse(rsFormatExpr(ctx, body, EXPR_STMT, origShape), origShape.width);
    if (rw !== null && (isBlock || (!rsHasByte(rw, 10) && rsWidth(rw) <= origShape.width))) {
      return `${patsStr} => ${rw}${comma}`;
    }
    origBody = rw;
  }
  const origBudget = origShape === null ? 0 : origShape.width;
  const nlShape = rsShapeIndented(nbi, shape.al, cfg);
  const nextLine = nopBlockCollapse(rsFormatExpr(ctx, body, EXPR_STMT, nlShape), nlShape.width);
  if (origBody !== null && nextLine !== null && rsPreferNextLine(origBody, nextLine, RT_DEFAULT)) {
    return combineNextLine(ctx, patsStr, nextLine, isBlock, arrowComment, nbi, shape, comma, forbidSameLine, altBlockSep);
  }
  if (origBody !== null && extend && rsFirstLineWidth(origBody) <= origBudget) {
    return `${patsStr} => ${origBody}${comma}`;
  }
  if (origBody !== null && nextLine !== null && rsHasByte(origBody, 10)) {
    return combineNextLine(ctx, patsStr, nextLine, isBlock, arrowComment, nbi, shape, comma, forbidSameLine, altBlockSep);
  }
  if (origBody === null && nextLine !== null) {
    return combineNextLine(ctx, patsStr, nextLine, isBlock, arrowComment, nbi, shape, comma, forbidSameLine, altBlockSep);
  }
  if (origBody === null) {
    return null;
  }
  return `${patsStr} => ${origBody}${comma}`;
};

const combineNextLine = (
  ctx: RsCtx,
  patsStr: string,
  bodyStr: string,
  isBlock: boolean,
  arrowComment: string,
  nbi: i32,
  shape: RsShape,
  comma: string,
  forbidSameLine: boolean,
  altBlockSep: string,
): string => {
  const cfg = ctx.cfg;
  const nested = rsIndentStrNl(cfg, nbi, shape.al);
  if (isBlock) {
    let r = patsStr + " =>";
    if (arrowComment.length !== 0) {
      r = r + nested + arrowComment;
    }
    return r + nested + bodyStr + comma;
  }
  const indentStr = rsIndentStrNl(cfg, shape.bi, shape.al);
  const bodyPrefix = ctx.insideMacro ? "" : "{";
  const bodySuffix = ctx.insideMacro ? "," : indentStr + "}";
  let blockSep = "";
  if (bodyPrefix.length === 0) {
    blockSep = "";
  } else if (forbidSameLine || arrowComment.length !== 0) {
    blockSep = altBlockSep + bodyPrefix;
  } else {
    blockSep = " " + bodyPrefix;
  }
  blockSep = blockSep + nested;
  let r = patsStr + " =>";
  if (arrowComment.length !== 0) {
    r = r + indentStr + arrowComment;
  }
  return r + blockSep + bodyStr + bodySuffix;
};

const hasInnerAttrs = (ast: RsAst, b: i32): boolean => {
  for (let i = 0; i < ast.atn[b]; i++) {
    if ((ast.fl[ast.attr(b, i)] & AT_INNER) !== 0) {
      return true;
    }
  }
  return false;
};

const rewriteGuard = (ctx: RsCtx, guard: i32, shape: RsShape, patternWidth: i32, multilinePattern: boolean): string | null => {
  const cfg = ctx.cfg;
  if (guard < 0) {
    return "";
  }
  const c0 = shape.offsetLeft(patternWidth + 4);
  const cs: RsShape | null = c0 === null ? null : c0.subWidth(5);
  if (!multilinePattern && cs !== null) {
    const condStr = rsRewriteExpr(ctx, guard, cs);
    if (condStr !== null && (!rsHasByte(condStr, 10) || patternWidth <= cfg.tabSpaces)) {
      return " if " + condStr;
    }
  }
  const s1 = rsShapeIndented(shape.bi + cfg.tabSpaces, shape.al, cfg).offsetLeft(3);
  if (s1 === null) {
    return null;
  }
  const cs2 = s1.subWidth(5);
  if (cs2 === null) {
    return null;
  }
  const condStr = rsRewriteExpr(ctx, guard, cs2);
  if (condStr === null) {
    return null;
  }
  return rsIndentStrNl(cfg, cs2.bi, cs2.al) + "if " + condStr;
};
