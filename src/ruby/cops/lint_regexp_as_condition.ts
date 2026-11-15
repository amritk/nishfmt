// Lint/RegexpAsCondition.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CASE, NT_CASE_MATCH, NT_IF, NT_MATCH_CURRENT_LINE, NT_SEND, NT_UNTIL, NT_WHILE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintRegexpAsCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RegexpAsCondition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const ign = new LalIgnored();
    for (const n of src.pre) {
      if (a.type(n) !== NT_MATCH_CURRENT_LINE) {
        continue;
      }
      let cond = false;
      let p = src.parent(n);
      while (p !== V_NIL) {
        const t = a.type(p);
        if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_CASE || t === NT_CASE_MATCH) {
          cond = true;
          break;
        }
        p = src.parent(p);
      }
      if (!cond || ign.partOf(src, n)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        const q = src.parent(n);
        if (q !== V_NIL && ssxIs(src, q, NT_SEND) && ssxMeth(src, q) === "!") {
          k.replace(a.exS(q), a.exE(q), `!(${src.nodeSrc(n)} =~ $_)`);
        } else {
          k.replace(a.exS(n), a.exE(n), `${src.nodeSrc(n)} =~ $_`);
        }
        this.c.commit(k);
      }
      ign.add(n);
    }
  }
}
