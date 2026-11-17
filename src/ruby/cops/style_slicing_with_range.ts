// Style/SlicingWithRange (unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_END, F_SELECTOR, NT_ERANGE, NT_INT, NT_IRANGE, NT_NIL, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIntValue, ssxIs, ssxIsCall, ssxLocIs, ssxMeth } from "./style_syntax_help";

/** (int <v>). */
const rbSwrInt = (src: RbSource, n: i32, v: i64): boolean => ssxIs(src, n, NT_INT) && ssxIntValue(src, n) === v;

export class CopStyleSlicingWithRange {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SlicingWithRange");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || ssxMeth(src, n) !== "[]" || a.nKid(n) !== 3) {
        continue;
      }
      const r = a.kid(n, 2);
      const dot = ssxHas(src, n, F_DOT);
      const os = dot ? ssxFS(src, n, F_DOT) : ssxFS(src, n, F_SELECTOR);
      const oe = dot ? a.exE(n) : ssxFE(src, n, F_SELECTOR);
      const ir = ssxIs(src, r, NT_IRANGE);
      const er = ssxIs(src, r, NT_ERANGE);
      if (!ir && !er) {
        continue;
      }
      const b = a.kid(r, 0);
      const e = a.kid(r, 1);
      // `nil` in these patterns is a nil literal node, not a missing end.
      const eNil = ssxIs(src, e, NT_NIL);
      let removal = -1;
      if ((ir && rbSwrInt(src, b, 0) && (rbSwrInt(src, e, -1) || eNil)) || (er && rbSwrInt(src, b, 0) && eNil)) {
        removal = 0;
      } else if (b !== V_NIL && ((ir && (rbSwrInt(src, e, -1) || eNil)) || (er && eNil))) {
        removal = 1;
      } else if (ir && ssxIs(src, b, NT_NIL) && e !== V_NIL) {
        removal = 1;
      } else {
        continue;
      }
      // unparenthesized_call?: a dot and no parentheses
      if (removal === 1 && dot && !ssxLocIs(src, n, F_END, ")")) {
        continue;
      }
      this.c.offense(os, oe);
    }
  }
}
