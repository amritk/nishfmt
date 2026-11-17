// Style/IdenticalConditionalBranches (its correction is unsafe: detection
// only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ELSE,
  F_OPERATOR,
  NT_AND_ASGN,
  NT_BEGIN,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CSEND,
  NT_CVAR,
  NT_CVASGN,
  NT_GVAR,
  NT_GVASGN,
  NT_IF,
  NT_IN_PATTERN,
  NT_IVAR,
  NT_IVASGN,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_SEND,
  NT_WHEN,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { scnElseBranch, scnElsif, scnIfBranch } from "./style_cond_help";
import { ssxHas, ssxIs } from "./style_syntax_help";

/** Node#assignment? (MethodDispatchNode#setter_method? for a call). */
export const rbNodeAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return ssxHas(src, n, F_OPERATOR);
  }
  return (
    t === NT_LVASGN ||
    t === NT_IVASGN ||
    t === NT_CVASGN ||
    t === NT_GVASGN ||
    t === NT_CASGN ||
    t === NT_MASGN ||
    t === NT_OP_ASGN ||
    t === NT_OR_ASGN ||
    t === NT_AND_ASGN
  );
};

/** Node#variable?. */
export const rbNodeVariable = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_IVAR || t === NT_GVAR || t === NT_CVAR || t === NT_LVAR;
};

/** The child nodes of n. */
const rbIcbChildNodes = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (!src.a.isNode(n)) {
    return out;
  }
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (src.a.isNode(src.a.kid(n, i))) {
      out.push(src.a.kid(n, i));
    }
  }
  return out;
};

export class CopStyleIdenticalConditionalBranches {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/IdenticalConditionalBranches");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      const branches: i32[] = [];
      if (t === NT_IF) {
        if (scnElsif(src, n)) {
          continue;
        }
        branches.push(scnIfBranch(src, n));
        // expand_elses
        let b = scnElseBranch(src, n);
        while (true) {
          if (b === V_NIL) {
            branches.push(V_NIL);
            break;
          }
          if (ssxIs(src, b, NT_IF)) {
            branches.push(a.kid(b, 1));
            b = a.kid(b, 2);
            continue;
          }
          branches.push(b);
          break;
        }
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        const els = a.kid(n, -1);
        if (!ssxHas(src, n, F_ELSE) || els === V_NIL) {
          continue;
        }
        for (let i = 1; i < a.nKid(n) - 1; i++) {
          const w = a.kid(n, i);
          if (ssxIs(src, w, NT_WHEN)) {
            branches.push(a.kid(w, -1));
          } else if (ssxIs(src, w, NT_IN_PATTERN)) {
            branches.push(a.kid(w, 2));
          }
        }
        branches.push(els);
      } else {
        continue;
      }
      this.check(src, n, branches);
    }
  }

  private check(src: RbSource, n: i32, branches: i32[]): void {
    const a = src.a;
    for (const b of branches) {
      if (b === V_NIL) {
        return;
      }
    }
    const tails: i32[] = [];
    const heads: i32[] = [];
    for (const b of branches) {
      const isBegin = ssxIs(src, b, NT_BEGIN);
      tails.push(isBegin ? a.kid(b, -1) : b);
      heads.push(isBegin ? a.kid(b, 0) : b);
    }
    const dt = this.duplicated(src, n, tails);
    if (dt < 0) {
      return;
    }
    if (dt > 0) {
      this.offenses(src, tails);
    }
    // last_child_of_parent? && a single-child branch
    const p = src.parent(n);
    let lastChild = true;
    if (p !== V_NIL) {
      const kids = rbIcbChildNodes(src, p);
      lastChild = kids.length > 0 && vfSameNode(src, kids[kids.length - 1], n);
    }
    if (lastChild) {
      for (const b of branches) {
        if (!ssxIs(src, b, NT_BEGIN) || a.nKid(b) === 1) {
          return;
        }
      }
    }
    if (this.duplicated(src, n, heads) <= 0) {
      return;
    }
    // assignable_condition_value
    const cond = a.kid(n, 0);
    if (cond === V_NIL) {
      // node.condition.call_type? raises on a case without a subject
      return;
    }
    let condVar = "";
    let hasCondVar = false;
    if (ssxIs(src, cond, NT_SEND) || ssxIs(src, cond, NT_CSEND)) {
      const r = a.kid(cond, 0);
      condVar = r !== V_NIL ? src.nodeSrc(r) : src.nodeSrc(cond);
      hasCondVar = true;
    } else if (rbNodeVariable(src, cond)) {
      condVar = src.nodeSrc(cond);
      hasCondVar = true;
    }
    const head = heads[0];
    if (rbNodeAssignment(src, head) && hasCondVar) {
      const ht = a.type(head);
      // node_parts[0].to_s: a variable's name; a casgn's scope; a node's s-expression otherwise
      let assigned = "";
      let named = false;
      if (ht === NT_SEND) {
        // head.receiver.source
        const hr = a.kid(head, 0);
        assigned = hr !== V_NIL ? src.nodeSrc(hr) : "";
        named = hr !== V_NIL;
      } else if (ht === NT_LVASGN || ht === NT_IVASGN || ht === NT_CVASGN || ht === NT_GVASGN) {
        assigned = a.text(a.kid(head, 0));
        named = true;
      } else if (ht === NT_CASGN && a.kid(head, 0) === V_NIL) {
        named = true;
      }
      if (named && condVar === assigned) {
        return;
      }
    }
    this.offenses(src, heads);
  }

  /** duplicated_expressions?: 1 true, 0 false, -1 an error (the case has no subject). */
  private duplicated(src: RbSource, n: i32, xs: i32[]): i32 {
    const a = src.a;
    if (xs.length === 0) {
      return 0;
    }
    for (const x of xs) {
      if (!vfSameNode(src, x, xs[0])) {
        return 0;
      }
    }
    const u = xs[0];
    if (!rbNodeAssignment(src, u)) {
      return 1;
    }
    const lk = rbIcbChildNodes(src, u);
    const cond = a.kid(n, 0);
    if (!a.isNode(cond)) {
      return -1;
    }
    if (lk.length === 0) {
      // lhs.source on nil raises (only when a variable is compared)
      for (const c of rbIcbChildNodes(src, cond)) {
        if (rbNodeVariable(src, c)) {
          return -1;
        }
      }
      return 1;
    }
    const lhs = src.nodeSrc(lk[0]);
    for (const c of rbIcbChildNodes(src, cond)) {
      if (rbNodeVariable(src, c) && src.nodeSrc(c) === lhs) {
        return 0;
      }
    }
    return 1;
  }

  /** check_expressions: an offense at each expression. */
  private offenses(src: RbSource, xs: i32[]): void {
    for (const x of xs) {
      if (x === V_NIL) {
        return;
      }
    }
    for (const x of xs) {
      this.c.note(src.a.exS(x), src.a.exE(x));
    }
  }
}
