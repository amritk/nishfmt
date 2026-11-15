// Lint/EmptyEnsure.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_ENSURE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopLintEmptyEnsure {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyEnsure");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ENSURE || a.kid(n, 1) !== V_NIL) {
        continue;
      }
      const s = ssxFS(src, n, F_KEYWORD);
      const e = ssxFE(src, n, F_KEYWORD);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(s, e);
        this.c.commit(k);
      }
    }
  }
}
