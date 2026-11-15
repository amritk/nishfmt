// Lint/RandOne (no correction): `rand(1)`, `rand(-1)`, `rand(1.0)` or
// `rand(-1.0)`, bare or on Kernel.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_FLOAT, NT_INT, NT_SEND, rbFloatInspect } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhNilOrKernel, ldhType } from "./lint_detect_help";
import { ssxMeth } from "./style_syntax_help";

export class CopLintRandOne {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RandOne");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.nKid(n) !== 3 || ssxMeth(src, n) !== "rand" || !ldhNilOrKernel(src, a.kid(n, 0))) {
        continue;
      }
      const x = a.kid(n, 2);
      const t = ldhType(src, x);
      // the literal's value as Integer#to_s / Float#to_s (a float child holds its source text)
      const v = t === NT_INT ? a.text(a.kid(x, 0)) : t === NT_FLOAT ? rbFloatInspect(a.text(a.kid(x, 0))) : "";
      if ((t === NT_INT && (v === "1" || v === "-1")) || (t === NT_FLOAT && (v === "1.0" || v === "-1.0"))) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
