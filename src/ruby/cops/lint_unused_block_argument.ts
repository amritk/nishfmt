// Lint/UnusedBlockArgument (IgnoreEmptyBlocks: true,
// AllowUnusedKeywordArguments: false), on the VariableForce.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_SHADOWARG, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { VfForce, vfUnusedArgCorrect } from "./lint_variable_force";
import { ssxFE, ssxFS } from "./style_syntax_help";

export class CopLintUnusedBlockArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UnusedBlockArgument");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const f = new VfForce(src);
    f.run();
    const a = src.a;
    for (const si of f.popped) {
      for (const vi of f.scopes[si].vars) {
        const v = f.vars[vi];
        // allowed_block?
        if (!f.isBlockArgument(vi) || a.kid(f.scopes[v.scope].node, 2) === V_NIL) {
          continue;
        }
        // used_block_local?
        if (a.type(v.decl) === NT_SHADOWARG && v.asg.length > 0) {
          continue;
        }
        if (v.name.startsWith("_") || v.nref > 0) {
          continue;
        }
        const k = this.c.offense(ssxFS(src, v.decl, F_NAME), ssxFE(src, v.decl, F_NAME));
        if (k !== null) {
          vfUnusedArgCorrect(src, k, v.decl);
          this.c.commit(k);
        }
      }
    }
  }
}
