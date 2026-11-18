// Layout/BlockEndNewline.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_HEREDOC_END, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { rmlBeginsItsLine, rmlIsBlock, rmlIsCall, rmlLastNonNilChild, rmlSingleLine } from "./layout_multiline_help";
import { lspIsWs } from "./layout_space_help";

/** BlockEndNewline#last_heredoc_argument (V_NIL for none). */
const rmlBenHeredoc = (src: RbSource, n: i32): i32 => {
  if (n === V_NIL || !rmlIsCall(src, n)) {
    return V_NIL;
  }
  const a = src.a;
  for (let i = a.nKid(n) - 1; i >= 2; i--) {
    const x = a.kid(n, i);
    if (a.isNode(x) && a.type(x) === NT_STR && rnHeredoc(src, x)) {
      return x;
    }
  }
  return rmlBenHeredoc(src, a.kid(n, 0));
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
      while (i < ee && (lspIsWs(src.at(i)) || src.at(i) === 0)) {
        i++;
      }
      if (src.at(i) === 59) {
        continue;
      }
      const k = this.c.offense(es, ee);
      if (k === null) {
        continue;
      }
      const repl = `\n${src.src(i, ee)}`;
      const h = rmlBenHeredoc(src, a.kid(n, 2));
      if (h !== V_NIL) {
        k.remove(rs, ee);
        k.insertAfter(rnS(src, h, F_HEREDOC_END), rnE(src, h, F_HEREDOC_END), repl);
      } else {
        k.replace(rs, ee, repl);
      }
      this.c.commit(k);
    }
  }
}
