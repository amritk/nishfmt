// Lint/RescueException (no correction): a rescue clause that names
// `Exception` (or `::Exception`).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_RESBODY } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhConstName } from "./lint_detect_help";
import { sbhResbodyExceptions } from "./style_body_help";

export class CopLintRescueException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RescueException");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESBODY) {
        continue;
      }
      for (const e of sbhResbodyExceptions(src, n)) {
        if (ldhConstName(src, e) === "Exception") {
          this.c.offense(a.exS(n), a.exE(n));
          break;
        }
      }
    }
  }
}
