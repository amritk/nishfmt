// Style/RedundantInterpolation (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  NT_ARRAY,
  NT_BACK_REF,
  NT_BEGIN,
  NT_CVAR,
  NT_DSTR,
  NT_GVAR,
  NT_IVAR,
  NT_LVAR,
  NT_MATCH_PATTERN,
  NT_NTH_REF,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

export class CopStyleRedundantInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantInterpolation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_DSTR) || a.nKid(n) !== 1) {
        continue;
      }
      const e = a.kid(n, 0);
      if (!a.isNode(e)) {
        continue;
      }
      const t = a.type(e);
      // interpolation?: a variable, a reference or a begin
      if (
        t !== NT_LVAR &&
        t !== NT_IVAR &&
        t !== NT_CVAR &&
        t !== NT_GVAR &&
        t !== NT_NTH_REF &&
        t !== NT_BACK_REF &&
        t !== NT_BEGIN
      ) {
        continue;
      }
      const p = src.parent(n);
      if (ssxIs(src, p, NT_DSTR)) {
        continue;
      }
      if (
        ssxIs(src, p, NT_ARRAY) &&
        ssxHas(src, p, F_BEGIN) &&
        src.src(ssxFS(src, p, F_BEGIN), ssxFE(src, p, F_BEGIN)).startsWith("%")
      ) {
        continue;
      }
      // use_match_pattern?
      let mp = false;
      for (let i = 0; i < a.nKid(e); i++) {
        if (ssxIs(src, a.kid(e, i), NT_MATCH_PATTERN)) {
          mp = true;
        }
      }
      if (mp) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
