// Layout/ClosingParenthesisIndentation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32, sub32 } from "../../core/arr";
import { F_BEGIN, F_END, NT_BEGIN, NT_CSEND, NT_DEF, NT_DEFS, NT_HASH, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalArgs, lalBeginsItsLine, lalIsType, lalLineIndentation } from "./layout_align_help";

export class CopLayoutClosingParenthesisIndentation {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/ClosingParenthesisIndentation");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND || t === NT_CSEND) {
        this.check(src, n, lalArgs(src, n));
      } else if (t === NT_BEGIN) {
        const els: i32[] = [];
        for (let i = 0; i < a.nKid(n); i++) {
          els.push(a.kid(n, i));
        }
        this.check(src, n, els);
      } else if (t === NT_DEF || t === NT_DEFS) {
        const args = a.kid(n, t === NT_DEF ? 1 : 2);
        if (args !== V_NIL) {
          this.check(src, args, lalArgs(src, n));
        }
      }
    }
  }

  private check(src: RbSource, node: i32, els: i32[]): void {
    const a = src.a;
    if (!rnHas(src, node, F_END)) {
      return;
    }
    const rp = rnS(src, node, F_END);
    if (!lalBeginsItsLine(src, rp)) {
      return;
    }
    const lp = rnS(src, node, F_BEGIN);
    let correct = 0;
    if (els.length === 0) {
      // check_for_no_elements
      const c1 = lalLineIndentation(src, src.line(lp));
      const c2 = src.column(lp);
      const c3 = src.column(a.exS(node));
      const rc = src.column(rp);
      if (rc === c1 || rc === c2 || rc === c3) {
        return;
      }
      correct = c1;
    } else {
      const first = atI32(els, 0);
      const firstLine = src.line(a.exS(first));
      if (firstLine > src.line(lp)) {
        const ind = sub32(lalLineIndentation(src, firstLine), 2);
        correct = ind < 0 ? 0 : ind;
      } else if (this.allAligned(src, els)) {
        correct = src.column(lp);
      } else {
        correct = lalLineIndentation(src, firstLine);
      }
    }
    const delta = sub32(correct, src.column(rp));
    if (delta === 0) {
      return;
    }
    const re = add32(rp, 1);
    const k = this.c.offense(rp, re);
    if (k !== null) {
      this.al.correct(src, k, rp, re, delta, V_NIL);
      this.c.commit(k);
    }
  }

  /** all_elements_aligned?: the elements' (or the first hash's children's) columns are one. */
  private allAligned(src: RbSource, els: i32[]): boolean {
    const a = src.a;
    const cols: i32[] = [];
    const e0 = atI32(els, 0);
    if (lalIsType(src, e0, NT_HASH)) {
      for (let i = 0; i < a.nKid(e0); i++) {
        const ch = a.kid(e0, i);
        if (a.isNode(ch)) {
          cols.push(src.column(a.exS(ch)));
        }
      }
    } else {
      for (const e of els) {
        cols.push(src.column(a.exS(e)));
      }
    }
    if (cols.length === 0) {
      return false;
    }
    const c0 = atI32(cols, 0);
    for (const c of cols) {
      if (c !== c0) {
        return false;
      }
    }
    return true;
  }
}
