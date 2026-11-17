// Metrics/CyclomaticComplexity (detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { mcxBody, mcxComplexity, mcxTargets } from "./metrics_complexity_help";

export class CopMetricsCyclomaticComplexity {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/CyclomaticComplexity");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of mcxTargets(src)) {
      const body = mcxBody(src, n);
      if (!src.a.isNode(body)) {
        continue;
      }
      // Max: 7.
      if (mcxComplexity(src, body, false) > 7) {
        this.c.offense(src.a.exS(n), src.a.exE(n));
      }
    }
  }
}
