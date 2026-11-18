// Lint/RedundantWithIndex.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_SELECTOR, NT_ARG, NT_BLOCK, NT_NUMBLOCK, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIs, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopLintRedundantWithIndex {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantWithIndex");
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
      if (!ssxIsCall(src, send) || a.kid(send, 0) === V_NIL) {
        continue;
      }
      const m = ssxMeth(src, send);
      if (m === "with_index") {
        // node.receiver.receiver: a call's or a block's; other receivers raise.
        let r = a.kid(send, 0);
        if (ssxIsAnyBlock(src, r)) {
          r = a.kid(r, 0);
        }
        if (!ssxIsCall(src, r) || a.kid(r, 0) === V_NIL) {
          continue;
        }
      }
      if (m !== "each_with_index" && m !== "with_index") {
        continue;
      }
      if (t === NT_BLOCK) {
        const args = a.kid(n, 1);
        const na = a.nKid(args);
        if (!(na === 0 || (na === 1 && ssxIs(src, a.kid(args, 0), NT_ARG)))) {
          continue;
        }
      } else if (a.text(a.kid(n, 1)) !== "1") {
        continue;
      }
      const s = ssxFS(src, send, F_SELECTOR);
      const e = a.exE(send);
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      if (m === "each_with_index") {
        k.replace(s, ssxFE(src, send, F_SELECTOR), "each");
      } else {
        k.remove(s, e);
        if (ssxHas(src, send, F_DOT)) {
          k.remove(ssxFS(src, send, F_DOT), ssxFE(src, send, F_DOT));
        }
      }
      this.c.commit(k);
    }
  }
}
