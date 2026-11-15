// Style/ClassMethods.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_BEGIN, NT_CLASS, NT_DEFS, NT_MODULE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";
import { ssxAstEqual } from "./style_syntax_reparse";

export class CopStyleClassMethods {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ClassMethods");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      const body = a.kid(n, -1);
      if (body === V_NIL) {
        continue;
      }
      const name = a.kid(n, 0);
      if (ssxIs(src, body, NT_DEFS)) {
        this.check(src, name, body);
      } else if (ssxIs(src, body, NT_BEGIN)) {
        for (let i = 0; i < a.nKid(body); i++) {
          if (ssxIs(src, a.kid(body, i), NT_DEFS)) {
            this.check(src, name, a.kid(body, i));
          }
        }
      }
    }
  }

  private check(src: RbSource, name: i32, d: i32): void {
    const a = src.a;
    const r = a.kid(d, 0);
    if (!ssxAstEqual(a, name, a, r) || !ssxHas(src, r, F_NAME)) {
      return;
    }
    const k = this.c.offense(ssxFS(src, r, F_NAME), ssxFE(src, r, F_NAME));
    if (k !== null) {
      k.replace(a.exS(r), a.exE(r), "self");
      this.c.commit(k);
    }
  }
}
