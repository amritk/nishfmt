// Formatting chained expressions: field accesses, method calls, `.await`
// and `?`, collected into one chain and laid out together.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): chains.rs.

import {
  N_CONSTRAINT,
  N_EX_AWAIT,
  N_EX_CLOSURE,
  N_EX_FIELD,
  N_EX_LIT,
  N_EX_METHOD,
  N_EX_RANGE,
  N_EX_TRY,
  RANGE_CLOSED,
  RsAst,
} from "./ast";
import {
  K_NORMAL,
  rsCharClasses,
  rsFilteredStrFits,
  rsFirstLineWidth,
  rsLastLineWidth,
  rsRewriteComment,
  rsWrapStr,
} from "./comment";
import { RsCtx } from "./context";
import { rsLitEndsInDot, rsRewriteCall, rsRewriteExpr, rsRewriteNode, rsRewriteParen } from "./expr";
import { RsListItem, rsExtractPreComment } from "./lists";
import { RsShape } from "./shape";
import { RsStrBuf, rsHasByte, rsIndexOfByte, rsIsBlank, rsLines, rsTrim, rsTrimEnd, rsWidth } from "./str";
import { rsIdentStr, rsIsBlockExpr, rsLastLineExtendable } from "./utils";

const CI_PARENT: i32 = 0;
const CI_METHOD: i32 = 1;
const CI_FIELD: i32 = 2;
const CI_TUPLE_FIELD: i32 = 3;
const CI_AWAIT: i32 = 4;
const CI_COMMENT: i32 = 5;

const CP_SAME_LINE: i32 = 0;
const CP_DIFFERENT_LINE: i32 = 1;

class ChainItem {
  kind: i32;
  expr: i32 = -1;
  parens: boolean = false;
  tries: i32 = 0;
  lo: i32;
  hi: i32;
  comment: string = "";
  pos: i32 = 0;
  nested: boolean = false;
  constructor(kind: i32, lo: i32, hi: i32) {
    this.kind = kind;
    this.lo = lo;
    this.hi = hi;
  }
}

/** The name of field access `f` (tuple indices split from a float token included). */
export const rsFieldName = (ctx: RsCtx, f: i32): string => {
  const ast = ctx.ast;
  const tok = ast.d[f];
  const x = ast.x[f];
  if (x >= 0) {
    return ctx.snippet(ctx.f.t.lo[tok], x);
  }
  if (x <= -2) {
    return ctx.snippet(-2 - x, ctx.f.t.hi[tok]);
  }
  return ctx.tokStr(tok);
};

/** The end of field access `f`'s name. */
export const rsFieldNameHi = (ctx: RsCtx, f: i32): i32 => {
  const x = ctx.ast.x[f];
  return x >= 0 ? x : ctx.f.t.hi[ctx.ast.d[f]];
};

const isTupFieldName = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
};

const shouldAddParens = (ctx: RsCtx, e: i32): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[e];
  if (k === N_EX_LIT) {
    return rsLitEndsInDot(ctx, e);
  }
  if (k === N_EX_CLOSURE) {
    const body = ast.a[e];
    const bk = ast.kind[body];
    if (bk === N_EX_RANGE) {
      return (ast.fl[body] & RANGE_CLOSED) === 0;
    }
    if (bk === N_EX_LIT) {
      return rsLitEndsInDot(ctx, body);
    }
  }
  return false;
};

const itemFromAst = (ctx: RsCtx, e: i32, isPostfixReceiver: boolean, tries: i32): ChainItem => {
  const ast = ctx.ast;
  const k = ast.kind[e];
  let kind = CI_PARENT;
  let lo = 0;
  let hi = 0;
  let nested = false;
  if (k === N_EX_METHOD) {
    kind = CI_METHOD;
    lo = ast.hi[ast.a[e]];
    hi = ast.hi[e];
  } else if (k === N_EX_FIELD) {
    const name = rsFieldName(ctx, e);
    if (isTupFieldName(name)) {
      kind = CI_TUPLE_FIELD;
      const inner = ast.a[e];
      nested = ast.kind[inner] === N_EX_FIELD && isTupFieldName(rsFieldName(ctx, inner));
    } else {
      kind = CI_FIELD;
    }
    lo = ast.hi[ast.a[e]];
    hi = rsFieldNameHi(ctx, e);
  } else if (k === N_EX_AWAIT) {
    kind = CI_AWAIT;
    lo = ast.hi[ast.a[e]];
    hi = ast.hi[e];
  } else {
    const it = new ChainItem(CI_PARENT, ast.lo[e], ast.hi[e]);
    it.expr = e;
    it.parens = isPostfixReceiver && shouldAddParens(ctx, e);
    it.tries = tries;
    return it;
  }
  const dot = ctx.spanBefore(lo, hi, ".");
  const it = new ChainItem(kind, dot, hi);
  it.expr = e;
  it.tries = tries;
  it.nested = nested;
  return it;
};

const rewriteMethodCall = (ctx: RsCtx, e: i32, lo: i32, hi: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const seg = ast.b[e];
  let typeStr = "";
  const ga = ast.a[seg];
  if (ga >= 0) {
    const parts: string[] = [];
    for (let i = 0; i < ast.ln[ga]; i++) {
      const arg = ast.kid(ga, i);
      if (ast.kind[arg] === N_CONSTRAINT) {
        continue;
      }
      const r = rsRewriteNode(ctx, arg, shape);
      if (r === null) {
        return null;
      }
      parts.push(r);
    }
    if (parts.length > 0) {
      typeStr = "::<" + parts.join(", ") + ">";
    }
  }
  const callee = "." + rsIdentStr(ctx, ast.d[seg]) + typeStr;
  const args: i32[] = [];
  for (let i = 0; i < ast.ln[e]; i++) {
    args.push(ast.kid(e, i));
  }
  return rsRewriteCall(ctx, callee, args, lo, hi, shape);
};

const rewriteItem = (ctx: RsCtx, it: ChainItem, shape0: RsShape): string | null => {
  const shape = shape0.subWidth(it.tries);
  if (shape === null) {
    return null;
  }
  let rw: string | null = null;
  const k = it.kind;
  if (k === CI_PARENT) {
    if (it.parens) {
      const ast = ctx.ast;
      rw = rsRewriteParen(ctx, it.expr, shape, ast.lo[it.expr], ast.hi[it.expr]);
    } else {
      rw = rsRewriteExpr(ctx, it.expr, shape);
    }
  } else if (k === CI_METHOD) {
    rw = rewriteMethodCall(ctx, it.expr, it.lo, it.hi, shape);
  } else if (k === CI_FIELD) {
    rw = "." + rsFieldName(ctx, it.expr);
  } else if (k === CI_TUPLE_FIELD) {
    rw = (it.nested ? " " : "") + "." + rsFieldName(ctx, it.expr);
  } else if (k === CI_AWAIT) {
    rw = ".await";
  } else {
    rw = rsRewriteComment(it.comment, shape, ctx.cfg);
  }
  if (rw === null) {
    return null;
  }
  let res = rw;
  for (let i = 0; i < it.tries; i++) {
    res = res + "?";
  }
  return res;
};

const formatOverflowStyle = (ctx: RsCtx, lo: i32, hi: i32): string => {
  const ls = rsLines(ctx.snippet(lo, hi));
  const out: string[] = [];
  for (const l of ls) {
    out.push(rsTrimEnd(l));
  }
  return out.join("\n");
};

const formatChainItem = (ctx: RsCtx, it: ChainItem, shape: RsShape, allowOverflow: boolean): string | null => {
  const r = rewriteItem(ctx, it, shape);
  if (r !== null || !allowOverflow) {
    return r;
  }
  return formatOverflowStyle(ctx, it.lo, it.hi);
};

const isTries = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) !== 63) {
      return false;
    }
  }
  return true;
};

const isPostComment = (s: string): boolean => {
  const c = rsIndexOfByte(s, 47, 0);
  if (c < 0) {
    return false;
  }
  const nl = rsIndexOfByte(s, 10, 0);
  if (nl < 0) {
    return true;
  }
  return c < nl;
};

/** trim_tries. */
const trimTries = (s: string): string => {
  if (rsIndexOfByte(s, 63, 0) < 0 && rsIndexOfByte(s, 10, 0) < 0) {
    return rsIsBlank(s) ? "" : s;
  }
  const r = rsCharClasses(s);
  const result = new RsStrBuf();
  const line = new RsStrBuf();
  let lineBlank = true;
  for (let ci = 0; ci < r.nc; ci++) {
    const i = r.starts[ci];
    const j = ci + 1 < r.nc ? r.starts[ci + 1] : toI32(s.length);
    const c = s.charCodeAt(i);
    if (c === 10) {
      if (result.len() === 0 || !lineBlank) {
        result.add(line.str());
        result.add("\n");
      }
      line.b.n = 0;
      lineBlank = true;
    } else if (c === 63 && r.kinds[i] === K_NORMAL) {
      continue;
    } else {
      line.addSlice(s, i, j);
      if (!(c === 32 || (c >= 9 && c <= 13))) {
        lineBlank = false;
      }
    }
  }
  if (!lineBlank) {
    result.add(line.str());
  }
  return result.str();
};

const chTrimSpTab = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) {
    a++;
  }
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) {
    b--;
  }
  return s.slice(a, b);
};

class Chain {
  parent: ChainItem;
  children: ChainItem[];
  constructor(parent: ChainItem, children: ChainItem[]) {
    this.parent = parent;
    this.children = children;
  }
}

class PrevEnd {
  v: i32;
  constructor(v: i32) {
    this.v = v;
  }
}

const handlePostComment = (lo: i32, hi: i32, snippet: string, prev: PrevEnd, children: ChainItem[]): void => {
  if (chTrimSpTab(snippet).startsWith("\n")) {
    return;
  }
  const t = trimTries(snippet);
  if (isPostComment(t)) {
    const it = new ChainItem(CI_COMMENT, lo, hi);
    it.comment = rsTrim(t);
    it.pos = CP_SAME_LINE;
    children.push(it);
    prev.v = hi;
  }
};

const chainFromAst = (ctx: RsCtx, e0: i32): Chain => {
  const ast = ctx.ast;
  // make_subexpr_list.
  const exprs: i32[] = [e0];
  const postfix: boolean[] = [false];
  let e = e0;
  for (;;) {
    const k = ast.kind[e];
    if (k === N_EX_METHOD || k === N_EX_FIELD || k === N_EX_AWAIT) {
      e = ast.a[e];
      exprs.push(e);
      // rustfmt 1.9 adds parentheses (should_add_parens) only before a method call.
      postfix.push(k === N_EX_METHOD);
    } else if (k === N_EX_TRY) {
      e = ast.a[e];
      exprs.push(e);
      postfix.push(false);
    } else {
      break;
    }
  }
  const rev: ChainItem[] = [];
  let tries = 0;
  for (let i = 0; i < exprs.length; i++) {
    const x = exprs[i];
    if (ast.kind[x] === N_EX_TRY) {
      tries++;
    } else {
      rev.push(itemFromAst(ctx, x, postfix[i], tries));
      tries = 0;
    }
  }
  const parent = rev.pop();
  const children: ChainItem[] = [];
  const prev = new PrevEnd(parent.hi);
  const items: ChainItem[] = [];
  for (let i = rev.length - 1; i >= 0; i--) {
    items.push(rev[i]);
  }
  if (items.length > 0) {
    const first = items[0];
    const cs = ctx.snippet(prev.v, first.lo);
    if (!isTries(rsTrim(cs))) {
      handlePostComment(prev.v, first.lo, cs, prev, children);
    }
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sn = ctx.snippet(it.lo, it.hi);
    const handleComment = !isTries(rsTrim(sn));
    if (handleComment) {
      const pre = trimTries(ctx.snippet(prev.v, it.lo));
      const tmp = new RsListItem();
      rsExtractPreComment(pre, tmp);
      const pc = tmp.pre;
      if (pc !== null && pc.length !== 0) {
        const c = new ChainItem(CI_COMMENT, prev.v, it.lo);
        c.comment = pc;
        c.pos = CP_DIFFERENT_LINE;
        children.push(c);
      }
    }
    prev.v = it.hi;
    children.push(it);
    if (!handleComment || i === items.length - 1) {
      continue;
    }
    const nextLo = items[i + 1].lo;
    handlePostComment(prev.v, nextLo, ctx.snippet(prev.v, nextLo), prev, children);
  }
  return new Chain(parent, children);
};

/** rewrite_chain. */
export const rsRewriteChain = (ctx: RsCtx, e: i32, shape: RsShape): string | null => {
  const chain = chainFromAst(ctx, e);
  if (chain.children.length === 0) {
    return rewriteItem(ctx, chain.parent, shape);
  }
  return rewriteChainBlock(ctx, chain, shape);
};

const isBlockLikeItem = (ctx: RsCtx, it: ChainItem, reps: string): boolean =>
  it.kind === CI_PARENT && rsIsBlockExpr(ctx, it.expr, reps);

const rewriteChainBlock = (ctx: RsCtx, chain: Chain, shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  let children = chain.children;
  const rewrites: string[] = [];
  // format_root.
  const root0 = rewriteItem(ctx, chain.parent, shape);
  if (root0 === null) {
    return null;
  }
  let root = root0;
  let rootEndsWithBlock = isBlockLikeItem(ctx, chain.parent, root);
  let tabWidth = cfg.tabSpaces - shape.off;
  if (tabWidth < 0) {
    tabWidth = 0;
  }
  while (toI32(root.length) <= tabWidth && !rsHasByte(root, 10)) {
    const item = children[0];
    if (item.kind === CI_COMMENT) {
      break;
    }
    const sh = shape.offsetLeft(toI32(root.length));
    if (sh === null) {
      return null;
    }
    const r = rewriteItem(ctx, item, sh);
    if (r === null) {
      break;
    }
    root = root + r;
    rootEndsWithBlock = rsLastLineExtendable(root);
    const rest: ChainItem[] = [];
    for (let i = 1; i < children.length; i++) {
      rest.push(children[i]);
    }
    children = rest;
    if (children.length === 0) {
      break;
    }
  }
  rewrites.push(root);
  if (children.length === 0) {
    return rsWrapStr(rewrites[0], cfg, shape);
  }
  // child_shape.
  const childShape = (rootEndsWithBlock ? shape.blockIndent(0) : shape.blockIndent(cfg.tabSpaces)).withMaxWidth(cfg);
  // format_children.
  for (let i = 0; i < children.length - 1; i++) {
    const r = formatChainItem(ctx, children[i], childShape, false);
    if (r === null) {
      return null;
    }
    rewrites.push(r);
  }
  // format_last_child.
  const childCount = chain.children.length;
  const last = children[children.length - 1];
  const extendable = rsLastLineExtendable(rewrites[0]);
  const prevLastLineWidth = rsLastLineWidth(rewrites[0], cfg.tabSpaces);
  let almostTotal = 0;
  if (extendable) {
    almostTotal = prevLastLineWidth;
  } else {
    for (const rw of rewrites) {
      almostTotal += rsWidth(rw);
    }
  }
  almostTotal += last.tries;
  let olb =
    (childCount === 1 ? shape.width : shape.width < cfg.chainWidth ? shape.width : cfg.chainWidth) - almostTotal;
  if (olb < 0) {
    olb = 0;
  }
  let anyComment = false;
  for (const c of children) {
    if (c.kind === CI_COMMENT) {
      anyComment = true;
    }
  }
  let allSingle = true;
  for (const rw of rewrites) {
    if (rsHasByte(rw, 10)) {
      allSingle = false;
    }
  }
  const allInOneLine = !anyComment && allSingle && olb > 0;
  let lastShape: RsShape | null = null;
  if (allInOneLine) {
    lastShape = shape.subWidth(last.tries);
  } else if (extendable) {
    lastShape = childShape.subWidth(last.tries);
  } else {
    lastShape = childShape.subWidth(shape.rhsOverhead(cfg) + last.tries);
  }
  if (lastShape === null) {
    return null;
  }
  let fitsSingleLine = false;
  let lastStr: string | null = null;
  if (allInOneLine || extendable) {
    const ols = lastShape.offsetLeft(almostTotal);
    if (ols !== null) {
      const rw = rewriteItem(ctx, last, ols);
      if (rw !== null) {
        const lineCount = rsLines(rw).length;
        const couldFit = rsFirstLineWidth(rw) <= olb;
        if (couldFit && lineCount >= 5) {
          lastStr = rw;
          fitsSingleLine = allInOneLine;
        } else {
          const ls2 = childShape.subWidth(shape.rhsOverhead(cfg) + last.tries);
          if (ls2 === null) {
            return null;
          }
          const nr = rewriteItem(ctx, last, ls2);
          if (nr !== null && !couldFit) {
            lastStr = nr;
          } else if (nr !== null && rsLines(nr).length >= lineCount) {
            lastStr = rw;
            fitsSingleLine = couldFit && allInOneLine;
          } else if (nr !== null) {
            lastStr = nr;
          } else {
            lastStr = rw;
            fitsSingleLine = couldFit && allInOneLine;
          }
        }
      }
    }
  }
  if (lastStr === null) {
    lastStr = rewriteItem(ctx, last, lastShape);
  }
  const lastS = lastStr;
  if (lastS === null) {
    return null;
  }
  rewrites.push(lastS);
  // join_rewrites.
  let connector = "";
  if (!fitsSingleLine) {
    if (ctx.forceOneLineChain) {
      return null;
    }
    connector = childShape.strNl(cfg);
  }
  let result = rewrites[0];
  for (let i = 1; i < rewrites.length; i++) {
    const it = children[i - 1];
    if (it.kind === CI_COMMENT && it.pos === CP_SAME_LINE) {
      result = result + " ";
    } else {
      result = result + connector;
    }
    result = result + rewrites[i];
  }
  return rsWrapStr(result, cfg, shape);
};

export const rsChainIsField = (ast: RsAst, e: i32): boolean => ast.kind[e] === N_EX_FIELD;
