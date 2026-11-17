// Style/ClassVars (detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_CVASGN, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopStyleClassVars {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ClassVars");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_CVASGN)) {
        this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
      } else if (ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "class_variable_set") {
        const arg = a.kid(n, 2);
        if (arg !== V_NIL) {
          this.c.offense(a.exS(arg), a.exE(arg));
        }
      }
    }
  }
}
