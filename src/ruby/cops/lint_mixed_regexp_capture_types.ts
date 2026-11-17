// Lint/MixedRegexpCaptureTypes (no correction): a regexp literal without
// interpolation that has both named and numbered captures.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_REGEXP } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhCaptures, ldhInterpolation } from "./lint_detect_help";

export class CopLintMixedRegexpCaptureTypes {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/MixedRegexpCaptureTypes");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_REGEXP || ldhInterpolation(src, n)) {
        continue;
      }
      const caps = ldhCaptures(src, n);
      if (caps[0] > 0 && caps[1] > 0) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
