// Layout/IndentationConsistency (EnforcedStyle: normal).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_KWBEGIN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalAligner, lalBareAccessModifier, lalFirstLine } from "./layout_align_help";

export class CopLayoutIndentationConsistency {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/IndentationConsistency");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BEGIN && t !== NT_KWBEGIN) {
        continue;
      }
      const items: i32[] = [];
      for (let i = 0; i < a.nKid(n); i++) {
        const ch = a.kid(n, i);
        if (a.isNode(ch) && !lalBareAccessModifier(src, ch)) {
          items.push(ch);
        }
      }
      // base_column_for_normal_style || governed_base_column
      let base = -1;
      let has = false;
      const first = a.kid(n, 0);
      if (a.isNode(first) && lalBareAccessModifier(src, first)) {
        const am = this.al.dispCol(src, a.exS(first));
        const p = src.parent(n);
        if (p === V_NIL || am > this.al.dispCol(src, a.exS(p))) {
          base = am;
          has = true;
        }
      }
      if (!has && items.length > 0 && !this.widthEnabled(src, items[0])) {
        for (const it of items) {
          if (this.widthEnabled(src, it)) {
            base = this.al.dispCol(src, a.exS(it));
            has = true;
            break;
          }
        }
      }
      this.al.check(this.c, src, items, base, has);
    }
  }

  /** indentation_width_enabled_at?: Layout/IndentationWidth is not disabled on the node's first line. */
  private widthEnabled(src: RbSource, n: i32): boolean {
    const l = lalFirstLine(src, n);
    return src.copEnabledAt("Layout/IndentationWidth", l, l);
  }
}
