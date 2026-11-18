// Lint/BooleanSymbol. Its correction is unsafe, so it only detects.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_ARRAY, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas } from "./style_syntax_help";

export class CopLintBooleanSymbol {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/BooleanSymbol");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SYM) {
        continue;
      }
      const v = a.text(a.kid(n, 0));
      if (v !== "true" && v !== "false") {
        continue;
      }
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_ARRAY && ssxHas(src, p, F_BEGIN)) {
        // percent_literal?(:symbol): loc.begin matches /\A%[iI]/
        const b = src.src(ssxFS(src, p, F_BEGIN), ssxFE(src, p, F_BEGIN));
        if (b.startsWith("%i") || b.startsWith("%I")) {
          continue;
        }
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
