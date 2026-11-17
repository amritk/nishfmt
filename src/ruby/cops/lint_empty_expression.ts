// Lint/EmptyExpression (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintEmptyExpression {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyExpression");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) === NT_BEGIN && a.nKid(n) === 0) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
