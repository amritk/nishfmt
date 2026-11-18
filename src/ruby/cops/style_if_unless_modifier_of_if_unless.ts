// Style/IfUnlessModifierOfIfUnless.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_IF } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnIfBranch, scnKeyword, scnModifier } from "./style_cond_help";
import { ssxFE, ssxFS, ssxIs } from "./style_syntax_help";

export class CopStyleIfUnlessModifierOfIfUnless {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/IfUnlessModifierOfIfUnless");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !scnModifier(src, n)) {
        continue;
      }
      const b = scnIfBranch(src, n);
      if (!ssxIs(src, b, NT_IF)) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k !== null) {
        const cond = a.kid(n, 0);
        k.wrap(a.exS(b), a.exE(b), `${scnKeyword(src, n)} ${src.nodeSrc(cond)}\n`, "\nend");
        k.remove(a.exE(b), a.exE(cond));
        this.c.commit(k);
      }
    }
  }
}
