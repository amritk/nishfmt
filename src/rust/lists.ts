// Format list-like expressions and items: rustfmt's lists.rs.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): lists.rs, config/lists.rs.

import { RsCtx } from "./context";
import { rsFindCommentEnd, rsFindUncommented, rsFirstLineWidth, rsLastLineWidth, rsRewriteComment } from "./comment";
import { RsConfig, RsShape, rsIndentStr, rsShapeLegacy } from "./shape";
import {
  RsStrBuf,
  rsCountNewlines,
  rsHasByte,
  rsIndexOfByte,
  rsLastIndexOfByte,
  rsLastLineOpt,
  rsLines,
  rsTrim,
  rsTrimStart,
  rsWidth,
  rsWsLenAt,
} from "./str";

// DefinitiveListTactic (SpecialMacro(n) is DLT_SPECIAL_MACRO + n).
export const DLT_VERTICAL: i32 = 0;
export const DLT_HORIZONTAL: i32 = 1;
export const DLT_MIXED: i32 = 2;
export const DLT_SPECIAL_MACRO: i32 = 1000;

// ListTactic (LimitedHorizontalVertical(n) is LT_LIMITED + n).
export const LT_VERTICAL: i32 = 0;
export const LT_HORIZONTAL: i32 = 1;
export const LT_HORIZONTAL_VERTICAL: i32 = 2;
export const LT_MIXED: i32 = 3;
export const LT_LIMITED: i32 = 1000;

// SeparatorTactic.
export const ST_ALWAYS: i32 = 0;
export const ST_NEVER: i32 = 1;
export const ST_VERTICAL: i32 = 2;

// SeparatorPlace.
export const SP_FRONT: i32 = 0;
export const SP_BACK: i32 = 1;

// ListItemCommentStyle.
export const LCS_SAME_LINE: i32 = 0;
export const LCS_DIFFERENT_LINE: i32 = 1;
export const LCS_NONE: i32 = 2;

// Separator.
export const SEP_COMMA: i32 = 2;
export const SEP_VERTICAL_BAR: i32 = 3;

export class RsListItem {
  pre: string | null = null;
  preStyle: i32 = 2;
  item: string | null = null; // null: the rewrite failed
  post: string | null = null;
  newLines: boolean = false;
  constructor() {}

  inner(): string {
    return this.item ?? "";
  }

  isDifferentGroup(): boolean {
    const post = this.post;
    return rsHasByte(this.inner(), 10) || this.pre !== null || (post !== null && rsHasByte(post, 10));
  }

  isMultiline(): boolean {
    const pre = this.pre;
    const post = this.post;
    return (
      rsHasByte(this.inner(), 10) || (pre !== null && rsHasByte(pre, 10)) || (post !== null && rsHasByte(post, 10))
    );
  }

  hasSingleLineComment(): boolean {
    const pre = this.pre;
    const post = this.post;
    return (pre !== null && rsTrimStart(pre).startsWith("//")) || (post !== null && rsTrimStart(post).startsWith("//"));
  }

  hasComment(): boolean {
    return this.pre !== null || this.post !== null;
  }

  isSubstantial(): boolean {
    const pre = this.pre;
    const post = this.post;
    const item = this.item;
    const e1 = pre === null || pre.length === 0;
    const e2 = item === null || item.length === 0;
    const e3 = post === null || post.length === 0;
    return !(e1 && e2 && e3);
  }
}

export const rsListItemFromStr = (s: string): RsListItem => {
  const it = new RsListItem();
  it.item = s;
  return it;
};

export const rsListItemFromItem = (s: string | null): RsListItem => {
  const it = new RsListItem();
  it.item = s;
  return it;
};

export class RsListFormatting {
  tactic: i32 = 0; // DLT_VERTICAL
  separator: string = ",";
  trailingSeparator: i32 = 1; // ST_NEVER
  separatorPlace: i32 = 1; // SP_BACK
  shape: RsShape;
  endsWithNewline: boolean = true;
  preserveNewline: boolean = false;
  nested: boolean = false;
  alignComments: boolean = true;
  cfg: RsConfig;
  constructor(shape: RsShape, cfg: RsConfig) {
    this.shape = shape;
    this.cfg = cfg;
  }

  needsTrailingSeparator(): boolean {
    if (this.trailingSeparator === ST_ALWAYS) {
      return true;
    }
    if (this.trailingSeparator === ST_VERTICAL) {
      return this.tactic === DLT_VERTICAL;
    }
    return this.tactic === DLT_VERTICAL && this.separatorPlace === SP_FRONT;
  }
}

const commentLen = (s: string | null): i32 => {
  if (s === null) {
    return 0;
  }
  const t = toI32(rsTrim(s).length);
  return t > 0 ? t + 6 : t;
};

export const rsTotalItemWidth = (it: RsListItem): i32 => {
  const item = it.item;
  return commentLen(it.pre) + commentLen(it.post) + (item === null ? 0 : rsWidth(item));
};

/** definitive_tactic. */
export const rsDefinitiveTactic = (items: RsListItem[], tactic: i32, sep: i32, width: i32): i32 => {
  let preLineComments = false;
  for (const it of items) {
    if (it.hasSingleLineComment()) {
      preLineComments = true;
      break;
    }
  }
  let limit = width;
  if (preLineComments) {
    return DLT_VERTICAL;
  }
  if (tactic === LT_HORIZONTAL) {
    return DLT_HORIZONTAL;
  }
  if (tactic === LT_VERTICAL) {
    return DLT_VERTICAL;
  }
  if (tactic >= LT_LIMITED) {
    const l = tactic - LT_LIMITED;
    limit = width < l ? width : l;
  }
  let count = 0;
  let total = 0;
  for (const it of items) {
    count++;
    total += rsTotalItemWidth(it);
  }
  const sepCount = count > 0 ? count - 1 : 0;
  const realTotal = total + sep * sepCount;
  let anyMultiline = false;
  for (const it of items) {
    if (it.isMultiline()) {
      anyMultiline = true;
      break;
    }
  }
  if (realTotal <= limit && !anyMultiline) {
    return DLT_HORIZONTAL;
  }
  return tactic === LT_MIXED ? DLT_MIXED : DLT_VERTICAL;
};

const maxWidthOfItemWithPostComment = (items: RsListItem[], i: i32, overhead: i32, maxBudget: i32): i32 => {
  let maxWidth = 0;
  let first = true;
  for (let k = i; k < toI32(items.length); k++) {
    const it = items[k];
    const w = rsWidth(it.inner());
    if (!first && (it.isDifferentGroup() || it.post === null || w + overhead > maxBudget)) {
      return maxWidth;
    }
    if (maxWidth < w) {
      maxWidth = w;
    }
    if (it.newLines) {
      return maxWidth;
    }
    first = false;
  }
  return maxWidth;
};

const startsWithNewline = (s: string): boolean => s.startsWith("\n") || s.startsWith("\r\n");

// Rewrites a post comment (the closure in write_list); itemMaxWidth is in/out via `st`.
class PostState {
  itemMaxWidth: i32 = -1; // -1: None
  constructor() {}
}

const rewritePostComment = (
  st: PostState,
  items: RsListItem[],
  i: i32,
  last: boolean,
  innerItem: string,
  comment: string,
  overhead0: i32,
  itemLastLineWidth: i32,
  f: RsListFormatting,
): string | null => {
  if (st.itemMaxWidth < 0 && !last && !rsHasByte(innerItem, 10)) {
    st.itemMaxWidth = maxWidthOfItemWithPostComment(items, i, overhead0, f.cfg.maxWidth);
  }
  let overhead = 0;
  if (startsWithNewline(comment)) {
    overhead = 0;
  } else if (st.itemMaxWidth >= 0) {
    overhead = st.itemMaxWidth + 2;
  } else {
    overhead = itemLastLineWidth + 1;
  }
  let width = f.shape.width - overhead;
  if (overhead > f.shape.width) {
    width = 1;
  }
  const commentShape = rsShapeLegacy(width, f.shape.bi, f.shape.al + overhead);
  return rsRewriteComment(rsTrimStart(comment), commentShape, f.cfg);
};

/** write_list; null when an item failed. */
export const rsWriteList = (items: RsListItem[], f: RsListFormatting): string | null => {
  const tactic = f.tactic;
  const sepLen = toI32(f.separator.length);
  let trailingSeparator = f.needsTrailingSeparator();
  const result = new RsStrBuf();
  const st = new PostState();
  let sepPlace = f.separatorPlace;
  if (tactic !== DLT_VERTICAL && f.separator === ",") {
    sepPlace = SP_BACK;
  }
  let prevItemHadPostComment = false;
  let prevItemIsNestedImport = false;
  let lineLen = 0;
  const indentStr = rsIndentStr(f.cfg, f.shape.bi, f.shape.al);
  const n = toI32(items.length);
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const innerOpt = item.item;
    if (innerOpt === null) {
      return null;
    }
    const innerItem = innerOpt;
    const first = i === 0;
    const last = i === n - 1;
    let separate = sepPlace === SP_FRONT ? !first : !last || trailingSeparator;
    const itemSepLen = separate ? sepLen : 0;
    let itemLastLine = innerItem;
    if (item.isMultiline()) {
      const ll = rsLastLineOpt(innerItem);
      itemLastLine = ll === null ? "" : ll;
    }
    let itemLastLineWidth = rsWidth(itemLastLine) + itemSepLen;
    if (itemLastLine.startsWith(indentStr)) {
      itemLastLineWidth -= rsWidth(indentStr);
    }
    if (!item.isSubstantial()) {
      continue;
    }
    if (tactic === DLT_HORIZONTAL) {
      if (!first) {
        result.add(" ");
      }
    } else if (tactic >= DLT_SPECIAL_MACRO) {
      const numArgsBefore = tactic - DLT_SPECIAL_MACRO;
      if (i === 0) {
        // Nothing.
      } else if (i < numArgsBefore) {
        result.add(" ");
      } else if (i <= numArgsBefore + 1) {
        result.add("\n" + indentStr);
      } else {
        result.add(" ");
      }
    } else if (tactic === DLT_VERTICAL) {
      if (!first && innerItem.length !== 0 && result.len() !== 0) {
        result.add("\n" + indentStr);
      }
    } else if (tactic === DLT_MIXED) {
      const totalWidth = rsTotalItemWidth(item) + itemSepLen;
      if (
        (lineLen > 0 && lineLen + 1 + totalWidth > f.shape.width) ||
        prevItemHadPostComment ||
        (f.nested && (prevItemIsNestedImport || (!first && innerItem.indexOf("::") >= 0)))
      ) {
        result.add("\n" + indentStr);
        lineLen = 0;
        if (f.endsWithNewline) {
          trailingSeparator = true;
        }
      } else if (lineLen > 0) {
        result.add(" ");
        lineLen += 1;
      }
      if (last && f.endsWithNewline) {
        separate = f.trailingSeparator !== ST_NEVER;
      }
      lineLen += totalWidth;
    }
    const pre = item.pre;
    if (pre !== null) {
      const commentShape = f.shape.comment(f.cfg);
      const comment = rsRewriteComment(pre, commentShape, f.cfg);
      if (comment === null) {
        return null;
      }
      result.add(comment);
      if (innerItem.length !== 0) {
        if (tactic === DLT_VERTICAL || tactic === DLT_MIXED || tactic >= DLT_SPECIAL_MACRO) {
          let keepComment = false;
          if (item.preStyle === LCS_DIFFERENT_LINE) {
            keepComment = false;
          } else {
            const totalWidth = rsTotalItemWidth(item) + itemSepLen + 1;
            keepComment = totalWidth <= f.shape.width;
          }
          if (keepComment) {
            result.add(" ");
          } else {
            result.add("\n" + indentStr);
            const it2 = item.item;
            lineLen = it2 === null ? 0 : rsWidth(it2);
          }
        } else {
          result.add(" ");
        }
      }
      st.itemMaxWidth = -1;
    }
    if (separate && sepPlace === SP_FRONT && !first) {
      result.add(rsTrim(f.separator) + " ");
    }
    result.add(innerItem);
    const post = item.post;
    if (tactic === DLT_HORIZONTAL && post !== null) {
      const formatted = rsRewriteComment(post, rsShapeLegacy(f.shape.width, 0, 0), f.cfg);
      if (formatted === null) {
        return null;
      }
      result.add(" " + formatted);
    }
    if (separate && sepPlace === SP_BACK) {
      result.add(f.separator);
    }
    if (tactic !== DLT_HORIZONTAL && post !== null) {
      const comment = post;
      const overhead = rsLastLineWidth(result.lastLine(), f.cfg.tabSpaces) + rsFirstLineWidth(rsTrim(comment));
      const formatted0 = rewritePostComment(st, items, i, last, innerItem, comment, overhead, itemLastLineWidth, f);
      if (formatted0 === null) {
        return null;
      }
      let formatted = formatted0;
      if (!startsWithNewline(comment)) {
        if (f.alignComments) {
          let align = postCommentAlignment(st.itemMaxWidth, rsWidth(innerItem));
          if (
            rsFirstLineWidth(formatted) + rsLastLineWidth(result.lastLine(), f.cfg.tabSpaces) + align + 1 >
            f.cfg.maxWidth
          ) {
            st.itemMaxWidth = -1;
            const formatted1 = rewritePostComment(
              st,
              items,
              i,
              last,
              innerItem,
              comment,
              overhead,
              itemLastLineWidth,
              f,
            );
            if (formatted1 === null) {
              return null;
            }
            formatted = formatted1;
            align = postCommentAlignment(st.itemMaxWidth, rsWidth(innerItem));
          }
          for (let k = 0; k <= align; k++) {
            result.add(" ");
          }
        }
        if (!f.alignComments || (last && st.itemMaxWidth >= 0 && !separate && f.separator.length !== 0)) {
          result.add(" ");
        }
      } else {
        result.add("\n" + indentStr);
      }
      if (rsHasByte(formatted, 10)) {
        st.itemMaxWidth = -1;
      }
      result.add(formatted);
    } else {
      st.itemMaxWidth = -1;
    }
    if (f.preserveNewline && !last && tactic === DLT_VERTICAL && item.newLines) {
      st.itemMaxWidth = -1;
      result.add("\n");
    }
    prevItemHadPostComment = post !== null;
    prevItemIsNestedImport = innerItem.indexOf("::") >= 0;
  }
  return result.str();
};

const postCommentAlignment = (itemMaxWidth: i32, innerWidth: i32): i32 => {
  const m = itemMaxWidth < 0 ? 0 : itemMaxWidth;
  const r = m - innerWidth;
  return r < 0 ? 0 : r;
};

/** extract_pre_comment: sets `it.pre` and `it.preStyle`. */
export const rsExtractPreComment = (pre: string, it: RsListItem): void => {
  const t = rsTrim(pre);
  const startsBlock = t.startsWith("/*");
  const endsBlock = t.endsWith("*/");
  const startsLine = t.startsWith("//");
  if (endsBlock) {
    const ce = rsLastIndexOfByte(pre, 47);
    it.pre = t;
    it.preStyle = rsIndexOfByte(pre, 10, ce) >= 0 ? LCS_DIFFERENT_LINE : LCS_SAME_LINE;
  } else if (startsLine || startsBlock) {
    it.pre = t;
    it.preStyle = LCS_DIFFERENT_LINE;
  } else {
    it.pre = null;
    it.preStyle = LCS_NONE;
  }
};

const trimSpTab = (s: string): string => {
  const n = toI32(s.length);
  let a = 0;
  while (a < n && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) {
    a++;
  }
  let b = n;
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) {
    b--;
  }
  return s.slice(a, b);
};

/** extract_post_comment. */
export const rsExtractPostComment = (
  postSnippet: string,
  commentEnd: i32,
  separator: string,
  isLast: boolean,
): string | null => {
  const ps = rsTrim(postSnippet.slice(0, commentEnd));
  let lastInlineEndsWithSep = false;
  if (isLast) {
    const ls = rsLines(ps);
    if (ls.length > 0) {
      const line = ls[ls.length - 1];
      lastInlineEndsWithSep = line.endsWith(separator) && rsTrim(line).startsWith("//");
    }
  }
  let pt = "";
  const n = toI32(ps.length);
  if (ps.startsWith(",") || ps.startsWith(":")) {
    pt = trimSpTab(ps.slice(1, n));
  } else if (separator.length !== 0 && ps.startsWith(separator)) {
    pt = trimSpTab(ps.slice(toI32(separator.length), n));
  } else if (separator.length === 0 && ps.startsWith(separator)) {
    pt = trimSpTab(ps);
  } else if (lastInlineEndsWithSep) {
    pt = trimSpTab(ps);
  } else if (ps.endsWith(separator) && (!rsTrim(ps).startsWith("//") || rsHasByte(rsTrim(ps), 10))) {
    pt = trimSpTab(ps.slice(0, n - 1));
  } else {
    pt = ps;
  }
  const rn = rsTrim(pt);
  if (pt.length !== 0 && (rn.startsWith("//") || rn.startsWith("/*"))) {
    return pt;
  }
  return null;
};

/** get_comment_end. */
export const rsGetCommentEnd = (ps: string, separator: string, terminator: string, isLast: boolean): i32 => {
  const n = toI32(ps.length);
  if (isLast) {
    const k = rsFindUncommented(ps, terminator);
    return k < 0 ? n : k;
  }
  let blockOpen = ps.indexOf("/*");
  if (blockOpen >= 0) {
    const j = rsIndexOfByte(ps, 47, 0);
    if (j >= 0 && j < blockOpen) {
      blockOpen = -1;
    } else if (ps.slice(0, blockOpen).endsWith("/")) {
      blockOpen = -1;
    }
  }
  const nl = rsIndexOfByte(ps, 10, 0);
  const sepIdx = rsFindUncommented(ps, separator);
  if (sepIdx >= 0) {
    if (blockOpen >= 0 && nl < 0) {
      if (blockOpen > sepIdx) {
        return sepIdx + 1;
      }
      const ce = rsFindCommentEnd(ps.slice(blockOpen, n));
      const a = (ce < 0 ? 0 : ce) + blockOpen;
      return a > sepIdx + 1 ? a : sepIdx + 1;
    }
    if (blockOpen >= 0 && nl >= 0 && blockOpen < nl) {
      const ce = rsFindCommentEnd(ps.slice(blockOpen, n));
      const a = (ce < 0 ? 0 : ce) + blockOpen;
      return a > sepIdx + 1 ? a : sepIdx + 1;
    }
    if (nl >= 0 && nl > sepIdx) {
      return nl + 1;
    }
    return n;
  }
  if (nl >= 0) {
    return nl + 1;
  }
  return 0;
};

/** has_extra_newline. */
export const rsHasExtraNewline = (ps: string, commentEnd: i32): boolean => {
  if (ps.length === 0 || commentEnd === 0) {
    return false;
  }
  // The last char before commentEnd.
  let lastStart = commentEnd - 1;
  while (lastStart > 0 && (ps.charCodeAt(lastStart) & 0xc0) === 0x80) {
    lastStart--;
  }
  let t = ps.slice(lastStart, toI32(ps.length));
  const fn = rsIndexOfByte(t, 10, 0);
  t = t.slice(fn < 0 ? toI32(t.length) : fn, toI32(t.length));
  let first = 0;
  const tn = toI32(t.length);
  while (first < tn) {
    const w = rsWsLenAt(t, first);
    if (w === 0) {
      break;
    }
    first += w;
  }
  return rsCountNewlines(t.slice(0, first)) > 1;
};

/**
 * itemize_list over `n` items: `lo(i)`, `hi(i)` and `str(i)` give each item's span and rewrite.
 * Items are the indices 0..n.
 */
export const rsItemizeList = (
  ctx: RsCtx,
  n: i32,
  terminator: string,
  separator: string,
  lo: (i: i32) => i32,
  hi: (i: i32) => i32,
  str: (i: i32) => string | null,
  prevSpanEnd0: i32,
  nextSpanStart: i32,
  leaveLast: boolean,
): RsListItem[] => {
  const out: RsListItem[] = [];
  let prevSpanEnd = prevSpanEnd0;
  for (let i = 0; i < n; i++) {
    const it = new RsListItem();
    const ilo = lo(i);
    const ihi = hi(i);
    const preSnippet = ctx.snippet(prevSpanEnd, ilo);
    rsExtractPreComment(preSnippet, it);
    const isLast = i === n - 1;
    const nextStart = isLast ? nextSpanStart : lo(i + 1);
    const postSnippet = ctx.snippet(ihi, nextStart);
    const commentEnd = rsGetCommentEnd(postSnippet, separator, terminator, isLast);
    it.newLines = rsHasExtraNewline(postSnippet, commentEnd);
    it.post = rsExtractPostComment(postSnippet, commentEnd, separator, isLast);
    prevSpanEnd = ihi + commentEnd;
    if (isLast && leaveLast) {
      it.item = null;
    } else {
      it.item = str(i);
    }
    out.push(it);
  }
  return out;
};

/** struct_lit_shape: [h_shape or null, v_shape]; null when it does not fit. */
export class RsShapePair {
  h: RsShape | null;
  v: RsShape;
  constructor(h: RsShape | null, v: RsShape) {
    this.h = h;
    this.v = v;
  }
}

export const rsStructLitShape = (shape: RsShape, ctx: RsCtx, prefixWidth: i32, suffixWidth: i32): RsShapePair => {
  const s = shape.blockIndent(ctx.cfg.tabSpaces);
  const v = s.withWidth(ctx.budget(s.iw()));
  let h: RsShape | null = null;
  if (prefixWidth + suffixWidth <= shape.width) {
    const w = shape.width - (prefixWidth + suffixWidth);
    h = rsShapeLegacy(w < ctx.cfg.structLitWidth ? w : ctx.cfg.structLitWidth, shape.bi, shape.al);
  }
  return new RsShapePair(h, v);
};

export const rsStructLitTactic = (h: RsShape | null, ctx: RsCtx, items: RsListItem[]): i32 => {
  if (h !== null) {
    return rsDefinitiveTactic(items, LT_HORIZONTAL_VERTICAL, SEP_COMMA, h.width);
  }
  return DLT_VERTICAL;
};

export const rsShapeForTactic = (tactic: i32, h: RsShape | null, v: RsShape): RsShape => {
  if (tactic === DLT_HORIZONTAL && h !== null) {
    return h;
  }
  return v;
};

export const rsStructLitFormatting = (
  shape: RsShape,
  tactic: i32,
  ctx: RsCtx,
  forceNoTrailingComma: boolean,
): RsListFormatting => {
  const f = new RsListFormatting(shape, ctx.cfg);
  f.tactic = tactic;
  f.separator = ",";
  f.trailingSeparator = forceNoTrailingComma ? ST_NEVER : ST_VERTICAL;
  f.separatorPlace = SP_BACK;
  f.endsWithNewline = tactic === DLT_VERTICAL;
  f.preserveNewline = true;
  f.nested = false;
  f.alignComments = true;
  return f;
};
