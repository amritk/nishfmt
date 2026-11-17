// Style/BeginBlock (detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_PREEXE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs } from "./style_syntax_help";

export class CopStyleBeginBlock {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/BeginBlock");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_PREEXE)) {
        this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      }
    }
  }
}
