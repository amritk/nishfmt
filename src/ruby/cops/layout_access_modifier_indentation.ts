// Layout/AccessModifierIndentation (EnforcedStyle: indent).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_KEYWORD, NT_BEGIN, NT_BLOCK, NT_CLASS, NT_MODULE, NT_SCLASS, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalBareAccessModifier, lalEffCol, lalFirstLine, lalIsType } from "./layout_align_help";

export class CopLayoutAccessModifierIndentation {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/AccessModifierIndentation");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let body = 0;
      if (t === NT_CLASS || t === NT_BLOCK) {
        body = a.kid(n, 2);
      } else if (t === NT_MODULE || t === NT_SCLASS) {
        body = a.kid(n, 1);
      } else {
        continue;
      }
      if (!lalIsType(src, body, NT_BEGIN) || !rnHas(src, n, F_END)) {
        continue;
      }
      // indentation_base_range: a block's `end`, else the class, module or sclass keyword.
      const basePos = t === NT_BLOCK ? rnS(src, n, F_END) : rnS(src, n, F_KEYWORD);
      for (let i = 0; i < a.nKid(body); i++) {
        const m = a.kid(body, i);
        if (!lalIsType(src, m, NT_SEND) || !lalBareAccessModifier(src, m)) {
          continue;
        }
        if (lalFirstLine(src, n) === lalFirstLine(src, m)) {
          continue;
        }
        const offset = lalEffCol(src, a.exS(m)) - lalEffCol(src, basePos);
        const delta = 2 - offset;
        if (delta === 0) {
          continue;
        }
        const k = this.c.offense(a.exS(m), a.exE(m));
        if (k !== null) {
          this.al.correct(src, k, a.exS(m), a.exE(m), delta, m);
          this.c.commit(k);
        }
      }
    }
  }
}
