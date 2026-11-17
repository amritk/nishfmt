// Style/EvenOdd.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_INT, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

/** (int v) */
const ssxEoInt = (src: RbSource, n: i32, v: string): boolean =>
  ssxIs(src, n, NT_INT) && src.a.text(src.a.kid(n, 0)) === v;

/** (send $_ :% (int 2)): the base, or V_NIL. */
const ssxEoMod2 = (src: RbSource, n: i32): i32 => {
  if (
    !ssxIs(src, n, NT_SEND) ||
    src.a.nKid(n) !== 3 ||
    ssxMeth(src, n) !== "%" ||
    !ssxEoInt(src, src.a.kid(n, 2), "2")
  ) {
    return V_NIL;
  }
  return src.a.kid(n, 0);
};

export class CopStyleEvenOdd {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EvenOdd");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.nKid(n) !== 3) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "==" && m !== "!=") {
        continue;
      }
      let recv = a.kid(n, 0);
      if (ssxIs(src, recv, NT_BEGIN) && a.nKid(recv) === 1) {
        recv = a.kid(recv, 0);
      }
      const base = ssxEoMod2(src, recv);
      if (base === V_NIL) {
        continue;
      }
      const arg = a.kid(n, 2);
      const zero = ssxEoInt(src, arg, "0");
      if (!zero && !ssxEoInt(src, arg, "1")) {
        continue;
      }
      const even = zero === (m === "==");
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const bm = ssxMeth(src, base);
      const bs =
        ssxIs(src, base, NT_SEND) && ssxOperatorName(bm) && bm !== "[]" ? `(${src.nodeSrc(base)})` : src.nodeSrc(base);
      k.replace(a.exS(n), a.exE(n), `${bs}.${even ? "even" : "odd"}?`);
      this.c.commit(k);
    }
  }
}
