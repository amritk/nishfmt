// Naming/MethodParameterName (detection only; MinNameLength: 3,
// AllowNamesEndingInNumbers: true, the default AllowedNames, ForbiddenNames:
// []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhUncommunicative } from "./naming_help";
import { ssxDefArgs } from "./style_syntax_help";

export class CopNamingMethodParameterName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/MethodParameterName");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (src.a.nKid(args) > 0) {
        nmhUncommunicative(this.c, src, args, 3, " as at by cc db id if in io ip of on os pp to ");
      }
    }
  }
}
