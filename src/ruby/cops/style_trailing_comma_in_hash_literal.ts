// Style/TrailingCommaInHashLiteral (EnforcedStyleForMultiline: no_comma).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_HASH } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFS, ssxHas, ssxTrailingCommaCheck } from "./style_syntax_help";

export class CopStyleTrailingCommaInHashLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingCommaInHashLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_HASH || a.nKid(n) === 0 || !ssxHas(src, n, F_END)) {
        continue;
      }
      const items: i32[] = [];
      for (let i = 0; i < a.nKid(n); i++) {
        items.push(a.kid(n, i));
      }
      ssxTrailingCommaCheck(this.c, src, items, a.exE(a.kid(n, -1)), ssxFS(src, n, F_END));
    }
  }
}
