// Formatting attributes and meta items. Meta items are parsed from an
// attribute's tokens the way rustc_ast's `Attribute::meta` does.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): attr.rs; and rustc_ast's attr/mod.rs (MIT OR Apache-2.0,
// Copyright The Rust Project Developers).

import { AT_DOC, AT_INNER, AT_UNSAFE, N_EX_LIT, N_META, N_META_LIT, N_PATH, N_SEG, RsAst } from "./ast";
import { rsContainsComment, rsRecoverMissingCommentInSpan, rsRewriteDocComment } from "./comment";
import { RsCtx } from "./context";
import { rsRewriteLiteral, rsRewriteLiteralTok, rsSpanEndsWithComma } from "./expr";
import {
  DLT_HORIZONTAL,
  LT_HORIZONTAL_VERTICAL,
  RsListFormatting,
  RsListItem,
  SEP_COMMA,
  ST_ALWAYS,
  ST_NEVER,
  rsDefinitiveTactic,
  rsItemizeList,
  rsWriteList,
} from "./lists";
import { OC_META, rsRewriteWithParens } from "./overflow";
import { T_COLONCOLON, T_COMMA, T_EQ, T_IDENT, T_INT, T_LPAREN, T_RCSTR, KW_FALSE, KW_TRUE } from "./lexer";
import { RsShape, rsIndentStr, rsIndentStrNl } from "./shape";
import { rsCountNewlines, rsHasByte, rsIndexOfByte, rsWsLenAt } from "./str";
import { PC_TYPE, rsRewritePath } from "./types";
import { rsExprInnerBlock } from "./utils";

// Meta item kinds: in N_META's `x`.
const MK_WORD: i32 = 0;
const MK_LIST: i32 = 1;
const MK_NV: i32 = 2;

class MetaParser {
  ctx: RsCtx;
  p: i32;
  end: i32;
  failed: boolean = false;
  constructor(ctx: RsCtx, p: i32, end: i32) {
    this.ctx = ctx;
    this.p = p;
    this.end = end;
  }

  kind(i: i32): i32 {
    return i < this.end ? this.ctx.f.t.kind[i] : -1;
  }

  isLitTok(i: i32): boolean {
    const k = this.kind(i);
    if (k >= T_INT && k <= T_RCSTR) {
      return true;
    }
    if (k === T_IDENT) {
      const kw = this.ctx.f.t.kw[i];
      return kw === KW_TRUE || kw === KW_FALSE;
    }
    return false;
  }

  /** A comma-separated list of inner items into N_META node `n`'s list. */
  list(n: i32): boolean {
    const ast = this.ctx.ast;
    const items: i32[] = [];
    while (this.p < this.end) {
      const it = this.inner();
      if (it < 0) {
        return false;
      }
      items.push(it);
      if (this.p >= this.end) {
        break;
      }
      if (this.kind(this.p) !== T_COMMA) {
        return false;
      }
      this.p = this.p + 1;
    }
    ast.ls[n] = ast.addKids(items, 0, toI32(items.length));
    ast.ln[n] = toI32(items.length);
    return true;
  }

  inner(): i32 {
    const ast = this.ctx.ast;
    const t = this.ctx.f.t;
    if (this.isLitTok(this.p)) {
      const n = ast.add(N_META_LIT, t.lo[this.p]);
      ast.hi[n] = t.hi[this.p];
      ast.d[n] = this.p;
      this.p = this.p + 1;
      return n;
    }
    return this.item(-1, -1);
  }

  /** A meta item; spanLo/spanHi override its span (the top-level attribute's). */
  item(spanLo: i32, spanHi: i32): i32 {
    const ast = this.ctx.ast;
    const t = this.ctx.f.t;
    const k = this.kind(this.p);
    if (k !== T_IDENT && k !== T_COLONCOLON) {
      return -1;
    }
    const path = ast.add(N_PATH, t.lo[this.p]);
    const segs: i32[] = [];
    if (k === T_COLONCOLON) {
      ast.fl[path] = 1;
      this.p = this.p + 1;
    }
    for (;;) {
      if (this.kind(this.p) !== T_IDENT) {
        return -1;
      }
      const sg = ast.add(N_SEG, t.lo[this.p]);
      ast.hi[sg] = t.hi[this.p];
      ast.d[sg] = this.p;
      segs.push(sg);
      this.p = this.p + 1;
      if (this.kind(this.p) === T_COLONCOLON) {
        this.p = this.p + 1;
        continue;
      }
      break;
    }
    ast.ls[path] = ast.addKids(segs, 0, toI32(segs.length));
    ast.ln[path] = toI32(segs.length);
    ast.hi[path] = ast.hi[segs[segs.length - 1]];
    const n = ast.add(N_META, ast.lo[path]);
    ast.a[n] = path;
    let hi = ast.hi[path];
    const k2 = this.kind(this.p);
    if (this.p < this.end && (k2 === T_LPAREN || k2 === 28 || k2 === 30)) {
      if (k2 !== T_LPAREN) {
        return -1;
      }
      const close = t.match[this.p];
      const sub = new MetaParser(this.ctx, this.p + 1, close);
      if (!sub.list(n)) {
        return -1;
      }
      ast.x[n] = MK_LIST;
      hi = t.hi[close];
      this.p = close + 1;
    } else if (k2 === T_EQ) {
      this.p = this.p + 1;
      if (!this.isLitTok(this.p)) {
        return -1;
      }
      ast.x[n] = MK_NV;
      ast.d[n] = this.p;
      hi = t.hi[this.p];
      this.p = this.p + 1;
    } else {
      ast.x[n] = MK_WORD;
    }
    ast.hi[n] = hi;
    if (spanLo >= 0) {
      ast.lo[n] = spanLo;
      ast.hi[n] = spanHi;
    }
    return n;
  }
}

/** Attribute::meta for N_ATTR `a`: an N_META node, or -1. Cached in the attribute's `d`. */
export const rsAttrMeta = (ctx: RsCtx, a: i32): i32 => {
  const ast = ctx.ast;
  if ((ast.fl[a] & AT_DOC) !== 0) {
    return -1;
  }
  if (ast.d[a] >= 0) {
    return ast.d[a];
  }
  if (ast.d[a] === -2) {
    return -1;
  }
  const t = ctx.f.t;
  const path = ast.a[a];
  const n = ast.add(N_META, ast.lo[a]);
  ast.hi[n] = ast.hi[a];
  ast.a[n] = path;
  const tts = ast.b[a];
  const val = ast.c[a];
  let ok = true;
  if (tts >= 0) {
    const open = ast.a[tts];
    if (t.kind[open] !== T_LPAREN) {
      ok = false;
    } else {
      const mp = new MetaParser(ctx, open + 1, ast.b[tts]);
      ok = mp.list(n);
      ast.x[n] = MK_LIST;
    }
  } else if (val >= 0) {
    if (ast.kind[val] === N_EX_LIT) {
      ast.x[n] = MK_NV;
      ast.d[n] = ast.d[val];
    } else {
      ok = false;
    }
  } else {
    ast.x[n] = MK_WORD;
  }
  if (!ok) {
    ast.d[a] = -2;
    return -1;
  }
  ast.d[a] = n;
  return n;
};

const pathStr = (ctx: RsCtx, path: i32): string => {
  const ast = ctx.ast;
  let s = (ast.fl[path] & 1) !== 0 ? "::" : "";
  for (let i = 0; i < ast.ln[path]; i++) {
    if (i > 0) {
      s = s + "::";
    }
    s = s + ctx.tokStr(ast.d[ast.kid(path, i)]);
  }
  return s;
};

const isSkipMeta = (ctx: RsCtx, m: i32): boolean => {
  const ast = ctx.ast;
  if (ast.kind[m] !== N_META) {
    return false;
  }
  const k = ast.x[m];
  const ps = pathStr(ctx, ast.a[m]);
  if (ps.startsWith("rustfmt::skip::")) {
    // #[rustfmt::skip::macros(..)] / ::attributes(..): the skip context is not ported.
    ctx.unsupported("rustfmt::skip:: attribute");
    return false;
  }
  if (k === MK_WORD) {
    return ps === "rustfmt::skip" || ps === "rustfmt_skip";
  }
  if (k === MK_LIST) {
    return pathStr(ctx, ast.a[m]) === "cfg_attr" && ast.ln[m] === 2 && isSkipMeta(ctx, ast.kid(m, 1));
  }
  return false;
};

/** contains_skip over all attributes of node `n`. */
export const rsAttrsContainSkip = (ctx: RsCtx, n: i32): boolean => {
  const ast = ctx.ast;
  for (let i = 0; i < ast.atn[n]; i++) {
    const m = rsAttrMeta(ctx, ast.attr(n, i));
    if (m >= 0 && isSkipMeta(ctx, m)) {
      return true;
    }
  }
  return false;
};

/** contains_skip(&expr.attrs): with the inner attributes of a block-like expression. */
export const rsExprAttrsContainSkip = (ctx: RsCtx, e: i32): boolean => {
  if (rsAttrsContainSkip(ctx, e)) {
    return true;
  }
  const b = rsExprInnerBlock(ctx.ast, e);
  return b >= 0 && rsAttrsContainSkip(ctx, b);
};

export const rsAttrListContainsSkip = (ctx: RsCtx, attrs: i32[]): boolean => {
  for (const a of attrs) {
    const m = rsAttrMeta(ctx, a);
    if (m >= 0 && isSkipMeta(ctx, m)) {
      return true;
    }
  }
  return false;
};

export const rsIsSkipAttrPath = (ctx: RsCtx, path: i32): boolean => {
  const s = pathStr(ctx, path);
  return s === "rustfmt::skip";
};

const isDoc = (ast: RsAst, a: i32): boolean => (ast.fl[a] & AT_DOC) !== 0;

const isDerive = (ctx: RsCtx, a: i32): boolean => {
  const ast = ctx.ast;
  if (isDoc(ast, a)) {
    return false;
  }
  const p = ast.a[a];
  return ast.ln[p] === 1 && (ast.fl[p] & 1) === 0 && ctx.tokStr(ast.d[ast.kid(p, 0)]) === "derive";
};

/** take_while_with_pred: how many attributes from `from` satisfy `pred` in one group. pred: 0 doc, 1 derive. */
const takeWhileWithPred = (ctx: RsCtx, attrs: i32[], from: i32, pred: i32): i32 => {
  const ast = ctx.ast;
  let len = 0;
  for (let i = from; i < toI32(attrs.length); i++) {
    const a = attrs[i];
    const ok = pred === 0 ? isDoc(ast, a) : isDerive(ctx, a);
    if (ok) {
      len++;
    } else {
      break;
    }
    if (i + 1 < toI32(attrs.length)) {
      const sn = ctx.snippet(ast.hi[a], ast.lo[attrs[i + 1]]);
      if (rsCountNewlines(sn) >= 2 || rsHasByte(sn, 47)) {
        break;
      }
    }
  }
  return len;
};

const attrPrefix = (ast: RsAst, a: i32): string => ((ast.fl[a] & AT_INNER) !== 0 ? "#!" : "#");

/** has_newlines_before_after_comment: [before, after] as "\n" or "". */
const newlinesBefore = (comment: string): string => {
  const cb = rsIndexOfByte(comment, 47, 0);
  const len = cb < 0 ? toI32(comment.length) : cb;
  return rsCountNewlines(comment.slice(0, len)) > 1 ? "\n" : "";
};

const newlinesAfter = (comment: string): string => {
  const cb = rsIndexOfByte(comment, 47, 0);
  if (cb < 0) {
    return newlinesBefore(comment);
  }
  let k = 0;
  let i = toI32(comment.length) - 1;
  while (i >= 0) {
    const c = comment.charCodeAt(i);
    if (!(c === 32 || (c >= 9 && c <= 13))) {
      break;
    }
    if (c === 10) {
      k++;
    }
    i--;
  }
  return k > 1 ? "\n" : "";
};

const formatDerive = (ctx: RsCtx, derives: i32[], shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const all: RsListItem[] = [];
  for (const a of derives) {
    const m = rsAttrMeta(ctx, a);
    if (m < 0 || ast.x[m] !== MK_LIST) {
      return null;
    }
    const n = ast.ln[m];
    const items = rsItemizeList(
      ctx,
      n,
      ")",
      ",",
      (i: i32): i32 => ast.lo[ast.kid(m, i)],
      (i: i32): i32 => ast.hi[ast.kid(m, i)],
      (i: i32): string | null => ctx.snippet(ast.lo[ast.kid(m, i)], ast.hi[ast.kid(m, i)]),
      ctx.spanAfter(ast.lo[a], ast.hi[a], "("),
      ast.hi[a],
      false,
    );
    for (const it of items) {
      all.push(it);
    }
  }
  const prefix = attrPrefix(ast, derives[0]);
  const argShape = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg);
  const ol0 = shape.offsetLeft(10 + toI32(prefix.length));
  if (ol0 === null) {
    return null;
  }
  const ol = ol0.subWidth(3);
  if (ol === null) {
    return null;
  }
  const tactic = rsDefinitiveTactic(all, LT_HORIZONTAL_VERTICAL, SEP_COMMA, argShape.width);
  const fmt = new RsListFormatting(argShape, cfg);
  fmt.tactic = tactic;
  fmt.trailingSeparator = ST_ALWAYS;
  fmt.endsWithNewline = false;
  const itemStr = rsWriteList(all, fmt);
  if (itemStr === null) {
    return null;
  }
  const nested = rsHasByte(itemStr, 10) || toI32(itemStr.length) > ol.width;
  let result = prefix + "[derive(";
  if (nested) {
    result = result + rsIndentStrNl(cfg, argShape.bi, argShape.al) + itemStr + rsIndentStrNl(cfg, shape.bi, shape.al);
  } else if (itemStr.endsWith(",")) {
    result = result + itemStr.slice(0, toI32(itemStr.length) - 1);
  } else {
    result = result + itemStr;
  }
  return result + ")]";
};

/** Rewrite for ast::MetaItem / MetaItemInner (N_META or N_META_LIT). */
export const rsRewriteMetaItem = (ctx: RsCtx, m: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (ast.kind[m] === N_META_LIT) {
    return rsRewriteLiteralTok(ctx, ast.d[m], shape);
  }
  const k = ast.x[m];
  const path = rsRewritePath(ctx, PC_TYPE, -1, ast.a[m], shape);
  if (path === null) {
    return null;
  }
  if (k === MK_WORD) {
    return path;
  }
  if (k === MK_LIST) {
    const hasTrailingComma = rsSpanEndsWithComma(ctx, ast.lo[m], ast.hi[m]);
    const s = shape.subWidth(1);
    if (s === null) {
      return null;
    }
    const items: i32[] = [];
    for (let i = 0; i < ast.ln[m]; i++) {
      items.push(ast.kid(m, i));
    }
    return rsRewriteWithParens(
      ctx,
      path,
      items,
      OC_META,
      s,
      ast.lo[m],
      ast.hi[m],
      ctx.cfg.attrFnLikeWidth,
      hasTrailingComma ? ST_ALWAYS : ST_NEVER,
    );
  }
  const ls = shape.shrinkLeft(toI32(path.length) + 3);
  if (ls === null) {
    return null;
  }
  const lit = ast.d[m];
  const v = rsRewriteLiteral(ctx, lit, ls);
  return `${path} = ${v !== null ? v : ctx.tokStr(lit)}`;
};

/** Rewrite for ast::Attribute. */
export const rsRewriteAttr = (ctx: RsCtx, a: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const snippet = ctx.snippet(ast.lo[a], ast.hi[a]);
  if (isDoc(ast, a)) {
    return rsRewriteDocComment(snippet, shape.comment(ctx.cfg), ctx.cfg);
  }
  const prefix = attrPrefix(ast, a);
  if (rsContainsComment(snippet)) {
    return snippet;
  }
  const m = rsAttrMeta(ctx, a);
  if (m < 0) {
    return snippet;
  }
  const s = shape.offsetLeft(toI32(prefix.length) + 1);
  if (s === null) {
    return null;
  }
  const rw = rsRewriteMetaItem(ctx, m, s);
  if (rw === null) {
    return snippet;
  }
  if ((ast.fl[a] & AT_UNSAFE) !== 0) {
    return `${prefix}[unsafe(${rw})]`;
  }
  return `${prefix}[${rw}]`;
};

/** Rewrite for [ast::Attribute]. */
export const rsRewriteAttrs = (ctx: RsCtx, attrs: i32[], shape: RsShape): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  let result = "";
  let i = 0;
  const n = toI32(attrs.length);
  const indent = rsIndentStr(cfg, shape.bi, shape.al);
  while (i < n) {
    const docLen = takeWhileWithPred(ctx, attrs, i, 0);
    if (docLen > 0) {
      let snippet = "";
      for (let k = 0; k < docLen; k++) {
        const a = attrs[i + k];
        if (k > 0) {
          snippet = snippet + "\n";
        }
        snippet = snippet + ctx.snippet(ast.lo[a], ast.hi[a]);
      }
      const ds = rsRewriteDocComment(snippet, shape.comment(cfg), cfg);
      if (ds === null) {
        return null;
      }
      result = result + ds;
      if (i + docLen < n) {
        const lo = ast.hi[attrs[i + docLen - 1]];
        const hi = ast.lo[attrs[i + docLen]];
        const sn = ctx.snippet(lo, hi);
        const mla = newlinesBefore(sn);
        const mlb = newlinesAfter(sn);
        const c = rsRecoverMissingCommentInSpan(sn, shape.withMaxWidth(cfg), cfg, 0);
        if (c === null) {
          return null;
        }
        result = result + (c.length === 0 ? "\n" + mlb : mla + c + "\n" + mlb) + indent;
      }
      i += docLen;
      continue;
    }
    if (isDerive(ctx, attrs[i])) {
      const dl = takeWhileWithPred(ctx, attrs, i, 1);
      const derives: i32[] = [];
      for (let k = 0; k < dl; k++) {
        derives.push(attrs[i + k]);
      }
      const ds = formatDerive(ctx, derives, shape);
      if (ds === null) {
        return null;
      }
      result = result + ds;
      if (i + dl < n) {
        const lo = ast.hi[attrs[i + dl - 1]];
        const next = attrs[i + dl];
        const sn = ctx.snippet(lo, ast.lo[next]);
        const c = rsRecoverMissingCommentInSpan(sn, shape.withMaxWidth(cfg), cfg, 0);
        if (c === null) {
          return null;
        }
        result = result + c;
        if (isDoc(ast, next)) {
          result = result + newlinesAfter(sn);
        }
        result = result + "\n" + indent;
      }
      i += dl;
      continue;
    }
    const fa = rsRewriteAttr(ctx, attrs[i], shape);
    if (fa === null) {
      return null;
    }
    result = result + fa;
    if (i + 1 < n) {
      const next = attrs[i + 1];
      const sn = ctx.snippet(ast.hi[attrs[i]], ast.lo[next]);
      const c = rsRecoverMissingCommentInSpan(sn, shape.withMaxWidth(cfg), cfg, 0);
      if (c === null) {
        return null;
      }
      result = result + c;
      if (isDoc(ast, next)) {
        result = result + newlinesAfter(sn);
      }
      result = result + "\n" + indent;
    }
    i++;
  }
  return result;
};

/** The attributes of node `n` (all of them), rewritten. */
export const rsRewriteNodeAttrs = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  if (ast.atn[n] === 0) {
    return "";
  }
  const attrs: i32[] = [];
  for (let i = 0; i < ast.atn[n]; i++) {
    attrs.push(ast.attr(n, i));
  }
  return rsRewriteAttrs(ctx, attrs, shape);
};

export const rsAttrTrimmedWs = (s: string): boolean => rsWsLenAt(s, 0) > 0;
export const rsAttrIsHorizontal = (t: i32): boolean => t === DLT_HORIZONTAL;
