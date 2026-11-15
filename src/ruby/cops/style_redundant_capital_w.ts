// Style/RedundantCapitalW.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_ARRAY, NT_DSTR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rbDoubleQuotesRequired, rbReplaceAll } from "../util";
import { rbLitIsPercent, rbLitPctType } from "./lit_help";

export class CopStyleRedundantCapitalW {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantCapitalW");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY || !rbLitIsPercent(src, n) || rbLitPctType(src, n) !== "%W") {
        continue;
      }
      // requires_interpolation?
      let needs = false;
      for (let i = 0; i < a.nKid(n); i++) {
        const w = a.kid(n, i);
        if (!a.isNode(w)) {
          continue;
        }
        if (a.type(w) === NT_DSTR || rbDoubleQuotesRequired(src.nodeSrc(w))) {
          needs = true;
          break;
        }
      }
      if (needs) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        const bs = rnS(src, n, F_BEGIN);
        const be = rnE(src, n, F_BEGIN);
        k.replace(bs, be, rbReplaceAll(src.src(bs, be), "W", "w"));
        this.c.commit(k);
      }
    }
  }
}
