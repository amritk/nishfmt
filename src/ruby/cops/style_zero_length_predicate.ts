// Style/ZeroLengthPredicate (unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_CBASE, NT_CONST, NT_INT, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFS, ssxIntValue, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** (call (...) {:length :size}): a length call with a receiver and no arguments. */
const rbZlpLength = (src: RbSource, n: i32): boolean => {
  if (!ssxIsCall(src, n) || src.a.nKid(n) !== 2 || !src.a.isNode(src.a.kid(n, 0))) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "length" || m === "size";
};

/** (int <v>). */
const rbZlpInt = (src: RbSource, n: i32, v: i64): boolean => ssxIs(src, n, NT_INT) && ssxIntValue(src, n) === v;

/** (const {nil? cbase} <name>). */
const rbZlpConst = (src: RbSource, n: i32, names: string): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const sc = src.a.kid(n, 0);
  return (sc === V_NIL || ssxIs(src, sc, NT_CBASE)) && names.indexOf(` ${src.a.text(src.a.kid(n, 1))} `) >= 0;
};

/** non_polymorphic_collection?. */
const rbZlpNonPolymorphic = (src: RbSource, p: i32): boolean => {
  const a = src.a;
  if (!ssxIs(src, p, NT_SEND)) {
    return false;
  }
  const r1 = a.kid(p, 0);
  if (!ssxIs(src, r1, NT_SEND)) {
    return false;
  }
  const r2 = a.kid(r1, 0);
  if (!ssxIs(src, r2, NT_SEND)) {
    return false;
  }
  const c = a.kid(r2, 0);
  const m = ssxMeth(src, r2);
  if (m === "stat" && a.nKid(r2) === 3 && rbZlpConst(src, c, " File ")) {
    return true;
  }
  if ((m === "new" || m === "open") && rbZlpConst(src, c, " File Tempfile StringIO ")) {
    return true;
  }
  if (m === "new" && ssxIs(src, c, NT_CONST) && a.text(a.kid(c, 1)) === "Stat" && rbZlpConst(src, a.kid(c, 0), " File ")) {
    return true;
  }
  return false;
};

export class CopStyleZeroLengthPredicate {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ZeroLengthPredicate");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n)) {
        continue;
      }
      const nm = ssxMeth(src, n);
      if (nm !== "size" && nm !== "length") {
        continue;
      }
      const p = src.parent(n);
      if (!ssxIsCall(src, p)) {
        continue;
      }
      const pm = ssxMeth(src, p);
      const recv = a.kid(p, 0);
      const arg = a.nKid(p) === 3 ? a.kid(p, 2) : V_NIL;
      // check_zero_length_predicate
      if (pm === "zero?" && a.nKid(p) === 2 && rbZlpLength(src, recv) && !rbZlpNonPolymorphic(src, p)) {
        this.c.offense(ssxFS(src, n, F_SELECTOR), a.exE(p));
      }
      if (a.nKid(p) !== 3) {
        continue;
      }
      // check_zero_length_comparison
      const zero =
        (pm === "==" && rbZlpLength(src, recv) && rbZlpInt(src, arg, 0)) ||
        (pm === "==" && rbZlpInt(src, recv, 0) && rbZlpLength(src, arg)) ||
        (pm === "<" && rbZlpLength(src, recv) && rbZlpInt(src, arg, 1)) ||
        (pm === ">" && rbZlpInt(src, recv, 1) && rbZlpLength(src, arg));
      if (zero && !rbZlpNonPolymorphic(src, p)) {
        this.c.offense(a.exS(p), a.exE(p));
      }
      // check_nonzero_length_comparison (on_send only)
      if (!ssxIs(src, n, NT_SEND)) {
        continue;
      }
      const nonzero =
        ((pm === ">" || pm === "!=") && rbZlpLength(src, recv) && rbZlpInt(src, arg, 0)) ||
        ((pm === "<" || pm === "!=") && rbZlpInt(src, recv, 0) && rbZlpLength(src, arg));
      if (nonzero && !rbZlpNonPolymorphic(src, p)) {
        this.c.offense(a.exS(p), a.exE(p));
      }
    }
  }
}
