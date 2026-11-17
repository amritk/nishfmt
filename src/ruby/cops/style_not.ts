// Style/Not.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_EFLIPFLOP,
  NT_ERANGE,
  NT_IF,
  NT_IFLIPFLOP,
  NT_IRANGE,
  NT_OR,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { ssxAssignment, ssxFE, ssxFS, ssxHas, ssxIs, ssxMeth, ssxOperatorName, ssxSelS } from "./style_syntax_help";

/** OPPOSITE_METHODS (or "" for none). */
const ssxNotOpposite = (m: string): string => {
  if (m === "==") {
    return "!=";
  }
  if (m === "!=") {
    return "==";
  }
  if (m === "<=") {
    return ">";
  }
  if (m === ">") {
    return "<=";
  }
  if (m === "<") {
    return ">=";
  }
  if (m === ">=") {
    return "<";
  }
  return "";
};

/** MethodDispatchNode#binary_operation? (b) or unary_operation? (!b). */
export const ssxOperation = (src: RbSource, n: i32, binary: boolean): boolean => {
  const ss = ssxSelS(src, n);
  if (ss < 0 || !ssxOperatorName(ssxMeth(src, n))) {
    return false;
  }
  return binary ? src.a.exS(n) !== ss : src.a.exS(n) === ss;
};

export class CopStyleNot {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Not");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "!") {
        continue;
      }
      const child = a.kid(n, 0);
      const ss = ssxFS(src, n, F_SELECTOR);
      const se = ssxFE(src, n, F_SELECTOR);
      if (child === V_NIL || src.src(ss, se) !== "not") {
        continue;
      }
      const k = this.c.offense(ss, se);
      if (k === null) {
        continue;
      }
      const re = rbSpaceEnd(src, se, 2, true, false, false);
      const opp = ssxIs(src, child, NT_SEND) ? ssxNotOpposite(ssxMeth(src, child)) : "";
      if (opp.length > 0) {
        k.remove(ss, re);
        k.replace(ssxFS(src, child, F_SELECTOR), ssxFE(src, child, F_SELECTOR), opp);
      } else {
        const t = a.type(child);
        let parens = t === NT_AND || t === NT_OR;
        if (
          t === NT_SEND &&
          (ssxOperation(src, child, true) || (ssxOperation(src, child, false) && ssxMeth(src, child) === "~"))
        ) {
          parens = true;
        }
        if (t === NT_IF && ssxHas(src, child, F_QUESTION)) {
          parens = true;
        }
        if (
          t === NT_IRANGE ||
          t === NT_ERANGE ||
          t === NT_IFLIPFLOP ||
          t === NT_EFLIPFLOP ||
          ssxAssignment(src, child)
        ) {
          parens = true;
        }
        if (parens) {
          k.replace(ss, re, "!(");
          k.insertAfter(a.exS(n), a.exE(n), ")");
        } else {
          k.replace(ss, re, "!");
        }
      }
      this.c.commit(k);
    }
  }
}
