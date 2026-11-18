// Lint/NonLocalExitFromIterator (no correction): a bare `return` in a block
// with arguments passed to a method call that has a receiver.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_ARGS, NT_NUMBLOCK, NT_RETURN, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAnyDef, ldhType } from "./lint_detect_help";
import { ssxFE, ssxFS, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** BlockNode#argument_list is empty. */
const lnleNoArguments = (src: RbSource, b: i32): boolean => {
  const a = src.a;
  if (a.type(b) === NT_NUMBLOCK) {
    // numbered_arguments: 1..max_param
    return a.text(a.kid(b, 1)) === "0";
  }
  const args = a.kid(b, 1);
  return ldhType(src, args) !== NT_ARGS || a.nKid(args) === 0;
};

export class CopLintNonLocalExitFromIterator {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/NonLocalExitFromIterator");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RETURN || a.nKid(n) > 0) {
        continue;
      }
      let p = src.parent(n);
      while (p !== V_NIL) {
        if (ldhAnyDef(src, p)) {
          break;
        }
        if (ssxIsAnyBlock(src, p)) {
          const s = a.kid(p, 0);
          // scoped_node? (lambda?) and define_method?
          if (ssxMeth(src, s) === "lambda") {
            break;
          }
          const m = ssxMeth(src, s);
          if (
            ldhType(src, s) === NT_SEND &&
            (m === "define_method" || m === "define_singleton_method") &&
            a.nKid(s) === 3
          ) {
            break;
          }
          if (!lnleNoArguments(src, p) && ssxIsCall(src, s) && a.kid(s, 0) !== V_NIL) {
            this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
            break;
          }
        }
        p = src.parent(p);
      }
    }
  }
}
