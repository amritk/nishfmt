// String helpers rustfmt takes from Rust's `str`: trimming, lines, finding,
// display width. Strings are UTF-8 bytes; every offset is a byte offset, as
// in Rust.
//
// For rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project Developers).

import { cpWidth } from "../core/uwidth";

/** Whether byte `c` is ASCII whitespace as Rust's `char::is_whitespace` sees it. */
export const rsIsWsByte = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** The length of a Unicode whitespace character starting at `i` (0 if none). */
export const rsWsLenAt = (s: string, i: i32): i32 => {
  const c = s.charCodeAt(i);
  if (c < 128) {
    return rsIsWsByte(c) ? 1 : 0;
  }
  const n = toI32(s.length);
  if (c === 0xc2 && i + 1 < n) {
    const d = s.charCodeAt(i + 1);
    return d === 0x85 || d === 0xa0 ? 2 : 0;
  }
  if ((c === 0xe1 || c === 0xe2 || c === 0xe3) && i + 2 < n) {
    const d = s.charCodeAt(i + 1);
    const e = s.charCodeAt(i + 2);
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
  while (i < n) {
    const k = rsWsLenAt(s, i);
    if (k === 0) {
      break;
    }
    i += k;
  }
  return i;
};

export const rsTrimEndIdx = (s: string): i32 => {
  let j = toI32(s.length);
  while (j > 0) {
    const k = wsLenBefore(s, j);
    if (k === 0) {
      break;
    }
    j -= k;
  }
  return j;
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
  return s.slice(a, b);
};

export const rsTrimStart = (s: string): string => {
  const a = rsTrimStartIdx(s);
  return a === 0 ? s : s.slice(a, toI32(s.length));
};

export const rsTrimEnd = (s: string): string => {
  const b = rsTrimEndIdx(s);
  return b === toI32(s.length) ? s : s.slice(0, b);
};

/** Trims trailing bytes equal to `c`. */
export const rsTrimEndChar = (s: string, c: i32): string => {
  let j = toI32(s.length);
  while (j > 0 && s.charCodeAt(j - 1) === c) {
    j--;
  }
  return s.slice(0, j);
};

export const rsTrimStartChar = (s: string, c: i32): string => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n && s.charCodeAt(i) === c) {
    i++;
  }
  return s.slice(i, n);
};

export const rsIsBlank = (s: string): boolean => rsTrimStartIdx(s) >= toI32(s.length);

export const rsContains = (s: string, sub: string): boolean => s.indexOf(sub) >= 0;

export const rsHasByte = (s: string, c: i32): boolean => rsIndexOfByte(s, c, 0) >= 0;

export const rsIndexOfByte = (s: string, c: i32, from: i32): i32 => {
  const n = toI32(s.length);
  for (let i = from; i < n; i++) {
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
  if (from > toI32(s.length)) {
    return -1;
  }
  const k = s.slice(from, toI32(s.length)).indexOf(sub);
  return k < 0 ? -1 : k + from;
};

export const rsLastIndexOf = (s: string, sub: string): i32 => {
  const m = toI32(sub.length);
  for (let i = toI32(s.length) - m; i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (s.charCodeAt(i + j) !== sub.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return i;
    }
  }
  return -1;
};

/** Counts the non-overlapping occurrences of `sub`. */
export const rsCountMatches = (s: string, sub: string): i32 => {
  let n = 0;
  let i = 0;
  const m = toI32(sub.length);
  for (;;) {
    const k = rsIndexFrom(s, sub, i);
    if (k < 0) {
      return n;
    }
    n++;
    i = k + m;
  }
};

export const rsCountNewlines = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    if (s.charCodeAt(i) === 10) {
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
  while (a < n) {
    let b = rsIndexOfByte(s, 10, a);
    let next = 0;
    if (b < 0) {
      b = n;
      next = n;
    } else {
      next = b + 1;
    }
    let e = b;
    if (e > a && s.charCodeAt(e - 1) === 13) {
      e--;
    }
    out.push(s.slice(a, e));
    a = next;
  }
  return out;
};

/** Split at every `\n` (Rust's `split('\n')`), keeping empty pieces. */
export const rsSplitNl = (s: string): string[] => {
  const out: string[] = [];
  const n = toI32(s.length);
  let a = 0;
  for (;;) {
    const b = rsIndexOfByte(s, 10, a);
    if (b < 0) {
      out.push(s.slice(a, n));
      return out;
    }
    out.push(s.slice(a, b));
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

export const rsSpaces = (k: i32): string => {
  if (k <= 0) {
    return "";
  }
  if (k <= 64) {
    return "                                                                ".slice(0, k);
  }
  return rsRepeat(" ", k);
};

/** The first line of `s` (up to the first `\n`). */
export const rsFirstLine = (s: string): string => {
  const i = rsIndexOfByte(s, 10, 0);
  return i < 0 ? s : s.slice(0, i);
};

/** The last line of `s` (after the last `\n`). */
export const rsLastLine = (s: string): string => {
  const i = rsLastIndexOfByte(s, 10);
  return i < 0 ? s : s.slice(i + 1, toI32(s.length));
};

/** The display width of `s`, as unicode-width's `UnicodeWidthStr::width` counts it. */
export const rsWidth = (s: string): i32 => {
  const n = toI32(s.length);
  let ascii = true;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) >= 128) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    return n;
  }
  let w = 0;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 128) {
      w++;
      i++;
      continue;
    }
    let k = 0;
    let cp = 0;
    if (c >= 0xf0) {
      k = 4;
      cp = c & 7;
    } else if (c >= 0xe0) {
      k = 3;
      cp = c & 15;
    } else if (c >= 0xc0) {
      k = 2;
      cp = c & 31;
    } else {
      i++;
      continue;
    }
    for (let j = 1; j < k && i + j < n; j++) {
      cp = (cp << 6) | (s.charCodeAt(i + j) & 63);
    }
    const cw = cpWidth(cp);
    if (cw > 0) {
      w += cw;
    }
    i += k;
  }
  return w;
};

/** The number of chars (code points) in `s`. */
export const rsCharCount = (s: string): i32 => {
  const n = toI32(s.length);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
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
