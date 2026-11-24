// The Roslyn-shaped syntax tree, struct-of-arrays: every node has a kind
// (Roslyn's SyntaxKind), its slots (the fields of Syntax.xml in order: a node,
// a token or a list, -1 when missing) and a parent; tokens and trivia live in
// the lexer's arrays.
//
// For CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela VanderVoort),
// after Roslyn's syntax model (MIT License, Copyright the .NET Foundation and
// Contributors).

import { bytesText, growI32 } from "../core/arr";
import { fault } from "../core/fault";
import { CsLexer, csZeroI32s } from "./lexer";
import { csKindType, csTypeBase, csTypeShape } from "./kinds";

export class CsTree {
  lx: CsLexer;
  src: u8[];

  nn: i32 = 0;
  kind: i32[];
  slot: i32[]; // offset of the node's slots in pool
  nslot: i32[];
  parent: i32[];
  first: i32[]; // first token, -1 if none
  last: i32[]; // last token, -1 if none

  pool: i32[];
  np: i32 = 0;

  nl: i32 = 0;
  lsOff: i32[];
  lsLen: i32[];

  stk: i32[];
  sp: i32 = 0;

  constructor(lx: CsLexer) {
    this.lx = lx;
    this.src = lx.src;
    // Capacities only: a column past its capacity is pushed to.
    let nt = lx.nt;
    if (nt < 0 || nt > 16777216) {
      nt = 16777216;
    }
    const cap = toI32(toU32(nt) + toU32(nt / 8) + toU32(64));
    this.kind = csZeroI32s(cap);
    this.slot = csZeroI32s(cap);
    this.nslot = csZeroI32s(cap);
    this.parent = csZeroI32s(cap);
    this.first = csZeroI32s(cap);
    this.last = csZeroI32s(cap);
    this.pool = csZeroI32s(toI32(toU32(nt) * toU32(3) + toU32(64)));
    this.lsOff = csZeroI32s(toI32(toU32(nt / 2) + toU32(64)));
    this.lsLen = csZeroI32s(toI32(toU32(nt / 2) + toU32(64)));
    this.stk = new Array<i32>(1024);
  }

  push(v: i32): void {
    let stk = this.stk;
    const sp = this.sp;
    if (sp < 0 || sp > 1073741823) {
      fault();
      return;
    }
    if (sp >= stk.length) {
      stk = growI32(stk, sp * 2);
      this.stk = stk;
    }
    if (sp < stk.length) {
      stk[sp] = v;
      this.sp = sp + 1;
    } else {
      fault();
    }
  }

  /** The number of entries above `mark` on the stack, or -1 after a fault. */
  above(mark: i32): i32 {
    const sp = this.sp;
    if (mark < 0 || sp < 0 || mark > sp || sp > 1073741823) {
      fault();
      return -1;
    }
    return sp - mark;
  }

  /** Copies stk[mark, sp) to pool at np and pops it; answers its offset in pool, or -1 after a fault. */
  popToPool(mark: i32): i32 {
    const sp = this.sp;
    const np = this.np;
    const stk = this.stk;
    const pool = this.pool;
    if (mark < 0 || sp < 0 || mark > sp || np < 0 || np > 1073741823 || sp > 1073741823 || sp > stk.length) {
      fault();
      return -1;
    }
    let d = np;
    for (let i = mark; i >= 0 && i < sp && i < stk.length; i++) {
      const v = stk[i];
      if (d >= 0 && d < pool.length) {
        pool[d] = v;
        d = d + 1;
      } else if (d === pool.length && d < 2000000000) {
        pool.push(v);
        d = d + 1;
      } else {
        fault();
        return -1;
      }
    }
    this.np = d;
    this.sp = mark;
    return np;
  }

  /** Makes a list of stk[mark, sp) and pops it. */
  list(mark: i32): i32 {
    const n = this.above(mark);
    const id = this.nl;
    if (n < 0 || id < 0 || id > 1000000000) {
      fault();
      return -1;
    }
    const off = this.popToPool(mark);
    const lsOff = this.lsOff;
    const lsLen = this.lsLen;
    if (off < 0) {
      fault();
      return -1;
    }
    if (id < lsOff.length && id < lsLen.length) {
      lsOff[id] = off;
      lsLen[id] = n;
    } else if (id === lsOff.length) {
      lsOff.push(off);
      lsLen.push(n);
    } else {
      fault();
      return -1;
    }
    this.nl = id + 1;
    return id;
  }

  /** Makes a node of `kind` whose slots are stk[mark, sp), and pops them. */
  node(kind: i32, mark: i32): i32 {
    const n = this.above(mark);
    const id = this.nn;
    if (n < 0 || id < 0 || id > 1000000000) {
      fault();
      return -1;
    }
    const off = this.popToPool(mark);
    const kinds = this.kind;
    const slot = this.slot;
    const nslot = this.nslot;
    const parent = this.parent;
    const firsts = this.first;
    const lasts = this.last;
    if (off < 0) {
      fault();
      return -1;
    }
    if (
      id < kinds.length &&
      id < slot.length &&
      id < nslot.length &&
      id < parent.length &&
      id < firsts.length &&
      id < lasts.length
    ) {
      kinds[id] = kind;
      slot[id] = off;
      nslot[id] = n;
      parent[id] = -1;
    } else if (id === kinds.length) {
      // the columns are written together, so all end here
      kinds.push(kind);
      slot.push(off);
      nslot.push(n);
      parent.push(-1);
      firsts.push(-1);
      lasts.push(-1);
    } else {
      fault();
      return -1;
    }
    this.nn = id + 1;
    // parents, first and last tokens
    const shape = csTypeShape(csKindType(kind));
    if (toI32(shape.length) !== n) {
      // a node built with the wrong number of slots: a parser bug
      fault();
      return id;
    }
    let first = -1;
    let last = -1;
    const lx = this.lx;
    const tokParent = lx.parent;
    const pool = this.pool;
    const lsOff = this.lsOff;
    const lsLen = this.lsLen;
    let p = off;
    for (let i = 0; i < n && i < shape.length; i++) {
      if (p < 0 || p >= pool.length) {
        fault();
        return id;
      }
      const v = pool[p];
      p = p + 1;
      if (v < 0) {
        continue;
      }
      const c = shape.charCodeAt(i) | 32;
      if (c === 110) {
        // n
        if (v >= parent.length || v >= firsts.length || v >= lasts.length) {
          fault();
          return id;
        }
        parent[v] = id;
        if (firsts[v] >= 0) {
          if (first < 0) {
            first = firsts[v];
          }
          last = lasts[v];
        }
      } else if (c === 116) {
        // t
        if (v >= tokParent.length) {
          fault();
          return id;
        }
        tokParent[v] = id;
        if (first < 0) {
          first = v;
        }
        last = v;
      } else {
        if (v >= lsOff.length || v >= lsLen.length) {
          fault();
          return id;
        }
        const lo = lsOff[v];
        const len = lsLen[v];
        if (lo < 0 || len < 0 || lo > pool.length - len) {
          fault();
          return id;
        }
        let odd = false;
        for (let q = lo; q >= 0 && q < pool.length && q - lo < len; q++) {
          const e = pool[q];
          const isOdd = odd;
          odd = !odd;
          if (e < 0) {
            continue;
          }
          const isTok = c === 107 || (c === 115 && isOdd);
          if (isTok) {
            if (e >= tokParent.length) {
              fault();
              return id;
            }
            tokParent[e] = id;
            if (first < 0) {
              first = e;
            }
            last = e;
          } else {
            if (e >= parent.length || e >= firsts.length || e >= lasts.length) {
              fault();
              return id;
            }
            parent[e] = id;
            if (firsts[e] >= 0) {
              if (first < 0) {
                first = firsts[e];
              }
              last = lasts[e];
            }
          }
        }
      }
    }
    if (id < firsts.length && id < lasts.length) {
      firsts[id] = first;
      lasts[id] = last;
    } else {
      fault();
    }
    return id;
  }

  // ---- reading ----

  /** Slot i of node n. */
  s(n: i32, i: i32): i32 {
    const slot = this.slot;
    const pool = this.pool;
    if (n >= 0 && n < slot.length && i >= 0) {
      // both non-negative i32s, so the u32 sum is exact
      const k = toI32(toU32(slot[n]) + toU32(i));
      if (k >= 0 && k < pool.length) {
        return pool[k];
      }
    }
    fault();
    return -1;
  }

  /** The kind of node n; 0 after a fault when there is none. */
  nodeKind(n: i32): i32 {
    const kind = this.kind;
    if (n >= 0 && n < kind.length) {
      return kind[n];
    }
    fault();
    return 0;
  }

  /** The first token of node n, -1 if none. */
  firstTok(n: i32): i32 {
    const xs = this.first;
    if (n >= 0 && n < xs.length) {
      return xs[n];
    }
    fault();
    return -1;
  }

  /** The last token of node n, -1 if none. */
  lastTok(n: i32): i32 {
    const xs = this.last;
    if (n >= 0 && n < xs.length) {
      return xs[n];
    }
    fault();
    return -1;
  }

  /** The parent of node n, -1 if none. */
  parentOf(n: i32): i32 {
    const xs = this.parent;
    if (n >= 0 && n < xs.length) {
      return xs[n];
    }
    fault();
    return -1;
  }

  /** The syntax type of node n. */
  ty(n: i32): i32 {
    if (n < 0) {
      return 0;
    }
    const kind = this.kind;
    if (n < kind.length) {
      return csKindType(kind[n]);
    }
    fault();
    return 0;
  }

  /** Whether node n is of syntax type y or a subtype of it. */
  is(n: i32, y: i32): boolean {
    if (n < 0) {
      return false;
    }
    const kind = this.kind;
    if (n >= kind.length) {
      fault();
      return false;
    }
    let t = csKindType(kind[n]);
    while (t !== 0) {
      if (t === y) {
        return true;
      }
      t = csTypeBase(t);
    }
    return false;
  }

  /** The type of the parent of n, 0 when there is none. */
  pty(n: i32): i32 {
    const parent = this.parent;
    const kind = this.kind;
    if (n >= 0 && n < parent.length) {
      const p = parent[n];
      if (p < 0) {
        return 0;
      }
      if (p < kind.length) {
        return csKindType(kind[p]);
      }
    }
    fault();
    return 0;
  }

  /** The length of list l, separators counted; 0 after a fault when l is no list. */
  lsLenOf(l: i32): i32 {
    const lsLen = this.lsLen;
    if (l >= 0 && l < lsLen.length) {
      return lsLen[l];
    }
    fault();
    return 0;
  }

  /** The number of elements of list l (separators not counted for a separated list). */
  count(l: i32): i32 {
    return l < 0 ? 0 : this.lsLenOf(l);
  }

  /** Pool entry j of list l, or -1 after a fault when there is none. */
  entry(l: i32, j: i32): i32 {
    const lsOff = this.lsOff;
    const pool = this.pool;
    if (l >= 0 && l < lsOff.length && j >= 0) {
      // both non-negative i32s, so the u32 sum is exact
      const k = toI32(toU32(lsOff[l]) + toU32(j));
      if (k >= 0 && k < pool.length) {
        return pool[k];
      }
    }
    fault();
    return -1;
  }

  /** Raw entry j of list l. */
  at(l: i32, j: i32): i32 {
    return this.entry(l, j);
  }

  /** Element j of a separated list. */
  sel(l: i32, j: i32): i32 {
    if (j < 0 || j > 1073741823) {
      fault();
      return -1;
    }
    return this.entry(l, j * 2);
  }

  /** The number of elements of a separated list. */
  scount(l: i32): i32 {
    if (l < 0) {
      return 0;
    }
    const n = this.lsLenOf(l);
    if (n < 0 || n > 2147483646) {
      fault();
      return 0;
    }
    return (n + 1) / 2;
  }

  /** The number of separators of a separated list. */
  sepCount(l: i32): i32 {
    return l < 0 ? 0 : this.lsLenOf(l) / 2;
  }

  /** Separator j of a separated list. */
  sep(l: i32, j: i32): i32 {
    if (j < 0 || j > 1073741822) {
      fault();
      return -1;
    }
    return this.entry(l, j * 2 + 1);
  }

  // ---- text ----

  /** The start of node n's full text (its leading trivia included). */
  fullStart(n: i32): i32 {
    const firsts = this.first;
    if (n < 0 || n >= firsts.length) {
      fault();
      return -1;
    }
    const t = firsts[n];
    if (t < 0) {
      return -1;
    }
    const lx = this.lx;
    const l0 = lx.l0;
    const l1 = lx.l1;
    const start = lx.start;
    const trStart = lx.trStart;
    if (t < l0.length && t < l1.length && t < start.length) {
      const a = l0[t];
      if (a >= l1[t]) {
        return start[t];
      }
      if (a >= 0 && a < trStart.length) {
        return trStart[a];
      }
    }
    fault();
    return -1;
  }

  fullEnd(n: i32): i32 {
    const lasts = this.last;
    if (n < 0 || n >= lasts.length) {
      fault();
      return -1;
    }
    const t = lasts[n];
    if (t < 0) {
      return -1;
    }
    const lx = this.lx;
    const t0 = lx.t0;
    const t1 = lx.t1;
    const end = lx.end;
    const trEnd = lx.trEnd;
    if (t < t0.length && t < t1.length && t < end.length) {
      const b = t1[t];
      if (t0[t] >= b) {
        return end[t];
      }
      if (b > 0 && b <= trEnd.length) {
        return trEnd[b - 1];
      }
    }
    fault();
    return -1;
  }

  /** The start of n's text without its leading trivia. */
  spanStart(n: i32): i32 {
    const firsts = this.first;
    const start = this.lx.start;
    if (n >= 0 && n < firsts.length) {
      const t = firsts[n];
      if (t < 0) {
        return -1;
      }
      if (t < start.length) {
        return start[t];
      }
    }
    fault();
    return -1;
  }

  spanEnd(n: i32): i32 {
    const lasts = this.last;
    const end = this.lx.end;
    if (n >= 0 && n < lasts.length) {
      const t = lasts[n];
      if (t < 0) {
        return -1;
      }
      if (t < end.length) {
        return end[t];
      }
    }
    fault();
    return -1;
  }

  tokText(t: i32): string {
    const start = this.lx.start;
    const end = this.lx.end;
    if (t >= 0 && t < start.length && t < end.length) {
      return bytesText(this.src, start[t], end[t]);
    }
    fault();
    return "";
  }

  tokLen(t: i32): i32 {
    const start = this.lx.start;
    const end = this.lx.end;
    if (t >= 0 && t < start.length && t < end.length) {
      const a = start[t];
      const b = end[t];
      if (a >= 0 && b >= a) {
        // b >= a >= 0, so the u32 difference is exact
        return toI32(toU32(b) - toU32(a));
      }
    }
    fault();
    return 0;
  }

  /** Whether token t's text is `w`. */
  tokIs(t: i32, w: string): boolean {
    const start = this.lx.start;
    const end = this.lx.end;
    const src = this.src;
    if (t < 0 || t >= start.length || t >= end.length) {
      fault();
      return false;
    }
    const a = start[t];
    const b = end[t];
    if (b < a) {
      return false;
    }
    if (a < 0 || b > src.length) {
      fault();
      return false;
    }
    // b >= a >= 0, so the u32 difference is exact
    const n = toI32(toU32(b) - toU32(a));
    if (n !== toI32(w.length)) {
      return false;
    }
    let p = a;
    for (let i = 0; i < n && i < w.length && p >= 0 && p < src.length; i++) {
      if (toI32(src[p]) !== w.charCodeAt(i)) {
        return false;
      }
      p = p + 1;
    }
    return true;
  }
}
