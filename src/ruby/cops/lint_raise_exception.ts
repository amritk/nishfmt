// Lint/RaiseException (unsafe; detection only; AllowedImplicitNamespaces:
// [Gem]): `raise Exception` / `raise Exception.new(...)`.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CBASE, NT_CONST, NT_MODULE, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhType } from "./lint_detect_help";
import { ssxMeth } from "./style_syntax_help";

/** `(const ${cbase nil?} :Exception)`: 0 no, 1 with no namespace, 2 with a cbase. */
const lreException = (src: RbSource, n: i32): i32 => {
  if (ldhType(src, n) !== NT_CONST || src.a.text(src.a.kid(n, 1)) !== "Exception") {
    return 0;
  }
  const ns = src.a.kid(n, 0);
  if (ns === V_NIL) {
    return 1;
  }
  return ldhType(src, ns) === NT_CBASE ? 2 : 0;
};

/** implicit_namespace?: an enclosing `module Gem`. */
const lreImplicitNamespace = (src: RbSource, n: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (src.a.type(p) === NT_MODULE) {
      const id = src.a.kid(p, 0);
      if (src.src(src.a.exS(id), src.a.exE(id)) === "Gem") {
        return true;
      }
    }
    p = src.parent(p);
  }
  return false;
};

export class CopLintRaiseException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RaiseException");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) < 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "raise" && m !== "fail") {
        continue;
      }
      let cls = V_NIL;
      let kind = lreException(src, a.kid(n, 2));
      if (kind > 0) {
        cls = a.kid(n, 2);
      } else if (a.nKid(n) === 3) {
        // (send $(const ...) :new ...)
        const x = a.kid(n, 2);
        if (ldhType(src, x) === NT_SEND && ssxMeth(src, x) === "new") {
          kind = lreException(src, a.kid(x, 0));
          if (kind > 0) {
            cls = a.kid(x, 0);
          }
        }
      }
      if (cls === V_NIL) {
        continue;
      }
      if (kind === 1 && lreImplicitNamespace(src, n)) {
        continue;
      }
      this.c.offense(a.exS(cls), a.exE(cls));
    }
  }
}
