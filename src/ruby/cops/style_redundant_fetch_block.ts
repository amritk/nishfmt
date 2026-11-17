// Style/RedundantFetchBlock (SafeForConstants: false; unsafe: detection
// only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_SELECTOR,
  NT_ARGS,
  NT_BLOCK,
  NT_COMPLEX,
  NT_CONST,
  NT_FALSE,
  NT_FLOAT,
  NT_FORWARDED_RESTARG,
  NT_HASH,
  NT_INT,
  NT_NIL,
  NT_RATIONAL,
  NT_REGOPT,
  NT_SEND,
  NT_SPLAT,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitFrozenStringLiterals } from "./style_redundant_freeze";
import { ssxFE, ssxFS, ssxHas, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** Node#basic_literal?. */
export const rbNodeBasicLiteral = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (
    t === NT_STR ||
    t === NT_INT ||
    t === NT_FLOAT ||
    t === NT_SYM ||
    t === NT_TRUE ||
    t === NT_COMPLEX ||
    t === NT_RATIONAL ||
    t === NT_REGOPT ||
    t === NT_FALSE ||
    t === NT_NIL
  );
};

export class CopStyleRedundantFetchBlock {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantFetchBlock");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_BLOCK)) {
        continue;
      }
      const s = a.kid(n, 0);
      if (!ssxIsCall(src, s) || ssxMeth(src, s) !== "fetch" || a.nKid(s) !== 3) {
        continue;
      }
      const args = a.kid(n, 1);
      if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 0) {
        continue;
      }
      const body = a.kid(n, 2);
      if (body !== V_NIL && !rbNodeBasicLiteral(src, body) && !ssxIs(src, body, NT_CONST)) {
        continue;
      }
      // should_not_check?
      if (ssxIs(src, body, NT_CONST)) {
        continue;
      }
      if (ssxIs(src, body, NT_STR) && !rbLitFrozenStringLiterals(src)) {
        continue;
      }
      const r = a.kid(s, 0);
      if (ssxIs(src, r, NT_SEND) && a.nKid(r) === 2 && ssxMeth(src, r) === "cache") {
        const rr = a.kid(r, 0);
        if (ssxIs(src, rr, NT_CONST) && a.text(a.kid(rr, 1)) === "Rails") {
          continue;
        }
      }
      const arg = a.kid(s, 2);
      if (ssxIs(src, arg, NT_SPLAT) || ssxIs(src, arg, NT_FORWARDED_RESTARG) || (ssxIs(src, arg, NT_HASH) && !ssxHas(src, arg, F_BEGIN))) {
        continue;
      }
      this.c.offense(ssxFS(src, s, F_SELECTOR), ssxFE(src, n, F_END));
    }
  }
}
