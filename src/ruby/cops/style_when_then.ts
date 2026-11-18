// Style/WhenThen.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_WHEN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnThen } from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas } from "./style_syntax_help";

export class CopStyleWhenThen {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/WhenThen");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (
        a.type(n) !== NT_WHEN ||
        src.line(a.exS(n)) !== src.line(a.exE(n)) ||
        scnThen(src, n) ||
        a.kid(n, -1) === V_NIL
      ) {
        continue;
      }
      if (!ssxHas(src, n, F_BEGIN)) {
        continue;
      }
      const s = ssxFS(src, n, F_BEGIN);
      const e = ssxFE(src, n, F_BEGIN);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, " then");
        this.c.commit(k);
      }
    }
  }
}
