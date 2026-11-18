// Style/GlobalStdStream (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CBASE, NT_CONST, NT_GVASGN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

export class CopStyleGlobalStdStream {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/GlobalStdStream");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_CONST)) {
        continue;
      }
      // namespaced?: a namespace other than a bare `::`.
      const ns = a.kid(n, 0);
      if (ns !== V_NIL && !ssxIs(src, ns, NT_CBASE)) {
        continue;
      }
      const name = a.text(a.kid(n, 1));
      let gvar = "";
      if (name === "STDIN") {
        gvar = "$stdin";
      } else if (name === "STDOUT") {
        gvar = "$stdout";
      } else if (name === "STDERR") {
        gvar = "$stderr";
      } else {
        continue;
      }
      // (gvasgn %1 (const nil? _))
      const p = src.parent(n);
      if (ssxIs(src, p, NT_GVASGN) && a.text(a.kid(p, 0)) === gvar && a.kid(p, 1) === n && ns === V_NIL) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
