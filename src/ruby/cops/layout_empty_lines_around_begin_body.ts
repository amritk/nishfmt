// Layout/EmptyLinesAroundBeginBody (EmptyLinesAroundBody, no_empty_lines).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_KWBEGIN } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayBodyCheck } from "./layout_empty_help";

export class CopLayoutEmptyLinesAroundBeginBody {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundBeginBody");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      if (a.type(n) === NT_KWBEGIN) {
        rbLayBodyCheck(this.c, src, L, n, 0);
      }
    }
  }
}
