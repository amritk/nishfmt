// Style/SymbolProc (AllowedMethods: define_method, AllowMethodsWithArguments
// and AllowComments: false; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_SELECTOR,
  NT_ARG,
  NT_ARGS,
  NT_ARRAY,
  NT_ARRAY_PATTERN,
  NT_ARRAY_PATTERN_WITH_TAIL,
  NT_BEGIN,
  NT_BLOCK,
  NT_CONST_PATTERN,
  NT_FIND_PATTERN,
  NT_HASH,
  NT_HASH_PATTERN,
  NT_IN_PATTERN,
  NT_LVAR,
  NT_MATCH_ALT,
  NT_MATCH_AS,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_NUMBLOCK,
  NT_PAIR,
  NT_SEND,
  NT_SUPER,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxIs, ssxIsCall, ssxLocIs, ssxMeth } from "./style_syntax_help";

/** PatternMatchingHelp#in_pattern?. */
const rbSpInPattern = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  let child = n;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_IN_PATTERN) {
      return a.kid(p, 0) === child;
    }
    if (t === NT_MATCH_PATTERN || t === NT_MATCH_PATTERN_P) {
      return a.kid(p, 1) === child;
    }
    const pat =
      t === NT_ARRAY_PATTERN ||
      t === NT_ARRAY_PATTERN_WITH_TAIL ||
      t === NT_BEGIN ||
      t === NT_CONST_PATTERN ||
      t === NT_FIND_PATTERN ||
      t === NT_HASH_PATTERN ||
      t === NT_MATCH_ALT ||
      t === NT_MATCH_AS ||
      t === NT_PAIR;
    if (!pat) {
      return false;
    }
    child = p;
    p = src.parent(p);
  }
  return false;
};

/** The dispatch node's method name (`super` for super and zsuper). */
const rbSpMethodName = (src: RbSource, n: i32): string => (ssxIsCall(src, n) ? ssxMeth(src, n) : "super");

export class CopStyleSymbolProc {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SymbolProc");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const blk = ssxIs(src, n, NT_BLOCK);
      if (!blk && !ssxIs(src, n, NT_NUMBLOCK)) {
        continue;
      }
      // symbol_proc?
      const d = a.kid(n, 0);
      if (!ssxIsCall(src, d) && !ssxIs(src, d, NT_SUPER) && !ssxIs(src, d, NT_ZSUPER)) {
        continue;
      }
      const body = a.kid(n, 2);
      if (!ssxIs(src, body, NT_SEND) || a.nKid(body) !== 2 || !ssxIs(src, a.kid(body, 0), NT_LVAR)) {
        continue;
      }
      const lv = a.text(a.kid(a.kid(body, 0), 0));
      const args = a.kid(n, 1);
      if (blk) {
        if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 1 || !ssxIs(src, a.kid(args, 0), NT_ARG) || a.text(a.kid(a.kid(args, 0), 0)) !== lv) {
          continue;
        }
      } else if (a.text(args) !== "1" || lv !== "_1") {
        continue;
      }
      if (rbSpInPattern(src, n)) {
        continue;
      }
      const m = rbSpMethodName(src, d);
      const r = ssxIsCall(src, d) ? a.kid(d, 0) : V_NIL;
      if (ssxIs(src, r, NT_HASH) && (m === "reject" || m === "select")) {
        continue;
      }
      if (ssxIs(src, r, NT_ARRAY) && (m === "min" || m === "max")) {
        continue;
      }
      if (m === "define_method") {
        continue;
      }
      // destructuring_block_argument?: `|a,|`
      if (blk && src.nodeSrc(args).indexOf(",", 0) >= 0) {
        continue;
      }
      // lambda_literal?: `->`
      if (ssxIs(src, d, NT_SEND) && ssxLocIs(src, d, F_SELECTOR, "->") && src.nodeSrc(d) === "->") {
        this.c.offense(a.exS(n), a.exE(n));
      } else {
        this.c.offense(ssxFS(src, n, F_BEGIN), ssxFE(src, n, F_END));
      }
    }
  }
}
