// Layout/ParameterAlignment (EnforcedStyle: with_first_parameter).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalAligner, lalArgs } from "./layout_align_help";

export class CopLayoutParameterAlignment {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/ParameterAlignment");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const items = lalArgs(src, n);
      if (items.length < 2) {
        continue;
      }
      this.al.check(this.c, src, items, 0, false);
    }
  }
}
