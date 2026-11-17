// Style/PreferredHashMethods (EnforcedStyle: short; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopStylePreferredHashMethods {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/PreferredHashMethods");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || src.a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m === "has_key?" || m === "has_value?") {
        this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      }
    }
  }
}
