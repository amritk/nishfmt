// Style/RedundantRegexpEscape.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
      const d0 = src.at(be - 1);
      const d1 = src.at(es);
      for (let i = 0; i < toI32(tree.tt.length); i++) {
        if (tree.tt[i] !== RX_ESCAPE) {
          continue;
        }
        const index = tree.ts[i];
        const cs = rbLitChars(tree.text(i));
        const ch = cs.length > 1 ? cs[1] : -1;
        if (this.allowed(src, be, es, ch, index, tree.tset[i], d0, d1)) {
          continue;
        }
        const s = be + index;
        const k = this.c.offense(s, s + 2);
        if (k !== null) {
          k.remove(s, s + 1);
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
    if (ch === 32 || ch === 10 || ch === 91 || ch === 93 || ch === 94 || ch === 92 || ch === 35 || ch === d0 || ch === d1) {
      return true;
    }
    // requires_escape_to_avoid_interpolation?
    if (index > 0 && (ch === 64 || ch === 36) && src.at(be + index - 1) === 35) {
      return true;
    }
    if (inSet) {
      if (ch !== 45) {
        return false;
      }
      // char_class_begins_or_ends_with_escaped_hyphen?
      let edge = false;
      if (rbRreContentAt(src, be, es, index + 2) === 93) {
        edge = true;
      } else if (rbRreContentAt(src, be, es, index - 1) === 91) {
        edge = index < 2 || rbRreContentAt(src, be, es, index - 2) !== 92;
      }
      return !edge;
    }
    return ch === 46 || ch === 42 || ch === 43 || ch === 63 || ch === 123 || ch === 125 || ch === 40 || ch === 41 || ch === 124 || ch === 36;
  }
}

/** contents_range(node).source[j] (negative counts from the end; past the end: none). */
const rbRreContentAt = (src: RbSource, be: i32, es: i32, j: i32): i32 => {
  if (j < 0) {
    return es + j >= be ? src.at(es + j) : -1;
  }
  return be + j < es ? src.at(be + j) : -1;
};
