// Style/MethodCallWithoutArgsParentheses (AllowedMethods and AllowedPatterns
// empty).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_NAME,
  F_SELECTOR,
  NT_AND_ASGN,
  NT_BLOCK,
  NT_CASGN,
  NT_CVASGN,
  NT_GVASGN,
  NT_IVASGN,
  NT_LVASGN,
  NT_MASGN,
  NT_MLHS,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OPTARG,
  NT_OR_ASGN,
  NT_SEND,
  NT_SPLAT,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxArgc, ssxCommentsInLines, ssxFE, ssxFS, ssxHas, ssxIs, ssxIsCall, ssxMeth, ssxParenthesized, ssxSelE, ssxSelS, ssxSymText } from "./style_syntax_help";
import { ssxVerifiedRemovals } from "./style_syntax_reparse";

/** MlhsNode#assignments, flattened into out. */
const ssxMcwapAssignments = (src: RbSource, mlhs: i32, out: i32[]): void => {
  const a = src.a;
  for (let i = 0; i < a.nKid(mlhs); i++) {
    const c = a.kid(mlhs, i);
    if (!a.isNode(c)) {
      continue;
    }
    if (a.type(c) === NT_SPLAT) {
      const f = a.kid(c, 0);
      out.push(a.isNode(f) ? f : c);
    } else if (a.type(c) === NT_MLHS) {
      ssxMcwapAssignments(src, c, out);
    } else {
      out.push(c);
    }
  }
};

/** same_name_assignment? */
const ssxMcwapSameNameAssignment = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (a.kid(n, 0) !== V_NIL) {
    return false;
  }
  const m = ssxMeth(src, n);
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    const shorthand = t === NT_OP_ASGN || t === NT_OR_ASGN || t === NT_AND_ASGN;
    if (shorthand || t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN || t === NT_MASGN) {
      if (!(shorthand && ssxIsCall(src, a.kid(p, 0)))) {
        if (t === NT_MASGN) {
          const asg: i32[] = [];
          ssxMcwapAssignments(src, a.kid(p, 0), asg);
          for (const x of asg) {
            const xt = a.type(x);
            if (xt === NT_SEND) {
              continue;
            }
            let name = "";
            if (xt === NT_LVASGN || xt === NT_IVASGN || xt === NT_CVASGN || xt === NT_GVASGN) {
              name = ssxSymText(src, a.kid(x, 0));
            } else if (xt === NT_CASGN) {
              name = ssxSymText(src, a.kid(x, 1));
            }
            if (name === m) {
              return true;
            }
          }
        } else if (ssxHas(src, p, F_NAME) && src.src(ssxFS(src, p, F_NAME), ssxFE(src, p, F_NAME)) === m) {
          return true;
        }
      }
    }
    p = src.parent(p);
  }
  return false;
};

export class CopStyleMethodCallWithoutArgsParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MethodCallWithoutArgsParentheses");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const ps: i32[] = [];
    const pe: i32[] = [];
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || ssxArgc(src, n) !== 0 || !ssxParenthesized(src, n)) {
        continue;
      }
      const m = ssxMeth(src, n);
      // ineligible_node?
      const c0 = m.charCodeAt(0);
      if (c0 >= 65 && c0 <= 90) {
        continue;
      }
      if (m === "call" && ssxSelS(src, n) < 0) {
        continue;
      }
      if (m === "!" && a.kid(n, 0) !== V_NIL && src.src(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR)) === "not") {
        continue;
      }
      // default_argument?
      const par = src.parent(n);
      if (par !== V_NIL && a.type(par) === NT_OPTARG) {
        continue;
      }
      if (ssxMcwapSameNameAssignment(src, n)) {
        continue;
      }
      // parenthesized_it_method_in_block?
      if (m === "it") {
        let b = src.parent(n);
        while (b !== V_NIL && a.type(b) !== NT_BLOCK && a.type(b) !== NT_NUMBLOCK) {
          b = src.parent(b);
        }
        if (b !== V_NIL && !(a.type(b) === NT_BLOCK && a.exS(a.kid(b, 1)) >= 0)) {
          const literal = par !== V_NIL && (a.type(par) === NT_BLOCK || a.type(par) === NT_NUMBLOCK) && a.kid(par, 0) === n;
          if (a.kid(n, 0) === V_NIL && !literal) {
            continue;
          }
        }
      }
      // register_offense
      const s = ssxFS(src, n, F_BEGIN);
      const e = ssxFE(src, n, F_END);
      if (ssxCommentsInLines(src, src.line(s), src.line(e))) {
        continue;
      }
      ps.push(s);
      pe.push(e);
    }
    // on_investigation_end
    for (const i of ssxVerifiedRemovals(src, ps, pe)) {
      const k = this.c.offense(ps[i], pe[i]);
      if (k !== null) {
        k.remove(ps[i], pe[i]);
        this.c.commit(k);
      }
    }
  }
}
