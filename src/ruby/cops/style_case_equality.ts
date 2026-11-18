// Style/CaseEquality (AllowOnConstant: false, AllowOnSelfClass: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_SELECTOR,
  NT_AND,
  NT_BEGIN,
  NT_COMPLEX,
  NT_CONST,
  NT_ERANGE,
  NT_FLOAT,
  NT_IF,
  NT_INT,
  NT_IRANGE,
  NT_OR,
  NT_RATIONAL,
  NT_REGEXP,
  NT_SELF,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxArgc, ssxAssignment, ssxFE, ssxFS, ssxIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

/** ConstantNode#module_name?: the short name has a lowercase letter. */
export const ssxModuleName = (src: RbSource, n: i32): boolean => {
  const s = src.a.text(src.a.kid(n, 1));
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) {
      return true;
    }
  }
  // [[:lower:]] also matches non-ASCII lowercase letters; ASCII names only here.
  return false;
};

/** (send (self) :class). */
export const ssxSelfClass = (src: RbSource, n: i32): boolean =>
  ssxIs(src, n, NT_SEND) &&
  ssxIs(src, src.a.kid(n, 0), NT_SELF) &&
  ssxMeth(src, n) === "class" &&
  ssxArgc(src, n) === 0;

/** requires_parentheses? */
const ssxCeRequiresParens = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (t === NT_AND || t === NT_OR || t === NT_IF || t === NT_IRANGE || t === NT_ERANGE || ssxAssignment(src, n)) {
    return true;
  }
  return t === NT_SEND && ssxOperatorName(ssxMeth(src, n));
};

const ssxCeParen = (src: RbSource, n: i32): string =>
  ssxCeRequiresParens(src, n) ? `(${src.nodeSrc(n)})` : src.nodeSrc(n);

const ssxCeNumeric = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  return t === NT_INT || t === NT_FLOAT || t === NT_RATIONAL || t === NT_COMPLEX;
};

export class CopStyleCaseEquality {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CaseEquality");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "===" || ssxArgc(src, n) !== 1) {
        continue;
      }
      const lhs = a.kid(n, 0);
      const rhs = a.kid(n, 2);
      if (lhs === V_NIL) {
        continue;
      }
      if (a.type(lhs) === NT_REGEXP || (a.type(lhs) === NT_CONST && !ssxModuleName(src, lhs))) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      if (k === null) {
        continue;
      }
      let rep = "";
      const lt = a.type(lhs);
      if (lt === NT_BEGIN) {
        const range = a.kid(lhs, 0);
        if (ssxIs(src, range, NT_IRANGE) || ssxIs(src, range, NT_ERANGE)) {
          let allNum = true;
          for (let i = 0; i < a.nKid(range); i++) {
            const e = a.kid(range, i);
            if (e !== V_NIL && !ssxCeNumeric(src, e)) {
              allNum = false;
            }
          }
          rep = `${src.nodeSrc(lhs)}.${allNum ? "include?" : "cover?"}(${src.nodeSrc(rhs)})`;
        }
      } else if (lt === NT_CONST || (lt === NT_SEND && ssxSelfClass(src, lhs))) {
        rep = `${ssxCeParen(src, rhs)}.is_a?(${src.nodeSrc(lhs)})`;
      }
      if (rep.length > 0) {
        k.replace(a.exS(n), a.exE(n), rep);
      }
      this.c.commit(k);
    }
  }
}
