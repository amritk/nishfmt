// Style/RedundantRegexpEscape.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, sub32 } from "../../core/arr";
import { F_BEGIN, F_END, NT_REGEXP } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rbLitChars } from "./lit_help";
import { rbLitUAlnum } from "./lit_unicode";
import { RX_ESCAPE, rbRxParsedTree } from "./style_regexp_help";

export class CopStyleRedundantRegexpEscape {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantRegexpEscape");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_REGEXP) {
        continue;
      }
      const be = rnE(src, n, F_BEGIN);
      const es = rnS(src, n, F_END);
      const tree = rbRxParsedTree(src, n);
      if (tree === null) {
        continue;
      }
      const d0 = rbAtOff(src, be, -1);
      const d1 = src.at(es);
      const tt = tree.tt;
      const tts = tree.ts;
      const tset = tree.tset;
      for (let i = 0; i < tt.length && i < tts.length && i < tset.length; i++) {
        if (tt[i] !== RX_ESCAPE) {
          continue;
        }
        const index = tts[i];
        const inSet = tset[i];
        const cs = rbLitChars(tree.text(i));
        const ch = cs.length > 1 ? cs[1] : -1;
        if (this.allowed(src, be, es, ch, index, inSet, d0, d1)) {
          continue;
        }
        const s = add32(be, index);
        const k = this.c.offense(s, add32(s, 2));
        if (k !== null) {
          k.remove(s, add32(s, 1));
          this.c.commit(k);
        }
      }
    }
  }

  /** allowed_escape? for the escaped character `ch` at `index` of the contents. */
  private allowed(src: RbSource, be: i32, es: i32, ch: i32, index: i32, inSet: boolean, d0: i32, d1: i32): boolean {
    if (ch < 0) {
      return true;
    }
    if (rbLitUAlnum(ch)) {
      return true;
    }
    // ALLOWED_ALWAYS_ESCAPES " \n[]^\\#", the delimiters
    if (
      ch === 32 ||
      ch === 10 ||
      ch === 91 ||
      ch === 93 ||
      ch === 94 ||
      ch === 92 ||
      ch === 35 ||
      ch === d0 ||
      ch === d1
    ) {
      return true;
    }
    // requires_escape_to_avoid_interpolation?
    if (index > 0 && (ch === 64 || ch === 36) && rbAtOff(src, be, index - 1) === 35) {
      return true;
    }
    if (inSet) {
      if (ch !== 45) {
        return false;
      }
      // char_class_begins_or_ends_with_escaped_hyphen?
      let edge = false;
      if (rbRreContentAt(src, be, es, add32(index, 2)) === 93) {
        edge = true;
      } else if (rbRreContentAt(src, be, es, sub32(index, 1)) === 91) {
        edge = index < 2 || rbRreContentAt(src, be, es, sub32(index, 2)) !== 92;
      }
      return !edge;
    }
    return (
      ch === 46 ||
      ch === 42 ||
      ch === 43 ||
      ch === 63 ||
      ch === 123 ||
      ch === 125 ||
      ch === 40 ||
      ch === 41 ||
      ch === 124 ||
      ch === 36
    );
  }
}

/** contents_range(node).source[j] (negative counts from the end; past the end: none). */
const rbRreContentAt = (src: RbSource, be: i32, es: i32, j: i32): i32 => {
  if (j < 0) {
    return toI64(es) + toI64(j) >= toI64(be) ? rbAtOff(src, es, j) : -1;
  }
  return toI64(be) + toI64(j) < toI64(es) ? rbAtOff(src, be, j) : -1;
};
