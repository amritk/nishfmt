// Style/NumericPredicate (EnforcedStyle: predicate, AllowedMethods: [],
// Exclude: spec/**/*; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_GVAR, NT_INT, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIntValue, ssxIs, ssxMeth } from "./style_syntax_help";

/** (send _ :& _). */
const rbNpAnd = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "&" && src.a.nKid(n) === 3;

/** (int 0). */
const rbNpZero = (src: RbSource, h: i32): boolean => ssxIs(src, h, NT_INT) && ssxIntValue(src, h) === 0;

/** [$(...) !gvar_type?]: a node that is no global variable. */
const rbNpNumeric = (src: RbSource, h: i32): boolean => src.a.isNode(h) && !ssxIs(src, h, NT_GVAR);

export class CopStyleNumericPredicate {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NumericPredicate");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    let path = src.p.st.path;
    while (path.startsWith("./")) {
      path = path.substring(2, toI32(path.length));
    }
    if (path.startsWith("spec/")) {
      return;
    }
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "==" && m !== ">" && m !== "<") {
        continue;
      }
      const r = a.kid(n, 0);
      const x = a.kid(n, 2);
      // comparison || inverted_comparison
      if (!((rbNpNumeric(src, r) && rbNpZero(src, x)) || (rbNpZero(src, r) && rbNpNumeric(src, x)))) {
        continue;
      }
      // handled_by_bitwise_predicate? (Style/BitwisePredicate's Enabled is `pending`, which is truthy)
      if (m === "==" || m === ">") {
        if (rbNpZero(src, x) && (rbNpAnd(src, r) || (ssxIs(src, r, NT_BEGIN) && a.nKid(r) === 1 && rbNpAnd(src, a.kid(r, 0))))) {
          continue;
        }
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
