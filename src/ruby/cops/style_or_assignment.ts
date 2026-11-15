// Style/OrAssignment.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CVAR, NT_CVASGN, NT_GVAR, NT_GVASGN, NT_IF, NT_IVAR, NT_IVASGN, NT_LVAR, NT_LVASGN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnIfBranch } from "./style_cond_help";

/** {lvar ivar cvar gvar} */
const soaVar = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_LVAR || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR;
};

/** {lvasgn ivasgn cvasgn gvasgn} */
const soaAsgn = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN;
};

/** A variable or assignment node's name. */
const soaName = (src: RbSource, n: i32): string => src.a.text(src.a.kid(n, 0));

export class CopStyleOrAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/OrAssignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF) {
        // unless_assignment?: (if (var _v) nil? (asgn _v _))
        const v = a.kid(n, 0);
        const asg = a.kid(n, 2);
        if (!soaVar(src, v) || a.kid(n, 1) !== V_NIL || !soaAsgn(src, asg) || a.nKid(asg) < 2 || soaName(src, v) !== soaName(src, asg)) {
          continue;
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          let b = scnIfBranch(src, n);
          if (b === V_NIL) {
            b = asg;
          }
          k.replace(a.exS(n), a.exE(n), `${soaName(src, b)} ||= ${src.nodeSrc(a.kid(b, 1))}`);
          this.c.commit(k);
        }
      } else if (soaAsgn(src, n) && a.nKid(n) === 2) {
        // ternary_assignment?: (asgn _v (if (var _v) (var _v) $_))
        const name = soaName(src, n);
        const f = a.kid(n, 1);
        if (!src.a.isNode(f) || a.type(f) !== NT_IF) {
          continue;
        }
        const c0 = a.kid(f, 0);
        const c1 = a.kid(f, 1);
        if (!soaVar(src, c0) || !soaVar(src, c1) || soaName(src, c0) !== name || soaName(src, c1) !== name) {
          continue;
        }
        const eb = a.kid(f, 2);
        if (eb === V_NIL || a.type(eb) === NT_IF) {
          continue;
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.replace(a.exS(n), a.exE(n), `${name} ||= ${src.nodeSrc(eb)}`);
          this.c.commit(k);
        }
      }
    }
  }
}
