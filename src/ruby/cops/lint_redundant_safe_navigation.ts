// Lint/RedundantSafeNavigation (unsafe; detection only; AllowedMethods:
// [instance_of? kind_of? is_a? eql? respond_to? equal?],
// InferNonNilReceiver: false): `&.` on a receiver that is never nil, or
// whose method nil also answers in a condition, and `x&.to_h || {}`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_DOT,
  NT_ARRAY,
  NT_CONST,
  NT_CSEND,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_NIL,
  NT_OR,
  NT_SELF,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_UNTIL_POST,
  NT_WHILE_POST,
  V_NIL,
  rbFloatInspect,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { ldhConditional, ldhLiteral, ldhNilMethod, ldhOperatorKeyword, ldhType } from "./lint_detect_help";
import { ssxFE, ssxFS, ssxIsAnyBlock, ssxMeth } from "./style_syntax_help";

/** SNAKE_CASE /\A[[:digit:][:upper:]_]+\z/ (ASCII). */
const lrsnScreaming = (s: string): boolean => {
  if (s.length === 0) {
    return false;
  }
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || c === 95)) {
      return false;
    }
  }
  return true;
};

/** The csend `(csend _ :name)` without arguments, or V_NIL. */
const lrsnBareCsend = (src: RbSource, n: i32, name: string): i32 =>
  ldhType(src, n) === NT_CSEND && src.a.nKid(n) === 2 && ssxMeth(src, n) === name ? n : V_NIL;

export class CopLintRedundantSafeNavigation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantSafeNavigation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CSEND) {
        if (!this.guarded(src, n)) {
          this.c.offense(ssxFS(src, n, F_DOT), ssxFE(src, n, F_DOT));
        }
      } else if (t === NT_OR) {
        const s = this.conversionWithDefault(src, n);
        if (s !== V_NIL) {
          this.c.offense(ssxFS(src, s, F_DOT), a.exE(n));
        }
      }
    }
  }

  /** guarded_by_nil_receiver?. */
  private guarded(src: RbSource, n: i32): boolean {
    const a = src.a;
    const r = a.kid(n, 0);
    // assume_receiver_instance_exists?
    const rt = ldhType(src, r);
    if (rt === NT_CONST && !lrsnScreaming(a.text(a.kid(r, 1)))) {
      return false;
    }
    if (rt === NT_SELF || (ldhLiteral(src, r) && rt !== NT_NIL)) {
      return false;
    }
    // guaranteed_instance?
    const recv = ssxIsAnyBlock(src, r) ? a.kid(r, 0) : r;
    const m0 = ssxMeth(src, recv);
    const guaranteed =
      ldhType(src, recv) === NT_SEND &&
      (m0 === "to_s" || m0 === "to_i" || m0 === "to_f" || m0 === "to_a" || m0 === "to_h");
    if (!guaranteed && !this.check(src, n)) {
      return true;
    }
    // respond_to_nil_method?
    if (guaranteed || ssxMeth(src, n) !== "respond_to?" || a.nKid(n) !== 3) {
      return false;
    }
    const arg = a.kid(n, 2);
    return ldhType(src, arg) === NT_SYM && ldhNilMethod(a.text(a.kid(arg, 0)));
  }

  /** check?. */
  private check(src: RbSource, n: i32): boolean {
    const a = src.a;
    const m = ssxMeth(src, n);
    if (
      !(
        m === "instance_of?" ||
        m === "kind_of?" ||
        m === "is_a?" ||
        m === "eql?" ||
        m === "respond_to?" ||
        m === "equal?"
      )
    ) {
      return false;
    }
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    const pt = a.type(p);
    if ((ldhConditional(src, p) || pt === NT_WHILE_POST || pt === NT_UNTIL_POST) && vfSameNode(src, a.kid(p, 0), n)) {
      return true;
    }
    if (ldhOperatorKeyword(src, p)) {
      return true;
    }
    return pt === NT_SEND && a.kid(p, 0) !== V_NIL && ssxMeth(src, p) === "!";
  }

  /** conversion_with_default?: the csend, or V_NIL. */
  private conversionWithDefault(src: RbSource, n: i32): i32 {
    const a = src.a;
    const l = a.kid(n, 0);
    const r = a.kid(n, 1);
    const rt = ldhType(src, r);
    if (rt === NT_HASH && a.nKid(r) === 0) {
      const s = lrsnBareCsend(src, l, "to_h");
      if (s !== V_NIL) {
        return s;
      }
      if (ssxIsAnyBlock(src, l)) {
        return lrsnBareCsend(src, a.kid(l, 0), "to_h");
      }
      return V_NIL;
    }
    if (rt === NT_ARRAY && a.nKid(r) === 0) {
      return lrsnBareCsend(src, l, "to_a");
    }
    if (rt === NT_INT && a.text(a.kid(r, 0)) === "0") {
      return lrsnBareCsend(src, l, "to_i");
    }
    const fv = rt === NT_FLOAT ? rbFloatInspect(a.text(a.kid(r, 0))) : "";
    if (fv === "0.0" || fv === "-0.0") {
      return lrsnBareCsend(src, l, "to_f");
    }
    if (rt === NT_STR && a.text(a.kid(r, 0)).length === 0) {
      return lrsnBareCsend(src, l, "to_s");
    }
    return V_NIL;
  }
}
