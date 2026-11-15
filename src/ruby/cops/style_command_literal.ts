// Style/CommandLiteral (EnforcedStyle: backticks, AllowInnerBackticks: false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";

export class CopStyleCommandLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CommandLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_XSTR || rnHeredoc(src, n)) {
        continue;
      }
      const bs = rnS(src, n, F_BEGIN);
      const be = rnE(src, n, F_BEGIN);
      const es = rnS(src, n, F_END);
      const ee = rnE(src, n, F_END);
      // node_body: the expression without loc.begin's and loc.end's lengths.
      const s = a.exS(n);
      const e = a.exE(n);
      const body = src.src(s + (be - bs), e - (ee - es));
      const backtick = body.indexOf("`") >= 0;
      if (src.src(bs, be) === "`") {
        // a backtick literal is allowed unless it contains a backtick (then it is not corrected)
        if (backtick) {
          this.c.offense(s, e);
        }
        continue;
      }
      if (backtick) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(bs, be, "`");
        k.replace(es, ee, "`");
        this.c.commit(k);
      }
    }
  }
}
