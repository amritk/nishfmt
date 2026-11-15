// Style/StringLiteralsInInterpolation (EnforcedStyle: single_quotes).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { rnHas } from "../node";
import { RbSource } from "../source";
import { rbDoubleQuotesRequired, rbToStringLiteral } from "../util";
import { rbInsideInterpolation } from "./style_strings";

export class CopStyleStringLiteralsInInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/StringLiteralsInInterpolation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      // StringHelp#on_str (this cop ignores no regexp).
      if (a.type(n) !== NT_STR || !rnHas(src, n, F_BEGIN)) {
        continue;
      }
      if (!rbInsideInterpolation(src, n)) {
        continue;
      }
      // wrong_quotes?
      const text = src.nodeSrc(n);
      if (text.startsWith("%") || text.startsWith("?") || rbDoubleQuotesRequired(text)) {
        continue;
      }
      const s = a.exS(n);
      const e = a.exE(n);
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.replace(s, e, rbToStringLiteral(a.text(a.kid(n, 0))));
        this.c.commit(k);
      }
    }
  }
}
