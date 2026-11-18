// Lint/UriEscapeUnescape (no correction): the obsolete `URI.escape`,
// `URI.encode`, `URI.unescape` and `URI.decode`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst, ssxMeth } from "./style_syntax_help";

export class CopLintUriEscapeUnescape {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UriEscapeUnescape");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (
        (m === "escape" || m === "encode" || m === "unescape" || m === "decode") &&
        ssxGlobalConst(src, a.kid(n, 0), "URI")
      ) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
