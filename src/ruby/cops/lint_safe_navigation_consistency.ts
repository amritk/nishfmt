// Lint/SafeNavigationConsistency (its correction is unsafe; detection only;
// AllowedMethods: [present? blank? presence try try!]): in an `&&`/`||`
// chain, calls on the same receiver that use `&.` where `.` suffices, or `.`
// where `&.` is needed.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, NT_AND, NT_BEGIN, NT_CSEND, NT_OR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhNilMethod, ldhOperatorKeyword } from "./lint_detect_help";
import { ssxFE, ssxFS, ssxHas, ssxIsCall, ssxLocIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

// Truthiness values (child_truthiness); LSNC_NONE is nil.
const LSNC_NONE: i32 = 0;
const LSNC_TRUTHY: i32 = 1;
const LSNC_FALSEY: i32 = 2;
const LSNC_UNKNOWN: i32 = 3;

export class CopLintSafeNavigationConsistency {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SafeNavigationConsistency");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_AND && t !== NT_OR) {
        continue;
      }
      const ops: i32[] = [];
      this.collect(src, n, ops);
      // group_by receiver source, keys in first-seen order
      const keys: string[] = [];
      const groups: i32[][] = [];
      for (const o of ops) {
        const r = a.kid(o, 0);
        const key = r === V_NIL ? "" : src.src(a.exS(r), a.exE(r));
        let gi = -1;
        for (let i = 0; i < toI32(keys.length); i++) {
          if (keys[i] === key) {
            gi = i;
          }
        }
        if (gi < 0) {
          keys.push(key);
          const g: i32[] = [];
          groups.push(g);
          gi = toI32(groups.length) - 1;
        }
        groups[gi].push(o);
      }
      for (const g of groups) {
        this.group(src, g);
      }
    }
  }

  /** collect_operands / operand_nodes. */
  private collect(src: RbSource, n: i32, out: i32[]): void {
    for (let i = 0; i < 2; i++) {
      const o = src.a.kid(n, i);
      if (ldhOperatorKeyword(src, o)) {
        this.collect(src, o, out);
      } else if (ssxIsCall(src, o)) {
        out.push(o);
      }
    }
  }

  private nilable(src: RbSource, o: i32): boolean {
    if (src.a.type(o) === NT_CSEND) {
      return true;
    }
    const m = ssxMeth(src, o);
    return ldhNilMethod(m) || m === "to_d" || m === "present?" || m === "blank?" || m === "presence" || m === "try" || m === "try!";
  }

  private group(src: RbSource, g: i32[]): void {
    const a = src.a;
    // most_left_indices
    let csAnd = -1;
    let csOr = -1;
    let sAnd = -1;
    let sOr = -1;
    for (let i = 0; i < toI32(g.length); i++) {
      const o = g[i];
      const pt = a.type(src.parent(o));
      const cs = a.type(o) === NT_CSEND;
      if (pt === NT_AND && cs && csAnd < 0) {
        csAnd = i;
      }
      if (pt === NT_OR && cs && csOr < 0) {
        csOr = i;
      }
      if (pt === NT_AND && !this.nilable(src, o) && sAnd < 0) {
        sAnd = i;
      }
      if (pt === NT_OR && !this.nilable(src, o) && sOr < 0) {
        sOr = i;
      }
    }
    // find_consistent_parts
    if (csAnd >= 0 && csOr >= 0 && csAnd < csOr) {
      return;
    }
    let safe = false;
    let from = -1;
    if (csAnd >= 0) {
      from = (sAnd >= 0 && sAnd < csAnd ? sAnd : csAnd) + 1;
    } else if (sOr >= 0 && csOr >= 0) {
      if (sOr < csOr) {
        from = sOr + 1;
      } else {
        safe = true;
        from = csOr + 1;
      }
    } else if (sAnd >= 0 && csOr >= 0 && sAnd < csOr) {
      from = csOr;
    } else {
      return;
    }
    for (let i = from; i < toI32(g.length); i++) {
      const o = g[i];
      // already_appropriate_call?
      const operator = ssxOperatorName(ssxMeth(src, o));
      if (safe && ssxLocIs(src, o, F_DOT, "&.")) {
        continue;
      }
      if (!safe && (ssxLocIs(src, o, F_DOT, ".") || operator)) {
        continue;
      }
      if (!safe && !this.receiverGuaranteed(src, g, i)) {
        continue;
      }
      if (operator) {
        this.c.offense(a.exS(o), a.exE(o));
      } else if (ssxHas(src, o, F_DOT)) {
        this.c.offense(ssxFS(src, o, F_DOT), ssxFE(src, o, F_DOT));
      }
    }
  }

  /** receiver_guaranteed?: an operand before g[i] guarantees its receiver. */
  private receiverGuaranteed(src: RbSource, g: i32[], i: i32): boolean {
    for (let j = 0; j < i; j++) {
      if (this.guaranteedBy(src, g[j], g[i])) {
        return true;
      }
    }
    return false;
  }

  /** guaranteed_by?. */
  private guaranteedBy(src: RbSource, guard: i32, operand: i32): boolean {
    const a = src.a;
    // logical_path: [node, child] pairs from the guard up to a common ancestor
    const pn: i32[] = [];
    const pc: i32[] = [];
    let child = guard;
    let node = src.parent(guard);
    let found = false;
    while (node !== V_NIL) {
      if (a.type(node) !== NT_BEGIN) {
        if (!ldhOperatorKeyword(src, node)) {
          return false;
        }
        pn.push(node);
        pc.push(child);
      }
      if (this.ancestorOf(src, node, operand)) {
        found = true;
        break;
      }
      child = node;
      node = src.parent(node);
    }
    if (!found || pn.length === 0) {
      return false;
    }
    const k = toI32(pn.length);
    let truth = a.type(pn[k - 1]) === NT_AND ? LSNC_TRUTHY : LSNC_FALSEY;
    for (let j = k - 2; j >= 0; j--) {
      const nd = pn[j];
      const deciding = a.type(nd) === NT_AND ? LSNC_TRUTHY : LSNC_FALSEY;
      if (a.kid(nd, 0) === pc[j]) {
        truth = truth === deciding ? deciding : LSNC_UNKNOWN;
      } else {
        truth = truth === deciding ? deciding : LSNC_NONE;
      }
      if (truth === LSNC_NONE) {
        return false;
      }
    }
    return a.type(guard) !== NT_CSEND || truth === LSNC_TRUTHY;
  }

  /** Whether x is a proper ancestor of y. */
  private ancestorOf(src: RbSource, x: i32, y: i32): boolean {
    let p = src.parent(y);
    while (p !== V_NIL) {
      if (p === x) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }
}

