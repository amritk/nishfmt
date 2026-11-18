// Layout/FirstArrayElementIndentation (EnforcedStyle: special_inside_parentheses).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_ARRAY, NT_CSEND, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnS } from "../node";
import { RbSource } from "../source";
import {
  LalAligner,
  LalIgnored,
  lalCheckFirst,
  lalCheckRight,
  lalEachArgumentNode,
  lalFirstLine,
} from "./layout_align_help";

export class CopLayoutFirstArrayElementIndentation {
  c: RbCop;
  al: LalAligner;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Layout/FirstArrayElementIndentation");
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
      if (t === NT_ARRAY) {
        if (rnHas(src, n, F_BEGIN)) {
          this.check(src, n, -1);
        }
      } else if (t === NT_SEND || t === NT_CSEND) {
        if (!rnHas(src, n, F_BEGIN)) {
          continue;
        }
        const lp = rnS(src, n, F_BEGIN);
        for (const arr of lalEachArgumentNode(src, n, NT_ARRAY)) {
          this.check(src, arr, lp);
          this.ign.add(arr);
        }
      }
    }
  }

  private check(src: RbSource, arr: i32, lp: i32): void {
    if (this.ign.has(arr)) {
      return;
    }
    const a = src.a;
    const lb = rnS(src, arr, F_BEGIN);
    const first = a.nKid(arr) > 0 ? a.kid(arr, 0) : V_NIL;
    if (first !== V_NIL) {
      if (lalFirstLine(src, first) === src.line(lb)) {
        return;
      }
      lalCheckFirst(this.c, this.al, src, first, lb, lp, true, 0);
    }
    lalCheckRight(this.c, this.al, src, rnS(src, arr, F_END), first, lb, lp, true);
  }
}
