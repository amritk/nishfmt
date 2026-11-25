// Layout/EndOfLine (detection only; EnforcedStyle: native, which is lf off
// Windows): the first line before the last token's that ends in a carriage
// return. (formatRuby leaves any source with a carriage return alone, so in
// practice this never reports.)
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";

export class CopLayoutEndOfLine {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EndOfLine");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const tokS = src.tokS;
    const nt = toI32(tokS.length);
    const lastLine = nt > 0 ? src.line(tokS[nt - 1]) : new RbLayLines(src).n;
    const pts = src.pts;
    const n = src.n;
    if (n > pts.length) {
      fault();
      return;
    }
    let p = 0;
    let index = 0;
    while (p >= 0 && p < n && index < lastLine) {
      let q = p;
      while (q < n && q < pts.length && pts[q] !== 10) {
        q++;
      }
      // The line [p, e), with its newline.
      const e = q < n ? q + 1 : q;
      const crlf = q < n && q > p && q > 0 && q <= pts.length && pts[q - 1] === 13;
      const cr = q === n && q > p && q > 0 && q <= pts.length && pts[q - 1] === 13;
      if (crlf || cr) {
        // RuboCop's buffer drops the CR of a CRLF, so its range (the raw
        // line's length from the line's start) ends a character further.
        this.c.offense(p, crlf && e < n ? e + 1 : e);
        return;
      }
      p = e;
      index++;
    }
  }
}
