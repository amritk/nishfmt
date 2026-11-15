// Lint/FloatComparison (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CASE, NT_COMPLEX, NT_CSEND, NT_FLOAT, NT_INT, NT_NIL, NT_RATIONAL, NT_SEND, NT_WHEN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lforFloatClass } from "./lint_float_out_of_range";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** A numeric node's value.zero?. */
const lfcZero = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (t === NT_INT) {
    const s = src.a.text(src.a.kid(n, 0));
    return s === "0" || s === "-0";
  }
  return lforFloatClass(src.nodeSrc(n)) === 0;
};

export class CopLintFloatComparison {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/FloatComparison");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND || t === NT_CSEND) {
        const m = ssxMeth(src, n);
        if ((m !== "==" && m !== "!=" && m !== "eql?" && m !== "equal?") || a.nKid(n) !== 3) {
          continue;
        }
        const l = a.kid(n, 0);
        const r = a.kid(n, 2);
        if (this.literalSafe(src, l) || this.literalSafe(src, r)) {
          continue;
        }
        if (this.isFloat(src, l) || this.isFloat(src, r)) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      } else if (t === NT_CASE) {
        for (let i = 1; i < a.nKid(n); i++) {
          const w = a.kid(n, i);
          if (!ssxIs(src, w, NT_WHEN)) {
            continue;
          }
          for (let j = 0; j < a.nKid(w) - 1; j++) {
            const cond = a.kid(w, j);
            if (!this.isFloat(src, cond) || this.literalSafe(src, cond)) {
              continue;
            }
            this.c.offense(a.exS(cond), a.exE(cond));
          }
        }
      }
    }
  }

  private isFloat(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (n === V_NIL || !a.isNode(n)) {
      return false;
    }
    const t = a.type(n);
    if (t === NT_FLOAT) {
      return true;
    }
    if (t === NT_SEND) {
      return this.floatSend(src, n);
    }
    if (t === NT_BEGIN) {
      return a.nKid(n) > 0 && this.isFloat(src, a.kid(n, 0));
    }
    return false;
  }

  private literalSafe(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (n === V_NIL || !a.isNode(n)) {
      return false;
    }
    const t = a.type(n);
    if (t === NT_BEGIN) {
      return a.nKid(n) > 0 && this.literalSafe(src, a.kid(n, 0));
    }
    const numeric = t === NT_INT || t === NT_FLOAT || t === NT_RATIONAL || t === NT_COMPLEX;
    return (numeric && lfcZero(src, n)) || t === NT_NIL;
  }

  private floatSend(src: RbSource, n: i32): boolean {
    const a = src.a;
    const m = ssxMeth(src, n);
    if (m === "+" || m === "-" || m === "*" || m === "/" || m === "%" || m === "**") {
      return this.isFloat(src, a.kid(n, 0)) || this.isFloat(src, a.nKid(n) > 2 ? a.kid(n, 2) : V_NIL);
    }
    if (m === "to_f" || m === "Float" || m === "fdiv") {
      return true;
    }
    const r = a.kid(n, 0);
    if (!ssxIs(src, r, NT_FLOAT)) {
      return false;
    }
    if (m === "@-" || m === "abs" || m === "magnitude" || m === "modulo" || m === "next_float" || m === "prev_float" || m === "quo") {
      return true;
    }
    if (m === "angle" || m === "arg" || m === "phase") {
      const s = src.nodeSrc(r);
      return s.startsWith("-") && lforFloatClass(s) !== 0;
    }
    if (m === "ceil" || m === "floor" || m === "round" || m === "truncate") {
      const p = a.nKid(n) > 2 ? a.kid(n, 2) : V_NIL;
      if (!ssxIs(src, p, NT_INT)) {
        return false;
      }
      const v = a.text(a.kid(p, 0));
      return !v.startsWith("-") && v !== "0";
    }
    return false;
  }
}
