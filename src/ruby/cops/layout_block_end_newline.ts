// Layout/BlockEndNewline.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { atI32 } from "../../core/arr";
import { F_END, F_HEREDOC_END, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbNKid, rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { rbLayCommentAtLine } from "./layout_empty_help";
import {
  rmlBeginsItsLine,
  rmlDescendants,
  rmlIsBlock,
  rmlIsCall,
  rmlLastNonNilChild,
  rmlSingleLine,
} from "./layout_multiline_help";
import { lalIsStripWs } from "./layout_align_help";

/** BlockEndNewline#last_heredoc_argument (V_NIL for none). */
const rmlBenHeredoc = (src: RbSource, n: i32): i32 => {
  if (n === V_NIL || !rmlIsCall(src, n)) {
    return V_NIL;
  }
  const a = src.a;
  for (let i = rbNKid(src, n) - 1; i >= 2; i--) {
    const x = a.kid(n, i);
    if (a.isNode(x) && a.type(x) === NT_STR && rnHeredoc(src, x)) {
      return x;
    }
  }
  return rmlBenHeredoc(src, a.kid(n, 0));
};

/** heredoc_argument_after_block_end: the last heredoc argument when it ends after the block's `end`. */
const rmlBenHeredocAfterEnd = (src: RbSource, n: i32): i32 => {
  const h = rmlBenHeredoc(src, src.a.kid(n, 2));
  if (h === V_NIL || rnS(src, h, F_HEREDOC_END) <= rnS(src, n, F_END)) {
    return V_NIL;
  }
  return h;
};

/** heredoc_correction?: the block's correction would move its `end` below a heredoc. */
const rmlBenHeredocCorrection = (src: RbSource, n: i32): boolean => {
  if (rmlSingleLine(src, n) || rmlBeginsItsLine(src, rnS(src, n, F_END))) {
    return false;
  }
  return rmlBenHeredocAfterEnd(src, n) !== V_NIL;
};

/** overlaps_inner_heredoc_correction?: an inner block ending on this `end`'s line moves below a heredoc. */
const rmlBenOverlapsInner = (src: RbSource, n: i32): boolean => {
  const ds: i32[] = [];
  rmlDescendants(src, n, ds);
  const l = src.line(rnS(src, n, F_END));
  for (const d of ds) {
    if (rmlIsBlock(src, d) && src.line(rnS(src, d, F_END)) === l && rmlBenHeredocCorrection(src, d)) {
      return true;
    }
  }
  return false;
};

/** code_end_pos: the end of the code on the range's last line, before a comment and trailing whitespace. */
const rmlBenCodeEnd = (src: RbSource, rs: i32, re: i32): i32 => {
  const l = src.line(re);
  const cm = rbLayCommentAtLine(src, l);
  if (cm < 0) {
    return src.lineEnd(l);
  }
  let e = atI32(src.commS, cm);
  // src.at answers -1 before the source, which is not whitespace.
  while (e > rs && e > 0 && lalIsStripWs(src.at(e - 1))) {
    e--;
  }
  return e;
};

export class CopLayoutBlockEndNewline {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/BlockEndNewline");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!rmlIsBlock(src, n) || rmlSingleLine(src, n)) {
        continue;
      }
      const es = rnS(src, n, F_END);
      const ee = rnE(src, n, F_END);
      if (rmlBeginsItsLine(src, es)) {
        continue;
      }
      const last = rmlLastNonNilChild(src, n);
      if (last === V_NIL || !a.isNode(last) || a.exE(last) < 0) {
        continue;
      }
      const rs = a.exE(last);
      let i = rs;
      while (i < ee && lalIsStripWs(src.at(i))) {
        i++;
      }
      if (src.at(i) === 59) {
        continue;
      }
      const k = this.c.offense(es, ee);
      if (k === null) {
        continue;
      }
      if (rmlBenOverlapsInner(src, n)) {
        this.c.commit(k);
        continue;
      }
      const h = rmlBenHeredocAfterEnd(src, n);
      if (h !== V_NIL) {
        // correct_with_heredoc
        const ce = rmlBenCodeEnd(src, rs, ee);
        let ts = rs;
        let te = ce;
        while (ts < te && lalIsStripWs(src.at(ts))) {
          ts++;
        }
        while (te > ts && te > 0 && lalIsStripWs(src.at(te - 1))) {
          te--;
        }
        k.remove(rs, ce);
        k.insertAfter(rnS(src, h, F_HEREDOC_END), rnE(src, h, F_HEREDOC_END), `\n${src.src(ts, te)}`);
      } else {
        k.replace(rs, ee, `\n${src.src(i, ee)}`);
      }
      this.c.commit(k);
    }
  }
}
