// Reordering `use`, `extern crate` and `mod foo;` items: consecutive items
// of one kind (not separated by a blank line) are sorted.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
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
import { atI32 } from "../core/arr";
import { fault } from "../core/fault";
import { stableSort } from "../core/sort";

const RK_EXTERN_CRATE: i32 = 0;
const RK_MOD: i32 = 1;
const RK_USE: i32 = 2;
const RK_OTHER: i32 = 3;

const containsMacroUse = (ctx: RsCtx, item: i32): boolean => {
  const ast = ctx.ast;
  for (let i = 0; i < atI32(ast.atn, item); i++) {
    const a = ast.attr(item, i);
    const p = atI32(ast.a, a);
    if (
      p >= 0 &&
      (atI32(ast.fl, a) & 2) === 0 &&
      atI32(ast.ln, p) === 1 &&
      ctx.tokStr(atI32(ast.d, ast.kid(p, 0))) === "macro_use"
    ) {
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
  const k = atI32(ast.kind, item);
  if (k === N_EXTERN_CRATE) {
    return RK_EXTERN_CRATE;
  }
  if (k === N_MOD && (atI32(ast.fl, item) & IT_LOADED) === 0) {
    return RK_MOD;
  }
  if (k === N_USE) {
    return RK_USE;
  }
  return RK_OTHER;
};

/** The newlines in `src[a, b)`: the difference of the lines of `b` and `a`. */
const newlinesBetween = (ctx: RsCtx, a: i32, b: i32): i32 => {
  const src = ctx.f.src;
  // `[a, b)` is a span of the source.
  if (a < b && (a < 0 || b > src.length)) {
    fault();
    return 0;
  }
  let k = 0;
  for (let i = a; i >= 0 && i < b && i < src.length; i++) {
    if (toI32(src[i]) === 10) {
      // At most one newline a byte from `a >= 0`.
      if (k > i) {
        fault();
        return 0;
      }
      k++;
    }
  }
  return k;
};

const cmpStrBytes = (a: string, b: string): i32 => {
  for (let i = 0; i < toI32(a.length) && i < toI32(b.length); i++) {
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

/** Ident::as_str: the symbol, without a raw identifier's `r#`. */
const symStr = (ctx: RsCtx, tok: i32): string => {
  const s = rsIdentStr(ctx, tok);
  return s.startsWith("r#") ? s.substring(2, toI32(s.length)) : s;
};

/** compare_items for mods and extern crates. */
const compareItems = (ctx: RsCtx, a: i32, b: i32): i32 => {
  const ast = ctx.ast;
  if (atI32(ast.kind, a) === N_MOD) {
    return cmpStrBytes(symStr(ctx, atI32(ast.d, a)), symStr(ctx, atI32(ast.d, b)));
  }
  const an = atI32(ast.c, a) >= 0 ? symStr(ctx, atI32(ast.c, a)) : symStr(ctx, atI32(ast.d, a));
  const bn = atI32(ast.c, b) >= 0 ? symStr(ctx, atI32(ast.c, b)) : symStr(ctx, atI32(ast.d, b));
  const r = cmpStrBytes(an, bn);
  if (r !== 0) {
    return r;
  }
  const ha = atI32(ast.c, a) >= 0;
  const hb = atI32(ast.c, b) >= 0;
  if (ha && !hb) {
    return 1;
  }
  if (!ha && hb) {
    return -1;
  }
  if (!ha && !hb) {
    return 0;
  }
  return cmpStrBytes(symStr(ctx, atI32(ast.d, a)), symStr(ctx, atI32(ast.d, b)));
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
  if (atI32(ast.kind, atI32(items, 0)) === N_USE) {
    const trees: RsUseTree[] = [];
    for (const it of items) {
      trees.push(rsUseTreeOfItem(ctx, it));
    }
    const listItems = rsItemizeList(
      ctx,
      toI32(trees.length),
      "",
      ";",
      (i: i32): i32 => {
        if (i >= 0 && i < trees.length) {
          return trees[i].spanLo(ast);
        }
        fault();
        return 0;
      },
      (i: i32): i32 => {
        if (i >= 0 && i < trees.length) {
          return trees[i].hi;
        }
        fault();
        return 0;
      },
      (i: i32): string | null => (i >= 0 ? "" : null),
      lo,
      hi,
      false,
    );
    const pairs: Pair[] = [];
    for (let i = 0; i < trees.length; i++) {
      // One list item a tree, and one tree an item.
      if (i >= listItems.length || i >= items.length) {
        fault();
        return null;
      }
      pairs.push(new Pair(listItems[i], items[i], trees[i]));
    }
    const se = ctx.cfg.styleEdition;
    stableSort(pairs, (x: Pair, y: Pair): i32 => rsCmpUseTree(x.tree, y.tree, se));
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
    (i: i32): i32 => rsLoWithAttrs(ast, atI32(items, i)),
    (i: i32): i32 => atI32(ast.hi, atI32(items, i)),
    (i: i32): string | null => {
      const it = atI32(items, i);
      if (atI32(ast.kind, it) === N_EXTERN_CRATE) {
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
  stableSort(order, (x: i32, y: i32): i32 => compareItems(ctx, atI32(items, x), atI32(items, y)));
  const sorted: RsListItem[] = [];
  for (const i of order) {
    // One list item an item.
    if (i < 0 || i >= listItems.length) {
      fault();
      return null;
    }
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
    const item = atI32(items, i);
    const kind = reorderableKind(ctx, item);
    if (kind === RK_OTHER) {
      v.visitItem(item);
      i++;
      continue;
    }
    // walk_reorderable_or_regroupable_items, in_group.
    // An item stays in the group when it starts less than two lines after
    // the previous one ends: fewer than two newlines between them.
    let k = i;
    while (k >= 0 && k < n) {
      if (reorderableKind(ctx, atI32(items, k)) !== kind) {
        break;
      }
      if (k > i && newlinesBetween(ctx, atI32(ast.hi, atI32(items, k - 1)), rsLoWithAttrs(ast, atI32(items, k))) >= 2) {
        break;
      }
      k++;
    }
    // items[i] is of `kind`, so the group holds it.
    if (k <= i) {
      fault();
      return;
    }
    const group: i32[] = [];
    for (let j = i; j >= 0 && j < k && j < items.length; j++) {
      group.push(items[j]);
    }
    const lo = rsLoWithAttrs(ast, atI32(group, 0));
    const hi = atI32(ast.hi, atI32(group, toI32(group.length) - 1));
    const rw = rewriteReorderable(v.ctx(), group, v.shape(), lo, hi);
    v.pushRewrite(lo, hi, rw);
    i = k;
  }
};

export const rsReorderIndent = (shape: RsShape, ctx: RsCtx): string => rsIndentStr(ctx.cfg, shape.bi, shape.al);
export const rsReorderMeta = (ctx: RsCtx, a: i32): i32 => rsAttrMeta(ctx, a);
export const rsReorderIsUse = (ast: RsAst, n: i32): boolean => atI32(ast.kind, n) === N_USE;
