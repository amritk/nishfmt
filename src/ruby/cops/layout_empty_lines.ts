// Layout/EmptyLines: two or more consecutive blank lines.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbB } from "../node";
import { fault } from "../../core/fault";
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
    const pts = src.pts;
    for (let i = 2; i < src.n && i < pts.length; i++) {
      if (pts[i - 2] === 10 && pts[i - 1] === 10 && pts[i] === 10) {
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
    const top = rbB(L.phys) + 1;
    // top is at most 2^30.
    for (let l = 0; l <= top && l < 1073741824; l++) {
      has.push(false);
    }
    const tokS = src.tokS;
    for (let i = 0; i < nt && i < tokS.length; i++) {
      const l = src.line(tokS[i]);
      if (l >= 0 && l < has.length) {
        has[l] = true;
      } else {
        fault();
        return;
      }
    }
    let prev = 1;
    for (let cur = 1; cur <= top && cur < has.length; cur++) {
      if (!has[cur]) {
        continue;
      }
      if (prev < cur - 2) {
        // prev starts at 1 and only grows, so every line here is at least 2.
        for (let line = prev + 1; line >= 2 && line < cur; line++) {
          if (L.empty(line - 2) && L.empty(line - 1)) {
            const s = L.start(line);
            const se = rbB(s) + 1;
            const k = this.c.offense(s, se);
            if (k !== null) {
              k.remove(s, se);
              this.c.commit(k);
            }
          }
        }
      }
      prev = cur;
    }
  }
}
