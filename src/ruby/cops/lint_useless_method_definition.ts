// Lint/UselessMethodDefinition (unsafe; detection only): a method whose body
// is only `super` with the same arguments.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_DEF,
  NT_DEFS,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_OPTARG,
  NT_RESTARG,
  NT_SEND,
  NT_SUPER,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhType } from "./lint_detect_help";
import { ssxDefArgs, ssxDefBody, ssxMacro, ssxMeth } from "./style_syntax_help";

export class CopLintUselessMethodDefinition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UselessMethodDefinition");
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
      // method_definition_with_modifier?
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_SEND) {
        const m = ssxMeth(src, p);
        const nonBare =
          ssxMacro(src, p) &&
          a.nKid(p) === 3 &&
          (m === "public" || m === "protected" || m === "private" || m === "module_function");
        if (!nonBare) {
          continue;
        }
      }
      const args = ssxDefArgs(src, n);
      let rest = false;
      for (let i = 0; i < a.nKid(args); i++) {
        const at = ldhType(src, a.kid(args, i));
        if (at === NT_RESTARG || at === NT_OPTARG || at === NT_KWOPTARG || at === NT_KWRESTARG) {
          rest = true;
        }
      }
      if (rest) {
        continue;
      }
      const body = ssxDefBody(src, n);
      const bt = ldhType(src, body);
      let delegating = bt === NT_ZSUPER;
      if (bt === NT_SUPER && a.nKid(body) === a.nKid(args)) {
        delegating = true;
        for (let i = 0; i < a.nKid(args); i++) {
          const x = a.kid(body, i);
          const y = a.kid(args, i);
          if (src.src(a.exS(x), a.exE(x)) !== src.src(a.exS(y), a.exE(y))) {
            delegating = false;
          }
        }
      }
      if (delegating) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
