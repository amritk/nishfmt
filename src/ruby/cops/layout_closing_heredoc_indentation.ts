// Layout/ClosingHeredocIndentation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_END, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rmlIsArgument, rmlIsChained, rmlIsHeredoc, rmlSpaces } from "./layout_multiline_help";

/** The leading spaces of the line holding `pos` (the length of source_line[/\A +/], or 0). */
const rmlChiIndent = (src: RbSource, pos: i32): i32 => {
  const s = src.lineStart(src.line(pos));
  const e = src.lineEnd(src.line(pos));
  let i = s;
  while (i < e && src.at(i) === 32) {
    i++;
  }
  return i - s;
};

export class CopLayoutClosingHeredocIndentation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/ClosingHeredocIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!rmlIsHeredoc(src, n)) {
        continue;
      }
      const ns = a.exS(n);
      const ty = src.at(ns + 2);
      if (ty !== 126 && ty !== 45) {
        continue; // a simple `<<` heredoc
      }
      const es = rnS(src, n, F_HEREDOC_END);
      const ee = rnE(src, n, F_HEREDOC_END);
      const opening = rmlChiIndent(src, ns);
      const closing = rmlChiIndent(src, es);
      if (opening === closing) {
        continue;
      }
      if (rmlIsArgument(src, n) || rmlIsChained(src, n)) {
        // find_node_used_heredoc_argument(node.parent)
        let u = src.parent(n);
        while (true) {
          const p = src.parent(u);
          if (p === V_NIL || a.type(p) !== NT_SEND) {
            break;
          }
          u = p;
        }
        if (rmlChiIndent(src, a.exS(u)) === closing) {
          continue;
        }
      }
      const k = this.c.offense(es, ee);
      if (k === null) {
        continue;
      }
      const l = src.line(es);
      const ls = src.lineStart(l);
      k.replace(es, ee, `${rmlSpaces(opening)}${src.src(ls + closing, src.lineEnd(l))}`);
      this.c.commit(k);
    }
  }
}
