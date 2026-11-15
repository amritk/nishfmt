// Style/BlockComments.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const cs = src.commS[i];
      // An =begin comment that ends the file without a newline: the lexer's range runs
      // past the buffer (as the parser gem's does); RuboCop's ends at the buffer end.
      const ce = src.commE[i] > src.n ? src.n : src.commE[i];
      // Comment#document?: an =begin/=end comment.
      if (ce - cs < 6 || src.src(cs, cs + 6) !== "=begin") {
        continue;
      }
      const k = this.c.offense(cs, ce);
      if (k === null) {
        continue;
      }
      // parts
      const bE = cs + 7;
      let eS = ce - 5;
      let eE = ce;
      if (src.at(ce - 1) !== 10) {
        eS = ce - 6;
        eE = ce - 2;
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
    while (i < toI32(t1.length)) {
      if (t1[i] === 10 && i + 1 < toI32(t1.length) && t1[i + 1] === 10) {
        t2.push(10);
        t2.push(35);
        t2.push(10);
        i += 2;
        continue;
      }
      t2.push(t1[i]);
      i++;
    }
    const out: i32[] = [];
    for (let j = 0; j < toI32(t2.length); j++) {
      out.push(t2[j]);
      if (t2[j] === 10 && j + 1 < toI32(t2.length) && t2[j + 1] !== 35) {
        out.push(35);
        out.push(32);
      }
    }
    return rbText(out, 0, toI32(out.length));
  }
}
