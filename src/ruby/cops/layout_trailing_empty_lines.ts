// Layout/TrailingEmptyLines (EnforcedStyle: final_newline).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
    for (let i = 0; i + 7 <= n; i++) {
      if (pts[i] === 95 && pts[i + 1] === 95 && pts[i + 2] === 69 && pts[i + 3] === 78 && pts[i + 4] === 68 && pts[i + 5] === 95 && pts[i + 6] === 95) {
        return;
      }
    }
    // end_with_percent_blank_string?
    if (n >= 3 && pts[n - 3] === 37 && pts[n - 2] === 10 && pts[n - 1] === 10) {
      return;
    }
    // whitespace_at_end = source[/\s*\Z/]
    let b = n;
    while (b > 0 && rbLayRxSpace(pts[b - 1])) {
      b--;
    }
    let nl = 0;
    for (let i = b; i < n; i++) {
      if (pts[i] === 10) {
        nl++;
      }
    }
    if (nl - 1 === 0) {
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
