// Lint/ImplicitStringConcatenation. Its correction is safe, so it runs under
// `rubocop -a` too: an empty side is removed, otherwise the gap becomes ` + `.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DSTR, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

/** StrNode#value / DstrNode#value is the empty string. */
const liscEmptyValue = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIs(src, n, NT_STR)) {
    return a.text(a.kid(n, 0)).length === 0;
  }
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (!a.isNode(c)) {
      continue;
    }
    if (ssxIs(src, c, NT_STR) || ssxIs(src, c, NT_DSTR)) {
      if (!liscEmptyValue(src, c)) {
        return false;
      }
    } else if (a.exE(c) > a.exS(c)) {
      // child.source
      return false;
    }
  }
  return true;
};

export class CopLintImplicitStringConcatenation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ImplicitStringConcatenation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_DSTR) {
        continue;
      }
      for (let i = 0; i + 1 < a.nKid(n); i++) {
        const l = a.kid(n, i);
        const r = a.kid(n, i + 1);
        if (!this.strLit(src, l) || !this.strLit(src, r)) {
          continue;
        }
        if (src.line(a.exE(l)) !== src.line(a.exS(r))) {
          continue;
        }
        // source[-1] == ending_delimiter: the first character is ' or " and the last is the same.
        const f = src.at(a.exS(l));
        if ((f !== 39 && f !== 34) || a.exE(l) <= a.exS(l) || src.at(a.exE(l) - 1) !== f) {
          continue;
        }
        const k = this.c.offense(a.exS(l), a.exE(r));
        if (k === null) {
          continue;
        }
        if (liscEmptyValue(src, l)) {
          k.remove(a.exS(l), a.exE(l));
        } else if (liscEmptyValue(src, r)) {
          k.remove(a.exS(r), a.exE(r));
        } else {
          k.replace(a.exE(l), a.exS(r), " + ");
        }
        this.c.commit(k);
      }
    }
  }

  private strLit(src: RbSource, n: i32): boolean {
    return ssxIs(src, n, NT_STR) || ssxIs(src, n, NT_DSTR);
  }
}
