// Style/RedundantConditional.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import { NT_FALSE, NT_IF, NT_SEND, NT_TRUE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnElsif, scnModifier, scnSpaces } from "./style_cond_help";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** Node::COMPARISON_OPERATORS. */
export const srcComparison = (m: string): boolean =>
  m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<";

export class CopStyleRedundantConditional {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantConditional");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || scnModifier(src, n)) {
        continue;
      }
      const cond = a.kid(n, 0);
      if (!ssxIs(src, cond, NT_SEND) || a.nKid(cond) !== 3 || !srcComparison(ssxMeth(src, cond))) {
        continue;
      }
      const t1 = a.kid(n, 1);
      const t2 = a.kid(n, 2);
      const plain = ssxIs(src, t1, NT_TRUE) && ssxIs(src, t2, NT_FALSE);
      const inverted = ssxIs(src, t1, NT_FALSE) && ssxIs(src, t2, NT_TRUE);
      if (!plain && !inverted) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const cs = src.nodeSrc(cond);
      const expr = inverted ? `!(${cs})` : cs;
      const repl = scnElsif(src, n) ? `else\n${scnSpaces(add32(src.column(a.exS(n)), 2))}${expr}` : expr;
      k.replace(a.exS(n), a.exE(n), repl);
      this.c.commit(k);
    }
  }
}
