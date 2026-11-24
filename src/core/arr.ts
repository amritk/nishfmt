// Array, byte and arithmetic helpers every language shares, each one proven
// not to panic. A helper that meets a range or a sum its caller's invariants
// rule out calls `fault()` (src/core/fault.ts) and answers a neutral value,
// so the file is skipped rather than formatted from that value.
//
// The standard library's `new Array<T>(n)` with a length the compiler cannot
// bound, an array's `set` and `slice`, and `String.fromBytes` keep a check no
// proof removes, so the modules held to no panic use these instead.

import { tryCopyBytes } from "nish/bytes";
import { fault } from "./fault";

/** `n` zeroes; a negative `n` faults and answers an empty array. */
export const newI32s = (n: i32): i32[] => {
  const xs: i32[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push(0);
  }
  return xs;
};

/** `n` zero bytes; a negative `n` faults and answers an empty array. */
export const newU8s = (n: i32): u8[] => {
  const xs: u8[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push(0);
  }
  return xs;
};

/** `n` zeroes; a negative `n` faults and answers an empty array. */
export const newI64s = (n: i32): i64[] => {
  const xs: i64[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push(toI64(0));
  }
  return xs;
};

/** `n` falses; a negative `n` faults and answers an empty array. */
export const newBools = (n: i32): boolean[] => {
  const xs: boolean[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push(false);
  }
  return xs;
};

/** `n` empty strings; a negative `n` faults and answers an empty array. */
export const newStrs = (n: i32): string[] => {
  const xs: string[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push("");
  }
  return xs;
};

/**
 * Copies `src[from, from + count)` to `dst[at, at + count)`; a range outside
 * either array faults and copies nothing.
 */
export const copyU8s = (dst: u8[], at: i32, src: u8[], from: i32, count: i32): void => {
  if (!tryCopyBytes(dst, at, src, from, count)) {
    fault();
  }
};

/**
 * Copies `src[from, from + count)` to `dst[at, at + count)`, which may
 * overlap; a range outside either array faults and copies nothing.
 */
export const copyI32s = (dst: i32[], at: i32, src: i32[], from: i32, count: i32): void => {
  if (count < 0 || at < 0 || from < 0 || at > toI32(dst.length) - count || from > toI32(src.length) - count) {
    fault();
    return;
  }
  // Both ranges lie inside their arrays, so each index below stays in
  // `[0, length]` and every step fits.
  if (at <= from) {
    let s = from;
    let d = at;
    for (let k = 0; k < count; k++) {
      if (s < 0 || s >= src.length || d < 0 || d >= dst.length) {
        fault();
        return;
      }
      dst[d] = src[s];
      s = s + 1;
      d = d + 1;
    }
    return;
  }
  let s = toI32(toI64(from) + toI64(count));
  let d = toI32(toI64(at) + toI64(count));
  for (let k = 0; k < count; k++) {
    if (s <= 0 || d <= 0) {
      fault();
      return;
    }
    s = s - 1;
    d = d - 1;
    if (s >= src.length || d >= dst.length) {
      fault();
      return;
    }
    dst[d] = src[s];
  }
};

/** A new array of `src[a, e)`; a range outside `src` faults and answers []. */
export const sliceU8s = (src: u8[], a: i32, e: i32): u8[] => {
  const xs: u8[] = [];
  if (a < 0 || e < a || e > src.length) {
    fault();
    return xs;
  }
  for (let i = a; i >= 0 && i < e && i < src.length; i++) {
    xs.push(src[i]);
  }
  return xs;
};

/** A new array of `src[a, e)`; a range outside `src` faults and answers []. */
export const sliceI32s = (src: i32[], a: i32, e: i32): i32[] => {
  const xs: i32[] = [];
  if (a < 0 || e < a || e > src.length) {
    fault();
    return xs;
  }
  for (let i = a; i >= 0 && i < e && i < src.length; i++) {
    xs.push(src[i]);
  }
  return xs;
};

/** A new array of `src[a, e)`; a range outside `src` faults and answers []. */
export const sliceStrs = (src: string[], a: i32, e: i32): string[] => {
  const xs: string[] = [];
  if (a < 0 || e < a || e > src.length) {
    fault();
    return xs;
  }
  for (let i = a; i >= 0 && i < e && i < src.length; i++) {
    xs.push(src[i]);
  }
  return xs;
};

/**
 * The bytes `b[a, e)` as a string, as `String.fromBytes(b, a, e)` makes it; a
 * range outside `b` faults and answers "". Each byte is one character of
 * `String.fromCharCode`, so a multi-byte character is copied byte by byte.
 */
export const bytesText = (b: u8[], a: i32, e: i32): string => {
  if (a < 0 || e < a || e > b.length) {
    fault();
    return "";
  }
  const parts: string[] = [];
  for (let i = a; i >= 0 && i < e && i < b.length; i++) {
    parts.push(String.fromCharCode(b[i]));
  }
  return parts.join("");
};

/** `xs` again when it holds `n` elements, else a copy grown to at least `n`. */
export const growI32 = (xs: i32[], n: i32): i32[] => {
  if (toI32(xs.length) >= n) {
    return xs;
  }
  const out: i32[] = [];
  for (const x of xs) {
    out.push(x);
  }
  // Doubling, as a fresh `new Array` of twice the length did.
  const len = toI32(xs.length);
  if (len > 1073741823) {
    fault();
    return out;
  }
  const cap = len + len >= n ? len + len : n;
  while (out.length < cap) {
    out.push(0);
  }
  return out;
};

/** `xs[i]`, or 0 after a fault when `i` is outside `xs`. */
export const atI32 = (xs: i32[], i: i32): i32 => {
  if (i >= 0 && i < xs.length) {
    return xs[i];
  }
  fault();
  return 0;
};

/** `xs[i]` as an i32, or 0 after a fault when `i` is outside `xs`. */
export const atU8 = (xs: u8[], i: i32): i32 => {
  if (i >= 0 && i < xs.length) {
    return toI32(xs[i]);
  }
  fault();
  return 0;
};

/** `a + b`, or 0 after a fault when the sum leaves i32. */
export const add32 = (a: i32, b: i32): i32 => {
  const r = toI64(a) + toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `a - b`, or 0 after a fault when the difference leaves i32. */
export const sub32 = (a: i32, b: i32): i32 => {
  const r = toI64(a) - toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** `a * b`, or 0 after a fault when the product leaves i32. */
export const mul32 = (a: i32, b: i32): i32 => {
  const r = toI64(a) * toI64(b);
  if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
    return toI32(r);
  }
  fault();
  return 0;
};

/** The number of UTF-16 code units in `src[a, b)`, which Java's String.length counts. */
export const utf16Len = (src: u8[], a: i32, b: i32): i32 => {
  let n = 0;
  if (a < b && (a < 0 || b > src.length)) {
    fault();
    return 0;
  }
  for (let i = a; i >= 0 && i < b && i < src.length; i++) {
    const c = toI32(src[i]);
    if (c < 0x80 || c >= 0xc0) {
      // At most two units a byte, so only a range past 2^30 bytes faults.
      if (n > 2147483645) {
        fault();
        return 0;
      }
      if (c >= 0xf0) {
        n += 2;
      } else {
        n += 1;
      }
    }
  }
  return n;
};

/** The number of UTF-16 code units in `s`. */
export const strUtf16Len = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      if (n > 2147483645) {
        fault();
        return 0;
      }
      if (c >= 0xf0) {
        n += 2;
      } else {
        n += 1;
      }
    }
  }
  return n;
};
