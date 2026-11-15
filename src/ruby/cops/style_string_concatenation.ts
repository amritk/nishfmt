// Style/StringConcatenation (Mode: aggressive; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxIsSpace, ssxMeth, ssxMultiline } from "./style_syntax_help";

/** plus_node?. */
const rbScPlus = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "+";

/** /\+\s*\n/ on a node's source. */
const rbScPlusNewline = (s: string): boolean => {
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    if (s.charCodeAt(i) !== 43) {
      continue;
    }
    let j = i + 1;
    while (j < k && ssxIsSpace(s.charCodeAt(j))) {
      if (s.charCodeAt(j) === 10) {
        return true;
      }
      j++;
    }
  }
  return false;
};

export class CopStyleStringConcatenation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StringConcatenation");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!rbScPlus(src, n) || a.nKid(n) !== 3) {
        continue;
      }
      const recvStr = ssxIs(src, a.kid(n, 0), NT_STR);
      const argStr = ssxIs(src, a.kid(n, 2), NT_STR);
      if (!recvStr && !argStr) {
        continue;
      }
      // line_end_concatenation?
      if (recvStr && argStr && ssxMultiline(src, n) && rbScPlusNewline(src.nodeSrc(n))) {
        continue;
      }
      let top = n;
      while (rbScPlus(src, src.parent(top))) {
        top = src.parent(top);
      }
      this.c.offense(a.exS(top), a.exE(top));
    }
  }
}
