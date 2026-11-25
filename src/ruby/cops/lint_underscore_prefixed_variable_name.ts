// Lint/UnderscorePrefixedVariableName (AllowKeywordBlockArguments: false; no
// correction): a `_`-prefixed variable that is read, on the VariableForce.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { F_NAME, NT_MATCH_WITH_LVASGN, NT_SEND, NT_ZSUPER } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { VfForce } from "./lint_variable_force";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopLintUnderscorePrefixedVariableName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UnderscorePrefixedVariableName");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const f = new VfForce(src);
    f.run();
    for (const si of f.popped) {
      if (si < 0 || si >= f.scopes.length) {
        fault();
        return;
      }
      for (const vi of f.scopes[si].vars) {
        if (vi < 0 || vi >= f.vars.length) {
          fault();
          return;
        }
        const v = f.vars[vi];
        if (!v.name.startsWith("_")) {
          continue;
        }
        let explicit = false;
        for (const r of v.refs) {
          const t = a.type(r);
          if (t !== NT_ZSUPER && t !== NT_SEND) {
            explicit = true;
          }
        }
        if (!explicit) {
          continue;
        }
        const d = v.decl;
        if (a.type(d) === NT_MATCH_WITH_LVASGN) {
          const re = a.kid(d, 0);
          this.c.offense(a.exS(re), a.exE(re));
        } else {
          this.c.offense(ssxFS(src, d, F_NAME), ssxFE(src, d, F_NAME));
        }
      }
    }
  }
}
