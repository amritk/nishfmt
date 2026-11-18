// Style/NegatedIf (EnforcedStyle: both), and the NegativeConditional mixin
// with ConditionCorrector that Style/NegatedUnless and Style/NegatedWhile
// share.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_BEGIN, NT_IF, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnElse, scnElsif, scnInverseKeyword, scnTernary, scnUnless } from "./style_cond_help";
import { ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** `(send !(send _ :!) :!)`. */
const sngSingleNegative = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "!") {
    return false;
  }
  const r = src.a.kid(n, 0);
  return !(ssxIs(src, r, NT_SEND) && ssxMeth(src, r) === "!");
};

/** NegativeConditional#check_negative_conditional with ConditionCorrector.correct_negative_condition. */
export const sngCheckNegative = (cop: RbCop, src: RbSource, n: i32): void => {
  const a = src.a;
  let cond = a.kid(n, 0);
  if (ssxIs(src, cond, NT_BEGIN) && a.nKid(cond) === 0) {
    return;
  }
  while (ssxIs(src, cond, NT_BEGIN)) {
    cond = a.kid(cond, -1);
  }
  if (!sngSingleNegative(src, cond)) {
    return;
  }
  if (a.type(n) === NT_IF && scnElse(src, n)) {
    return;
  }
  const k = cop.offense(a.exS(n), a.exE(n));
  if (k === null) {
    return;
  }
  const r = a.kid(cond, 0);
  k.replace(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD), scnInverseKeyword(src, n));
  k.replace(a.exS(cond), a.exE(cond), r === V_NIL ? "" : src.nodeSrc(r));
  cop.commit(k);
};

export class CopStyleNegatedIf {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NegatedIf");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (src.a.type(n) !== NT_IF || scnUnless(src, n) || scnElsif(src, n) || scnTernary(src, n)) {
        continue;
      }
      sngCheckNegative(this.c, src, n);
    }
  }
}
