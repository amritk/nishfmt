// Style/WhileUntilDo.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_UNTIL, NT_WHILE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnDo } from "./style_cond_help";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopStyleWhileUntilDo {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/WhileUntilDo");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_WHILE && t !== NT_UNTIL) || src.line(a.exS(n)) === src.line(a.exE(n)) || !scnDo(src, n)) {
        continue;
      }
      const bs = ssxFS(src, n, F_BEGIN);
      const be = ssxFE(src, n, F_BEGIN);
      const body = a.kid(n, 1);
      if (body !== V_NIL && src.line(bs) === src.line(a.exS(body))) {
        continue;
      }
      const k = this.c.offense(bs, be);
      if (k !== null) {
        k.remove(a.exE(a.kid(n, 0)), be);
        this.c.commit(k);
      }
    }
  }
}
