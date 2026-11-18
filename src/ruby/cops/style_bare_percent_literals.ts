// Style/BarePercentLiterals (EnforcedStyle: bare_percent).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_DSTR, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";

export class CopStyleBarePercentLiterals {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/BarePercentLiterals");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_STR && t !== NT_DSTR) || rnHeredoc(src, n) || !rnHas(src, n, F_BEGIN)) {
        continue;
      }
      const bs = rnS(src, n, F_BEGIN);
      const be = rnE(src, n, F_BEGIN);
      const source = src.src(bs, be);
      if (!source.startsWith("%Q")) {
        continue;
      }
      const k = this.c.offense(bs, be);
      if (k !== null) {
        k.replace(bs, be, `%${source.substring(2, toI32(source.length))}`);
        this.c.commit(k);
      }
    }
  }
}
