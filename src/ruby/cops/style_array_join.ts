// Style/ArrayJoin.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_ARRAY, NT_SEND, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopStyleArrayJoin {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ArrayJoin");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      // (send $array :* $str)
      if (
        a.type(n) !== NT_SEND ||
        a.nKid(n) !== 3 ||
        ssxMeth(src, n) !== "*" ||
        !ssxIs(src, a.kid(n, 0), NT_ARRAY) ||
        !ssxIs(src, a.kid(n, 2), NT_STR)
      ) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), `${src.nodeSrc(a.kid(n, 0))}.join(${src.nodeSrc(a.kid(n, 2))})`);
        this.c.commit(k);
      }
    }
  }
}
