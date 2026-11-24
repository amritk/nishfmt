// Style/InverseMethods (default InverseMethods and InverseBlocks; unsafe:
// detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CONST, NT_CSEND, NT_DEF, NT_DEFS, NT_NEXT, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefName, ssxDescendants, ssxIs, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** The inverse_methods keys (both directions). */
const rbInvMethod = (m: string): boolean =>
  m === "any?" ||
  m === "none?" ||
  m === "even?" ||
  m === "odd?" ||
  m === "==" ||
  m === "!=" ||
  m === "=~" ||
  m === "!~" ||
  m === "<" ||
  m === ">=" ||
  m === ">" ||
  m === "<=";

/** camel_case_constant?: a const whose source matches /[A-Z]+[a-z]+/. */
const rbInvCamel = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const s = src.nodeSrc(n);
  for (let i = 0; i < toI32(s.length) - 1; i++) {
    const c = s.charCodeAt(i);
    const d = s.charCodeAt(i + 1);
    if (c >= 65 && c <= 90 && d >= 97 && d <= 122) {
      return true;
    }
  }
  return false;
};

/** negated?: the parent responds to method? and is a `!`. */
const rbInvNegated = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return false;
  }
  if (ssxIsCall(src, p)) {
    return ssxMeth(src, p) === "!";
  }
  if (ssxIs(src, p, NT_DEF) || ssxIs(src, p, NT_DEFS)) {
    return ssxDefName(src, p) === "!";
  }
  if (ssxIsAnyBlock(src, p) && ssxIsCall(src, src.a.kid(p, 0))) {
    return ssxMeth(src, src.a.kid(p, 0)) === "!";
  }
  return false;
};

/** A body that inverse_block? accepts as the negation: `(call ... :!)` or `(send (...) {:!= :!~} ...)`. */
const rbInvNegation = (src: RbSource, n: i32): boolean => {
  if (ssxIsCall(src, n) && ssxMeth(src, n) === "!") {
    return true;
  }
  if (!ssxIs(src, n, NT_SEND) || src.a.kid(n, 0) === V_NIL) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "!=" || m === "!~";
};

export class CopStyleInverseMethods {
  c: RbCop;
  ignS: i32[];
  ignE: i32[];

  constructor() {
    this.c = new RbCop("Style/InverseMethods");
    this.ignS = [];
    this.ignE = [];
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    this.ignS = [];
    this.ignE = [];
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_SEND)) {
        this.onSend(src, n);
      } else if (ssxIsAnyBlock(src, n)) {
        this.onBlock(src, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxMeth(src, n) !== "!" || a.nKid(n) !== 2) {
      return;
    }
    let r = a.kid(n, 0);
    let call = V_NIL;
    let lhs = V_NIL;
    let rhs: i32[] = [];
    if (ssxIs(src, r, NT_BEGIN) && a.nKid(r) === 1) {
      r = a.kid(r, 0);
      if (!ssxIsCall(src, r)) {
        return;
      }
    } else if (ssxIs(src, r, NT_BEGIN)) {
      return;
    }
    if (ssxIsCall(src, r) && a.isNode(a.kid(r, 0))) {
      call = r;
      lhs = a.kid(r, 0);
      for (let i = 2; i < a.nKid(r); i++) {
        rhs.push(a.kid(r, i));
      }
    } else if (ssxIsAnyBlock(src, r) && !ssxIs(src, a.kid(n, 0), NT_BEGIN)) {
      const s = a.kid(r, 0);
      if (!ssxIsCall(src, s) || a.nKid(s) !== 2 || !a.isNode(a.kid(s, 0))) {
        return;
      }
      call = s;
      lhs = a.kid(s, 0);
      rhs = [a.kid(r, 1), a.kid(r, 2)];
    } else {
      return;
    }
    const m = ssxMeth(src, call);
    if (!rbInvMethod(m) || rbInvNegated(src, n)) {
      return;
    }
    if (
      ssxIs(src, call, NT_CSEND) &&
      (m === "<=" || m === ">=" || m === "<" || m === ">" || m === "any?" || m === "none?")
    ) {
      return;
    }
    // part_of_ignored_node?
    const s = a.exS(n);
    const e = a.exE(n);
    const ignS = this.ignS;
    const ignE = this.ignE;
    for (let i = 0; i < ignS.length && i < ignE.length; i++) {
      if (ignS[i] <= s && ignE[i] >= e) {
        return;
      }
    }
    if (
      (m === "<=" || m === ">=" || m === "<" || m === ">") &&
      (rbInvCamel(src, lhs) || (rhs.length === 1 && rbInvCamel(src, rhs[0])))
    ) {
      return;
    }
    this.c.note(s, e);
  }

  private onBlock(src: RbSource, n: i32): void {
    const a = src.a;
    const s = a.kid(n, 0);
    if (!ssxIsCall(src, s) || a.nKid(s) !== 2 || !a.isNode(a.kid(s, 0))) {
      return;
    }
    const m = ssxMeth(src, s);
    const body = a.kid(n, -1);
    let neg = V_NIL;
    if (rbInvNegation(src, body)) {
      neg = body;
    } else if (ssxIs(src, body, NT_BEGIN) && a.nKid(body) > 0 && rbInvNegation(src, a.kid(body, -1))) {
      neg = a.kid(body, -1);
    }
    if (neg === V_NIL) {
      return;
    }
    if (m !== "select" && m !== "reject" && m !== "select!" && m !== "reject!") {
      return;
    }
    if (rbInvNegated(src, n) && rbInvNegated(src, src.parent(n))) {
      return;
    }
    for (const d of ssxDescendants(src, n)) {
      if (a.type(d) === NT_NEXT) {
        return;
      }
    }
    this.ignS.push(a.exS(neg));
    this.ignE.push(a.exE(neg));
    this.c.note(a.exS(n), a.exE(n));
  }
}
