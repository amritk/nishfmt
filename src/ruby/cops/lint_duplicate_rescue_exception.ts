// Lint/DuplicateRescueException (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_RESCUE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhResbodies, sbhResbodyExceptions } from "./style_body_help";
import { ssxAstEqual } from "./style_syntax_reparse";

export class CopLintDuplicateRescueException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DuplicateRescueException");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      // rescue_modifier?(node) asks of the rescue node itself, never a resbody: no skip.
      if (a.type(n) !== NT_RESCUE) {
        continue;
      }
      const prev: i32[] = [];
      for (const rb of sbhResbodies(src, n)) {
        for (const ex of sbhResbodyExceptions(src, rb)) {
          let dup = false;
          for (const p of prev) {
            if (ssxAstEqual(a, p, a, ex)) {
              dup = true;
              break;
            }
          }
          if (dup) {
            this.c.offense(a.exS(ex), a.exE(ex));
          } else {
            prev.push(ex);
          }
        }
      }
    }
  }
}
