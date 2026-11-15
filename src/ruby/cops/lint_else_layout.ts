// Lint/ElseLayout.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_ELSE, F_KEYWORD, F_QUESTION, NT_BEGIN, NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIs, ssxLocIs, ssxSingleLine } from "./style_syntax_help";

/** IfNode#unless?. */
const lelUnless = (src: RbSource, n: i32): boolean => !ssxHas(src, n, F_QUESTION) && ssxFE(src, n, F_KEYWORD) - ssxFS(src, n, F_KEYWORD) === 6;

/** IfNode#else_branch. */
const lelElseBranch = (src: RbSource, n: i32): i32 => (lelUnless(src, n) ? src.a.kid(n, 1) : src.a.kid(n, 2));

export class CopLintElseLayout {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ElseLayout");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_IF) || ssxHas(src, n, F_QUESTION)) {
        continue;
      }
      if (ssxLocIs(src, n, F_BEGIN, "then") && !ssxIs(src, lelElseBranch(src, n), NT_BEGIN)) {
        continue;
      }
      if (ssxSingleLine(src, n)) {
        continue;
      }
      this.check(src, n);
    }
  }

  private check(src: RbSource, n: i32): void {
    const eb = lelElseBranch(src, n);
    if (eb === V_NIL) {
      return;
    }
    if (ssxHas(src, n, F_ELSE) && ssxLocIs(src, n, F_ELSE, "else")) {
      this.checkElse(src, n, eb);
    } else if (ssxLocIs(src, n, F_KEYWORD, "if")) {
      this.check(src, eb);
    }
  }

  private checkElse(src: RbSource, n: i32, eb: i32): void {
    const a = src.a;
    const first = ssxIs(src, eb, NT_BEGIN) ? a.kid(eb, 0) : eb;
    if (first === V_NIL) {
      return;
    }
    const es = ssxFS(src, n, F_ELSE);
    const ee = ssxFE(src, n, F_ELSE);
    if (src.line(a.exS(first)) !== src.line(es)) {
      return;
    }
    const k = this.c.offense(a.exS(first), a.exE(first));
    if (k !== null) {
      k.insertAfter(es, ee, "\n");
      const ind: string[] = [];
      for (let i = 0; i < src.column(a.exS(n)) + 2; i++) {
        ind.push(" ");
      }
      k.replace(ee, a.exS(first), ind.join(""));
      this.c.commit(k);
    }
  }
}
