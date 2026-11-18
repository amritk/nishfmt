// Layout/MultilineHashBraceLayout (EnforcedStyle: symmetrical).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_HASH } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlBraceLayout } from "./layout_multiline_brace_help";
import { rmlKids } from "./layout_multiline_help";

export class CopLayoutMultilineHashBraceLayout {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/MultilineHashBraceLayout");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) === NT_HASH) {
        rmlBraceLayout(this.c, src, n, rmlKids(src, n), src.a.kid(n, -1), false);
      }
    }
  }
}
