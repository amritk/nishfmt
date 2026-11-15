// Layout/BeginEndAlignment (EnforcedStyleAlignWith: start_of_line).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_KWBEGIN } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { rmlAlignEnd, rmlColumnOffset, rmlStartLineRange } from "./layout_multiline_help";

export class CopLayoutBeginEndAlignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/BeginEndAlignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) !== NT_KWBEGIN || !rnHas(src, n, F_END)) {
        continue;
      }
      const as = rmlStartLineRange(src, n).s;
      const es = rnS(src, n, F_END);
      if (src.line(as) === src.line(es) || rmlColumnOffset(src, as, es) === 0) {
        continue;
      }
      const k = this.c.offense(es, rnE(src, n, F_END));
      if (k !== null) {
        rmlAlignEnd(src, k, es, src.column(as));
        this.c.commit(k);
      }
    }
  }
}
