// Layout/SpaceInsideHashLiteralBraces (EnforcedStyle: space,
// EnforcedStyleForEmptyBraces: no_space).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_HASH, NT_HASH_PATTERN } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource, TK_COMMENT } from "../source";
import { TK_tLBRACE, TK_tRCURLY } from "../tables";
import { LspToks, lspHasNonWs, lspHasWs, lspIsBlank, lspSpaceAfter } from "./layout_space_help";

export class CopLayoutSpaceInsideHashLiteralBraces {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideHashLiteralBraces");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const tk = new LspToks(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_HASH && t !== NT_HASH_PATTERN) {
        continue;
      }
      const from = tk.withinFrom(a.exS(n));
      const to = tk.withinTo(a.exE(n));
      if (to < from || tk.t[from] !== TK_tLBRACE || tk.t[to] !== TK_tRCURLY) {
        continue;
      }
      this.check(src, tk, from, from + 1);
      if (to - from + 1 > 2) {
        this.check(src, tk, to - 1, to);
      }
      this.checkWhitespaceOnly(src, n);
    }
  }

  private check(src: RbSource, tk: LspToks, i1: i32, i2: i32): void {
    if (src.line(tk.s[i1]) < src.line(tk.s[i2])) {
      return;
    }
    if (tk.t[i2] === TK_COMMENT) {
      return;
    }
    const left1 = tk.t[i1] === TK_tLBRACE;
    const empty = left1 && tk.t[i2] === TK_tRCURLY;
    const expect = !empty;
    const has = lspSpaceAfter(src, tk.e[i1]);
    if (expect === has) {
      return;
    }
    const bi = left1 ? i1 : i2;
    const bs = tk.s[bi];
    const be = tk.e[bi];
    const isOpen = src.src(bs, be) === "{";
    let rs = bs;
    let re = be;
    if (!expect) {
      if (isOpen) {
        let e = be;
        while (lspIsBlank(src.at(e))) {
          e++;
        }
        rs = bs + 1;
        re = e;
      } else {
        let b = bs;
        while (lspIsBlank(src.at(b - 1))) {
          b--;
        }
        rs = b;
        re = be - 1;
      }
    }
    const k = this.c.offense(rs, re);
    if (k === null) {
      return;
    }
    if (lspHasWs(src, rs, re)) {
      k.remove(rs, re);
    } else if (src.src(rs, re) === "{") {
      k.insertAfter(rs, re, " ");
    } else {
      k.insertBefore(rs, re, " ");
    }
    this.c.commit(k);
  }

  private checkWhitespaceOnly(src: RbSource, n: i32): void {
    const a = src.a;
    let s = a.exS(n);
    let e = a.exE(n);
    if (rnHas(src, n, F_BEGIN)) {
      s = rnE(src, n, F_BEGIN);
      e = rnS(src, n, F_END);
    }
    // /\A\s+\z/m
    if (e <= s || lspHasNonWs(src, s, e)) {
      return;
    }
    const k = this.c.offense(s, e);
    if (k !== null) {
      k.remove(s, e);
      this.c.commit(k);
    }
  }
}
