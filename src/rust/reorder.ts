// Reordering `use`, `extern crate` and `mod foo;` items: consecutive items
// of one kind (not separated by a blank line) are sorted.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): reorder.rs.

import { IT_LOADED, N_EXTERN_CRATE, N_MOD, N_USE, RsAst } from "./ast";
import { rsAttrMeta, rsAttrsContainSkip } from "./attr";
import { RsCtx } from "./context";
import { RsUseTree, rsCmpUseTree, rsRewriteUseTopLevel, rsUseTreeOfItem } from "./imports";
import { rsRewriteExternCrate, rsRewriteModDecl } from "./items";
import { RsListFormatting, RsListItem, rsItemizeList, rsWriteList } from "./lists";
import { RsShape, rsIndentStr } from "./shape";
import { rsIdentStr, rsLoWithAttrs } from "./utils";
import { RsVisitor } from "./visitor";

const RK_EXTERN_CRATE: i32 = 0;
const RK_MOD: i32 = 1;
const RK_USE: i32 = 2;
const RK_OTHER: i32 = 3;

const containsMacroUse = (ctx: RsCtx, item: i32): boolean => {
  const ast = ctx.ast;
  for (let i = 0; i < ast.atn[item]; i++) {
    const a = ast.attr(item, i);
    const p = ast.a[a];
    if (p >= 0 && (ast.fl[a] & 2) === 0 && ast.ln[p] === 1 && ctx.tokStr(ast.d[ast.kid(p, 0)]) === "macro_use") {
      return true;
    }
  }
  return false;
};

const reorderableKind = (ctx: RsCtx, item: i32): i32 => {
  const ast = ctx.ast;
  if (containsMacroUse(ctx, item) || rsAttrsContainSkip(ctx, item)) {
    return RK_OTHER;
  }
  const k = ast.kind[item];
  if (k === N_EXTERN_CRATE) {
    return RK_EXTERN_CRATE;
  }
  if (k === N_MOD && (ast.fl[item] & IT_LOADED) === 0) {
    return RK_MOD;
  }
  if (k === N_USE) {
    return RK_USE;
  }
  return RK_OTHER;
};

/** The line (1-based) of byte offset `pos`. */
const lineOf = (ctx: RsCtx, pos: i32): i32 => {
  let line = 1;
  const src = ctx.f.src;
  for (let i = 0; i < pos; i++) {
    if (toI32(src[i]) === 10) {
      line++;
    }
  }
  return line;
};

const cmpStrBytes = (a: string, b: string): i32 => {
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

/** compare_items for mods and extern crates. */
const compareItems = (ctx: RsCtx, a: i32, b: i32): i32 => {
  const ast = ctx.ast;
  if (ast.kind[a] === N_MOD) {
    return cmpStrBytes(rsIdentStr(ctx, ast.d[a]), rsIdentStr(ctx, ast.d[b]));
  }
  const an = ast.c[a] >= 0 ? rsIdentStr(ctx, ast.c[a]) : rsIdentStr(ctx, ast.d[a]);
  const bn = ast.c[b] >= 0 ? rsIdentStr(ctx, ast.c[b]) : rsIdentStr(ctx, ast.d[b]);
  const r = cmpStrBytes(an, bn);
  if (r !== 0) {
    return r;
  }
  const ha = ast.c[a] >= 0;
  const hb = ast.c[b] >= 0;
  if (ha && !hb) {
    return 1;
  }
  if (!ha && hb) {
    return -1;
  }
  if (!ha && !hb) {
    return 0;
  }
  return cmpStrBytes(rsIdentStr(ctx, ast.d[a]), rsIdentStr(ctx, ast.d[b]));
};

const wrapReorderableItems = (ctx: RsCtx, items: RsListItem[], shape: RsShape): string | null => {
  const fmt = new RsListFormatting(shape, ctx.cfg);
  fmt.separator = "";
  fmt.alignComments = false;
  return rsWriteList(items, fmt);
};

class Pair {
  item: RsListItem;
  node: i32;
  tree: RsUseTree;
  constructor(item: RsListItem, node: i32, tree: RsUseTree) {
    this.item = item;
    this.node = node;
    this.tree = tree;
  }
}

const rewriteReorderable = (ctx: RsCtx, items: i32[], shape: RsShape, lo: i32, hi: i32): string | null => {
  const ast = ctx.ast;
  if (ast.kind[items[0]] === N_USE) {
    const trees: RsUseTree[] = [];
    for (const it of items) {
      trees.push(rsUseTreeOfItem(ctx, it));
    }
    const listItems = rsItemizeList(
      ctx,
      toI32(trees.length),
      "",
      ";",
      (i: i32): i32 => trees[i].spanLo(ast),
      (i: i32): i32 => trees[i].hi,
      (i: i32): string | null => (i >= 0 ? "" : null),
      lo,
      hi,
      false,
    );
    const pairs: Pair[] = [];
    for (let i = 0; i < trees.length; i++) {
      pairs.push(new Pair(listItems[i], items[i], trees[i]));
    }
    pairs.sort((x: Pair, y: Pair): i32 => rsCmpUseTree(x.tree, y.tree));
    const s0 = shape.offsetLeft(4);
    if (s0 === null) {
      return null;
    }
    const nested = s0.subWidth(1);
    if (nested === null) {
      return null;
    }
    const out: RsListItem[] = [];
    for (const p of pairs) {
      const it = new RsListItem();
      it.pre = p.item.pre;
      it.preStyle = p.item.preStyle;
      it.post = p.item.post;
      it.newLines = p.item.newLines;
      it.item = rsRewriteUseTopLevel(ctx, p.tree, nested);
      out.push(it);
    }
    return wrapReorderableItems(ctx, out, nested);
  }
  const listItems = rsItemizeList(
    ctx,
    toI32(items.length),
    "",
    ";",
    (i: i32): i32 => rsLoWithAttrs(ast, items[i]),
    (i: i32): i32 => ast.hi[items[i]],
    (i: i32): string | null => {
      const it = items[i];
      if (ast.kind[it] === N_EXTERN_CRATE) {
        return rsRewriteExternCrate(ctx, it, shape);
      }
      return rsRewriteModDecl(ctx, it, shape);
    },
    lo,
    hi,
    false,
  );
  const order: i32[] = [];
  for (let i = 0; i < items.length; i++) {
    order.push(i);
  }
  order.sort((x: i32, y: i32): i32 => compareItems(ctx, items[x], items[y]));
  const sorted: RsListItem[] = [];
  for (const i of order) {
    sorted.push(listItems[i]);
  }
  return wrapReorderableItems(ctx, sorted, shape);
};

/** visit_items_with_reordering. */
export const rsVisitItemsWithReordering = (v: RsVisitor, items: i32[]): void => {
  const ast = v.ast;
  const ctx = v.ctx();
  let i = 0;
  const n = toI32(items.length);
  while (i < n) {
    const kind = reorderableKind(ctx, items[i]);
    if (kind === RK_OTHER) {
      v.visitItem(items[i]);
      i++;
      continue;
    }
    // walk_reorderable_or_regroupable_items, in_group.
    let lastHi = lineOf(ctx, ast.hi[items[i]]);
    let k = i;
    while (k < n) {
      if (reorderableKind(ctx, items[k]) !== kind) {
        break;
      }
      const curLo = lineOf(ctx, rsLoWithAttrs(ast, items[k]));
      if (k > i && !(curLo < lastHi + 2)) {
        break;
      }
      lastHi = lineOf(ctx, ast.hi[items[k]]);
      k++;
    }
    const group: i32[] = [];
    for (let j = i; j < k; j++) {
      group.push(items[j]);
    }
    const lo = rsLoWithAttrs(ast, group[0]);
    const hi = ast.hi[group[group.length - 1]];
    const rw = rewriteReorderable(v.ctx(), group, v.shape(), lo, hi);
    v.pushRewrite(lo, hi, rw);
    i = k;
  }
};

export const rsReorderIndent = (shape: RsShape, ctx: RsCtx): string => rsIndentStr(ctx.cfg, shape.bi, shape.al);
export const rsReorderMeta = (ctx: RsCtx, a: i32): i32 => rsAttrMeta(ctx, a);
export const rsReorderIsUse = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_USE;
