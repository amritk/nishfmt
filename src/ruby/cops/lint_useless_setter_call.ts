// Lint/UselessSetterCall (unsafe; detection only): a method that ends with a
// setter call on a local variable holding an object it made itself.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_NAME,
  F_OPERATOR,
  NT_AND_ASGN,
  NT_ARRAY,
  NT_BEGIN,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_GVASGN,
  NT_IVASGN,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhAssignmentMethod, ldhLiteral, ldhType, ldhVariable } from "./lint_detect_help";
import { ssxDefBody, ssxDefName, ssxFE, ssxFS, ssxHas, ssxMeth } from "./style_syntax_help";

/** ASSIGNMENT_TYPES. */
const lusc = (t: i32): boolean => t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN;

/** MethodVariableTracker: which variables hold an object the method made. */
class LuscTracker {
  src: RbSource;
  local: Map<string, boolean>;

  constructor(src: RbSource, body: i32) {
    this.src = src;
    this.local = new Map<string, boolean>();
    this.scan(body);
  }

  private scan(n: i32): void {
    const a = this.src.a;
    if (!this.process(n)) {
      return;
    }
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (a.isNode(k)) {
        this.scan(k);
      }
    }
  }

  /** process_assignment_node: false to skip the children (throw :skip_children). */
  private process(n: i32): boolean {
    const a = this.src.a;
    const t = a.type(n);
    if (t === NT_MASGN) {
      const lhs = a.kid(n, 0);
      const rhs = a.kid(n, 1);
      for (let i = 0; i < a.nKid(lhs); i++) {
        const l = a.kid(lhs, i);
        if (!lusc(ldhType(this.src, l))) {
          continue;
        }
        const r = ldhType(this.src, rhs) === NT_ARRAY && i < a.nKid(rhs) ? a.kid(rhs, i) : V_NIL;
        if (r !== V_NIL) {
          this.assign(l, r);
        } else {
          this.local.set(a.text(a.kid(l, 0)), true);
        }
      }
      return false;
    }
    if (t === NT_OR_ASGN || t === NT_AND_ASGN) {
      const lhs = a.kid(n, 0);
      if (!lusc(ldhType(this.src, lhs))) {
        return true;
      }
      this.assign(lhs, a.kid(n, 1));
      return false;
    }
    if (t === NT_OP_ASGN) {
      const lhs = a.kid(n, 0);
      if (!lusc(ldhType(this.src, lhs))) {
        return true;
      }
      this.local.set(a.text(a.kid(lhs, 0)), true);
      return false;
    }
    if (lusc(t) && a.kid(n, 1) !== V_NIL) {
      this.assign(n, a.kid(n, 1));
    }
    return true;
  }

  /** process_assignment. */
  private assign(asgn: i32, rhs: i32): void {
    const a = this.src.a;
    const name = a.text(a.kid(asgn, 0));
    if (ldhVariable(this.src, rhs)) {
      this.local.set(name, this.local.get(a.text(a.kid(rhs, 0))) ?? false);
      return;
    }
    // constructor?
    const ctor = ldhLiteral(this.src, rhs) || (ldhType(this.src, rhs) === NT_SEND && ssxMeth(this.src, rhs) === "new");
    this.local.set(name, ctor);
  }
}

export class CopLintUselessSetterCall {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UselessSetterCall");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const body = ssxDefBody(src, n);
      if (body === V_NIL) {
        continue;
      }
      // void_context?
      const name = ssxDefName(src, n);
      if ((t === NT_DEF && name === "initialize") || ldhAssignmentMethod(name)) {
        continue;
      }
      const last = ldhType(src, body) === NT_BEGIN ? a.kid(body, -1) : body;
      // [(send (lvar _) ...) setter_method?]
      if (ldhType(src, last) !== NT_SEND || ldhType(src, a.kid(last, 0)) !== NT_LVAR || !ssxHas(src, last, F_OPERATOR)) {
        continue;
      }
      const recv = a.kid(last, 0);
      const tr = new LuscTracker(src, body);
      if (!(tr.local.get(a.text(a.kid(recv, 0))) ?? false)) {
        continue;
      }
      this.c.offense(ssxFS(src, recv, F_NAME), ssxFE(src, recv, F_NAME));
    }
  }
}
