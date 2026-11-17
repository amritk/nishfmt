// Lint/NextWithoutAccumulator (no correction): a bare `next` in a
// multi-statement `reduce(x)`/`inject(x)` block.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_NEXT, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAncestorBlock, ldhType } from "./lint_detect_help";
import { scnEachNode } from "./style_cond_help";
import { ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopLintNextWithoutAccumulator {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/NextWithoutAccumulator");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsAnyBlock(src, n)) {
        continue;
      }
      // (block (call _recv {:reduce :inject} !sym) _ $(begin ...))
      const s = a.kid(n, 0);
      if (!ssxIsCall(src, s) || a.nKid(s) !== 3) {
        continue;
      }
      const m = ssxMeth(src, s);
      if ((m !== "reduce" && m !== "inject") || ldhType(src, a.kid(s, 2)) === NT_SYM) {
        continue;
      }
      const body = a.kid(n, 2);
      if (ldhType(src, body) !== NT_BEGIN) {
        continue;
      }
      for (const x of scnEachNode(src, body, NT_NEXT)) {
        if (a.nKid(x) === 0 && ldhAncestorBlock(src, x) === n) {
          this.c.offense(a.exS(x), a.exE(x));
          break;
        }
      }
    }
  }
}
