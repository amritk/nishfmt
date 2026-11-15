// Style/TrailingCommaInArguments (EnforcedStyleForMultiline: no_comma).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxArgs, ssxIsCall, ssxMeth, ssxParenthesized, ssxTrailingCommaCheck } from "./style_syntax_help";

export class CopStyleTrailingCommaInArguments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingCommaInArguments");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n)) {
        continue;
      }
      const args = ssxArgs(src, n);
      if (args.length === 0 || !(ssxParenthesized(src, n) || ssxMeth(src, n) === "[]")) {
        continue;
      }
      ssxTrailingCommaCheck(this.c, src, args, a.exE(args[args.length - 1]), a.exE(n));
    }
  }
}
