// Style/ExponentialNotation (EnforcedStyle: scientific; detection only: no
// correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbByteAt } from "../util";
import { NT_FLOAT } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs } from "./style_syntax_help";

/** /^-?[1-9](\.\d*[0-9])?$/ on the mantissa (the text before the first `e`). */
const rbExpNotScientific = (s: string): boolean => {
  const k = toI32(s.length);
  let i = 0;
  if (i < k && s.charCodeAt(i) === 45) {
    i++;
  }
  if (i >= k || s.charCodeAt(i) < 49 || s.charCodeAt(i) > 57) {
    return false;
  }
  i++;
  if (i === k) {
    return true;
  }
  if (rbByteAt(s, i) !== 46 || i >= k - 1) {
    return false;
  }
  for (let j = i + 1; j < k; j++) {
    const c = s.charCodeAt(j);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
};

export class CopStyleExponentialNotation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ExponentialNotation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_FLOAT)) {
        continue;
      }
      const text = src.nodeSrc(n);
      const e = text.indexOf("e", 0);
      if (e < 0) {
        continue;
      }
      if (!rbExpNotScientific(text.substring(0, e))) {
        this.c.offense(src.a.exS(n), src.a.exE(n));
      }
    }
  }
}
