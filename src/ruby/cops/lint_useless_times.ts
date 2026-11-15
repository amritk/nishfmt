// Lint/UselessTimes (unsafe; detection only): `0.times`, `1.times` or a
// negative count's `times`, with its block when it has one.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK_PASS, NT_INT, NT_SEND, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhType } from "./lint_detect_help";
import { ssxBlockLiteral, ssxMeth } from "./style_syntax_help";

export class CopLintUselessTimes {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UselessTimes");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "times" || ldhType(src, a.kid(n, 0)) !== NT_INT) {
        continue;
      }
      // (send (int $_) :times (block-pass (sym $_))?)
      const k = a.nKid(n);
      if (k > 3) {
        continue;
      }
      if (k === 3) {
        const bp = a.kid(n, 2);
        if (ldhType(src, bp) !== NT_BLOCK_PASS || ldhType(src, a.kid(bp, 0)) !== NT_SYM) {
          continue;
        }
      }
      // count > 1 (the value as decimal text, so any size)
      const v = a.text(a.kid(a.kid(n, 0), 0));
      if (!(v.startsWith("-") || v === "0" || v === "1")) {
        continue;
      }
      const node = ssxBlockLiteral(src, n) ? src.parent(n) : n;
      this.c.offense(a.exS(node), a.exE(node));
    }
  }
}
