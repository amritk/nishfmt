// Style/RedundantReturn (AllowMultipleReturnValues: false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_KEYWORD,
  F_QUESTION,
  NT_BEGIN,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_HASH,
  NT_IF,
  NT_KWBEGIN,
  NT_RESBODY,
  NT_RESCUE,
  NT_RESTARG,
  NT_RETURN,
  NT_SEND,
  NT_SPLAT,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxBlockLiteral, ssxFE, ssxFS, ssxHas, ssxLocIs } from "./style_syntax_help";

/** Style/RedundantReturn. */
export class CopStyleRedundantReturn {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantReturn");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND) {
        const m = sbhMethodName(src, n);
        if ((m === "define_method" || m === "define_singleton_method" || m === "lambda") && ssxBlockLiteral(src, n)) {
          this.check(src, a.kid(src.parent(n), 2));
        }
      } else if (t === NT_DEF) {
        this.check(src, a.kid(n, 2));
      } else if (t === NT_DEFS) {
        this.check(src, a.kid(n, 3));
      }
    }
  }

  /** check_branch. */
  private check(src: RbSource, n: i32): void {
    const a = src.a;
    if (n === V_NIL || !a.isNode(n)) {
      return;
    }
    const t = a.type(n);
    const k = a.nKid(n);
    switch (t) {
      case NT_RETURN:
        this.checkReturn(src, n);
        break;
      case NT_CASE:
      case NT_CASE_MATCH:
        for (let i = 1; i < k - 1; i++) {
          this.check(src, a.kid(a.kid(n, i), -1));
        }
        this.check(src, a.kid(n, k - 1));
        break;
      case NT_IF: {
        if (ssxHas(src, n, F_QUESTION)) {
          break;
        }
        const unless = ssxLocIs(src, n, F_KEYWORD, "unless");
        this.check(src, unless ? a.kid(n, 2) : a.kid(n, 1));
        this.check(src, unless ? a.kid(n, 1) : a.kid(n, 2));
        break;
      }
      case NT_RESCUE:
        for (let i = 1; i < k - 1; i++) {
          this.check(src, a.kid(a.kid(n, i), 2));
        }
        if (ssxHas(src, n, F_ELSE)) {
          this.check(src, a.kid(n, k - 1));
        } else {
          this.check(src, a.kid(n, 0));
        }
        break;
      case NT_RESBODY:
        this.check(src, a.kid(n, 2));
        break;
      case NT_ENSURE:
        this.check(src, a.kid(n, 0));
        break;
      case NT_BEGIN:
      case NT_KWBEGIN:
        if (k > 0) {
          this.check(src, a.kid(n, k - 1));
        }
        break;
      default:
        break;
    }
  }

  private checkReturn(src: RbSource, n: i32): void {
    const a = src.a;
    const ks = ssxFS(src, n, F_KEYWORD);
    const ke = ssxFE(src, n, F_KEYWORD);
    const k = this.c.offense(ks, ke);
    if (k === null) {
      return;
    }
    // ReturnNode#arguments (WrappedArguments)
    const args: i32[] = [];
    const first = a.nKid(n) > 0 ? a.kid(n, 0) : V_NIL;
    if (first !== V_NIL && a.isNode(first) && a.type(first) === NT_BEGIN) {
      for (let i = 0; i < a.nKid(first); i++) {
        args.push(a.kid(first, i));
      }
    } else {
      for (let i = 0; i < a.nKid(n); i++) {
        args.push(a.kid(n, i));
      }
    }
    if (args.length === 0) {
      k.replace(a.exS(n), a.exE(n), "nil");
      this.c.commit(k);
      return;
    }
    if (a.nKid(n) > 1) {
      k.insertBefore(a.exS(a.kid(n, 0)), a.exE(a.kid(n, 0)), "[");
      k.insertAfter(a.exS(a.kid(n, -1)), a.exE(a.kid(n, -1)), "]");
    } else {
      const fa = args[0];
      if (a.isNode(fa) && a.type(fa) === NT_HASH && !ssxHas(src, fa, F_BEGIN) && a.nKid(fa) > 0) {
        k.insertBefore(a.exS(a.kid(fa, 0)), a.exE(a.kid(fa, 0)), "{");
        k.insertAfter(a.exS(a.kid(fa, -1)), a.exE(a.kid(fa, -1)), "}");
      }
    }
    let splat = false;
    for (const x of args) {
      if (a.isNode(x) && (a.type(x) === NT_SPLAT || a.type(x) === NT_RESTARG)) {
        splat = true;
      }
    }
    if (splat) {
      const fa = args[0];
      const s = src.nodeSrc(fa);
      k.replace(a.exS(fa), a.exE(fa), s.startsWith("*") ? s.substring(1, toI32(s.length)) : s);
    }
    k.remove(ks, rbSpaceEnd(src, ke, 2, true, false, false));
    this.c.commit(k);
  }
}
