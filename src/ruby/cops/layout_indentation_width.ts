// Layout/IndentationWidth (Width: 2, EnforcedStyleAlignWith: start_of_line,
// AllowedPatterns: []), with Layout/EndAlignment's keyword style and
// Layout/DefEndAlignment's start_of_line style.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_END,
  F_KEYWORD,
  F_QUESTION,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CLASS,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_EMPTY_ELSE,
  NT_ENSURE,
  NT_FOR,
  NT_IF,
  NT_KWBEGIN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_RESBODY,
  NT_RESCUE,
  NT_SCLASS,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import {
  LalAligner,
  LalIgnored,
  lalBareAccessModifier,
  lalBeginsItsLine,
  lalCheckAsgnType,
  lalEffCol,
  lalExtractRhs,
  lalFirstLine,
  lalFirstNonWs,
  lalFirstPartOfCallChain,
  lalIsType,
  lalParentheses,
  lalWithin,
} from "./layout_align_help";

export class CopLayoutIndentationWidth {
  c: RbCop;
  al: LalAligner;
  ign: LalIgnored;
  // @offense_ranges (other_offense_in_same_range?).
  rangeS: i32[];
  rangeE: i32[];

  constructor() {
    this.c = new RbCop("Layout/IndentationWidth");
    this.al = new LalAligner();
    this.ign = new LalIgnored();
    this.rangeS = [];
    this.rangeE = [];
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    this.ign.reset();
    const r1: i32[] = [];
    const r2: i32[] = [];
    this.rangeS = r1;
    this.rangeE = r2;
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_RESCUE) {
        if (rnHas(src, n, F_ELSE)) {
          this.checkIndentation(src, rnS(src, n, F_ELSE), a.kid(n, -1));
        }
      } else if (t === NT_RESBODY || t === NT_FOR) {
        this.checkIndentation(src, rnS(src, n, F_KEYWORD), a.kid(n, 2));
      } else if (t === NT_ENSURE) {
        this.checkIndentation(src, rnS(src, n, F_KEYWORD), a.kid(n, 1));
      } else if (t === NT_KWBEGIN) {
        const e = rnS(src, n, F_END);
        if (lalBeginsItsLine(src, e)) {
          this.checkIndentation(src, e, a.kid(n, 0));
        }
      } else if (t === NT_BEGIN) {
        if (lalParentheses(src, n) && lalBeginsItsLine(src, rnS(src, n, F_END))) {
          const l = src.line(rnS(src, n, F_BEGIN));
          this.checkIndentation(src, src.lineStart(l) + lalFirstNonWs(src, l), a.kid(n, 0));
        }
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        const e = rnS(src, n, F_END);
        if (lalBeginsItsLine(src, e)) {
          this.checkIndentation(src, e, a.kid(n, 2));
        }
      } else if (t === NT_CLASS || t === NT_SCLASS || t === NT_MODULE) {
        const base = rnS(src, n, F_KEYWORD);
        const body = a.kid(n, t === NT_CLASS ? 2 : 1);
        if (body !== V_NIL && src.line(base) === lalFirstLine(src, body)) {
          continue;
        }
        this.checkMembers(src, base, body);
      } else if (t === NT_SEND || t === NT_CSEND) {
        this.checkAssignment(src, n);
        this.onSendDefModifier(src, n);
      } else if (t === NT_DEF || t === NT_DEFS) {
        if (!this.ign.has(n)) {
          this.checkIndentation(src, rnS(src, n, F_KEYWORD), a.kid(n, t === NT_DEF ? 2 : 3));
        }
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        this.onWhile(src, n, n);
      } else if (t === NT_CASE) {
        const k = a.nKid(n);
        for (let i = 1; i < k - 1; i++) {
          const w = a.kid(n, i);
          this.checkIndentation(src, rnS(src, w, F_KEYWORD), a.kid(w, -1));
        }
        if (k >= 3) {
          this.checkIndentation(src, rnS(src, a.kid(n, k - 2), F_KEYWORD), a.kid(n, k - 1));
        }
      } else if (t === NT_CASE_MATCH) {
        const k = a.nKid(n);
        for (let i = 1; i < k - 1; i++) {
          const w = a.kid(n, i);
          this.checkIndentation(src, rnS(src, w, F_KEYWORD), a.kid(w, -1));
        }
        if (k >= 3) {
          let el = a.kid(n, k - 1);
          if (lalIsType(src, el, NT_EMPTY_ELSE)) {
            el = V_NIL;
          }
          this.checkIndentation(src, rnS(src, a.kid(n, k - 2), F_KEYWORD), el);
        }
      } else if (t === NT_IF) {
        this.onIf(src, n, n);
      }
      if (t !== NT_SEND && lalCheckAsgnType(t)) {
        this.checkAssignment(src, n);
      }
    }
  }

  /** IfNode#unless?. */
  private unless(src: RbSource, n: i32): boolean {
    return !rnHas(src, n, F_QUESTION) && rnHas(src, n, F_KEYWORD) && rnE(src, n, F_KEYWORD) - rnS(src, n, F_KEYWORD) === 6;
  }

  /** The keyword of an if node is `elsif`. */
  private elsif(src: RbSource, n: i32): boolean {
    if (rnHas(src, n, F_QUESTION) || !rnHas(src, n, F_KEYWORD)) {
      return false;
    }
    const s = rnS(src, n, F_KEYWORD);
    return rnE(src, n, F_KEYWORD) - s === 5 && src.src(s, s + 5) === "elsif";
  }

  private onIf(src: RbSource, n: i32, base: i32): void {
    const a = src.a;
    if (this.ign.has(n)) {
      return;
    }
    if (rnHas(src, n, F_QUESTION)) {
      return; // ternary
    }
    // modifier_form?: an `if`/`unless` without `end`
    const s = rnS(src, n, F_KEYWORD);
    const kwl = rnE(src, n, F_KEYWORD) - s;
    const ifOrUnless = (kwl === 2 && src.src(s, s + 2) === "if") || kwl === 6;
    if (ifOrUnless && !rnHas(src, n, F_END)) {
      return;
    }
    const un = this.unless(src, n);
    const body = un ? a.kid(n, 2) : a.kid(n, 1);
    const els = un ? a.kid(n, 1) : a.kid(n, 2);
    this.checkIndentation(src, a.exS(base), body);
    if (els === V_NIL) {
      return;
    }
    if (lalIsType(src, els, NT_IF) && this.elsif(src, els)) {
      return;
    }
    this.checkIndentation(src, rnS(src, n, F_ELSE), els);
  }

  private onWhile(src: RbSource, n: i32, base: i32): void {
    if (this.ign.has(n)) {
      return;
    }
    // single_line_condition?
    if (src.line(rnS(src, n, F_KEYWORD)) !== lalFirstLine(src, src.a.kid(n, 0))) {
      return;
    }
    this.checkIndentation(src, src.a.exS(base), src.a.kid(n, 1));
  }

  /** CheckAssignment#on_* with IndentationWidth#check_assignment. */
  private checkAssignment(src: RbSource, n: i32): void {
    const a = src.a;
    const rhs0 = lalExtractRhs(src, n);
    if (rhs0 === V_NIL || !a.isNode(rhs0)) {
      return;
    }
    const rhs = lalFirstPartOfCallChain(src, rhs0);
    if (rhs === V_NIL || !a.isNode(rhs)) {
      return;
    }
    const t = a.type(rhs);
    if (t === NT_IF) {
      this.onIf(src, rhs, rhs);
    } else if (t === NT_WHILE || t === NT_UNTIL) {
      this.onWhile(src, rhs, rhs);
    } else {
      return;
    }
    this.ign.add(rhs);
  }

  /** The adjacent_def_modifier? part of on_send. */
  private onSendDefModifier(src: RbSource, n: i32): void {
    const a = src.a;
    if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) !== 3) {
      return;
    }
    const d = a.kid(n, 2);
    if (!lalIsType(src, d, NT_DEF) && !lalIsType(src, d, NT_DEFS)) {
      return;
    }
    // leftmost_modifier_of
    let base = n;
    while (true) {
      const p = src.parent(base);
      if (p !== V_NIL && a.type(p) === NT_SEND) {
        base = p;
      } else {
        break;
      }
    }
    this.checkIndentation(src, a.exS(base), a.kid(d, a.type(d) === NT_DEF ? 2 : 3));
    this.ign.add(d);
  }

  private checkMembers(src: RbSource, base: i32, member: i32): void {
    const a = src.a;
    // select_check_member
    let sel = member;
    if (member !== V_NIL) {
      const f = a.kid(member, 0);
      if (a.isNode(f) && lalBareAccessModifier(src, f)) {
        sel = f;
      }
    }
    this.checkIndentation(src, base, sel);
    if (member === V_NIL || a.type(member) !== NT_BEGIN) {
      return;
    }
    for (let i = 0; i < a.nKid(member); i++) {
      const m = a.kid(member, i);
      if (lalBareAccessModifier(src, m)) {
        continue;
      }
      this.checkIndentation(src, base, m);
    }
  }

  /** check_indentation: `base` is the position of the base range (or map's expression). */
  private checkIndentation(src: RbSource, base: i32, body: i32): void {
    const a = src.a;
    if (body === V_NIL || !a.isNode(body) || base < 0) {
      return;
    }
    // skip_check?
    const bs = a.exS(body);
    if (src.line(bs) === src.line(base)) {
      return;
    }
    if (a.type(body) === NT_BEGIN) {
      const f = a.kid(body, 0);
      if (a.isNode(f) && lalBareAccessModifier(src, f)) {
        return;
      }
    }
    if (src.column(bs) !== lalFirstNonWs(src, src.line(bs))) {
      return;
    }
    // indentation_to_check?
    const bt = a.type(body);
    if (bt === NT_RESCUE) {
      if (a.kid(body, 0) === V_NIL) {
        return;
      }
    } else if (bt === NT_ENSURE) {
      const bb = a.kid(body, 0);
      if (lalIsType(src, bb, NT_RESCUE)) {
        if (a.kid(bb, 0) === V_NIL) {
          return;
        }
      } else if (bb === V_NIL) {
        return;
      }
    }
    const indentation = lalEffCol(src, bs) - lalEffCol(src, base);
    const delta = 2 - indentation;
    if (delta === 0) {
      return;
    }
    // offense
    let bn = body;
    if (bt === NT_BEGIN && !lalParentheses(src, body)) {
      bn = a.kid(body, 0);
    }
    const ns = a.exS(bn);
    const ne = a.exE(bn);
    let other = false;
    for (let i = 0; i < toI32(this.rangeS.length); i++) {
      if (lalWithin(ns, ne, this.rangeS[i], this.rangeE[i])) {
        other = true;
        break;
      }
    }
    if (!other) {
      this.rangeS.push(ns);
      this.rangeE.push(ne);
    }
    const ind = ns - indentation;
    const rs = ind <= ns ? ind : ns;
    const re = ind <= ns ? ns : ind;
    const k = this.c.offense(rs, re);
    if (k !== null) {
      if (!other) {
        this.al.correct(src, k, ns, ne, delta, bn);
      }
      this.c.commit(k);
    }
  }
}
