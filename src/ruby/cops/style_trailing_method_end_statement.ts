// Style/TrailingMethodEndStatement.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_KEYWORD, NT_DEF, NT_DEFS, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { ssxEndless, ssxFE, ssxFS, ssxMultiline } from "./style_syntax_help";

/** Style/TrailingMethodEndStatement. */
export class CopStyleTrailingMethodEndStatement {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingMethodEndStatement");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_DEF && t !== NT_DEFS) || ssxEndless(src, n)) {
        continue;
      }
      const body = a.kid(n, -1);
      if (body === V_NIL || !ssxMultiline(src, n)) {
        continue;
      }
      const es = ssxFS(src, n, F_END);
      const ee = ssxFE(src, n, F_END);
      if (src.line(a.exE(body)) !== src.line(ee)) {
        continue;
      }
      const k = this.c.offense(es, ee);
      if (k !== null) {
        k.insertBefore(es, ee, `\n${rmlSpaces(src.column(ssxFS(src, n, F_KEYWORD)))}`);
        this.c.commit(k);
      }
    }
  }
}
