// Naming/ConstantName (detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_BEGIN, NT_BLOCK, NT_CASGN, NT_CONST, NT_IF, NT_OR_ASGN, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { mcxLiteral } from "./metrics_complexity_help";
import { nmhCps, nmhDigit, nmhUpper } from "./naming_help";
import { scnBranches } from "./style_cond_help";
import { ssxFE, ssxFS } from "./style_syntax_help";

/** literal_receiver?: `(send literal? ...)` or `(send (begin literal?) ...)`. */
const ncnLiteralReceiver = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const r = a.kid(n, 0);
  if (!a.isNode(r)) {
    return false;
  }
  if (mcxLiteral(a.type(r))) {
    return true;
  }
  return a.type(r) === NT_BEGIN && a.nKid(r) === 1 && a.isNode(a.kid(r, 0)) && mcxLiteral(a.type(a.kid(r, 0)));
};

/** allowed_assignment? */
const ncnAllowed = (src: RbSource, v: i32): boolean => {
  const a = src.a;
  if (!a.isNode(v)) {
    return false;
  }
  const t = a.type(v);
  if (t === NT_BLOCK || t === NT_CONST || t === NT_CASGN) {
    return true;
  }
  // allowed_method_call_on_rhs? (class_or_struct_return_method? is a case of it)
  if (t === NT_SEND && (a.kid(v, 0) === V_NIL || !ncnLiteralReceiver(src, v))) {
    return true;
  }
  if (t === NT_IF) {
    for (const b of scnBranches(src, v)) {
      if (b !== V_NIL && a.isNode(b) && a.type(b) === NT_CONST) {
        return true;
      }
    }
  }
  return false;
};

/** SNAKE_CASE: `/^[[:digit:][:upper:]_]+$/`. */
const ncnScreaming = (name: string): boolean => {
  const cs = nmhCps(name);
  if (cs.length === 0) {
    return false;
  }
  for (const c of cs) {
    if (!(nmhDigit(c) || nmhUpper(c) || c === 95)) {
      return false;
    }
  }
  return true;
};

export class CopNamingConstantName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/ConstantName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_CASGN) {
        continue;
      }
      const p = src.parent(n);
      const v = p !== V_NIL && a.type(p) === NT_OR_ASGN ? a.kid(p, -1) : a.kid(n, 2);
      if (ncnAllowed(src, v) || ncnScreaming(a.text(a.kid(n, 1)))) {
        continue;
      }
      this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
    }
  }
}
