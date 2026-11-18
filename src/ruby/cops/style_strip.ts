// Style/Strip.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFS, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopStyleStrip {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Strip");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || a.nKid(n) !== 2) {
        continue;
      }
      const m = ssxMeth(src, n);
      const first = a.kid(n, 0);
      if (!ssxIsCall(src, first) || a.nKid(first) !== 2) {
        continue;
      }
      const fm = ssxMeth(src, first);
      if (!((m === "lstrip" && fm === "rstrip") || (m === "rstrip" && fm === "lstrip"))) {
        continue;
      }
      const s = ssxFS(src, first, F_SELECTOR);
      const e = a.exE(n);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "strip");
        this.c.commit(k);
      }
    }
  }
}
