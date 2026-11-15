// Style/UnlessElse.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_ELSE, F_END, F_KEYWORD, NT_IF } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { scnElse, scnUnless } from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas } from "./style_syntax_help";

export class CopStyleUnlessElse {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/UnlessElse");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !scnUnless(src, n) || !scnElse(src, n)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null && !this.ign.partOf(src, n)) {
        k.replace(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD), "if");
        const bs = ssxHas(src, n, F_BEGIN) ? ssxFE(src, n, F_BEGIN) : a.exE(a.kid(n, 0));
        const be = ssxFS(src, n, F_ELSE);
        const es = ssxFE(src, n, F_ELSE);
        const ee = ssxFS(src, n, F_END);
        k.swap(bs, be, es, ee, src.src(bs, be), src.src(es, ee));
        this.c.commit(k);
      }
      this.ign.add(n);
    }
  }
}
