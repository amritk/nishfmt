// Metrics/PerceivedComplexity (detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { mcxBody, mcxComplexity, mcxTargets } from "./metrics_complexity_help";

export class CopMetricsPerceivedComplexity {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/PerceivedComplexity");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of mcxTargets(src)) {
      const body = mcxBody(src, n);
      if (!src.a.isNode(body)) {
        continue;
      }
      // Max: 8.
      if (mcxComplexity(src, body, true) > 8) {
        this.c.offense(src.a.exS(n), src.a.exE(n));
      }
    }
  }
}
