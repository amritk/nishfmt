// Lint/UselessAssignment, on the VariableForce.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_KEYWORD,
  F_NAME,
  F_OPERATOR,
  NT_AND_ASGN,
  NT_ARRAY,
  NT_DEF,
  NT_DEFS,
  NT_FOR,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_WITH_LVASGN,
  NT_MLHS,
  NT_OR_ASGN,
  NT_RESBODY,
  NT_SEND,
  NT_SPLAT,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { VfForce, vfLoopType, vfOpAsgnType, vfSameNode } from "./lint_variable_force";
import { ssxAssignment, ssxFE, ssxFS, ssxHas, ssxIs, ssxSiblingIndex } from "./style_syntax_help";

/** Assignment#meta_assignment_node: the op-asgn, masgn, splat or for node, or V_NIL. */
const luaMetaNode = (src: RbSource, node: i32): i32 => {
  const a = src.a;
  const p = src.parent(node);
  if (p === V_NIL) {
    return V_NIL;
  }
  // operator_assignment_node
  if (vfOpAsgnType(a.type(p)) && ssxSiblingIndex(src, node) === 0) {
    return p;
  }
  // multiple_assignment_node
  let cand = p;
  if (a.type(cand) === NT_SPLAT) {
    cand = src.parent(cand);
  }
  if (cand !== V_NIL && a.type(cand) === NT_MLHS) {
    const gp = src.parent(p);
    if (gp !== V_NIL) {
      let g = gp;
      while (a.type(g) === NT_MLHS) {
        const pp = src.parent(g);
        if (a.type(pp) === NT_MASGN) {
          return pp;
        }
        g = pp;
      }
      if (a.type(gp) === NT_MASGN) {
        return gp;
      }
    }
  }
  // rest_assignment_node
  if (a.type(p) === NT_SPLAT) {
    return p;
  }
  // for_assignment_node
  if (a.type(p) === NT_FOR) {
    return p;
  }
  const gp = src.parent(p);
  if (a.type(p) === NT_MLHS && gp !== V_NIL && a.type(gp) === NT_FOR) {
    return gp;
  }
  return V_NIL;
};

/** sequential_assignment?. */
const luaSequential = (src: RbSource, f: VfForce, node0: i32): boolean => {
  const a = src.a;
  let node = node0;
  while (node !== V_NIL) {
    if (a.type(node) === NT_LVASGN && ssxIs(src, a.kid(node, 1), NT_ARRAY)) {
      for (const d of f.descendants(node)) {
        if (ssxAssignment(src, d)) {
          return true;
        }
      }
    }
    node = src.parent(node);
  }
  return false;
};

/** variable_in_loop_condition?. */
const luaInLoopCondition = (src: RbSource, f: VfForce, node: i32, name: string): boolean => {
  const a = src.a;
  let p = src.parent(node);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_DEF || t === NT_DEFS) {
      return false;
    }
    if (vfLoopType(t)) {
      break;
    }
    p = src.parent(p);
  }
  if (p === V_NIL || a.type(p) === NT_FOR) {
    return false;
  }
  const cond = a.kid(p, 0);
  if (a.type(cond) === NT_LVAR && a.text(a.kid(cond, 0)) === name) {
    return true;
  }
  for (const d of f.descendants(cond)) {
    if (a.type(d) === NT_LVAR && a.text(a.kid(d, 0)) === name) {
      return true;
    }
  }
  return false;
};

/** The first `(?<name>` of s replaced with `(?:`. */
const luaSubCapture = (s: string, name: string): string => {
  const pat = `(?<${name}>`;
  const i = s.indexOf(pat);
  if (i < 0) {
    return s;
  }
  return `${s.substring(0, i)}(?:${s.substring(i + toI32(pat.length), toI32(s.length))}`;
};

export class CopLintUselessAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UselessAssignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const f = new VfForce(src);
    f.run();
    const a = src.a;
    const ign = new LalIgnored();
    for (const si of f.popped) {
      for (const vi of f.scopes[si].vars) {
        const v = f.vars[vi];
        if (v.name.startsWith("_")) {
          continue;
        }
        for (let j = toI32(v.asg.length) - 1; j >= 0; j--) {
          const k = v.asg[j];
          const node = f.asgns[k].node;
          if (f.asgUsed(k) || ign.partOf(src, node) || luaInLoopCondition(src, f, node, v.name)) {
            continue;
          }
          const isRe = a.type(node) === NT_MATCH_WITH_LVASGN;
          const rs = isRe ? a.exS(a.kid(node, 0)) : ssxFS(src, node, F_NAME);
          const re = isRe ? a.exE(a.kid(node, 0)) : ssxFE(src, node, F_NAME);
          const kr = this.c.offense(rs, re);
          if (kr !== null) {
            const p = src.parent(node);
            const unc =
              luaSequential(src, f, node) || (p !== V_NIL && (a.type(p) === NT_OR_ASGN || a.type(p) === NT_AND_ASGN));
            if (!unc) {
              this.autocorrect(src, kr, node, v.name);
            }
            this.c.commit(kr);
          }
          // chained_assignment?
          if (
            a.type(node) === NT_LVASGN &&
            (ssxIs(src, a.kid(node, 1), NT_SEND) || ssxIs(src, a.kid(node, 1), NT_LVASGN))
          ) {
            ign.add(node);
          }
        }
      }
    }
  }

  private autocorrect(src: RbSource, k: RbRewriter, node: i32, name: string): void {
    const a = src.a;
    const p = src.parent(node);
    // exception_assignment?
    if (p !== V_NIL && a.type(p) === NT_RESBODY && vfSameNode(src, a.kid(p, 1), node)) {
      const ex = a.kid(p, 0);
      const s = ex !== V_NIL ? a.exE(ex) : ssxFE(src, p, F_KEYWORD);
      k.remove(s, a.exE(node));
      return;
    }
    const meta = luaMetaNode(src, node);
    const mt = meta === V_NIL ? -1 : a.type(meta);
    if (mt === NT_MASGN || mt === NT_SPLAT || mt === NT_FOR) {
      k.replace(a.exS(node), a.exE(node), "_");
      return;
    }
    if (meta !== V_NIL && vfOpAsgnType(mt)) {
      const oe = ssxFE(src, p, F_OPERATOR);
      k.remove(oe - 1, oe);
      return;
    }
    if (a.type(node) === NT_MATCH_WITH_LVASGN) {
      const re = a.kid(node, 0);
      k.replace(a.exS(re), a.exE(re), luaSubCapture(src.nodeSrc(re), name));
      return;
    }
    const expr = a.kid(node, 1);
    if (expr === V_NIL) {
      return;
    }
    const s = ssxFS(src, node, F_NAME);
    if (a.type(expr) === NT_ARRAY && !ssxHas(src, expr, F_BEGIN)) {
      k.replace(s, a.exS(expr), "[");
      k.insertAfter(a.exS(expr), a.exE(expr), "]");
    } else {
      k.remove(s, a.exS(expr));
    }
  }
}
