// Lint/SafeNavigationWithEmpty.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CSEND, NT_IF } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintSafeNavigationWithEmpty {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SafeNavigationWithEmpty");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF) {
        continue;
      }
      const cond = a.kid(n, 0);
      if (
        !ssxIs(src, cond, NT_CSEND) ||
        ssxMeth(src, cond) !== "empty?" ||
        a.nKid(cond) !== 2 ||
        ssxIs(src, a.kid(cond, 0), NT_CSEND)
      ) {
        continue;
      }
      const k = this.c.offense(a.exS(cond), a.exE(cond));
      if (k !== null) {
        const r = src.nodeSrc(a.kid(cond, 0));
        k.replace(a.exS(cond), a.exE(cond), `${r} && ${r}.empty?`);
        this.c.commit(k);
      }
    }
  }
}
