// Lint/ShadowedArgument (IgnoreImplicitReferences: false; no correction): a
// method or block argument reassigned before it is used, on the
// VariableForce.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_AND_ASGN,
  NT_BLOCK,
  NT_FOR,
  NT_LVAR,
  NT_MASGN,
  NT_MLHS,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_RESCUE,
  NT_SHADOWARG,
  NT_SEND,
  NT_SPLAT,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhConditional, ldhType } from "./lint_detect_help";
import { VfForce, vfSameNode } from "./lint_variable_force";
import { scnEachNode } from "./style_cond_help";

/** Assignment#meta_assignment_node, or V_NIL. */
export const lshaMetaAssignment = (src: RbSource, node: i32): i32 => {
  const a = src.a;
  const p = src.parent(node);
  if (p === V_NIL) {
    return V_NIL;
  }
  const pt = a.type(p);
  // operator_assignment_node
  if ((pt === NT_OR_ASGN || pt === NT_AND_ASGN || pt === NT_OP_ASGN) && a.kid(p, 0) === node) {
    return p;
  }
  // multiple_assignment_node
  const cand = pt === NT_SPLAT ? src.parent(p) : p;
  if (ldhType(src, cand) === NT_MLHS) {
    const gp = src.parent(p);
    if (gp !== V_NIL) {
      // find_multiple_assignment_node
      let g = gp;
      while (ldhType(src, g) === NT_MLHS) {
        const q = src.parent(g);
        if (ldhType(src, q) === NT_MASGN) {
          return q;
        }
        g = q;
      }
      if (a.type(gp) === NT_MASGN) {
        return gp;
      }
    }
  }
  // rest_assignment_node
  if (pt === NT_SPLAT) {
    return p;
  }
  // for_assignment_node
  if (pt === NT_FOR) {
    return p;
  }
  const gp = src.parent(p);
  if (pt === NT_MLHS && ldhType(src, gp) === NT_FOR) {
    return gp;
  }
  return V_NIL;
};

/** conditional_assignment?: a conditional, block or rescue between node and the scope node. */
const lshaConditional = (src: RbSource, n: i32, stop: i32): boolean => {
  let x = n;
  while (x !== V_NIL) {
    if (vfSameNode(src, x, stop)) {
      return false;
    }
    const t = src.a.type(x);
    if (ldhConditional(src, x) || t === NT_BLOCK || t === NT_RESCUE) {
      return true;
    }
    x = src.parent(x);
  }
  return false;
};

/** uses_var?: an `(lvar name)` at or under n. */
const lshaUsesVar = (src: RbSource, n: i32, name: string): boolean => {
  for (const x of scnEachNode(src, n, NT_LVAR)) {
    if (src.a.text(src.a.kid(x, 0)) === name) {
      return true;
    }
  }
  return false;
};

export class CopLintShadowedArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ShadowedArgument");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const f = new VfForce(src);
    f.run();
    for (const si of f.popped) {
      for (const vi of f.scopes[si].vars) {
        const node = this.check(src, f, vi);
        if (node !== V_NIL) {
          this.c.offense(src.a.exS(node), src.a.exE(node));
        }
      }
    }
  }

  /** check_argument: the offense node, or V_NIL. */
  private check(src: RbSource, f: VfForce, vi: i32): i32 {
    const a = src.a;
    const v = f.vars[vi];
    if (!(f.isMethodArgument(vi) || f.isBlockArgument(vi)) || a.type(v.decl) === NT_SHADOWARG) {
      return V_NIL;
    }
    if (v.refs.length === 0) {
      return V_NIL;
    }
    const scopeNode = f.scopes[v.scope].node;
    let known = true;
    for (const k of v.asg) {
      const asNode = f.asgns[k].node;
      const meta = lshaMetaAssignment(src, asNode);
      const an = meta !== V_NIL ? meta : asNode;
      const at = a.type(an);
      if (at === NT_OP_ASGN || at === NT_OR_ASGN || at === NT_AND_ASGN) {
        known = false;
        continue;
      }
      const p = src.parent(an);
      if (p === V_NIL) {
        known = false;
        continue;
      }
      const cond = lshaConditional(src, p, scopeNode);
      if (lshaUsesVar(src, an, v.name)) {
        continue;
      }
      if (cond) {
        known = false;
        continue;
      }
      // the assignment without a use of the argument
      const pos = a.exS(asNode);
      if (this.usedBefore(src, f, vi, pos)) {
        return V_NIL;
      }
      return known ? asNode : v.decl;
    }
    return V_NIL;
  }

  /** Whether one of argument_references starts at or before pos. */
  private usedBefore(src: RbSource, f: VfForce, vi: i32, pos: i32): boolean {
    const a = src.a;
    const v = f.vars[vi];
    // assignment_references: ranges of the references the assignments got
    const asgS: i32[] = [];
    const asgE: i32[] = [];
    for (const k of v.asg) {
      for (const r of f.asgns[k].refs) {
        asgS.push(a.exS(r));
        asgE.push(a.exE(r));
      }
    }
    for (const r of v.refs) {
      const t = a.type(r);
      const explicit = t !== NT_ZSUPER && t !== NT_SEND;
      if (explicit) {
        let taken = false;
        for (let i = 0; i < toI32(asgS.length); i++) {
          if (asgS[i] === a.exS(r) && asgE[i] === a.exE(r)) {
            taken = true;
          }
        }
        if (taken) {
          continue;
        }
      }
      // reference_pos
      let x = r;
      const p = src.parent(x);
      if (p !== V_NIL && a.type(p) === NT_MASGN) {
        x = p;
      }
      if (a.exS(x) <= pos) {
        return true;
      }
    }
    return false;
  }
}
