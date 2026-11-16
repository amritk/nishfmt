// Rewriting a list of items in delimiters, with the last item allowed to
// overflow (calls, generics, tuples, arrays, attribute lists, macro args).
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): overflow.rs.

import {
  N_EX_CLOSURE,
  N_EX_FOR,
  N_EX_IF,
  N_EX_LOOP,
  N_EX_MATCH,
  N_EX_WHILE,
  N_FIELD,
  N_GPARAM,
  N_META,
  N_META_LIT,
  N_LIFETIME,
  RsAst,
  rsIsExprKind,
  rsIsItemKind,
  rsIsPatKind,
  rsIsTyKind,
} from "./ast";
import { rsArgsHaveManyClosure, rsRewriteLastClosure } from "./closures";
import { rsFirstLineWidth, rsLastLineWidth } from "./comment";
import { RsCtx } from "./context";
import {
  rsCanBeOverflowedExpr,
  rsIsMethodCall,
  rsIsNestedCall,
  rsIsSimpleExpr,
  rsRewriteCond,
  rsRewriteExpr,
  rsRewriteNode,
} from "./expr";
import {
  DLT_HORIZONTAL,
  DLT_MIXED,
  DLT_SPECIAL_MACRO,
  DLT_VERTICAL,
  LT_HORIZONTAL_VERTICAL,
  LT_LIMITED,
  RsListFormatting,
  RsListItem,
  SEP_COMMA,
  ST_VERTICAL,
  rsDefinitiveTactic,
  rsItemizeList,
  rsTotalItemWidth,
  rsWriteList,
} from "./lists";
import { rsMacroArgRewrite, rsIsMacroKeywordArg } from "./macros";
import { rsCanBeOverflowedPat, rsTuplePatFieldLo, rsTuplePatFieldHi } from "./patterns";
import { RsShape, rsIndentStrNl } from "./shape";
import { rsCountNewlines, rsHasByte, rsLines, rsWsLenAt } from "./str";
import { rsCanBeOverflowedType, rsGenericParamHi, rsGenericParamLo } from "./types";
import { rsExprHasAttrs, rsExtraOffset, rsLoWithAttrs } from "./utils";

// OverflowableItem categories.
export const OC_EXPR: i32 = 0;
export const OC_GENERIC_PARAM: i32 = 1;
export const OC_MACRO_ARG: i32 = 2;
export const OC_META: i32 = 3;
export const OC_SEGMENT_PARAM: i32 = 4;
export const OC_FIELD_DEF: i32 = 5;
export const OC_TUPLE_PAT: i32 = 6;
export const OC_TY: i32 = 7;
export const OC_PAT: i32 = 8;
export const OC_PRECISE: i32 = 9;

const specialCaseArgs = (name: string): i32 => {
  if (
    name === "eprint!" ||
    name === "eprintln!" ||
    name === "format!" ||
    name === "format_args!" ||
    name === "print!" ||
    name === "println!" ||
    name === "panic!" ||
    name === "unreachable!" ||
    name === "debug!" ||
    name === "error!" ||
    name === "info!" ||
    name === "warn!"
  ) {
    return 0;
  }
  if (name === "assert!" || name === "debug_assert!" || name === "write!" || name === "writeln!") {
    return 1;
  }
  if (name === "assert_eq!" || name === "assert_ne!" || name === "debug_assert_eq!" || name === "debug_assert_ne!") {
    return 2;
  }
  return -1;
};

/** The Spanned span of an overflowable item. */
export const rsOverflowLo = (ctx: RsCtx, oc: i32, n: i32): i32 => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (k === N_GPARAM) {
    return rsGenericParamLo(ast, n);
  }
  if (oc === OC_TUPLE_PAT) {
    return rsTuplePatFieldLo(ast, n);
  }
  return rsLoWithAttrs(ast, n);
};

export const rsOverflowHi = (ctx: RsCtx, oc: i32, n: i32): i32 => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (k === N_GPARAM) {
    return rsGenericParamHi(ctx, n);
  }
  if (k === N_FIELD) {
    return ast.hi[ast.a[n]];
  }
  if (oc === OC_TUPLE_PAT) {
    return rsTuplePatFieldHi(ast, n);
  }
  return ast.hi[n];
};

const itemRewrite = (ctx: RsCtx, oc: i32, n: i32, shape: RsShape): string | null => {
  if (oc === OC_MACRO_ARG) {
    return rsMacroArgRewrite(ctx, n, shape);
  }
  return rsRewriteNode(ctx, n, shape);
};

const hasAttrs = (ast: RsAst, oc: i32, n: i32): boolean => {
  const k = ast.kind[n];
  if (oc === OC_EXPR) {
    return rsExprHasAttrs(ast, n);
  }
  if (oc === OC_GENERIC_PARAM || oc === OC_FIELD_DEF) {
    return ast.atn[n] > 0;
  }
  if (oc === OC_MACRO_ARG && rsIsExprKind(k)) {
    return rsExprHasAttrs(ast, n);
  }
  if (oc === OC_MACRO_ARG && rsIsItemKind(k)) {
    return ast.atn[n] > 0;
  }
  return false;
};

const isExprItem = (ast: RsAst, oc: i32, n: i32): boolean =>
  oc === OC_EXPR || (oc === OC_MACRO_ARG && rsIsExprKind(ast.kind[n]));

const isSimpleItem = (ctx: RsCtx, oc: i32, n: i32): boolean => {
  const ast = ctx.ast;
  if (oc === OC_EXPR) {
    return rsIsSimpleExpr(ast, n);
  }
  if (oc === OC_MACRO_ARG) {
    if (rsIsMacroKeywordArg(ast, n)) {
      return true;
    }
    return rsIsExprKind(ast.kind[n]) && rsIsSimpleExpr(ast, n);
  }
  if (oc === OC_META) {
    if (ast.kind[n] === N_META_LIT) {
      return true;
    }
    return ast.kind[n] === N_META && ast.b[n] < 0 && ast.c[n] < 0 && ast.x[n] < 0;
  }
  return false;
};

const isNestedCallItem = (ast: RsAst, oc: i32, n: i32): boolean => isExprItem(ast, oc, n) && rsIsNestedCall(ast, n);

const canBeOverflowedItem = (ctx: RsCtx, oc: i32, n: i32, len: i32): boolean => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (oc === OC_EXPR) {
    return rsCanBeOverflowedExpr(ctx, n, len);
  }
  if (oc === OC_MACRO_ARG) {
    if (rsIsMacroKeywordArg(ast, n)) {
      return false;
    }
    if (rsIsExprKind(k)) {
      return rsCanBeOverflowedExpr(ctx, n, len);
    }
    if (rsIsTyKind(k)) {
      return rsCanBeOverflowedType(ctx, n, len);
    }
    if (rsIsPatKind(k)) {
      return false;
    }
    if (rsIsItemKind(k)) {
      return len === 1;
    }
    return false;
  }
  if (oc === OC_META) {
    if (len !== 1) {
      return false;
    }
    return k === N_META;
  }
  if (oc === OC_SEGMENT_PARAM) {
    return rsIsTyKind(k) && rsCanBeOverflowedType(ctx, n, len);
  }
  if (oc === OC_TUPLE_PAT) {
    return rsCanBeOverflowedPat(ctx, n, len);
  }
  if (oc === OC_TY) {
    return rsCanBeOverflowedType(ctx, n, len);
  }
  return false;
};

const isEveryExprSimple = (ctx: RsCtx, oc: i32, items: i32[], from: i32, to: i32): boolean => {
  for (let i = from; i < to; i++) {
    if (!isSimpleItem(ctx, oc, items[i])) {
      return false;
    }
  }
  return true;
};

class OvContext {
  ctx: RsCtx;
  items: i32[];
  oc: i32;
  ident: string;
  prefix: string;
  suffix: string;
  oneLineShape: RsShape;
  nestedShape: RsShape;
  lo: i32;
  hi: i32;
  itemMaxWidth: i32;
  oneLineWidth: i32;
  forceSep: i32; // -1: None
  customLhs: string;
  customRhs: string;
  constructor(
    ctx: RsCtx,
    items: i32[],
    oc: i32,
    ident: string,
    shape: RsShape,
    lo: i32,
    hi: i32,
    prefix: string,
    suffix: string,
    itemMaxWidth: i32,
    forceSep: i32,
    customLhs: string,
    customRhs: string,
  ) {
    const cfg = ctx.cfg;
    this.ctx = ctx;
    this.items = items;
    this.oc = oc;
    this.ident = ident;
    this.lo = lo;
    this.hi = hi;
    this.prefix = prefix;
    this.suffix = suffix;
    this.itemMaxWidth = itemMaxWidth;
    this.forceSep = forceSep;
    this.customLhs = customLhs;
    this.customRhs = customRhs;
    const usedWidth = rsExtraOffset(ident, shape.usedWidth());
    let olw = shape.width - (usedWidth + 2);
    if (olw < 0) {
      olw = 0;
    }
    this.oneLineWidth = olw;
    const s1 = shape.offsetLeft(rsLastLineWidth(ident, cfg.tabSpaces) + 1);
    const s2: RsShape | null = s1 === null ? null : s1.subWidth(1);
    this.oneLineShape = s2 === null ? shape.withWidth(0) : s2;
    // shape_from_indent_style (block indent).
    const ns = shape.block().blockIndent(cfg.tabSpaces).withMaxWidth(cfg);
    this.nestedShape = ns.satSubWidth(1);
  }

  itemsLo(): i32 {
    return this.ctx.spanAfter(this.lo, this.hi, this.prefix);
  }

  rewriteLastItemWithOverflow(last: RsListItem, shape: RsShape): string | null {
    const ctx = this.ctx;
    const ast = ctx.ast;
    const n = this.items.length;
    if (n === 0) {
      return null;
    }
    const lastItem = this.items[n - 1];
    let rw: string | null = null;
    if (this.oc === OC_EXPR) {
      const k = ast.kind[lastItem];
      if (k === N_EX_CLOSURE) {
        if (rsArgsHaveManyClosure(ctx, this.oc, this.items)) {
          rw = null;
        } else {
          rw = rsRewriteLastClosure(ctx, lastItem, shape);
        }
      } else if (k === N_EX_IF || k === N_EX_FOR || k === N_EX_LOOP || k === N_EX_WHILE || k === N_EX_MATCH) {
        const cond = rsRewriteCond(ctx, lastItem, shape);
        const multi = cond !== null && rsHasByte(cond, 10);
        rw = multi ? null : rsRewriteExpr(ctx, lastItem, shape);
      } else {
        rw = rsRewriteExpr(ctx, lastItem, shape);
      }
    } else {
      rw = itemRewrite(ctx, this.oc, lastItem, shape);
    }
    if (rw !== null) {
      const nl = rsLines(rw);
      const k = rw.indexOf("\n");
      last.item = k < 0 ? rw : rw.slice(0, k);
      if (nl.length < 0) {
        return null;
      }
      return rw;
    }
    return null;
  }

  defaultTactic(items: RsListItem[]): i32 {
    return rsDefinitiveTactic(items, LT_LIMITED + this.itemMaxWidth, SEP_COMMA, this.oneLineWidth);
  }

  tryOverflowLastItem(listItems: RsListItem[]): i32 {
    const ctx = this.ctx;
    const ast = ctx.ast;
    const n = this.items.length;
    const combineArgWithCallee = n === 1 && isExprItem(ast, this.oc, this.items[0]) && !hasAttrs(ast, this.oc, this.items[0]) && toI32(this.ident.length) < ctx.cfg.tabSpaces;
    const overflowLast = combineArgWithCallee || (n > 0 && canBeOverflowedItem(ctx, this.oc, this.items[n - 1], n));
    let placeholder: string | null = null;
    if (overflowLast) {
      const old = ctx.forceOneLineChain;
      if (n > 0 && this.oc === OC_EXPR && !combineArgWithCallee && rsIsMethodCall(ast, this.items[n - 1])) {
        ctx.forceOneLineChain = true;
      }
      const argShape = lastItemShape(ctx, this.oc, this.items, listItems, this.oneLineShape, this.itemMaxWidth);
      if (argShape !== null) {
        placeholder = this.rewriteLastItemWithOverflow(listItems[n - 1], argShape);
      }
      ctx.forceOneLineChain = old;
    }
    let tactic = rsDefinitiveTactic(listItems, LT_LIMITED + this.itemMaxWidth, SEP_COMMA, this.oneLineWidth);
    if (overflowLast && tactic === DLT_HORIZONTAL && placeholder !== null && n === 1) {
      const overflowed = placeholder;
      if (rsCountNewlines(overflowed) === 1) {
        const rw = itemRewrite(ctx, this.oc, this.items[n - 1], this.nestedShape);
        const noNewline = rw !== null && !rsHasByte(rw, 10);
        if (noNewline) {
          listItems[n - 1].item = rw;
        } else {
          listItems[n - 1].item = overflowed;
        }
      } else {
        listItems[n - 1].item = overflowed;
      }
    } else if (overflowLast && tactic === DLT_HORIZONTAL && placeholder !== null) {
      listItems[n - 1].item = placeholder;
    } else if (n > 0) {
      listItems[n - 1].item = itemRewrite(ctx, this.oc, this.items[n - 1], this.nestedShape);
      const it0 = listItems[0];
      if (n === 1 && this.oneLineWidth !== 0 && !it0.hasComment() && !rsHasByte(it0.inner(), 10) && rsTotalItemWidth(it0) <= this.oneLineWidth) {
        tactic = DLT_HORIZONTAL;
      } else {
        tactic = this.defaultTactic(listItems);
        if (tactic === DLT_VERTICAL) {
          const numBefore = this.oc === OC_MACRO_ARG ? specialCaseArgs(this.ident) : this.oc === OC_META && this.ident === "fail" ? 0 : -1;
          if (numBefore >= 0) {
            const allSimple = n > numBefore && isEveryExprSimple(ctx, this.oc, this.items, 0, numBefore) && isEveryExprSimple(ctx, this.oc, this.items, numBefore + 1, n);
            const before: RsListItem[] = [];
            const after: RsListItem[] = [];
            for (let i = 0; i < listItems.length; i++) {
              if (i < numBefore) {
                before.push(listItems[i]);
              } else if (i > numBefore) {
                after.push(listItems[i]);
              }
            }
            const oneLine =
              allSimple &&
              rsDefinitiveTactic(before, LT_HORIZONTAL_VERTICAL, SEP_COMMA, this.nestedShape.width) === DLT_HORIZONTAL &&
              rsDefinitiveTactic(after, LT_HORIZONTAL_VERTICAL, SEP_COMMA, this.nestedShape.width) === DLT_HORIZONTAL;
            if (oneLine) {
              tactic = DLT_SPECIAL_MACRO + numBefore;
            }
          } else if (isEveryExprSimple(ctx, this.oc, this.items, 0, n) && noLongItems(listItems, ctx.cfg.shortArrayElementWidthThreshold)) {
            tactic = DLT_MIXED;
          }
        }
      }
    }
    return tactic;
  }

  rewriteItems(): RsItemsResult | null {
    const ctx = this.ctx;
    const ilo = this.itemsLo();
    const oc = this.oc;
    const items = this.items;
    const ns = this.nestedShape;
    const listItems = rsItemizeList(
      ctx,
      items.length,
      this.suffix,
      ",",
      (i: i32): i32 => rsOverflowLo(ctx, oc, items[i]),
      (i: i32): i32 => rsOverflowHi(ctx, oc, items[i]),
      (i: i32): string | null => itemRewrite(ctx, oc, items[i], ns),
      ilo,
      this.hi,
      true,
    );
    const tactic = this.tryOverflowLastItem(listItems);
    const trailing = this.forceSep >= 0 ? this.forceSep : ST_VERTICAL;
    const endsWithNewline = tactic === DLT_VERTICAL || tactic === DLT_MIXED;
    const fmt = new RsListFormatting(this.nestedShape, ctx.cfg);
    fmt.tactic = tactic;
    fmt.trailingSeparator = trailing;
    fmt.endsWithNewline = endsWithNewline;
    const s = rsWriteList(listItems, fmt);
    if (s === null) {
      return null;
    }
    return new RsItemsResult(tactic === DLT_HORIZONTAL, s);
  }

  wrapItems(itemsStr: string, shape0: RsShape, isExtendable: boolean): string {
    const ctx = this.ctx;
    const cfg = ctx.cfg;
    let w = shape0.width - rsLastLineWidth(this.ident, cfg.tabSpaces);
    if (w < 0) {
      w = 0;
    }
    const shape = shape0.withWidth(w);
    const prefix = this.customLhs.length !== 0 ? this.customLhs : this.prefix;
    const suffix = this.customRhs.length !== 0 ? this.customRhs : this.suffix;
    const extendWidth = itemsStr.length === 0 ? 2 : rsFirstLineWidth(itemsStr) + 1;
    const nestedIndentStr = rsIndentStrNl(cfg, this.nestedShape.bi, this.nestedShape.al);
    const indentStr = rsIndentStrNl(cfg, shape.bi, 0);
    let result = this.ident + prefix;
    const fitsOneLine = toI32(itemsStr.length) + 2 <= shape.width;
    const forceSingleLine = (ctx.insideMacro && !rsHasByte(itemsStr, 10) && fitsOneLine) || (isExtendable && extendWidth <= shape.width);
    if (forceSingleLine) {
      result = result + itemsStr;
    } else {
      if (itemsStr.length !== 0) {
        result = result + nestedIndentStr + itemsStr;
      }
      result = result + indentStr;
    }
    return result + suffix;
  }

  rewrite(shape: RsShape): string | null {
    const r = this.rewriteItems();
    if (r === null) {
      return null;
    }
    return this.wrapItems(r.items, shape, r.extendable);
  }
}

class RsItemsResult {
  extendable: boolean;
  items: string;
  constructor(extendable: boolean, items: string) {
    this.extendable = extendable;
    this.items = items;
  }
}

const lastItemShape = (ctx: RsCtx, oc: i32, lists: i32[], items: RsListItem[], shape: RsShape, argsMaxWidth: i32): RsShape | null => {
  if (items.length === 1 && lists.length > 0 && !isNestedCallItem(ctx.ast, oc, lists[0])) {
    return shape;
  }
  if (lists.length === 0) {
    return null;
  }
  let offset = 0;
  for (let i = 0; i < items.length - 1; i++) {
    offset += 2 + toI32(items[i].inner().length);
  }
  const w = argsMaxWidth < shape.width ? argsMaxWidth : shape.width;
  return shape.withWidth(w).offsetLeft(offset);
};

const noLongItems = (list: RsListItem[], threshold: i32): boolean => {
  for (const it of list) {
    if (toI32(it.inner().length) > threshold) {
      return false;
    }
  }
  return true;
};

/** need_block_indent: unused with the block indent style. */
export const rsNeedBlockIndent = (s: string, indentWidth: i32): boolean => {
  const ls = rsLines(s);
  for (let i = 1; i < toI32(ls.length); i++) {
    const l = ls[i];
    let k = 0;
    while (k < toI32(l.length) && rsWsLenAt(l, k) > 0) {
      k++;
    }
    if (k < toI32(l.length) && k + 1 < indentWidth) {
      return true;
    }
  }
  return false;
};

/** rewrite_with_parens; [lo, hi) is the span that holds the `(`. forceSep: -1 for None. */
export const rsRewriteWithParens = (ctx: RsCtx, ident: string, items: i32[], oc: i32, shape: RsShape, lo: i32, hi: i32, itemMaxWidth: i32, forceSep: i32): string | null => {
  const c = new OvContext(ctx, items, oc, ident, shape, lo, hi, "(", ")", itemMaxWidth, forceSep, "", "");
  return c.rewrite(shape);
};

/** rewrite_with_angle_brackets. */
export const rsRewriteWithAngleBrackets = (ctx: RsCtx, ident: string, items: i32[], oc: i32, shape: RsShape, lo: i32, hi: i32): string | null => {
  const c = new OvContext(ctx, items, oc, ident, shape, lo, hi, "<", ">", ctx.cfg.maxWidth, -1, "", "");
  return c.rewrite(shape);
};

/** rewrite_with_square_brackets; delim: the token kind of the delimiter (T_LPAREN/T_LBRACE) or -1 for `[`. */
export const rsRewriteWithSquareBrackets = (ctx: RsCtx, name: string, items: i32[], oc: i32, shape: RsShape, lo: i32, hi: i32, forceSep: i32, delim: i32): string | null => {
  let lhs = "[";
  let rhs = "]";
  if (delim === 26) {
    lhs = "(";
    rhs = ")";
  } else if (delim === 28) {
    lhs = "{";
    rhs = "}";
  }
  const c = new OvContext(ctx, items, oc, name, shape, lo, hi, lhs, rhs, ctx.cfg.arrayWidth, forceSep, "[", "]");
  return c.rewrite(shape);
};

export const rsOverflowIsLifetime = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_LIFETIME;
