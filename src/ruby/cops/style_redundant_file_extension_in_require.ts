// Style/RedundantFileExtensionInRequire.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { sub32 } from "../../core/arr";
import { NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";

/** Style/RedundantFileExtensionInRequire. */
export class CopStyleRedundantFileExtensionInRequire {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantFileExtensionInRequire");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) !== 3) {
        continue;
      }
      const m = sbhMethodName(src, n);
      if (m !== "require" && m !== "require_relative") {
        continue;
      }
      const s = a.kid(n, 2);
      if (!a.isNode(s) || a.type(s) !== NT_STR || !a.text(a.kid(s, 0)).endsWith(".rb")) {
        continue;
      }
      const e = a.exE(s);
      const rs = sub32(e, 4);
      // escaped_extension?: a backslash right before the extension.
      if (toI64(rs) - toI64(1) >= toI64(a.exS(s)) && rbAtOff(src, rs, -1) === 92) {
        continue;
      }
      const k = this.c.offense(rs, sub32(e, 1));
      if (k !== null) {
        k.remove(rs, sub32(e, 1));
        this.c.commit(k);
      }
    }
  }
}
