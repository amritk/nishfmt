// Style/InfiniteLoop (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import {
  F_KEYWORD,
  NT_ARRAY,
  NT_BLOCK,
  NT_CLASS,
  NT_COMPLEX,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_IRANGE,
  NT_LVAR,
  NT_LVASGN,
  NT_MODULE,
  NT_NIL,
  NT_NUMBLOCK,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SCLASS,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_XSTR,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { VfForce, VfVar, vfArgType, vfOpAsgnType } from "./lint_variable_force";
import { ssxDescendants, ssxFE, ssxFS } from "./style_syntax_help";

/** Node#truthy_literal?. */
export const rbTruthyLiteral = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (
    t === NT_STR ||
    t === NT_DSTR ||
    t === NT_XSTR ||
    t === NT_INT ||
    t === NT_FLOAT ||
    t === NT_SYM ||
    t === NT_DSYM ||
    t === NT_ARRAY ||
    t === NT_HASH ||
    t === NT_REGEXP ||
    t === NT_TRUE ||
    t === NT_IRANGE ||
    t === NT_ERANGE ||
    t === NT_COMPLEX ||
    t === NT_RATIONAL ||
    t === NT_REGOPT
  );
};

/** Node#falsey_literal?. */
export const rbFalseyLiteral = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_FALSE || src.a.type(n) === NT_NIL);

/** Whether a block's arguments declare `name` (so it shadows an outer variable). */
const rbInfLoopBlockDeclares = (src: RbSource, blk: i32, name: string): boolean => {
  const a = src.a;
  const args = a.kid(blk, 1);
  if (!a.isNode(args)) {
    return false;
  }
  for (const d of ssxDescendants(src, args)) {
    if (vfArgType(a.type(d)) && a.kid(d, 0) !== V_NIL && a.text(a.kid(d, 0)) === name) {
      return true;
    }
  }
  return false;
};

/**
 * Whether a reference at `n` to `v.name` reaches the variable `v` (declared
 * before it): `n` lies in v's scope with no hard scope or shadowing block
 * between them.
 */
const rbInfLoopReaches = (src: RbSource, f: VfForce, v: VfVar, n: i32): boolean => {
  const a = src.a;
  const vs = v.scope;
  if (vs < 0 || vs >= f.scopes.length) {
    fault();
    return false;
  }
  const scope = f.scopes[vs].node;
  let p = src.parent(n);
  while (p !== V_NIL && p !== scope) {
    const t = a.type(p);
    if (t === NT_DEF || t === NT_DEFS || t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
      return false;
    }
    if ((t === NT_BLOCK || t === NT_NUMBLOCK) && rbInfLoopBlockDeclares(src, p, v.name)) {
      return false;
    }
    p = src.parent(p);
  }
  return p === scope;
};

/** Variable#references: any whose node begins after `e`. */
const rbInfLoopReferencedAfter = (src: RbSource, f: VfForce, vi: i32, e: i32): boolean => {
  const a = src.a;
  const v = f.vars[vi];
  for (const n of src.pre) {
    if (!a.isNode(n) || a.exS(n) <= e) {
      continue;
    }
    const t = a.type(n);
    let hit = false;
    if (t === NT_LVAR) {
      hit = a.text(a.kid(n, 0)) === v.name;
    } else if (vfOpAsgnType(t)) {
      const lhs = a.kid(n, 0);
      hit = a.isNode(lhs) && a.type(lhs) === NT_LVASGN && a.text(a.kid(lhs, 0)) === v.name;
    } else if (t === NT_ZSUPER) {
      hit = f.isMethodArgument(vi);
    } else if (t === NT_SEND && a.text(a.kid(n, 1)) === "binding") {
      const arg = a.kid(n, 2);
      hit = !(a.isNode(arg) && a.nKid(arg) > 0);
    }
    if (hit && rbInfLoopReaches(src, f, v, n)) {
      return true;
    }
  }
  return false;
};

/** The variable force, run on first use. */
const rbInfLoopForce = (src: RbSource, f: VfForce | null): VfForce => {
  if (f !== null) {
    return f;
  }
  const nf = new VfForce(src);
  nf.run();
  return nf;
};

export class CopStyleInfiniteLoop {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/InfiniteLoop");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    let f: VfForce | null = null;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      let hit = false;
      if (t === NT_WHILE || t === NT_WHILE_POST) {
        hit = rbTruthyLiteral(src, a.kid(n, 0));
      } else if (t === NT_UNTIL || t === NT_UNTIL_POST) {
        hit = rbFalseyLiteral(src, a.kid(n, 0));
      }
      if (!hit) {
        continue;
      }
      const fv = rbInfLoopForce(src, f);
      f = fv;
      const s = a.exS(n);
      const e = a.exE(n);
      let skip = false;
      for (let vi = 0; vi < toI32(fv.vars.length); vi++) {
        const v = fv.vars[vi];
        let inside = false;
        let before = false;
        for (const k of v.asg) {
          if (k < 0 || k >= fv.asgns.length) {
            fault();
            return;
          }
          const an = fv.asgns[k].node;
          if (a.exS(an) >= s && a.exE(an) <= e) {
            inside = true;
          }
          if (a.exE(an) < s) {
            before = true;
          }
        }
        if (inside && !before && rbInfLoopReferencedAfter(src, fv, vi, e)) {
          skip = true;
          break;
        }
      }
      if (!skip) {
        this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      }
    }
  }
}
