// Style/MinMax.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARRAY, NT_RETURN, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnAstEqual } from "./style_cond_reparse";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopStyleMinMax {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MinMax");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_ARRAY && t !== NT_RETURN) || a.nKid(n) !== 2) {
        continue;
      }
      const x = a.kid(n, 0);
      const y = a.kid(n, 1);
      if (!ssxIs(src, x, NT_SEND) || !ssxIs(src, y, NT_SEND) || a.nKid(x) !== 2 || a.nKid(y) !== 2) {
        continue;
      }
      if (ssxMeth(src, x) !== "min" || ssxMeth(src, y) !== "max") {
        continue;
      }
      const rx = a.kid(x, 0);
      const ry = a.kid(y, 0);
      if (rx === V_NIL || ry === V_NIL || !scnAstEqual(a, rx, a, ry, false)) {
        continue;
      }
      const s = t === NT_RETURN ? a.exS(x) : a.exS(n);
      const e = t === NT_RETURN ? a.exE(y) : a.exE(n);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, `${src.nodeSrc(rx)}.minmax`);
        this.c.commit(k);
      }
    }
  }
}
