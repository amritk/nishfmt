// Style/ExpandPathArguments.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_SELECTOR, NT_CBASE, NT_CONST, NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";

/** `(const {nil? cbase} :Name)` */
const rbEpaConst = (src: RbSource, n: i32, name: string): boolean => {
  const a = src.a;
  if (n === V_NIL || !a.isNode(n) || a.type(n) !== NT_CONST || a.text(a.kid(n, 1)) !== name) {
    return false;
  }
  const s = a.kid(n, 0);
  return s === V_NIL || (a.isNode(s) && a.type(s) === NT_CBASE);
};

/** `(send recv :m args...)` with `k` arguments. */
const rbEpaSend = (src: RbSource, n: i32, m: string, k: i32): boolean => {
  const a = src.a;
  return n !== V_NIL && a.isNode(n) && a.type(n) === NT_SEND && a.text(a.kid(n, 1)) === m && a.nKid(n) === k + 2;
};

/** `path.split('/')` (trailing empty fields dropped). */
const rbEpaSplit = (s: string): string[] => {
  const out: string[] = [];
  let from = 0;
  const n = toI32(s.length);
  for (let i = 0; i <= n; i++) {
    if (i === n || s.charCodeAt(i) === 47) {
      out.push(s.substring(from, i));
      from = i + 1;
    }
  }
  while (out.length > 0 && out[out.length - 1].length === 0) {
    out.pop();
  }
  return out;
};

/** depth: the parts that are not `.`. */
const rbEpaDepth = (s: string): i32 => {
  let k = 0;
  for (const p of rbEpaSplit(s)) {
    if (p !== ".") {
      k++;
    }
  }
  return k;
};

/** parent_path: without the `.` parts and the first `..`. */
const rbEpaParent = (s: string): string => {
  const parts: string[] = [];
  for (const p of rbEpaSplit(s)) {
    if (p !== ".") {
      parts.push(p);
    }
  }
  const out: string[] = [];
  let dropped = false;
  for (const p of parts) {
    if (!dropped && p === "..") {
      dropped = true;
      continue;
    }
    out.push(p);
  }
  return out.join("/");
};

export class CopStyleExpandPathArguments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ExpandPathArguments");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "expand_path") {
        continue;
      }
      if (a.nKid(n) === 4 && rbEpaConst(src, a.kid(n, 0), "File")) {
        // file_expand_path
        const cur = a.kid(n, 2);
        const dir = a.kid(n, 3);
        if (src.nodeSrc(dir) !== "__FILE__" || !a.isNode(cur) || a.type(cur) !== NT_STR) {
          continue;
        }
        const k = this.c.offense(rnS(src, n, F_SELECTOR), rnE(src, n, F_SELECTOR));
        if (k === null) {
          continue;
        }
        const stripped = src.src(a.exS(cur) + 1, a.exE(cur) - 1);
        const d = rbEpaDepth(stripped);
        if (d === 0 || d === 1) {
          k.replace(a.exS(cur), a.exE(dir), d === 0 ? "__FILE__" : "__dir__");
        } else {
          k.replace(a.exS(cur), a.exE(cur), `'${rbEpaParent(stripped)}'`);
          k.replace(a.exS(dir), a.exE(dir), "__dir__");
        }
        this.c.commit(k);
        continue;
      }
      if (a.nKid(n) !== 2) {
        continue;
      }
      const par = a.kid(n, 0);
      if (!rbEpaSend(src, par, "parent", 0)) {
        continue;
      }
      const pn = a.kid(par, 0);
      let dir = V_NIL;
      if (rbEpaSend(src, pn, "Pathname", 1) && a.kid(pn, 0) === V_NIL) {
        dir = a.kid(pn, 2);
      } else if (rbEpaSend(src, pn, "new", 1) && rbEpaConst(src, a.kid(pn, 0), "Pathname")) {
        dir = a.kid(pn, 2);
      } else {
        continue;
      }
      if (src.nodeSrc(dir) !== "__FILE__") {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      k.replace(a.exS(dir), a.exE(dir), "__dir__");
      // remove_parent_method
      if (rnHas(src, par, F_DOT)) {
        k.remove(rnS(src, par, F_DOT), rnE(src, par, F_DOT));
      }
      k.remove(rnS(src, par, F_SELECTOR), rnE(src, par, F_SELECTOR));
      this.c.commit(k);
    }
  }
}
