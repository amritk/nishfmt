// Layout/LeadingCommentSpace (every Allow* option false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, atI32, sub32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLayCommentAtLine, rbLayRxSpace } from "./layout_empty_help";

/** /\A(?!#\+\+|#--)(#+[^#\s=])/ on a comment's text. */
const rbLeadSpaceMissing = (src: RbSource, s: i32, e: i32): boolean => {
  // A comment's offsets lie inside the source, where src.at reads pts.
  if (toI64(e) - toI64(s) >= toI64(3) && src.at(s) === 35) {
    const c1 = rbAtOff(src, s, 1);
    const c2 = rbAtOff(src, s, 2);
    if ((c1 === 43 && c2 === 43) || (c1 === 45 && c2 === 45)) {
      return false;
    }
  }
  let p = s;
  while (p < e && src.at(p) === 35) {
    p++;
  }
  if (p === s || p >= e) {
    return false;
  }
  const c = src.at(p);
  return !rbLayRxSpace(c) && c !== 61;
};

/** File.basename of a path. */
const rbLeadSpaceBase = (path: string): string => {
  let i = toI32(path.length) - 1;
  while (i >= 0 && path.charCodeAt(i) !== 47) {
    i--;
  }
  return path.substring(i + 1, toI32(path.length));
};

export class CopLayoutLeadingCommentSpace {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/LeadingCommentSpace");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const rackup = rbLeadSpaceBase(src.p.st.path) === "config.ru";
    const commS = src.commS;
    const commE = src.commE;
    for (let i = 0; i < commS.length && i < commE.length; i++) {
      const s = commS[i];
      const e = commE[i];
      if (!rbLeadSpaceMissing(src, s, e)) {
        continue;
      }
      const line = src.line(s);
      const shebang = rbAtOff(src, s, 1) === 33 && toI64(e) - toI64(s) >= toI64(2);
      // allowed_on_first_line?
      if (line === 1 && (shebang || (rackup && toI64(e) - toI64(s) >= toI64(2) && rbAtOff(src, s, 1) === 92))) {
        continue;
      }
      // shebang_continuation?
      if (shebang) {
        if (line === 1) {
          continue;
        }
        const pc = rbLayCommentAtLine(src, sub32(line, 1));
        if (pc >= 0) {
          const ps = atI32(src.commS, pc);
          const pe = atI32(src.commE, pc);
          if (toI64(pe) - toI64(ps) >= toI64(2) && rbAtOff(src, ps, 1) === 33 && src.at(ps) === 35) {
            let seen = false;
            const offS = this.c.offS;
            const offE = this.c.offE;
            for (let j = 0; j < offS.length && j < offE.length; j++) {
              if (offS[j] === ps && offE[j] === pe) {
                seen = true;
              }
            }
            if (!seen) {
              continue;
            }
          }
        }
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.insertAfter(s, add32(s, 1), " ");
        this.c.commit(k);
      }
    }
  }
}
