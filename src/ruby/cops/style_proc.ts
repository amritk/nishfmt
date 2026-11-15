// Style/Proc.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst, ssxIs, ssxIsAnyBlock, ssxMeth } from "./style_syntax_help";

export class CopStyleProc {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Proc");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsAnyBlock(src, n)) {
        continue;
      }
      const s = a.kid(n, 0);
      // (send (const {nil? cbase} :Proc) :new)
      if (!ssxIs(src, s, NT_SEND) || a.nKid(s) !== 2 || ssxMeth(src, s) !== "new" || !ssxGlobalConst(src, a.kid(s, 0), "Proc")) {
        continue;
      }
      const k = this.c.offense(a.exS(s), a.exE(s));
      if (k !== null) {
        k.replace(a.exS(s), a.exE(s), "proc");
        this.c.commit(k);
      }
    }
  }
}
