// A growable byte buffer for the formatted file.
//
// `buf` holds at least `n` bytes, the output so far; callers may read
// `buf[0, n)` and lower `n`. Every write is guarded, and one past what the
// buffer can hold faults (src/core/fault.ts) rather than panicking.

import { newU8s } from "./arr";
import { fault } from "./fault";

export class Out {
  buf: u8[];
  n: i32 = 0;

  constructor(cap: i32) {
    this.buf = newU8s(cap < 64 ? 64 : cap);
  }

  /** Makes room for `extra` more bytes after `n`, doubling the buffer as it grows. */
  reserve(extra: i32): void {
    const n = this.n;
    if (extra <= 0) {
      return;
    }
    const need64 = toI64(n) + toI64(extra);
    if (n < 0 || need64 > toI64(2147483647)) {
      fault();
      return;
    }
    const need = toI32(need64);
    const len = toI32(this.buf.length);
    if (need <= len) {
      return;
    }
    let cap = len <= 1073741823 ? len + len : 2147483647;
    if (cap < need) {
      cap = need;
    }
    const buf = this.buf;
    while (buf.length < cap) {
      buf.push(0);
    }
  }

  byte(c: i32): void {
    this.reserve(1);
    const buf = this.buf;
    const n = this.n;
    if (n >= 0 && n < buf.length) {
      buf[n] = toU8(c);
      this.n = n + 1;
    } else {
      fault();
    }
  }

  /** Writes `k` copies of byte `c`. */
  fill(k: i32, c: u8): void {
    if (k <= 0) {
      return;
    }
    this.reserve(k);
    const buf = this.buf;
    let n = this.n;
    for (let i = 0; i < k; i++) {
      if (n < 0 || n >= buf.length) {
        fault();
        return;
      }
      buf[n] = c;
      n = n + 1;
    }
    this.n = n;
  }

  spaces(k: i32): void {
    this.fill(k, toU8(32));
  }

  newlines(k: i32): void {
    this.fill(k, toU8(10));
  }

  range(src: u8[], a: i32, b: i32): void {
    if (b <= a) {
      return;
    }
    if (a < 0 || b > src.length) {
      fault();
      return;
    }
    // `0 <= a < b`, so the u32 difference is the true one.
    this.reserve(toI32(toU32(b) - toU32(a)));
    const buf = this.buf;
    let n = this.n;
    for (let i = a; i < b && i < src.length; i++) {
      if (n < 0 || n >= buf.length) {
        fault();
        return;
      }
      buf[n] = src[i];
      n = n + 1;
    }
    this.n = n;
  }

  str(s: string): void {
    const k = toI32(s.length);
    this.reserve(k);
    const buf = this.buf;
    let n = this.n;
    for (let i = 0; i < k; i++) {
      if (n < 0 || n >= buf.length) {
        fault();
        return;
      }
      buf[n] = toU8(s.charCodeAt(i));
      n = n + 1;
    }
    this.n = n;
  }

  /** Drops trailing spaces before the end. */
  trimSpaces(): void {
    const buf = this.buf;
    let n = this.n;
    if (n > buf.length) {
      fault();
      return;
    }
    while (n > 0 && n <= buf.length && toI32(buf[n - 1]) === 32) {
      n = n - 1;
    }
    this.n = n;
  }
}
