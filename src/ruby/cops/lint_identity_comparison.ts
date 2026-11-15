// Lint/IdentityComparison.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** (send _ :object_id). */
const licObjectId = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "object_id" && src.a.nKid(n) === 2;

export class CopLintIdentityComparison {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/IdentityComparison");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "==" && m !== "!=") {
        continue;
      }
      const l = a.kid(n, 0);
      const r = a.kid(n, 2);
      if (!licObjectId(src, l) || !licObjectId(src, r)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const lr = a.kid(l, 0);
      const rr = a.kid(r, 0);
      if (lr === V_NIL || rr === V_NIL) {
        continue;
      }
      const bang = m === "==" ? "" : "!";
      k.replace(a.exS(n), a.exE(n), `${bang}${src.nodeSrc(lr)}.equal?(${src.nodeSrc(rr)})`);
      this.c.commit(k);
    }
  }
}
