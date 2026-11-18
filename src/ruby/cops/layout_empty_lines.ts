// Layout/EmptyLines: two or more consecutive blank lines.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";

export class CopLayoutEmptyLines {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLines");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const nt = toI32(src.tokS.length);
    if (nt === 0) {
      return;
    }
    // consecutive_blank_lines_possible?
    let possible = false;
    for (let i = 0; i + 2 < src.n; i++) {
      if (src.pts[i] === 10 && src.pts[i + 1] === 10 && src.pts[i + 2] === 10) {
        possible = true;
        break;
      }
    }
    if (!possible) {
      return;
    }
    const L = new RbLayLines(src);
    // The lines holding a token, sorted.
    const has: boolean[] = [];
    for (let l = 0; l <= L.phys + 1; l++) {
      has.push(false);
    }
    for (let i = 0; i < nt; i++) {
      has[src.line(src.tokS[i])] = true;
    }
    let prev = 1;
    for (let cur = 1; cur <= L.phys + 1; cur++) {
      if (!has[cur]) {
        continue;
      }
      if (cur - prev > 2) {
        for (let line = prev + 1; line < cur; line++) {
          if (L.empty(line - 2) && L.empty(line - 1)) {
            const s = L.start(line);
            const k = this.c.offense(s, s + 1);
            if (k !== null) {
              k.remove(s, s + 1);
              this.c.commit(k);
            }
          }
        }
      }
      prev = cur;
    }
  }
}
