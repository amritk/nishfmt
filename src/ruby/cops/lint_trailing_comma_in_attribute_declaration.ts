// Lint/TrailingCommaInAttributeDeclaration.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { ssxAttributeAccessor } from "./style_syntax_help";

export class CopLintTrailingCommaInAttributeDeclaration {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/TrailingCommaInAttributeDeclaration");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxAttributeAccessor(src, n) || a.nKid(n) < 4) {
        continue;
      }
      const lt = a.type(a.kid(n, -1));
      if (lt !== NT_DEF && lt !== NT_DEFS) {
        continue;
      }
      const e = rbSpaceEnd(src, a.exE(a.kid(n, -2)), 2, true, false, false);
      const k = this.c.offense(e, e + 1);
      if (k !== null) {
        k.remove(e, e + 1);
        this.c.commit(k);
      }
    }
  }
}
