// google-java-format's StringWrapper, run on the formatted text: a string
// literal on a line past 100 columns is split at word boundaries into a `+`
// chain. Before that, the ranges to replace are formatted again
// (`partial.ts`), and when that changes the text the replacements are found
// again on the new text. (Text blocks are indented by the formatter itself;
// the String.lines and stripIndent helpers here serve its visitTextBlock.)
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2019 Google Inc.).

import { add32, atI32, bytesText, newBools, newI32s, newStrs, strUtf16Len, sub32, utf16Len } from "../core/arr";
import { fault, faulted } from "../core/fault";
import { stableSort } from "../core/sort";
import { Out } from "../core/out";
import { GInput } from "../gdoc/input";
import { JTree, LIT_STRING, N_BINARY, N_LITERAL, N_MEMBER_SELECT, OP_PLUS } from "./ast";

const COLUMN_LIMIT: i32 = 100;

const isSwWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/** The byte length of a Guava CharMatcher.whitespace() character at `i` (non-ASCII ones too), or 0. */
const guavaWsLen = (s: string, i: i32): i32 => {
  if (i < 0 || i >= s.length) {
    fault();
    return 0;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return isSwWs(c) ? 1 : 0;
  }
  const i1 = i + 1;
  let c1 = 0;
  if (i1 < s.length) {
    c1 = s.charCodeAt(i1);
  }
  if (c === 0xc2 && (c1 === 0x85 || c1 === 0xa0)) {
    return 2;
  }
  if (i1 >= s.length) {
    return 0;
  }
  const i2 = i1 + 1;
  if (i2 >= s.length) {
    return 0;
  }
  const c2 = s.charCodeAt(i2);
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
  if (n > src.length) {
    fault();
    return false;
  }
  let a = 0;
  for (let i = 0; i < n && i < src.length; i++) {
    const c = toI32(src[i]);
    if (c === 10 || c === 13) {
      if (utf16Len(src, a, i) > COLUMN_LIMIT) {
        return true;
      }
      a = i + 1;
    }
  }
  // The last line, which ends at n.
  return n >= 0 && utf16Len(src, a, n) > COLUMN_LIMIT;
};

export class StringWrapper {
  inp: GInput;
  t: JTree;
  sep: string = "\n";
  isPlusChild: i32[];
  selected: i32[];
  // Each string literal's text, made once a pass: wrapLong reads every
  // literal of a concatenation again for each long one in it.
  litText: string[] = [];
  litHave: boolean[] = [];

  constructor(inp: GInput, t: JTree) {
    this.inp = inp;
    this.t = t;
    this.isPlusChild = [];
    this.selected = [];
  }

  /** Reflower.visualColumn: the 0-based column of `pos`, in UTF-16 units (a tab is one, without --use-tabs). */
  private column(pos: i32): i32 {
    const src = this.inp.src;
    let a = pos;
    while (a > 0) {
      const p = a - 1;
      if (p >= src.length) {
        fault();
        return 0;
      }
      const c = toI32(src[p]);
      if (c === 10 || c === 13) {
        break;
      }
      a = p;
    }
    return utf16Len(src, a, pos);
  }

  private lineEnd(pos: i32): i32 {
    const src = this.inp.src;
    const n = this.inp.n;
    let e = pos;
    while (e < n) {
      if (e < 0 || e >= src.length) {
        fault();
        return e;
      }
      const c = toI32(src[e]);
      if (c === 10 || c === 13) {
        break;
      }
      e++;
    }
    return e;
  }

  private isStringLit(x: i32): boolean {
    return atI32(this.t.kind, x) === N_LITERAL && atI32(this.t.op, x) === LIT_STRING;
  }

  private isTextBlock(x: i32): boolean {
    const src = this.inp.src;
    const p = atI32(this.t.start, x);
    // p is an offset in the text, far under 2147483632.
    if (p >= 2147483632) {
      fault();
      return false;
    }
    if (p + 2 >= this.inp.n) {
      return false;
    }
    if (p < 0) {
      fault();
      return false;
    }
    const p1 = p + 1;
    const p2 = p + 2;
    if (p >= src.length || p1 >= src.length || p2 >= src.length) {
      fault();
      return false;
    }
    return toI32(src[p]) === 34 && toI32(src[p1]) === 34 && toI32(src[p2]) === 34;
  }

  /** Reflower.getReflowReplacements for the parsed text, in the order they are put. */
  replacements(sep: string): Repl[] {
    const t = this.t;
    this.sep = sep;
    const nn = t.n;
    const plus = newI32s(nn);
    const selected = newI32s(nn);
    this.isPlusChild = plus;
    this.selected = selected;
    this.litText = newStrs(nn);
    this.litHave = newBools(nn);
    const repls: Repl[] = [];
    const kind = t.kind;
    const op = t.op;
    const ta = t.a;
    const tb = t.b;
    for (let x = 0; x < nn; x++) {
      // The tree's columns hold its nn nodes.
      if (x >= kind.length || x >= op.length || x >= ta.length) {
        fault();
        return repls;
      }
      const k = kind[x];
      if (k === N_BINARY && op[x] === OP_PLUS) {
        const xa = ta[x];
        if (xa < 0 || xa >= plus.length || x >= tb.length) {
          fault();
          return repls;
        }
        plus[xa] = x + 1;
        const xb = tb[x];
        if (xb < 0 || xb >= plus.length) {
          fault();
          return repls;
        }
        plus[xb] = x + 1;
      } else if (k === N_MEMBER_SELECT) {
        const xa = ta[x];
        if (xa >= 0) {
          if (xa >= selected.length) {
            fault();
            return repls;
          }
          selected[xa] = 1;
        }
      }
    }
    const longs: i32[] = [];
    for (let x = 0; x < nn; x++) {
      // Text blocks are indented by the formatter itself.
      if (!this.isStringLit(x) || this.isTextBlock(x)) {
        continue;
      }
      if (atI32(selected, x) === 1) {
        continue;
      }
      const le = this.lineEnd(atI32(t.end, x));
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
    // Stable, as the insertion sort by start it ports was.
    stableSort(keep, (p: Repl, q: Repl): i32 => (p.start > q.start ? 1 : 0));
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
    const plus = this.isPlusChild;
    let enclosing = lit;
    while (true) {
      if (enclosing < 0 || enclosing >= plus.length) {
        fault();
        return new Repl();
      }
      const up = plus[enclosing];
      if (up <= 0) {
        break;
      }
      enclosing = up - 1;
    }
    // Flatten.
    const flat: i32[] = [];
    const todo: i32[] = [enclosing]; // a stack: last is first
    while (todo.length > 0) {
      const f = todo.pop();
      if (atI32(t.kind, f) === N_BINARY && atI32(t.op, f) === OP_PLUS) {
        todo.push(atI32(t.b, f));
        todo.push(atI32(t.a, f));
      } else {
        flat.push(f);
      }
      if (faulted()) {
        return new Repl();
      }
    }
    let idx = 0;
    for (let i = 0; i < toI32(flat.length); i++) {
      if (flat[i] === lit) {
        idx = i;
      }
    }
    // flat holds at least the chain's first operand.
    if (idx < 0 || idx >= flat.length) {
      fault();
      return new Repl();
    }
    let startIdx = idx;
    let endIdx = idx + 1;
    while (startIdx > 0 && startIdx < flat.length) {
      const one = flat[startIdx - 1];
      const two = flat[startIdx];
      if (!this.isStringLit(one) || !this.noComments(one, two)) {
        break;
      }
      startIdx--;
    }
    while (endIdx > 0 && endIdx < flat.length) {
      const one = flat[endIdx - 1];
      const two = flat[endIdx];
      if (!this.isStringLit(two) || !this.noComments(one, two)) {
        break;
      }
      endIdx++;
    }
    const first = startIdx === 0;
    if (startIdx < 0 || startIdx >= flat.length || endIdx < 1 || endIdx > flat.length) {
      fault();
      return new Repl();
    }
    const firstNode = flat[startIdx];
    const lastNode = flat[endIdx - 1];
    const startColumn = this.column(atI32(t.start, firstNode));
    const end = atI32(t.end, lastNode);
    const le = this.lineEnd(end);
    const trailing = utf16Len(this.inp.src, end, le);
    const comps = this.components(flat, startIdx, endIdx);
    const r = new Repl();
    r.start = atI32(t.start, firstNode);
    r.end = end;
    r.text = reflowStr(this.sep, COLUMN_LIMIT, startColumn, trailing, comps, first);
    return r;
  }

  /** STRING_CONCAT_DELIMITER.matchesAllOf(between): only whitespace, quotes and `+`. */
  private noComments(one: i32, two: i32): boolean {
    const src = this.inp.src;
    const e = atI32(this.t.start, two);
    for (let i = atI32(this.t.end, one); i < e; i++) {
      if (i < 0 || i >= src.length) {
        fault();
        return false;
      }
      const c = toI32(src[i]);
      if (!isSwWs(c) && c !== 34 && c !== 43) {
        return false;
      }
    }
    return true;
  }

  /** The text of literal `x`, `src[a, e)`, made once a pass. */
  private litTextOf(x: i32, src: u8[], a: i32, e: i32): string {
    const have = this.litHave;
    const texts = this.litText;
    if (x >= 0 && x < have.length && x < texts.length && have[x]) {
      return texts[x];
    }
    const text = bytesText(src, a, e);
    if (x >= 0 && x < have.length && x < texts.length) {
      texts[x] = text;
      have[x] = true;
    }
    return text;
  }

  /** stringComponents: the literals' texts, split before whitespace and after runs of escaped newlines. */
  private components(flat: i32[], a: i32, b: i32): string[] {
    const t = this.t;
    const src = this.inp.src;
    const result: string[] = [];
    let piece = "";
    for (let q = a; q < b; q++) {
      if (q < 0 || q >= flat.length) {
        fault();
        return result;
      }
      const x = flat[q];
      // A string literal's text, without its quotes.
      const xs = atI32(t.start, x);
      const xe = atI32(t.end, x);
      if (xs < 0 || xs >= 2147483632 || xe < 1) {
        fault();
        return result;
      }
      const text = this.litTextOf(x, src, xs + 1, xe - 1);
      const n = toI32(text.length);
      let start = 0;
      let next = 0;
      for (let idx = 0; idx >= 0 && idx < text.length; idx = next) {
        let splitAt = idx;
        const ws = guavaWsLen(text, idx);
        // ws is 0 to 3, and idx < text.length < 2147483632.
        if (ws < 0 || ws > 3 || idx >= 2147483632) {
          fault();
          return result;
        }
        const c = text.charCodeAt(idx);
        const i1 = idx + 1;
        if (ws > 0) {
          // Before whitespace.
          next = idx + ws;
        } else if (c === 92 && i1 < text.length && text.charCodeAt(i1) === 116) {
          // Before an escaped tab.
          next = idx + 2;
        } else if (escapedNewlineAt(text, idx) !== -1) {
          // After a run of escaped newlines, so that they end the piece before.
          next = idx;
          let len = escapedNewlineAt(text, next);
          while (len !== -1) {
            // len is 2 or 4, and next stays within text.
            if (len < 0 || len > 4 || next < 0 || next >= 2147483632) {
              fault();
              return result;
            }
            next += len;
            len = escapedNewlineAt(text, next);
          }
          splitAt = next;
        } else {
          // The whole of an escape: the second character of `\\` starts no other.
          if (c === 92) {
            next = idx + 2;
          } else {
            next = i1;
          }
          continue;
        }
        if (splitAt > start || piece.length > 0) {
          piece = piece + text.substring(start, splitAt);
          result.push(piece);
          piece = "";
          start = splitAt;
        }
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
}

/** The keys of the TreeRangeMap the replacements are put into, as [start, end) pairs in order: a later range splits what it overlaps. */
export const replacementRanges = (repls: Repl[]): i32[] => {
  let ks: i32[] = [];
  for (const r of repls) {
    if (r.start >= r.end) {
      continue;
    }
    const nk: i32[] = [];
    let i = 0;
    while (i >= 0 && i < ks.length - 1) {
      const s = ks[i];
      const e = ks[i + 1];
      i += 2;
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
    while (at >= 0 && at < nk.length - 1 && nk[at] < r.start) {
      at += 2;
    }
    // nk holds pairs, so the last pair's start alone is never at the end.
    if (at === nk.length - 1 && at >= 0 && at < nk.length && nk[at] < r.start) {
      fault();
      return ks;
    }
    const sorted: i32[] = [];
    for (let i = 0; i < at && i < nk.length; i++) {
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
  // idx is an offset in s.
  if (idx < 0 || idx >= 2147483632) {
    fault();
    return -1;
  }
  let off = 0;
  let j = idx;
  const i1 = idx + 1;
  if (idx < s.length && i1 < s.length && s.charCodeAt(idx) === 92 && s.charCodeAt(i1) === 114) {
    off = 2;
    j = i1 + 1;
  }
  if (j < s.length) {
    const j1 = j + 1;
    if (j1 < s.length && s.charCodeAt(j) === 92 && s.charCodeAt(j1) === 110) {
      off += 2;
    }
  }
  return off > 0 ? off : -1;
};

const totalLengthLessThanOrEqual = (input: string[], from: i32, length: i32): boolean => {
  let total = 0;
  for (let i = from; i < toI32(input.length); i++) {
    if (i < 0 || i >= input.length) {
      fault();
      return true;
    }
    total = add32(total, strUtf16Len(input[i]));
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
  let width = sub32(sub32(columnLimit, startColumn), 2);
  let i = 0;
  const n = toI32(comps.length);
  const lines: string[] = [];
  let first = first0;
  while (i >= 0 && i < n) {
    let length = 0;
    let line = "";
    const i0 = i;
    if (totalLengthLessThanOrEqual(comps, i, width)) {
      width = sub32(width, trailing);
    }
    while (i >= 0 && i < comps.length) {
      const text = comps[i];
      if (!(length <= 4 || add32(length, strUtf16Len(text)) <= width)) {
        break;
      }
      i++;
      line = line + text;
      length = add32(length, strUtf16Len(text));
      if (text.endsWith("\\n") || text.endsWith("\\r")) {
        break;
      }
    }
    if (i === i0) {
      // Never taken: a line's first component always fits (length 0 <= 4).
      if (i < 0 || i >= comps.length) {
        fault();
        break;
      }
      line = comps[i];
      i++;
    }
    lines.push(line);
    if (first) {
      width = sub32(width, 6);
      first = false;
    }
  }
  let ind = "";
  const k = first0 ? add32(startColumn, 4) : sub32(startColumn, 2);
  for (let q = 0; q < k; q++) {
    ind = `${ind} `;
  }
  const joiner = `"${sep}${ind}+ "`;
  return `"${lines.join(joiner)}"`;
};

/** String.lines(): split at \n, \r, \r\n; no empty last line. */
export const javaLines = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const n = toI32(s.length);
  let i = 0;
  while (i >= 0 && i < s.length) {
    const c = s.charCodeAt(i);
    let next = i + 1;
    if (c === 10 || c === 13) {
      out.push(s.substring(a, i));
      if (c === 13 && next < s.length && s.charCodeAt(next) === 10) {
        next = next + 1;
      }
      a = next;
    }
    i = next;
  }
  if (a < n) {
    out.push(s.substring(a, n));
  }
  return out;
};

/**
 * The byte length of a Character.isWhitespace character at byte `i` of `s`,
 * or 0: ASCII tab to carriage return, U+001C to U+001F and the space, and the
 * Unicode space, line and paragraph separators but the no-break ones
 * (U+00A0, U+2007, U+202F).
 */
const javaWsLen = (s: string, i: i32): i32 => {
  if (i < 0 || i >= s.length) {
    fault();
    return 0;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return (c >= 9 && c <= 13) || (c >= 28 && c <= 32) ? 1 : 0;
  }
  const i1 = i + 1;
  if (i1 >= s.length) {
    return 0;
  }
  const i2 = i1 + 1;
  if (i2 >= s.length) {
    return 0;
  }
  const c1 = s.charCodeAt(i1);
  const c2 = s.charCodeAt(i2);
  if (c === 0xe1 && c1 === 0x9a && c2 === 0x80) {
    return 3; // U+1680
  }
  if (c === 0xe2 && c1 === 0x80 && ((c2 >= 0x80 && c2 <= 0x8a && c2 !== 0x87) || c2 === 0xa8 || c2 === 0xa9)) {
    return 3; // U+2000-2006, U+2008-200A, U+2028, U+2029
  }
  if (c === 0xe2 && c1 === 0x81 && c2 === 0x9f) {
    return 3; // U+205F
  }
  if (c === 0xe3 && c1 === 0x80 && c2 === 0x80) {
    return 3; // U+3000
  }
  return 0;
};

/** String.stripTrailing: `s` without its trailing Character.isWhitespace characters. */
export const stripTrailingJ = (s: string): string => {
  let end = 0;
  let i = 0;
  const n = toI32(s.length);
  while (i >= 0 && i < n && i < s.length) {
    const w = javaWsLen(s, i);
    if (w > 0) {
      // w is 1 to 3, and i < s.length.
      if (w > 3 || i >= 2147483632) {
        fault();
        break;
      }
      i += w;
    } else {
      i++;
      // Past the rest of a multi-byte character.
      while (i < n && i < s.length && (s.charCodeAt(i) & 0xc0) === 0x80) {
        i++;
      }
      end = i;
    }
  }
  return s.substring(0, end);
};

/** How many Character.isWhitespace characters `l` starts with. */
const javaLeadingWsChars = (l: string): i32 => {
  let k = 0;
  let i = 0;
  while (i >= 0 && i < l.length) {
    const w = javaWsLen(l, i);
    if (w === 0) {
      break;
    }
    // w is 1 to 3; k counts characters of l, so k < i.
    if (w < 0 || w > 3 || i >= 2147483632 || k >= 2147483632) {
      fault();
      break;
    }
    i += w;
    k++;
  }
  return k;
};

/** The byte length of the first `chars` characters of `l`, all whitespace. */
const javaLeadingWsBytes = (l: string, chars: i32): i32 => {
  let i = 0;
  for (let k = 0; k < chars && i >= 0 && i < l.length; k++) {
    const w = javaWsLen(l, i);
    // w is 0 to 3, and i < l.length.
    if (w < 0 || w > 3 || i >= 2147483632) {
      fault();
      break;
    }
    i += w;
  }
  return i;
};

/**
 * String.stripIndent over lines joined without a trailing terminator, split
 * again: the least indentation (in characters) of the non-blank lines and
 * the last line goes from every line, and so does trailing whitespace.
 */
export const stripIndentLines = (lines: string[]): string[] => {
  let min = 2147483647;
  for (let i = 0; i < toI32(lines.length); i++) {
    const l = lines[i];
    const k = javaLeadingWsChars(l);
    const blank = javaLeadingWsBytes(l, k) === toI32(l.length);
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
    out.push(stripTrailingJ(l.substring(javaLeadingWsBytes(l, min), toI32(l.length))));
  }
  return out;
};
