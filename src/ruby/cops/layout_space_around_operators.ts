// Layout/SpaceAroundOperators (AllowForAlignment: true, exponent and
// rational literals without spaces) and Layout/SpaceBeforeFirstArg
// (AllowForAlignment: true), on PrecedingFollowingAlignment.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ASSIGNMENT,
  F_ASSOC,
  F_COLON,
  F_DOT,
  F_END,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_AND_ASGN,
  NT_CASGN,
  NT_CLASS,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_GVASGN,
  NT_IF,
  NT_INT,
  NT_IVASGN,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_ALT,
  NT_MATCH_AS,
  NT_MATCH_PATTERN,
  NT_OP_ASGN,
  NT_OR,
  NT_OR_ASGN,
  NT_PAIR,
  NT_RATIONAL,
  NT_RESBODY,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { rnE, rnFieldSrc, rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import { LSP_AL_NONE, LSP_AL_YES, LspAlign } from "./layout_space_align";
import { LspToks, lspIsWs } from "./layout_space_help";
import { lspOperatorMethod, lspUnaryOperation } from "./layout_space_misc";

// check_operator types that matter.
const LSP_OP_OTHER: i32 = 0;
const LSP_OP_PAIR: i32 = 1;
const LSP_OP_ASSIGNMENT: i32 = 2;

export class CopLayoutSpaceAroundOperators {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAroundOperators");
    this.commentCol = new Map<i32, i32>();
  }

  al: LspAlign | null = null;
  // comment_at_line: the column of the last comment starting on a line.
  commentCol: Map<i32, i32>;

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    this.al = new LspAlign(src, new LspToks(src));
    this.commentCol = new Map<i32, i32>();
    for (let i = 0; i < toI32(src.commS.length); i++) {
      this.commentCol.set(src.line(src.commS[i]), src.column(src.commS[i]));
    }
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SCLASS) {
        this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, n);
      } else if (t === NT_PAIR) {
        if (rnFieldSrc(src, n, F_OPERATOR) === "=>") {
          this.checkOp(src, LSP_OP_PAIR, n, F_OPERATOR, n);
        }
      } else if (t === NT_IF) {
        if (rnHas(src, n, F_QUESTION)) {
          this.checkOp(src, LSP_OP_OTHER, n, F_QUESTION, a.kid(n, 1));
          this.checkOp(src, LSP_OP_OTHER, n, F_COLON, a.kid(n, 2));
        }
      } else if (t === NT_RESBODY) {
        if (rnHas(src, n, F_ASSOC)) {
          this.checkOp(src, LSP_OP_OTHER, n, F_ASSOC, a.kid(n, 1));
        }
      } else if (t === NT_SEND) {
        this.onSend(src, n);
      } else if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_MASGN || t === NT_OR_ASGN || t === NT_AND_ASGN) {
        const rhs = a.kid(n, 1);
        if (rhs !== V_NIL) {
          this.checkOp(src, LSP_OP_ASSIGNMENT, n, F_OPERATOR, rhs);
        }
      } else if (t === NT_CASGN) {
        const rhs = a.kid(n, 2);
        if (rhs !== V_NIL) {
          this.checkOp(src, LSP_OP_ASSIGNMENT, n, F_OPERATOR, rhs);
        }
      } else if (t === NT_OP_ASGN) {
        const rhs = a.kid(n, -1);
        if (rhs !== V_NIL) {
          this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, rhs);
        }
      } else if (t === NT_CLASS) {
        const rhs = a.kid(n, 1);
        if (rhs !== V_NIL) {
          this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, rhs);
        }
      } else if (t === NT_DEF || t === NT_DEFS) {
        if (!rnHas(src, n, F_END) && rnHas(src, n, F_ASSIGNMENT)) {
          this.checkOp(src, LSP_OP_ASSIGNMENT, n, F_ASSIGNMENT, a.kid(n, -1));
        }
      } else if (t === NT_OR || t === NT_AND) {
        const rhs = a.kid(n, 1);
        if (rhs !== V_NIL) {
          this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, rhs);
        }
      } else if (t === NT_MATCH_PATTERN || t === NT_MATCH_ALT || t === NT_MATCH_AS) {
        this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    const m = rnMethod(src, n);
    // rational_literal?: (send (int _) :/ (rational _))
    const recv = a.kid(n, 0);
    if (m === "/" && a.nKid(n) === 3 && a.isNode(recv) && a.type(recv) === NT_INT && a.isNode(a.kid(n, 2)) && a.type(a.kid(n, 2)) === NT_RATIONAL) {
      return;
    }
    if (rnHas(src, n, F_OPERATOR)) {
      const rhs = a.kid(n, 2);
      if (rhs !== V_NIL) {
        this.checkOp(src, LSP_OP_OTHER, n, F_OPERATOR, rhs);
      }
      return;
    }
    // regular_operator?
    if (lspUnaryOperation(src, n)) {
      return;
    }
    if (rnHas(src, n, F_DOT)) {
      const d = rnFieldSrc(src, n, F_DOT);
      if (d === "." || d === "::") {
        return;
      }
    }
    if (!lspOperatorMethod(m) || m === "[]" || m === "!" || m === "[]=") {
      return;
    }
    this.checkOp(src, LSP_OP_OTHER, n, F_SELECTOR, a.kid(n, 2));
  }

  private checkOp(src: RbSource, type: i32, n: i32, f: i32, right: i32): void {
    const al = this.al;
    if (al === null || !rnHas(src, n, f)) {
      return;
    }
    const a = src.a;
    const os = rnS(src, n, f);
    const oe = rnE(src, n, f);
    const ws = rbSpaceBegin(src, os, 0, true, false, false);
    const we = rbSpaceEnd(src, oe, 0, true, false, false);
    if (src.at(ws) === 10) {
      return;
    }
    const line = src.line(os);
    if (src.column(we) === (this.commentCol.get(line) ?? -1)) {
      return;
    }
    const op = src.src(os, oe);
    const rational = right !== V_NIL && a.isNode(right) && a.type(right) === NT_RATIONAL;
    let offense = false;
    if (op === "**" || (op === "/" && rational)) {
      offense = !(ws === os && we === oe);
    } else {
      const startWs = lspIsWs(src.at(ws));
      const endWs = lspIsWs(src.at(we - 1));
      let missing = false;
      if (!(startWs && endWs && we - ws >= 2)) {
        missing = !startWs || !(src.at(we) === 92 && src.at(we + 1) === 10);
      }
      offense = missing || this.excessLeading(src, type, os, oe, ws, right) || this.excessTrailing(src, ws, we, right);
    }
    if (!offense) {
      return;
    }
    const k = this.c.offense(os, oe);
    if (k === null) {
      return;
    }
    if (op === "**") {
      k.replace(ws, we, "**");
    } else if (op === "/" && rational) {
      k.replace(ws, we, "/");
    } else if (src.at(we - 1) === 10) {
      k.replace(ws, we, ` ${op}\n`);
    } else {
      k.replace(ws, we, ` ${op} `);
    }
    this.c.commit(k);
  }

  private excessLeading(src: RbSource, type: i32, os: i32, oe: i32, ws: i32, right: i32): boolean {
    const al = this.al;
    if (al === null) {
      return false;
    }
    if (!(src.at(ws) === 32 && src.at(ws + 1) === 32)) {
      return false;
    }
    if (type !== LSP_OP_ASSIGNMENT) {
      if (al.withOperator(os, oe)) {
        return false;
      }
      return !(type === LSP_OP_PAIR && this.anotherHashRocket(src, right));
    }
    if (al.withEqualsSign(os, oe, -1) === LSP_AL_YES) {
      return false;
    }
    const sub = al.withEqualsSign(os, oe, 1);
    if (sub === LSP_AL_NONE) {
      return false;
    }
    return sub !== LSP_AL_YES;
  }

  private excessTrailing(src: RbSource, ws: i32, we: i32, right: i32): boolean {
    const al = this.al;
    if (al === null) {
      return false;
    }
    if (!(we - ws >= 2 && src.at(we - 1) === 32 && src.at(we - 2) === 32)) {
      return false;
    }
    return !al.withSomething(src.a.exS(right), src.a.exE(right));
  }

  /** aligned_with_another_hash_rocket?(pair) */
  private anotherHashRocket(src: RbSource, pair: i32): boolean {
    const a = src.a;
    const h = src.parent(pair);
    if (h === V_NIL) {
      return false;
    }
    const col = src.column(rnS(src, pair, F_OPERATOR));
    let count = 0;
    for (let i = 0; i < a.nKid(h); i++) {
      const p = a.kid(h, i);
      if (a.isNode(p) && a.type(p) === NT_PAIR && rnFieldSrc(src, p, F_OPERATOR) === "=>" && src.column(rnS(src, p, F_OPERATOR)) === col) {
        count++;
      }
    }
    return count > 1;
  }
}

export class CopLayoutSpaceBeforeFirstArg {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceBeforeFirstArg");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    let al: LspAlign | null = null;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_SEND && t !== NT_CSEND) {
        continue;
      }
      if (a.nKid(n) <= 2 || lspOperatorMethod(rnMethod(src, n)) || rnHas(src, n, F_OPERATOR)) {
        continue;
      }
      if (rnHas(src, n, F_END) && rnFieldSrc(src, n, F_END) === ")") {
        continue;
      }
      const arg = a.kid(n, 2);
      const fs = a.exS(arg);
      const wb = rbSpaceBegin(src, fs, 1, true, false, false);
      if (fs - wb === 1) {
        continue;
      }
      // expect_params_after_method_name?
      if (!(rnHas(src, n, F_SELECTOR) && rnE(src, n, F_SELECTOR) === fs)) {
        if (src.line(fs) !== src.line(a.exS(n))) {
          continue;
        }
        const al2 = al === null ? new LspAlign(src, new LspToks(src)) : al;
        al = al2;
        if (al2.withSomething(fs, a.exE(arg))) {
          continue;
        }
      }
      const k = this.c.offense(wb, fs);
      if (k !== null) {
        k.replace(wb, fs, " ");
        this.c.commit(k);
      }
    }
  }
}
