// Style/BlockComments.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, sub32 } from "../../core/arr";
import { RbCop } from "../cop";
import { rbText } from "../lexer";
import { RbSource } from "../source";

/** Style/BlockComments. */
export class CopStyleBlockComments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/BlockComments");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const commS = src.commS;
    const commE = src.commE;
    for (let i = 0; i < commS.length && i < commE.length; i++) {
      const cs = commS[i];
      // An =begin comment that ends the file without a newline: the lexer's range runs
      // past the buffer (as the parser gem's does); RuboCop's ends at the buffer end.
      const ce = commE[i] > src.n ? src.n : commE[i];
      // Comment#document?: an =begin/=end comment.
      if (toI64(ce) - toI64(cs) < toI64(6) || src.src(cs, add32(cs, 6)) !== "=begin") {
        continue;
      }
      const k = this.c.offense(cs, ce);
      if (k === null) {
        continue;
      }
      // parts
      const bE = add32(cs, 7);
      let eS = sub32(ce, 5);
      let eE = ce;
      if (rbAtOff(src, ce, -1) !== 10) {
        eS = sub32(ce, 6);
        eE = sub32(ce, 2);
      }
      k.remove(cs, bE);
      if (eS > bE) {
        k.replace(bE, eS, this.commented(src, bE, eS));
      }
      k.remove(eS, eE);
      this.c.commit(k);
    }
  }

  /** contents.gsub(/\A/, '# ').gsub("\n\n", "\n#\n").gsub(/\n(?=[^#])/, "\n# ") */
  private commented(src: RbSource, s: i32, e: i32): string {
    const t1: i32[] = [35, 32];
    for (let p = s; p < e; p++) {
      t1.push(src.at(p));
    }
    const t2: i32[] = [];
    let i = 0;
    while (i >= 0 && i < t1.length) {
      const i1 = i + 1;
      if (t1[i] === 10 && i1 < t1.length && t1[i1] === 10) {
        t2.push(10);
        t2.push(35);
        t2.push(10);
        i = i1 + 1;
        continue;
      }
      t2.push(t1[i]);
      i++;
    }
    const out: i32[] = [];
    for (let j = 0; j < t2.length; j++) {
      const tj = t2[j];
      const j1 = j + 1;
      const next = j1 < t2.length ? t2[j1] : -1;
      out.push(tj);
      if (tj === 10 && j1 < t2.length && next !== 35) {
        out.push(35);
        out.push(32);
      }
    }
    return rbText(out, 0, toI32(out.length));
  }
}
