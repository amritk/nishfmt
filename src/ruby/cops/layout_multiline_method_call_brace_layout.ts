// Layout/MultilineMethodCallBraceLayout (EnforcedStyle: symmetrical).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlBraceLayout } from "./layout_multiline_brace_help";
import { rmlArgs, rmlIsCall } from "./layout_multiline_help";

export class CopLayoutMultilineMethodCallBraceLayout {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/MultilineMethodCallBraceLayout");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (rmlIsCall(src, n)) {
        rmlBraceLayout(this.c, src, n, rmlArgs(src, n), src.a.kid(n, -1), true);
      }
    }
  }
}
