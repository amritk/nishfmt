// Layout/TrailingWhitespace (AllowInHeredoc: false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_BODY, NT_DSTR, NT_STR, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayBlank, rbLayRxSpace } from "./layout_empty_help";

/** Heredoc#indent_level of the body [s, e): the shortest leading \s run of a line that is not all whitespace. */
const rbTrailWsIndentLevel = (src: RbSource, s: i32, e: i32): i32 => {
  let best = -1;
  let p = s;
  while (p < e) {
    let q = p;
    while (q < e && src.pts[q] !== 10) {
      q++;
    }
    const hasNl = q < e;
    let w = p;
    while (w < q && rbLayRxSpace(src.pts[w])) {
      w++;
    }
    // The match runs on over the newline when the line is all whitespace.
    if (!(w === q && hasNl)) {
      const size = w - p;
      if (best < 0 || size < best) {
        best = size;
      }
    }
    p = hasNl ? q + 1 : q;
  }
  return best < 0 ? 0 : best;
};

export class CopLayoutTrailingWhitespace {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/TrailingWhitespace");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    // extract_heredocs: [node, body.first_line...body.last_line], pre-order.
    const hNode: i32[] = [];
    const hFrom: i32[] = [];
    const hTo: i32[] = [];
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, n)) {
        hNode.push(n);
        hFrom.push(src.line(rnS(src, n, F_HEREDOC_BODY)));
        hTo.push(src.line(rnE(src, n, F_HEREDOC_BODY)));
      }
    }
    for (let ix = 0; ix < L.n; ix++) {
      const ls = L.s[ix];
      const le = L.e[ix];
      if (le === ls || !rbLayBlank(src.pts[le - 1])) {
        continue;
      }
      const lineno = ix + 1;
      let rs = le;
      while (rs > ls && rbLayBlank(src.pts[rs - 1])) {
        rs--;
      }
      let h = -1;
      for (let i = 0; i < toI32(hNode.length); i++) {
        if (lineno >= hFrom[i] && lineno < hTo[i]) {
          h = i;
          break;
        }
      }
      const k = this.c.offense(rs, le);
      if (k === null) {
        continue;
      }
      if (h < 0) {
        k.remove(rs, le);
        this.c.commit(k);
        continue;
      }
      // process_line_in_heredoc
      const hn = hNode[h];
      const level = rbTrailWsIndentLevel(src, rnS(src, hn, F_HEREDOC_BODY), rnE(src, hn, F_HEREDOC_BODY));
      // whitespace_only?: range_with_surrounding_space starts and ends with a newline.
      let b = rs;
      while (src.at(b - 1) === 32 || src.at(b - 1) === 9) {
        b--;
      }
      let f = le;
      while (src.at(f) === 32 || src.at(f) === 9) {
        f++;
      }
      const wsOnly = src.at(b - 1) === 10 && src.at(f) === 10;
      if (wsOnly && le - rs <= level) {
        k.remove(rs, le);
      } else if (!src.nodeSrc(hn).endsWith("'")) {
        const ws = wsOnly ? rs + level : rs;
        k.wrap(ws, le, "#{'", "'}");
      }
      this.c.commit(k);
    }
  }
}
