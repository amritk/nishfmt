// Formatting closures.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): closures.rs.

import {
  AT_INNER,
  BLK_UNSAFE,
  CL_ASYNC,
  CL_CONST,
  CL_MOVE,
  CL_STATIC,
  N_BLOCK,
  N_EX_ADDR_OF,
  N_EX_ASSIGN,
  N_EX_ASSIGN_OP,
  N_EX_BINARY,
  N_EX_BLOCK,
  N_EX_CALL,
  N_EX_CAST,
  N_EX_CLOSURE,
  N_EX_FIELD,
  N_EX_FOR,
  N_EX_IF,
  N_EX_INDEX,
  N_EX_LOOP,
  N_EX_MATCH,
  N_EX_RANGE,
  N_EX_STRUCT,
  N_EX_TRY,
  N_EX_TRY_BLOCK,
  N_EX_UNARY,
  N_EX_WHILE,
  N_EX_ASYNC,
  N_STMT_EXPR,
  N_TY_INFER,
  RsAst,
} from "./ast";
import { rsLastLineWidth } from "./comment";
import { RsCtx } from "./context";
import {
  rsBlockContainsComment,
  rsIsSimpleBlock,
  rsRewriteBlockWithVisitor,
  rsRewriteCond,
  rsRewriteExpr,
} from "./expr";
import { rsParamSpanLo, rsRewriteFnRetTy, rsRewriteParam } from "./items";
import {
  DLT_HORIZONTAL,
  LT_HORIZONTAL_VERTICAL,
  RsListFormatting,
  SEP_COMMA,
  rsDefinitiveTactic,
  rsItemizeList,
  rsWriteList,
} from "./lists";
import { RsShape, rsIndentStr } from "./shape";
import { rsHasByte, rsLines } from "./str";
import { rsRewriteBoundParams } from "./types";
import { rsExprHasAttrs, rsLeftMostSubExpr } from "./utils";

/** rewrite_closure for closure expr `e`. */
export const rsRewriteClosure = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const body = ast.a[e];
  const decl = ast.b[e];
  const fd = rewriteClosureFnDecl(ctx, e, body, shape);
  if (fd === null) {
    return null;
  }
  const prefix = fd.prefix;
  const bodyShape = shape.offsetLeft(fd.extraOffset);
  if (bodyShape === null) {
    return null;
  }
  if (ast.kind[body] === N_EX_BLOCK) {
    const block = ast.a[body];
    if (ast.ln[block] === 0 && !rsBlockContainsComment(ctx, block)) {
      const s = rsRewriteExpr(ctx, body, shape);
      return s === null ? null : prefix + " " + s;
    }
    let result: string | null = null;
    if (ast.a[decl] < 0 && !ctx.insideMacro) {
      result = tryRewriteWithoutBlock(ctx, body, prefix, shape, bodyShape);
    }
    if (result !== null) {
      return result;
    }
    const s = rsRewriteExpr(ctx, body, bodyShape);
    return s === null ? null : prefix + " " + s;
  }
  const r = rewriteClosureExpr(ctx, body, prefix, bodyShape);
  if (r !== null) {
    return r;
  }
  return rewriteClosureWithBlock(ctx, body, prefix, bodyShape);
};

const tryRewriteWithoutBlock = (
  ctx: RsCtx,
  expr0: i32,
  prefix: string,
  shape: RsShape,
  bodyShape: RsShape,
): string | null => {
  const expr = getInnerExpr(ctx, expr0, prefix);
  if (isBlockClosureForced(ctx, expr)) {
    return rewriteClosureWithBlock(ctx, expr, prefix, shape);
  }
  return rewriteClosureExpr(ctx, expr, prefix, bodyShape);
};

const getInnerExpr = (ctx: RsCtx, expr: i32, prefix: string): i32 => {
  const ast = ctx.ast;
  if (ast.kind[expr] === N_EX_BLOCK) {
    const block = ast.a[expr];
    if (!needsBlock(ctx, block, ast.d[expr], prefix)) {
      if (ast.ln[block] > 0) {
        const s = ast.kid(block, 0);
        if (ast.kind[s] === N_STMT_EXPR) {
          return getInnerExpr(ctx, ast.a[s], prefix);
        }
      }
    }
  }
  return expr;
};

const needsBlock = (ctx: RsCtx, block: i32, label: i32, prefix: string): boolean => {
  const ast = ctx.ast;
  let hasAttributes = false;
  if (ast.ln[block] > 0) {
    const s = ast.kid(block, 0);
    const k = ast.kind[s];
    const holder = k === N_STMT_EXPR || k === 154 ? ast.a[s] : k === 152 ? ast.a[s] : s;
    // get_attrs_from_stmt: an expression's attributes include its block's inner ones.
    hasAttributes = k === N_STMT_EXPR || k === 154 ? rsExprHasAttrs(ast, holder) : ast.atn[holder] > 0;
  }
  return (
    (ast.fl[block] & BLK_UNSAFE) !== 0 ||
    ast.ln[block] > 1 ||
    hasAttributes ||
    rsBlockContainsComment(ctx, block) ||
    rsHasByte(prefix, 10) ||
    label >= 0
  );
};

const vetoBlock = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  return (
    k === N_EX_CALL ||
    k === N_EX_BINARY ||
    k === N_EX_CAST ||
    k === N_EX_ASSIGN ||
    k === N_EX_ASSIGN_OP ||
    k === N_EX_FIELD ||
    k === N_EX_INDEX ||
    k === N_EX_RANGE ||
    k === N_EX_TRY
  );
};

const exprRequiresSemiToBeStmt = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  return !(
    k === N_EX_IF ||
    k === N_EX_MATCH ||
    k === N_EX_BLOCK ||
    k === N_EX_WHILE ||
    k === N_EX_LOOP ||
    k === N_EX_FOR ||
    k === N_EX_TRY_BLOCK
  );
};

/** A block `{ body }` made at rewrite time, as rustfmt does. */
const syntheticBlock = (ast: RsAst, body: i32, lo: i32, hi: i32): i32 => {
  const s = ast.add(N_STMT_EXPR, ast.lo[body]);
  ast.hi[s] = ast.hi[body];
  ast.a[s] = body;
  const b = ast.add(N_BLOCK, lo);
  ast.hi[b] = hi;
  const kids: i32[] = [s];
  ast.ls[b] = ast.addKids(kids, 0, 1);
  ast.ln[b] = 1;
  return b;
};

const rewriteClosureWithBlock = (ctx: RsCtx, body: i32, prefix: string, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const leftMost = rsLeftMostSubExpr(ast, body);
  if (vetoBlock(ast, body) && !exprRequiresSemiToBeStmt(ast, leftMost)) {
    return null;
  }
  let lo = ast.lo[body];
  for (let i = 0; i < ast.atn[body]; i++) {
    const a = ast.attr(body, i);
    if ((ast.fl[a] & AT_INNER) === 0) {
      lo = ast.lo[a];
      break;
    }
  }
  const block = syntheticBlock(ast, body, lo, ast.hi[body]);
  const s = rsRewriteBlockWithVisitor(ctx, "", block, false, -1, shape, false);
  if (s === null) {
    return null;
  }
  return prefix + " " + s;
};

const allowMultiLine = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  if (
    k === N_EX_MATCH ||
    k === N_EX_ASYNC ||
    k === N_EX_BLOCK ||
    k === N_EX_TRY_BLOCK ||
    k === N_EX_LOOP ||
    k === N_EX_STRUCT
  ) {
    return true;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_TRY || k === N_EX_UNARY || k === N_EX_CAST) {
    return allowMultiLine(ast, ast.a[e]);
  }
  return false;
};

const rewriteClosureExpr = (ctx: RsCtx, expr: i32, prefix: string, shape: RsShape): string | null => {
  const veto = !allowMultiLine(ctx.ast, expr) && !ctx.insideMacro;
  const rw = rsRewriteExpr(ctx, expr, shape);
  if (rw === null) {
    return null;
  }
  if (veto && rsHasByte(rw, 10)) {
    return null;
  }
  return prefix + " " + rw;
};

class FnDecl {
  prefix: string;
  extraOffset: i32;
  constructor(prefix: string, extraOffset: i32) {
    this.prefix = prefix;
    this.extraOffset = extraOffset;
  }
}

const paramSpanHi = (ctx: RsCtx, p: i32): i32 => {
  const ast = ctx.ast;
  const ty = ast.b[p];
  if (ast.kind[ty] === N_TY_INFER) {
    if (ctx.snippet(ast.lo[ty], ast.hi[ty]) === "_") {
      return ast.hi[ty];
    }
    if (ast.a[p] >= 0) {
      return ast.hi[ast.a[p]];
    }
  }
  return ast.hi[ty];
};

const rewriteClosureFnDecl = (ctx: RsCtx, e: i32, body: i32, shape: RsShape): FnDecl | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const decl = ast.b[e];
  let binder = "";
  const bp = ast.c[e];
  if (bp >= 0) {
    if (ast.ln[bp] === 0) {
      binder = "for<> ";
    } else {
      const ls = rsRewriteBoundParams(ctx, shape, bp);
      if (ls === null) {
        return null;
      }
      binder = `for<${ls}> `;
    }
  }
  const f = ast.fl[e];
  const const_ = (f & CL_CONST) !== 0 ? "const " : "";
  const immovable = (f & CL_STATIC) !== 0 ? "static " : "";
  const coro = (f & CL_ASYNC) !== 0 ? "async " : "";
  const capture = (f & CL_MOVE) !== 0 ? "move " : "";
  const offset =
    toI32(binder.length) + toI32(const_.length) + toI32(immovable.length) + toI32(coro.length) + toI32(capture.length);
  const ns0 = shape.shrinkLeft(offset);
  if (ns0 === null) {
    return null;
  }
  const nestedShape = ns0.subWidth(4);
  if (nestedShape === null) {
    return null;
  }
  const pbi = nestedShape.bi;
  const pal = nestedShape.al + 1;
  const ps0 = nestedShape.offsetLeft(1);
  if (ps0 === null) {
    return null;
  }
  let paramShape = ps0.visualIndent(0);
  let retStr = "";
  if (ast.a[decl] >= 0) {
    const r = rsRewriteFnRetTy(ctx, decl, paramShape);
    if (r === null) {
      return null;
    }
    retStr = r;
  }
  const lo = ast.lo[e];
  const hi = ast.hi[e];
  const n = ast.ln[decl];
  const ps = paramShape;
  const items = rsItemizeList(
    ctx,
    n,
    "|",
    ",",
    (i: i32): i32 => rsParamSpanLo(ast, ast.kid(decl, i)),
    (i: i32): i32 => paramSpanHi(ctx, ast.kid(decl, i)),
    (i: i32): string | null => rsRewriteParam(ctx, ast.kid(decl, i), ps),
    ctx.spanAfter(lo, hi, "|"),
    ast.lo[body],
    false,
  );
  let hb = nestedShape.width - (toI32(retStr.length) + 1);
  if (hb < 0) {
    hb = 0;
  }
  const tactic = rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_COMMA, hb);
  if (tactic === DLT_HORIZONTAL) {
    const s = paramShape.subWidth(toI32(retStr.length) + 1);
    if (s === null) {
      return null;
    }
    paramShape = s;
  }
  const fmt = new RsListFormatting(paramShape, cfg);
  fmt.tactic = tactic;
  fmt.preserveNewline = true;
  const listStr = rsWriteList(items, fmt);
  if (listStr === null) {
    return null;
  }
  let prefix = `${binder}${const_}${immovable}${coro}${capture}|${listStr}|`;
  if (retStr.length !== 0) {
    if (rsHasByte(prefix, 10)) {
      prefix = prefix + "\n" + rsIndentStr(cfg, pbi, pal);
    } else {
      prefix = prefix + " ";
    }
    prefix = prefix + retStr;
  }
  return new FnDecl(prefix, rsLastLineWidth(prefix, cfg.tabSpaces) + 1);
};

/** rewrite_last_closure. */
export const rsRewriteLastClosure = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (ast.kind[e] !== N_EX_CLOSURE) {
    return null;
  }
  let body = ast.a[e];
  if (ast.kind[body] === N_EX_BLOCK) {
    const block = ast.a[body];
    if (
      (ast.fl[block] & BLK_UNSAFE) === 0 &&
      !ctx.insideMacro &&
      rsIsSimpleBlock(ctx, block, true) &&
      ast.atn[body] === 0 &&
      ast.d[body] < 0
    ) {
      const s = ast.kid(block, 0);
      if (ast.kind[s] === N_STMT_EXPR) {
        body = ast.a[s];
      }
    }
  }
  const fd = rewriteClosureFnDecl(ctx, e, body, shape);
  if (fd === null) {
    return null;
  }
  const prefix = fd.prefix;
  if (rsHasByte(prefix, 10)) {
    return null;
  }
  const bodyShape = shape.offsetLeft(fd.extraOffset);
  if (bodyShape === null) {
    return null;
  }
  if (isBlockClosureForced(ctx, body)) {
    const bs = rewriteClosureWithBlock(ctx, body, prefix, bodyShape);
    if (bs === null) {
      return null;
    }
    if (ast.a[ast.b[e]] < 0 && rsLines(bs).length <= 7) {
      const sl = rewriteClosureExpr(ctx, body, prefix, shape);
      if (sl !== null && !rsHasByte(sl, 10)) {
        return sl;
      }
    }
    return bs;
  }
  const cond = rsRewriteCond(ctx, body, bodyShape);
  const multi = cond !== null && (rsHasByte(cond, 10) || toI32(cond.length) > bodyShape.width);
  if (multi) {
    return rewriteClosureWithBlock(ctx, body, prefix, bodyShape);
  }
  return rsRewriteExpr(ctx, e, shape);
};

/** args_have_many_closure. */
export const rsArgsHaveManyClosure = (ctx: RsCtx, oc: i32, items: i32[]): boolean => {
  const ast = ctx.ast;
  let n = 0;
  for (const it of items) {
    if (ast.kind[it] === N_EX_CLOSURE) {
      n++;
    }
  }
  return oc >= 0 && n > 1;
};

const isBlockClosureForced = (ctx: RsCtx, e: i32): boolean => {
  if (ctx.insideMacro) {
    return false;
  }
  return forcedInner(ctx.ast, e, ctx.cfg.styleEdition);
};

const forcedInner = (ast: RsAst, e: i32, styleEdition: i32): boolean => {
  const k = ast.kind[e];
  if (k === N_EX_IF || k === N_EX_WHILE || k === N_EX_FOR) {
    return true;
  }
  if (k === N_EX_LOOP && styleEdition >= 2024) {
    return true;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_TRY || k === N_EX_UNARY || k === N_EX_CAST) {
    return forcedInner(ast, ast.a[e], styleEdition);
  }
  return false;
};
