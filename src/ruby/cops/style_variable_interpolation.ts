// Style/VariableInterpolation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BACK_REF,
  NT_CVAR,
  NT_DSTR,
  NT_DSYM,
  NT_GVAR,
  NT_IVAR,
  NT_LVAR,
  NT_NTH_REF,
  NT_REGEXP,
  NT_XSTR,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

/** Style/VariableInterpolation. */
export class CopStyleVariableInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/VariableInterpolation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DSTR && t !== NT_XSTR && t !== NT_DSYM && t !== NT_REGEXP) {
        continue;
      }
      for (let i = 0; i < a.nKid(n); i++) {
        const v = a.kid(n, i);
        if (!a.isNode(v)) {
          continue;
        }
        const vt = a.type(v);
        if (
          vt !== NT_LVAR &&
          vt !== NT_IVAR &&
          vt !== NT_CVAR &&
          vt !== NT_GVAR &&
          vt !== NT_NTH_REF &&
          vt !== NT_BACK_REF
        ) {
          continue;
        }
        const k = this.c.offense(a.exS(v), a.exE(v));
        if (k !== null) {
          k.replace(a.exS(v), a.exE(v), `{${src.nodeSrc(v)}}`);
          this.c.commit(k);
        }
      }
    }
  }
}
