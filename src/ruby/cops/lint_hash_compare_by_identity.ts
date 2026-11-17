// Lint/HashCompareByIdentity (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CSEND, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintHashCompareByIdentity {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/HashCompareByIdentity");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_SEND && t !== NT_CSEND) || a.nKid(n) < 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "key?" && m !== "has_key?" && m !== "fetch" && m !== "[]" && m !== "[]=") {
        continue;
      }
      const arg = a.kid(n, 2);
      if (ssxIs(src, arg, NT_SEND) && a.nKid(arg) === 2 && ssxMeth(src, arg) === "object_id") {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
