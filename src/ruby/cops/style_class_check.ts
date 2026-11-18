// Style/ClassCheck (EnforcedStyle: is_a?).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopStyleClassCheck {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ClassCheck");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || ssxMeth(src, n) !== "kind_of?") {
        continue;
      }
      const s = ssxFS(src, n, F_SELECTOR);
      const e = ssxFE(src, n, F_SELECTOR);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "is_a?");
        this.c.commit(k);
      }
    }
  }
}
