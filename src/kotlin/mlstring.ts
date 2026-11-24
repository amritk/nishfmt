// ktfmt's MultilineStringFormatter: a raw string with `.trimIndent()` or
// `.trimMargin()` called on it is re-indented to the column its `"""`
// starts at, its content lines moved so that trimming gives the same text.
// Strings with template expressions, nested strings and one-line strings
// are left alone. Works on the pretty printer's output, line by line.
//
// Ported from ktfmt 0.65's MultilineStringFormatter (Apache License 2.0,
// Copyright (c) Meta Platforms, Inc. and affiliates).

import { add32, atI32, atU8, sub32, utf16Len } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { stableSort } from "../core/sort";
import { KTree } from "./builder";
import { kIsComment } from "./input";
import { K_CONTINUATION_INDENT } from "./options";
import { N_DOT_QUALIFIED_EXPRESSION, N_SAFE_ACCESS_EXPRESSION, N_STRING_TEMPLATE, T_DOT, T_SAFE_ACCESS } from "./types";
import { kIsExpr } from "./visitor";

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
  // The comments between the string and its selector: src[comA[k], comB[k]).
  comA: i32[];
  comB: i32[];

  constructor() {
    this.comA = [];
    this.comB = [];
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
    // The pretty printer's output is the first n bytes of src.
    if (n < 0 || n > src.length) {
      fault();
      return false;
    }
    if (!kmMentionsTrim(src, n)) {
      return false;
    }
    this.ls = [];
    this.le = [];
    let a = 0;
    for (let i = 0; i < n && i < src.length; i++) {
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
    stableSort(order, (x: i32, y: i32): i32 => kmByOpenDesc(found, x, y));
    const starts: i32[] = [];
    const ends: i32[] = [];
    const texts: u8[][] = [];
    for (let q = 0; q < toI32(order.length); q++) {
      const o = order[q];
      if (o < 0 || o >= found.length) {
        fault();
        return false;
      }
      const s = found[o];
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
      if (q >= starts.length || q >= ends.length || q >= texts.length) {
        fault();
        return false;
      }
      const st = starts[q];
      const en = ends[q];
      const tx = texts[q];
      if (st > pos) {
        out.range(src, pos, st);
      }
      out.range(tx, 0, toI32(tx.length));
      if (en > pos) {
        pos = en;
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
    if (atI32(t.leaf, node) === 1) {
      return;
    }
    const ty = atI32(t.type, node);
    const inside = inString || ty === N_STRING_TEMPLATE;
    for (let c = kmFirst(t, node); c >= 0; c = kmNext(t, c)) {
      this.collect(c, inside);
    }
    if (ty !== N_DOT_QUALIFIED_EXPRESSION && ty !== N_SAFE_ACCESS_EXPRESSION) {
      return;
    }
    let receiver = -1;
    for (let c = kmFirst(t, node); c >= 0; c = kmNext(t, c)) {
      if (kIsExpr(atI32(t.type, c))) {
        receiver = c;
        break;
      }
    }
    if (receiver < 0 || atI32(t.type, receiver) !== N_STRING_TEMPLATE) {
      return;
    }
    let op = -1;
    let selector = -1;
    for (let c = kmNext(t, receiver); c >= 0; c = kmNext(t, c)) {
      const ct = atI32(t.type, c);
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
    const src = this.src;
    const s = new MlString();
    s.margin = margin;
    const rs = atI32(t.start, receiver);
    s.dollar = sub32(atI32(t.end, receiver), rs) >= 2 && atU8(src, rs) === 36 && atU8(src, add32(rs, 1)) === 36;
    s.open = rs;
    s.trimOffset = sub32(atI32(t.start, selector), 1);
    s.lineStart = this.countNewlines(s.open);
    s.lineEnd = this.countNewlines(s.trimOffset);
    // The whitespace the line starts with, up to the string (or a `"""` before it).
    let lineBegin = s.open;
    while (lineBegin > 0 && atU8(src, lineBegin - 1) !== 10) {
      lineBegin--;
    }
    let prefixEnd = s.open;
    const tq = kmIndexOfTq(src, lineBegin, s.open);
    if (tq >= 0) {
      prefixEnd = tq;
    }
    const ws = kmSkipWs(src, lineBegin, prefixEnd);
    s.indentCount = utf16Len(src, lineBegin, ws);
    for (let c = kmNext(t, receiver); c >= 0 && c !== selector; c = kmNext(t, c)) {
      if (kIsComment(atI32(t.type, c))) {
        const ca = atI32(t.start, c);
        const cb = atI32(t.end, c);
        // A node's range lies in the output.
        if (ca < 0 || cb < ca || cb > src.length) {
          fault();
          return;
        }
        s.comA.push(ca);
        s.comB.push(cb);
      }
    }
    s.nested = inString;
    this.found.push(s);
  }

  selectorStartsWith(sel: i32, prefix: string): boolean {
    const src = this.src;
    const e = atI32(this.t.end, sel);
    const a = kmSkipWs(src, atI32(this.t.start, sel), e);
    // A node's range lies in the output.
    if (a < 0 || e < 0 || e > src.length) {
      fault();
      return false;
    }
    const k = toI32(prefix.length);
    if (e - a < k) {
      return false;
    }
    let p = a;
    for (let i = 0; i < k; i++) {
      if (p >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[p]) !== prefix.charCodeAt(i)) {
        return false;
      }
      p++;
    }
    return true;
  }

  /** The number of newlines before `end`: the index of the line holding it. */
  countNewlines(end: i32): i32 {
    const ls = this.ls;
    let lo = 0;
    let hi = toI32(ls.length) - 1;
    while (lo < hi) {
      // lo and hi are line indices, below the output's length.
      if (lo < 0 || lo > 1073741823 || hi > 1073741823) {
        fault();
        return 0;
      }
      const mid = (lo + hi + 1) >> 1;
      if (mid < 0 || mid >= ls.length) {
        fault();
        return 0;
      }
      if (ls[mid] <= end) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** The replacement text's bytes, or null when the string is left as it is. */
  rewrite(s: MlString): u8[] | null {
    const src = this.src;
    const ls = this.ls;
    const le = this.le;
    const nl = add32(sub32(s.lineEnd, s.lineStart), 1);
    // lastStringLineIndex: the last line holding `"""`.
    let last = -1;
    for (let i = sub32(nl, 1); i >= 0; i--) {
      const L = add32(s.lineStart, i);
      if (kmIndexOfTq(src, atI32(ls, L), atI32(le, L)) >= 0) {
        last = i;
        break;
      }
    }
    if (last < 1) {
      return null;
    }
    for (let i = 0; i < nl; i++) {
      const L = add32(s.lineStart, i);
      if (kmHasTemplate(src, atI32(ls, L), atI32(le, L), s.dollar)) {
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
      const L = add32(s.lineStart, i);
      minimal = kmMinIndent(src, atI32(ls, L), atI32(le, L), minimal);
    }
    {
      const L = s.lineStart;
      const tqLast = kmLastIndexOfTq(src, atI32(ls, L), atI32(le, L));
      let from = atI32(ls, L);
      if (tqLast >= 0) {
        from = add32(tqLast, 3);
      }
      minimal = kmMinIndent(src, from, atI32(le, L), minimal);
      const M = add32(s.lineStart, last);
      const tqFirst = kmIndexOfTq(src, atI32(ls, M), atI32(le, M));
      minimal = kmMinIndent(src, atI32(ls, M), tqFirst >= 0 ? tqFirst : atI32(le, M), minimal);
    }
    // getStringContent: line k is src[contentA[k], contentB[k]).
    const contentA: i32[] = [];
    const contentB: i32[] = [];
    for (let i = 0; i < nl && i <= last; i++) {
      const L = add32(s.lineStart, i);
      let a = atI32(ls, L);
      let b = atI32(le, L);
      if (i === 0 || i === last) {
        if (i === 0) {
          const tq = kmIndexOfTq(src, a, b);
          if (tq >= 0) {
            a = add32(tq, 3);
          } else {
            a = b;
          }
        } else {
          const tq = kmLastIndexOfTq(src, a, b);
          b = tq >= 0 ? tq : b;
        }
        if (kmIsBlank(src, a, b)) {
          continue;
        }
      }
      contentA.push(this.trimmedStart(s, a, b, minimal));
      contentB.push(b);
    }
    const indentation = s.indentCount;
    const cont = K_CONTINUATION_INDENT;
    const m: u8[] = [];
    kmPushStr(m, s.dollar ? '$$"""\n' : '"""\n');
    let isLastLineEmpty = true;
    for (let i = 0; i < contentA.length && i < contentB.length; i++) {
      const ca = contentA[i];
      const cb = contentB[i];
      if (s.margin || cb > ca) {
        kmPushSpaces(m, indentation);
        if (s.margin) {
          kmPushStr(m, "|");
        }
      }
      kmPushRange(m, src, ca, cb);
      kmPushStr(m, "\n");
      isLastLineEmpty = cb <= ca;
    }
    if (s.margin && isLastLineEmpty) {
      // Drops the newline that ends m.
      if (m.length > 0) {
        m.pop();
      }
    } else {
      kmPushSpaces(m, indentation);
    }
    kmPushStr(m, '"""\n');
    for (let i = 0; i < s.comA.length && i < s.comB.length; i++) {
      const ca = s.comA[i];
      const cb = s.comB[i];
      kmPushSpaces(m, indentation);
      kmPushSpaces(m, cont);
      kmPushRange(m, src, ca, cb);
      kmPushStr(m, "\n");
    }
    kmPushSpaces(m, indentation);
    kmPushSpaces(m, cont);
    return m;
  }

  /** MultilineTrimmedString.trimmed for src[a, b): where the trimmed line starts (it ends at b). */
  trimmedStart(s: MlString, a: i32, b: i32, minimal: i32): i32 {
    const src = this.src;
    // A line's range lies in the output.
    if (a < 0 || b > src.length) {
      fault();
      return b;
    }
    if (!s.margin) {
      // drop(minimalIndent) characters.
      let p = a;
      let k = 0;
      while (p >= 0 && p < b && p < src.length && k < minimal) {
        const c = toI32(src[p]);
        let w = 1;
        if (c >= 0xf0) {
          w = 4;
        } else if (c >= 0xe0) {
          w = 3;
        } else if (c >= 0xc0) {
          w = 2;
        }
        // Past the end of i32 only after a fault.
        const q = add32(p, w);
        if (q <= p) {
          break;
        }
        p = q;
        k++;
      }
      return p < b ? p : b;
    }
    const p = kmSkipWs(src, a, b);
    if (p >= 0 && p < b && p < src.length && toI32(src[p]) === 124) {
      // substringAfter("|"): after the first bar of the line, which the bar
      // at p ends the search for.
      for (let q = a; q < b && q < src.length; q++) {
        if (toI32(src[q]) === 124) {
          return q + 1;
        }
      }
      fault();
      return b;
    }
    return a;
  }
}

/** sortedByDescending(open), stable: the comparator over indices into `found`. */
const kmByOpenDesc = (found: MlString[], x: i32, y: i32): i32 => {
  if (x < 0 || x >= found.length || y < 0 || y >= found.length) {
    fault();
    return 0;
  }
  const ox = found[x].open;
  const oy = found[y].open;
  if (ox !== oy) {
    return oy > ox ? 1 : -1;
  }
  return x > y ? 1 : x < y ? -1 : 0;
};

/** The first child of `node`, or -1 (after a fault when `node` is outside the tree). */
const kmFirst = (t: KTree, node: i32): i32 => {
  const first = t.first;
  if (node >= 0 && node < first.length) {
    return first[node];
  }
  fault();
  return -1;
};

/** The next sibling of `c`, or -1 (after a fault when `c` is outside the tree). */
const kmNext = (t: KTree, c: i32): i32 => {
  const next = t.next;
  if (c >= 0 && c < next.length) {
    return next[c];
  }
  fault();
  return -1;
};

/** Whether `trimIndent()` or `trimMargin()` occurs at all (most files skip the pass). */
const kmMentionsTrim = (src: u8[], n: i32): boolean => {
  if (n < 0 || n > src.length) {
    fault();
    return false;
  }
  // i + 12 <= n.
  const m = n - 11;
  for (let i = 0; i < m; i++) {
    if (i + 3 >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[i]) === 116 && toI32(src[i + 1]) === 114 && toI32(src[i + 2]) === 105 && toI32(src[i + 3]) === 109) {
      if (kmAt(src, i + 4, "Indent()") || kmAt(src, i + 4, "Margin()")) {
        return true;
      }
    }
  }
  return false;
};

const kmAt = (src: u8[], i: i32, s: string): boolean => {
  const k = toI32(s.length);
  let p = i;
  for (let j = 0; j < k; j++) {
    if (p < 0 || p >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[p]) !== s.charCodeAt(j)) {
      return false;
    }
    p++;
  }
  return true;
};

/**
 * The end of the Char.isWhitespace character at `i`, before `e`, or `i` when
 * there is none.
 */
const kmWsEnd = (src: u8[], i: i32, e: i32): i32 => {
  // Callers scan a line, inside the output.
  if (i < 0 || i >= e || e < 1 || e > src.length || i >= src.length) {
    fault();
    return i;
  }
  const c = toI32(src[i]);
  if (c === 32 || (c >= 9 && c <= 13) || (c >= 0x1c && c <= 0x1f)) {
    return i + 1;
  }
  if (c === 0xc2 && i < e - 1) {
    const d = toI32(src[i + 1]);
    return d === 0xa0 || d === 0x85 ? i + 2 : i;
  }
  if (c === 0xe1 && i < e - 2 && toI32(src[i + 1]) === 0x9a && toI32(src[i + 2]) === 0x80) {
    return i + 3;
  }
  if (c === 0xe2 && i < e - 2) {
    const d = toI32(src[i + 1]);
    const f = toI32(src[i + 2]);
    if (d === 0x80 && ((f >= 0x80 && f <= 0x8a) || f === 0xa8 || f === 0xa9 || f === 0xaf)) {
      return i + 3;
    }
    if (d === 0x81 && f === 0x9f) {
      return i + 3;
    }
  }
  if (c === 0xe3 && i < e - 2 && toI32(src[i + 1]) === 0x80 && toI32(src[i + 2]) === 0x80) {
    return i + 3;
  }
  return i;
};

/** The first offset from `a` that does not start whitespace before `b` (or `b`). */
const kmSkipWs = (src: u8[], a: i32, b: i32): i32 => {
  let p = a;
  while (p < b) {
    const q = kmWsEnd(src, p, b);
    if (q <= p) {
      break;
    }
    p = q;
  }
  return p;
};

const kmIsBlank = (src: u8[], a: i32, b: i32): boolean => kmSkipWs(src, a, b) >= b;

/** min(current, the indent level of src[a, b)), blank lines counting as no indent. */
const kmMinIndent = (src: u8[], a: i32, b: i32, current: i32): i32 => {
  let p = a;
  let k = 0;
  while (p < b) {
    const q = kmWsEnd(src, p, b);
    if (q <= p) {
      break;
    }
    // One step a byte at least, so k stays below p.
    if (k < 0 || k >= q) {
      fault();
      return current;
    }
    p = q;
    k++;
  }
  if (p >= b) {
    return current;
  }
  return k < current ? k : current;
};

const kmIndexOfTq = (src: u8[], a: i32, b: i32): i32 => {
  // A line's range lies in the output.
  if (a < 0 || b < 0 || b > src.length) {
    fault();
    return -1;
  }
  for (let i = a; i < b - 2 && i < src.length - 2; i++) {
    if (toI32(src[i]) === 34 && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
      return i;
    }
  }
  return -1;
};

const kmLastIndexOfTq = (src: u8[], a: i32, b: i32): i32 => {
  // A line's range lies in the output.
  if (a < 0 || b < 0 || b > src.length) {
    fault();
    return -1;
  }
  for (let i = b - 3; i >= a; i--) {
    if (i < 0 || i + 2 >= src.length) {
      fault();
      return -1;
    }
    if (toI32(src[i]) === 34 && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
      return i;
    }
  }
  return -1;
};

/** `\$((\{?[A-Za-z_\s])|\{$)` (with `$$` for a dollar string) anywhere in src[a, b). */
const kmHasTemplate = (src: u8[], a: i32, b: i32, dollar: boolean): boolean => {
  // A line's range lies in the output.
  if (a < 0 || b < 0 || b > src.length) {
    fault();
    return false;
  }
  let k = 1;
  if (dollar) {
    k = 2;
  }
  for (let i = a; i < b && i <= b - k; i++) {
    // The k dollars at i, and p after them.
    let p = i + 1;
    if (dollar) {
      if (i + 1 >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[i]) !== 36 || toI32(src[i + 1]) !== 36) {
        continue;
      }
      p = i + 2;
    } else if (toI32(src[i]) !== 36) {
      continue;
    }
    if (p < b && p < src.length && toI32(src[p]) === 123) {
      if (p + 1 === b) {
        return true;
      }
      p++;
    }
    if (p < b && p < src.length) {
      const c = toI32(src[p]);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 32 || (c >= 9 && c <= 13)) {
        return true;
      }
    }
  }
  return false;
};

/** Appends the bytes of `s` to `m`. */
const kmPushStr = (m: u8[], s: string): void => {
  for (let i = 0; i < toI32(s.length); i++) {
    m.push(toU8(s.charCodeAt(i)));
  }
};

/** Appends `k` spaces to `m`. */
const kmPushSpaces = (m: u8[], k: i32): void => {
  for (let i = 0; i < k; i++) {
    m.push(32);
  }
};

/** Appends src[a, b) to `m`; a range outside src faults and appends nothing. */
const kmPushRange = (m: u8[], src: u8[], a: i32, b: i32): void => {
  if (a < 0 || b < a || b > src.length) {
    fault();
    return;
  }
  for (let i = a; i < b && i < src.length; i++) {
    m.push(src[i]);
  }
};
