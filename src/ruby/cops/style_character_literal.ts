// Style/CharacterLiteral.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_REGEXP, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { rnFieldSrc, rnHas, rnHasAncestor } from "../node";
import { RbSource } from "../source";

export class CopStyleCharacterLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CharacterLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      // StringHelp#on_str: a str with loc.begin, not in a regexp (ignored nodes).
      if (a.type(n) !== NT_STR || !rnHas(src, n, F_BEGIN) || rnHasAncestor(src, n, NT_REGEXP)) {
        continue;
      }
      const s = a.exS(n);
      const e = a.exE(n);
      // offense?: a character literal of 2 or 3 characters.
      if (rnFieldSrc(src, n, F_BEGIN) !== "?") {
        continue;
      }
      const size = e - s;
      if (size < 2 || size > 3) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      const string = src.src(s + 1, e);
      if (size - 1 === 2 || string === "'") {
        k.replace(s, e, `"${string}"`);
      } else if (size - 1 === 1) {
        k.replace(s, e, `'${string}'`);
      }
      this.c.commit(k);
    }
  }
}
