// Lint/UnifiedInteger (TargetRubyVersion 3.3).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_CONST } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst } from "./style_syntax_help";

export class CopLintUnifiedInteger {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UnifiedInteger");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_CONST || !(ssxGlobalConst(src, n, "Fixnum") || ssxGlobalConst(src, n, "Bignum"))) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        k.replace(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME), "Integer");
        this.c.commit(k);
      }
    }
  }
}
