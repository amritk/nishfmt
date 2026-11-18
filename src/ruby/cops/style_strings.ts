// Style cops about string literals.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_BEGIN, NT_DSTR, NT_DSYM, NT_REGEXP, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas } from "../node";
import { RbSource } from "../source";
import { rbDoubleQuotesRequired, rbToStringLiteral } from "../util";

/** StringHelp#inside_interpolation?: under a `begin` that a dstr, dsym or regexp holds. */
export const rbInsideInterpolation = (src: RbSource, n: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL && src.a.type(p) !== NT_BEGIN) {
    p = src.parent(p);
  }
  while (p !== V_NIL) {
    const t = src.a.type(p);
    if (t === NT_DSTR || t === NT_DSYM || t === NT_REGEXP) {
      return true;
    }
    p = src.parent(p);
  }
  return false;
};

/** Style/StringLiterals (EnforcedStyle: single_quotes, ConsistentQuotesInMultiline: false). */
export class CopStyleStringLiterals {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StringLiterals");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_STR || !rnHas(src, n, F_BEGIN)) {
        continue;
      }
      // part_of_ignored_node?: StringHelp ignores every regexp.
      let p = src.parent(n);
      let ignored = false;
      while (p !== V_NIL) {
        if (a.type(p) === NT_REGEXP) {
          ignored = true;
          break;
        }
        p = src.parent(p);
      }
      if (ignored) {
        continue;
      }
      const text = src.nodeSrc(n);
      // wrong_quotes?
      if (text.startsWith("%") || text.startsWith("?")) {
        continue;
      }
      if (rbDoubleQuotesRequired(text) || rbInsideInterpolation(src, n)) {
        continue;
      }
      const s = a.exS(n);
      const e = a.exE(n);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, rbToStringLiteral(a.text(a.kid(n, 0))));
        this.c.commit(k);
      }
    }
  }
}
