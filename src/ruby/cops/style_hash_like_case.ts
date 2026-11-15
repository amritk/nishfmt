// Style/HashLikeCase (MinBranchesCount: 3; detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_CASE,
  NT_COMPLEX,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_IRANGE,
  NT_NIL,
  NT_OR,
  NT_PAIR,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_WHEN,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** Node#basic_literal?. */
const rbHlcBasicLiteral = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_TRUE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT ||
  t === NT_FALSE ||
  t === NT_NIL;

/** Node#recursive_basic_literal?. */
export const rbRecursiveBasicLiteral = (src: RbSource, n: i32): boolean => rbRecursiveLiteral(src, n, true);

/** Node#literal?. */
const rbHlcLiteral = (t: i32): boolean =>
  rbHlcBasicLiteral(t) ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_REGEXP;

/** Node#recursive_basic_literal? (basic) or Node#recursive_literal?. */
export const rbRecursiveLiteral = (src: RbSource, n: i32, basic: boolean): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_SEND) {
    const m = ssxMeth(src, n);
    const ok = m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<" || m === "*" || m === "!" || m === "<=>";
    if (!ok || !rbRecursiveLiteral(src, a.kid(n, 0), basic)) {
      return false;
    }
    for (let i = 2; i < a.nKid(n); i++) {
      if (!rbRecursiveLiteral(src, a.kid(n, i), basic)) {
        return false;
      }
    }
    return true;
  }
  if (
    t === NT_AND ||
    t === NT_OR ||
    t === NT_DSTR ||
    t === NT_XSTR ||
    t === NT_DSYM ||
    t === NT_ARRAY ||
    t === NT_HASH ||
    t === NT_IRANGE ||
    t === NT_ERANGE ||
    t === NT_REGEXP ||
    t === NT_BEGIN ||
    t === NT_PAIR
  ) {
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (k !== V_NIL && !rbRecursiveLiteral(src, k, basic)) {
        return false;
      }
    }
    return true;
  }
  return basic ? rbHlcBasicLiteral(t) : rbHlcLiteral(t);
};

export class CopStyleHashLikeCase {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/HashLikeCase");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_CASE)) {
        continue;
      }
      const k = a.nKid(n);
      // (case _ (when ...)+ nil?), at least 3 whens
      if (k - 2 < 3 || a.kid(n, k - 1) !== V_NIL) {
        continue;
      }
      let ok = true;
      let ct = -1;
      let bt = -1;
      for (let i = 1; i < k - 1 && ok; i++) {
        const w = a.kid(n, i);
        if (!ssxIs(src, w, NT_WHEN) || a.nKid(w) !== 2) {
          ok = false;
          break;
        }
        const cond = a.kid(w, 0);
        const body = a.kid(w, 1);
        if (!(ssxIs(src, cond, NT_STR) || ssxIs(src, cond, NT_SYM)) || body === V_NIL || !rbRecursiveBasicLiteral(src, body)) {
          ok = false;
          break;
        }
        if (ct < 0) {
          ct = a.type(cond);
          bt = a.type(body);
        } else if (a.type(cond) !== ct || a.type(body) !== bt) {
          ok = false;
        }
      }
      if (ok) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
