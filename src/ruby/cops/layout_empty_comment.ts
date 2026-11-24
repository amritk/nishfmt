// Layout/EmptyComment (AllowBorderComment: true, AllowMarginComment: true).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayStripWs } from "./layout_empty_help";

/** comment_text(comment) == "#\n": the comment is a lone `#` once stripped. */
const rbEmptyCommentBare = (src: RbSource, s: i32, e: i32): boolean => {
  const pts = src.pts;
  let b = s;
  let f = e;
  while (b < f) {
    // A comment lies in the source.
    if (b < 0 || b >= pts.length) {
      fault();
      return false;
    }
    if (!rbLayStripWs(pts[b])) {
      break;
    }
    b++;
  }
  while (f > b) {
    if (f <= 0 || f > pts.length) {
      fault();
      return false;
    }
    if (!rbLayStripWs(pts[f - 1])) {
      break;
    }
    f--;
  }
  return sub32(f, b) === 1 && atI32(pts, b) === 35;
};

export class CopLayoutEmptyComment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyComment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const commS = src.commS;
    const commE = src.commE;
    const nc = toI32(commS.length);
    if (nc === 0) {
      return;
    }
    const L = new RbLayLines(src);
    // concat_consecutive_comments: chunks of comments on consecutive lines in one column.
    let i = 0;
    while (i < nc) {
      let j = i + 1;
      while (j > 0 && j < nc && j < commS.length) {
        const s0 = commS[j - 1];
        const s1 = commS[j];
        const pl = src.line(s0);
        const cl = src.line(s1);
        if (add32(pl, 1) !== cl || src.column(s0) !== src.column(s1)) {
          break;
        }
        j++;
      }
      // empty_comment_only?(joined): /\A(#\n)+\z/
      let empty = true;
      for (let m = i; m < j; m++) {
        if (!rbEmptyCommentBare(src, atI32(commS, m), atI32(commE, m))) {
          empty = false;
          break;
        }
      }
      if (empty) {
        for (let m = i; m < j; m++) {
          this.flag(src, L, atI32(commS, m), atI32(commE, m));
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
    const pts = src.pts;
    for (let p = L.start(line); p < s; p++) {
      // The comment's line lies in the source.
      if (p < 0 || p >= pts.length) {
        fault();
        return;
      }
      if (!rbLayStripWs(pts[p])) {
        inline = true;
        break;
      }
    }
    if (inline) {
      // range_with_surrounding_space(newlines: false)
      // src.at answers -1 outside the source, which ends both scans.
      let b = s;
      while (b > 0 && (src.at(b - 1) === 32 || src.at(b - 1) === 9)) {
        b--;
      }
      const n = src.n;
      let f = e;
      while (f < n && (src.at(f) === 32 || src.at(f) === 9)) {
        f++;
      }
      k.remove(b, f);
    } else {
      // range_by_whole_lines(include_final_newline: true)
      const last = src.line(e);
      let f = add32(L.end(last), 1);
      if (f > src.n) {
        f = src.n;
      }
      k.remove(L.start(line), f);
    }
    this.c.commit(k);
  }
}
