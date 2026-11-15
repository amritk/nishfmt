// Lint/DisjunctiveAssignmentInConstructor. The cop is unsafe, so its
// correction never runs under `rubocop -a`: it only detects.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, NT_BEGIN, NT_DEF, NT_IVASGN, NT_OR_ASGN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs } from "./style_syntax_help";

export class CopLintDisjunctiveAssignmentInConstructor {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DisjunctiveAssignmentInConstructor");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_DEF || a.text(a.kid(n, 0)) !== "initialize") {
        continue;
      }
      const body = a.kid(n, 2);
      if (body === V_NIL) {
        continue;
      }
      const lines: i32[] = [];
      if (ssxIs(src, body, NT_BEGIN)) {
        for (let i = 0; i < a.nKid(body); i++) {
          if (a.isNode(a.kid(body, i))) {
            lines.push(a.kid(body, i));
          }
        }
      } else {
        lines.push(body);
      }
      for (const l of lines) {
        if (a.type(l) !== NT_OR_ASGN) {
          break;
        }
        if (ssxIs(src, a.kid(l, 0), NT_IVASGN)) {
          this.c.offense(ssxFS(src, l, F_OPERATOR), ssxFE(src, l, F_OPERATOR));
        }
      }
    }
  }
}
