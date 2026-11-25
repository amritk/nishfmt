// Layout/CommentIndentation (AllowForAlignment: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbLine } from "../node";
import { rbByteAt } from "../util";
import { add32, atI32, sub32 } from "../../core/arr";
import { V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalAligner, lalIsWs } from "./layout_align_help";
import { RbLayLines, rbLayHasAt, rbLayWordByte } from "./layout_empty_help";

/** Whether `text` matches /\A\s*(end\b|[)}\]])/ (less_indented? for the indent style). */
const rbCommIndLess = (text: string): boolean => {
  const k = toI32(text.length);
  let p = 0;
  while (p < k && lalIsWs(text.charCodeAt(p))) {
    p++;
  }
  if (p >= k) {
    return false;
  }
  const c = text.charCodeAt(p);
  if (c === 41 || c === 125 || c === 93) {
    return true;
  }
  if (rbLayHasAt(text, p, "end")) {
    return p >= k - 3 || !rbLayWordByte(rbByteAt(text, p + 3));
  }
  return false;
};

/** /^\s*(else|elsif|when|in|rescue|ensure)\b/ (a line holds no newline). */
const rbCommIndTwoAlternatives = (text: string): boolean => {
  const k = toI32(text.length);
  let p = 0;
  while (p < k && lalIsWs(text.charCodeAt(p))) {
    p++;
  }
  const words = ["else", "elsif", "when", "in", "rescue", "ensure"];
  for (const w of words) {
    const q = add32(p, toI32(w.length));
    if (rbLayHasAt(text, p, w) && (q >= k || !rbLayWordByte(rbByteAt(text, q)))) {
      return true;
    }
  }
  return false;
};

export class CopLayoutCommentIndentation {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/CommentIndentation");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const L = new RbLayLines(src);
    const commS = src.commS;
    const nc = toI32(commS.length);
    for (let ix = 0; ix < nc && ix < commS.length; ix++) {
      const s = commS[ix];
      if (!this.ownLine(src, L, ix)) {
        continue;
      }
      const line = src.line(s);
      // line_after_comment: the next non-blank line of processed_source.lines
      let next = -1;
      for (let i = line; i < L.n; i++) {
        if (!L.blank(i)) {
          next = i;
          break;
        }
      }
      let correct = 0;
      let nextText = "";
      if (next >= 0) {
        nextText = L.text(next);
        let p = 0;
        while (p < toI32(nextText.length) && lalIsWs(nextText.charCodeAt(p))) {
          p++;
        }
        // =~ /\S/ counts characters; the leading whitespace is ASCII.
        correct = rbCommIndLess(nextText) ? add32(p, 2) : p;
      }
      const column = src.column(s);
      const delta = sub32(correct, column);
      if (delta === 0) {
        continue;
      }
      if (next >= 0 && rbCommIndTwoAlternatives(nextText)) {
        if (toI64(column) === toI64(correct) + toI64(2)) {
          continue;
        }
      }
      const k = this.c.offense(s, atI32(src.commE, ix));
      if (k === null) {
        continue;
      }
      // autocorrect_preceding_comments, then the comment itself
      let below = ix;
      for (let above = ix - 1; above >= 0; above--) {
        if (!this.shouldCorrect(src, L, above, below)) {
          break;
        }
        this.correctOne(src, k, above, delta);
        below = above;
      }
      this.correctOne(src, k, ix, delta);
      this.c.commit(k);
    }
  }

  /** own_line_comment?: /\A\s*#/ on the comment's line. */
  private ownLine(src: RbSource, L: RbLayLines, ix: i32): boolean {
    const i = rbLine(src, atI32(src.commS, ix)) - 1;
    return L.commentLine(i) && L.has(i);
  }

  /** should_correct?(above, below). */
  private shouldCorrect(src: RbSource, L: RbLayLines, above: i32, below: i32): boolean {
    const as = atI32(src.commS, above);
    const bs = atI32(src.commS, below);
    if (src.column(as) !== src.column(bs)) {
      return false;
    }
    if (!this.ownLine(src, L, above)) {
      return false;
    }
    // Lines line(as) + 1 up to line(bs), each read at its 0-based index.
    const lb = rbLine(src, bs) - 1;
    for (let l = rbLine(src, as); l < lb; l++) {
      if (!L.blank(l)) {
        return false;
      }
    }
    return true;
  }

  private correctOne(src: RbSource, k: RbRewriter, ix: i32, delta: i32): void {
    this.al.correct(src, k, atI32(src.commS, ix), atI32(src.commE, ix), delta, V_NIL);
  }
}
