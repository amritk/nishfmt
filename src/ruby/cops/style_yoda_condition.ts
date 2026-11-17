// Style/YodaCondition (EnforcedStyle: forbid_for_all_comparison_operators;
// unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CONST, NT_DSTR, NT_GVAR, NT_REGEXP, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbRecursiveLiteral } from "./style_hash_like_case";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** constant_portion?: recursive_literal? or a const. */
const rbYodaConstant = (src: RbSource, n: i32): boolean => rbRecursiveLiteral(src, n, false) || ssxIs(src, n, NT_CONST);

/** interpolation?: a dstr, or a regexp with an interpolation. */
const rbYodaInterpolation = (src: RbSource, n: i32): boolean => {
  if (ssxIs(src, n, NT_DSTR)) {
    return true;
  }
  if (!ssxIs(src, n, NT_REGEXP)) {
    return false;
  }
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (ssxIs(src, src.a.kid(n, i), NT_BEGIN)) {
      return true;
    }
  }
  return false;
};

export class CopStyleYodaCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/YodaCondition");
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
      if (m !== "==" && m !== "!=" && m !== "<=" && m !== ">=" && m !== ">" && m !== "<") {
        continue;
      }
      const lhs = a.kid(n, 0);
      const rhs = a.kid(n, 2);
      // file_constant_equal_program_name?
      if ((m === "==" || m === "!=") && lhs !== V_NIL && src.nodeSrc(lhs) === "__FILE__" && a.nKid(n) === 3 && ssxIs(src, rhs, NT_GVAR)) {
        const g = a.text(a.kid(rhs, 0));
        if (g === "$0" || g === "$PROGRAM_NAME") {
          continue;
        }
      }
      // valid_yoda? (a missing receiver raises: no offense)
      if (rhs === V_NIL || lhs === V_NIL) {
        continue;
      }
      if (!rbYodaConstant(src, lhs) || rbYodaConstant(src, rhs) || rbYodaInterpolation(src, lhs)) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
