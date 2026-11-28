// String helpers rustfmt takes from Rust's `str`: trimming, lines, finding,
// display width. Strings are UTF-8 bytes; every offset is a byte offset, as
// in Rust.
//
// For rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project Developers).

import { fault } from "../core/fault";
import { rsUnicodeStrWidth } from "./uwidth";

/** The byte count of an RsStrBuf; setting `n` to 0 empties the buffer. */
export class RsStrBufLen {
  n: i32 = 0;
}

/**
 * A growing string: keeps the pieces and joins them once, instead of copying
 * the whole result on each append. Empty pieces are never kept, so pieces
 * with `b.n` at 0 mean the buffer was emptied through `b.n`.
 */
export class RsStrBuf {
  parts: string[];
  b: RsStrBufLen;
  constructor() {
    this.parts = [];
    this.b = new RsStrBufLen();
  }

  sync(): void {
    if (this.b.n === 0 && this.parts.length > 0) {
      this.parts = [];
    }
  }

  clear(): void {
    this.parts = [];
    this.b.n = 0;
  }

  add(s: string): void {
    this.sync();
    const k = toI32(s.length);
    if (k === 0) {
      return;
    }
    const t = toI64(this.b.n) + toI64(k);
    if (t > toI64(2147483647)) {
      fault();
      return;
    }
    this.parts.push(s);
    this.b.n = toI32(t);
  }

  /** Appends `s[a, b)`. */
  addSlice(s: string, a: i32, b: i32): void {
    if (b <= a) {
      if (toI64(b) - toI64(a) < toI64(-2147483648)) {
        fault();
      }
      return;
    }
    if (a < 0 || b > toI32(s.length)) {
      fault();
      return;
    }
    this.add(s.substring(a, b));
  }

  len(): i32 {
    this.sync();
    return this.b.n;
  }

  /** The text after the last newline. */
  lastLine(): string {
    this.sync();
    const ps = this.parts;
    const tail: string[] = [];
    for (let i = toI32(ps.length) - 1; i >= 0 && i < ps.length; i--) {
      const p = ps[i];
      let j = toI32(p.length) - 1;
      while (j >= 0 && j < p.length && p.charCodeAt(j) !== 10) {
        j--;
      }
      if (j >= 0 && j < p.length) {
        tail.push(p.substring(j + 1, toI32(p.length)));
        break;
      }
      tail.push(p);
    }
    if (tail.length === 1) {
      return tail[0];
    }
    const out: string[] = [];
    for (let i = toI32(tail.length) - 1; i >= 0 && i < tail.length; i--) {
      out.push(tail[i]);
    }
    return out.join("");
  }

  str(): string {
    this.sync();
    const ps = this.parts;
    if (ps.length === 1) {
      return ps[0];
    }
    const s = ps.join("");
    // One piece from now on, so asking again copies nothing.
    if (s.length > 0) {
      this.parts = [s];
    }
    return s;
  }

  /** The newlines in the buffer. */
  newlineCount(): i32 {
    return rsCountNewlines(this.str());
  }

  /** The newlines that end the buffer. */
  trailingNewlines(): i32 {
    this.sync();
    const ps = this.parts;
    let k = 0;
    for (let i = toI32(ps.length) - 1; i >= 0 && i < ps.length; i--) {
      const p = ps[i];
      let j = toI32(p.length) - 1;
      while (j >= 0 && j < p.length && p.charCodeAt(j) === 10) {
        // At most one per byte of the buffer, whose length is an i32.
        if (k > 1073741823) {
          fault();
          return 0;
        }
        k = k + 1;
        j--;
      }
      if (j >= 0) {
        break;
      }
    }
    return k;
  }

  /** The final byte, or -1 when the buffer is empty. */
  lastByte(): i32 {
    this.sync();
    const ps = this.parts;
    const k = toI32(ps.length);
    if (k > 0) {
      const p = ps[k - 1];
      const m = toI32(p.length);
      if (m > 0) {
        return p.charCodeAt(m - 1);
      }
    }
    return -1;
  }

  /** Drops the final byte (the caller knows there is one). */
  dropLast(): void {
    this.sync();
    const ps = this.parts;
    const k = toI32(ps.length);
    const n = this.b.n;
    if (k > 0 && n > 0) {
      const p = ps[k - 1];
      const m = toI32(p.length);
      if (m > 1) {
        const q = p.substring(0, m - 1);
        const j = k - 1;
        if (j < ps.length) {
          ps[j] = q;
        }
      } else if (ps.length > 0) {
        ps.pop();
      }
      this.b.n = n - 1;
    } else {
      fault();
    }
  }
}

/** Whether byte `c` is ASCII whitespace as Rust's `char::is_whitespace` sees it. */
export const rsIsWsByte = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** The length of a Unicode whitespace character starting at `i` (0 if none). */
export const rsWsLenAt = (s: string, i: i32): i32 => {
  const n = toI32(s.length);
  if (i < 0 || i >= n) {
    fault();
    return 0;
  }
  const c = s.charCodeAt(i);
  if (c < 128) {
    return rsIsWsByte(c) ? 1 : 0;
  }
  const i1 = i + 1;
  if (c === 0xc2 && i1 < n) {
    const d = s.charCodeAt(i1);
    return d === 0x85 || d === 0xa0 ? 2 : 0;
  }
  if ((c === 0xe1 || c === 0xe2 || c === 0xe3) && i1 < n && i1 + 1 < n) {
    const d = s.charCodeAt(i1);
    const e = s.charCodeAt(i1 + 1);
    if (c === 0xe1 && d === 0x9a && e === 0x80) return 3; // U+1680
    if (c === 0xe2 && d === 0x80 && ((e >= 0x80 && e <= 0x8a) || e === 0xa8 || e === 0xa9 || e === 0xaf)) return 3;
    if (c === 0xe2 && d === 0x81 && e === 0x9f) return 3; // U+205F
    if (c === 0xe3 && d === 0x80 && e === 0x80) return 3; // U+3000
  }
  return 0;
};

/** rsWsLenAt over the bytes `src[i, n)`. */
export const rsWsLenAtBytes = (src: u8[], i: i32, n: i32): i32 => {
  if (i < 0 || i >= src.length) {
    fault();
    return 0;
  }
  const c = toI32(src[i]);
  if (c < 128) {
    return rsIsWsByte(c) ? 1 : 0;
  }
  const i1 = i + 1;
  if (c === 0xc2 && i1 < n) {
    if (i1 >= src.length) {
      fault();
      return 0;
    }
    const d = toI32(src[i1]);
    return d === 0x85 || d === 0xa0 ? 2 : 0;
  }
  if ((c === 0xe1 || c === 0xe2 || c === 0xe3) && i1 < n && i1 + 1 < n) {
    const i2 = i1 + 1;
    if (i1 >= src.length || i2 >= src.length) {
      fault();
      return 0;
    }
    const d = toI32(src[i1]);
    const e = toI32(src[i2]);
    if (c === 0xe1 && d === 0x9a && e === 0x80) return 3; // U+1680
    if (c === 0xe2 && d === 0x80 && ((e >= 0x80 && e <= 0x8a) || e === 0xa8 || e === 0xa9 || e === 0xaf)) return 3;
    if (c === 0xe2 && d === 0x81 && e === 0x9f) return 3; // U+205F
    if (c === 0xe3 && d === 0x80 && e === 0x80) return 3; // U+3000
  }
  return 0;
};

/** The length of a Unicode whitespace character ending at `j` (exclusive), or 0. */
const wsLenBefore = (s: string, j: i32): i32 => {
  if (j <= 0) {
    return 0;
  }
  if (j > toI32(s.length)) {
    fault();
    return 0;
  }
  const c = s.charCodeAt(j - 1);
  if (c < 128) {
    return rsIsWsByte(c) ? 1 : 0;
  }
  if (j >= 2 && rsWsLenAt(s, j - 2) === 2) {
    return 2;
  }
  if (j >= 3 && rsWsLenAt(s, j - 3) === 3) {
    return 3;
  }
  return 0;
};

export const rsTrimStartIdx = (s: string): i32 => {
  const n = toI32(s.length);
  let i = 0;
  while (i >= 0 && i < n) {
    const k = rsWsLenAt(s, i);
    // A whitespace character is at most 3 bytes.
    if (k > 0 && k <= 3 && i >= 0 && i < n) {
      // 0 <= i < n and k <= 3, so the u32 sum is the true one.
      i = toI32(toU32(i) + toU32(k));
    } else {
      break;
    }
  }
  return i;
};

export const rsTrimEndIdx = (s: string): i32 => {
  let j = toI32(s.length);
  while (j > 0) {
    const k = wsLenBefore(s, j);
    // A whitespace character is at most 3 bytes.
    if (k <= 0 || k > 3) {
      break;
    }
    j = j - k;
  }
  return j;
};

/** `s[a, b)`, which the caller found inside `s`; a range outside it faults. */
export const rsCut = (s: string, a: i32, b: i32): string => {
  if (a < 0 || b < a || b > toI32(s.length)) {
    fault();
    return "";
  }
  return s.substring(a, b);
};

export const rsTrim = (s: string): string => {
  const a = rsTrimStartIdx(s);
  if (a >= toI32(s.length)) {
    return "";
  }
  const b = rsTrimEndIdx(s);
  if (a === 0 && b === toI32(s.length)) {
    return s;
  }
  return rsCut(s, a, b);
};

export const rsTrimStart = (s: string): string => {
  const a = rsTrimStartIdx(s);
  return a === 0 ? s : rsCut(s, a, toI32(s.length));
};

export const rsTrimEnd = (s: string): string => {
  const b = rsTrimEndIdx(s);
  return b === toI32(s.length) ? s : rsCut(s, 0, b);
};

/** Trims trailing bytes equal to `c`. */
export const rsTrimEndChar = (s: string, c: i32): string => {
  let j = toI32(s.length);
  while (j > 0 && s.charCodeAt(j - 1) === c) {
    j--;
  }
  return s.substring(0, j);
};

export const rsTrimStartChar = (s: string, c: i32): string => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n && s.charCodeAt(i) === c) {
    i++;
  }
  return s.substring(i, n);
};

export const rsIsBlank = (s: string): boolean => rsTrimStartIdx(s) >= toI32(s.length);

export const rsContains = (s: string, sub: string): boolean => s.indexOf(sub) >= 0;

export const rsHasByte = (s: string, c: i32): boolean => rsIndexOfByte(s, c, 0) >= 0;

export const rsIndexOfByte = (s: string, c: i32, from: i32): i32 => {
  if (from < 0) {
    fault();
    return -1;
  }
  const n = toI32(s.length);
  for (let i = from; i >= 0 && i < n; i++) {
    if (s.charCodeAt(i) === c) {
      return i;
    }
  }
  return -1;
};

export const rsLastIndexOfByte = (s: string, c: i32): i32 => {
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    if (s.charCodeAt(i) === c) {
      return i;
    }
  }
  return -1;
};

/** The first index of `sub` at or after `from`, or -1. */
export const rsIndexFrom = (s: string, sub: string, from: i32): i32 => {
  if (from <= 0) {
    return s.indexOf(sub);
  }
  const n = toI32(s.length);
  if (from > n) {
    return -1;
  }
  const k = s.substring(from, n).indexOf(sub);
  if (k < 0) {
    return -1;
  }
  // A match in `s[from, n)` starts below n.
  const r = toI64(k) + toI64(from);
  if (r > toI64(n)) {
    fault();
    return -1;
  }
  return toI32(r);
};

export const rsLastIndexOf = (s: string, sub: string): i32 => {
  const n = toI32(s.length);
  const m = toI32(sub.length);
  for (let i = n - m; i >= 0 && i <= n; i--) {
    // i <= n - m, so p = i + j stays below n while j < m.
    let j = 0;
    let p = i;
    while (j < m && j < sub.length && p >= 0 && p < n) {
      if (s.charCodeAt(p) !== sub.charCodeAt(j)) {
        break;
      }
      j++;
      p++;
    }
    if (j >= m) {
      return i;
    }
  }
  return -1;
};

/** Counts the non-overlapping occurrences of `sub`. */
export const rsCountMatches = (s: string, sub: string): i32 => {
  let n = 0;
  let i = 0;
  const len = toI32(s.length);
  const m = toI32(sub.length);
  for (;;) {
    const k = rsIndexFrom(s, sub, i);
    if (k < 0) {
      return n;
    }
    // Each match is a nonempty piece of `s` past the last, so neither the
    // count nor the end can pass the length (an empty `sub` never ended).
    const e = toI64(k) + toI64(m);
    if (n >= len || e > toI64(len)) {
      fault();
      return n;
    }
    n++;
    i = toI32(e);
  }
};

export const rsCountNewlines = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    if (s.charCodeAt(i) === 10) {
      // n <= i < k.
      if (n >= k) {
        fault();
        return 0;
      }
      n++;
    }
  }
  return n;
};

/** Rust's `str::lines()`: split at `\n`, a trailing `\r` dropped from each line, no final empty line. */
export const rsLines = (s: string): string[] => {
  const out: string[] = [];
  const n = toI32(s.length);
  let a = 0;
  while (a >= 0 && a < n) {
    let b = rsIndexOfByte(s, 10, a);
    let next = 0;
    if (b < 0) {
      b = n;
      next = n;
    } else if (b < n) {
      next = b + 1;
    } else {
      fault();
      return out;
    }
    let e = b;
    const e1 = e - 1;
    if (e > a && e1 >= 0 && e1 < s.length && s.charCodeAt(e1) === 13) {
      e = e1;
    }
    out.push(s.substring(a, e));
    a = next;
  }
  return out;
};

/** `s.lines().next()`: the first line without its `\r`, or null when `s` is empty. */
export const rsFirstLineOpt = (s: string): string | null => {
  const n = toI32(s.length);
  if (n === 0) {
    return null;
  }
  let e = rsIndexOfByte(s, 10, 0);
  if (e < 0) {
    e = n;
  } else if (e > n) {
    fault();
    return null;
  }
  const e1 = e - 1;
  if (e1 >= 0 && e1 < s.length && s.charCodeAt(e1) === 13) {
    e = e1;
  }
  return s.substring(0, e);
};

/** `s.lines().last()`: the last line without its `\r`, or null when `s` is empty. */
export const rsLastLineOpt = (s: string): string | null => {
  let n = toI32(s.length);
  if (n === 0) {
    return null;
  }
  if (s.charCodeAt(n - 1) === 10) {
    n--; // a final newline ends the last line instead of starting one
  }
  let a = n - 1;
  while (a >= 0 && s.charCodeAt(a) !== 10) {
    a--;
  }
  // -1 <= a < n.
  const a1 = a < 0 ? 0 : a + 1;
  let e = n;
  if (e > a1 && e > 0 && e - 1 < s.length && s.charCodeAt(e - 1) === 13) {
    e--;
  }
  return s.substring(a1, e);
};

/** Split at every `\n` (Rust's `split('\n')`), keeping empty pieces. */
export const rsSplitNl = (s: string): string[] => {
  const out: string[] = [];
  const n = toI32(s.length);
  let a = 0;
  for (;;) {
    const b = rsIndexOfByte(s, 10, a);
    if (b < 0) {
      out.push(s.substring(a, n));
      return out;
    }
    if (b >= n) {
      fault();
      return out;
    }
    out.push(s.substring(a, b));
    a = b + 1;
  }
};

export const rsRepeat = (s: string, k: i32): string => {
  let out = "";
  for (let i = 0; i < k; i++) {
    out = out + s;
  }
  return out;
};

// 256 spaces after a newline: rsSpaces and rsNlSpaces cut their text from it.
const RS_NL_SPACES: string =
  "\n                                                                                                                                                                                                                                                                ";

export const rsSpaces = (k: i32): string => {
  if (k <= 0) {
    return "";
  }
  if (k <= 256) {
    return RS_NL_SPACES.substring(1, k + 1);
  }
  return rsRepeat(" ", k);
};

/** `"\n" + rsSpaces(k)`, as one string. */
export const rsNlSpaces = (k: i32): string => {
  if (k <= 0) {
    return "\n";
  }
  if (k <= 256) {
    return RS_NL_SPACES.substring(0, k + 1);
  }
  return "\n" + rsRepeat(" ", k);
};

/** The first line of `s` (up to the first `\n`). */
export const rsFirstLine = (s: string): string => {
  const i = rsIndexOfByte(s, 10, 0);
  return i < 0 ? s : s.substring(0, i);
};

/** The last line of `s` (after the last `\n`). */
export const rsLastLine = (s: string): string => {
  const n = toI32(s.length);
  const i = rsLastIndexOfByte(s, 10);
  if (i < 0) {
    return s;
  }
  if (i >= n) {
    fault();
    return s;
  }
  return s.substring(i + 1, n);
};

/** The display width of `s`, as unicode-width's `UnicodeWidthStr::width` counts it. */
export const rsWidth = (s: string): i32 => {
  const n = toI32(s.length);
  // The bytes that take no column: a line feed, and a carriage return before one.
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c <= 13) {
      if (c === 10 || (c === 13 && i + 1 < n && s.charCodeAt(i + 1) === 10)) {
        // k <= i < n.
        if (k >= n) {
          fault();
          return 0;
        }
        k++;
      }
    } else if (c >= 128) {
      return rsUnicodeStrWidth(s);
    }
  }
  // Exact: 0 <= k <= n.
  return toI32(toU32(n) - toU32(k));
};

/** `rsWidth(s.substring(a, b))`, without cutting the substring out of an ASCII `s`. */
export const rsWidthRange = (s: string, a: i32, b: i32): i32 => {
  if (a < 0 || a > b || b > toI32(s.length)) {
    fault();
    return 0;
  }
  // The bytes that take no column: a line feed, and a carriage return before one.
  let k = 0;
  for (let i = a; i < b; i++) {
    const c = s.charCodeAt(i);
    if (c <= 13) {
      if (c === 10 || (c === 13 && i + 1 < b && s.charCodeAt(i + 1) === 10)) {
        // k <= i - a < b - a.
        if (k >= b - a) {
          fault();
          return 0;
        }
        k++;
      }
    } else if (c >= 128) {
      return rsUnicodeStrWidth(s.substring(a, b));
    }
  }
  // Exact: 0 <= k <= b - a.
  return toI32(toU32(b - a) - toU32(k));
};

/** The number of chars (code points) in `s`. */
export const rsCharCount = (s: string): i32 => {
  const n = toI32(s.length);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      // k <= i < n.
      if (k >= n) {
        fault();
        return 0;
      }
      k++;
    }
  }
  return k;
};

export const rsIsAsciiDigit = (c: i32): boolean => c >= 48 && c <= 57;
export const rsIsAsciiAlpha = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
/** `char::is_alphanumeric`, with any non-ASCII byte taken as part of a letter. */
export const rsIsAlnumByte = (c: i32): boolean => rsIsAsciiAlpha(c) || rsIsAsciiDigit(c) || c >= 128;

export const rsJoin = (xs: string[], sep: string): string => xs.join(sep);

/** The last of `xs`, which the caller knows is not empty; an empty one faults. */
export const rsLastOf = (xs: string[]): string => {
  const k = toI32(xs.length);
  if (k > 0) {
    return xs[k - 1];
  }
  fault();
  return "";
};
