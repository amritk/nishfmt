// Style/DoubleNegation (EnforcedStyle: allowed_in_returns; its correction is
// unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { atI32 } from "../../core/arr";
import {
  F_SELECTOR,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_HASH,
  NT_IF,
  NT_NUMBLOCK,
  NT_PAIR,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxLocIs, ssxMeth } from "./style_syntax_help";

/** negation?: a `!` send. */
const rbDnNegation = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "!";

/** The child nodes of n. */
const rbDnChildNodes = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (src.a.isNode(src.a.kid(n, i))) {
      out.push(src.a.kid(n, i));
    }
  }
  return out;
};

/** find_last_child (V_NIL where RuboCop would raise). */
const rbDnLastChild = (src: RbSource, n: i32): i32 => {
  if (!src.a.isNode(n)) {
    return V_NIL;
  }
  const t = src.a.type(n);
  if (t === NT_RESCUE) {
    return rbDnLastChild(src, src.a.kid(n, 0));
  }
  const kids = rbDnChildNodes(src, n);
  if (t === NT_ENSURE) {
    return kids.length > 0 ? rbDnLastChild(src, kids[0]) : V_NIL;
  }
  return kids.length > 0 ? atI32(kids, toI32(kids.length) - 1) : V_NIL;
};

/** find_def_node_from_ascendant. */
const rbDnDefNode = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  let x = n;
  while (true) {
    const p = src.parent(x);
    if (p === V_NIL) {
      return V_NIL;
    }
    const t = a.type(p);
    if (t === NT_DEF || t === NT_DEFS) {
      return p;
    }
    if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      const kids = rbDnChildNodes(src, p);
      const child = kids.length > 0 ? kids[0] : V_NIL;
      if (ssxIs(src, child, NT_SEND)) {
        const m = ssxMeth(src, child);
        if (m === "define_method" || m === "define_singleton_method") {
          return child;
        }
      }
    }
    x = p;
  }
};

export class CopStyleDoubleNegation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/DoubleNegation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      // (send (send _ :!) :!), prefix `!`
      if (!rbDnNegation(src, n) || a.nKid(n) !== 2) {
        continue;
      }
      const inner = a.kid(n, 0);
      if (!rbDnNegation(src, inner) || a.nKid(inner) !== 2 || !ssxLocIs(src, n, F_SELECTOR, "!")) {
        continue;
      }
      // part_of_longer_negation?
      const p = src.parent(n);
      if (rbDnNegation(src, p) && a.kid(p, 0) === n) {
        continue;
      }
      if (rbDnNegation(src, a.kid(inner, 0))) {
        continue;
      }
      if (ssxIs(src, p, NT_RETURN)) {
        continue;
      }
      // end_of_method_definition? (raising where RuboCop would: no offense)
      const def = rbDnDefNode(src, n);
      if (def !== V_NIL) {
        const allowed = this.endOfMethod(src, n, def);
        if (allowed !== 0) {
          continue;
        }
      }
      this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
    }
  }

  /** end_of_method_definition?: 1 true, 0 false, -1 an error. */
  private endOfMethod(src: RbSource, n: i32, def: i32): i32 {
    const a = src.a;
    let cond = V_NIL;
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_CASE || t === NT_CASE_MATCH) {
        cond = p;
        break;
      }
      p = src.parent(p);
    }
    const last = rbDnLastChild(src, ssxIs(src, def, NT_SEND) ? def : a.kid(def, -1));
    if (last === V_NIL) {
      return -1;
    }
    if (cond !== V_NIL) {
      // double_negative_condition_return_value?
      let q = src.parent(n);
      while (q !== V_NIL && (ssxIs(src, q, NT_PAIR) || ssxIs(src, q, NT_HASH) || ssxIs(src, q, NT_ARRAY))) {
        q = src.parent(q);
      }
      if (q === V_NIL) {
        return -1;
      }
      if (ssxIs(src, q, NT_BEGIN)) {
        return src.line(a.exS(n)) === src.line(a.exE(q)) ? 1 : 0;
      }
      return src.line(a.exE(last)) <= src.line(a.exE(cond)) ? 1 : 0;
    }
    const lp = src.parent(last);
    if (ssxIs(src, last, NT_PAIR) || ssxIs(src, last, NT_HASH) || ssxIs(src, lp, NT_ARRAY)) {
      return 0;
    }
    return src.line(a.exS(last)) <= src.line(a.exS(n)) ? 1 : 0;
  }
}
