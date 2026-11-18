// Style/NumericLiteralPrefix (EnforcedOctalStyle: zero_with_o).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_INT } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbNlIntegerPart } from "./style_numeric_literals";

/** Whether every character of `s` from `from` is in `chars` (and there is at least one). */
const rbNlpAllIn = (s: string, from: i32, chars: string): boolean => {
  const n = toI32(s.length);
  if (from >= n) {
    return false;
  }
  for (let i = from; i < n; i++) {
    if (chars.indexOf(s.substring(i, i + 1)) < 0) {
      return false;
    }
  }
  return true;
};

export class CopStyleNumericLiteralPrefix {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NumericLiteralPrefix");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_INT) {
        continue;
      }
      const lit = rbNlIntegerPart(src.nodeSrc(n));
      let from = "";
      let to = "";
      if (lit.startsWith("0O") && rbNlpAllIn(lit, 2, "01234567")) {
        // OCTAL_REGEX /^0O?[0-7]+$/
        from = "0O";
        to = "0o";
      } else if (lit.startsWith("0") && rbNlpAllIn(lit, 1, "01234567")) {
        from = "0";
        to = "0o";
      } else if (lit.startsWith("0X") && rbNlpAllIn(lit, 2, "0123456789ABCDEF")) {
        from = "0X";
        to = "0x";
      } else if (lit.startsWith("0B") && rbNlpAllIn(lit, 2, "01")) {
        from = "0B";
        to = "0b";
      } else if ((lit.startsWith("0d") || lit.startsWith("0D")) && rbNlpAllIn(lit, 2, "0123456789")) {
        from = lit.substring(0, 2);
        to = "";
      } else {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // unsigned_range
      let s = a.exS(n);
      const c0 = src.at(s);
      if (c0 === 43 || c0 === 45) {
        s++;
      }
      const text = src.src(s, a.exE(n));
      k.replace(s, a.exE(n), to + text.substring(toI32(from.length), toI32(text.length)));
      this.c.commit(k);
    }
  }
}
