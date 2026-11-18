// Naming/BlockParameterName (detection only; MinNameLength: 1,
// AllowNamesEndingInNumbers: true, AllowedNames: [], ForbiddenNames: []).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhUncommunicative } from "./naming_help";

export class CopNamingBlockParameterName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/BlockParameterName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      // on_block only: numblocks have no parameter names.
      if (src.a.type(n) !== NT_BLOCK) {
        continue;
      }
      const args = src.a.kid(n, 1);
      if (src.a.isNode(args) && src.a.nKid(args) > 0) {
        nmhUncommunicative(this.c, src, args, 1, " ");
      }
    }
  }
}
