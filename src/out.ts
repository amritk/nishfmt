// A growable byte buffer for the formatted file.

import { uncheckedGet, uncheckedSet } from "nish:unsafe";

export class Out {
  buf: u8[];
  n: i32 = 0;

  constructor(cap: i32) {
    this.buf = new Array<u8>(cap < 64 ? 64 : cap);
  }

  reserve(extra: i32): void {
    const need = this.n + extra;
    if (need <= toI32(this.buf.length)) {
      return;
    }
    let cap = toI32(this.buf.length) * 2;
    if (cap < need) {
      cap = need;
    }
    const nb = new Array<u8>(cap);
    nb.set(this.buf);
    this.buf = nb;
  }

  byte(c: i32): void {
    this.reserve(1);
    uncheckedSet(this.buf, this.n, toU8(c));
    this.n = this.n + 1;
  }

  spaces(k: i32): void {
    if (k <= 0) {
      return;
    }
    this.reserve(k);
    for (let i = 0; i < k; i++) {
      uncheckedSet(this.buf, this.n + i, toU8(32));
    }
    this.n = this.n + k;
  }

  newlines(k: i32): void {
    if (k <= 0) {
      return;
    }
    this.reserve(k);
    for (let i = 0; i < k; i++) {
      uncheckedSet(this.buf, this.n + i, toU8(10));
    }
    this.n = this.n + k;
  }

  range(src: u8[], a: i32, b: i32): void {
    const k = b - a;
    if (k <= 0) {
      return;
    }
    this.reserve(k);
    for (let i = 0; i < k; i++) {
      uncheckedSet(this.buf, this.n + i, uncheckedGet(src, a + i));
    }
    this.n = this.n + k;
  }

  str(s: string): void {
    const k = toI32(s.length);
    this.reserve(k);
    for (let i = 0; i < k; i++) {
      uncheckedSet(this.buf, this.n + i, toU8(s.charCodeAt(i)));
    }
    this.n = this.n + k;
  }

  /** Drops trailing spaces before the end. */
  trimSpaces(): void {
    while (this.n > 0 && toI32(uncheckedGet(this.buf, this.n - 1)) === 32) {
      this.n = this.n - 1;
    }
  }
}
