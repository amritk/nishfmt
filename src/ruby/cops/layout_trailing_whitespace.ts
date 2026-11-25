// Layout/TrailingWhitespace (AllowInHeredoc: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_BODY, NT_DSTR, NT_STR, NT_XSTR } from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rnE, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayBlank, rbLayRxSpace } from "./layout_empty_help";

/** Heredoc#indent_level of the body [s, e): the shortest leading \s run of a line that is not all whitespace. */
const rbTrailWsIndentLevel = (src: RbSource, s: i32, e: i32): i32 => {
  const pts = src.pts;
  let best = -1;
  let p = s;
  while (p < e) {
    let q = p;
    while (q < e) {
      // A heredoc body lies in the source.
      if (q < 0 || q >= pts.length) {
        fault();
        return 0;
      }
      if (pts[q] === 10) {
        break;
      }
      q++;
    }
    const hasNl = q < e;
    let w = p;
    while (w >= 0 && w < q && w < pts.length && rbLayRxSpace(pts[w])) {
      w++;
    }
    // The match runs on over the newline when the line is all whitespace.
    if (!(w === q && hasNl)) {
      const size = sub32(w, p);
      if (best < 0 || size < best) {
        best = size;
      }
    }
    if (q < e) {
      p = q + 1;
    } else {
      p = q;
    }
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
    const pts = src.pts;
    const lsArr = L.s;
    const leArr = L.e;
    for (let ix = 0; ix < L.n; ix++) {
      // L holds n lines.
      if (ix < 0 || ix >= lsArr.length || ix >= leArr.length) {
        fault();
        return;
      }
      const ls = lsArr[ix];
      const le = leArr[ix];
      if (le === ls) {
        continue;
      }
      // A line lies in the source.
      if (le <= 0 || le > pts.length) {
        fault();
        return;
      }
      if (!rbLayBlank(pts[le - 1])) {
        continue;
      }
      const lineno = ix + 1;
      let rs = le;
      while (rs > ls && rs > 0 && rs <= pts.length && rbLayBlank(pts[rs - 1])) {
        rs--;
      }
      if (rs > ls && (rs <= 0 || rs > pts.length)) {
        fault();
        return;
      }
      let h = -1;
      for (let i = 0; i < toI32(hNode.length) && i < hFrom.length && i < hTo.length; i++) {
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
      const hn = atI32(hNode, h);
      const level = rbTrailWsIndentLevel(src, rnS(src, hn, F_HEREDOC_BODY), rnE(src, hn, F_HEREDOC_BODY));
      // whitespace_only?: range_with_surrounding_space starts and ends with a newline.
      // src.at answers -1 outside the source, which ends both scans.
      let b = rs;
      while (b > 0 && (src.at(b - 1) === 32 || src.at(b - 1) === 9)) {
        b--;
      }
      const n = src.n;
      let f = le;
      while (f < n && (src.at(f) === 32 || src.at(f) === 9)) {
        f++;
      }
      const wsOnly = src.at(sub32(b, 1)) === 10 && src.at(f) === 10;
      if (wsOnly && sub32(le, rs) <= level) {
        k.remove(rs, le);
      } else if (!src.nodeSrc(hn).endsWith("'")) {
        const ws = wsOnly ? add32(rs, level) : rs;
        k.wrap(ws, le, "#{'", "'}");
      }
      this.c.commit(k);
    }
  }
}
