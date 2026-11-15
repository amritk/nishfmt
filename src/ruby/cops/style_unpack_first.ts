// Style/UnpackFirst.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_INT } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopStyleUnpackFirst {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/UnpackFirst");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n)) {
        continue;
      }
      const m = ssxMeth(src, n);
      let ok = m === "first" && a.nKid(n) === 2;
      if ((m === "[]" || m === "slice" || m === "at") && a.nKid(n) === 3) {
        const arg = a.kid(n, 2);
        ok = ssxIs(src, arg, NT_INT) && a.text(a.kid(arg, 0)) === "0";
      }
      if (!ok) {
        continue;
      }
      // (call (...) :unpack (...))
      const u = a.kid(n, 0);
      if (!ssxIsCall(src, u) || ssxMeth(src, u) !== "unpack" || a.nKid(u) !== 3 || !a.isNode(a.kid(u, 0)) || !a.isNode(a.kid(u, 2))) {
        continue;
      }
      const ss = ssxFS(src, u, F_SELECTOR);
      const k = this.c.offense(ss, a.exE(n));
      if (k !== null) {
        k.remove(a.exE(u), a.exE(n));
        k.replace(ss, ssxFE(src, u, F_SELECTOR), "unpack1");
        this.c.commit(k);
      }
    }
  }
}
