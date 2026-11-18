// Layout/IndentationStyle (EnforcedStyle: spaces).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_HEREDOC_BODY, NT_DSTR, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnHeredoc, rnS } from "../node";
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
    for (let i = 0; i < L.n; i++) {
      const s = L.s[i];
      const e = L.e[i];
      // /\A\s*\t+/: the leading whitespace up to its last tab
      let p = s;
      let end = -1;
      while (p < e && lalIsWs(src.pts[p])) {
        if (src.pts[p] === 9) {
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
          if (t !== NT_STR && t !== NT_DSTR) {
            continue;
          }
          if (rnHeredoc(src, n)) {
            rs.push(rnS(src, n, F_HEREDOC_BODY));
            re.push(rnE(src, n, F_HEREDOC_BODY));
          } else if (rnHas(src, n, F_BEGIN)) {
            rs.push(a.exS(n));
            re.push(a.exE(n));
          }
        }
      }
      let inside = false;
      for (let j = 0; j < toI32(rs.length); j++) {
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
        for (let q = s; q < end; q++) {
          out.push(src.pts[q] === 9 ? "  " : src.src(q, q + 1));
        }
        k.replace(s, end, out.join(""));
        this.c.commit(k);
      }
    }
  }
}
