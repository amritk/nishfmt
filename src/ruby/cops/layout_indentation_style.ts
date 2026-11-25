// Layout/IndentationStyle (EnforcedStyle: spaces).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { F_BEGIN, F_HEREDOC_BODY, F_HEREDOC_END, NT_DSTR, NT_STR, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnHas, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { lalIsWs } from "./layout_align_help";
import { RbLayLines } from "./layout_empty_help";

export class CopLayoutIndentationStyle {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/IndentationStyle");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    let ready = false;
    const rs: i32[] = [];
    const re: i32[] = [];
    const ls = L.s;
    const le = L.e;
    const pts = src.pts;
    for (let i = 0; i < L.n && i < ls.length && i < le.length; i++) {
      const s = ls[i];
      const e = le[i];
      // /\A\s*\t+/: the leading whitespace up to its last tab
      let p = s;
      let end = -1;
      if (p < 0 && p < e) {
        fault();
        return;
      }
      while (p >= 0 && p < e && p < pts.length && lalIsWs(pts[p])) {
        if (pts[p] === 9) {
          end = p + 1;
        }
        p++;
      }
      if (end < 0) {
        continue;
      }
      if (!ready) {
        ready = true;
        for (const n of src.pre) {
          const t = a.type(n);
          // each_node(:any_str)
          if (t !== NT_STR && t !== NT_DSTR && t !== NT_XSTR) {
            continue;
          }
          if (rnHeredoc(src, n)) {
            // heredoc_body.join(heredoc_end.begin)
            rs.push(rnS(src, n, F_HEREDOC_BODY));
            re.push(rnS(src, n, F_HEREDOC_END));
          } else if (rnHas(src, n, F_BEGIN)) {
            rs.push(a.exS(n));
            re.push(a.exE(n));
          }
        }
      }
      let inside = false;
      for (let j = 0; j < rs.length && j < re.length; j++) {
        if (s >= rs[j] && end <= re[j]) {
          inside = true;
          break;
        }
      }
      if (inside) {
        continue;
      }
      const k = this.c.offense(s, end);
      if (k !== null) {
        const out: string[] = [];
        for (let q = s; q >= 0 && q < end && q < pts.length; q++) {
          out.push(pts[q] === 9 ? "  " : src.src(q, q + 1));
        }
        k.replace(s, end, out.join(""));
        this.c.commit(k);
      }
    }
  }
}
