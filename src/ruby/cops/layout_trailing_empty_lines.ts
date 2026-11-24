// Layout/TrailingEmptyLines (EnforcedStyle: final_newline).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLayRxSpace } from "./layout_empty_help";

export class CopLayoutTrailingEmptyLines {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/TrailingEmptyLines");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const n = src.n;
    if (n === 0) {
      return;
    }
    // ends_in_end?: /\s*__END__/ matches wherever `__END__` is.
    const pts = src.pts;
    for (let i = 6; i < n && i < pts.length; i++) {
      if (
        pts[i - 6] === 95 &&
        pts[i - 5] === 95 &&
        pts[i - 4] === 69 &&
        pts[i - 3] === 78 &&
        pts[i - 2] === 68 &&
        pts[i - 1] === 95 &&
        pts[i] === 95
      ) {
        return;
      }
    }
    // end_with_percent_blank_string?
    if (n > pts.length) {
      fault();
      return;
    }
    if (n >= 3 && pts[n - 3] === 37 && pts[n - 2] === 10 && pts[n - 1] === 10) {
      return;
    }
    // whitespace_at_end = source[/\s*\Z/]
    let b = n;
    while (b > 0 && b <= pts.length && rbLayRxSpace(pts[b - 1])) {
      b--;
    }
    let nl = 0;
    for (let i = b; i >= 0 && i < n && i < pts.length; i++) {
      if (pts[i] === 10) {
        nl = add32(nl, 1);
      }
    }
    if (nl === 1) {
      return;
    }
    const rs = b < n ? b + 1 : b;
    const k = this.c.offense(rs, n);
    if (k !== null) {
      k.replace(b, n, "\n");
      this.c.commit(k);
    }
  }
}
