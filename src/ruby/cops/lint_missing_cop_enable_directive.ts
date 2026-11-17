// Lint/MissingCopEnableDirective (MaxRangeSize: .inf; no correction): with
// an infinite MaxRangeSize only a range left open to the end of the file is
// reported, at the comment that opened it.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LDH_INF, LDH_NEG_INF, LdhConfig, LdhRegistry } from "./lint_directive_help";

export class CopLintMissingCopEnableDirective {
  c: RbCop;
  reg: LdhRegistry;

  constructor() {
    this.c = new RbCop("Lint/MissingCopEnableDirective");
    this.reg = new LdhRegistry();
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const cfg = new LdhConfig(src, this.reg);
    if (cfg.noDirectives) {
      return;
    }
    cfg.analyze();
    for (const an of cfg.cops) {
      for (let i = 0; i < toI32(an.rb.length); i++) {
        const d = an.rd[i];
        if (d >= 0) {
          const dir = cfg.dirs[d];
          if (dir.disableNext() || dir.mode === "next") {
            continue;
          }
        }
        // acceptable_range?: a finite range always is (MaxRangeSize .inf).
        if (an.re[i] !== LDH_INF && an.rb[i] !== LDH_NEG_INF) {
          continue;
        }
        if (!this.reg.has(an.name)) {
          continue;
        }
        // expected_open_range?
        if (an.rb[i] === LDH_NEG_INF || (!this.reg.enabled(an.name) && an.re[i] === LDH_INF)) {
          continue;
        }
        if (d >= 0) {
          this.c.offense(src.commS[d], src.commE[d]);
          continue;
        }
        // processed_source.comment_at_line(line_range.begin)
        for (let ci = 0; ci < toI32(src.commS.length); ci++) {
          if (src.line(src.commS[ci]) === an.rb[i]) {
            this.c.offense(src.commS[ci], src.commE[ci]);
            break;
          }
        }
      }
    }
  }
}
