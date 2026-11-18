// Style/RescueStandardError (EnforcedStyle: explicit).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_RESBODY, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxRescueModifier } from "./style_syntax_help";

export class CopStyleRescueStandardError {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RescueStandardError");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESBODY || a.kid(n, 0) !== V_NIL || ssxRescueModifier(src, n)) {
        continue;
      }
      const s = ssxFS(src, n, F_KEYWORD);
      const e = ssxFE(src, n, F_KEYWORD);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.insertAfter(s, e, " StandardError");
        this.c.commit(k);
      }
    }
  }
}
