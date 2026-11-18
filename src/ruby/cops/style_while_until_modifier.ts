// Style/WhileUntilModifier (Layout/LineLength: Max 120).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_UNTIL, NT_WHILE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  scnKwbeginOrConditional,
  scnModifierFits,
  scnNonEligibleBodyBase,
  scnNonEligibleCondition,
  scnNonEligibleNodeBase,
  scnToModifierForm,
} from "./style_cond_help";
import { ssxFE, ssxFS } from "./style_syntax_help";

const SWUM_COP: string = "Style/WhileUntilModifier";

export class CopStyleWhileUntilModifier {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/WhileUntilModifier");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_WHILE && t !== NT_UNTIL) {
        continue;
      }
      const body = a.kid(n, 1);
      if (scnNonEligibleNodeBase(src, n, SWUM_COP)) {
        continue;
      }
      if ((body !== V_NIL && scnKwbeginOrConditional(src, body)) || scnNonEligibleBodyBase(src, body)) {
        continue;
      }
      if (scnNonEligibleCondition(src, a.kid(n, 0)) || !scnModifierFits(src, n, SWUM_COP)) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), scnToModifierForm(src, n, SWUM_COP));
        this.c.commit(k);
      }
    }
  }
}
