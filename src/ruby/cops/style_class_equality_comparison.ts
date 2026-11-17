// Style/ClassEqualityComparison (AllowedMethods: ==, equal?, eql?; its
// correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_DEF, NT_DEFS, NT_DSTR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefName, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** (send _ :class), no arguments. */
const rbCecClassSend = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && src.a.nKid(n) === 2 && ssxMeth(src, n) === "class";

export class CopStyleClassEqualityComparison {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ClassEqualityComparison");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND)) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "==" && m !== "equal?" && m !== "eql?") {
        continue;
      }
      // Inside a def named by AllowedMethods.
      let p = src.parent(n);
      let allowed = false;
      while (p !== V_NIL) {
        const t = a.type(p);
        if (t === NT_DEF || t === NT_DEFS) {
          const dn = ssxDefName(src, p);
          allowed = dn === "==" || dn === "equal?" || dn === "eql?";
          break;
        }
        p = src.parent(p);
      }
      if (allowed || a.nKid(n) !== 3) {
        continue;
      }
      const recv = a.kid(n, 0);
      let classNode = V_NIL;
      if (rbCecClassSend(src, recv)) {
        classNode = recv;
      } else if (ssxIs(src, recv, NT_SEND) && a.nKid(recv) === 2 && rbCecClassSend(src, a.kid(recv, 0))) {
        const cm = ssxMeth(src, recv);
        if (cm === "name" || cm === "to_s" || cm === "inspect") {
          classNode = a.kid(recv, 0);
        }
      }
      if (classNode === V_NIL || ssxIs(src, a.kid(n, 2), NT_DSTR)) {
        continue;
      }
      this.c.offense(ssxFS(src, classNode, F_SELECTOR), a.exE(n));
    }
  }
}
