// Layout/EmptyLinesAroundArguments: empty lines before the arguments (or
// closing parenthesis) of a multi-line call.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_SELECTOR, NT_CSEND, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";

export class CopLayoutEmptyLinesAroundArguments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundArguments");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_SEND && t !== NT_CSEND) {
        continue;
      }
      if (src.line(a.exS(n)) === src.line(a.exE(n)) || a.nKid(n) <= 2) {
        continue;
      }
      // receiver_and_method_call_on_different_lines?
      const recv = a.kid(n, 0);
      if (recv !== V_NIL) {
        if (!rnHas(src, n, F_SELECTOR) || src.line(a.exE(recv)) !== src.line(rnS(src, n, F_SELECTOR))) {
          continue;
        }
      }
      for (let i = 2; i < a.nKid(n); i++) {
        this.startingPoint(src, L, a.exS(a.kid(n, i)));
      }
      if (rnHas(src, n, F_END)) {
        this.startingPoint(src, L, rnS(src, n, F_END));
      }
    }
  }

  /** empty_range_for_starting_point: the line before `start` when blank lines lead up to it. */
  private startingPoint(src: RbSource, L: RbLayLines, start: i32): void {
    const b = rbSpaceBegin(src, start, 1, true, true, false);
    const last = src.line(start);
    if (last - src.line(b) <= 1) {
      return;
    }
    const s = L.start(last - 1);
    const e = L.end(last - 1) + 1;
    const k = this.c.offense(s, e);
    if (k !== null) {
      k.remove(s, e);
      this.c.commit(k);
    }
  }
}
