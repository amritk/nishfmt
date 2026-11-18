// Metrics/AbcSize (detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { McxAbc, mcxBody, mcxTargets } from "./metrics_complexity_help";

export class CopMetricsAbcSize {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/AbcSize");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of mcxTargets(src)) {
      const body = mcxBody(src, n);
      if (!src.a.isNode(body)) {
        continue;
      }
      // sqrt(A² + B² + C²).round(2) > Max (17): the sum exceeds 289.
      if (new McxAbc().run(src, body) > 289) {
        this.c.offense(src.a.exS(n), src.a.exE(n));
      }
    }
  }
}
