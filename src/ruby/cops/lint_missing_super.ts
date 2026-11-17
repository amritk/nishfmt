// Lint/MissingSuper (AllowedParentClasses: [], no project index; no
// correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BLOCK,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_SCLASS,
  NT_SEND,
  NT_SUPER,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhConstName, lbhGlobalConst } from "./lint_batch_help";
import { ssxDefName, ssxDescendants, ssxIs, ssxMeth } from "./style_syntax_help";

const LMS_CALLBACKS: string =
  ",inherited,method_added,method_removed,method_undefined,singleton_method_added,singleton_method_removed,singleton_method_undefined,";

export class CopLintMissingSuper {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/MissingSuper");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF) {
        const init = ssxDefName(src, n) === "initialize";
        const cb = this.callback(src, n);
        if (!(init || cb) || this.containsSuper(src, n)) {
          continue;
        }
        if ((init && this.statefulParent(src, n)) || cb) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      } else if (t === NT_DEFS) {
        if (this.callback(src, n) && !this.containsSuper(src, n)) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      }
    }
  }

  /** callback_method_def?. */
  private callback(src: RbSource, n: i32): boolean {
    if (LMS_CALLBACKS.indexOf(`,${ssxDefName(src, n)},`) < 0) {
      return false;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = src.a.type(p);
      if (t === NT_CLASS || t === NT_SCLASS || t === NT_MODULE) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }

  private containsSuper(src: RbSource, n: i32): boolean {
    for (const d of ssxDescendants(src, n)) {
      const t = src.a.type(d);
      if (t === NT_SUPER || t === NT_ZSUPER) {
        return true;
      }
    }
    return false;
  }

  private allowed(src: RbSource, c: i32): boolean {
    const nm = lbhConstName(src, c);
    return nm === "BasicObject" || nm === "Object";
  }

  /** inside_class_with_stateful_parent?. */
  private statefulParent(src: RbSource, n: i32): boolean {
    const a = src.a;
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        // class_new_block: (any_block (send (const {nil? cbase} :Class) :new $_) ...)
        const s = a.kid(p, 0);
        if (
          !ssxIs(src, s, NT_SEND) ||
          a.nKid(s) !== 3 ||
          ssxMeth(src, s) !== "new" ||
          !lbhGlobalConst(src, a.kid(s, 0), "Class")
        ) {
          return false;
        }
        return !this.allowed(src, a.kid(s, 2));
      }
      p = src.parent(p);
    }
    p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_CLASS) {
        const sup = a.kid(p, 1);
        return sup !== V_NIL && !this.allowed(src, sup);
      }
      p = src.parent(p);
    }
    return false;
  }
}
