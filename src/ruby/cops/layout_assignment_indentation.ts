// Layout/AssignmentIndentation.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalAssignment, lalCheckAsgnType, lalExtractRhs, lalFirstLine } from "./layout_align_help";

export class CopLayoutAssignmentIndentation {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/AssignmentIndentation");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!lalCheckAsgnType(a.type(n))) {
        continue;
      }
      const rhs = lalExtractRhs(src, n);
      if (rhs === V_NIL || !a.isNode(rhs) || !rnHas(src, n, F_OPERATOR)) {
        continue;
      }
      if (src.line(rnS(src, n, F_OPERATOR)) === lalFirstLine(src, rhs)) {
        continue;
      }
      // leftmost_multiple_assignment
      let left = n;
      const p = src.parent(n);
      if (p !== V_NIL && lalFirstLine(src, n) === lalFirstLine(src, p) && lalAssignment(src, p)) {
        left = p;
      }
      const base = this.al.dispCol(src, a.exS(left));
      const items: i32[] = [rhs];
      this.al.check(this.c, src, items, base + 2, true);
    }
  }
}
