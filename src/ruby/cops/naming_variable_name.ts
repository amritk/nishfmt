// Naming/VariableName (detection only; EnforcedStyle: snake_case, no
// allowed or forbidden identifiers or patterns).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_NAME,
  NT_ARG,
  NT_BLOCKARG,
  NT_CVASGN,
  NT_IVASGN,
  NT_KWARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_LVAR,
  NT_LVASGN,
  NT_OPTARG,
  NT_RESTARG,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhSnakeCase } from "./naming_help";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopNamingVariableName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/VariableName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (
        t !== NT_LVASGN &&
        t !== NT_IVASGN &&
        t !== NT_CVASGN &&
        t !== NT_ARG &&
        t !== NT_OPTARG &&
        t !== NT_RESTARG &&
        t !== NT_KWOPTARG &&
        t !== NT_KWARG &&
        t !== NT_KWRESTARG &&
        t !== NT_BLOCKARG &&
        t !== NT_LVAR
      ) {
        continue;
      }
      if (a.nKid(n) === 0 || a.kid(n, 0) === V_NIL) {
        continue;
      }
      if (!nmhSnakeCase(a.text(a.kid(n, 0)))) {
        this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
      }
    }
  }
}
