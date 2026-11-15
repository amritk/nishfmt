// Layout/EmptyComment (AllowBorderComment: true, AllowMarginComment: true).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayStripWs } from "./layout_empty_help";

/** comment_text(comment) == "#\n": the comment is a lone `#` once stripped. */
const rbEmptyCommentBare = (src: RbSource, s: i32, e: i32): boolean => {
  let b = s;
  let f = e;
  while (b < f && rbLayStripWs(src.pts[b])) {
    b++;
  }
  while (f > b && rbLayStripWs(src.pts[f - 1])) {
    f--;
  }
  return f - b === 1 && src.pts[b] === 35;
};

export class CopLayoutEmptyComment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyComment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const nc = toI32(src.commS.length);
    if (nc === 0) {
      return;
    }
    const L = new RbLayLines(src);
    // concat_consecutive_comments: chunks of comments on consecutive lines in one column.
    let i = 0;
    while (i < nc) {
      let j = i + 1;
      while (j < nc) {
        const pl = src.line(src.commS[j - 1]);
        const cl = src.line(src.commS[j]);
        if (pl + 1 !== cl || src.column(src.commS[j - 1]) !== src.column(src.commS[j])) {
          break;
        }
        j++;
      }
      // empty_comment_only?(joined): /\A(#\n)+\z/
      let empty = true;
      for (let m = i; m < j; m++) {
        if (!rbEmptyCommentBare(src, src.commS[m], src.commE[m])) {
          empty = false;
          break;
        }
      }
      if (empty) {
        for (let m = i; m < j; m++) {
          this.flag(src, L, src.commS[m], src.commE[m]);
        }
      }
      i = j;
    }
  }

  private flag(src: RbSource, L: RbLayLines, s: i32, e: i32): void {
    const k = this.c.offense(s, e);
    if (k === null) {
      return;
    }
    const line = src.line(s);
    // inline_comment?: code before the comment on its line.
    let inline = false;
    for (let p = L.start(line); p < s; p++) {
      if (!rbLayStripWs(src.pts[p])) {
        inline = true;
        break;
      }
    }
    if (inline) {
      // range_with_surrounding_space(newlines: false)
      let b = s;
      while (src.at(b - 1) === 32 || src.at(b - 1) === 9) {
        b--;
      }
      let f = e;
      while (src.at(f) === 32 || src.at(f) === 9) {
        f++;
      }
      k.remove(b, f);
    } else {
      // range_by_whole_lines(include_final_newline: true)
      const last = src.line(e);
      let f = L.end(last) + 1;
      if (f > src.n) {
        f = src.n;
      }
      k.remove(L.start(line), f);
    }
    this.c.commit(k);
  }
}
