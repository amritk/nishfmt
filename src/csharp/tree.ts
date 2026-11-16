// The Roslyn-shaped syntax tree, struct-of-arrays: every node has a kind
// (Roslyn's SyntaxKind), its slots (the fields of Syntax.xml in order: a node,
// a token or a list, -1 when missing) and a parent; tokens and trivia live in
// the lexer's arrays.
//
// For CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela VanderVoort),
// after Roslyn's syntax model (MIT License, Copyright the .NET Foundation and
// Contributors).

import { growI32 } from "../core/arr";
import { CsLexer } from "./lexer";
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
    const cap = lx.nt + 64;
    this.kind = new Array<i32>(cap);
    this.slot = new Array<i32>(cap);
    this.nslot = new Array<i32>(cap);
    this.parent = new Array<i32>(cap);
    this.first = new Array<i32>(cap);
    this.last = new Array<i32>(cap);
    this.pool = new Array<i32>(cap * 3 + 64);
    this.lsOff = new Array<i32>(cap / 2 + 64);
    this.lsLen = new Array<i32>(cap / 2 + 64);
    this.stk = new Array<i32>(1024);
  }

  push(v: i32): void {
    if (this.sp >= toI32(this.stk.length)) {
      this.stk = growI32(this.stk, this.sp * 2);
    }
    this.stk[this.sp] = v;
    this.sp = this.sp + 1;
  }

  /** Makes a list of stk[mark, sp) and pops it. */
  list(mark: i32): i32 {
    const n = this.sp - mark;
    const id = this.nl;
    if (id >= toI32(this.lsOff.length)) {
      this.lsOff = growI32(this.lsOff, id * 2 + 16);
      this.lsLen = growI32(this.lsLen, id * 2 + 16);
    }
    this.reservePool(n);
    for (let i = 0; i < n; i++) {
      this.pool[this.np + i] = this.stk[mark + i];
    }
    this.lsOff[id] = this.np;
    this.lsLen[id] = n;
    this.np = this.np + n;
    this.nl = id + 1;
    this.sp = mark;
    return id;
  }

  reservePool(n: i32): void {
    if (this.np + n > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, (this.np + n) * 2);
    }
  }

  /** Makes a node of `kind` whose slots are stk[mark, sp), and pops them. */
  node(kind: i32, mark: i32): i32 {
    const n = this.sp - mark;
    const id = this.nn;
    if (id >= toI32(this.kind.length)) {
      const c = id * 2 + 16;
      this.kind = growI32(this.kind, c);
      this.slot = growI32(this.slot, c);
      this.nslot = growI32(this.nslot, c);
      this.parent = growI32(this.parent, c);
      this.first = growI32(this.first, c);
      this.last = growI32(this.last, c);
    }
    this.reservePool(n);
    for (let i = 0; i < n; i++) {
      this.pool[this.np + i] = this.stk[mark + i];
    }
    this.kind[id] = kind;
    this.slot[id] = this.np;
    this.nslot[id] = n;
    this.parent[id] = -1;
    this.np = this.np + n;
    this.nn = id + 1;
    this.sp = mark;
    // parents, first and last tokens
    const shape = csTypeShape(csKindType(kind));
    if (toI32(shape.length) !== n) {
      panic(`node ${kind}: ${n} slots, shape ${shape}`);
    }
    let first = -1;
    let last = -1;
    const lx = this.lx;
    for (let i = 0; i < n; i++) {
      const v = this.pool[this.slot[id] + i];
      if (v < 0) {
        continue;
      }
      const c = shape.charCodeAt(i) | 32;
      if (c === 110) {
        // n
        this.parent[v] = id;
        if (this.first[v] >= 0) {
          if (first < 0) {
            first = this.first[v];
          }
          last = this.last[v];
        }
      } else if (c === 116) {
        // t
        lx.parent[v] = id;
        if (first < 0) {
          first = v;
        }
        last = v;
      } else {
        const off = this.lsOff[v];
        const len = this.lsLen[v];
        for (let j = 0; j < len; j++) {
          const e = this.pool[off + j];
          if (e < 0) {
            continue;
          }
          const isTok = c === 107 || (c === 115 && (j & 1) === 1);
          if (isTok) {
            lx.parent[e] = id;
            if (first < 0) {
              first = e;
            }
            last = e;
          } else {
            this.parent[e] = id;
            if (this.first[e] >= 0) {
              if (first < 0) {
                first = this.first[e];
              }
              last = this.last[e];
            }
          }
        }
      }
    }
    this.first[id] = first;
    this.last[id] = last;
    return id;
  }

  // ---- reading ----

  /** Slot i of node n. */
  s(n: i32, i: i32): i32 {
    return this.pool[this.slot[n] + i];
  }

  /** The syntax type of node n. */
  ty(n: i32): i32 {
    return csKindType(this.kind[n]);
  }

  /** Whether node n is of syntax type y or a subtype of it. */
  is(n: i32, y: i32): boolean {
    if (n < 0) {
      return false;
    }
    let t = csKindType(this.kind[n]);
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
    const p = this.parent[n];
    return p < 0 ? 0 : csKindType(this.kind[p]);
  }

  /** The number of elements of list l (separators not counted for a separated list). */
  count(l: i32): i32 {
    return l < 0 ? 0 : this.lsLen[l];
  }

  /** Raw entry j of list l. */
  at(l: i32, j: i32): i32 {
    return this.pool[this.lsOff[l] + j];
  }

  /** Element j of a separated list. */
  sel(l: i32, j: i32): i32 {
    return this.pool[this.lsOff[l] + j * 2];
  }

  /** The number of elements of a separated list. */
  scount(l: i32): i32 {
    return l < 0 ? 0 : (this.lsLen[l] + 1) / 2;
  }

  /** The number of separators of a separated list. */
  sepCount(l: i32): i32 {
    return l < 0 ? 0 : this.lsLen[l] / 2;
  }

  /** Separator j of a separated list. */
  sep(l: i32, j: i32): i32 {
    return this.pool[this.lsOff[l] + j * 2 + 1];
  }

  // ---- text ----

  /** The start of node n's full text (its leading trivia included). */
  fullStart(n: i32): i32 {
    const t = this.first[n];
    if (t < 0) {
      return -1;
    }
    const lx = this.lx;
    return lx.l0[t] < lx.l1[t] ? lx.trStart[lx.l0[t]] : lx.start[t];
  }

  fullEnd(n: i32): i32 {
    const t = this.last[n];
    if (t < 0) {
      return -1;
    }
    const lx = this.lx;
    return lx.t0[t] < lx.t1[t] ? lx.trEnd[lx.t1[t] - 1] : lx.end[t];
  }

  /** The start of n's text without its leading trivia. */
  spanStart(n: i32): i32 {
    const t = this.first[n];
    return t < 0 ? -1 : this.lx.start[t];
  }

  spanEnd(n: i32): i32 {
    const t = this.last[n];
    return t < 0 ? -1 : this.lx.end[t];
  }

  tokText(t: i32): string {
    return String.fromBytes(this.src, this.lx.start[t], this.lx.end[t]);
  }

  tokLen(t: i32): i32 {
    return this.lx.end[t] - this.lx.start[t];
  }

  /** Whether token t's text is `w`. */
  tokIs(t: i32, w: string): boolean {
    const a = this.lx.start[t];
    const n = this.lx.end[t] - a;
    if (n !== toI32(w.length)) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (toI32(this.src[a + i]) !== w.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
}
