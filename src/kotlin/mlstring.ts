// ktfmt's MultilineStringFormatter: a raw string with `.trimIndent()` or
// `.trimMargin()` called on it is re-indented to the column its `"""`
// starts at, its content lines moved so that trimming gives the same text.
// Strings with template expressions, nested strings and one-line strings
// are left alone. Works on the pretty printer's output, line by line.
//
// Ported from ktfmt 0.65's MultilineStringFormatter (Apache License 2.0,
// Copyright (c) Meta Platforms, Inc. and affiliates).

import { Out } from "../core/out";
import { KTree } from "./builder";
import { kIsComment } from "./input";
import { N_DOT_QUALIFIED_EXPRESSION, N_SAFE_ACCESS_EXPRESSION, N_STRING_TEMPLATE, T_DOT, T_SAFE_ACCESS } from "./types";
import { kIsExpr } from "./visitor";

const CONTINUATION_INDENT: i32 = 4;
const NO_INDENT: i32 = 2147483647;

/** One `"""...""".trimX()` candidate. */
class MlString {
  margin: boolean = false;
  dollar: boolean = false;
  indentCount: i32 = 0;
  lineStart: i32 = 0;
  lineEnd: i32 = 0;
  open: i32 = 0;
  trimOffset: i32 = 0;
  nested: boolean = false;
  comments: string[];

  constructor() {
    this.comments = [];
  }
}

export class KMultilineStrings {
  t: KTree;
  src: u8[];
  n: i32 = 0;
  // Line i is src[ls[i], le[i]).
  ls: i32[];
  le: i32[];
  found: MlString[];

  constructor(t: KTree) {
    this.t = t;
    this.src = new Array<u8>(0);
    this.ls = [];
    this.le = [];
    this.found = [];
  }

  /** Rewrites src[0, n) into `out`; answers whether anything changed. */
  format(src: u8[], n: i32, out: Out): boolean {
    this.src = src;
    this.n = n;
    this.found = [];
    if (!kmMentionsTrim(src, n)) {
      return false;
    }
    this.ls = [];
    this.le = [];
    let a = 0;
    for (let i = 0; i < n; i++) {
      if (toI32(src[i]) === 10) {
        this.ls.push(a);
        this.le.push(i);
        a = i + 1;
      }
    }
    this.ls.push(a);
    this.le.push(n);
    this.collect(0, false);
    if (this.found.length === 0) {
      return false;
    }
    // sortedByDescending(openStringOffset), stable.
    const order: i32[] = [];
    for (let i = 0; i < toI32(this.found.length); i++) {
      order.push(i);
    }
    const found = this.found;
    order.sort((x: i32, y: i32): i32 => (found[y].open !== found[x].open ? found[y].open - found[x].open : x - y));
    const starts: i32[] = [];
    const ends: i32[] = [];
    const texts: string[] = [];
    for (let q = 0; q < toI32(order.length); q++) {
      const s = found[order[q]];
      const r = this.rewrite(s);
      if (r !== null) {
        starts.push(s.open);
        ends.push(s.trimOffset);
        texts.push(r);
      }
    }
    if (starts.length === 0) {
      return false;
    }
    out.n = 0;
    let pos = 0;
    for (let q = toI32(starts.length) - 1; q >= 0; q--) {
      if (starts[q] > pos) {
        out.range(src, pos, starts[q]);
      }
      out.str(texts[q]);
      if (ends[q] > pos) {
        pos = ends[q];
      }
    }
    if (pos < n) {
      out.range(src, pos, n);
    }
    return true;
  }

  /** Visits qualified expressions children first, as the KtTreeVisitorVoid override does. */
  collect(node: i32, inString: boolean): void {
    const t = this.t;
    if (t.leaf[node] === 1) {
      return;
    }
    const ty = t.type[node];
    const inside = inString || ty === N_STRING_TEMPLATE;
    for (let c = t.first[node]; c >= 0; c = t.next[c]) {
      this.collect(c, inside);
    }
    if (ty !== N_DOT_QUALIFIED_EXPRESSION && ty !== N_SAFE_ACCESS_EXPRESSION) {
      return;
    }
    let receiver = -1;
    for (let c = t.first[node]; c >= 0; c = t.next[c]) {
      if (kIsExpr(t.type[c])) {
        receiver = c;
        break;
      }
    }
    if (receiver < 0 || t.type[receiver] !== N_STRING_TEMPLATE) {
      return;
    }
    let op = -1;
    let selector = -1;
    for (let c = t.next[receiver]; c >= 0; c = t.next[c]) {
      const ct = t.type[c];
      if (op < 0 && (ct === T_DOT || ct === T_SAFE_ACCESS)) {
        op = c;
      } else if (op >= 0 && kIsExpr(ct)) {
        selector = c;
        break;
      }
    }
    const margin = selector >= 0 && this.selectorStartsWith(selector, "trimMargin()");
    const indent = selector >= 0 && this.selectorStartsWith(selector, "trimIndent()");
    if (!margin && !indent) {
      return;
    }
    const s = new MlString();
    s.margin = margin;
    s.dollar =
      t.end[receiver] - t.start[receiver] >= 2 &&
      toI32(this.src[t.start[receiver]]) === 36 &&
      toI32(this.src[t.start[receiver] + 1]) === 36;
    s.open = t.start[receiver];
    s.trimOffset = t.start[selector] - 1;
    s.lineStart = this.countNewlines(s.open);
    s.lineEnd = this.countNewlines(s.trimOffset);
    // The whitespace the line starts with, up to the string (or a `"""` before it).
    let lineBegin = s.open;
    while (lineBegin > 0 && toI32(this.src[lineBegin - 1]) !== 10) {
      lineBegin--;
    }
    let prefixEnd = s.open;
    const tq = kmIndexOfTq(this.src, lineBegin, s.open);
    if (tq >= 0) {
      prefixEnd = tq;
    }
    let ws = lineBegin;
    while (ws < prefixEnd) {
      const w = kmWsLen(this.src, ws, prefixEnd);
      if (w === 0) {
        break;
      }
      ws += w;
    }
    s.indentCount = kmChars(this.src, lineBegin, ws);
    for (let c = t.next[receiver]; c >= 0 && c !== selector; c = t.next[c]) {
      if (kIsComment(t.type[c])) {
        s.comments.push(String.fromBytes(this.src, t.start[c], t.end[c]));
      }
    }
    s.nested = inString;
    this.found.push(s);
  }

  selectorStartsWith(sel: i32, prefix: string): boolean {
    let a = this.t.start[sel];
    const e = this.t.end[sel];
    while (a < e && kmWsLen(this.src, a, e) > 0) {
      a += kmWsLen(this.src, a, e);
    }
    const k = toI32(prefix.length);
    if (e - a < k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== prefix.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** The number of newlines before `end`: the index of the line holding it. */
  countNewlines(end: i32): i32 {
    let lo = 0;
    let hi = toI32(this.ls.length) - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.ls[mid] <= end) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** The replacement text, or null when the string is left as it is. */
  rewrite(s: MlString): string | null {
    const src = this.src;
    const nl = s.lineEnd - s.lineStart + 1;
    // lastStringLineIndex: the last line holding `"""`.
    let last = -1;
    for (let i = nl - 1; i >= 0; i--) {
      const L = s.lineStart + i;
      if (kmIndexOfTq(src, this.ls[L], this.le[L]) >= 0) {
        last = i;
        break;
      }
    }
    if (last + 1 < 2) {
      return null;
    }
    for (let i = 0; i < nl; i++) {
      const L = s.lineStart + i;
      if (kmHasTemplate(src, this.ls[L], this.le[L], s.dollar)) {
        return null;
      }
    }
    if (s.nested) {
      return null;
    }
    // minimalIndent over the inner lines, the first line after its last `"""`
    // and the last line before its first `"""`.
    let minimal = NO_INDENT;
    for (let i = 1; i < last; i++) {
      const L = s.lineStart + i;
      minimal = kmMinIndent(src, this.ls[L], this.le[L], minimal);
    }
    {
      const L = s.lineStart;
      const tqLast = kmLastIndexOfTq(src, this.ls[L], this.le[L]);
      minimal = kmMinIndent(src, tqLast >= 0 ? tqLast + 3 : this.ls[L], this.le[L], minimal);
      const M = s.lineStart + last;
      const tqFirst = kmIndexOfTq(src, this.ls[M], this.le[M]);
      minimal = kmMinIndent(src, this.ls[M], tqFirst >= 0 ? tqFirst : this.le[M], minimal);
    }
    // getStringContent.
    const content: string[] = [];
    for (let i = 0; i <= last; i++) {
      const L = s.lineStart + i;
      let a = this.ls[L];
      let b = this.le[L];
      if (i === 0 || i === last) {
        if (i === 0) {
          const tq = kmIndexOfTq(src, a, b);
          a = tq >= 0 ? tq + 3 : b;
        } else {
          const tq = kmLastIndexOfTq(src, a, b);
          b = tq >= 0 ? tq : b;
        }
        if (kmIsBlank(src, a, b)) {
          continue;
        }
      }
      content.push(this.trimmed(s, a, b, minimal));
    }
    const indentation = kmSpaces(s.indentCount);
    const cont = kmSpaces(CONTINUATION_INDENT);
    let m = s.dollar ? '$$"""\n' : '"""\n';
    let isLastLineEmpty = true;
    for (let i = 0; i < toI32(content.length); i++) {
      const lc = content[i];
      if (s.margin || lc.length > 0) {
        m = m + indentation + (s.margin ? "|" : "");
      }
      m = `${m}${lc}\n`;
      isLastLineEmpty = lc.length === 0;
    }
    if (s.margin && isLastLineEmpty) {
      m = m.substring(0, toI32(m.length) - 1);
    } else {
      m = m + indentation;
    }
    m = `${m}"""\n`;
    for (let i = 0; i < toI32(s.comments.length); i++) {
      m = `${m}${indentation}${cont}${s.comments[i]}\n`;
    }
    return m + indentation + cont;
  }

  /** MultilineTrimmedString.trimmed for src[a, b). */
  trimmed(s: MlString, a: i32, b: i32, minimal: i32): string {
    const src = this.src;
    if (!s.margin) {
      // drop(minimalIndent) characters.
      let p = a;
      let k = 0;
      while (p < b && k < minimal) {
        p += kmCharLen(toI32(src[p]));
        k++;
      }
      return String.fromBytes(src, p < b ? p : b, b);
    }
    let p = a;
    while (p < b && kmWsLen(src, p, b) > 0) {
      p += kmWsLen(src, p, b);
    }
    if (p < b && toI32(src[p]) === 124) {
      // substringAfter("|"): after the first bar of the line.
      let q = a;
      while (toI32(src[q]) !== 124) {
        q++;
      }
      return String.fromBytes(src, q + 1, b);
    }
    return String.fromBytes(src, a, b);
  }
}

/** Whether `trimIndent()` or `trimMargin()` occurs at all (most files skip the pass). */
const kmMentionsTrim = (src: u8[], n: i32): boolean => {
  for (let i = 0; i + 12 <= n; i++) {
    if (toI32(src[i]) === 116 && toI32(src[i + 1]) === 114 && toI32(src[i + 2]) === 105 && toI32(src[i + 3]) === 109) {
      if (kmAt(src, i + 4, "Indent()") || kmAt(src, i + 4, "Margin()")) {
        return true;
      }
    }
  }
  return false;
};

const kmAt = (src: u8[], i: i32, s: string): boolean => {
  for (let j = 0; j < toI32(s.length); j++) {
    if (toI32(src[i + j]) !== s.charCodeAt(j)) {
      return false;
    }
  }
  return true;
};

const kmCharLen = (c: i32): i32 => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/** The characters (UTF-16 units) in src[a, b). */
const kmChars = (src: u8[], a: i32, b: i32): i32 => {
  let n = 0;
  for (let i = a; i < b; i++) {
    const c = toI32(src[i]);
    if (c < 0x80 || c >= 0xc0) {
      n += c >= 0xf0 ? 2 : 1;
    }
  }
  return n;
};

/** The byte length of the Char.isWhitespace character at `i`, or 0. */
const kmWsLen = (src: u8[], i: i32, e: i32): i32 => {
  const c = toI32(src[i]);
  if (c === 32 || (c >= 9 && c <= 13) || (c >= 0x1c && c <= 0x1f)) {
    return 1;
  }
  if (c === 0xc2 && i + 1 < e) {
    const d = toI32(src[i + 1]);
    return d === 0xa0 || d === 0x85 ? 2 : 0;
  }
  if (c === 0xe1 && i + 2 < e && toI32(src[i + 1]) === 0x9a && toI32(src[i + 2]) === 0x80) {
    return 3;
  }
  if (c === 0xe2 && i + 2 < e) {
    const d = toI32(src[i + 1]);
    const f = toI32(src[i + 2]);
    if (d === 0x80 && ((f >= 0x80 && f <= 0x8a) || f === 0xa8 || f === 0xa9 || f === 0xaf)) {
      return 3;
    }
    if (d === 0x81 && f === 0x9f) {
      return 3;
    }
  }
  if (c === 0xe3 && i + 2 < e && toI32(src[i + 1]) === 0x80 && toI32(src[i + 2]) === 0x80) {
    return 3;
  }
  return 0;
};

const kmIsBlank = (src: u8[], a: i32, b: i32): boolean => {
  let p = a;
  while (p < b) {
    const w = kmWsLen(src, p, b);
    if (w === 0) {
      return false;
    }
    p += w;
  }
  return true;
};

/** min(current, the indent level of src[a, b)), blank lines counting as no indent. */
const kmMinIndent = (src: u8[], a: i32, b: i32, current: i32): i32 => {
  let p = a;
  let k = 0;
  while (p < b) {
    const w = kmWsLen(src, p, b);
    if (w === 0) {
      break;
    }
    p += w;
    k++;
  }
  if (p >= b) {
    return current;
  }
  return k < current ? k : current;
};

const kmIndexOfTq = (src: u8[], a: i32, b: i32): i32 => {
  for (let i = a; i + 2 < b; i++) {
    if (toI32(src[i]) === 34 && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
      return i;
    }
  }
  return -1;
};

const kmLastIndexOfTq = (src: u8[], a: i32, b: i32): i32 => {
  for (let i = b - 3; i >= a; i--) {
    if (toI32(src[i]) === 34 && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
      return i;
    }
  }
  return -1;
};

/** `\$((\{?[A-Za-z_\s])|\{$)` (with `$$` for a dollar string) anywhere in src[a, b). */
const kmHasTemplate = (src: u8[], a: i32, b: i32, dollar: boolean): boolean => {
  const k = dollar ? 2 : 1;
  for (let i = a; i + k <= b; i++) {
    let ok = true;
    for (let j = 0; j < k; j++) {
      if (toI32(src[i + j]) !== 36) {
        ok = false;
      }
    }
    if (!ok) {
      continue;
    }
    let p = i + k;
    if (p < b && toI32(src[p]) === 123) {
      if (p + 1 === b) {
        return true;
      }
      p++;
    }
    if (p < b) {
      const c = toI32(src[p]);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 32 || (c >= 9 && c <= 13)) {
        return true;
      }
    }
  }
  return false;
};

const kmSpaces = (k: i32): string => {
  let s = "";
  for (let i = 0; i < k; i++) {
    s = `${s} `;
  }
  return s;
};
