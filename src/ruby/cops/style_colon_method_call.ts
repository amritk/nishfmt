// Style/ColonMethodCall.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxBareConst, ssxFE, ssxFS, ssxIsCall, ssxLocIs, ssxMeth } from "./style_syntax_help";

export class CopStyleColonMethodCall {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ColonMethodCall");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) === V_NIL || !ssxLocIs(src, n, F_DOT, "::")) {
        continue;
      }
      const c0 = ssxMeth(src, n).charCodeAt(0);
      if (c0 >= 65 && c0 <= 90) {
        continue;
      }
      // java_interop?
      let r = a.kid(n, 0);
      while (ssxIsCall(src, r) && a.kid(r, 0) !== V_NIL) {
        r = a.kid(r, 0);
      }
      if (ssxBareConst(src, r, "Java")) {
        continue;
      }
      const s = ssxFS(src, n, F_DOT);
      const e = ssxFE(src, n, F_DOT);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, ".");
        this.c.commit(k);
      }
    }
  }
}
