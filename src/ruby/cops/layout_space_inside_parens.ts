// Layout/SpaceInsideParens (EnforcedStyle: no_space).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource, TK_COMMENT } from "../source";
import { TK_tLPAREN, TK_tLPAREN2, TK_tRPAREN } from "../tables";
import { LspToks, lspSpaceAfter } from "./layout_space_help";

export class CopLayoutSpaceInsideParens {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideParens");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const tk = new LspToks(src);
    // correct_extraneous_space
    const tt = tk.t;
    const ts = tk.s;
    const te = tk.e;
    // Pairs of neighbours: j - 1 and j.
    for (let j = 1; j < tk.n && j < tt.length && j < ts.length && j < te.length; j++) {
      const t1 = tt[j - 1];
      const t2 = tt[j];
      if (t1 !== TK_tLPAREN && t1 !== TK_tLPAREN2 && t2 !== TK_tRPAREN) {
        continue;
      }
      if (t2 === TK_COMMENT) {
        continue;
      }
      const e1 = te[j - 1];
      const s2 = ts[j];
      if (src.line(ts[j - 1]) !== src.line(s2) || !lspSpaceAfter(src, e1)) {
        continue;
      }
      const k = this.c.offense(e1, s2);
      if (k !== null) {
        k.remove(e1, s2);
        this.c.commit(k);
      }
    }
  }
}
