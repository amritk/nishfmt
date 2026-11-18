// Lint/UriRegexp (TargetRubyVersion 3.3: DEFAULT_PARSER).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintUriRegexp {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UriRegexp");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "regexp" || !ssxGlobalConst(src, a.kid(n, 0), "URI")) {
        continue;
      }
      const arg = a.nKid(n) > 2 ? `(${src.nodeSrc(a.kid(n, 2))})` : "";
      const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), `${src.nodeSrc(a.kid(n, 0))}::DEFAULT_PARSER.make_regexp${arg}`);
        this.c.commit(k);
      }
    }
  }
}
