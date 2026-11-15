// Layout/EmptyLineBetweenDefs (method, class and module defs; DefLikeMacros
// empty; AllowAdjacentOneLineDefs: true; NumberOfEmptyLines: 1).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_END, F_KEYWORD, F_NAME, NT_BEGIN, NT_CLASS, NT_DEF, NT_DEFS, NT_DSTR, NT_MODULE, NT_STR, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";

const rbBetweenDefsCandidate = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_DEF || t === NT_DEFS || t === NT_CLASS || t === NT_MODULE;
};

/** The latest heredoc_end end among the node's descendants (-1 when none). */
const rbBetweenDefsHeredocEnd = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  let best = -1;
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (!a.isNode(c)) {
      continue;
    }
    const t = a.type(c);
    if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, c)) {
      const e = rnE(src, c, F_HEREDOC_END);
      if (e > best) {
        best = e;
      }
    }
    const d = rbBetweenDefsHeredocEnd(src, c);
    if (d > best) {
      best = d;
    }
  }
  return best;
};

const rbBetweenDefsOneLine = (src: RbSource, n: i32): boolean => src.line(src.a.exS(n)) === src.line(src.a.exE(n));

export class CopLayoutEmptyLineBetweenDefs {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLineBetweenDefs");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      if (a.type(n) !== NT_BEGIN) {
        continue;
      }
      for (let i = 0; i + 1 < a.nKid(n); i++) {
        const prev = a.kid(n, i);
        const cur = a.kid(n, i + 1);
        if (rbBetweenDefsCandidate(src, prev) && rbBetweenDefsCandidate(src, cur)) {
          this.checkDefs(src, L, prev, cur);
        }
      }
    }
  }

  /** end_loc(node).end_pos: past a trailing heredoc. */
  private endPos(src: RbSource, n: i32): i32 {
    const e = src.a.exE(n);
    const h = rbBetweenDefsHeredocEnd(src, n);
    return h > e ? h : e;
  }

  private checkDefs(src: RbSource, L: RbLayLines, prev: i32, cur: i32): void {
    const a = src.a;
    // lines_between_defs: lines[def_end(prev)..def_start(cur) - 2]
    const from = src.line(this.endPos(src, prev));
    const to = src.line(rnS(src, cur, F_KEYWORD)) - 2;
    let count = 0;
    let lastBlank = -1;
    let firstNonBlank = -1;
    if (to >= 0) {
      for (let i = from; i <= to && i < L.n; i++) {
        if (L.blank(i)) {
          count++;
          lastBlank = i;
        } else if (firstNonBlank < 0) {
          firstNonBlank = i;
        }
      }
    }
    if (count === 1) {
      return;
    }
    // multiple_blank_lines_groups?
    if (lastBlank >= 0 && firstNonBlank >= 0 && lastBlank > firstNonBlank) {
      return;
    }
    if (rbBetweenDefsOneLine(src, prev) && rbBetweenDefsOneLine(src, cur)) {
      return;
    }
    const k = this.c.offense(rnS(src, cur, F_KEYWORD), rnE(src, cur, F_NAME));
    if (k === null) {
      return;
    }
    const endPos = this.endPos(src, prev);
    let nl = endPos;
    while (nl < src.n && src.pts[nl] !== 10) {
      nl++;
    }
    const begin = a.exS(cur);
    if (nl > begin) {
      nl = begin - 1;
    }
    if (count > 1) {
      k.remove(nl, nl + count - 1);
    } else {
      k.insertAfter(nl, nl + 1, "\n");
    }
    this.c.commit(k);
  }
}
