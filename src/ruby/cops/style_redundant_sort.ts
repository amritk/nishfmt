// Style/RedundantSort (unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_SELECTOR, NT_AND, NT_INT, NT_OR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbNodeReceiver } from "./style_float_division";
import { ssxFS, ssxHas, ssxIntValue, ssxIs, ssxIsAnyBlock, ssxIsCall, ssxIsSpace, ssxMeth } from "./style_syntax_help";

/** {(int 0) (int -1)}. */
const rbRsZeroOrLast = (src: RbSource, n: i32): boolean =>
  ssxIs(src, n, NT_INT) && (ssxIntValue(src, n) === 0 || ssxIntValue(src, n) === -1);

/** redundant_sort?: the sort call of a matching accessor `n`, or V_NIL. */
const rbRsMatch = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!ssxIsCall(src, n)) {
    return V_NIL;
  }
  const m = ssxMeth(src, n);
  const k = a.nKid(n) - 2;
  const firstLast = (m === "last" || m === "first") && k === 0;
  const index = (m === "[]" || m === "at" || m === "slice") && k === 1 && rbRsZeroOrLast(src, a.kid(n, 2));
  if (!firstLast && !index) {
    return V_NIL;
  }
  const r = a.kid(n, 0);
  if (ssxIsCall(src, r)) {
    const rm = ssxMeth(src, r);
    const rk = a.nKid(r) - 2;
    if (rm === "sort" && rk === 0) {
      return r;
    }
    if (rm === "sort_by" && rk === 1 && (firstLast || (ssxIs(src, n, NT_SEND) && ssxIs(src, r, NT_SEND)))) {
      return r;
    }
    return V_NIL;
  }
  if (ssxIsAnyBlock(src, r)) {
    const s = a.kid(r, 0);
    if (ssxIsCall(src, s) && a.nKid(s) === 2 && (ssxMeth(src, s) === "sort" || ssxMeth(src, s) === "sort_by")) {
      return s;
    }
  }
  return V_NIL;
};

/** String#strip emptiness. */
const rbRsBlank = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (!ssxIsSpace(c) && c !== 0) {
      return false;
    }
  }
  return true;
};

export class CopStyleRedundantSort {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantSort");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n)) {
        continue;
      }
      const nm = ssxMeth(src, n);
      if (nm !== "sort" && nm !== "sort_by") {
        continue;
      }
      const p = src.parent(n);
      let node = V_NIL;
      let sortNode = V_NIL;
      if (p !== V_NIL) {
        sortNode = rbRsMatch(src, p);
        node = p;
        if (sortNode === V_NIL) {
          const g = src.parent(p);
          if (g !== V_NIL) {
            sortNode = rbRsMatch(src, g);
            node = g;
          }
        }
      }
      if (sortNode === V_NIL) {
        continue;
      }
      if (this.keptApart(src, node)) {
        continue;
      }
      this.c.note(ssxFS(src, sortNode, F_SELECTOR), a.exE(node));
    }
  }

  /** code_after_accessor_kept_apart?. */
  private keptApart(src: RbSource, node: i32): boolean {
    const a = src.a;
    const p = src.parent(node);
    if (ssxIs(src, p, NT_AND) || ssxIs(src, p, NT_OR)) {
      return false;
    }
    const recv = rbNodeReceiver(src, node);
    const s = a.exE(recv);
    const e = ssxHas(src, node, F_DOT) ? ssxFS(src, node, F_DOT) : ssxFS(src, node, F_SELECTOR);
    const between = src.src(s, e);
    if (between.indexOf("\n", 0) < 0 || rbRsBlank(between)) {
      return false;
    }
    const end = a.exE(node);
    const rest = src.src(end, src.lineEnd(src.line(end)));
    let i = 0;
    while (i < toI32(rest.length) && (ssxIsSpace(rest.charCodeAt(i)) || rest.charCodeAt(i) === 0)) {
      i++;
    }
    if (i >= toI32(rest.length)) {
      return false;
    }
    const c = rest.charCodeAt(i);
    if (c === 35 || c === 46 || c === 41 || c === 93 || c === 125) {
      return false;
    }
    if (c === 38 && i + 1 < toI32(rest.length) && rest.charCodeAt(i + 1) === 46) {
      return false;
    }
    return true;
  }
}
