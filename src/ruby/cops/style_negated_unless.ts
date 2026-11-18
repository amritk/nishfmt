// Style/NegatedUnless (EnforcedStyle: both).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_IF } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnElsif, scnIfKw, scnTernary } from "./style_cond_help";
import { sngCheckNegative } from "./style_negated_if";

export class CopStyleNegatedUnless {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NegatedUnless");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) !== NT_IF || scnIfKw(src, n) || scnElsif(src, n) || scnTernary(src, n)) {
        continue;
      }
      sngCheckNegative(this.c, src, n);
    }
  }
}
