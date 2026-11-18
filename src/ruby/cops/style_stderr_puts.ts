// Style/StderrPuts.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_GVAR, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxGlobalConst, ssxIs, ssxMeth, ssxSymText } from "./style_syntax_help";

export class CopStyleStderrPuts {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StderrPuts");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "puts" || a.nKid(n) < 3) {
        continue;
      }
      const r = a.kid(n, 0);
      if (
        !(ssxIs(src, r, NT_GVAR) && ssxSymText(src, a.kid(r, 0)) === "$stderr") &&
        !ssxGlobalConst(src, r, "STDERR")
      ) {
        continue;
      }
      const s = a.exS(n);
      const e = ssxFE(src, n, F_SELECTOR);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "warn");
        this.c.commit(k);
      }
    }
  }
}
