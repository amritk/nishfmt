// Style/OptionalBooleanParameter (AllowedMethods: respond_to_missing?;
// detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DEF, NT_DEFS, NT_FALSE, NT_OPTARG, NT_TRUE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxDefName, ssxIs } from "./style_syntax_help";

export class CopStyleOptionalBooleanParameter {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/OptionalBooleanParameter");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_DEF) && !ssxIs(src, n, NT_DEFS)) {
        continue;
      }
      if (ssxDefName(src, n) === "respond_to_missing?") {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (!a.isNode(args)) {
        continue;
      }
      for (let i = 0; i < a.nKid(args); i++) {
        const x = a.kid(args, i);
        if (!ssxIs(src, x, NT_OPTARG)) {
          continue;
        }
        const v = a.kid(x, 1);
        if (ssxIs(src, v, NT_TRUE) || ssxIs(src, v, NT_FALSE)) {
          this.c.offense(a.exS(x), a.exE(x));
        }
      }
    }
  }
}
