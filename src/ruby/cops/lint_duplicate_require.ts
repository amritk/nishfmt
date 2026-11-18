// Lint/DuplicateRequire. Its correction is unsafe, so it only detects.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhAnyConst, lbhSexp } from "./lint_batch_help";
import { ssxMeth } from "./style_syntax_help";

export class CopLintDuplicateRequire {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DuplicateRequire");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    // @required: parent (by identity) -> the "method + argument" keys seen.
    const required = new Map<i32, Set<string>>();
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "require" && m !== "require_relative") {
        continue;
      }
      const r = a.kid(n, 0);
      if (r !== V_NIL && !lbhAnyConst(src, r, "Kernel")) {
        continue;
      }
      const p = src.parent(n);
      const got = required.get(p);
      const set = got === undefined ? new Set<string>() : got;
      if (got === undefined) {
        required.set(p, set);
      }
      const key = `${m}${lbhSexp(src, a.kid(n, 2))}`;
      if (!set.has(key)) {
        set.add(key);
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
