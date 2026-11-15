// Layout/CaseIndentation (EnforcedStyle: case, IndentOneStep: false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_CASE, NT_CASE_MATCH } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rmlBlankRange, rmlSingleLine, rmlSpaces } from "./layout_multiline_help";

export class CopLayoutCaseIndentation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/CaseIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_CASE && t !== NT_CASE_MATCH) || rmlSingleLine(src, n)) {
        continue;
      }
      const base = src.column(rnS(src, n, F_KEYWORD));
      for (let i = 1; i < a.nKid(n) - 1; i++) {
        const w = a.kid(n, i);
        const ks = rnS(src, w, F_KEYWORD);
        const col = src.column(ks);
        if (col === base) {
          continue;
        }
        const k = this.c.offense(ks, rnE(src, w, F_KEYWORD));
        if (k === null) {
          continue;
        }
        if (rmlBlankRange(src, ks - col, ks)) {
          k.replace(ks - col, ks, rmlSpaces(base));
        }
        this.c.commit(k);
      }
    }
  }
}
