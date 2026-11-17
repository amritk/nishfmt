// Style/RandomWithOffset.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ERANGE, NT_INT, NT_IRANGE, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst, ssxIntValue, ssxIs, ssxMeth } from "./style_syntax_help";

/** (send {nil? (const {nil? cbase} :Random) (const {nil? cbase} :Kernel)} :rand {int (range int int)}) */
const ssxRwoRand = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!ssxIs(src, n, NT_SEND) || a.nKid(n) !== 3 || ssxMeth(src, n) !== "rand") {
    return false;
  }
  const r = a.kid(n, 0);
  if (r !== V_NIL && !ssxGlobalConst(src, r, "Random") && !ssxGlobalConst(src, r, "Kernel")) {
    return false;
  }
  const arg = a.kid(n, 2);
  if (ssxIs(src, arg, NT_INT)) {
    return true;
  }
  return (
    (ssxIs(src, arg, NT_IRANGE) || ssxIs(src, arg, NT_ERANGE)) &&
    ssxIs(src, a.kid(arg, 0), NT_INT) &&
    ssxIs(src, a.kid(arg, 1), NT_INT)
  );
};

export class CopStyleRandomWithOffset {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RandomWithOffset");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const recv = a.kid(n, 0);
      if (recv === V_NIL) {
        continue;
      }
      const m = ssxMeth(src, n);
      const pm = m === "+" || m === "-";
      const intOpRand = pm && a.nKid(n) === 3 && ssxIs(src, recv, NT_INT) && ssxRwoRand(src, a.kid(n, 2));
      const randOpInt = pm && a.nKid(n) === 3 && ssxRwoRand(src, recv) && ssxIs(src, a.kid(n, 2), NT_INT);
      const randMod = (m === "succ" || m === "pred" || m === "next") && a.nKid(n) === 2 && ssxRwoRand(src, recv);
      if (!intOpRand && !randOpInt && !randMod) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // random_call: the rand call is the receiver (first form) or the argument.
      const rc = ssxIs(src, recv, NT_SEND) && a.nKid(recv) === 3 ? recv : a.kid(n, 2);
      const pn = a.kid(rc, 0);
      const prefix = pn === V_NIL ? "rand" : `${src.nodeSrc(pn)}.rand`;
      const rn = a.kid(rc, 2);
      let left: i64 = 0;
      let right: i64 = 0;
      if (a.type(rn) === NT_INT) {
        right = ssxIntValue(src, rn) - 1;
      } else {
        left = ssxIntValue(src, a.kid(rn, 0));
        right = ssxIntValue(src, a.kid(rn, 1));
        if (a.type(rn) === NT_ERANGE) {
          right = right - 1;
        }
      }
      let lo: i64 = 0;
      let hi: i64 = 0;
      if (intOpRand) {
        const off = ssxIntValue(src, recv);
        lo = m === "+" ? off + left : off - right;
        hi = m === "+" ? off + right : off - left;
      } else if (randOpInt) {
        const off = ssxIntValue(src, a.kid(n, 2));
        lo = m === "+" ? left + off : left - off;
        hi = m === "+" ? right + off : right - off;
      } else {
        const d: i64 = m === "pred" ? -1 : 1;
        lo = left + d;
        hi = right + d;
      }
      k.replace(a.exS(n), a.exE(n), `${prefix}(${lo}..${hi})`);
      this.c.commit(k);
    }
  }
}
