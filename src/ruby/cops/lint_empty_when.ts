// Lint/EmptyWhen (AllowComments: true; no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CASE, NT_WHEN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhCommentsContainDisables } from "./lint_batch_help";
import { srdContainsComments } from "./style_redundant_condition";
import { ssxIs } from "./style_syntax_help";

export class CopLintEmptyWhen {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyWhen");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_CASE) {
        continue;
      }
      for (let i = 1; i < a.nKid(n); i++) {
        const w = a.kid(n, i);
        if (!ssxIs(src, w, NT_WHEN) || a.kid(w, -1) !== V_NIL) {
          continue;
        }
        if (srdContainsComments(src, w) && !lbhCommentsContainDisables(src, w, this.c.name)) {
          continue;
        }
        this.c.offense(a.exS(w), a.exE(w));
      }
    }
  }
}
