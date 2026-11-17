// Metrics/BlockNesting (detection only; CountBlocks: false,
// CountModifierForms: false, Max: 3).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_CASE,
  NT_CASE_MATCH,
  NT_FOR,
  NT_IF,
  NT_RESBODY,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnElsif, scnModifier } from "./style_cond_help";

export class CopMetricsBlockNesting {
  c: RbCop;
  // ignore_node: the nodes already reported (their ranges).
  ignS: i32[];
  ignE: i32[];

  constructor() {
    this.c = new RbCop("Metrics/BlockNesting");
    this.ignS = [];
    this.ignE = [];
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    this.ignS = [];
    this.ignE = [];
    if (src.root === V_NIL) {
      return;
    }
    this.check(src, src.root, 0);
  }

  /** check_nesting_level. */
  private check(src: RbSource, n: i32, level0: i32): void {
    let level = level0;
    const t = src.a.type(n);
    if (
      t === NT_CASE ||
      t === NT_CASE_MATCH ||
      t === NT_IF ||
      t === NT_WHILE ||
      t === NT_WHILE_POST ||
      t === NT_UNTIL ||
      t === NT_UNTIL_POST ||
      t === NT_FOR ||
      t === NT_RESBODY
    ) {
      // count_if_block?: not an elsif, not a modifier if/unless.
      if (t !== NT_IF || (!scnElsif(src, n) && !scnModifier(src, n))) {
        level++;
      }
      if (level > 3 && !this.ignored(src, n)) {
        // The offense's block (ignore_node) runs only when it is added on enabled lines.
        if (this.c.offense(src.a.exS(n), src.a.exE(n)) !== null) {
          this.ignS.push(src.a.exS(n));
          this.ignE.push(src.a.exE(n));
        }
      }
    }
    for (let i = 0; i < src.a.nKid(n); i++) {
      const k = src.a.kid(n, i);
      if (src.a.isNode(k)) {
        this.check(src, k, level);
      }
    }
  }

  /** part_of_ignored_node? */
  private ignored(src: RbSource, n: i32): boolean {
    for (let i = 0; i < toI32(this.ignS.length); i++) {
      if (this.ignS[i] <= src.a.exS(n) && this.ignE[i] >= src.a.exE(n)) {
        return true;
      }
    }
    return false;
  }
}
