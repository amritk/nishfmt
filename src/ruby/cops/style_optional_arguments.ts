// Style/OptionalArguments (detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARG, NT_DEF, NT_DEFS, NT_OPTARG } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxIs } from "./style_syntax_help";

export class CopStyleOptionalArguments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/OptionalArguments");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_DEF) && !ssxIs(src, n, NT_DEFS)) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (!a.isNode(args)) {
        continue;
      }
      let lastArg = -1;
      for (let i = 0; i < a.nKid(args); i++) {
        if (ssxIs(src, a.kid(args, i), NT_ARG)) {
          lastArg = i;
        }
      }
      if (lastArg < 0) {
        continue;
      }
      for (let i = 0; i < lastArg; i++) {
        const x = a.kid(args, i);
        if (ssxIs(src, x, NT_OPTARG)) {
          this.c.offense(a.exS(x), a.exE(x));
        }
      }
    }
  }
}
