// Layout/LeadingEmptyLines: blank lines before the first token.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLayoutLeadingEmptyLines {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/LeadingEmptyLines");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.tokS.length === 0) {
      return;
    }
    const s = src.tokS[0];
    if (src.line(s) <= 1) {
      return;
    }
    const k = this.c.offense(s, src.tokE[0]);
    if (k !== null) {
      k.remove(0, s);
      this.c.commit(k);
    }
  }
}
