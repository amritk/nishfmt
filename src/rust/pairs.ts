// Formatting binary-operator chains and pairs (`a + b`, `x as T`, `[x; n]`).
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): pairs.rs.

import {
  N_EX_ADDR_OF,
  N_EX_BINARY,
  N_EX_LET,
  N_EX_LIT,
  N_EX_PAREN,
  N_EX_PATH,
  N_EX_TRY,
  N_EX_UNARY,
  PATH_GLOBAL,
  RsAst,
} from "./ast";
import { rsFirstLineWidth, rsIsSingleLine, rsLastLineWidth, rsTrimmedLastLineWidth, rsWrapStr } from "./comment";
import { RsCtx } from "./context";
import { rsRewriteExpr, rsRewriteNode } from "./expr";
import { KW_FALSE, KW_TRUE, T_IDENT } from "./lexer";
import { RsShape, rsIndentStrNl, rsShapeIndented } from "./shape";
import { rsHasByte, rsLines, rsTrimEnd, rsTrimStart } from "./str";
import { add32, atI32 } from "../core/arr";
import { fault } from "../core/fault";

export const SPB_FRONT: i32 = 0;
export const SPB_BACK: i32 = 1;

export class RsPairParts {
  prefix: string;
  infix: string;
  suffix: string;
  constructor(prefix: string, infix: string, suffix: string) {
    this.prefix = prefix;
    this.infix = infix;
    this.suffix = suffix;
  }
}

/** rewrite_pair. */
export const rsRewritePair = (
  ctx: RsCtx,
  lhs: i32,
  rhs: i32,
  pp: RsPairParts,
  shape: RsShape,
  sepPlace: i32,
): string | null => {
  const cfg = ctx.cfg;
  const ts = cfg.tabSpaces;
  const lhsOverhead =
    sepPlace === SPB_BACK
      ? add32(add32(shape.usedWidth(), toI32(pp.prefix.length)), toI32(rsTrimEnd(pp.infix).length))
      : shape.usedWidth();
  const lhsShape = shape.withWidth(ctx.budget(lhsOverhead));
  const l = rsRewriteNode(ctx, lhs, lhsShape);
  if (l === null) {
    return null;
  }
  const lhsResult = pp.prefix + l;
  let rhsOrig: string | null = null;
  const s1 = shape.offsetLeft(add32(rsLastLineWidth(lhsResult, ts), toI32(pp.infix.length)));
  if (s1 !== null) {
    const s2 = s1.subWidth(toI32(pp.suffix.length));
    if (s2 !== null) {
      rhsOrig = rsRewriteNode(ctx, rhs, s2);
    }
  }
  if (rhsOrig !== null) {
    const ls = rsLines(rhsOrig);
    const allowSameLine = toI32(lhsResult.length) <= ts || (ls.length > 0 && ls[0].endsWith("{"));
    if (!rsHasByte(rhsOrig, 10) || allowSameLine) {
      const olw = add32(
        add32(add32(rsLastLineWidth(lhsResult, ts), toI32(pp.infix.length)), rsFirstLineWidth(rhsOrig)),
        toI32(pp.suffix.length),
      );
      if (olw <= shape.width) {
        return lhsResult + pp.infix + rhsOrig + pp.suffix;
      }
    }
  }
  const rhsOverhead = shape.rhsOverhead(cfg);
  const rs0 = rsShapeIndented(add32(shape.bi, ts), shape.al, cfg).subWidth(rhsOverhead);
  if (rs0 === null) {
    return null;
  }
  let rhsShape = rs0;
  const infix = sepPlace === SPB_BACK ? rsTrimEnd(pp.infix) : rsTrimStart(pp.infix);
  if (sepPlace === SPB_FRONT) {
    const rs1 = rhsShape.offsetLeft(toI32(infix.length));
    if (rs1 === null) {
      return null;
    }
    rhsShape = rs1;
  }
  const r = rsRewriteNode(ctx, rhs, rhsShape);
  if (r === null) {
    return null;
  }
  const indentStr = rsIndentStrNl(cfg, rhsShape.bi, rhsShape.al);
  const infixWithSep = sepPlace === SPB_BACK ? infix + indentStr : indentStr + infix;
  return lhsResult + infixWithSep + r + pp.suffix;
};

class PairList {
  nodes: i32[];
  rws: (string | null)[];
  seps: string[];
  constructor() {
    this.nodes = [];
    this.rws = [];
    this.seps = [];
  }
}

/** rewrite_all_pairs: a chain of one binary operator, flattened. */
export const rsRewriteAllPairs = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const list = flatten(ctx, e, shape);
  if (list === null) {
    return null;
  }
  // A chain with a `let` goes one operand per line, unless it is
  // `ident_or_bool && let ...`.
  if (letChainCount(ctx.ast, list) > 0 && !canRewriteLetChainSingleLine(ctx, list)) {
    return rewritePairsMultiline(ctx, list, shape);
  }
  const one = rewritePairsOneLine(ctx, list, shape);
  if (one !== null) {
    return one;
  }
  return rewritePairsMultiline(ctx, list, shape);
};

const isIdentOrBoolLit = (ctx: RsCtx, e: i32): boolean => {
  const ast = ctx.ast;
  const k = atI32(ast.kind, e);
  if (k === N_EX_PATH) {
    // A global path (`::a`) has rustc's `{{root}}` segment too.
    const path = atI32(ast.b, e);
    return atI32(ast.a, e) < 0 && atI32(ast.ln, path) === 1 && (atI32(ast.fl, path) & PATH_GLOBAL) === 0;
  }
  if (k === N_EX_LIT) {
    const kw = atI32(ctx.f.t.kw, atI32(ast.d, e));
    return atI32(ctx.f.t.kind, atI32(ast.d, e)) === T_IDENT && (kw === KW_TRUE || kw === KW_FALSE);
  }
  if (k === N_EX_UNARY || k === N_EX_ADDR_OF || k === N_EX_PAREN || k === N_EX_TRY) {
    return isIdentOrBoolLit(ctx, atI32(ast.a, e));
  }
  return false;
};

const letChainCount = (ast: RsAst, list: PairList): i32 => {
  let n = 0;
  for (const e of list.nodes) {
    // At most one a node.
    if (atI32(ast.kind, e) === N_EX_LET && n < toI32(list.nodes.length)) {
      n++;
    }
  }
  return n;
};

const canRewriteLetChainSingleLine = (ctx: RsCtx, list: PairList): boolean =>
  list.nodes.length === 2 &&
  isIdentOrBoolLit(ctx, atI32(list.nodes, 0)) &&
  atI32(ctx.ast.kind, atI32(list.nodes, 1)) === N_EX_LET;

const flatten = (ctx: RsCtx, e: i32, shape: RsShape): PairList | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  if (atI32(ast.kind, e) !== N_EX_BINARY) {
    return null;
  }
  const topOp = atI32(ast.x, e);
  const list = new PairList();
  const stack: i32[] = [];
  let node = e;
  for (;;) {
    if (atI32(ast.kind, node) === N_EX_BINARY && atI32(ast.x, node) === topOp) {
      stack.push(node);
      node = atI32(ast.a, node);
      continue;
    }
    const seps = list.seps;
    const ns0 = toI32(seps.length);
    const opLen = ns0 > 0 && ns0 <= seps.length ? toI32(seps[ns0 - 1].length) : 0;
    let rw: string | null = null;
    if (list.nodes.length === 0) {
      rw = rsRewriteExpr(ctx, node, shape);
    } else {
      const nestedOverhead = add32(opLen, 1);
      const rhsOffset = shape.rhsOverhead(cfg);
      const ns = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg).subWidth(rhsOffset);
      const ds: RsShape | null = ns === null ? null : ns.offsetLeft(nestedOverhead);
      rw = ds === null ? null : rsRewriteExpr(ctx, node, ds);
    }
    list.nodes.push(node);
    list.rws.push(rw);
    if (!(stack.length > 0)) {
      break;
    }
    const pop = stack.pop();
    list.seps.push(ctx.tokStr(atI32(ast.c, pop)));
    node = atI32(ast.b, pop);
  }
  return list;
};

const rewritePairsOneLine = (ctx: RsCtx, list: PairList, shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  let result = "";
  const base = shape.block();
  const n = list.seps.length;
  for (let i = 0; i < n; i++) {
    // One rewrite a node, and one more node than separators.
    if (i >= list.rws.length || i >= list.seps.length) {
      fault();
      return null;
    }
    const rw = list.rws[i];
    const sep = list.seps[i];
    if (rw === null) {
      return null;
    }
    if (!rsIsSingleLine(rw) || toI32(result.length) > shape.width) {
      return null;
    }
    result = result + rw + " " + sep + " ";
  }
  const prefixLen = toI32(result.length);
  const last = atI32(list.nodes, toI32(list.nodes.length) - 1);
  const cur = base.offsetLeft(rsLastLineWidth(result, cfg.tabSpaces));
  if (cur === null) {
    return null;
  }
  const lr = rsRewriteExpr(ctx, last, cur);
  if (lr === null) {
    return null;
  }
  result = result + lr;
  if (rsFirstLineWidth(result) > shape.width) {
    return null;
  }
  if (!(rsIsSingleLine(result) || lr.startsWith("{")) && (lr.startsWith("(") || prefixLen > cfg.tabSpaces)) {
    return null;
  }
  return rsWrapStr(result, cfg, shape);
};

const rewritePairsMultiline = (ctx: RsCtx, list: PairList, shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  const rhsOffset = shape.rhsOverhead(cfg);
  const ns = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg).subWidth(rhsOffset);
  if (ns === null) {
    return null;
  }
  const indentStr = rsIndentStrNl(cfg, ns.bi, ns.al);
  if (!(list.rws.length > 0)) {
    fault();
    return null;
  }
  const r0 = list.rws[0];
  if (r0 === null) {
    return null;
  }
  let result = r0;
  for (let i = 1; i < list.nodes.length; i++) {
    const e = list.nodes[i];
    // One rewrite a node, and one more node than separators.
    if (i > list.seps.length || i >= list.rws.length) {
      fault();
      return null;
    }
    const s = list.seps[i - 1];
    const d = list.rws[i];
    const offset = rsHasByte(result, 10) ? 0 : shape.usedWidth();
    if (add32(rsLastLineWidth(result, cfg.tabSpaces), offset) <= ns.usedWidth()) {
      const ls = shape.offsetLeft(add32(add32(toI32(s.length), 2), rsTrimmedLastLineWidth(result)));
      if (ls !== null) {
        const rw = rsRewriteExpr(ctx, e, ls);
        if (rw !== null) {
          result = result + " " + s + " " + rw;
          continue;
        }
      }
    }
    result = result + indentStr + s + " ";
    if (d === null) {
      return null;
    }
    result = result + d;
  }
  return result;
};
