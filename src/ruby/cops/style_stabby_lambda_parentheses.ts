// Style/StabbyLambdaParentheses (EnforcedStyle: require_parentheses).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_BLOCK, NT_NUMBLOCK, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxHas, ssxMeth } from "./style_syntax_help";

export class CopStyleStabbyLambdaParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StabbyLambdaParentheses");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "lambda" || src.nodeSrc(n) !== "->") {
        continue;
      }
      const b = src.parent(n);
      if (b === V_NIL || (a.type(b) !== NT_BLOCK && a.type(b) !== NT_NUMBLOCK) || a.kid(b, 0) !== n) {
        continue;
      }
      // block_node.arguments? (a numblock has none)
      if (a.type(b) !== NT_BLOCK) {
        continue;
      }
      const args = a.kid(b, 1);
      if (a.nKid(args) === 0 || ssxHas(src, args, F_BEGIN)) {
        continue;
      }
      const k = this.c.offense(a.exS(args), a.exE(args));
      if (k !== null) {
        k.wrap(a.exS(args), a.exE(args), "(", ")");
        this.c.commit(k);
      }
    }
  }
}
