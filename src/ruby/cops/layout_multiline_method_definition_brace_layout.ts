// Layout/MultilineMethodDefinitionBraceLayout (EnforcedStyle: symmetrical).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlBraceLayout } from "./layout_multiline_brace_help";
import { rmlIsDef, rmlKids } from "./layout_multiline_help";

export class CopLayoutMultilineMethodDefinitionBraceLayout {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/MultilineMethodDefinitionBraceLayout");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (rmlIsDef(src, n)) {
        const args = src.a.kid(n, -2);
        rmlBraceLayout(this.c, src, args, rmlKids(src, args), src.a.kid(args, -1), false);
      }
    }
  }
}
