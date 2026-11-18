// Lint/RedundantStringCoercion.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_BEGIN, NT_DSTR, NT_DSYM, NT_REGEXP, NT_SEND, NT_XSTR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopLintRedundantStringCoercion {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantStringCoercion");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DSTR || t === NT_XSTR || t === NT_DSYM || t === NT_REGEXP) {
        for (let i = 0; i < a.nKid(n); i++) {
          const b = a.kid(n, i);
          if (!ssxIs(src, b, NT_BEGIN) || a.nKid(b) === 0) {
            continue;
          }
          const f = a.kid(b, -1);
          if (ssxIsCall(src, f) && ssxMeth(src, f) === "to_s" && a.nKid(f) === 2) {
            this.register(src, f);
          }
        }
      } else if (t === NT_SEND && a.kid(n, 0) === V_NIL) {
        const m = ssxMeth(src, n);
        if (m !== "print" && m !== "puts" && m !== "warn") {
          continue;
        }
        for (let i = 2; i < a.nKid(n); i++) {
          const ch = a.kid(n, i);
          if (ssxIsCall(src, ch) && ssxMeth(src, ch) === "to_s" && a.nKid(ch) === 2) {
            this.register(src, ch);
          }
        }
      }
    }
  }

  private register(src: RbSource, n: i32): void {
    const a = src.a;
    const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
    if (k !== null) {
      const r = a.kid(n, 0);
      k.replace(a.exS(n), a.exE(n), r !== V_NIL ? src.nodeSrc(r) : "self");
      this.c.commit(k);
    }
  }
}
