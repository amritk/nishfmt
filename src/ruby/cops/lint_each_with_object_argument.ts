// Lint/EachWithObjectArgument (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CSEND, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhImmutableLiteral } from "./lint_batch_help";
import { ssxMeth } from "./style_syntax_help";

export class CopLintEachWithObjectArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EachWithObjectArgument");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_SEND && t !== NT_CSEND) || a.nKid(n) !== 3 || ssxMeth(src, n) !== "each_with_object") {
        continue;
      }
      if (lbhImmutableLiteral(src, a.kid(n, 2))) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
