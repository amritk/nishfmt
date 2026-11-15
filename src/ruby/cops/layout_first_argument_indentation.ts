// Layout/FirstArgumentIndentation (EnforcedStyle:
// special_for_inner_method_call_in_parentheses).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_END, F_OPERATOR, NT_CSEND, NT_KWSPLAT, NT_SEND, NT_SPLAT, NT_SUPER, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalArgs, lalBeginsItsLine, lalFirstLine, lalIsStripWs, lalIsWs, lalMethod, lalOperatorMethod, lalParentheses } from "./layout_align_help";
import { RbLayLines } from "./layout_empty_help";

export class CopLayoutFirstArgumentIndentation {
  c: RbCop;
  al: LalAligner;
  // comment_lines: the lines of comments that begin their line.
  commentLines: Set<i32>;

  constructor() {
    this.c = new RbCop("Layout/FirstArgumentIndentation");
    this.al = new LalAligner();
    this.commentLines = new Set<i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    this.commentLines = new Set<i32>();
    for (let i = 0; i < toI32(src.commS.length); i++) {
      if (lalBeginsItsLine(src, src.commS[i])) {
        this.commentLines.add(src.line(src.commS[i]));
      }
    }
    const L = new RbLayLines(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_SEND && t !== NT_CSEND && t !== NT_SUPER) {
        continue;
      }
      const args = lalArgs(src, n);
      if (args.length === 0) {
        continue;
      }
      // bare_operator?: an operator method without a `.`
      if (lalOperatorMethod(lalMethod(src, n)) && !this.dot(src, n)) {
        continue;
      }
      if (t !== NT_SUPER && rnHas(src, n, F_OPERATOR)) {
        continue; // setter_method?
      }
      const first = args[0];
      if (lalFirstLine(src, n) === lalFirstLine(src, first)) {
        continue;
      }
      const indent = this.baseIndentation(src, L, n, first) + 2;
      // check_alignment([first], indent)
      const s = a.exS(first);
      if (!lalBeginsItsLine(src, s)) {
        continue;
      }
      const delta = indent - this.al.dispCol(src, s);
      if (delta === 0) {
        continue;
      }
      const e = a.exE(first);
      if (this.al.withinOffense(this.c, s, e)) {
        this.c.offense(s, e);
        continue;
      }
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      // autocorrect
      const send = src.parent(first);
      let top = send;
      while (true) {
        const p = src.parent(top);
        if (p !== V_NIL && a.type(p) === NT_SEND && a.kid(p, 0) === top && rnHas(src, p, F_DOT)) {
          top = p;
        } else {
          break;
        }
      }
      let target = first;
      // should_correct_entire_chain?
      const outer = src.parent(top);
      if (outer !== V_NIL && a.type(outer) === NT_SEND && lalParentheses(src, outer)) {
        const ad = delta < 0 ? -delta : delta;
        if (this.al.dispCol(src, a.exS(send)) < ad && delta <= 0) {
          if (top !== send) {
            target = top;
          } else if (!rnHas(src, top, F_END)) {
            continue; // begins_its_line?(nil): RuboCop raises
          } else if (lalBeginsItsLine(src, rnS(src, top, F_END))) {
            target = top;
          }
        }
      }
      this.al.correct(src, k, a.exS(target), a.exE(target), delta, target);
      this.c.commit(k);
    }
  }

  /** MethodDispatchNode#dot?. */
  private dot(src: RbSource, n: i32): boolean {
    if (!rnHas(src, n, F_DOT)) {
      return false;
    }
    const s = rnS(src, n, F_DOT);
    return rnE(src, n, F_DOT) === s + 1 && src.at(s) === 46;
  }

  /** special_inner_call_indentation?. */
  private special(src: RbSource, n: i32): boolean {
    const a = src.a;
    const p = src.parent(n);
    if (p === V_NIL || a.type(p) !== NT_SEND || lalMethod(src, p) === "[]=") {
      return false;
    }
    if (!lalParentheses(src, p)) {
      return false;
    }
    return a.exS(n) > a.exS(p);
  }

  private baseIndentation(src: RbSource, L: RbLayLines, n: i32, first: i32): i32 {
    const a = src.a;
    if (this.special(src, n)) {
      // column_of(base_range(node, first_argument))
      const p = src.parent(n);
      const start = p !== V_NIL && (a.type(p) === NT_SPLAT || a.type(p) === NT_KWSPLAT) ? a.exS(p) : a.exS(n);
      const end = a.exS(first);
      let s = start;
      let e = end;
      while (s < e && lalIsStripWs(src.pts[s])) {
        s++;
      }
      while (e > s && lalIsStripWs(src.pts[e - 1])) {
        e--;
      }
      let nl = 0;
      for (let q = s; q < e; q++) {
        if (src.pts[q] === 10) {
          nl++;
        }
      }
      if (nl > 0) {
        return this.firstNonWs(src, L, this.previousCodeLine(L, src.line(start) + nl + 1));
      }
      return this.al.dispCol(src, start);
    }
    return this.firstNonWs(src, L, this.previousCodeLine(L, lalFirstLine(src, first)));
  }

  /** previous_code_line: the 0-based index into processed_source.lines (Ruby indexing). */
  private previousCodeLine(L: RbLayLines, line0: i32): i32 {
    let ln = line0;
    let blank = true;
    let guard = 0;
    while (blank || this.commentLines.has(ln)) {
      ln -= 1;
      blank = L.blank(ln - 1) || !L.has(ln - 1);
      guard++;
      if (guard > 100000) {
        break;
      }
    }
    return ln - 1;
  }

  /** `line =~ /\S/` of lines[i]. */
  private firstNonWs(src: RbSource, L: RbLayLines, i: i32): i32 {
    const j = L.idx(i);
    if (j < 0) {
      return 0;
    }
    let p = L.s[j];
    while (p < L.e[j] && lalIsWs(src.pts[p])) {
      p++;
    }
    return p - L.s[j];
  }
}
