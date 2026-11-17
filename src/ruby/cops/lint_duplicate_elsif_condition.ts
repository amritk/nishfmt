// Lint/DuplicateElsifCondition (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnElseBranch, scnKeyword } from "./style_cond_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxIs } from "./style_syntax_help";

export class CopLintDuplicateElsifCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DuplicateElsifCondition");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n0 of src.pre) {
      if (a.type(n0) !== NT_IF) {
        continue;
      }
      const prev: i32[] = [];
      let n = n0;
      while (true) {
        const kw = scnKeyword(src, n);
        if (kw !== "if" && kw !== "elsif") {
          break;
        }
        const cond = a.kid(n, 0);
        for (const p of prev) {
          if (ssxAstEqual(a, p, a, cond)) {
            this.c.offense(a.exS(cond), a.exE(cond));
            break;
          }
        }
        prev.push(cond);
        n = scnElseBranch(src, n);
        if (n === V_NIL || !ssxIs(src, n, NT_IF)) {
          break;
        }
      }
    }
  }
}
