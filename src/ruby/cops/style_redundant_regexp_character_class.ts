// Style/RedundantRegexpCharacterClass.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_REGEXP } from "../ast";
import { RbCop } from "../cop";
import { rnE } from "../node";
import { RbSource } from "../source";
import { rbLitSpaceC } from "./lit_help";
import { rbRlExtended } from "./style_regexp_literal";
import { RX_NONPOSIX, RX_POSIX, rbRxMultipleCodepoints, rbRxParsedTree } from "./style_regexp_help";

export class CopStyleRedundantRegexpCharacterClass {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantRegexpCharacterClass");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_REGEXP) {
        continue;
      }
      const tree = rbRxParsedTree(src, n);
      if (tree === null) {
        continue;
      }
      const be = rnE(src, n, F_BEGIN);
      const ext = rbRlExtended(src, n);
      for (const st of tree.sets) {
        // each_single_element_character_class
        if (st.count !== 1 || st.negative || st.first < 0) {
          continue;
        }
        const ft = tree.tt[st.first];
        if (ft === RX_POSIX || ft === RX_NONPOSIX || rbRxMultipleCodepoints(tree, st.first)) {
          continue;
        }
        // redundant_single_element_character_class?
        const elem = tree.text(st.first);
        let ws = false;
        for (let i = 0; i < toI32(elem.length); i++) {
          if (rbLitSpaceC(elem.charCodeAt(i))) {
            ws = true;
          }
        }
        if (ext && ws) {
          continue;
        }
        if (elem === "\\b") {
          continue;
        }
        if (elem.length === 2 && elem.charCodeAt(0) === 92 && elem.charCodeAt(1) >= 49 && elem.charCodeAt(1) <= 57) {
          continue;
        }
        if (elem.length === 1 && ".*+?{}()|$".indexOf(elem) >= 0) {
          continue;
        }
        const s = be + st.s;
        const e = be + st.bodyE;
        const k = this.c.offense(s, e);
        if (k === null) {
          continue;
        }
        // without_character_class
        const source = src.src(s, e);
        const inner = src.src(s + 1, e - 1);
        k.replace(s, e, source === "[#]" ? `\\${inner}` : inner);
        this.c.commit(k);
      }
    }
  }
}
