// The version sort of the Rust Style Guide, which orders imports at style
// edition 2024.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): sort.rs.

import { rsIsAsciiDigit } from "./str";

const RS_VC_END: i32 = 0;
const RS_VC_UNDERSCORE: i32 = 1;
const RS_VC_STR: i32 = 2;
const RS_VC_NUM: i32 = 3;

/** VersionChunkIter: splits an identifier into `_`, digit runs and the runs between. */
class RsVersionChunks {
  s: string;
  start: i32 = 0;
  // The last chunk: its kind, its source s[a, b), and for a number its
  // leading zeros and its digits without them.
  kind: i32 = 0;
  a: i32 = 0;
  b: i32 = 0;
  zeros: i32 = 0;
  constructor(s: string) {
    this.s = s;
  }

  /** Iterator::next; RS_VC_END once done (and for a number too large for a usize, whose parse fails). */
  next(): i32 {
    const s = this.s;
    const n = toI32(s.length);
    if (this.start >= n) {
      this.kind = RS_VC_END;
      return this.kind;
    }
    const c = s.charCodeAt(this.start);
    this.a = this.start;
    if (c === 95) {
      this.start = this.start + 1;
      this.b = this.start;
      this.kind = RS_VC_UNDERSCORE;
      return this.kind;
    }
    let i = this.start + 1;
    if (rsIsAsciiDigit(c)) {
      while (i < n && rsIsAsciiDigit(s.charCodeAt(i))) {
        i++;
      }
      this.start = i;
      this.b = i;
      let z = this.a;
      while (z < i && s.charCodeAt(z) === 48) {
        z++;
      }
      this.zeros = z - this.a;
      // source.parse::<usize>(): more than 20 significant digits, or 20 above
      // u64::MAX, fail, and the iterator ends.
      const sig = i - z;
      if (sig > 20 || (sig === 20 && rsCmpBytes(s, z, i, "18446744073709551615", 0, 20) > 0)) {
        this.kind = RS_VC_END;
        return this.kind;
      }
      this.kind = RS_VC_NUM;
      return this.kind;
    }
    while (i < n) {
      const d = s.charCodeAt(i);
      if (d === 95 || rsIsAsciiDigit(d)) {
        break;
      }
      i++;
    }
    this.start = i;
    this.b = i;
    this.kind = RS_VC_STR;
    return this.kind;
  }
}

/** Byte-wise comparison of a[a0, a1) with b[b0, b1), as `str::cmp`. */
const rsCmpBytes = (a: string, a0: i32, a1: i32, b: string, b0: i32, b1: i32): i32 => {
  let i = a0;
  let j = b0;
  while (i < a1 && j < b1) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(j);
    if (x !== y) {
      return x < y ? -1 : 1;
    }
    i++;
    j++;
  }
  if (i < a1) {
    return 1;
  }
  return j < b1 ? -1 : 0;
};

/** version_sort: -1, 0 or 1 as `a` sorts before, with or after `b`. */
export const rsVersionSort = (a: string, b: string): i32 => {
  const ia = new RsVersionChunks(a);
  const ib = new RsVersionChunks(b);
  // MoreLeadingZeros: 0 equal, -1 left, 1 right.
  let more = 0;
  for (;;) {
    const ka = ia.next();
    const kb = ib.next();
    if (ka === RS_VC_END && kb === RS_VC_END) {
      break;
    }
    if (kb === RS_VC_END) {
      return 1;
    }
    if (ka === RS_VC_END) {
      return -1;
    }
    if (ka === RS_VC_UNDERSCORE && kb === RS_VC_UNDERSCORE) {
      continue;
    }
    if (ka === RS_VC_UNDERSCORE) {
      return -1;
    }
    if (kb === RS_VC_UNDERSCORE) {
      return 1;
    }
    if (ka === RS_VC_NUM && kb === RS_VC_NUM) {
      // The values, compared as their digits without leading zeros.
      const za = ia.a + ia.zeros;
      const zb = ib.a + ib.zeros;
      const la = ia.b - za;
      const lb = ib.b - zb;
      if (la !== lb) {
        return la < lb ? -1 : 1;
      }
      const o = rsCmpBytes(a, za, ia.b, b, zb, ib.b);
      if (o !== 0) {
        return o;
      }
      if (ia.zeros !== ib.zeros && more === 0) {
        more = ia.zeros > ib.zeros ? -1 : 1;
      }
      continue;
    }
    const o = rsCmpBytes(a, ia.a, ia.b, b, ib.a, ib.b);
    if (o !== 0) {
      return o;
    }
  }
  return more;
};

/** `s.trim_start_matches("r#")`. */
export const rsTrimRawPrefix = (s: string): string => {
  let i = 0;
  while (i + 1 < toI32(s.length) && s.charCodeAt(i) === 114 && s.charCodeAt(i + 1) === 35) {
    i += 2;
  }
  return i === 0 ? s : s.substring(i);
};
