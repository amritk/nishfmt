// Layout/EmptyLinesAroundMethodBody (EmptyLinesAroundBody, no_empty_lines).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_ASSIGNMENT, F_END, NT_DEF, NT_DEFS, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayBodyCheck } from "./layout_empty_help";

export class CopLayoutEmptyLinesAroundMethodBody {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundMethodBody");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const args = a.kid(n, t === NT_DEF ? 1 : 2);
      if (!rnHas(src, n, F_END)) {
        // offending_endless_method?
        const body = a.kid(n, -1);
        const al = src.line(rnS(src, n, F_ASSIGNMENT));
        if (body !== V_NIL && src.line(a.exS(body)) > al + 1 && L.empty(al)) {
          const s = L.start(al + 1);
          const k = this.c.offense(s, s + 1);
          if (k !== null) {
            k.remove(s, s + 1);
            this.c.commit(k);
          }
        }
        continue;
      }
      let first = 0;
      if (args !== V_NIL && a.exS(args) >= 0) {
        first = src.line(a.exE(args));
      }
      rbLayBodyCheck(this.c, src, L, n, first);
    }
  }
}
