// Metrics/MethodLength (detection only; CountComments: false, Max: 10,
// CountAsOne: [], AllowedMethods: [], AllowedPatterns: []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CSEND, NT_DEF, NT_DEFS, NT_NUMBLOCK, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";
import { mtxCheckCodeLength } from "./metrics_help";

/** BlockNode#method?(:define_method), whatever the receiver. */
const mmlDefineMethod = (src: RbSource, n: i32): boolean => {
  const s = src.a.kid(n, 0);
  if (!src.a.isNode(s)) {
    return false;
  }
  const t = src.a.type(s);
  return (t === NT_SEND || t === NT_CSEND) && src.a.text(src.a.kid(s, 1)) === "define_method";
};

export class CopMetricsMethodLength {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/MethodLength");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_DEF || t === NT_DEFS || ((t === NT_BLOCK || t === NT_NUMBLOCK) && mmlDefineMethod(src, n))) {
        mtxCheckCodeLength(this.c, src, L, n, 10);
      }
    }
  }
}
