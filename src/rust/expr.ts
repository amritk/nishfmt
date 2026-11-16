// Formatting expressions, blocks, control flow, assignments and statements.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): expr.rs, stmt.rs, range.rs.

import { rsRewriteTraitAliasBounds } from "./items";
import { rsRewriteBounds } from "./types";
import {
  ADDR_RAW,
  AT_INNER,
  BLK_UNSAFE,
  FOR_AWAIT,
  MUT,
  N_ATTR,
  N_BLOCK,
  N_CONSTRAINT,
  N_EXFIELD,
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
  N_EX_YEET,
  N_EX_YIELD,
  N_FIELD,
  N_GPARAM,
  N_LIFETIME,
  N_LOCAL,
  N_META,
  N_META_LIT,
  N_STMT_EMPTY,
  N_STMT_EXPR,
  N_STMT_SEMI,
  N_USE_BOUND,
  RANGE_CLOSED,
  RsAst,
  SHORTHAND,
  ST_BASE,
  ST_REST,
  UN_DEREF,
  UN_NEG,
  UN_NOT,
  rsIsExprKind,
  rsIsPatKind,
  rsIsTyKind,
} from "./ast";
import { rsAttrsContainSkip, rsRewriteAttrs, rsRewriteMetaItem, rsRewriteNodeAttrs } from "./attr";
import { rsRewriteChain } from "./chains";
import { rsRewriteClosure } from "./closures";
import {
  rsCharClasses,
  rsCombineStrsWithMissingComments,
  rsContainsComment,
  rsFilteredStrFits,
  rsFindLastUncommented,
  rsFindUncommented,
  rsKindIsComment,
  rsLastLineWidth,
  rsRecoverCommentRemoved,
  rsRewriteComment,
  rsRewriteMissingComment,
  rsWrapStr,
} from "./comment";
import { RsCtx } from "./context";
import { rsRewriteStructField, rsRewriteLocal } from "./items";
import {
  RsListItem,
  ST_ALWAYS,
  ST_NEVER,
  rsItemizeList,
  rsShapeForTactic,
  rsStructLitFormatting,
  rsStructLitShape,
  rsStructLitTactic,
  rsWriteList,
} from "./lists";
import { rsMacroPosExpr, rsRewriteMacro } from "./macros";
import { rsRewriteMatch } from "./matches";
import { OC_EXPR, OC_TY, OC_PAT, rsRewriteWithParens, rsRewriteWithSquareBrackets } from "./overflow";
import { RsPairParts, SPB_BACK, SPB_FRONT, rsRewriteAllPairs, rsRewritePair } from "./pairs";
import { rsRewritePat } from "./patterns";
import { RsShape, rsIndentStr, rsIndentStrNl, rsShapeIndented, rsShapeLegacy } from "./shape";
import { rsCountNewlines, rsHasByte, rsLines, rsTrim, rsTrimEnd, rsTrimStart, rsWidth, rsWsLenAt } from "./str";
import { PC_EXPR, rsRewriteGenericParam, rsRewritePath, rsRewritePreciseArg, rsRewriteSegmentParam, rsRewriteTy } from "./types";
import { rsFirstLineEndsWith, rsIdentStr, rsLastLineExtendable, rsLoWithAttrs } from "./utils";
import { RsVisitor } from "./visitor";

export const EXPR_STMT: i32 = 0;
export const EXPR_SUB: i32 = 1;

// RhsAssignKind (what is rewritten on the right-hand side).
export const RHS_EXPR: i32 = 0;
export const RHS_BOUNDS: i32 = 1;
export const RHS_TY: i32 = 2;
export const RHS_TRAIT_ALIAS: i32 = 3;
export const RHS_OPAQUE: i32 = 4;

// RhsTactics.
export const RT_DEFAULT: i32 = 0;
export const RT_FORCE_NEXT_LINE_WITHOUT_INDENT: i32 = 1;
export const RT_ALLOW_OVERFLOW: i32 = 2;

/** The Rewrite trait over any node: dispatches by kind. */
export const rsRewriteNode = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (rsIsExprKind(k)) {
    return rsFormatExpr(ctx, n, EXPR_SUB, shape);
  }
  if (rsIsTyKind(k)) {
    return rsRewriteTy(ctx, n, shape);
  }
  if (rsIsPatKind(k)) {
    return rsRewritePat(ctx, n, shape);
  }
  if (k === N_LIFETIME) {
    return ctx.tokStr(ast.d[n]);
  }
  if (k === N_GPARAM) {
    return rsRewriteGenericParam(ctx, n, shape);
  }
  if (k === N_FIELD) {
    return rsRewriteStructField(ctx, n, shape, 0);
  }
  if (k === N_META || k === N_META_LIT) {
    return rsRewriteMetaItem(ctx, n, shape);
  }
  if (k === N_CONSTRAINT) {
    return rsRewriteSegmentParam(ctx, n, shape);
  }
  if (k === N_USE_BOUND) {
    return rsRewritePreciseArg(ctx, n, shape);
  }
  ctx.unsupported("rewrite of node kind");
  return null;
};

/** The Spanned lo of any node (with outer attributes for exprs, params and fields). */
export const rsSpanLo = (ast: RsAst, n: i32): i32 => rsLoWithAttrs(ast, n);
export const rsSpanHi = (ast: RsAst, n: i32): i32 => (ast.kind[n] === N_FIELD ? ast.hi[ast.a[n]] : ast.hi[n]);

/** Rewrite for ast::Expr. */
export const rsRewriteExpr = (ctx: RsCtx, e: i32, shape: RsShape): string | null => rsFormatExpr(ctx, e, EXPR_SUB, shape);

const unaryOpStr = (op: i32): string => (op === UN_DEREF ? "*" : op === UN_NOT ? "!" : "-");

/** format_expr. */
export const rsFormatExpr = (ctx: RsCtx, e: i32, exprType: i32, shape0: RsShape): string | null => {
  const ast = ctx.ast;
  if (rsAttrsContainSkip(ctx, e)) {
    return ctx.snippet(rsLoWithAttrs(ast, e), ast.hi[e]);
  }
  const k = ast.kind[e];
  let sh = shape0;
  if (exprType === EXPR_STMT && semicolonForExpr(ctx, e)) {
    const s1 = shape0.subWidth(1);
    if (s1 === null) {
      return null;
    }
    sh = s1;
  }
  let rw: string | null = null;
  if (k === N_EX_ARRAY) {
    const items = listOf(ast, e);
    rw = rsRewriteArray(ctx, "", items, OC_EXPR, ast.lo[e], ast.hi[e], sh, chooseSeparatorTactic(ctx, ast.lo[e], ast.hi[e]), -1);
  } else if (k === N_EX_LIT) {
    rw = rsRewriteLiteral(ctx, ast.d[e], sh);
  } else if (k === N_EX_CALL) {
    const callee = ast.a[e];
    const cs = rsRewriteExpr(ctx, callee, sh);
    if (cs === null) {
      return null;
    }
    rw = rsRewriteCall(ctx, cs, listOf(ast, e), ast.hi[callee], ast.hi[e], sh);
  } else if (k === N_EX_PAREN) {
    rw = rsRewriteParen(ctx, ast.a[e], sh, ast.lo[e], ast.hi[e]);
  } else if (k === N_EX_BINARY) {
    rw = rsRewriteAllPairs(ctx, e, sh);
    if (rw === null) {
      const op = ctx.tokStr(ast.c[e]);
      rw = rsRewritePair(ctx, ast.a[e], ast.b[e], new RsPairParts("", ` ${op} `, ""), sh, SPB_FRONT);
    }
  } else if (k === N_EX_UNARY) {
    rw = rsRewriteUnaryPrefix(ctx, unaryOpStr(ast.x[e]), ast.a[e], sh);
  } else if (k === N_EX_STRUCT) {
    rw = rewriteStructLit(ctx, e, sh);
  } else if (k === N_EX_TUP) {
    const items = listOf(ast, e);
    rw = rsRewriteTuple(ctx, items, OC_EXPR, ast.lo[e], ast.hi[e], sh, items.length === 1);
  } else if (k === N_EX_LET) {
    rw = rewriteLet(ctx, sh, ast.a[e], ast.b[e]);
  } else if (k === N_EX_IF || k === N_EX_FOR || k === N_EX_LOOP || k === N_EX_WHILE) {
    const cf = toControlFlow(ctx, e, exprType);
    rw = cf === null ? null : cf.rewrite(ctx, sh);
  } else if (k === N_EX_CONST_BLOCK) {
    const r = rsRewriteBlock(ctx, ast.a[e], true, -1, sh);
    rw = r === null ? null : "const " + r;
  } else if (k === N_EX_BLOCK) {
    const block = ast.a[e];
    const label = ast.d[e];
    if (exprType === EXPR_STMT) {
      if ((ast.fl[block] & BLK_UNSAFE) !== 0) {
        rw = rewriteBlockInner(ctx, block, true, label, ast.atn[e] === 0, sh);
      } else {
        const eb = rewriteEmptyBlock(ctx, block, true, label, "", sh);
        if (eb !== null) {
          rw = eb;
        } else {
          const prefix = blockPrefix(ctx, block, sh);
          rw = prefix === null ? null : rsRewriteBlockWithVisitor(ctx, prefix, block, true, label, sh, true);
        }
      }
    } else {
      // is_simple_block also needs the expression's outer attributes empty.
      rw = rewriteBlockInner(ctx, block, true, label, ast.atn[e] === 0, sh);
    }
  } else if (k === N_EX_MATCH) {
    rw = rsRewriteMatch(ctx, e, sh);
  } else if (k === N_EX_PATH) {
    rw = rsRewritePath(ctx, PC_EXPR, ast.a[e], ast.b[e], sh);
  } else if (k === N_EX_ASSIGN) {
    rw = rewriteAssignment(ctx, ast.a[e], ast.b[e], "=", sh);
  } else if (k === N_EX_ASSIGN_OP) {
    rw = rewriteAssignment(ctx, ast.a[e], ast.b[e], assignOpStr(ast.x[e]), sh);
  } else if (k === N_EX_CONTINUE) {
    rw = "continue" + (ast.d[e] >= 0 ? " " + ctx.tokStr(ast.d[e]) : "");
  } else if (k === N_EX_BREAK) {
    const id = ast.d[e] >= 0 ? " " + ctx.tokStr(ast.d[e]) : "";
    if (ast.a[e] >= 0) {
      rw = rsRewriteUnaryPrefix(ctx, `break${id} `, ast.a[e], sh);
    } else {
      rw = "break" + id;
    }
  } else if (k === N_EX_YIELD) {
    rw = ast.a[e] >= 0 ? rsRewriteUnaryPrefix(ctx, "yield ", ast.a[e], sh) : "yield";
  } else if (k === N_EX_CLOSURE) {
    rw = rsRewriteClosure(ctx, e, sh);
  } else if (k === N_EX_TRY || k === N_EX_FIELD || k === N_EX_METHOD || k === N_EX_AWAIT) {
    rw = rsRewriteChain(ctx, e, sh);
  } else if (k === N_EX_MAC) {
    rw = rsRewriteMacro(ctx, ast.a[e], sh, rsMacroPosExpr());
    if (rw === null && !ctx.f.unsupported) {
      rw = rsWrapStr(ctx.snippet(ast.lo[e], ast.hi[e]), ctx.cfg, sh);
    }
  } else if (k === N_EX_RET) {
    rw = ast.a[e] >= 0 ? rsRewriteUnaryPrefix(ctx, "return ", ast.a[e], sh) : "return";
  } else if (k === N_EX_BECOME) {
    rw = rsRewriteUnaryPrefix(ctx, "become ", ast.a[e], sh);
  } else if (k === N_EX_YEET) {
    rw = ast.a[e] >= 0 ? rsRewriteUnaryPrefix(ctx, "do yeet ", ast.a[e], sh) : "do yeet";
  } else if (k === N_EX_ADDR_OF) {
    const f = ast.fl[e];
    let op = "&";
    if ((f & ADDR_RAW) !== 0) {
      op = (f & MUT) !== 0 ? "&raw mut " : "&raw const ";
    } else if ((f & MUT) !== 0) {
      op = "&mut ";
    }
    rw = rsRewriteUnaryPrefix(ctx, op, ast.a[e], sh);
  } else if (k === N_EX_CAST) {
    rw = rsRewritePair(ctx, ast.a[e], ast.b[e], new RsPairParts("", " as ", ""), sh, SPB_FRONT);
  } else if (k === N_EX_INDEX) {
    rw = rewriteIndex(ctx, ast.a[e], ast.b[e], sh);
  } else if (k === N_EX_REPEAT) {
    rw = rsRewritePair(ctx, ast.a[e], ast.b[e], new RsPairParts("[", "; ", "]"), sh, SPB_BACK);
  } else if (k === N_EX_RANGE) {
    rw = rewriteRange(ctx, sh, ast.a[e], ast.b[e], (ast.fl[e] & RANGE_CLOSED) !== 0 ? "..=" : "..");
  } else if (k === N_EX_TRY_BLOCK) {
    const block = ast.a[e];
    const sl = rewriteSingleLineBlock(ctx, "try ", block, true, -1, sh);
    if (sl !== null) {
      rw = sl;
    } else {
      let budget = sh.width - 9;
      if (budget < 0) {
        budget = 0;
      }
      const r = rsRewriteBlock(ctx, block, true, -1, rsShapeLegacy(budget, sh.bi, sh.al));
      rw = r === null ? null : "try " + r;
    }
  } else if (k === N_EX_ASYNC) {
    const block = ast.a[e];
    const mover = (ast.fl[e] & 1) !== 0 ? "move " : "";
    const pre = "async " + mover;
    const sl = rewriteSingleLineBlock(ctx, pre, block, true, -1, sh);
    if (sl !== null) {
      rw = sl;
    } else {
      let budget = sh.width - 6;
      if (budget < 0) {
        budget = 0;
      }
      const r = rsRewriteBlock(ctx, block, true, -1, rsShapeLegacy(budget, sh.bi, sh.al));
      rw = r === null ? null : pre + r;
    }
  } else if (k === N_EX_UNDERSCORE) {
    rw = "_";
  } else {
    ctx.unsupported("expr kind");
    return null;
  }
  if (rw === null) {
    return null;
  }
  const exprStr = rsRecoverCommentRemoved(ctx, rw, ast.lo[e], ast.hi[e]);
  // The outer attributes.
  const attrs: i32[] = [];
  for (let i = 0; i < ast.atn[e]; i++) {
    const a = ast.attr(e, i);
    if ((ast.fl[a] & AT_INNER) === 0) {
      attrs.push(a);
    }
  }
  if (attrs.length === 0) {
    return exprStr;
  }
  const attrsStr = rsRewriteAttrs(ctx, attrs, sh);
  if (attrsStr === null) {
    return null;
  }
  return rsCombineStrsWithMissingComments(ctx, attrsStr, exprStr, ast.hi[attrs[attrs.length - 1]], ast.lo[e], sh, false);
};

const assignOpStr = (k: i32): string => {
  // The operator token kinds, by text.
  if (k === 62) return "+=";
  if (k === 52) return "-=";
  if (k === 64) return "*=";
  if (k === 66) return "/=";
  if (k === 70) return "%=";
  if (k === 68) return "^=";
  if (k === 57) return "&=";
  if (k === 60) return "|=";
  if (k === 46) return "<<=";
  if (k === 50) return ">>=";
  return "=";
};

export const listOf = (ast: RsAst, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 0; i < ast.ln[n]; i++) {
    out.push(ast.kid(n, i));
  }
  return out;
};

/** semicolon_for_expr: trailing_semicolon is on. */
const semicolonForExpr = (ctx: RsCtx, e: i32): boolean => {
  if (ctx.isMacroDef) {
    return false;
  }
  const k = ctx.ast.kind[e];
  return k === N_EX_RET || k === N_EX_CONTINUE || k === N_EX_BREAK;
};

/** rewrite_array. */
export const rsRewriteArray = (ctx: RsCtx, name: string, items: i32[], oc: i32, lo: i32, hi: i32, shape: RsShape, forceSep: i32, delim: i32): string | null =>
  rsRewriteWithSquareBrackets(ctx, name, items, oc, shape, lo, hi, forceSep, delim);

// ---------------------------------------------------------------- blocks

const blockHasStatements = (ast: RsAst, b: i32): boolean => {
  for (let i = 0; i < ast.ln[b]; i++) {
    if (ast.kind[ast.kid(b, i)] !== N_STMT_EMPTY) {
      return true;
    }
  }
  return false;
};

const blockHasInnerAttrs = (ast: RsAst, b: i32): boolean => {
  for (let i = 0; i < ast.atn[b]; i++) {
    if ((ast.fl[ast.attr(b, i)] & AT_INNER) !== 0) {
      return true;
    }
  }
  return false;
};

export const rsBlockContainsComment = (ctx: RsCtx, b: i32): boolean => rsContainsComment(ctx.snippet(ctx.ast.lo[b], ctx.ast.hi[b]));

/** is_simple_block (attrs: None, or the block's inner attributes when `withAttrs`). */
export const rsIsSimpleBlock = (ctx: RsCtx, b: i32, withAttrs: boolean): boolean => {
  const ast = ctx.ast;
  return ast.ln[b] === 1 && ast.kind[ast.kid(b, 0)] === N_STMT_EXPR && !rsBlockContainsComment(ctx, b) && (!withAttrs || ast.atn[b] === 0);
};

export const rsIsSimpleBlockStmt = (ctx: RsCtx, b: i32): boolean => ctx.ast.ln[b] <= 1 && !rsBlockContainsComment(ctx, b);

/** is_empty_block with attrs None. */
export const rsIsEmptyBlock = (ctx: RsCtx, b: i32): boolean => !blockHasStatements(ctx.ast, b) && !rsBlockContainsComment(ctx, b);

const rewriteLabel = (ctx: RsCtx, label: i32): string => (label >= 0 ? ctx.tokStr(label) + ": " : "");

const rewriteEmptyBlock = (ctx: RsCtx, b: i32, withAttrs: boolean, label: i32, prefix: string, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (blockHasStatements(ast, b)) {
    return null;
  }
  const labelStr = rewriteLabel(ctx, label);
  if (withAttrs && blockHasInnerAttrs(ast, b)) {
    return null;
  }
  if (!rsBlockContainsComment(ctx, b) && shape.width >= 2) {
    return `${prefix}${labelStr}{}`;
  }
  const user = rsTrim(ctx.snippet(ast.lo[b], ast.hi[b]));
  if (user.startsWith("{") && user.endsWith("}")) {
    const cs = rsTrim(user.slice(1, toI32(user.length) - 1));
    if (ast.ln[b] === 0 && !rsHasByte(cs, 10) && !cs.startsWith("//") && toI32(cs.length) + 4 <= shape.width) {
      return `${prefix}${labelStr}{ ${cs} }`;
    }
  }
  return null;
};

const blockPrefix = (ctx: RsCtx, b: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if ((ast.fl[b] & BLK_UNSAFE) === 0) {
    return "";
  }
  const snippet = ctx.snippet(ast.lo[b], ast.hi[b]);
  const op = rsFindUncommented(snippet, "{");
  if (op < 0) {
    return null;
  }
  const trimmed = rsTrim(snippet.slice(6, op));
  if (trimmed.length !== 0) {
    if (shape.width < 9) {
      return null;
    }
    const c = rsRewriteComment(trimmed, rsShapeLegacy(shape.width - 9, shape.bi, shape.al + 7), ctx.cfg);
    if (c === null) {
      return null;
    }
    return `unsafe ${c} `;
  }
  return "unsafe ";
};

const rewriteSingleLineBlock = (ctx: RsCtx, prefix: string, b: i32, withAttrs: boolean, label: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (!rsIsSimpleBlock(ctx, b, withAttrs)) {
    return null;
  }
  const s = ast.kid(b, 0);
  const es = shape.offsetLeft(rsLastLineWidth(prefix, ctx.cfg.tabSpaces));
  if (es === null) {
    return null;
  }
  const exprStr = rsFormatStmt(ctx, es, s, true);
  if (exprStr === null) {
    return null;
  }
  const result = `${prefix}${rewriteLabel(ctx, label)}{ ${exprStr} }`;
  if (toI32(result.length) <= shape.width && !rsHasByte(result, 10)) {
    return result;
  }
  return null;
};

/** rewrite_block_with_visitor. */
export const rsRewriteBlockWithVisitor = (ctx: RsCtx, prefix: string, b: i32, withAttrs: boolean, label: i32, shape: RsShape, hasBraces: boolean): string | null => {
  const ast = ctx.ast;
  const eb = rewriteEmptyBlock(ctx, b, withAttrs, label, prefix, shape);
  if (eb !== null) {
    return eb;
  }
  const v = new RsVisitor(ctx.f);
  v.bi = shape.bi;
  v.al = shape.al;
  v.isIfElseBlock = ctx.isIfElseBlock;
  v.isLoopBlock = ctx.isLoopBlock;
  if ((ast.fl[b] & BLK_UNSAFE) !== 0 || label >= 0) {
    const snippet = ctx.snippet(ast.lo[b], ast.hi[b]);
    const op = rsFindUncommented(snippet, "{");
    if (op < 0) {
      return null;
    }
    v.lastPos = ast.lo[b] + op;
  } else {
    v.lastPos = ast.lo[b];
  }
  const labelStr = rewriteLabel(ctx, label);
  v.visitBlockWith(b, withAttrs, hasBraces);
  ctx.skipped.append(v.skipped);
  v.giveTo(ctx);
  return prefix + labelStr + String.fromBytes(v.buf.buf, 0, v.buf.n);
};

/** Rewrite for ast::Block (attrs None). */
export const rsRewriteBlockNode = (ctx: RsCtx, b: i32, shape: RsShape): string | null => rsRewriteBlock(ctx, b, false, -1, shape);

/** rewrite_block. */
export const rsRewriteBlock = (ctx: RsCtx, b: i32, withAttrs: boolean, label: i32, shape: RsShape): string | null =>
  rewriteBlockInner(ctx, b, withAttrs, label, true, shape);

const rewriteBlockInner = (ctx: RsCtx, b: i32, withAttrs: boolean, label: i32, allowSingleLine: boolean, shape: RsShape): string | null => {
  const prefix = blockPrefix(ctx, b, shape);
  if (prefix === null) {
    return null;
  }
  const eb = rewriteEmptyBlock(ctx, b, withAttrs, label, prefix, shape);
  if (eb !== null) {
    return eb;
  }
  const result = rsRewriteBlockWithVisitor(ctx, prefix, b, withAttrs, label, shape, true);
  if (result === null) {
    return null;
  }
  if (allowSingleLine && rsLines(result).length <= 3) {
    const sl = rewriteSingleLineBlock(ctx, prefix, b, withAttrs, label, shape);
    if (sl !== null) {
      return sl;
    }
  }
  return result;
};

/** rewrite_let_else_block. */
export const rsRewriteLetElseBlock = (ctx: RsCtx, b: i32, allowSingleLine: boolean, shape: RsShape): string | null =>
  rewriteBlockInner(ctx, b, false, -1, allowSingleLine, shape);

// ---------------------------------------------------------------- control flow

class ControlFlow {
  cond: i32 = -1; // the condition expr (the scrutinee of a `let`)
  block: i32 = -1;
  elseBlock: i32 = -1;
  label: i32 = -1;
  pat: i32 = -1;
  keyword: string = "";
  matcher: string = "";
  connector: string = "";
  allowSingleLine: boolean = false;
  nestedIf: boolean = false;
  isLoop: boolean = false;
  withInner: boolean = false;
  lo: i32 = 0;
  hi: i32 = 0;
  constructor() {}

  rewriteSingleLine(ctx: RsCtx, patExprStr: string, width: i32): string | null {
    const ast = ctx.ast;
    const eb = this.elseBlock;
    if (eb < 0) {
      return null;
    }
    const fixed = toI32(this.keyword.length) + 16;
    if (ast.kind[eb] !== N_EX_BLOCK) {
      return null;
    }
    const elseNode = ast.a[eb];
    if (!rsIsSimpleBlock(ctx, this.block, false) || !rsIsSimpleBlock(ctx, elseNode, false) || rsHasByte(patExprStr, 10)) {
      return null;
    }
    let nw = width - (toI32(patExprStr.length) + fixed);
    if (nw < 0) {
      return null;
    }
    const ifStr = rsFormatStmt(ctx, rsShapeLegacy(nw, 0, 0), ast.kid(this.block, 0), true);
    if (ifStr === null) {
      return null;
    }
    nw = nw - toI32(ifStr.length);
    if (nw < 0) {
      return null;
    }
    const elseStr = rsFormatStmt(ctx, rsShapeLegacy(nw, 0, 0), ast.kid(elseNode, 0), true);
    if (elseStr === null) {
      return null;
    }
    if (rsHasByte(ifStr, 10) || rsHasByte(elseStr, 10)) {
      return null;
    }
    const result = `${this.keyword} ${patExprStr} { ${ifStr} } else { ${elseStr} }`;
    if (toI32(result.length) <= width) {
      return result;
    }
    return null;
  }

  rewritePatExpr(ctx: RsCtx, expr: i32, shape: RsShape, offset: i32): string | null {
    const ast = ctx.ast;
    const condShape = shape.offsetLeft(offset);
    if (condShape === null) {
      return null;
    }
    if (this.pat >= 0) {
      const matcher = this.matcher.length === 0 ? "" : this.matcher + " ";
      const p0 = condShape.offsetLeft(toI32(matcher.length));
      if (p0 === null) {
        return null;
      }
      const patShape = p0.subWidth(toI32(this.connector.length));
      if (patShape === null) {
        return null;
      }
      const patStr = rsRewritePat(ctx, this.pat, patShape);
      if (patStr === null) {
        return null;
      }
      const commentsLo = ctx.spanAfter(ast.hi[this.pat], this.hi, rsTrim(this.connector));
      return rsRewriteAssignRhsWithComments(ctx, matcher + patStr + this.connector, expr, condShape, RHS_EXPR, RT_DEFAULT, commentsLo, rsLoWithAttrs(ast, expr), true);
    }
    const r = rsRewriteExpr(ctx, expr, condShape);
    if (this.keyword === "if" || r !== null) {
      return r;
    }
    const ns = shape.blockIndent(ctx.cfg.tabSpaces).withMaxWidth(ctx.cfg);
    const r2 = rsRewriteExpr(ctx, expr, ns);
    return r2 === null ? null : rsIndentStrNl(ctx.cfg, ns.bi, ns.al) + r2;
  }

  /** rewrite_cond: [string, used_width] as the string and `this.usedWidth`. */
  usedWidth: i32 = 0;

  rewriteCond(ctx: RsCtx, shape: RsShape, altBlockSep: string): string | null {
    const ast = ctx.ast;
    const cfg = ctx.cfg;
    const fresh = shape.withWidth(ctx.budget(shape.usedWidth()));
    let cs = fresh;
    if (this.nestedIf) {
      const c7 = fresh.offsetLeft(7);
      if (c7 === null) {
        return null;
      }
      cs = c7;
    }
    const labelString = rewriteLabel(ctx, this.label);
    const lo = this.label >= 0 ? ctx.f.t.hi[this.label] : this.lo;
    let keyword = this.keyword;
    let afterKwd = 0;
    if (this.keyword === "for await") {
      const afterFor = ctx.spanAfter(lo, this.hi, "for");
      const beforeAwait = ctx.optSpanBefore(afterFor, this.hi, "await");
      const afterAwait = ctx.optSpanAfter(afterFor, this.hi, "await");
      if (beforeAwait < 0 || afterAwait < 0) {
        return null;
      }
      const kwd = rsCombineStrsWithMissingComments(ctx, "for", "await", afterFor, beforeAwait, shape, true);
      if (kwd === null) {
        return null;
      }
      keyword = kwd;
      afterKwd = afterAwait;
    } else {
      afterKwd = ctx.spanAfter(lo, this.hi, rsTrim(this.keyword));
    }
    const offset = rsLastLineWidth(keyword, cfg.tabSpaces) + toI32(labelString.length) + 1;
    let patExprString = "";
    if (this.cond >= 0) {
      const r = this.rewritePatExpr(ctx, this.cond, cs, offset);
      if (r === null) {
        return null;
      }
      patExprString = r;
    }
    let olb = cfg.maxWidth - (cs.usedWidth() + offset + 2);
    if (olb < 0) {
      olb = 0;
    }
    const firstLineIndent = shape.usedWidth();
    const forceNewlineBrace =
      (rsHasByte(patExprString, 10) || toI32(patExprString.length) > olb) &&
      (!rsLastLineExtendable(patExprString) || lastLineOffsetted(firstLineIndent, patExprString));
    if (this.allowSingleLine && cfg.singleLineIfElseMaxWidth > 0) {
      const trial = this.rewriteSingleLine(ctx, patExprString, shape.width);
      if (trial !== null && toI32(trial.length) <= cfg.singleLineIfElseMaxWidth) {
        this.usedWidth = 0;
        return trial;
      }
    }
    let condLo = 0;
    let condHi = 0;
    if (this.cond >= 0) {
      condLo = ast.lo[this.cond];
      condHi = ast.hi[this.cond];
    } else {
      condLo = ast.lo[this.block];
      condHi = ast.lo[this.block];
    }
    let bkcHi = 0;
    if (this.pat < 0) {
      bkcHi = condLo;
    } else if (this.matcher.length === 0) {
      bkcHi = ast.lo[this.pat];
    } else {
      bkcHi = ctx.spanBefore(this.lo, this.hi, rsTrim(this.matcher));
    }
    const betweenKwdCond = extractComment(ctx, afterKwd, bkcHi, shape);
    const afterCond = extractComment(ctx, condHi, ast.lo[this.block], shape);
    let blockSep = " ";
    if (this.cond < 0 && betweenKwdCond !== null) {
      blockSep = "";
    } else if (forceNewlineBrace) {
      blockSep = altBlockSep;
    }
    let used = 0;
    if (rsHasByte(patExprString, 10)) {
      used = rsLastLineWidth(patExprString, cfg.tabSpaces);
    } else {
      used = toI32(labelString.length) + rsLastLineWidth(keyword, cfg.tabSpaces) + toI32(patExprString.length) + 2;
    }
    this.usedWidth = used;
    let mid = "";
    if (betweenKwdCond !== null) {
      mid = betweenKwdCond;
    } else {
      mid = patExprString.length === 0 || patExprString.startsWith("\n") ? "" : " ";
    }
    return labelString + keyword + mid + patExprString + (afterCond !== null ? afterCond : blockSep);
  }

  rewrite(ctx: RsCtx, shape: RsShape): string | null {
    const ast = ctx.ast;
    const altBlockSep = rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
    const condStr = this.rewriteCond(ctx, shape, altBlockSep);
    if (condStr === null) {
      return null;
    }
    const used = this.usedWidth;
    if (used === 0) {
      return condStr;
    }
    let bw = shape.width - used;
    if (bw < 0) {
      bw = 0;
    }
    if (this.elseBlock >= 0 || this.nestedIf) {
      bw = bw < 1 ? bw : 1;
    }
    const blockShape = shape.withWidth(bw);
    const oldIfElse = ctx.isIfElseBlock;
    const oldLoop = ctx.isLoopBlock;
    ctx.isIfElseBlock = this.elseBlock >= 0;
    ctx.isLoopBlock = this.isLoop;
    const blockStr = rsRewriteBlockWithVisitor(ctx, "", this.block, this.withInner, -1, blockShape, true);
    ctx.isLoopBlock = oldLoop;
    ctx.isIfElseBlock = oldIfElse;
    if (blockStr === null) {
      return null;
    }
    let result = condStr + blockStr;
    const eb = this.elseBlock;
    if (eb >= 0) {
      const sh2 = rsShapeIndented(shape.bi, shape.al, ctx.cfg);
      let lastInChain = false;
      let rw: string | null = null;
      if (ast.kind[eb] === N_EX_IF) {
        const cf = newIf(ast, eb, false, true);
        cf.lo = ast.lo[eb];
        cf.hi = this.hi;
        rw = cf.rewrite(ctx, sh2);
      } else {
        lastInChain = true;
        const es = sh2.withWidth(sh2.width < 1 ? sh2.width : 1);
        rw = rsFormatExpr(ctx, eb, EXPR_STMT, es);
      }
      const elseKw = rsRewriteElseKwWithComments(false, lastInChain, ctx, ast.hi[this.block], ast.lo[eb], sh2);
      result = result + elseKw;
      if (rw === null) {
        return null;
      }
      result = result + rw;
    }
    return result;
  }
}

const newIf = (ast: RsAst, e: i32, allowSingleLine: boolean, nestedIf: boolean): ControlFlow => {
  const cf = new ControlFlow();
  const cond = ast.a[e];
  if (ast.kind[cond] === N_EX_LET) {
    cf.pat = ast.a[cond];
    cf.cond = ast.b[cond];
    cf.matcher = "let";
  } else {
    cf.cond = cond;
  }
  cf.block = ast.b[e];
  cf.elseBlock = ast.c[e];
  cf.keyword = "if";
  cf.connector = " =";
  cf.allowSingleLine = allowSingleLine;
  cf.nestedIf = nestedIf;
  cf.lo = ast.lo[e];
  cf.hi = ast.hi[e];
  return cf;
};

const toControlFlow = (ctx: RsCtx, e: i32, exprType: i32): ControlFlow | null => {
  const ast = ctx.ast;
  const k = ast.kind[e];
  if (k === N_EX_IF) {
    return newIf(ast, e, exprType === EXPR_SUB, false);
  }
  const cf = new ControlFlow();
  cf.lo = ast.lo[e];
  cf.hi = ast.hi[e];
  cf.withInner = true;
  cf.isLoop = true;
  if (k === N_EX_FOR) {
    cf.cond = ast.b[e];
    cf.block = ast.c[e];
    cf.label = ast.d[e];
    cf.pat = ast.a[e];
    cf.keyword = (ast.fl[e] & FOR_AWAIT) !== 0 ? "for await" : "for";
    cf.connector = " in";
    return cf;
  }
  if (k === N_EX_LOOP) {
    cf.block = ast.b[e];
    cf.label = ast.d[e];
    cf.keyword = "loop";
    return cf;
  }
  if (k === N_EX_WHILE) {
    const cond = ast.a[e];
    if (ast.kind[cond] === N_EX_LET) {
      cf.pat = ast.a[cond];
      cf.cond = ast.b[cond];
      cf.matcher = "let";
    } else {
      cf.cond = cond;
    }
    cf.block = ast.b[e];
    cf.label = ast.d[e];
    cf.keyword = "while";
    cf.connector = " =";
    return cf;
  }
  return null;
};

/** rewrite_cond: the condition part of a control flow (or a match's scrutinee). */
export const rsRewriteCond = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (ast.kind[e] === N_EX_MATCH) {
    const cs = shape.offsetLeft(8);
    if (cs === null) {
      return null;
    }
    return rsRewriteExpr(ctx, ast.a[e], cs);
  }
  const cf = toControlFlow(ctx, e, EXPR_SUB);
  if (cf === null) {
    return null;
  }
  const alt = "\n" + rsIndentStr(ctx.cfg, shape.bi, 0);
  return cf.rewriteCond(ctx, shape, alt);
};

const lastLineOffsetted = (startColumn: i32, s: string): boolean => {
  let lead = 0;
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c === 10) {
      break;
    }
    if (c === 32 || c === 9 || c === 13) {
      lead++;
    } else {
      lead = 0;
    }
  }
  return lead > startColumn;
};

const extractComment = (ctx: RsCtx, lo: i32, hi: i32, shape: RsShape): string | null => {
  const c = rsRewriteMissingComment(ctx.snippet(lo, hi), shape, ctx.cfg);
  if (c === null || c.length === 0) {
    return null;
  }
  const ind = rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
  return ind + c + ind;
};

/** rewrite_else_kw_with_comments over the span [lo, hi) that holds `else`. */
export const rsRewriteElseKwWithComments = (forceNewlineElse: boolean, isLast: boolean, ctx: RsCtx, lo: i32, hi: i32, shape: RsShape): string => {
  const elseLo = ctx.spanBefore(lo, hi, "else");
  const before = extractComment(ctx, lo, elseLo, shape);
  const elseHi = ctx.spanAfter(lo, hi, "else");
  const after = extractComment(ctx, elseHi, hi, shape);
  const nl = rsIndentStrNl(ctx.cfg, shape.bi, shape.al);
  const beforeSep = forceNewlineElse ? nl : " ";
  if (isLast) {
    // (control_brace_style is AlwaysSameLine)
  }
  return (before !== null ? before : beforeSep) + "else" + (after !== null ? after : " ");
};

// ---------------------------------------------------------------- literals, calls, parens, index

/** rewrite_literal for token `tok`. */
/** rewrite_literal. */
export const rsRewriteLiteralTok = (ctx: RsCtx, tok: i32, shape: RsShape): string | null => rsWrapStr(ctx.tokStr(tok), ctx.cfg, shape);

/** A literal expression: rewrite_literal, or a raw string kept as written. */
export const rsRewriteLiteral = (ctx: RsCtx, tok: i32, shape: RsShape): string | null => {
  const s = ctx.tokStr(tok);
  const r = rsWrapStr(s, ctx.cfg, shape);
  if (r !== null) {
    return r;
  }
  // A raw string that does not fit is kept as written.
  const k = ctx.f.t.kind[tok];
  if (k === 10) {
    return rsTrim(s);
  }
  return null;
};

/** choose_separator_tactic: -1 for None. */
const chooseSeparatorTactic = (ctx: RsCtx, lo: i32, hi: i32): i32 => {
  if (ctx.insideMacro) {
    return rsSpanEndsWithComma(ctx, lo, hi) ? ST_ALWAYS : ST_NEVER;
  }
  return -1;
};

/** rewrite_call: args are expr nodes, [lo, hi) the span after the callee. */
export const rsRewriteCall = (ctx: RsCtx, callee: string, args: i32[], lo: i32, hi: i32, shape: RsShape): string | null =>
  rsRewriteWithParens(ctx, callee, args, OC_EXPR, shape, lo, hi, ctx.cfg.fnCallWidth, chooseSeparatorTactic(ctx, lo, hi));

/** is_simple_expr. */
export const rsIsSimpleExpr = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  if (k === N_EX_LIT) {
    return true;
  }
  if (k === N_EX_PATH) {
    return ast.a[e] < 0 && ast.ln[ast.b[e]] <= 1;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_CAST || k === N_EX_FIELD || k === N_EX_TRY || k === N_EX_UNARY) {
    return rsIsSimpleExpr(ast, ast.a[e]);
  }
  if (k === N_EX_INDEX || k === N_EX_REPEAT) {
    return rsIsSimpleExpr(ast, ast.a[e]) && rsIsSimpleExpr(ast, ast.b[e]);
  }
  return false;
};

/** can_be_overflowed_expr. */
export const rsCanBeOverflowedExpr = (ctx: RsCtx, e: i32, len: i32): boolean => {
  const ast = ctx.ast;
  if (ast.atn[e] > 0) {
    return false;
  }
  const k = ast.kind[e];
  if (k === N_EX_MATCH) {
    return len === 1;
  }
  if (k === N_EX_IF || k === N_EX_FOR || k === N_EX_LOOP || k === N_EX_WHILE) {
    return len === 1; // combine_control_expr
  }
  if (k === N_EX_ASYNC || k === N_EX_BLOCK || k === N_EX_CLOSURE || k === N_EX_TRY_BLOCK) {
    return true;
  }
  if (k === N_EX_ARRAY || k === N_EX_STRUCT) {
    return len === 1;
  }
  if (k === N_EX_MAC || k === N_EX_CALL || k === N_EX_METHOD || k === N_EX_TUP) {
    return len === 1;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_TRY || k === N_EX_UNARY || k === N_EX_CAST) {
    return rsCanBeOverflowedExpr(ctx, ast.a[e], len);
  }
  return false;
};

/** is_nested_call. */
export const rsIsNestedCall = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  if (k === N_EX_CALL || k === N_EX_MAC) {
    return true;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_TRY || k === N_EX_UNARY || k === N_EX_CAST) {
    return rsIsNestedCall(ast, ast.a[e]);
  }
  return false;
};

/** is_method_call. */
export const rsIsMethodCall = (ast: RsAst, e: i32): boolean => {
  const k = ast.kind[e];
  if (k === N_EX_METHOD) {
    return true;
  }
  if (k === N_EX_ADDR_OF || k === N_EX_CAST || k === N_EX_TRY || k === N_EX_UNARY) {
    return rsIsMethodCall(ast, ast.a[e]);
  }
  return false;
};

/** span_ends_with_comma. */
export const rsSpanEndsWithComma = (ctx: RsCtx, lo: i32, hi: i32): boolean => {
  const s = ctx.snippet(lo, hi);
  const r = rsCharClasses(s);
  let result = false;
  let prev = 0;
  for (let ci = 0; ci < r.nc; ci++) {
    const i = r.starts[ci];
    const c = s.charCodeAt(i);
    if (rsKindIsComment(r.kinds[i]) || rsWsLenAt(s, i) > 0) {
      continue;
    }
    if (c === 41 || c === 125 || c === 93) {
      result = result && !(prev === 41 || prev === 125 || prev === 93);
    } else if (c === 44) {
      result = true;
    } else {
      result = false;
    }
    prev = c;
  }
  return result;
};

export const rsRewriteParen = (ctx: RsCtx, sub0: i32, shape: RsShape, lo0: i32, hi0: i32): string | null => {
  const ast = ctx.ast;
  let sub = sub0;
  let lo = lo0;
  let hi = hi0;
  let preLo = 0;
  let preHi = 0;
  let postLo = 0;
  let postHi = 0;
  let pre: string | null = "";
  let post: string | null = "";
  for (;;) {
    preLo = lo + 1;
    preHi = rsLoWithAttrs(ast, sub);
    postLo = ast.hi[sub];
    postHi = hi - 1;
    pre = rsRewriteMissingComment(ctx.snippet(preLo, preHi), shape, ctx.cfg);
    post = rsRewriteMissingComment(ctx.snippet(postLo, postHi), shape, ctx.cfg);
    if (pre === null || post === null) {
      return null;
    }
    if (ast.kind[sub] === N_EX_PAREN && pre.length === 0 && post.length === 0 && ast.atn[sub] === 0) {
      lo = ast.lo[sub];
      hi = ast.hi[sub];
      sub = ast.a[sub];
      continue;
    }
    break;
  }
  const s0 = shape.offsetLeft(1);
  if (s0 === null) {
    return null;
  }
  const subShape = s0.subWidth(1);
  if (subShape === null) {
    return null;
  }
  const subStr = rsRewriteExpr(ctx, sub, subShape);
  if (subStr === null) {
    return null;
  }
  const preS = pre ?? "";
  const postS = post ?? "";
  if (preS.indexOf("//") < 0 && postS.indexOf("//") < 0) {
    return `(${preS}${subStr}${postS})`;
  }
  // rewrite_paren_in_multi_line.
  const cfg = ctx.cfg;
  const nbi = shape.bi + cfg.tabSpaces;
  const ns = rsShapeIndented(nbi, shape.al, cfg);
  const pc = rsRewriteMissingComment(ctx.snippet(preLo, preHi), ns, cfg);
  const pc2 = rsRewriteMissingComment(ctx.snippet(postLo, postHi), ns, cfg);
  const ss = rsRewriteExpr(ctx, sub, ns);
  if (pc === null || pc2 === null || ss === null) {
    return null;
  }
  const ind = rsIndentStrNl(cfg, nbi, shape.al);
  let result = "(";
  if (pc.length !== 0) {
    result = result + ind + pc;
  }
  result = result + ind + ss;
  if (pc2.length !== 0) {
    result = result + ind + pc2;
  }
  return result + rsIndentStrNl(cfg, shape.bi, shape.al) + ")";
};

const rewriteIndex = (ctx: RsCtx, expr: i32, index: i32, shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  const exprStr = rsRewriteExpr(ctx, expr, shape);
  if (exprStr === null) {
    return null;
  }
  const offset = rsLastLineWidth(exprStr, cfg.tabSpaces) + 1;
  const rhsOverhead = shape.rhsOverhead(cfg);
  let is: RsShape | null = null;
  if (rsHasByte(exprStr, 10)) {
    const s1 = rsShapeLegacy(cfg.maxWidth, shape.bi, shape.al).offsetLeft(offset);
    is = s1 === null ? null : s1.subWidth(1 + rhsOverhead);
  } else {
    const s1 = shape.offsetLeft(offset);
    is = s1 === null ? null : s1.subWidth(1);
  }
  const orig: string | null = is === null ? null : rsRewriteExpr(ctx, index, is);
  if (orig !== null && !rsHasByte(orig, 10)) {
    return `${exprStr}[${orig}]`;
  }
  const nbi = shape.bi + cfg.tabSpaces;
  const s2 = rsShapeIndented(nbi, shape.al, cfg).offsetLeft(1);
  if (s2 === null) {
    return null;
  }
  const is2 = s2.subWidth(1 + rhsOverhead);
  if (is2 === null) {
    return null;
  }
  const nw = rsRewriteExpr(ctx, index, is2);
  const ind = rsIndentStrNl(cfg, nbi, shape.al);
  if (nw !== null && !rsHasByte(nw, 10)) {
    return `${exprStr}${ind}[${nw}]`;
  }
  if (orig === null && nw !== null) {
    return `${exprStr}${ind}[${nw}]`;
  }
  if (orig !== null) {
    return `${exprStr}[${orig}]`;
  }
  return null;
};

// ---------------------------------------------------------------- struct literals

/** The Spanned span of an ExprField: [attrs lo, hi). */
const exFieldLo = (ast: RsAst, f: i32): i32 => rsLoWithAttrs(ast, f);

const rewriteStructLit = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const lo = ast.lo[e];
  const hi = ast.hi[e];
  const ps = shape.subWidth(2);
  if (ps === null) {
    return null;
  }
  const pathStr = rsRewritePath(ctx, PC_EXPR, ast.a[e], ast.b[e], ps);
  if (pathStr === null) {
    return null;
  }
  const nf = ast.ln[e];
  const f = ast.fl[e];
  const hasRest = (f & ST_REST) !== 0;
  const hasBase = (f & ST_BASE) !== 0;
  if (!hasRest && !hasBase && nf === 0) {
    return `${pathStr} {}`;
  }
  if (hasRest && nf === 0) {
    return `${pathStr} { .. }`;
  }
  const hasBaseOrRest = hasRest || hasBase;
  const pair = rsStructLitShape(shape, ctx, toI32(pathStr.length) + 3, 2);
  const hShape = pair.h;
  const vShape = pair.v;
  const oneLineWidth = hShape === null ? 0 : hShape.width;
  const bodyLo = ctx.spanAfter(lo, hi, "{");
  const n = nf + (hasBaseOrRest ? 1 : 0);
  const lastFieldHi = nf > 0 ? ast.hi[ast.kid(e, nf - 1)] : lo;
  const base = ast.c[e];
  const items = rsItemizeList(
    ctx,
    n,
    "}",
    ",",
    (i: i32): i32 => {
      if (i < nf) {
        return exFieldLo(ast, ast.kid(e, i));
      }
      if (hasBase) {
        const sn = ctx.snippet(lastFieldHi, ast.lo[base]);
        return lastFieldHi + rsFindUncommented(sn, "..");
      }
      return ast.e[e];
    },
    (i: i32): i32 => {
      if (i < nf) {
        return ast.hi[ast.kid(e, i)];
      }
      if (hasBase) {
        return ast.hi[base];
      }
      return ast.e[e] + 2;
    },
    (i: i32): string | null => {
      if (i < nf) {
        const s = vShape.subWidth(1);
        if (s === null) {
          return null;
        }
        return rsRewriteField(ctx, ast.kid(e, i), s, 0);
      }
      if (hasBase) {
        const s = vShape.offsetLeft(2);
        if (s === null) {
          return null;
        }
        const r = rsRewriteExpr(ctx, base, s);
        return r === null ? null : ".." + r;
      }
      return "..";
    },
    bodyLo,
    hi,
    false,
  );
  const tactic = rsStructLitTactic(hShape, ctx, items);
  const nested = rsShapeForTactic(tactic, hShape, vShape);
  const endsWithComma = rsSpanEndsWithComma(ctx, lo, hi);
  const forceNoTrailing = ctx.insideMacro && !endsWithComma;
  const fmt = rsStructLitFormatting(nested, tactic, ctx, forceNoTrailing || hasBaseOrRest);
  const fieldsStr = rsWriteList(items, fmt);
  if (fieldsStr === null) {
    return null;
  }
  const wrapped = wrapStructField(ctx, fieldsStr, shape, vShape, oneLineWidth);
  return `${pathStr} {${wrapped}}`;
};

const wrapStructField = (ctx: RsCtx, fieldsStr: string, shape: RsShape, nested: RsShape, oneLineWidth: i32): string => {
  const cfg = ctx.cfg;
  const shouldVertical = rsHasByte(fieldsStr, 10) || toI32(fieldsStr.length) > oneLineWidth;
  if (shouldVertical) {
    return rsIndentStrNl(cfg, nested.bi, nested.al) + fieldsStr + rsIndentStrNl(cfg, shape.bi, shape.al);
  }
  return ` ${fieldsStr} `;
};

/** rewrite_field for an ExprField. */
export const rsRewriteField = (ctx: RsCtx, f: i32, shape: RsShape, prefixMaxWidth: i32): string | null => {
  const ast = ctx.ast;
  if (rsAttrsContainSkip(ctx, f)) {
    return ctx.snippet(exFieldLo(ast, f), ast.hi[f]);
  }
  const attrs0 = rsRewriteNodeAttrs(ctx, f, shape);
  if (attrs0 === null) {
    return null;
  }
  const attrsStr = attrs0.length !== 0 ? attrs0 + rsIndentStrNl(ctx.cfg, shape.bi, shape.al) : attrs0;
  const name = ctx.tokStr(ast.d[f]);
  if ((ast.fl[f] & SHORTHAND) !== 0) {
    return attrsStr + name;
  }
  let sep = ": ";
  for (let i = 0; i < prefixMaxWidth - toI32(name.length); i++) {
    sep = sep + " ";
  }
  const overhead = toI32(name.length) + toI32(sep.length);
  const es = shape.offsetLeft(overhead);
  const ex: string | null = es === null ? null : rsRewriteExpr(ctx, ast.a[f], es);
  if (ex !== null) {
    return attrsStr + name + sep + ex;
  }
  const ebi = shape.bi + ctx.cfg.tabSpaces;
  const e2 = rsRewriteExpr(ctx, ast.a[f], rsShapeIndented(ebi, shape.al, ctx.cfg));
  if (e2 === null) {
    return null;
  }
  return `${attrsStr}${name}:\n${rsIndentStr(ctx.cfg, ebi, shape.al)}${e2}`;
};

// ---------------------------------------------------------------- let, tuples, unary, assignment

const rewriteLet = (ctx: RsCtx, shape: RsShape, pat: i32, expr: i32): string | null => {
  const ast = ctx.ast;
  const ps = shape.offsetLeft(4);
  if (ps === null) {
    return null;
  }
  const patStr = rsRewritePat(ctx, pat, ps);
  if (patStr === null) {
    return null;
  }
  const result = "let " + patStr + " =";
  const commentsLo = ctx.spanAfter(ast.hi[pat], ast.hi[expr], "=");
  return rsRewriteAssignRhsWithComments(ctx, result, expr, shape, RHS_EXPR, RT_DEFAULT, commentsLo, rsLoWithAttrs(ast, expr), true);
};

/** rewrite_tuple over item nodes of category `oc`, span [lo, hi). */
export const rsRewriteTuple = (ctx: RsCtx, items: i32[], oc: i32, lo: i32, hi: i32, shape: RsShape, isSingleton: boolean): string | null => {
  let force = -1;
  if (ctx.insideMacro) {
    force = rsSpanEndsWithComma(ctx, lo, hi) ? ST_ALWAYS : ST_NEVER;
  } else if (isSingleton) {
    force = ST_ALWAYS;
  }
  return rsRewriteWithParens(ctx, "", items, oc, shape, lo, hi, ctx.cfg.fnCallWidth, force);
};

/** rewrite_unary_prefix over any node. */
export const rsRewriteUnaryPrefix = (ctx: RsCtx, prefix: string, n: i32, shape: RsShape): string | null => {
  const s = shape.offsetLeft(toI32(prefix.length));
  if (s === null) {
    return null;
  }
  const r = rsRewriteNode(ctx, n, s);
  return r === null ? null : prefix + r;
};

export const rsRewriteUnarySuffix = (ctx: RsCtx, suffix: string, n: i32, shape: RsShape): string | null => {
  const s = shape.subWidth(toI32(suffix.length));
  if (s === null) {
    return null;
  }
  const r = rsRewriteNode(ctx, n, s);
  return r === null ? null : r + suffix;
};

const rewriteAssignment = (ctx: RsCtx, lhs: i32, rhs: i32, op: string, shape: RsShape): string | null => {
  const ls = shape.subWidth(toI32(op.length) + 1);
  if (ls === null) {
    return null;
  }
  const l = rsRewriteExpr(ctx, lhs, ls);
  if (l === null) {
    return null;
  }
  return rsRewriteAssignRhs(ctx, `${l} ${op}`, rhs, RHS_EXPR, shape);
};

/** The rewrite of a right-hand side node of kind `kind`. */
const rewriteRhsNode = (ctx: RsCtx, n: i32, kind: i32, shape: RsShape): string | null => {
  if (kind === RHS_BOUNDS) {
    return rsRewriteBounds(ctx, n, shape);
  }
  if (kind === RHS_TRAIT_ALIAS) {
    return rsRewriteTraitAliasBounds(ctx, n, shape);
  }
  if (kind === RHS_OPAQUE) {
    const s = shape.offsetLeft(5);
    if (s === null) {
      return null;
    }
    const b = rsRewriteBounds(ctx, n, s);
    return b === null ? null : "impl " + b;
  }
  return rsRewriteNode(ctx, n, shape);
};

/** rewrite_assign_rhs. */
export const rsRewriteAssignRhs = (ctx: RsCtx, lhs: string, n: i32, kind: i32, shape: RsShape): string | null =>
  rsRewriteAssignRhsWith(ctx, lhs, n, kind, shape, RT_DEFAULT);

/** rewrite_assign_rhs_with. */
export const rsRewriteAssignRhsWith = (ctx: RsCtx, lhs: string, n: i32, kind: i32, shape: RsShape, tactics: i32): string | null => {
  const rhs = rewriteAssignRhsExpr(ctx, lhs, n, kind, shape, tactics);
  return rhs === null ? null : lhs + rhs;
};

/** rewrite_assign_rhs_expr. */
const rewriteAssignRhsExpr = (ctx: RsCtx, lhs: string, n: i32, kind: i32, shape: RsShape, tactics: i32): string | null => {
  const cfg = ctx.cfg;
  let llw = rsLastLineWidth(lhs, cfg.tabSpaces) - (rsHasByte(lhs, 10) ? shape.iw() : 0);
  if (llw < 0) {
    llw = 0;
  }
  const orig0 = shape.offsetLeft(llw + 1);
  const orig = orig0 !== null ? orig0 : new RsShape(0, shape.bi, shape.al, shape.off + llw + 1);
  const k = rsFindLastUncommented(lhs, "=");
  const hasRhsComment = k >= 0 ? toI32(rsTrimEnd(lhs).length) > k + 1 : false;
  const origRhs = rewriteRhsNode(ctx, n, kind, orig);
  return chooseRhs(ctx, n, kind, orig, origRhs, tactics, hasRhsComment);
};

/** rewrite_assign_rhs_with_comments; [lo, hi) is the span between lhs and rhs. */
export const rsRewriteAssignRhsWithComments = (
  ctx: RsCtx,
  lhs: string,
  n: i32,
  shape0: RsShape,
  kind: i32,
  tactics: i32,
  lo: i32,
  hi: i32,
  allowExtend: boolean,
): string | null => {
  const hasComment = rsContainsComment(ctx.snippet(lo, hi));
  let shape = shape0;
  if (hasComment) {
    const s1 = shape0.blockLeft(ctx.cfg.tabSpaces);
    if (s1 === null) {
      return null;
    }
    shape = s1;
  }
  const rhs = rewriteAssignRhsExpr(ctx, lhs, n, kind, shape, tactics);
  if (rhs === null) {
    return null;
  }
  if (hasComment) {
    return rsCombineStrsWithMissingComments(ctx, lhs, rsTrimStart(rhs), lo, hi, shape, allowExtend);
  }
  return lhs + rhs;
};

const chooseRhs = (ctx: RsCtx, n: i32, kind: i32, shape: RsShape, origRhs: string | null, tactics: i32, hasRhsComment: boolean): string | null => {
  const cfg = ctx.cfg;
  if (origRhs !== null && origRhs.length === 0) {
    return "";
  }
  if (origRhs !== null && !rsHasByte(origRhs, 10) && rsWidth(origRhs) <= shape.width) {
    return " " + origRhs;
  }
  let ns: RsShape | null = null;
  if (tactics === RT_FORCE_NEXT_LINE_WITHOUT_INDENT) {
    ns = shape.withMaxWidth(cfg).subWidth(shape.iw());
  } else {
    ns = rsShapeIndented(shape.bi + cfg.tabSpaces, shape.al, cfg).subWidth(shape.rhsOverhead(cfg));
  }
  if (ns === null) {
    return null;
  }
  const newRhs = rewriteRhsNode(ctx, n, kind, ns);
  const newIndent = rsIndentStrNl(cfg, shape.bi + cfg.tabSpaces, shape.al);
  const beforeSpace = hasRhsComment ? "" : " ";
  if (origRhs !== null && newRhs !== null) {
    if (!rsFilteredStrFits(newRhs, cfg.maxWidth, cfg.tabSpaces, ns)) {
      return beforeSpace + origRhs;
    }
    if (preferNextLine(origRhs, newRhs, tactics)) {
      return newIndent + newRhs;
    }
    return beforeSpace + origRhs;
  }
  if (origRhs === null && newRhs !== null) {
    return newIndent + newRhs;
  }
  if (origRhs === null && newRhs === null) {
    if (tactics === RT_ALLOW_OVERFLOW) {
      const r = rewriteRhsNode(ctx, n, kind, shape.infiniteWidth());
      return r === null ? null : beforeSpace + r;
    }
    return null;
  }
  if (origRhs !== null) {
    return beforeSpace + origRhs;
  }
  return null;
};

/** prefer_next_line. */
export const rsPreferNextLine = (orig: string, next: string, tactics: i32): boolean => preferNextLine(orig, next, tactics);

const preferNextLine = (orig: string, next: string, tactics: i32): boolean =>
  tactics === RT_FORCE_NEXT_LINE_WITHOUT_INDENT ||
  !rsHasByte(next, 10) ||
  rsCountNewlines(orig) > rsCountNewlines(next) + 1 ||
  (rsFirstLineEndsWith(orig, 40) && !rsFirstLineEndsWith(next, 40)) ||
  (rsFirstLineEndsWith(orig, 123) && !rsFirstLineEndsWith(next, 123)) ||
  (rsFirstLineEndsWith(orig, 91) && !rsFirstLineEndsWith(next, 91));

// ---------------------------------------------------------------- ranges

/** lit_ends_in_dot (float_literal_trailing_zero is Preserve). */
export const rsLitEndsInDot = (ctx: RsCtx, e: i32): boolean => {
  const ast = ctx.ast;
  if (ast.kind[e] !== N_EX_LIT) {
    return false;
  }
  const tok = ast.d[e];
  if (ctx.f.t.kind[tok] !== 4) {
    return false;
  }
  const s = ctx.tokStr(tok);
  // No suffix: the symbol is the whole token.
  return ctx.f.t.suf[tok] === ctx.f.t.hi[tok] && s.endsWith(".");
};

const needsSpaceBeforeRange = (ctx: RsCtx, lhs: i32): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[lhs];
  if (k === N_EX_LIT) {
    return rsLitEndsInDot(ctx, lhs);
  }
  if (k === N_EX_UNARY) {
    return needsSpaceBeforeRange(ctx, ast.a[lhs]);
  }
  if (k === N_EX_BINARY) {
    return needsSpaceBeforeRange(ctx, ast.b[lhs]);
  }
  return false;
};

const needsSpaceAfterRange = (ast: RsAst, rhs: i32): boolean => ast.kind[rhs] === N_EX_RANGE && ast.a[rhs] < 0;

const rewriteRange = (ctx: RsCtx, shape: RsShape, lhs: i32, rhs: i32, delim: string): string | null => {
  const ast = ctx.ast;
  const before = lhs >= 0 && needsSpaceBeforeRange(ctx, lhs) ? " " : "";
  const after = rhs >= 0 && needsSpaceAfterRange(ast, rhs) ? " " : "";
  const sp = before + delim + after;
  if (lhs >= 0 && rhs >= 0) {
    return rsRewritePair(ctx, lhs, rhs, new RsPairParts("", sp, ""), shape, SPB_FRONT);
  }
  if (rhs >= 0) {
    return rsRewriteUnaryPrefix(ctx, sp, rhs, shape);
  }
  if (lhs >= 0) {
    return rsRewriteUnarySuffix(ctx, sp, lhs, shape);
  }
  return delim;
};

// ---------------------------------------------------------------- statements

/** Stmt::rewrite / format_stmt for statement `s` (`isLast`: the last of its block). */
export const rsFormatStmt = (ctx: RsCtx, shape: RsShape, s: i32, isLast: boolean): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[s];
  let result: string | null = null;
  if (k === N_LOCAL) {
    result = rsRewriteLocal(ctx, s, shape);
  } else if (k === N_STMT_EXPR || k === N_STMT_SEMI) {
    const ex = ast.a[s];
    const ek = ast.kind[ex];
    let isLastExpr = false;
    if (isLast && k === N_STMT_EXPR) {
      isLastExpr = !(ek === N_EX_RET || ek === N_EX_CONTINUE || ek === N_EX_BREAK);
    }
    let suffix = "";
    if (k === N_STMT_SEMI) {
      if (ek === N_EX_WHILE || ek === N_EX_LOOP || ek === N_EX_FOR) {
        suffix = "";
      } else {
        suffix = ";";
      }
    }
    if (isLastExpr) {
      // (unused in style edition 2021)
    }
    const sh = shape.subWidth(toI32(suffix.length));
    if (sh === null) {
      return null;
    }
    const r = rsFormatExpr(ctx, ex, EXPR_STMT, sh);
    result = r === null ? null : r + suffix;
  } else {
    return null;
  }
  if (result === null) {
    return null;
  }
  return rsRecoverCommentRemoved(ctx, result, stmtSpannedLo(ast, s), ast.hi[s]);
};

/** The Spanned lo of a statement. */
export const stmtSpannedLo = (ast: RsAst, s: i32): i32 => {
  const k = ast.kind[s];
  if (k === N_STMT_EXPR || k === N_STMT_SEMI) {
    return rsLoWithAttrs(ast, ast.a[s]);
  }
  return rsLoWithAttrs(ast, s);
};

export const rsFormatStmtOfBlock = (ctx: RsCtx, b: i32, shape: RsShape): string | null => rsFormatStmt(ctx, shape, ctx.ast.kid(b, 0), true);


export const rsIsBlockKind = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_BLOCK;
export const rsIsExFieldKind = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_EXFIELD;
export const rsIsAttrKind = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_ATTR;
export const rsExprListItemType = (it: RsListItem): string => it.inner();
