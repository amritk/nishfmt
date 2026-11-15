// Style/NegatedWhile.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_UNTIL, NT_WHILE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sngCheckNegative } from "./style_negated_if";

export class CopStyleNegatedWhile {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NegatedWhile");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_WHILE || t === NT_UNTIL) {
        sngCheckNegative(this.c, src, n);
      }
    }
  }
}
