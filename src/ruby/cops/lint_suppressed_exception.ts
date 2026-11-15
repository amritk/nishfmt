// Lint/SuppressedException (AllowComments: true, AllowNil: true; no
// correction): a rescue clause with an empty body and no comment line between
// it and its enclosing begin/def/block's end.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_BLOCK, NT_DEF, NT_DEFS, NT_KWBEGIN, NT_NUMBLOCK, NT_RESBODY, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxCommentLine, ssxFS, ssxHas, ssxLineAt } from "./style_syntax_help";

export class CopLintSuppressedException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SuppressedException");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESBODY) {
        continue;
      }
      const body = a.kid(n, 2);
      // a nil body is allowed (AllowNil); a real body is no offense
      if (body !== V_NIL) {
        continue;
      }
      if (this.commentToEnd(src, n)) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }

  /** comment_between_rescue_and_end?. */
  private commentToEnd(src: RbSource, n: i32): boolean {
    const a = src.a;
    let anc = src.parent(n);
    while (anc !== V_NIL) {
      const t = a.type(anc);
      if (t === NT_KWBEGIN || t === NT_DEF || t === NT_DEFS || t === NT_BLOCK || t === NT_NUMBLOCK) {
        break;
      }
      anc = src.parent(anc);
    }
    if (anc === V_NIL) {
      return false;
    }
    const endLine = ssxHas(src, anc, F_END) ? src.line(ssxFS(src, anc, F_END)) : src.line(a.exE(anc));
    // processed_source[node.first_line...end_line]
    for (let i = src.line(a.exS(n)); i < endLine; i++) {
      if (ssxCommentLine(ssxLineAt(src, i))) {
        return true;
      }
    }
    return false;
  }
}

