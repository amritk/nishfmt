// Style/MultilineMemoization (EnforcedStyle: keyword).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import { F_BEGIN, F_END, NT_BEGIN, NT_OR_ASGN } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { ssxFE, ssxFS, ssxHas, ssxIsSpace, ssxMultiline } from "./style_syntax_help";

/** Style/MultilineMemoization. */
export class CopStyleMultilineMemoization {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MultilineMemoization");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_OR_ASGN) {
        continue;
      }
      const rhs = a.kid(n, 1);
      if (!a.isNode(rhs) || !ssxMultiline(src, rhs) || a.type(rhs) !== NT_BEGIN) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (ssxHas(src, rhs, F_BEGIN) && ssxHas(src, rhs, F_END)) {
        const col = src.column(a.exS(rhs));
        const bs = ssxFS(src, rhs, F_BEGIN);
        const be = ssxFE(src, rhs, F_BEGIN);
        k.replace(bs, be, src.at(be) === 10 ? "begin" : `begin\n${rmlSpaces(add32(col, 2))}`);
        // /[^\s)]/ on the closing paren's line
        const es = ssxFS(src, rhs, F_END);
        const l = src.line(es);
        let other = false;
        for (let p = src.lineStart(l); p < src.lineEnd(l); p++) {
          const c = src.at(p);
          if (!ssxIsSpace(c) && c !== 41) {
            other = true;
            break;
          }
        }
        k.replace(es, ssxFE(src, rhs, F_END), other ? `\n${rmlSpaces(col)}end` : "end");
      }
      this.c.commit(k);
    }
  }
}
