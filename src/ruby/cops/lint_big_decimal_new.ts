// Lint/BigDecimalNew.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_SELECTOR, NT_CBASE, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxHas, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintBigDecimalNew {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/BigDecimalNew");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "new" || !ssxGlobalConst(src, a.kid(n, 0), "BigDecimal")) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (k === null) {
        continue;
      }
      k.remove(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (ssxHas(src, n, F_DOT)) {
        k.remove(ssxFS(src, n, F_DOT), ssxFE(src, n, F_DOT));
      }
      const cb = a.kid(a.kid(n, 0), 0);
      if (cb !== V_NIL && ssxIs(src, cb, NT_CBASE)) {
        k.remove(a.exS(cb), a.exE(cb));
      }
      this.c.commit(k);
    }
  }
}
