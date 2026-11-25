// Style/FloatDivision (EnforcedStyle: single_coerce; unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_SELECTOR,
  NT_BLOCK,
  NT_CBASE,
  NT_CONST,
  NT_CSEND,
  NT_INT,
  NT_NTH_REF,
  NT_NUMBLOCK,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFS, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** Node#receiver: a send's receiver, or a block's call's receiver (V_NIL otherwise). */
export const rbNodeReceiver = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return V_NIL;
  }
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return a.kid(n, 0);
  }
  if ((t === NT_BLOCK || t === NT_NUMBLOCK) && ssxIsCall(src, a.kid(n, 0))) {
    return a.kid(a.kid(n, 0), 0);
  }
  return V_NIL;
};

/** to_f_method?: (send !nil? :to_f). */
const rbFdToF = (src: RbSource, n: i32): boolean =>
  ssxIs(src, n, NT_SEND) && src.a.nKid(n) === 2 && src.a.kid(n, 0) !== V_NIL && ssxMeth(src, n) === "to_f";

/** regexp_last_match?. */
const rbFdLastMatch = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIs(src, n, NT_NTH_REF)) {
    return true;
  }
  if (
    !ssxIs(src, n, NT_SEND) ||
    a.nKid(n) !== 3 ||
    ssxMeth(src, n) !== "last_match" ||
    !ssxIs(src, a.kid(n, 2), NT_INT)
  ) {
    return false;
  }
  const r = a.kid(n, 0);
  if (!ssxIs(src, r, NT_CONST) || a.text(a.kid(r, 1)) !== "Regexp") {
    return false;
  }
  return a.kid(r, 0) === V_NIL || ssxIs(src, a.kid(r, 0), NT_CBASE);
};

export class CopStyleFloatDivision {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/FloatDivision");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "/") {
        continue;
      }
      const recv = a.kid(n, 0);
      const arg = a.kid(n, 2);
      if (arg === V_NIL) {
        // node.first_argument.receiver raises
        continue;
      }
      if (rbFdLastMatch(src, rbNodeReceiver(src, recv)) || rbFdLastMatch(src, rbNodeReceiver(src, arg))) {
        continue;
      }
      // both_coerce?
      if (a.nKid(n) !== 3 || !rbFdToF(src, recv) || !rbFdToF(src, arg)) {
        continue;
      }
      // comment_before_to_f?: a comment inside the argument's `.to_f`.
      const s = a.exE(a.kid(arg, 0));
      const e = ssxFS(src, arg, F_SELECTOR);
      let comment = false;
      const commS = src.commS;
      const commE = src.commE;
      for (let i = 0; i < commS.length && i < commE.length; i++) {
        if (commS[i] >= s && commE[i] <= e) {
          comment = true;
        }
      }
      if (!comment) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
