// Style/ClassAndModuleChildren (EnforcedStyle: nested; its correction is
// unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_CBASE, NT_CLASS, NT_CONST, NT_MODULE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs } from "./style_syntax_help";

/** const_namespace?: nil, cbase, or consts down to one of those. */
const rbCamcConstNamespace = (src: RbSource, n0: i32): boolean => {
  let n = n0;
  while (true) {
    if (n === V_NIL || ssxIs(src, n, NT_CBASE)) {
      return true;
    }
    if (!ssxIs(src, n, NT_CONST)) {
      return false;
    }
    n = src.a.kid(n, 0);
  }
};

export class CopStyleClassAndModuleChildren {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ClassAndModuleChildren");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_CLASS) && !ssxIs(src, n, NT_MODULE)) {
        continue;
      }
      const id = a.kid(n, 0);
      const ns = ssxIs(src, id, NT_CONST) ? a.kid(id, 0) : V_NIL;
      if (ssxIs(src, ns, NT_CBASE) || !rbCamcConstNamespace(src, ns)) {
        continue;
      }
      // compact_node_name?
      if (src.nodeSrc(id).indexOf("::", 0) < 0) {
        continue;
      }
      const p = src.parent(n);
      if (ssxIs(src, p, NT_CLASS) || ssxIs(src, p, NT_MODULE)) {
        continue;
      }
      this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
    }
  }
}
