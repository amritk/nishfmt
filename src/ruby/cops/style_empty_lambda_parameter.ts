// Style/EmptyLambdaParameter.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARGS, NT_BLOCK, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

export class CopStyleEmptyLambdaParameter {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EmptyLambdaParameter");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_BLOCK) {
        continue;
      }
      const send = a.kid(n, 0);
      // lambda_literal?
      if (!ssxIs(src, send, NT_SEND) || src.nodeSrc(send) !== "->") {
        continue;
      }
      const args = a.kid(n, 1);
      if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 0 || a.exS(args) < 0) {
        continue;
      }
      const k = this.c.offense(a.exS(args), a.exE(args));
      if (k !== null) {
        k.remove(a.exE(send), a.exE(args));
        this.c.commit(k);
      }
    }
  }
}
