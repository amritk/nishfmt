// Layout/DotPosition (EnforcedStyle: leading).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_DOT, F_HEREDOC_END, F_SELECTOR, NT_CSEND, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { rbLineEnd, rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { rmlIsCall, rmlIsHeredoc } from "./layout_multiline_help";
import { lspIsWs } from "./layout_space_help";

export class CopLayoutDotPosition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/DotPosition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_SEND && t !== NT_CSEND) || !rnHas(src, n, F_DOT)) {
        continue;
      }
      const ds = rnS(src, n, F_DOT);
      const de = rnE(src, n, F_DOT);
      const dot = src.src(ds, de);
      if (dot !== "." && dot !== "&.") {
        continue;
      }
      const recv = a.kid(n, 0);
      // selector_range
      let ss = -1;
      if (rnHas(src, n, F_SELECTOR)) {
        ss = rnS(src, n, F_SELECTOR);
      } else if (rnHas(src, n, F_BEGIN)) {
        ss = rnS(src, n, F_BEGIN);
      }
      if (ss < 0) {
        continue;
      }
      // proper_dot_position?
      const selLine = src.line(ss);
      if (selLine === src.line(a.exE(recv))) {
        continue;
      }
      const recvLine = this.receiverEndLine(src, recv);
      const dotLine = src.line(ds);
      if (toI64(selLine) - toI64(recvLine > dotLine ? recvLine : dotLine) > toI64(1)) {
        continue;
      }
      if (dotLine === selLine) {
        continue;
      }
      const k = this.c.offense(ds, de);
      if (k === null) {
        continue;
      }
      // removed_dot_range
      let rs = ds;
      let re = de;
      const l = src.line(ds);
      let fs = src.lineStart(l);
      let fe = src.lineEnd(l);
      while (fs < fe && (lspIsWs(src.at(fs)) || src.at(fs) === 0)) {
        fs++;
      }
      while (fe > fs && fe > 0 && (lspIsWs(src.at(fe - 1)) || src.at(fe - 1) === 0)) {
        fe--;
      }
      if (src.src(fs, fe) === ".") {
        rs = src.lineStart(l);
        re = rbLineEnd(src, l) + 1;
        if (re > src.n) {
          re = src.n;
        }
      }
      // move_dot_before_selector
      const gap = src.src(re, ss);
      k.replace(rs < re ? rs : re, ss > re ? ss : re, `${gap}${dot}`);
      this.c.commit(k);
    }
  }

  /** receiver_end_line. */
  private receiverEndLine(src: RbSource, recv: i32): i32 {
    const a = src.a;
    if (rmlIsCall(src, recv)) {
      let best = -1;
      for (let i = 2; i < a.nKid(recv); i++) {
        const x = a.kid(recv, i);
        if (rmlIsHeredoc(src, x)) {
          const hl = src.line(rnS(src, x, F_HEREDOC_END));
          if (hl > best) {
            best = hl;
          }
        }
      }
      if (best >= 0) {
        return best;
      }
    } else if (rmlIsHeredoc(src, recv)) {
      return src.line(rnS(src, recv, F_HEREDOC_END));
    }
    return src.line(a.exE(recv));
  }
}
