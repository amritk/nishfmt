// The Layout cops about the space inside percent literals:
// SpaceInsidePercentLiteralDelimiters and SpaceInsideArrayPercentLiteral
// (PercentLiteral and MatchRange mixins).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_ARRAY, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnFieldSrc, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { lspIsWs } from "./layout_space_help";

/** PercentLiteral#process: a percent literal of one of the types ("%w,%W,%i,%I" or "%x"). */
const lspPercentOf = (src: RbSource, n: i32, types: string): boolean => {
  if (!rnHas(src, n, F_BEGIN)) {
    return false;
  }
  const b = rnFieldSrc(src, n, F_BEGIN);
  if (!b.startsWith("%")) {
    return false;
  }
  const ty = b.substring(0, toI32(b.length) - 1);
  return `,${types},`.indexOf(`,${ty},`) >= 0;
};

export class CopLayoutSpaceInsidePercentLiteralDelimiters {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsidePercentLiteralDelimiters");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_ARRAY) {
        if (!lspPercentOf(src, n, "%i,%I,%w,%W")) {
          continue;
        }
      } else if (t === NT_XSTR) {
        if (!lspPercentOf(src, n, "%x")) {
          continue;
        }
      } else {
        continue;
      }
      const s = rnE(src, n, F_BEGIN);
      const e = rnS(src, n, F_END);
      // add_offenses_for_blank_spaces: String#strip also drops NULs.
      if (e > s) {
        let blank = true;
        for (let i = s; i < e; i++) {
          const ch = src.at(i);
          if (!lspIsWs(ch) && ch !== 0) {
            blank = false;
            break;
          }
        }
        if (blank) {
          this.remove(s, e);
        }
      }
      // add_offenses_for_unnecessary_spaces
      if (src.line(a.exS(n)) !== src.line(a.exE(n))) {
        continue;
      }
      // /\A( +)/
      let i = s;
      while (i < e && src.at(i) === 32) {
        i++;
      }
      if (i > s) {
        this.remove(s, i);
      }
      // /(?<!\\)( +)\z/
      let j = e;
      while (j > s && src.at(j - 1) === 32) {
        j--;
      }
      if (j < e) {
        let st = j;
        if (st > s && src.at(st - 1) === 92) {
          st++;
        }
        if (st < e) {
          this.remove(st, e);
        }
      }
    }
  }

  private remove(s: i32, e: i32): void {
    const k = this.c.offense(s, e);
    if (k !== null) {
      k.remove(s, e);
      this.c.commit(k);
    }
  }
}

export class CopLayoutSpaceInsideArrayPercentLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideArrayPercentLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY || !lspPercentOf(src, n, "%i,%I,%w,%W")) {
        continue;
      }
      const s = rnE(src, n, F_BEGIN);
      const e = rnS(src, n, F_END);
      // /(?:[\S&&[^\\]](?:\\ )*)( {2,})(?=\S)/ scanned over the contents.
      let p = s;
      while (p < e) {
        const c0 = src.at(p);
        if (lspIsWs(c0) || c0 === 92) {
          p++;
          continue;
        }
        let j = p + 1;
        while (j + 1 < e && src.at(j) === 92 && src.at(j + 1) === 32) {
          j += 2;
        }
        let k = j;
        while (k < e && src.at(k) === 32) {
          k++;
        }
        if (k - j >= 2 && k < e && !lspIsWs(src.at(k))) {
          const r = this.c.offense(j, k);
          if (r !== null) {
            r.replace(j, k, " ");
            this.c.commit(r);
          }
          p = k;
        } else {
          p++;
        }
      }
    }
  }
}
