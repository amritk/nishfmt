// Lint/FlipFlop (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_EFLIPFLOP, NT_IFLIPFLOP } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintFlipFlop {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/FlipFlop");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IFLIPFLOP || t === NT_EFLIPFLOP) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
