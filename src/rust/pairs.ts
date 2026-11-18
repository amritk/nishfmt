// Formatting binary-operator chains and pairs (`a + b`, `x as T`, `[x; n]`).
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): pairs.rs.

import { N_EX_BINARY } from "./ast";
import { rsFirstLineWidth, rsIsSingleLine, rsLastLineWidth, rsTrimmedLastLineWidth, rsWrapStr } from "./comment";
import { RsCtx } from "./context";
import { rsRewriteExpr, rsRewriteNode } from "./expr";
import { RsShape, rsIndentStrNl, rsShapeIndented } from "./shape";
import { rsHasByte, rsLines, rsTrimEnd, rsTrimStart } from "./str";

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
      ? shape.usedWidth() + toI32(pp.prefix.length) + toI32(rsTrimEnd(pp.infix).length)
      : shape.usedWidth();
  const lhsShape = shape.withWidth(ctx.budget(lhsOverhead));
  const l = rsRewriteNode(ctx, lhs, lhsShape);
  if (l === null) {
    return null;
  }
  const lhsResult = pp.prefix + l;
  let rhsOrig: string | null = null;
  const s1 = shape.offsetLeft(rsLastLineWidth(lhsResult, ts) + toI32(pp.infix.length));
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
      const olw =
        rsLastLineWidth(lhsResult, ts) + toI32(pp.infix.length) + rsFirstLineWidth(rhsOrig) + toI32(pp.suffix.length);
      if (olw <= shape.width) {
        return lhsResult + pp.infix + rhsOrig + pp.suffix;
      }
    }
  }
  const rhsOverhead = shape.rhsOverhead(cfg);
  const rs0 = rsShapeIndented(shape.bi + ts, shape.al, cfg).subWidth(rhsOverhead);
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
  const one = rewritePairsOneLine(ctx, list, shape);
  if (one !== null) {
    return one;
  }
  return rewritePairsMultiline(ctx, list, shape);
};

const flatten = (ctx: RsCtx, e: i32, shape: RsShape): PairList | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  if (ast.kind[e] !== N_EX_BINARY) {
    return null;
  }
  const topOp = ast.x[e];
  const list = new PairList();
  const stack: i32[] = [];
  let node = e;
  for (;;) {
    if (ast.kind[node] === N_EX_BINARY && ast.x[node] === topOp) {
      stack.push(node);
      node = ast.a[node];
      continue;
    }
    const opLen = list.seps.length > 0 ? toI32(list.seps[list.seps.length - 1].length) : 0;
    let rw: string | null = null;
    if (list.nodes.length === 0) {
      rw = rsRewriteExpr(ctx, node, shape);
    } else {
      const nestedOverhead = opLen + 1;
      const rhsOffset = shape.rhsOverhead(cfg);
      const ns = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg).subWidth(rhsOffset);
      const ds: RsShape | null = ns === null ? null : ns.offsetLeft(nestedOverhead);
      rw = ds === null ? null : rsRewriteExpr(ctx, node, ds);
    }
    list.nodes.push(node);
    list.rws.push(rw);
    if (stack.length === 0) {
      break;
    }
    const pop = stack.pop();
    list.seps.push(ctx.tokStr(ast.c[pop]));
    node = ast.b[pop];
  }
  return list;
};

const rewritePairsOneLine = (ctx: RsCtx, list: PairList, shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  let result = "";
  const base = shape.block();
  const n = list.seps.length;
  for (let i = 0; i < n; i++) {
    const rw = list.rws[i];
    if (rw === null) {
      return null;
    }
    if (!rsIsSingleLine(rw) || toI32(result.length) > shape.width) {
      return null;
    }
    result = result + rw + " " + list.seps[i] + " ";
  }
  const prefixLen = toI32(result.length);
  const last = list.nodes[list.nodes.length - 1];
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
  const r0 = list.rws[0];
  if (r0 === null) {
    return null;
  }
  let result = r0;
  for (let i = 1; i < list.nodes.length; i++) {
    const e = list.nodes[i];
    const s = list.seps[i - 1];
    const offset = rsHasByte(result, 10) ? 0 : shape.usedWidth();
    if (rsLastLineWidth(result, cfg.tabSpaces) + offset <= ns.usedWidth()) {
      const ls = shape.offsetLeft(toI32(s.length) + 2 + rsTrimmedLastLineWidth(result));
      if (ls !== null) {
        const rw = rsRewriteExpr(ctx, e, ls);
        if (rw !== null) {
          result = result + " " + s + " " + rw;
          continue;
        }
      }
    }
    result = result + indentStr + s + " ";
    const d = list.rws[i];
    if (d === null) {
      return null;
    }
    result = result + d;
  }
  return result;
};
