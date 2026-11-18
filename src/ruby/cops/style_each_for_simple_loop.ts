// Style/EachForSimpleLoop.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARGS, NT_BEGIN, NT_BLOCK, NT_ERANGE, NT_INT, NT_IRANGE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxIntValue, ssxIsCall } from "./style_syntax_help";

const sbhEfIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** Style/EachForSimpleLoop. */
export class CopStyleEachForSimpleLoop {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EachForSimpleLoop");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_BLOCK) {
        continue;
      }
      // (block (call (begin (range (int _) (int _))) :each) (args) ...)
      const args = a.kid(n, 1);
      if (!sbhEfIs(src, args, NT_ARGS) || a.nKid(args) !== 0) {
        continue;
      }
      const send = a.kid(n, 0);
      if (!ssxIsCall(src, send) || a.nKid(send) !== 2 || sbhMethodName(src, send) !== "each") {
        continue;
      }
      const b = a.kid(send, 0);
      if (!sbhEfIs(src, b, NT_BEGIN) || a.nKid(b) !== 1) {
        continue;
      }
      const r = a.kid(b, 0);
      if (
        !(sbhEfIs(src, r, NT_IRANGE) || sbhEfIs(src, r, NT_ERANGE)) ||
        !sbhEfIs(src, a.kid(r, 0), NT_INT) ||
        !sbhEfIs(src, a.kid(r, 1), NT_INT)
      ) {
        continue;
      }
      const k = this.c.offense(a.exS(send), a.exE(send));
      if (k === null) {
        continue;
      }
      const min = ssxIntValue(src, a.kid(r, 0));
      let max = ssxIntValue(src, a.kid(r, 1));
      if (a.type(r) === NT_IRANGE) {
        max += 1;
      }
      k.replace(a.exS(send), a.exE(send), `${max - min}.times`);
      this.c.commit(k);
    }
  }
}
