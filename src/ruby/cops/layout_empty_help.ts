// What the Layout cops about blank lines, trailing whitespace and comments
// share: ProcessedSource#lines, the EmptyLinesAroundBody mixin (its
// no_empty_lines style), and the directive and whitespace tests they use.
//
// Ported from RuboCop 1.92.3 and rubocop-ast 1.52.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";

/** String#strip's whitespace: NUL, \t, \n, \v, \f, \r and space. */
export const rbLayStripWs = (c: i32): boolean => c === 0 || c === 32 || (c >= 9 && c <= 13);

/** Regexp \s: \t, \n, \v, \f, \r and space. */
export const rbLayRxSpace = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** [[:blank:]] on a UTF-8 string: \t and the space separators (Zs). */
export const rbLayBlank = (c: i32): boolean =>
  c === 9 ||
  c === 32 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000;

/** Regexp \w on a byte of a UTF-8 string (a non-ASCII byte belongs to a letter). */
export const rbLayWordByte = (c: i32): boolean =>
  c === 95 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c >= 128;

/**
 * ProcessedSource#lines: the buffer's lines (a source ending in a newline
 * has an empty last line), cut at a `__END__` line after the last token.
 * Indexes are 0-based like the Ruby array; `n` is its size.
 */
export class RbLayLines {
  s: i32[];
  e: i32[];
  // buffer.source_lines.size
  phys: i32;
  // processed_source.lines.size
  n: i32;
  src: RbSource;

  constructor(src: RbSource) {
    this.src = src;
    // Computed once per source and shared (the arrays are read-only).
    src.layLines();
    this.s = src.layS;
    this.e = src.layE;
    this.phys = src.layPhys;
    this.n = src.layN;
  }

  /** The Ruby index `i` (negative counts from the end) as 0-based, or -1 when out of range. */
  idx(i: i32): i32 {
    let j = i;
    if (i < 0) {
      const n = this.n;
      // A line count is never negative, so the sum fits.
      if (n < 0) {
        fault();
        return -1;
      }
      j = i + n;
    }
    return j >= 0 && j < this.n ? j : -1;
  }

  /** Whether lines[i] is not nil. */
  has(i: i32): boolean {
    return this.idx(i) >= 0;
  }

  /** lines[i].empty? (false for nil). */
  empty(i: i32): boolean {
    const j = this.idx(i);
    return j >= 0 && atI32(this.s, j) === atI32(this.e, j);
  }

  /** lines[i].blank? / lines[i].strip.empty? (false for nil). */
  blank(i: i32): boolean {
    const j = this.idx(i);
    if (j < 0) {
      return false;
    }
    const pts = this.src.pts;
    const pe = atI32(this.e, j);
    for (let p = atI32(this.s, j); p < pe; p++) {
      // A line lies in the source.
      if (p < 0 || p >= pts.length) {
        fault();
        return false;
      }
      if (!rbLayStripWs(pts[p])) {
        return false;
      }
    }
    return true;
  }

  /** Util#comment_line?: /^\s*#/ (any line of the text; lines hold no newline). */
  commentLine(i: i32): boolean {
    const j = this.idx(i);
    if (j < 0) {
      return false;
    }
    const pts = this.src.pts;
    const pe = atI32(this.e, j);
    let p = atI32(this.s, j);
    while (p < pe) {
      // A line lies in the source.
      if (p < 0 || p >= pts.length) {
        fault();
        return false;
      }
      if (!rbLayRxSpace(pts[p])) {
        break;
      }
      p++;
    }
    return p < pe && atI32(pts, p) === 35;
  }

  /** The text of lines[i] ("" for nil). */
  text(i: i32): string {
    const j = this.idx(i);
    return j < 0 ? "" : this.src.src(atI32(this.s, j), atI32(this.e, j));
  }

  /** The start of 1-based buffer line `l` (source_range's line_range(l).begin_pos; 0 for line 0). */
  start(l: i32): i32 {
    if (l <= 0) {
      return 0;
    }
    if (l > this.phys) {
      return this.src.n;
    }
    return atI32(this.s, l - 1);
  }

  /** The end of 1-based buffer line `l`, before its newline. */
  end(l: i32): i32 {
    if (l <= 0 || l > this.phys) {
      return this.src.n;
    }
    return atI32(this.e, l - 1);
  }
}

/** ProcessedSource#comment_at_line: the index of the (last) comment starting on line `l`, or -1. */
export const rbLayCommentAtLine = (src: RbSource, l: i32): i32 => {
  let r = -1;
  for (let i = 0; i < toI32(src.commS.length); i++) {
    const cl = src.line(src.commS[i]);
    if (cl === l) {
      r = i;
    } else if (cl > l) {
      break;
    }
  }
  return r;
};

/** Whether `text` holds `sub` at byte `at`. */
export const rbLayHasAt = (text: string, at: i32, sub: string): boolean => {
  const m = toI32(sub.length);
  if (at < 0 || at > toI32(text.length) - m) {
    return false;
  }
  return text.substring(at, add32(at, m)) === sub;
};

/**
 * DirectiveComment#mode of a comment's text: the mode of the first
 * `# rubocop : <mode>` in it ("" when none, or when only `#` and space
 * come before it).
 */
export const rbLayDirectiveMode = (text: string): string => {
  const k = toI32(text.length);
  const modes = ["disable-next", "enable-next", "todo-next", "disable", "enable", "push", "pop", "todo", "next"];
  for (let p = 0; p < k; p++) {
    if (text.charCodeAt(p) !== 35) {
      continue;
    }
    let q = p + 1;
    while (q < k && rbLayRxSpace(text.charCodeAt(q))) {
      q++;
    }
    // rbLayHasAt holding, q + 7 <= k.
    if (!rbLayHasAt(text, q, "rubocop") || q > k - 7) {
      continue;
    }
    q += 7;
    while (q < k && rbLayRxSpace(text.charCodeAt(q))) {
      q++;
    }
    if (q >= k || text.charCodeAt(q) !== 58) {
      continue;
    }
    q++;
    while (q < k && rbLayRxSpace(text.charCodeAt(q))) {
      q++;
    }
    let mode = "";
    for (const m of modes) {
      const ml = toI32(m.length);
      if (!rbLayHasAt(text, q, m)) {
        continue;
      }
      // rbLayHasAt holding, 0 <= q <= k - ml.
      if (q < 0 || ml < 0 || q > k - ml) {
        fault();
        return "";
      }
      const qe = add32(q, ml);
      if (qe >= k || (qe >= 0 && qe < text.length && !rbLayWordByte(text.charCodeAt(qe)))) {
        mode = m;
        break;
      }
    }
    if (mode.length === 0) {
      continue;
    }
    // pre_match =~ /\A#\s*\z/ drops the match.
    let pre = p > 0 && text.length > 0 && text.charCodeAt(0) === 35;
    for (let i = 1; i < p; i++) {
      if (!rbLayRxSpace(text.charCodeAt(i))) {
        pre = false;
      }
    }
    return pre ? "" : mode;
  }
  return "";
};

/** DirectiveComment#enabled?: an `enable` or `enable-next` directive. */
export const rbLayDirectiveEnabled = (text: string): boolean => {
  const m = rbLayDirectiveMode(text);
  return m === "enable" || m === "enable-next";
};

/** EmptyLineCorrector / source_range(buffer, line, 0): the first character of 1-based line `l`. */
export const rbLayLineHead = (L: RbLayLines, l: i32): i32 => L.start(l);

/** check_line for the no_empty_lines style: lines[line] empty puts an offense on the next line's newline. */
export const rbLayCheckNoEmpty = (c: RbCop, L: RbLayLines, line: i32): void => {
  if (!L.empty(line)) {
    return;
  }
  const s = L.start(add32(line, 1));
  const s1 = add32(s, 1);
  const k = c.offense(s, s1);
  if (k !== null) {
    k.remove(s, s1);
    c.commit(k);
  }
};

/**
 * EmptyLinesAroundBody#check with the no_empty_lines style: no empty line
 * after the node's first line (`firstLine`, 0 for the node's own) or before
 * its last.
 */
export const rbLayBodyCheck = (c: RbCop, src: RbSource, L: RbLayLines, node: i32, firstLine: i32): void => {
  const nodeFirst = src.line(src.a.exS(node));
  const last = src.line(src.a.exE(node));
  if (nodeFirst === last) {
    return;
  }
  const first = firstLine > 0 ? firstLine : nodeFirst;
  if (first >= last) {
    return;
  }
  rbLayCheckNoEmpty(c, L, first);
  rbLayCheckNoEmpty(c, L, sub32(last, 2));
};
