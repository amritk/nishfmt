// Style/AndOr (EnforcedStyle: conditionals; its correction is unsafe:
// detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, NT_AND, NT_IF, NT_OR, NT_UNTIL, NT_UNTIL_POST, NT_WHILE, NT_WHILE_POST } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDescendants, ssxFE, ssxFS, ssxLocIs } from "./style_syntax_help";

export class CopStyleAndOr {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/AndOr");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      if (t !== NT_IF && t !== NT_WHILE && t !== NT_WHILE_POST && t !== NT_UNTIL && t !== NT_UNTIL_POST) {
        continue;
      }
      const cond = a.kid(n, 0);
      if (!a.isNode(cond)) {
        continue;
      }
      const all: i32[] = [cond];
      for (const d of ssxDescendants(src, cond)) {
        all.push(d);
      }
      for (const op of all) {
        const ot = a.type(op);
        if (ot !== NT_AND && ot !== NT_OR) {
          continue;
        }
        // logical_operator?: `&&` / `||`.
        if (ssxLocIs(src, op, F_OPERATOR, "&&") || ssxLocIs(src, op, F_OPERATOR, "||")) {
          continue;
        }
        this.c.offense(ssxFS(src, op, F_OPERATOR), ssxFE(src, op, F_OPERATOR));
      }
    }
  }
}
