// google-java-format's StringWrapper, run on the formatted text: a string
// literal on a line past 100 columns is split at word boundaries into a `+`
// chain, and text blocks are re-indented. Before that, the ranges to replace
// are formatted again (`partial.ts`), and when that changes the text the
// replacements are found again on the new text.
//
// Ported from google-java-format 1.28 (Apache License 2.0, Copyright 2018 Google Inc.).

import { utf16Len, strUtf16Len } from "../core/arr";
import { Out } from "../core/out";
import { GInput } from "../gdoc/input";
import { JTree, LIT_STRING, N_BINARY, N_LITERAL, N_MEMBER_SELECT, OP_PLUS } from "./ast";

const COLUMN_LIMIT: i32 = 100;

const isSwWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/** The byte length of a Guava CharMatcher.whitespace() character at `i` (non-ASCII ones too), or 0. */
const guavaWsLen = (s: string, i: i32): i32 => {
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return isSwWs(c) ? 1 : 0;
  }
  const n = toI32(s.length);
  const c1 = i + 1 < n ? s.charCodeAt(i + 1) : 0;
  if (c === 0xc2 && (c1 === 0x85 || c1 === 0xa0)) {
    return 2;
  }
  if (i + 2 >= n) {
    return 0;
  }
  const c2 = s.charCodeAt(i + 2);
  if (c === 0xe1 && c1 === 0x9a && c2 === 0x80) {
    return 3; // U+1680
  }
  if (c === 0xe2 && c1 === 0x80 && ((c2 >= 0x80 && c2 <= 0x8a) || c2 === 0xa8 || c2 === 0xa9 || c2 === 0xaf)) {
    return 3; // U+2000-200A, U+2028, U+2029, U+202F
  }
  if (c === 0xe2 && c1 === 0x81 && c2 === 0x9f) {
    return 3; // U+205F
  }
  if (c === 0xe3 && c1 === 0x80 && c2 === 0x80) {
    return 3; // U+3000
  }
  return 0;
};

export class Repl {
  start: i32 = 0;
  end: i32 = 0;
  text: string = "";
}

/** Whether any line is longer than the limit or holds a text block delimiter. */
export const needWrapping = (src: u8[], n: i32): boolean => {
  let a = 0;
  for (let i = 0; i <= n; i++) {
    if (i === n || toI32(src[i]) === 10 || toI32(src[i]) === 13) {
      if (utf16Len(src, a, i) > COLUMN_LIMIT) {
        return true;
      }
      a = i + 1;
    }
  }
  for (let i = 0; i + 2 < n; i++) {
    if (toI32(src[i]) === 34 && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
      return true;
    }
  }
  return false;
};

export class StringWrapper {
  inp: GInput;
  t: JTree;
  sep: string = "\n";
  isPlusChild: i32[];
  selected: i32[];

  constructor(inp: GInput, t: JTree) {
    this.inp = inp;
    this.t = t;
    this.isPlusChild = [];
    this.selected = [];
  }

  /** The column (0-based, tabs to multiples of 8 as javac's LineMap) of position `pos`. */
  private column(pos: i32): i32 {
    const src = this.inp.src;
    let a = pos;
    while (a > 0 && toI32(src[a - 1]) !== 10 && toI32(src[a - 1]) !== 13) {
      a--;
    }
    let col = 0;
    for (let i = a; i < pos; i++) {
      const c = toI32(src[i]);
      if (c === 9) {
        col = (col / 8) * 8 + 8;
      } else if (c < 0x80 || c >= 0xc0) {
        col += c >= 0xf0 ? 2 : 1;
      }
    }
    return col;
  }

  private lineEnd(pos: i32): i32 {
    const src = this.inp.src;
    let e = pos;
    while (e < this.inp.n && toI32(src[e]) !== 10 && toI32(src[e]) !== 13) {
      e++;
    }
    return e;
  }

  private isStringLit(x: i32): boolean {
    return this.t.kind[x] === N_LITERAL && this.t.op[x] === LIT_STRING;
  }

  private isTextBlock(x: i32): boolean {
    const src = this.inp.src;
    const p = this.t.start[x];
    return p + 2 < this.inp.n && toI32(src[p]) === 34 && toI32(src[p + 1]) === 34 && toI32(src[p + 2]) === 34;
  }

  /** Reflower.getReflowReplacements for the parsed text, in the order they are put. */
  replacements(sep: string): Repl[] {
    const t = this.t;
    this.sep = sep;
    const nn = t.n;
    this.isPlusChild = new Array<i32>(nn);
    this.selected = new Array<i32>(nn);
    for (let x = 0; x < nn; x++) {
      if (t.kind[x] === N_BINARY && t.op[x] === OP_PLUS) {
        this.isPlusChild[t.a[x]] = x + 1;
        this.isPlusChild[t.b[x]] = x + 1;
      } else if (t.kind[x] === N_MEMBER_SELECT && t.a[x] >= 0) {
        this.selected[t.a[x]] = 1;
      }
    }
    const repls: Repl[] = [];
    // Text blocks first, in tree order; then the long strings.
    const longs: i32[] = [];
    for (let x = 0; x < nn; x++) {
      if (!this.isStringLit(x)) {
        continue;
      }
      if (this.isTextBlock(x)) {
        repls.push(this.indentTextBlock(x));
        continue;
      }
      if (this.selected[x] === 1) {
        continue;
      }
      const le = this.lineEnd(t.end[x]);
      if (this.column(le) <= COLUMN_LIMIT) {
        continue;
      }
      longs.push(x);
    }
    for (const x of longs) {
      repls.push(this.wrapLong(x));
    }
    return repls;
  }

  /** applyReplacements: writes the parsed text with `repls` applied into `out`. */
  apply(repls: Repl[], out: Out): void {
    // A TreeRangeMap: a later put of a range overrides what it overlaps.
    // Sort by start; equal ranges keep the later one.
    const keep: Repl[] = [];
    for (const r of repls) {
      let replaced = false;
      for (let i = 0; i < toI32(keep.length); i++) {
        if (keep[i].start === r.start && keep[i].end === r.end) {
          keep[i] = r;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        keep.push(r);
      }
    }
    for (let i = 1; i < toI32(keep.length); i++) {
      const x = keep[i];
      let j = i - 1;
      while (j >= 0 && keep[j].start > x.start) {
        keep[j + 1] = keep[j];
        j--;
      }
      keep[j + 1] = x;
    }
    const src = this.inp.src;
    out.n = 0;
    let at = 0;
    for (const r of keep) {
      if (r.start < at) {
        continue;
      }
      out.range(src, at, r.start);
      out.str(r.text);
      at = r.end;
    }
    out.range(src, at, this.inp.n);
  }

  private wrapLong(lit: i32): Repl {
    const t = this.t;
    // The enclosing `+` chain.
    let enclosing = lit;
    while (this.isPlusChild[enclosing] > 0) {
      enclosing = this.isPlusChild[enclosing] - 1;
    }
    // Flatten.
    const flat: i32[] = [];
    const todo: i32[] = [enclosing]; // a stack: last is first
    while (todo.length > 0) {
      const f = todo.pop();
      if (t.kind[f] === N_BINARY && t.op[f] === OP_PLUS) {
        todo.push(t.b[f]);
        todo.push(t.a[f]);
      } else {
        flat.push(f);
      }
    }
    let idx = 0;
    for (let i = 0; i < toI32(flat.length); i++) {
      if (flat[i] === lit) {
        idx = i;
      }
    }
    let startIdx = idx;
    let endIdx = idx + 1;
    while (
      startIdx > 0 &&
      this.isStringLit(flat[startIdx - 1]) &&
      this.noComments(flat[startIdx - 1], flat[startIdx])
    ) {
      startIdx--;
    }
    while (
      endIdx < toI32(flat.length) &&
      this.isStringLit(flat[endIdx]) &&
      this.noComments(flat[endIdx - 1], flat[endIdx])
    ) {
      endIdx++;
    }
    const first = startIdx === 0;
    const firstNode = flat[startIdx];
    const lastNode = flat[endIdx - 1];
    const startColumn = this.column(t.start[firstNode]);
    const end = t.end[lastNode];
    const le = this.lineEnd(end);
    const trailing = utf16Len(this.inp.src, end, le);
    const comps = this.components(flat, startIdx, endIdx);
    const r = new Repl();
    r.start = t.start[firstNode];
    r.end = end;
    r.text = reflowStr(this.sep, COLUMN_LIMIT, startColumn, trailing, comps, first);
    return r;
  }

  /** STRING_CONCAT_DELIMITER.matchesAllOf(between): only whitespace, quotes and `+`. */
  private noComments(one: i32, two: i32): boolean {
    const src = this.inp.src;
    for (let i = this.t.end[one]; i < this.t.start[two]; i++) {
      const c = toI32(src[i]);
      if (!isSwWs(c) && c !== 34 && c !== 43) {
        return false;
      }
    }
    return true;
  }

  private components(flat: i32[], a: i32, b: i32): string[] {
    const t = this.t;
    const src = this.inp.src;
    const result: string[] = [];
    let piece = "";
    for (let q = a; q < b; q++) {
      const x = flat[q];
      const text = String.fromBytes(src, t.start[x] + 1, t.end[x] - 1);
      const n = toI32(text.length);
      let start = 0;
      for (let idx = 0; idx < n; idx++) {
        const c = text.charCodeAt(idx);
        if (guavaWsLen(text, idx) > 0) {
          // split before
        } else if (c === 92 && idx + 1 < n && text.charCodeAt(idx + 1) === 116) {
          // an escaped tab
        } else if (escapedNewlineAt(text, idx) !== -1) {
          let len = escapedNewlineAt(text, idx);
          while (len !== -1) {
            idx += len;
            len = escapedNewlineAt(text, idx);
          }
        } else {
          continue;
        }
        piece = piece + text.substring(start, idx);
        result.push(piece);
        piece = "";
        start = idx;
      }
      if (piece.length > 0) {
        result.push(piece);
        piece = "";
      }
      if (start < n) {
        piece = piece + text.substring(start, n);
      }
    }
    if (piece.length > 0) {
      result.push(piece);
    }
    return result;
  }

  private indentTextBlock(x: i32): Repl {
    const t = this.t;
    const src = this.inp.src;
    let lineStart = t.start[x];
    while (lineStart > 0 && toI32(src[lineStart - 1]) !== 10 && toI32(src[lineStart - 1]) !== 13) {
      lineStart--;
    }
    const end = t.end[x];
    const text = String.fromBytes(src, lineStart, end);
    let leadingWhitespace = 0;
    while (leadingWhitespace < toI32(text.length) && isSwWs(text.charCodeAt(leadingWhitespace))) {
      leadingWhitespace++;
    }
    const initialLines = javaLines(text);
    // stripIndent over the lines after the first.
    const rest: string[] = [];
    for (let i = 1; i < toI32(initialLines.length); i++) {
      rest.push(initialLines[i]);
    }
    const lines = stripIndentLines(rest);
    const lastInitial = stripTrailingJ(initialLines[initialLines.length - 1]);
    const lastStripped = lines.length > 0 ? stripTrailingJ(lines[lines.length - 1]) : "";
    const deindent = strUtf16Len(lastInitial) === strUtf16Len(lastStripped);
    let prefix = "";
    if (!deindent) {
      for (let i = 0; i < leadingWhitespace; i++) {
        prefix = `${prefix} `;
      }
    }
    let o = prefix + stripLeadingJ(initialLines[0]);
    for (let i = 0; i < toI32(lines.length); i++) {
      const line = lines[i];
      const trimmed = stripTrailingJ(line);
      o = o + this.sep;
      if (trimmed.length > 0) {
        o = o + prefix;
      }
      if (i === toI32(lines.length) - 1) {
        const withoutDelimiter = stripTrailingJ(trimmed.substring(0, toI32(trimmed.length) - 3));
        if (stripLeadingJ(withoutDelimiter).length > 0) {
          o = `${o}${withoutDelimiter}\\${this.sep}${prefix}`;
        }
        o = `${o}"""`;
      } else {
        o = o + line;
      }
    }
    const r = new Repl();
    r.start = lineStart;
    r.end = end;
    r.text = o;
    return r;
  }
}

/** The keys of the TreeRangeMap the replacements are put into, as [start, end) pairs in order: a later range splits what it overlaps. */
export const replacementRanges = (repls: Repl[]): i32[] => {
  let ks: i32[] = [];
  for (const r of repls) {
    if (r.start >= r.end) {
      continue;
    }
    const nk: i32[] = [];
    for (let i = 0; i + 1 < toI32(ks.length); i += 2) {
      const s = ks[i];
      const e = ks[i + 1];
      if (e <= r.start || s >= r.end) {
        nk.push(s);
        nk.push(e);
        continue;
      }
      if (s < r.start) {
        nk.push(s);
        nk.push(r.start);
      }
      if (e > r.end) {
        nk.push(r.end);
        nk.push(e);
      }
    }
    // Insert in order.
    let at = 0;
    while (at < toI32(nk.length) && nk[at] < r.start) {
      at += 2;
    }
    const sorted: i32[] = [];
    for (let i = 0; i < at; i++) {
      sorted.push(nk[i]);
    }
    sorted.push(r.start);
    sorted.push(r.end);
    for (let i = at; i < toI32(nk.length); i++) {
      sorted.push(nk[i]);
    }
    ks = sorted;
  }
  return ks;
};

const escapedNewlineAt = (s: string, idx: i32): i32 => {
  let off = 0;
  const n = toI32(s.length);
  if (idx + 1 < n && s.charCodeAt(idx) === 92 && s.charCodeAt(idx + 1) === 114) {
    off += 2;
  }
  if (idx + off + 1 < n && s.charCodeAt(idx + off) === 92 && s.charCodeAt(idx + off + 1) === 110) {
    off += 2;
  }
  return off > 0 ? off : -1;
};

const totalLengthLessThanOrEqual = (input: string[], from: i32, length: i32): boolean => {
  let total = 0;
  for (let i = from; i < toI32(input.length); i++) {
    total += strUtf16Len(input[i]);
    if (total > length) {
      return false;
    }
  }
  return true;
};

/** StringWrapper.reflow. */
const reflowStr = (
  sep: string,
  columnLimit: i32,
  startColumn: i32,
  trailing: i32,
  comps: string[],
  first0: boolean,
): string => {
  let width = columnLimit - startColumn - 2;
  let i = 0;
  const n = toI32(comps.length);
  const lines: string[] = [];
  let first = first0;
  while (i < n) {
    let length = 0;
    let line = "";
    let count = 0;
    if (totalLengthLessThanOrEqual(comps, i, width)) {
      width -= trailing;
    }
    while (i < n && (length <= 4 || length + strUtf16Len(comps[i]) <= width)) {
      const text = comps[i];
      i++;
      line = line + text;
      count++;
      length += strUtf16Len(text);
      if (text.endsWith("\\n") || text.endsWith("\\r")) {
        break;
      }
    }
    if (count === 0) {
      line = comps[i];
      i++;
    }
    lines.push(line);
    if (first) {
      width -= 6;
      first = false;
    }
  }
  let ind = "";
  const k = startColumn + (first0 ? 4 : -2);
  for (let q = 0; q < k; q++) {
    ind = `${ind} `;
  }
  const joiner = `"${sep}${ind}+ "`;
  return `"${lines.join(joiner)}"`;
};

/** String.lines(): split at \n, \r, \r\n; no empty last line. */
const javaLines = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 10 || c === 13) {
      out.push(s.substring(a, i));
      if (c === 13 && i + 1 < n && s.charCodeAt(i + 1) === 10) {
        i++;
      }
      a = i + 1;
    }
  }
  if (a < n) {
    out.push(s.substring(a, n));
  }
  return out;
};

const stripTrailingJ = (s: string): string => {
  let b = toI32(s.length);
  while (b > 0 && isSwWs(s.charCodeAt(b - 1))) {
    b--;
  }
  return s.substring(0, b);
};

const stripLeadingJ = (s: string): string => {
  let a = 0;
  while (a < toI32(s.length) && isSwWs(s.charCodeAt(a))) {
    a++;
  }
  return s.substring(a, toI32(s.length));
};

/** String.stripIndent over lines joined without a trailing terminator, split again. */
const stripIndentLines = (lines: string[]): string[] => {
  let min = 2147483647;
  for (let i = 0; i < toI32(lines.length); i++) {
    const l = lines[i];
    let k = 0;
    while (k < toI32(l.length) && isSwWs(l.charCodeAt(k))) {
      k++;
    }
    const blank = k === toI32(l.length);
    if (!blank || i === toI32(lines.length) - 1) {
      if (k < min) {
        min = k;
      }
    }
  }
  if (min === 2147483647) {
    min = 0;
  }
  const out: string[] = [];
  for (const l of lines) {
    let k = 0;
    while (k < toI32(l.length) && isSwWs(l.charCodeAt(k))) {
      k++;
    }
    if (k === toI32(l.length)) {
      out.push("");
    } else {
      out.push(stripTrailingJ(l.substring(min, toI32(l.length))));
    }
  }
  return out;
};
