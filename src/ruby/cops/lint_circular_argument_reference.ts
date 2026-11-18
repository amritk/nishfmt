// Lint/CircularArgumentReference (no correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_KWOPTARG, NT_LVAR, NT_LVASGN, NT_OPTARG } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

export class CopLintCircularArgumentReference {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/CircularArgumentReference");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_OPTARG && t !== NT_KWOPTARG) {
        continue;
      }
      const name = a.text(a.kid(n, 0));
      const v = a.kid(n, 1);
      if (ssxIs(src, v, NT_LVAR) && a.text(a.kid(v, 0)) === name) {
        this.c.offense(a.exS(v), a.exE(v));
        continue;
      }
      if (!ssxIs(src, v, NT_LVASGN)) {
        continue;
      }
      const seen: string[] = [];
      let cur = v;
      while (ssxIs(src, cur, NT_LVASGN)) {
        seen.push(a.text(a.kid(cur, 0)));
        cur = a.kid(cur, -1);
      }
      if (!ssxIs(src, cur, NT_LVAR)) {
        continue;
      }
      const vn = a.text(a.kid(cur, 0));
      let hit = vn === name;
      for (const s of seen) {
        if (s === vn) {
          hit = true;
        }
      }
      if (hit) {
        this.c.offense(a.exS(cur), a.exE(cur));
      }
    }
  }
}
