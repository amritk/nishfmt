// Lint/SafeNavigationChain (its correction is unsafe; detection only;
// AllowedMethods: [present? blank? presence try try! in?]): an ordinary
// method call chained after `&.`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, NT_AND, NT_BEGIN, NT_CSEND, NT_IF, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { ldhNilMethod, ldhType } from "./lint_detect_help";
import { ssxFS, ssxHas, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** Node#receiver (and SendNode's): a call's receiver, a block's call's receiver, else V_NIL. */
export const lsncReceiver = (src: RbSource, n: i32): i32 => {
  if (ssxIsCall(src, n)) {
    return src.a.kid(n, 0);
  }
  if (ssxIsAnyBlock(src, n) && ssxIsCall(src, src.a.kid(n, 0))) {
    return src.a.kid(src.a.kid(n, 0), 0);
  }
  return V_NIL;
};

/** Structural equality where either side may be nil. */
const lsncEq = (src: RbSource, x: i32, y: i32): boolean => {
  if (x === V_NIL || y === V_NIL) {
    return x === y;
  }
  return vfSameNode(src, x, y);
};

export class CopLintSafeNavigationChain {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SafeNavigationChain");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      // require_safe_navigation?
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_AND) {
        const l = a.kid(p, 0);
        const r = a.kid(p, 1);
        if (lsncEq(src, r, n) && lsncEq(src, lsncReceiver(src, l), lsncReceiver(src, r))) {
          continue;
        }
      }
      // bad_method?
      const recv = a.kid(n, 0);
      const rt = ldhType(src, recv);
      let ok = rt === NT_CSEND;
      if (!ok && ssxIsAnyBlock(src, recv)) {
        ok = ldhType(src, a.kid(recv, 0)) === NT_CSEND;
      }
      if (!ok && rt === NT_BEGIN) {
        ok = a.nKid(recv) === 1 && ldhType(src, a.kid(recv, 0)) === NT_CSEND;
      }
      if (!ok) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (
        ldhNilMethod(m) ||
        m === "to_d" ||
        m === "present?" ||
        m === "blank?" ||
        m === "presence" ||
        m === "try" ||
        m === "try!" ||
        m === "in?"
      ) {
        continue;
      }
      if (m === "+@" || m === "-@") {
        continue;
      }
      // ternary_safe_navigation?
      if (p !== V_NIL && a.type(p) === NT_IF && a.kid(p, 1) === n && lsncEq(src, a.kid(p, 0), recv)) {
        continue;
      }
      const s = ssxHas(src, n, F_DOT) ? ssxFS(src, n, F_DOT) : a.exE(recv);
      this.c.offense(s, a.exE(n));
    }
  }
}
