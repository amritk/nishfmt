// Lint/ToJSON.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_NAME, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxDefName, ssxFE, ssxHas } from "./style_syntax_help";

export class CopLintToJSON {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ToJSON");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (!(t === NT_DEF || t === NT_DEFS) || ssxDefName(src, n) !== "to_json") {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (a.nKid(args) > 0) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (ssxHas(src, args, F_BEGIN)) {
        const be = ssxFE(src, args, F_BEGIN);
        k.insertAfter(be - 1, be, "*_args");
      } else {
        const ne = ssxFE(src, n, F_NAME);
        k.insertAfter(ne, ne, "(*_args)");
      }
      this.c.commit(k);
    }
  }
}
