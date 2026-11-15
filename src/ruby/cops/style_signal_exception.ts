// Style/SignalException (EnforcedStyle: only_raise).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_DEF, NT_DEFS, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxMeth, ssxSymText } from "./style_syntax_help";

export class CopStyleSignalException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SignalException");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    // custom_fail_defined?: a `def fail` or `def x.fail` anywhere.
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t === NT_DEF && ssxSymText(src, a.kid(n, 0)) === "fail") || (t === NT_DEFS && ssxSymText(src, a.kid(n, 1)) === "fail")) {
        return;
      }
    }
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "fail") {
        continue;
      }
      const r = a.kid(n, 0);
      if (r !== V_NIL && !ssxGlobalConst(src, r, "Kernel")) {
        continue;
      }
      const s = ssxFS(src, n, F_SELECTOR);
      const e = ssxFE(src, n, F_SELECTOR);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "raise");
        this.c.commit(k);
      }
    }
  }
}
