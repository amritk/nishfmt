// Lint/BinaryOperatorWithIdenticalOperands (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_AND, NT_OR, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxFS, ssxHas, ssxInList, ssxMeth, ssxOperatorName } from "./style_syntax_help";

export class CopLintBinaryOperatorWithIdenticalOperands {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/BinaryOperatorWithIdenticalOperands");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_AND || t === NT_OR) {
        if (ssxAstEqual(a, a.kid(n, 0), a, a.kid(n, 1))) {
          this.c.offense(a.exS(n), a.exE(n));
        }
        continue;
      }
      if (t !== NT_SEND) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (!ssxInList(" == != === <=> =~ && || > >= < <= | ^ ", m)) {
        continue;
      }
      // binary_operation?: an operator method whose selector does not start the expression.
      if (!ssxHas(src, n, F_SELECTOR) || !ssxOperatorName(m) || a.exS(n) === ssxFS(src, n, F_SELECTOR)) {
        continue;
      }
      if (a.nKid(n) < 3 || !ssxAstEqual(a, a.kid(n, 0), a, a.kid(n, 2))) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
