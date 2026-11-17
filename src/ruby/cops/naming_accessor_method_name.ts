// Naming/AccessorMethodName (detection only; without a project index,
// overrides_inherited_method? is false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_ARG, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxDefName, ssxFE, ssxFS } from "./style_syntax_help";

export class CopNamingAccessorMethodName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/AccessorMethodName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const name = ssxDefName(src, n);
      // proper_attribute_name?
      if (name.endsWith("!") || name.endsWith("?") || name.endsWith("=")) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      const reader = name.startsWith("get_") && a.nKid(args) === 0;
      const writer = name.startsWith("set_") && a.nKid(args) === 1 && a.type(a.kid(args, 0)) === NT_ARG;
      if (reader || writer) {
        this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
      }
    }
  }
}
