// Style/For (EnforcedStyle: each; its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_FOR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

export class CopStyleFor {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/For");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_FOR)) {
        this.c.offense(src.a.exS(n), src.a.exE(n));
      }
    }
  }
}
