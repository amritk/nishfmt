// Naming/AsciiIdentifiers (detection only; AsciiConstants: true).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { TK_tCONSTANT, TK_tIDENTIFIER } from "../tables";
import { nmhCps } from "./naming_help";

export class CopNamingAsciiIdentifiers {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/AsciiIdentifiers");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (let i = 0; i < toI32(src.tokT.length); i++) {
      const t = src.tokT[i];
      if (t !== TK_tIDENTIFIER && t !== TK_tCONSTANT) {
        continue;
      }
      // first_offense_range: the first run of non-ASCII characters.
      const cs = nmhCps(src.tokV[i]);
      let p = 0;
      while (p < cs.length && cs[p] < 128) {
        p++;
      }
      if (p === cs.length) {
        continue;
      }
      let q = p;
      while (q < cs.length && cs[q] >= 128) {
        q++;
      }
      this.c.offense(src.tokS[i] + p, src.tokS[i] + q);
    }
  }
}
