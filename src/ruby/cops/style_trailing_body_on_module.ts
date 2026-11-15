// Style/TrailingBodyOnModule.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_MODULE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhCorrectTrailingBody, sbhFirstPartE, sbhFirstPartS, sbhTrailingBody } from "./style_body_help";
import { ssxFS } from "./style_syntax_help";

/** Style/TrailingBodyOnModule. */
export class CopStyleTrailingBodyOnModule {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingBodyOnModule");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_MODULE || !sbhTrailingBody(src, n)) {
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
