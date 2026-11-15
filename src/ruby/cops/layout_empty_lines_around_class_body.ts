// Layout/EmptyLinesAroundClassBody (EmptyLinesAroundBody, no_empty_lines).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CLASS, NT_SCLASS, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayBodyCheck } from "./layout_empty_help";

export class CopLayoutEmptyLinesAroundClassBody {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundClassBody");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CLASS) {
        const sup = a.kid(n, 1);
        rbLayBodyCheck(this.c, src, L, n, sup !== V_NIL ? src.line(a.exE(sup)) : 0);
      } else if (t === NT_SCLASS) {
        rbLayBodyCheck(this.c, src, L, n, 0);
      }
    }
  }
}
