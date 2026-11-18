// Style/RaiseArgs (EnforcedStyle: exploded, AllowedCompactTypes: []; unsafe:
// detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_FORWARDED_ARGS,
  NT_FORWARDED_KWRESTARG,
  NT_FORWARDED_RESTARG,
  NT_HASH,
  NT_SEND,
  NT_SPLAT,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopStyleRaiseArgs {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RaiseArgs");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || a.kid(n, 0) !== V_NIL) {
        continue;
      }
      const m = ssxMeth(src, n);
      if ((m !== "raise" && m !== "fail") || a.nKid(n) !== 3) {
        continue;
      }
      // use_new_method?
      const x = a.kid(n, 2);
      if (!ssxIs(src, x, NT_SEND) || a.kid(x, 0) === V_NIL || ssxMeth(src, x) !== "new") {
        continue;
      }
      // acceptable_exploded_args?
      const k = a.nKid(x) - 2;
      if (k > 1) {
        continue;
      }
      if (k === 1) {
        const t = a.type(a.kid(x, 2));
        if (
          t === NT_HASH ||
          t === NT_FORWARDED_RESTARG ||
          t === NT_SPLAT ||
          t === NT_FORWARDED_KWRESTARG ||
          t === NT_FORWARDED_ARGS
        ) {
          continue;
        }
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
