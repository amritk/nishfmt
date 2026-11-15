// Style/MultilineBlockChain (detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDescendants, ssxFS, ssxIsAnyBlock, ssxIsCall } from "./style_syntax_help";

export class CopStyleMultilineBlockChain {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MultilineBlockChain");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    // Runner#do_inspection_loop's offenses.uniq keeps the first of the offenses
    // starting at one position (the message is constant), so only it counts.
    const starts = new Set<i32>();
    for (const n of src.pre) {
      if (!ssxIsAnyBlock(src, n)) {
        continue;
      }
      const send = a.kid(n, 0);
      const all: i32[] = [send];
      for (const d of ssxDescendants(src, send)) {
        all.push(d);
      }
      for (const s of all) {
        if (!ssxIsCall(src, s)) {
          continue;
        }
        const r = a.kid(s, 0);
        // BlockNode#multiline?: `{`/`do` and `}`/`end` on different lines.
        if (!ssxIsAnyBlock(src, r) || src.line(ssxFS(src, r, F_BEGIN)) === src.line(ssxFS(src, r, F_END))) {
          continue;
        }
        const s0 = ssxFS(src, r, F_END);
        if (!starts.has(s0)) {
          starts.add(s0);
          this.c.offense(s0, a.exE(send));
        }
        break;
      }
    }
  }
}
