// Style/RedundantSortBy.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_SELECTOR, NT_ARG, NT_ARGS, NT_BLOCK, NT_LVAR, NT_NUMBLOCK } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxIsCall, ssxMeth, ssxSymText } from "./style_syntax_help";

export class CopStyleRedundantSortBy {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantSortBy");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      const send = a.kid(n, 0);
      if (!ssxIsCall(src, send) || ssxMeth(src, send) !== "sort_by" || a.nKid(send) !== 2) {
        continue;
      }
      const body = a.kid(n, 2);
      if (!ssxIs(src, body, NT_LVAR)) {
        continue;
      }
      const v = ssxSymText(src, a.kid(body, 0));
      if (t === NT_BLOCK) {
        const args = a.kid(n, 1);
        if (
          !ssxIs(src, args, NT_ARGS) ||
          a.nKid(args) !== 1 ||
          !ssxIs(src, a.kid(args, 0), NT_ARG) ||
          a.nKid(a.kid(args, 0)) !== 1
        ) {
          continue;
        }
        if (ssxSymText(src, a.kid(a.kid(args, 0), 0)) !== v) {
          continue;
        }
      } else if (a.text(a.kid(n, 1)) !== "1" || v !== "_1") {
        continue;
      }
      const s = ssxFS(src, send, F_SELECTOR);
      const e = ssxFE(src, n, F_END);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, "sort");
        this.c.commit(k);
      }
    }
  }
}
