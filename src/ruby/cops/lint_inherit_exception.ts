// Lint/InheritException (EnforcedStyle: standard_error, no project index).
// Its correction is unsafe, so it only detects.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CBASE, NT_CLASS, NT_MODULE, NT_SCLASS, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhConstName, lbhGlobalConst, lbhSiblingIndex } from "./lint_batch_help";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintInheritException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/InheritException");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CLASS) {
        const pc = a.kid(n, 1);
        if (pc === V_NIL || lbhConstName(src, pc) !== "Exception") {
          continue;
        }
        if (this.omittedNamespace(src, n)) {
          continue;
        }
        this.c.offense(a.exS(pc), a.exE(pc));
      } else if (t === NT_SEND) {
        // (send (const {cbase nil?} :Class) :new $(const {cbase nil?} _))
        if (a.nKid(n) !== 3 || ssxMeth(src, n) !== "new" || !lbhGlobalConst(src, a.kid(n, 0), "Class")) {
          continue;
        }
        const k = a.kid(n, 2);
        if (!lbhGlobalConst(src, k, "Exception")) {
          continue;
        }
        this.c.offense(a.exS(k), a.exE(k));
      }
    }
  }

  /** inherit_exception_class_with_omitted_namespace?. */
  private omittedNamespace(src: RbSource, n: i32): boolean {
    const a = src.a;
    const pc = a.kid(n, 1);
    if (ssxIs(src, a.kid(pc, 0), NT_CBASE)) {
      return false;
    }
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    const idx = lbhSiblingIndex(src, n);
    for (let i = 0; i < idx; i++) {
      const s = a.kid(p, i);
      if (!a.isNode(s)) {
        continue;
      }
      const st = a.type(s);
      // ClassNode, ModuleNode and SClassNode respond to #identifier.
      if ((st === NT_CLASS || st === NT_MODULE || st === NT_SCLASS) && lbhConstName(src, a.kid(s, 0)) === "Exception") {
        return true;
      }
    }
    return false;
  }
}
