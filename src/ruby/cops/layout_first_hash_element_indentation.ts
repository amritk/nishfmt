// Layout/FirstHashElementIndentation (EnforcedStyle: special_inside_parentheses).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_CSEND, NT_HASH, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnPairs, rnS } from "../node";
import { RbSource } from "../source";
import {
  LalAligner,
  LalIgnored,
  lalBeginsItsLine,
  lalCheckRight,
  lalEachArgumentNode,
  lalFirstLine,
  lalIndentBase,
} from "./layout_align_help";

export class CopLayoutFirstHashElementIndentation {
  c: RbCop;
  al: LalAligner;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Layout/FirstHashElementIndentation");
    this.al = new LalAligner();
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_HASH) {
        if (rnHas(src, n, F_BEGIN)) {
          this.check(src, n, -1);
        }
      } else if (t === NT_SEND || t === NT_CSEND) {
        if (!rnHas(src, n, F_BEGIN)) {
          continue;
        }
        const lp = rnS(src, n, F_BEGIN);
        for (const h of lalEachArgumentNode(src, n, NT_HASH)) {
          this.check(src, h, lp);
          this.ign.add(h);
        }
      }
    }
  }

  private check(src: RbSource, h: i32, lp: i32): void {
    if (this.ign.has(h)) {
      return;
    }
    const a = src.a;
    const lb = rnS(src, h, F_BEGIN);
    const pairs = rnPairs(src, h);
    const first = pairs.length > 0 ? pairs[0] : V_NIL;
    if (first !== V_NIL) {
      if (lalFirstLine(src, first) === src.line(lb)) {
        return;
      }
      // check_first_pair (the key style, never separator)
      if (lalBeginsItsLine(src, a.exS(first))) {
        const s = a.exS(first);
        const expected = lalIndentBase(src, lb, first, lp, true) + 2;
        const delta = expected - src.column(s);
        if (delta !== 0) {
          const k = this.c.offense(s, a.exE(first));
          if (k !== null) {
            // autocorrect: only the pair's first line when its value starts on a later line
            if (lalFirstLine(src, a.kid(first, 1)) <= lalFirstLine(src, a.kid(first, 0))) {
              this.al.correct(src, k, s, a.exE(first), delta, first);
            } else {
              const l = src.line(s);
              this.al.correct(src, k, src.lineStart(l), src.lineEnd(l), delta, V_NIL);
            }
            this.c.commit(k);
          }
        }
      }
    }
    lalCheckRight(this.c, this.al, src, rnS(src, h, F_END), first, lb, lp, true);
  }
}
