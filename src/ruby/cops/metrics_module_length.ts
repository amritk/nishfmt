// Metrics/ModuleLength (detection only; CountComments: false, Max: 100,
// CountAsOne: []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CASGN, NT_MODULE, NT_NUMBLOCK, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";
import { mtxCheckCodeLength } from "./metrics_help";
import { ssxGlobalConst } from "./style_syntax_help";

/** module_definition?: `(casgn nil? _ (any_block (send (const {nil? cbase} :Module) :new) ...))`. */
const mmoModuleCasgn = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (a.kid(n, 0) !== V_NIL) {
    return false;
  }
  const b = a.kid(n, 2);
  if (!a.isNode(b) || (a.type(b) !== NT_BLOCK && a.type(b) !== NT_NUMBLOCK)) {
    return false;
  }
  const s = a.kid(b, 0);
  return a.isNode(s) && a.type(s) === NT_SEND && a.nKid(s) === 2 && a.text(a.kid(s, 1)) === "new" && ssxGlobalConst(src, a.kid(s, 0), "Module");
};

export class CopMetricsModuleLength {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/ModuleLength");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_MODULE || (t === NT_CASGN && mmoModuleCasgn(src, n))) {
        mtxCheckCodeLength(this.c, src, L, n, 100);
      }
    }
  }
}
