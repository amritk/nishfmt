// Lint/NestedMethodDefinition (AllowedMethods: [], AllowedPatterns: []; no
// correction): a def inside a def, unless a scoping block or `class << x`
// encloses it.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CONST, NT_DEF, NT_DEFS, NT_SCLASS, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAncestorDef, ldhType, ldhVariable } from "./lint_detect_help";
import { ssxClassConstructor, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** eval_call? / exec_call?: `(any_block (send _ {names} ...) ...)`. */
const lnmdEvalExec = (src: RbSource, n: i32): boolean => {
  if (!ssxIsAnyBlock(src, n)) {
    return false;
  }
  const s = src.a.kid(n, 0);
  if (ldhType(src, s) !== NT_SEND) {
    return false;
  }
  const m = ssxMeth(src, s);
  return m === "instance_eval" || m === "class_eval" || m === "module_eval" || m === "instance_exec" || m === "class_exec" || m === "module_exec";
};

export class CopLintNestedMethodDefinition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/NestedMethodDefinition");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      if (t === NT_DEFS) {
        // allowed_subject_type?
        const subj = a.kid(n, 0);
        if (ldhVariable(src, subj) || ldhType(src, subj) === NT_CONST || ssxIsCall(src, subj)) {
          continue;
        }
      }
      if (ldhAncestorDef(src, n) === V_NIL) {
        continue;
      }
      let scoped = false;
      let p = src.parent(n);
      while (p !== V_NIL && !scoped) {
        const pt = a.type(p);
        if (pt === NT_SCLASS) {
          scoped = true;
        } else if (ssxIsAnyBlock(src, p)) {
          scoped = lnmdEvalExec(src, p) || ssxClassConstructor(src, p);
        }
        p = src.parent(p);
      }
      if (!scoped) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
