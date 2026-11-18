// Lint/TopLevelReturnWithArgument.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_DEF, NT_DEFS, NT_NUMBLOCK, NT_RETURN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintTopLevelReturnWithArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/TopLevelReturnWithArgument");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RETURN || a.nKid(n) === 0) {
        continue;
      }
      let top = true;
      let p = src.parent(n);
      while (p !== V_NIL) {
        const t = a.type(p);
        if (t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_DEF || t === NT_DEFS) {
          top = false;
          break;
        }
        p = src.parent(p);
      }
      if (!top) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), "return");
        this.c.commit(k);
      }
    }
  }
}
