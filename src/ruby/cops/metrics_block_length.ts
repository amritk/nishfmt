// Metrics/BlockLength (detection only; CountComments: false, Max: 25,
// CountAsOne: [], AllowedMethods: [refine], AllowedPatterns: [], Exclude:
// **/*.gemspec).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CSEND, NT_NUMBLOCK, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbGemspecIncluded } from "./bundler_gem_help";
import { RbLayLines } from "./layout_empty_help";
import { mtxCheckCodeLength } from "./metrics_help";
import { ssxClassConstructor } from "./style_syntax_help";

export class CopMetricsBlockLength {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/BlockLength");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (rbGemspecIncluded(src.p.st.path)) {
      return;
    }
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      // allowed_method? / method_receiver_excluded? for `refine`.
      const s = src.a.kid(n, 0);
      const st = src.a.type(s);
      if ((st === NT_SEND || st === NT_CSEND) && src.a.text(src.a.kid(s, 1)) === "refine") {
        continue;
      }
      if (ssxClassConstructor(src, n)) {
        continue;
      }
      mtxCheckCodeLength(this.c, src, L, n, 25);
    }
  }
}
