// Lint/DuplicateCaseCondition (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CASE, NT_WHEN } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxIs } from "./style_syntax_help";

export class CopLintDuplicateCaseCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DuplicateCaseCondition");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_CASE) {
        continue;
      }
      const prev: i32[] = [];
      for (let i = 1; i < a.nKid(n); i++) {
        const w = a.kid(n, i);
        if (!ssxIs(src, w, NT_WHEN)) {
          continue;
        }
        for (let j = 0; j < a.nKid(w) - 1; j++) {
          const cond = a.kid(w, j);
          let dup = false;
          for (const p of prev) {
            if (ssxAstEqual(a, p, a, cond)) {
              dup = true;
              break;
            }
          }
          if (dup) {
            this.c.offense(a.exS(cond), a.exE(cond));
          } else {
            prev.push(cond);
          }
        }
      }
    }
  }
}
