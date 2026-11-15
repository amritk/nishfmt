// Layout/FirstParameterIndentation (EnforcedStyle: consistent).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_DEF, NT_DEFS, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalArgs, lalCheckFirst, lalFirstLine } from "./layout_align_help";

export class CopLayoutFirstParameterIndentation {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/FirstParameterIndentation");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const params = lalArgs(src, n);
      const args = a.kid(n, t === NT_DEF ? 1 : 2);
      if (params.length === 0 || args === V_NIL || !rnHas(src, args, F_BEGIN)) {
        continue;
      }
      const lp = rnS(src, args, F_BEGIN);
      const first = params[0];
      if (lalFirstLine(src, first) === src.line(lp)) {
        continue;
      }
      lalCheckFirst(this.c, this.al, src, first, lp, -1, false, 0);
    }
  }
}
