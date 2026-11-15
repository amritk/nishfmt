// Lint/DuplicateHashKey (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CONST, NT_HASH, NT_PAIR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhRecursiveBasicLiteral } from "./lint_batch_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxIs } from "./style_syntax_help";

export class CopLintDuplicateHashKey {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DuplicateHashKey");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_HASH) {
        continue;
      }
      const keys: i32[] = [];
      for (let i = 0; i < a.nKid(n); i++) {
        const p = a.kid(n, i);
        if (!ssxIs(src, p, NT_PAIR)) {
          continue;
        }
        const k = a.kid(p, 0);
        if (lbhRecursiveBasicLiteral(src, k) || ssxIs(src, k, NT_CONST)) {
          keys.push(k);
        }
      }
      // consecutive_duplicates: every key equal to an earlier one.
      for (let i = 1; i < toI32(keys.length); i++) {
        for (let j = 0; j < i; j++) {
          if (ssxAstEqual(a, keys[j], a, keys[i])) {
            this.c.offense(a.exS(keys[i]), a.exE(keys[i]));
            break;
          }
        }
      }
    }
  }
}
