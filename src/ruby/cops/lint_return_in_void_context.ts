// Lint/ReturnInVoidContext (no correction): `return value` in `initialize`
// or a setter method, outside a lambda / define_method block.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_DEF, NT_RETURN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAncestorDef, ldhAssignmentMethod } from "./lint_detect_help";
import { ssxDefName, ssxFE, ssxFS, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

export class CopLintReturnInVoidContext {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ReturnInVoidContext");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RETURN) {
        continue;
      }
      // return_node.descendants.any?
      let any = false;
      for (let i = 0; i < a.nKid(n); i++) {
        if (a.isNode(a.kid(n, i))) {
          any = true;
        }
      }
      if (!any) {
        continue;
      }
      const d = ldhAncestorDef(src, n);
      if (d === V_NIL) {
        continue;
      }
      const name = ssxDefName(src, d);
      if (!((a.type(d) === NT_DEF && name === "initialize") || ldhAssignmentMethod(name))) {
        continue;
      }
      let scoped = false;
      let p = src.parent(n);
      while (p !== V_NIL && !scoped) {
        if (ssxIsAnyBlock(src, p)) {
          // BlockNode#method_name: the send node's method name
          const s = a.kid(p, 0);
          const m = ssxIsCall(src, s) ? ssxMeth(src, s) : "";
          scoped = m === "lambda" || m === "define_method" || m === "define_singleton_method";
        }
        p = src.parent(p);
      }
      if (!scoped) {
        this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      }
    }
  }
}
