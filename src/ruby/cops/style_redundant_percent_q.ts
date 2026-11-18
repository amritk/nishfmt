// Style/RedundantPercentQ.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_DSTR, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { rbDoubleQuotesRequired } from "../util";

/** /#\{.+\}/: `#{`, then at least one character and a `}` on the same line. */
export const rbRpqInterpolation = (s: string): boolean => {
  const n = toI32(s.length);
  let i = s.indexOf("#{");
  while (i >= 0) {
    for (let j = i + 2; j < n; j++) {
      const c = s.charCodeAt(j);
      if (c === 10) {
        break;
      }
      if (c === 125 && j > i + 2) {
        return true;
      }
    }
    const nx = s.substring(i + 1, n).indexOf("#{");
    i = nx < 0 ? -1 : i + 1 + nx;
  }
  return false;
};

/** src.scan(/\\./).any?(/\\[^\\]/): an escape (not of a newline) of a character other than a backslash. */
const rbRpqEscapedNonBackslash = (s: string): boolean => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    if (s.charCodeAt(i) === 92 && i + 1 < n && s.charCodeAt(i + 1) !== 10) {
      if (s.charCodeAt(i + 1) !== 92) {
        return true;
      }
      i += 2;
      continue;
    }
    i++;
  }
  return false;
};

export class CopStyleRedundantPercentQ {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantPercentQ");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t !== NT_STR && t !== NT_DSTR) || !rnHas(src, n, F_BEGIN) || !rnHas(src, n, F_END)) {
        continue;
      }
      const source = src.nodeSrc(n);
      if (!source.startsWith("%q") && !source.startsWith("%Q")) {
        continue;
      }
      const sq = source.indexOf("'") >= 0;
      const dq = source.indexOf('"') >= 0;
      if (sq && dq) {
        continue;
      }
      // allowed_percent_q?
      if (source.startsWith("%q")) {
        if ((rbRpqInterpolation(source) && sq) || rbRpqEscapedNonBackslash(source)) {
          continue;
        }
      } else if (dq && (rbRpqInterpolation(source) || (t === NT_STR && rbDoubleQuotesRequired(source)))) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // /\A%Q[^"]+\z|'/
      const delimiter = (source.startsWith("%Q") && source.length > 2 && !dq) || sq ? '"' : "'";
      k.replace(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN), delimiter);
      k.replace(rnS(src, n, F_END), rnE(src, n, F_END), delimiter);
      this.c.commit(k);
    }
  }
}
