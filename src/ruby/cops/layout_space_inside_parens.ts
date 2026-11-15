// Layout/SpaceInsideParens (EnforcedStyle: no_space).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
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
    for (let i = 0; i + 1 < tk.n; i++) {
      const t1 = tk.t[i];
      const t2 = tk.t[i + 1];
      if (t1 !== TK_tLPAREN && t1 !== TK_tLPAREN2 && t2 !== TK_tRPAREN) {
        continue;
      }
      if (t2 === TK_COMMENT) {
        continue;
      }
      const e1 = tk.e[i];
      const s2 = tk.s[i + 1];
      if (src.line(tk.s[i]) !== src.line(s2) || !lspSpaceAfter(src, e1)) {
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
