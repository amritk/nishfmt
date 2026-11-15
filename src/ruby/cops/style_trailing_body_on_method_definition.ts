// Style/TrailingBodyOnMethodDefinition.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhCorrectTrailingBody, sbhFirstPartE, sbhFirstPartS, sbhTrailingBody } from "./style_body_help";
import { ssxEndless, ssxFS } from "./style_syntax_help";

/** Style/TrailingBodyOnMethodDefinition. */
export class CopStyleTrailingBodyOnMethodDefinition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingBodyOnMethodDefinition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_DEF && t !== NT_DEFS) || !sbhTrailingBody(src, n) || ssxEndless(src, n)) {
        continue;
      }
      const body = a.kid(n, -1);
      const k = this.c.offense(sbhFirstPartS(src, body), sbhFirstPartE(src, body));
      if (k !== null) {
        sbhCorrectTrailingBody(src, k, n, ssxFS(src, n, F_KEYWORD));
        this.c.commit(k);
      }
    }
  }
}
