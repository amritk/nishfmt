// Lint/UselessAssignment, on the VariableForce.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  F_NAME,
  F_OPERATOR,
  F_SELECTOR,
  NT_AND_ASGN,
  NT_ARRAY,
  NT_BEGIN,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_FOR,
  NT_GVAR,
  NT_HASH,
  NT_IVAR,
  NT_KWBEGIN,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_WITH_LVASGN,
  NT_MLHS,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_REGEXP,
  NT_RESBODY,
  NT_SELF,
  NT_SEND,
  NT_SPLAT,
  NT_SUPER,
  NT_XSTR,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { ldhAssignmentMethod } from "./lint_detect_help";
import { VfForce, vfLoopType, vfOpAsgnType, vfSameNode } from "./lint_variable_force";
import {
  ssxAssignment,
  ssxBasicLiteral,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxIs,
  ssxIsAnyBlock,
  ssxLocIs,
  ssxMeth,
  ssxParenthesized,
  ssxSiblingIndex,
} from "./style_syntax_help";

/** call_requires_parentheses?: a send, csend, yield or super operand. */
const luaCallRequiresParens = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  const call = t === NT_SEND || t === NT_CSEND;
  const m = ssxMeth(src, n);
  // prefix_not?
  if (call && m === "!" && ssxLocIs(src, n, F_SELECTOR, "not")) {
    return true;
  }
  if (call && ldhAssignmentMethod(m)) {
    return false;
  }
  const args = call ? a.nKid(n) > 2 : a.nKid(n) > 0;
  return args && !ssxParenthesized(src, n) && m !== "[]";
};

/** operand_requires_parentheses?: the value of an operator assignment needs parentheses as an operand. */
const luaOperandRequiresParens = (src: RbSource, n0: i32): boolean => {
  const a = src.a;
  let n = n0;
  if (ssxIsAnyBlock(src, n)) {
    if (!ssxLocIs(src, n, F_END, "}")) {
      return true;
    }
    n = a.kid(n, 0);
  }
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND || t === NT_YIELD || t === NT_SUPER) {
    return luaCallRequiresParens(src, n);
  }
  if (ssxAssignment(src, n)) {
    return t === NT_OP_ASGN;
  }
  return !(
    ssxBasicLiteral(src, n) ||
    t === NT_IVAR ||
    t === NT_GVAR ||
    t === NT_CVAR ||
    t === NT_LVAR ||
    t === NT_CONST ||
    t === NT_SELF ||
    t === NT_BEGIN ||
    t === NT_KWBEGIN ||
    t === NT_ZSUPER ||
    t === NT_ARRAY ||
    t === NT_HASH ||
    t === NT_DSTR ||
    t === NT_DSYM ||
    t === NT_XSTR ||
    t === NT_REGEXP
  );
};

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
  return `${s.substring(0, i)}(?:${s.substring(add32(i, toI32(pat.length)), toI32(s.length))}`;
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
      if (si < 0 || si >= f.scopes.length) {
        fault();
        return;
      }
      for (const vi of f.scopes[si].vars) {
        if (vi < 0 || vi >= f.vars.length) {
          fault();
          return;
        }
        const v = f.vars[vi];
        if (v.name.startsWith("_")) {
          continue;
        }
        const asg = v.asg;
        for (let j = toI32(asg.length) - 1; j >= 0 && j < asg.length; j--) {
          const k = asg[j];
          if (k < 0 || k >= f.asgns.length) {
            fault();
            return;
          }
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
      k.remove(sub32(oe, 1), oe);
      const value = a.kid(p, -1);
      if (luaOperandRequiresParens(src, value)) {
        k.wrap(a.exS(value), a.exE(value), "(", ")");
      }
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
