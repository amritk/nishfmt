// Style/RedundantFreeze.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_DOT,
  F_SELECTOR,
  NT_BEGIN,
  NT_BLOCK,
  NT_COMPLEX,
  NT_CVAR,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_GVAR,
  NT_INT,
  NT_IRANGE,
  NT_IVAR,
  NT_NIL,
  NT_NUMBLOCK,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { rbLitLeadingCommentLines } from "./lit_help";
import { RbMagicComment } from "./lit_magic";

const rbRfIs = (src: RbSource, n: i32, t: i32): boolean => n !== V_NIL && src.a.isNode(n) && src.a.type(n) === t;

/** FrozenStringLiteral#frozen_string_literals_enabled? (StringLiteralsFrozenByDefault unset). */
export const rbLitFrozenStringLiterals = (src: RbSource): boolean => {
  for (const line of rbLitLeadingCommentLines(src)) {
    const m = new RbMagicComment(line);
    const v = m.frozenStringLiteral();
    if (v !== null) {
      return v === "true";
    }
  }
  return false;
};

/** Whether `n` has a descendant of one of the interpolating types (begin, ivar, cvar, gvar). */
const rbRfInterpolated = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (!a.isNode(c)) {
      continue;
    }
    const t = a.type(c);
    if (t === NT_BEGIN || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR || rbRfInterpolated(src, c)) {
      return true;
    }
  }
  return false;
};

/** numeric_operation? */
const rbRfNumericOp = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (rbRfIs(src, n, NT_FLOAT) || rbRfIs(src, n, NT_INT)) {
    return true;
  }
  if (rbRfIs(src, n, NT_BEGIN)) {
    return a.nKid(n) === 1 && rbRfNumericOp(src, a.kid(n, 0));
  }
  if (rbRfIs(src, n, NT_SEND) && a.nKid(n) === 3) {
    const m = a.text(a.kid(n, 1));
    if (m === "+" || m === "-" || m === "*" || m === "**" || m === "/" || m === "%") {
      return rbRfNumericOp(src, a.kid(n, 0)) && rbRfNumericOp(src, a.kid(n, 2));
    }
  }
  return false;
};

const rbRfCountLike = (src: RbSource, n: i32): boolean => {
  if (!rbRfIs(src, n, NT_SEND)) {
    return false;
  }
  const m = src.a.text(src.a.kid(n, 1));
  return m === "count" || m === "length" || m === "size";
};

/** operation_produces_immutable_object? */
const rbRfImmutableOp = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (rbRfIs(src, n, NT_BEGIN) && a.nKid(n) === 1) {
    const s = a.kid(n, 0);
    if (rbRfIs(src, s, NT_SEND) && a.nKid(s) === 3) {
      const m = a.text(a.kid(s, 1));
      const r = a.kid(s, 0);
      const arg = a.kid(s, 2);
      const numR = rbRfIs(src, r, NT_FLOAT) || rbRfIs(src, r, NT_INT);
      const numArg = rbRfIs(src, arg, NT_FLOAT) || rbRfIs(src, arg, NT_INT);
      const arith = m === "+" || m === "-" || m === "*" || m === "**" || m === "/" || m === "%";
      if (numR && (arith || m === "<<")) {
        return true;
      }
      if (arith && numArg && rbRfNumericOp(src, r)) {
        return true;
      }
      if (m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === "<" || m === ">") {
        return true;
      }
    }
  }
  if (rbRfCountLike(src, n)) {
    return true;
  }
  return (rbRfIs(src, n, NT_BLOCK) || rbRfIs(src, n, NT_NUMBLOCK)) && rbRfCountLike(src, a.kid(n, 0));
};

export class CopStyleRedundantFreeze {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantFreeze");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    let frozen = -1;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "freeze") {
        continue;
      }
      const r = a.kid(n, 0);
      if (r === V_NIL) {
        continue;
      }
      if (frozen < 0) {
        frozen = rbLitFrozenStringLiterals(src) ? 1 : 0;
      }
      if (!this.immutableLiteral(src, r, frozen === 1) && !rbRfImmutableOp(src, r)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        const s = rnHas(src, n, F_DOT) ? rnS(src, n, F_DOT) : rnS(src, n, F_SELECTOR);
        k.remove(s, rnE(src, n, F_SELECTOR));
        this.c.commit(k);
      }
    }
  }

  /** immutable_literal? */
  private immutableLiteral(src: RbSource, n0: i32, frozen: boolean): boolean {
    const a = src.a;
    let n = n0;
    if (a.type(n) === NT_BEGIN && a.kid(n, 0) !== V_NIL) {
      n = a.kid(n, 0);
    }
    if (!a.isNode(n)) {
      return false;
    }
    const t = a.type(n);
    if (
      t === NT_INT ||
      t === NT_FLOAT ||
      t === NT_SYM ||
      t === NT_DSYM ||
      t === NT_TRUE ||
      t === NT_FALSE ||
      t === NT_NIL ||
      t === NT_COMPLEX ||
      t === NT_RATIONAL ||
      t === NT_REGOPT
    ) {
      return true;
    }
    if (frozen) {
      if (t === NT_STR || (t === NT_DSTR && !rbRfInterpolated(src, n))) {
        return true;
      }
      if (t === NT_DSTR && rnHeredoc(src, n)) {
        let all = true;
        for (let i = 0; i < a.nKid(n); i++) {
          if (!rbRfIs(src, a.kid(n, i), NT_STR)) {
            all = false;
          }
        }
        if (all) {
          return true;
        }
      }
    }
    return t === NT_REGEXP || t === NT_IRANGE || t === NT_ERANGE;
  }
}
