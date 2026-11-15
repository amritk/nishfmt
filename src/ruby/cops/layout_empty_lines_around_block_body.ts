// Layout/EmptyLinesAroundBlockBody (EmptyLinesAroundBody, no_empty_lines).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_BLOCK, NT_NUMBLOCK, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayBodyCheck } from "./layout_empty_help";

export class CopLayoutEmptyLinesAroundBlockBody {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundBlockBody");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      // body_start_line
      let first = src.line(rnS(src, n, F_BEGIN));
      if (t === NT_BLOCK) {
        const args = a.kid(n, 1);
        if (args !== V_NIL && a.nKid(args) > 0) {
          const al = src.line(a.exE(args));
          if (al > first) {
            first = al;
          }
        }
      }
      rbLayBodyCheck(this.c, src, L, n, first);
    }
  }
}
