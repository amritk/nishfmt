// Style/StructInheritance (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CASGN, NT_CBASE, NT_CLASS, NT_CONST, NT_MODULE, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDescendants, ssxIs, ssxMeth } from "./style_syntax_help";

/** (send (const {nil? cbase} :Struct) :new ...) */
const rbStructInhNew = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "new") {
    return false;
  }
  const r = a.kid(n, 0);
  if (!ssxIs(src, r, NT_CONST) || a.text(a.kid(r, 1)) !== "Struct") {
    return false;
  }
  const sc = a.kid(r, 0);
  return sc === V_NIL || ssxIs(src, sc, NT_CBASE);
};

/** struct_constructor?: Struct.new, or a block on it. */
export const rbStructInhConstructor = (src: RbSource, n: i32): boolean =>
  rbStructInhNew(src, n) || (ssxIs(src, n, NT_BLOCK) && rbStructInhNew(src, src.a.kid(n, 0)));

export class CopStyleStructInheritance {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StructInheritance");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_CLASS)) {
        continue;
      }
      const parent = a.kid(n, 1);
      if (!rbStructInhConstructor(src, parent)) {
        continue;
      }
      const body = a.kid(n, 2);
      if (body !== V_NIL && a.isNode(body)) {
        let defines = false;
        const all: i32[] = [body];
        for (const d of ssxDescendants(src, body)) {
          all.push(d);
        }
        for (const d of all) {
          const t = a.type(d);
          if (t === NT_CASGN || t === NT_CLASS || t === NT_MODULE) {
            defines = true;
          }
        }
        if (defines) {
          continue;
        }
      }
      this.c.offense(a.exS(parent), a.exE(parent));
    }
  }
}
