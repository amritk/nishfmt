// Lint/RequireParentheses (no correction): an unparenthesized call whose
// first argument is a ternary with an `and`/`or` condition, or a predicate
// call whose last argument is an `and`/`or`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_QUESTION, NT_CSEND, NT_IF, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAssignmentMethod, ldhOperatorKeyword, ldhType } from "./lint_detect_help";
import { ssxHas, ssxMeth, ssxParenthesized } from "./style_syntax_help";

export class CopLintRequireParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RequireParentheses");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_SEND && t !== NT_CSEND) || a.nKid(n) < 3 || ssxParenthesized(src, n)) {
        continue;
      }
      const first = a.kid(n, 2);
      const m = ssxMeth(src, n);
      if (ldhType(src, first) === NT_IF && ssxHas(src, first, F_QUESTION)) {
        // check_ternary
        const cond = a.kid(first, 0);
        if (m === "[]" || ldhAssignmentMethod(m) || !ldhOperatorKeyword(src, cond)) {
          continue;
        }
        this.c.offense(a.exS(n), a.exE(cond));
      } else if (m.endsWith("?")) {
        if (ldhOperatorKeyword(src, a.kid(n, -1))) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      }
    }
  }
}
