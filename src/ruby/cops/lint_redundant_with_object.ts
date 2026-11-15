// Lint/RedundantWithObject (its correction is unsafe; detection only):
// `each_with_object(x)` / `with_object(x)` on a block that takes one
// argument.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_ARG, NT_ARGS, NT_BLOCK, NT_NUMBLOCK } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhType } from "./lint_detect_help";
import { ssxFS, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopLintRedundantWithObject {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantWithObject");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      const s = a.kid(n, 0);
      const m = ssxMeth(src, s);
      if (!ssxIsCall(src, s) || a.nKid(s) !== 3 || (m !== "each_with_object" && m !== "with_object")) {
        continue;
      }
      const args = a.kid(n, 1);
      if (t === NT_BLOCK) {
        if (ldhType(src, args) !== NT_ARGS || a.nKid(args) !== 1 || ldhType(src, a.kid(args, 0)) !== NT_ARG) {
          continue;
        }
      } else if (a.text(args) !== "1") {
        continue;
      }
      this.c.offense(ssxFS(src, s, F_SELECTOR), a.exE(s));
    }
  }
}
