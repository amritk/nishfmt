// A growable byte buffer for the formatted file.
//
// `buf` holds at least `n` bytes, the output so far; callers may read
// `buf[0, n)` and lower `n`. Every write is guarded, and one past what the
// buffer can hold faults (src/core/fault.ts) rather than panicking.

import { fault } from "./fault";

export class Out {
  buf: u8[];
  n: i32 = 0;

  /**
   * `cap` is a size hint the buffer no longer needs: it grows as bytes are
   * written, so it is never zero-filled first.
   */
  constructor(cap: i32) {
    this.buf = [];
  }

  /** Makes room for `extra` more bytes after `n`, for callers that then write `buf` by index. */
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
    const buf = this.buf;
    while (buf.length < need) {
      buf.push(0);
    }
  }

  byte(c: i32): void {
    const buf = this.buf;
    const n = this.n;
    if (n >= 0 && n < buf.length) {
      buf[n] = toU8(c);
    } else if (n === buf.length && n < 2147483647) {
      buf.push(toU8(c));
    } else {
      fault();
      return;
    }
    this.n = n + 1;
  }

  /** Writes `k` copies of byte `c`. */
  fill(k: i32, c: u8): void {
    const buf = this.buf;
    let n = this.n;
    for (let i = 0; i < k; i++) {
      if (n >= 0 && n < buf.length) {
        buf[n] = c;
      } else if (n === buf.length && n < 2147483647) {
        buf.push(c);
      } else {
        fault();
        return;
      }
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
    const buf = this.buf;
    let n = this.n;
    for (let i = a; i < b && i < src.length; i++) {
      const c = src[i];
      if (n >= 0 && n < buf.length) {
        buf[n] = c;
      } else if (n === buf.length && n < 2147483647) {
        buf.push(c);
      } else {
        fault();
        return;
      }
      n = n + 1;
    }
    this.n = n;
  }

  str(s: string): void {
    const k = toI32(s.length);
    const buf = this.buf;
    let n = this.n;
    for (let i = 0; i < k; i++) {
      const c = toU8(s.charCodeAt(i));
      if (n >= 0 && n < buf.length) {
        buf[n] = c;
      } else if (n === buf.length && n < 2147483647) {
        buf.push(c);
      } else {
        fault();
        return;
      }
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
