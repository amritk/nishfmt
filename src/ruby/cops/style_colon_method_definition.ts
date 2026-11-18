// Style/ColonMethodDefinition.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxLocIs } from "./style_syntax_help";

export class CopStyleColonMethodDefinition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ColonMethodDefinition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) !== NT_DEFS || !ssxLocIs(src, n, F_OPERATOR, "::")) {
        continue;
      }
      const s = ssxFS(src, n, F_OPERATOR);
      const e = ssxFE(src, n, F_OPERATOR);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, ".");
        this.c.commit(k);
      }
    }
  }
}
