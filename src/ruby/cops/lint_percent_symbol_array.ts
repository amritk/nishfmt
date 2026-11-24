// Lint/PercentSymbolArray.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, sub32 } from "../../core/arr";
import { NT_ARRAY, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitChars, rbLitIsPercent, rbLitPctType } from "./lit_help";
import { rbLitUAlnum } from "./lit_unicode";

export class CopLintPercentSymbolArray {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/PercentSymbolArray");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY || !rbLitIsPercent(src, n)) {
        continue;
      }
      const type = rbLitPctType(src, n);
      if (type !== "%i" && type !== "%I") {
        continue;
      }
      // contains_colons_or_commas? (a dsym's first child prints as an s-expression: never)
      let found = false;
      for (let i = 0; i < a.nKid(n); i++) {
        const c = a.kid(n, i);
        if (a.type(c) !== NT_SYM) {
          continue;
        }
        const lit = a.text(a.kid(c, 0));
        let alnum = false;
        for (const ch of rbLitChars(lit)) {
          if (rbLitUAlnum(ch)) {
            alnum = true;
          }
        }
        if (!alnum) {
          continue;
        }
        if (lit.startsWith(":") || lit.endsWith(",")) {
          found = true;
          break;
        }
      }
      if (!found) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      for (let i = 0; i < a.nKid(n); i++) {
        const c = a.kid(n, i);
        const s = a.exS(c);
        const e = a.exE(c);
        if (rbAtOff(src, e, -1) === 44) {
          k.remove(sub32(e, 1), e);
        }
        if (src.at(s) === 58) {
          k.remove(s, add32(s, 1));
        }
      }
      this.c.commit(k);
    }
  }
}
