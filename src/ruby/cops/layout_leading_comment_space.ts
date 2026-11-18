// Layout/LeadingCommentSpace (every Allow* option false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLayCommentAtLine, rbLayRxSpace } from "./layout_empty_help";

/** /\A(?!#\+\+|#--)(#+[^#\s=])/ on a comment's text. */
const rbLeadSpaceMissing = (src: RbSource, s: i32, e: i32): boolean => {
  if (e - s >= 3 && src.pts[s] === 35) {
    const c1 = src.pts[s + 1];
    const c2 = src.pts[s + 2];
    if ((c1 === 43 && c2 === 43) || (c1 === 45 && c2 === 45)) {
      return false;
    }
  }
  let p = s;
  while (p < e && src.pts[p] === 35) {
    p++;
  }
  if (p === s || p >= e) {
    return false;
  }
  const c = src.pts[p];
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
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const s = src.commS[i];
      const e = src.commE[i];
      if (!rbLeadSpaceMissing(src, s, e)) {
        continue;
      }
      const line = src.line(s);
      const shebang = src.at(s + 1) === 33 && e - s >= 2;
      // allowed_on_first_line?
      if (line === 1 && (shebang || (rackup && e - s >= 2 && src.at(s + 1) === 92))) {
        continue;
      }
      // shebang_continuation?
      if (shebang) {
        if (line === 1) {
          continue;
        }
        const pc = rbLayCommentAtLine(src, line - 1);
        if (pc >= 0) {
          const ps = src.commS[pc];
          const pe = src.commE[pc];
          if (pe - ps >= 2 && src.at(ps + 1) === 33 && src.at(ps) === 35) {
            let seen = false;
            for (let j = 0; j < toI32(this.c.offS.length); j++) {
              if (this.c.offS[j] === ps && this.c.offE[j] === pe) {
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
        k.insertAfter(s, s + 1, " ");
        this.c.commit(k);
      }
    }
  }
}
