// Style/PercentQLiterals (EnforcedStyle: lower_case_q).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rbLitIsPercent, rbLitPctType } from "./lit_help";

export class CopStylePercentQLiterals {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/PercentQLiterals");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_STR || !rbLitIsPercent(src, n)) {
        continue;
      }
      // correct_literal_style?: %q is right; only %Q is checked.
      if (rbLitPctType(src, n) !== "%Q") {
        continue;
      }
      // corrected: the first `Q` (at index 1) swapcased; the literal must parse to the same string.
      const s = a.exS(n);
      const e = a.exE(n);
      const pts: i32[] = [];
      for (let i = s; i < e; i++) {
        pts.push(i === s + 1 ? 113 : src.at(i));
      }
      const re = new RbSource(pts, src.p.st.path);
      if (
        !re.valid ||
        re.root === V_NIL ||
        re.a.type(re.root) !== NT_STR ||
        re.a.text(re.a.kid(re.root, 0)) !== a.text(a.kid(n, 0))
      ) {
        continue;
      }
      const k = this.c.offense(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN));
      if (k !== null) {
        k.replace(s, e, src.src(s, s + 1) + "q" + src.src(s + 2, e));
        this.c.commit(k);
      }
    }
  }
}
