// Style/MultipleComparison (AllowMethodComparison: true, ComparisonsThreshold: 2).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_LVAR, NT_OR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnAstEqual } from "./style_cond_reparse";
import { ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopStyleMultipleComparison {
  c: RbCop;
  vars: i32[];
  values: i32[];
  skipped: i32[];

  constructor() {
    this.c = new RbCop("Style/MultipleComparison");
    this.vars = [];
    this.values = [];
    this.skipped = [];
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_OR) {
        continue;
      }
      // root_of_or_node
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_OR) {
        continue;
      }
      if (!this.nested(src, n)) {
        continue;
      }
      const nv: i32[] = [];
      const nx: i32[] = [];
      const ns: i32[] = [];
      this.vars = nv;
      this.values = nx;
      this.skipped = ns;
      this.find(src, n);
      if (this.vars.length === 0 || this.values.length < 2) {
        continue;
      }
      const fv = this.values[0];
      const lv = this.values[this.values.length - 1];
      const s = a.exS(src.parent(fv));
      const e = a.exE(src.parent(lv));
      let skip = false;
      for (const x of this.skipped) {
        const xs = a.exS(x);
        const xe = a.exE(x);
        if (s <= xs && xe <= e && (s !== xs || e !== xe)) {
          skip = true;
        }
      }
      if (skip) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      const parts: string[] = [];
      for (const v of this.values) {
        parts.push(src.nodeSrc(v));
      }
      const v0 = this.vars[0];
      const arg = ssxIs(src, v0, NT_LVAR) ? a.text(a.kid(v0, 0)) : src.nodeSrc(v0);
      k.replace(s, e, `[${parts.join(", ")}].include?(${arg})`);
      this.c.commit(k);
    }
  }

  /** simple_comparison: [var, obj] or null. */
  private simple(src: RbSource, n: i32): i32[] | null {
    const a = src.a;
    if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "==" || a.nKid(n) !== 3) {
      return null;
    }
    const l = a.kid(n, 0);
    const r = a.kid(n, 2);
    if (ssxIs(src, l, NT_LVAR) || ssxIsCall(src, l)) {
      const out: i32[] = [l, r];
      return out;
    }
    if (ssxIs(src, r, NT_LVAR) || ssxIsCall(src, r)) {
      const out: i32[] = [r, l];
      return out;
    }
    return null;
  }

  /** nested_comparison? */
  private nested(src: RbSource, n: i32): boolean {
    if (!ssxIs(src, n, NT_OR)) {
      return false;
    }
    for (let i = 0; i < 2; i++) {
      const c = src.a.kid(n, i);
      if (this.simple(src, c) === null && !this.nested(src, c)) {
        return false;
      }
    }
    return true;
  }

  /** find_offending_var. */
  private find(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxIs(src, n, NT_OR)) {
      this.find(src, a.kid(n, 0));
      this.find(src, a.kid(n, 1));
      return;
    }
    // simple_double_comparison?: (send lvar :== lvar)
    if (
      ssxIs(src, n, NT_SEND) &&
      ssxMeth(src, n) === "==" &&
      a.nKid(n) === 3 &&
      ssxIs(src, a.kid(n, 0), NT_LVAR) &&
      ssxIs(src, a.kid(n, 2), NT_LVAR)
    ) {
      return;
    }
    const cmp = this.simple(src, n);
    if (cmp === null) {
      return;
    }
    const v = cmp[0];
    const obj = cmp[1];
    if (ssxIsCall(src, obj)) {
      this.skipped.push(n);
      return;
    }
    let known = false;
    for (const x of this.vars) {
      if (scnAstEqual(a, x, a, v, false)) {
        known = true;
      }
    }
    if (!known) {
      this.vars.push(v);
    }
    if (this.vars.length > 1) {
      return;
    }
    this.values.push(obj);
  }
}
