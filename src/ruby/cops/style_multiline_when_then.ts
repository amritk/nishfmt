// Style/MultilineWhenThen.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_ERANGE, NT_IRANGE, NT_WHEN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { RbSource } from "../source";
import { scnThen } from "./style_cond_help";
import { ssxDescendants, ssxFE, ssxFS } from "./style_syntax_help";

export class CopStyleMultilineWhenThen {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MultilineWhenThen");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_WHEN || !scnThen(src, n) || this.requireThen(src, n)) {
        continue;
      }
      const s = ssxFS(src, n, F_BEGIN);
      const e = ssxFE(src, n, F_BEGIN);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(rbSpaceBegin(src, s, 1, false, false, false), e);
        this.c.commit(k);
      }
    }
  }

  /** require_then? */
  private requireThen(src: RbSource, n: i32): boolean {
    const a = src.a;
    const first = a.kid(n, 0);
    const last = a.kid(n, a.nKid(n) - 2);
    if (src.line(a.exS(first)) !== src.line(a.exE(last))) {
      return true;
    }
    // ends_with_endless_range?
    const all: i32[] = [last];
    for (const d of ssxDescendants(src, last)) {
      all.push(d);
    }
    for (const r of all) {
      const t = a.type(r);
      if ((t === NT_IRANGE || t === NT_ERANGE) && a.kid(r, 1) === V_NIL && a.exE(r) === a.exE(last)) {
        return true;
      }
    }
    const body = a.kid(n, -1);
    if (body === V_NIL) {
      return false;
    }
    return src.line(a.exS(n)) === src.line(a.exS(body));
  }
}
