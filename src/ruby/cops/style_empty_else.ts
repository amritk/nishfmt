// Style/EmptyElse (EnforcedStyle: both, AllowComments: false; Style/MissingElse disabled).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_ELSE, F_END, NT_CASE, NT_IF, NT_NIL, NT_WHEN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnCommentInLines, scnElse, scnElseBranch, scnElsif, scnModifier, scnTernary } from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

export class CopStyleEmptyElse {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EmptyElse");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF) {
        if (scnModifier(src, n) || scnTernary(src, n)) {
          continue;
        }
      } else if (t !== NT_CASE) {
        continue;
      }
      const eb = t === NT_CASE ? a.kid(n, -1) : scnElseBranch(src, n);
      // empty_check, then nil_check
      if (scnElse(src, n) && eb === V_NIL) {
        this.offense(src, n);
      }
      if (ssxIs(src, eb, NT_NIL)) {
        this.offense(src, n);
      }
    }
  }

  private offense(src: RbSource, n: i32): void {
    const es = ssxFS(src, n, F_ELSE);
    const k = this.c.offense(es, ssxFE(src, n, F_ELSE));
    if (k === null) {
      return;
    }
    if (this.commentInElse(src, n)) {
      return;
    }
    const b = this.baseNode(src, n);
    k.remove(es, ssxFS(src, b, F_END));
    this.c.commit(k);
  }

  /** comment_in_else? */
  private commentInElse(src: RbSource, n0: i32): boolean {
    let n = n0;
    while (src.a.type(n) === NT_IF && scnElsif(src, n)) {
      n = src.parent(n);
    }
    if (!scnElse(src, n)) {
      return false;
    }
    return scnCommentInLines(src, src.line(ssxFS(src, n, F_ELSE)), src.line(src.a.exE(n)));
  }

  /** base_node */
  private baseNode(src: RbSource, n: i32): i32 {
    if (src.a.type(n) === NT_CASE || !scnElsif(src, n)) {
      return n;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = src.a.type(p);
      if ((t === NT_IF || t === NT_CASE || t === NT_WHEN) && ssxHas(src, p, F_END)) {
        return p;
      }
      p = src.parent(p);
    }
    return n;
  }
}
