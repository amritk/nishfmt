// Formatting `use` declarations: use trees normalized and sorted
// (imports_granularity and group_imports are Preserve).
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): imports.rs.

import { N_USE_TREE, PATH_GLOBAL, RsAst, UT_GLOB, UT_NESTED, UT_RENAME } from "./ast";
import { rsRewriteAttrs } from "./attr";
import { rsCombineStrsWithMissingComments } from "./comment";
import { RsCtx } from "./context";
import {
  DLT_HORIZONTAL,
  DLT_VERTICAL,
  LT_MIXED,
  RsListFormatting,
  RsListItem,
  SEP_COMMA,
  ST_NEVER,
  ST_VERTICAL,
  rsDefinitiveTactic,
  rsItemizeList,
  rsListItemFromStr,
  rsWriteList,
} from "./lists";
import { RsShape, rsIndentStr } from "./shape";
import { rsTrimRawPrefix, rsVersionSort } from "./sort";
import { rsHasByte, rsTrimEnd } from "./str";
import { rsFormatVisibility, rsIdentStr } from "./utils";
import { RsVisitor } from "./visitor";

export const USK_IDENT: i32 = 0;
export const USK_SELF: i32 = 1;
export const USK_SUPER: i32 = 2;
export const USK_CRATE: i32 = 3;
export const USK_GLOB: i32 = 4;
export const USK_LIST: i32 = 5;

export class RsUseSeg {
  k: i32;
  name: string;
  alias: string | null;
  list: RsUseTree[];
  constructor(k: i32, name: string, alias: string | null) {
    this.k = k;
    this.name = name;
    this.alias = alias;
    this.list = [];
  }
}

export class RsUseTree {
  path: RsUseSeg[];
  lo: i32;
  hi: i32;
  listItem: RsListItem | null = null;
  hasVis: boolean = false;
  vis: i32 = -1;
  attrs: i32[];
  hasAttrs: boolean = false;
  constructor(lo: i32, hi: i32) {
    this.attrs = [];
    this.path = [];
    this.lo = lo;
    this.hi = hi;
  }
  spanLo(ast: RsAst): i32 {
    if (this.hasAttrs && this.attrs.length > 0) {
      return ast.lo[this.attrs[0]];
    }
    return this.lo;
  }
}

const segFromName = (name: string, modsep: boolean): RsUseSeg | null => {
  if (name.length === 0) {
    return null;
  }
  if (name === "self") {
    return new RsUseSeg(USK_SELF, "", null);
  }
  if (name === "super") {
    return new RsUseSeg(USK_SUPER, "", null);
  }
  if (name === "crate") {
    return new RsUseSeg(USK_CRATE, "", null);
  }
  return new RsUseSeg(USK_IDENT, (modsep ? "::" : "") + name, null);
};

/** UseTree::from_ast for N_USE_TREE `a`. */
const useTreeFromAst = (
  ctx: RsCtx,
  a: i32,
  listItem: RsListItem | null,
  hasVis: boolean,
  vis: i32,
  optLo: i32,
  attrs: i32[] | null,
): RsUseTree => {
  const ast = ctx.ast;
  const lo = optLo >= 0 ? optLo : ast.lo[a];
  const r = new RsUseTree(lo, ast.hi[a]);
  r.listItem = listItem;
  r.hasVis = hasVis;
  r.vis = vis;
  if (attrs !== null) {
    r.hasAttrs = true;
    r.attrs = attrs;
  }
  const prefix = ast.a[a];
  const leadingModsep = (ast.fl[prefix] & PATH_GLOBAL) !== 0;
  let modsep = leadingModsep;
  const np = ast.ln[prefix];
  for (let i = 0; i < np; i++) {
    const s = segFromName(rsIdentStr(ctx, ast.d[ast.kid(prefix, i)]), modsep);
    if (s !== null) {
      r.path.push(s);
      modsep = false;
    }
  }
  const f = ast.fl[a];
  if ((f & UT_GLOB) !== 0) {
    if (np === 0 && leadingModsep) {
      r.path.push(new RsUseSeg(USK_IDENT, "", null));
    }
    r.path.push(new RsUseSeg(USK_GLOB, "", null));
  } else if ((f & UT_NESTED) !== 0) {
    const n = ast.ln[a];
    const items = rsItemizeList(
      ctx,
      n,
      "}",
      ",",
      (i: i32): i32 => ast.lo[ast.a[ast.kid(a, i)]],
      (i: i32): i32 => ast.hi[ast.kid(a, i)],
      (i: i32): string | null => (i >= 0 ? "" : null),
      ctx.spanAfter(ast.lo[a], ast.hi[a], "{"),
      ast.hi[a],
      false,
    );
    if (np === 0 && leadingModsep) {
      r.path.push(new RsUseSeg(USK_IDENT, "", null));
    }
    const seg = new RsUseSeg(USK_LIST, "", null);
    for (let i = 0; i < n; i++) {
      seg.list.push(useTreeFromAst(ctx, ast.kid(a, i), items[i], false, -1, -1, null));
    }
    r.path.push(seg);
  } else {
    let name = "";
    if (np === 1 && leadingModsep) {
      name = ctx.snippet(ast.lo[prefix], ast.hi[prefix]);
    } else {
      name = np > 0 ? rsIdentStr(ctx, ast.d[ast.kid(prefix, np - 1)]) : "";
    }
    let alias: string | null = null;
    if ((f & UT_RENAME) !== 0) {
      const rn = rsIdentStr(ctx, ast.d[a]);
      const last = np > 0 ? rsIdentStr(ctx, ast.d[ast.kid(prefix, np - 1)]) : "";
      if (rn === "_") {
        alias = "_";
      } else if (rn === last) {
        alias = null;
      } else {
        alias = rn;
      }
    }
    let seg = new RsUseSeg(USK_IDENT, name, alias);
    if (name === "self") {
      seg = new RsUseSeg(USK_SELF, "", alias);
    } else if (name === "super") {
      seg = new RsUseSeg(USK_SUPER, "", alias);
    } else if (name === "crate") {
      seg = new RsUseSeg(USK_CRATE, "", alias);
    }
    if (r.path.length > 0) {
      r.path.pop();
    }
    r.path.push(seg);
  }
  return r;
};

const useTreeToString = (t: RsUseTree): string => {
  let s = "";
  for (let i = 0; i < t.path.length; i++) {
    if (i !== 0) {
      s = s + "::";
    }
    s = s + segToString(t.path[i]);
  }
  return s;
};

const segToString = (s: RsUseSeg): string => {
  const k = s.k;
  if (k === USK_GLOB) {
    return "*";
  }
  if (k === USK_IDENT) {
    const a = s.alias;
    return a !== null ? `${s.name} as ${a}` : s.name;
  }
  if (k === USK_SELF) {
    return "self";
  }
  if (k === USK_SUPER) {
    return "super";
  }
  if (k === USK_CRATE) {
    return "crate";
  }
  let out = "{";
  for (let i = 0; i < s.list.length; i++) {
    if (i !== 0) {
      out = out + ", ";
    }
    out = out + useTreeToString(s.list[i]);
  }
  return out + "}";
};

const treeHasComment = (t: RsUseTree): boolean => {
  const li = t.listItem;
  return li !== null && li.hasComment();
};

const cloneTree = (t: RsUseTree): RsUseTree => {
  const r = new RsUseTree(t.lo, t.hi);
  for (const s of t.path) {
    r.path.push(s);
  }
  r.listItem = t.listItem;
  r.hasVis = t.hasVis;
  r.vis = t.vis;
  r.attrs = t.attrs;
  r.hasAttrs = t.hasAttrs;
  return r;
};

/** UseTree::normalize. */
const normalizeTree = (t0: RsUseTree, se: i32): RsUseTree => {
  const t = cloneTree(t0);
  let last = t.path.pop();
  if (!t.hasAttrs) {
    if (last.k === USK_LIST && last.list.length === 0) {
      t.path = [];
      return t;
    }
    if (last.k === USK_SELF && last.alias === null && t.path.length === 0 && t.hasVis) {
      t.path = [];
      return t;
    }
  }
  if (last.k === USK_SELF && last.alias === null) {
    if (t.path.length > 0) {
      const second = t.path[t.path.length - 1];
      if (second.k !== USK_SELF) {
        return t;
      }
    }
  }
  let aliasedSelf = false;
  if (last.k === USK_SELF && t.path.length > 0) {
    const pl = t.path[t.path.length - 1];
    if (pl.k === USK_IDENT && pl.alias === null) {
      aliasedSelf = true;
    }
  }
  if (aliasedSelf) {
    const la = last.alias;
    if (la !== null) {
      const pl = t.path[t.path.length - 1];
      const ns = new RsUseSeg(USK_IDENT, pl.name, la);
      t.path[t.path.length - 1] = ns;
      return t;
    }
  }
  if (
    last.k === USK_LIST &&
    last.list.length === 1 &&
    useTreeToString(last.list[0]) !== "self" &&
    !treeHasComment(last.list[0])
  ) {
    for (const s of last.list[0].path) {
      t.path.push(s);
    }
    return normalizeTree(t, se);
  }
  if (last.k === USK_LIST) {
    const list: RsUseTree[] = [];
    for (const sub of last.list) {
      list.push(normalizeTree(sub, se));
    }
    list.sort((x: RsUseTree, y: RsUseTree): i32 => rsCmpUseTree(x, y, se));
    // dedup.
    const dd: RsUseTree[] = [];
    for (const x of list) {
      if (dd.length > 0 && useTreeEq(dd[dd.length - 1], x)) {
        continue;
      }
      dd.push(x);
    }
    const ns = new RsUseSeg(USK_LIST, "", null);
    ns.list = dd;
    last = ns;
  }
  t.path.push(last);
  return t;
};

const segEq = (a: RsUseSeg, b: RsUseSeg): boolean => {
  if (a.k !== b.k) {
    return false;
  }
  if (a.k === USK_LIST) {
    if (a.list.length !== b.list.length) {
      return false;
    }
    for (let i = 0; i < a.list.length; i++) {
      if (!useTreeEq(a.list[i], b.list[i])) {
        return false;
      }
    }
    return true;
  }
  return a.name === b.name && strOptEq(a.alias, b.alias);
};

const strOptEq = (a: string | null, b: string | null): boolean => {
  if (a === null || b === null) {
    return a === null && b === null;
  }
  return a === b;
};

const useTreeEq = (a: RsUseTree, b: RsUseTree): boolean => {
  if (a.path.length !== b.path.length) {
    return false;
  }
  for (let i = 0; i < a.path.length; i++) {
    if (!segEq(a.path[i], b.path[i])) {
      return false;
    }
  }
  return true;
};

const isUpperSnake = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57))) {
      return false;
    }
  }
  return true;
};

const startsUpper = (s: string): boolean => s.length > 0 && s.charCodeAt(0) >= 65 && s.charCodeAt(0) <= 90;

const cmpStr = (a: string, b: string): i32 => {
  const n = toI32(a.length) < toI32(b.length) ? toI32(a.length) : toI32(b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (toI32(a.length) === toI32(b.length)) {
    return 0;
  }
  return toI32(a.length) < toI32(b.length) ? -1 : 1;
};

const cmpBool = (a: boolean, b: boolean): i32 => (a === b ? 0 : a ? 1 : -1);

const cmpOptStr = (a: string | null, b: string | null): i32 => {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return cmpStr(a, b);
};

const kindRank = (k: i32): i32 => {
  if (k === USK_SELF) return 0;
  if (k === USK_SUPER) return 1;
  if (k === USK_CRATE) return 2;
  if (k === USK_IDENT) return 3;
  if (k === USK_GLOB) return 4;
  return 5;
};

/** Two segments' aliases: version-sorted at style edition 2024 when both have one. */
const cmpAlias = (x: string | null, y: string | null, se: i32): i32 => {
  if (se >= 2024 && x !== null && y !== null) {
    return rsVersionSort(rsTrimRawPrefix(x), rsTrimRawPrefix(y));
  }
  return cmpOptStr(x, y);
};

/** Ord for UseSegment, at style edition `se`. */
const cmpSeg = (a: RsUseSeg, b: RsUseSeg, se: i32): i32 => {
  if (a.k === b.k) {
    if (a.k === USK_SELF || a.k === USK_SUPER || a.k === USK_CRATE) {
      return cmpAlias(a.alias, b.alias, se);
    }
    if (a.k === USK_GLOB) {
      return 0;
    }
    if (a.k === USK_IDENT) {
      let o = 0;
      if (se >= 2024) {
        o = rsVersionSort(rsTrimRawPrefix(a.name), rsTrimRawPrefix(b.name));
      } else {
        // snake_case < CamelCase < UPPER_SNAKE_CASE
        o = cmpBool(isUpperSnake(a.name), isUpperSnake(b.name));
        if (o === 0) {
          o = cmpBool(startsUpper(a.name), startsUpper(b.name));
        }
        if (o === 0) {
          o = cmpStr(a.name, b.name);
        }
      }
      if (o !== 0) {
        return o;
      }
      return cmpAlias(a.alias, b.alias, se);
    }
    // Lists: lexicographic.
    const n = a.list.length < b.list.length ? a.list.length : b.list.length;
    for (let i = 0; i < n; i++) {
      const o = rsCmpUseTree(a.list[i], b.list[i], se);
      if (o !== 0) {
        return o;
      }
    }
    return a.list.length === b.list.length ? 0 : a.list.length < b.list.length ? -1 : 1;
  }
  const ra = kindRank(a.k);
  const rb = kindRank(b.k);
  return ra < rb ? -1 : 1;
};

const removeAlias = (s: RsUseSeg): RsUseSeg => {
  if (s.k === USK_LIST || s.k === USK_GLOB) {
    return s;
  }
  return new RsUseSeg(s.k, s.name, null);
};

/** Ord for UseTree. */
export const rsCmpUseTree = (a: RsUseTree, b: RsUseTree, se: i32): i32 => {
  const n = a.path.length < b.path.length ? a.path.length : b.path.length;
  for (let i = 0; i < n; i++) {
    const o = cmpSeg(a.path[i], b.path[i], se);
    if (o !== 0 && cmpSeg(removeAlias(a.path[i]), removeAlias(b.path[i]), se) !== 0) {
      return o;
    }
  }
  return a.path.length === b.path.length ? 0 : a.path.length < b.path.length ? -1 : 1;
};

const rewriteNestedUseTree = (ctx: RsCtx, list: RsUseTree[], shape: RsShape): string | null => {
  const cfg = ctx.cfg;
  const ns = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg).subWidth(1);
  if (ns === null) {
    return null;
  }
  const items: RsListItem[] = [];
  for (const t of list) {
    const li = t.listItem;
    if (li !== null) {
      const it = new RsListItem();
      it.pre = li.pre;
      it.preStyle = li.preStyle;
      it.post = li.post;
      it.newLines = li.newLines;
      it.item = rsRewriteUseTree(ctx, t, ns);
      items.push(it);
    } else {
      const r = rsRewriteUseTree(ctx, t, ns);
      if (r === null) {
        return null;
      }
      items.push(rsListItemFromStr(r));
    }
  }
  let hasNestedList = false;
  for (const t of list) {
    if (t.path.length > 0 && t.path[t.path.length - 1].k === USK_LIST) {
      hasNestedList = true;
    }
  }
  let remaining = 0;
  if (!hasNestedList) {
    remaining = shape.width - 2;
    if (remaining < 0) {
      remaining = 0;
    }
  }
  const tactic = rsDefinitiveTactic(items, LT_MIXED, SEP_COMMA, remaining);
  const endsWithNewline = tactic !== DLT_HORIZONTAL;
  const fmt = new RsListFormatting(ns, cfg);
  fmt.tactic = tactic;
  fmt.trailingSeparator = endsWithNewline ? ST_VERTICAL : ST_NEVER;
  fmt.endsWithNewline = endsWithNewline;
  fmt.preserveNewline = true;
  fmt.nested = hasNestedList;
  const ls = rsWriteList(items, fmt);
  if (ls === null) {
    return null;
  }
  if (rsHasByte(ls, 10) || toI32(ls.length) > remaining || tactic === DLT_VERTICAL) {
    return `{\n${rsIndentStr(cfg, ns.bi, ns.al)}${ls}\n${rsIndentStr(cfg, shape.bi, shape.al)}}`;
  }
  return "{" + ls + "}";
};

const rewriteUseSeg = (ctx: RsCtx, s: RsUseSeg, shape: RsShape): string | null => {
  if (s.k === USK_LIST) {
    const s1 = shape.offsetLeft(1);
    const s2: RsShape | null = s1 === null ? null : s1.subWidth(1);
    if (s2 === null) {
      return null;
    }
    return rewriteNestedUseTree(ctx, s.list, s2);
  }
  const a = s.alias;
  if (s.k === USK_IDENT) {
    return a !== null ? `${s.name} as ${a}` : s.name;
  }
  if (s.k === USK_GLOB) {
    return "*";
  }
  const kw = s.k === USK_SELF ? "self" : s.k === USK_SUPER ? "super" : "crate";
  return a !== null ? `${kw} as ${a}` : kw;
};

/** Rewrite for UseTree. */
export const rsRewriteUseTree = (ctx: RsCtx, t: RsUseTree, shape0: RsShape): string | null => {
  let shape: RsShape | null = shape0;
  let result = "";
  for (let i = 0; i < t.path.length; i++) {
    if (shape === null) {
      return null;
    }
    const ss = rewriteUseSeg(ctx, t.path[i], shape);
    if (ss === null) {
      return null;
    }
    result = result + ss;
    if (i + 1 < t.path.length) {
      result = result + "::";
      shape = shape.offsetLeft(2 + toI32(ss.length));
    }
  }
  return result;
};

/** UseTree::rewrite_top_level. */
export const rsRewriteUseTopLevel = (ctx: RsCtx, t: RsUseTree, shape: RsShape): string | null => {
  const vis = t.hasVis ? rsFormatVisibility(ctx, t.vis) : "";
  const s0 = shape.offsetLeft(toI32(vis.length));
  if (s0 === null) {
    return null;
  }
  const s = rsRewriteUseTree(ctx, t, s0);
  if (s === null) {
    return null;
  }
  const useStr = s.length === 0 ? s : `${vis}use ${s};`;
  if (t.hasAttrs && t.attrs.length > 0) {
    const attrStr = rsRewriteAttrs(ctx, t.attrs, shape);
    if (attrStr === null) {
      return null;
    }
    const lo = ctx.ast.hi[t.attrs[t.attrs.length - 1]];
    return rsCombineStrsWithMissingComments(ctx, attrStr, useStr, lo, t.lo, shape, false);
  }
  return useStr;
};

/** UseTree::from_ast_with_normalization for use item `item`. */
export const rsUseTreeOfItem = (ctx: RsCtx, item: i32): RsUseTree => {
  const ast = ctx.ast;
  const attrs: i32[] = [];
  for (let i = 0; i < ast.atn[item]; i++) {
    attrs.push(ast.attr(item, i));
  }
  const t = useTreeFromAst(ctx, ast.a[item], null, true, ast.e[item], ast.lo[item], attrs.length === 0 ? null : attrs);
  return normalizeTree(t, ctx.cfg.styleEdition);
};

/** format_import (a use item that is not reordered). */
export const rsFormatImport = (v: RsVisitor, item: i32): void => {
  const ast = v.ast;
  const ctx = v.ctx();
  const attrs: i32[] = [];
  for (let i = 0; i < ast.atn[item]; i++) {
    attrs.push(ast.attr(item, i));
  }
  const t = useTreeFromAst(ctx, ast.a[item], null, true, ast.e[item], ast.lo[item], attrs);
  const rw = rsRewriteUseTopLevel(ctx, t, v.shape());
  const lo = attrs.length > 0 ? ast.lo[attrs[0]] : ast.lo[item];
  const hi = ast.hi[item];
  if (rw !== null && rw.length === 0) {
    const prev = rsTrimEnd(v.snippet(v.lastPos, lo));
    v.formatMissing(v.lastPos + toI32(prev.length));
    if (v.buf.n > 0 && toI32(v.buf.buf[v.buf.n - 1]) === 10) {
      v.buf.n = v.buf.n - 1;
    }
    v.lastPos = hi;
  } else if (rw !== null) {
    v.formatMissingWithIndent(lo);
    v.pushStr(rw);
    v.lastPos = hi;
  } else {
    v.formatMissingWithIndent(lo);
    v.formatMissing(hi);
  }
};

export const rsIsUseTreeNode = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_USE_TREE;
