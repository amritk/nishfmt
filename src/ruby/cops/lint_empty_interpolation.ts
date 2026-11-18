// Lint/EmptyInterpolation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_ARRAY, NT_BEGIN, NT_DSTR, NT_DSYM, NT_NIL, NT_REGEXP, NT_STR, NT_XSTR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxBasicLiteral, ssxFS, ssxIs } from "./style_syntax_help";

export class CopLintEmptyInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyInterpolation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (!(t === NT_DSTR || t === NT_XSTR || t === NT_DSYM || t === NT_REGEXP)) {
        continue;
      }
      for (let i = 0; i < a.nKid(n); i++) {
        const b = a.kid(n, i);
        if (ssxIs(src, b, NT_BEGIN)) {
          this.onInterpolation(src, b);
        }
      }
    }
  }

  private onInterpolation(src: RbSource, b: i32): void {
    const a = src.a;
    // in_percent_literal_array?
    let p = src.parent(b);
    while (p !== V_NIL && a.type(p) !== NT_ARRAY) {
      p = src.parent(p);
    }
    if (p !== V_NIL && a.has(a.map(p), F_BEGIN) && src.at(ssxFS(src, p, F_BEGIN)) === 37) {
      return;
    }
    for (let i = 0; i < a.nKid(b); i++) {
      const e = a.kid(b, i);
      if (ssxIs(src, e, NT_NIL)) {
        continue;
      }
      if (ssxBasicLiteral(src, e) && ssxIs(src, e, NT_STR) && a.text(a.kid(e, 0)).length === 0) {
        continue;
      }
      return;
    }
    const k = this.c.offense(a.exS(b), a.exE(b));
    if (k !== null) {
      k.remove(a.exS(b), a.exE(b));
      this.c.commit(k);
    }
  }
}
