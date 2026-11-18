// Style/MultilineIfThen.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { RbSource } from "../source";
import { scnIfBranch, scnModifier, scnTernary, scnThen } from "./style_cond_help";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopStyleMultilineIfThen {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MultilineIfThen");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || scnModifier(src, n) || scnTernary(src, n)) {
        continue;
      }
      if (src.line(a.exS(n)) === src.line(a.exE(n)) || !scnThen(src, n)) {
        continue;
      }
      const bs = ssxFS(src, n, F_BEGIN);
      const be = ssxFE(src, n, F_BEGIN);
      // own_then?: the node's range contains `then` (Range#contains?).
      const s = a.exS(n);
      const e = a.exE(n);
      const cmp1 = bs > s ? 1 : bs === s ? 0 : -1;
      const cmp2 = e > be ? 1 : e === be ? 0 : -1;
      if (cmp1 + cmp2 < 1 || cmp1 < 0 || cmp2 < 0) {
        continue;
      }
      const ib = scnIfBranch(src, n);
      if (ib !== V_NIL && src.line(bs) === src.line(a.exS(ib))) {
        continue;
      }
      const k = this.c.offense(bs, be);
      if (k !== null) {
        k.remove(rbSpaceBegin(src, bs, 1, true, false, false), be);
        this.c.commit(k);
      }
    }
  }
}
