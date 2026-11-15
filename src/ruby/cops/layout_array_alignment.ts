// Layout/ArrayAlignment (EnforcedStyle: with_first_element).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARRAY, NT_MASGN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalAligner } from "./layout_align_help";

export class CopLayoutArrayAlignment {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/ArrayAlignment");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY || a.nKid(n) < 2) {
        continue;
      }
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_MASGN) {
        continue;
      }
      const items: i32[] = [];
      for (let i = 0; i < a.nKid(n); i++) {
        items.push(a.kid(n, i));
      }
      this.al.check(this.c, src, items, 0, false);
    }
  }
}
