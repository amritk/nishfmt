// Layout/ConditionPosition.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_KEYWORD, NT_IF, NT_UNTIL, NT_WHILE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { rmlTernary } from "./layout_multiline_help";

export class CopLayoutConditionPosition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/ConditionPosition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let body = V_NIL;
      if (t === NT_IF) {
        if (rmlTernary(src, n)) {
          continue;
        }
        const kw = src.src(rnS(src, n, F_KEYWORD), rnE(src, n, F_KEYWORD));
        const unless = kw === "unless";
        if ((kw === "if" || unless) && !rnHas(src, n, F_END)) {
          continue;
        }
        body = a.kid(n, unless ? 2 : 1);
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        if (!rnHas(src, n, F_END)) {
          continue;
        }
        body = a.kid(n, 1);
      } else {
        continue;
      }
      const cond = a.kid(n, 0);
      const ks = rnS(src, n, F_KEYWORD);
      const cs = a.exS(cond);
      const ce = a.exE(cond);
      if (src.line(ks) === src.line(cs)) {
        continue;
      }
      const k = this.c.offense(cs, ce);
      if (k === null) {
        continue;
      }
      k.insertAfter(ks, rnE(src, n, F_KEYWORD), ` ${src.src(cs, ce)}`);
      if (body !== V_NIL && src.line(a.exS(body)) === src.line(ce)) {
        k.remove(cs, a.exS(body));
      } else {
        const s = cs - src.column(cs);
        let e = src.lineEnd(src.line(ce)) + 1;
        if (e > src.n) {
          e = src.n;
        }
        k.remove(s, e);
      }
      this.c.commit(k);
    }
  }
}
