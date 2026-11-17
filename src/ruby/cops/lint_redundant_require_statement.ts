// Lint/RedundantRequireStatement (TargetRubyVersion 3.3).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_KEYWORD, NT_IF, NT_STR, NT_UNTIL, NT_UNTIL_POST, NT_WHILE, NT_WHILE_POST, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { ssxCommand, ssxHas, ssxInList, ssxIs, ssxLocIs, ssxWholeLinesE, ssxWholeLinesS } from "./style_syntax_help";

/** redundant_feature? for Ruby 3.3. */
const lrrsRedundant = (f: string): boolean =>
  ssxInList(" enumerator thread rational complex ruby2_keywords fiber set ", f);

/** ModifierNode#modifier_form? of a parent that has it (if/while/until), false for others. */
export const lrrsModifierForm = (src: RbSource, p: i32): boolean => {
  if (p === V_NIL) {
    return false;
  }
  const t = src.a.type(p);
  if (t === NT_IF) {
    return (ssxLocIs(src, p, F_KEYWORD, "if") || ssxLocIs(src, p, F_KEYWORD, "unless")) && !ssxHas(src, p, F_END);
  }
  if (t === NT_WHILE || t === NT_WHILE_POST || t === NT_UNTIL || t === NT_UNTIL_POST) {
    return !ssxHas(src, p, F_END);
  }
  return false;
};

export class CopLintRedundantRequireStatement {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantRequireStatement");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxCommand(src, n, "require") || a.nKid(n) !== 3) {
        continue;
      }
      const s = a.kid(n, 2);
      if (!ssxIs(src, s, NT_STR) || !lrrsRedundant(a.text(a.kid(s, 0)))) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const p = src.parent(n);
      if (lrrsModifierForm(src, p)) {
        k.insertAfter(a.exS(p), a.exE(p), "\nend");
        k.remove(a.exS(n), rbSpaceEnd(src, a.exE(n), 2, true, false, false));
      } else {
        k.remove(ssxWholeLinesS(src, a.exS(n)), ssxWholeLinesE(src, a.exE(n), true));
      }
      this.c.commit(k);
    }
  }
}
