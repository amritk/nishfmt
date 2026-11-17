// Layout/EndOfLine (detection only; EnforcedStyle: native, which is lf off
// Windows): the first line before the last token's that ends in a carriage
// return. (formatRuby leaves any source with a carriage return alone, so in
// practice this never reports.)
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
    const nt = toI32(src.tokT.length);
    const lastLine = nt > 0 ? src.line(src.tokS[nt - 1]) : new RbLayLines(src).n;
    let p = 0;
    let index = 0;
    while (p < src.n && index < lastLine) {
      let q = p;
      while (q < src.n && src.pts[q] !== 10) {
        q++;
      }
      // The line [p, e), with its newline.
      const e = q < src.n ? q + 1 : q;
      const crlf = q < src.n && q > p && src.pts[q - 1] === 13;
      const cr = q === src.n && q > p && src.pts[q - 1] === 13;
      if (crlf || cr) {
        // RuboCop's buffer drops the CR of a CRLF, so its range (the raw
        // line's length from the line's start) ends a character further.
        this.c.offense(p, crlf && e < src.n ? e + 1 : e);
        return;
      }
      p = e;
      index++;
    }
  }
}
