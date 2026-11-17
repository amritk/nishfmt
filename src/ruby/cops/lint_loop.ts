// Lint/Loop. The cop is unsafe, so its correction never runs under
// `rubocop -a`: it only detects.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_UNTIL_POST, NT_WHILE_POST } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopLintLoop {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/Loop");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_WHILE_POST || t === NT_UNTIL_POST) {
        this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      }
    }
  }
}
