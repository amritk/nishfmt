// Lint/MultipleComparison.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** COMPARISON_METHODS. */
const lmcComparison = (m: string): boolean => m === "<" || m === ">" || m === "<=" || m === ">=";

export class CopLintMultipleComparison {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/MultipleComparison");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || a.nKid(n) !== 3 || !lmcComparison(ssxMeth(src, n))) {
        continue;
      }
      const inner = a.kid(n, 0);
      if (!ssxIs(src, inner, NT_SEND) || a.nKid(inner) !== 3 || !lmcComparison(ssxMeth(src, inner))) {
        continue;
      }
      const center = a.kid(inner, 2);
      if (ssxIs(src, center, NT_SEND)) {
        const cm = ssxMeth(src, center);
        if (cm === "&" || cm === "|" || cm === "^") {
          continue;
        }
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        const cs = src.nodeSrc(center);
        k.replace(a.exS(center), a.exE(center), `${cs} && ${cs}`);
        this.c.commit(k);
      }
    }
  }
}
