// Lint/MissingCopEnableDirective (MaxRangeSize: .inf; no correction): with
// an infinite MaxRangeSize only a range left open to the end of the file is
// reported, at the comment that opened it.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { atI32 } from "../../core/arr";
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
      const rb = an.rb;
      const rd = an.rd;
      const re = an.re;
      const dirs = cfg.dirs;
      for (let i = 0; i < rb.length && i < rd.length && i < re.length; i++) {
        const d = rd[i];
        if (d >= 0) {
          if (d >= dirs.length) {
            fault();
            return;
          }
          const dir = dirs[d];
          if (dir.disableNext() || dir.mode === "next") {
            continue;
          }
        }
        // acceptable_range?: a finite range always is (MaxRangeSize .inf).
        const rbi = rb[i];
        const rei = re[i];
        if (rei !== LDH_INF && rbi !== LDH_NEG_INF) {
          continue;
        }
        if (!this.reg.has(an.name)) {
          continue;
        }
        // expected_open_range?
        if (rbi === LDH_NEG_INF || (!this.reg.enabled(an.name) && rei === LDH_INF)) {
          continue;
        }
        if (d >= 0) {
          this.c.offense(atI32(src.commS, d), atI32(src.commE, d));
          continue;
        }
        // processed_source.comment_at_line(line_range.begin)
        const commS = src.commS;
        const commE = src.commE;
        for (let ci = 0; ci < commS.length && ci < commE.length; ci++) {
          if (src.line(commS[ci]) === rbi) {
            this.c.offense(commS[ci], commE[ci]);
            break;
          }
        }
      }
    }
  }
}
