// Style/EndBlock.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_POSTEXE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

/** Style/EndBlock. */
export class CopStyleEndBlock {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EndBlock");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) !== NT_POSTEXE) {
        continue;
      }
      const s = ssxFS(src, n, F_KEYWORD);
      const e = ssxFE(src, n, F_KEYWORD);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "at_exit");
        this.c.commit(k);
      }
    }
  }
}
