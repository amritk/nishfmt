// Style/WordArray (EnforcedStyle: percent, MinSize: 2, the default WordRegex).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { add32, atI32 } from "../../core/arr";
import { F_BEGIN, NT_ARRAY, NT_DSTR, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { rbToStringLiteral, rbValidUtf8 } from "../util";
import {
  rbLitAllowedBracketArray,
  rbLitBracketed,
  rbLitBracketedArrayOf,
  rbLitInterpolatedLiteral,
  rbLitChars,
  rbLitPercentCorrect,
} from "./lit_help";
import { rbLitUWord } from "./lit_unicode";

/** WordRegex /\A(?:\p{Word}|\p{Word}-\p{Word}|\n|\t)+\z/ on a valid UTF-8 string. */
const rbWaWordMatch = (s: string): boolean => {
  const cs = rbLitChars(s);
  const n = toI32(cs.length);
  if (n === 0) {
    return false;
  }
  const reach: boolean[] = [];
  // reach[0..n]: whether the match can stand at each index.
  reach.push(true);
  for (let i = 0; i < n; i++) {
    reach.push(false);
  }
  for (let i = 0; i < n && i < cs.length && i < reach.length; i++) {
    if (!reach[i]) {
      continue;
    }
    const c = cs[i];
    const i1 = i + 1;
    if (rbLitUWord(c) || c === 10 || c === 9) {
      if (i1 >= reach.length) {
        fault();
        return false;
      }
      reach[i1] = true;
    }
    if (rbLitUWord(c) && toI64(i) + toI64(2) < toI64(n) && atI32(cs, i1) === 45 && rbLitUWord(atI32(cs, add32(i, 2)))) {
      const i3 = add32(i, 3);
      if (i3 < 0 || i3 >= reach.length) {
        fault();
        return false;
      }
      reach[i3] = true;
    }
  }
  if (n >= reach.length) {
    fault();
    return false;
  }
  return reach[n];
};

/** WordArray#complex_content? over the str children of `n` (`regex`: also test WordRegex). */
const rbWaComplex = (src: RbSource, n: i32, regex: boolean): boolean => {
  const a = src.a;
  for (let i = 0; i < a.nKid(n); i++) {
    const s = a.kid(n, i);
    if (!a.isNode(s) || a.type(s) !== NT_STR) {
      continue;
    }
    const v = a.text(a.kid(s, 0));
    if (!rbValidUtf8(v) || (regex && !rbWaWordMatch(v)) || v.indexOf(" ") >= 0) {
      return true;
    }
  }
  return false;
};

export class CopStyleWordArray {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/WordArray");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY) {
        continue;
      }
      if (rbLitBracketedArrayOf(src, n, NT_STR)) {
        let heredoc = false;
        for (let i = 0; i < a.nKid(n); i++) {
          if (rnHeredoc(src, a.kid(n, i))) {
            heredoc = true;
          }
        }
        if (heredoc || rbWaComplex(src, n, true)) {
          continue;
        }
        // within_matrix_of_complex_content?
        const p = src.parent(n);
        if (p !== V_NIL && a.type(p) === NT_ARRAY) {
          let allArrays = true;
          let anyComplex = false;
          for (let i = 0; i < a.nKid(p); i++) {
            const sub = a.kid(p, i);
            if (!a.isNode(sub) || a.type(sub) !== NT_ARRAY) {
              allArrays = false;
              break;
            }
            if (rbWaComplex(src, sub, true)) {
              anyComplex = true;
            }
          }
          if (allArrays && anyComplex) {
            continue;
          }
        }
        if (rbLitAllowedBracketArray(src, n)) {
          continue;
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.replace(a.exS(n), a.exE(n), rbLitPercentCorrect(src, n, "w", false));
          this.c.commit(k);
        }
      } else if (rnHas(src, n, F_BEGIN)) {
        const b = src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN));
        if (!(b.startsWith("%w") || b.startsWith("%W"))) {
          continue;
        }
        if (!rbWaComplex(src, n, false)) {
          continue;
        }
        let out = "[]";
        if (a.nKid(n) > 0) {
          const words: string[] = [];
          for (let i = 0; i < a.nKid(n); i++) {
            const w = a.kid(n, i);
            if (a.type(w) === NT_DSTR) {
              words.push(rbLitInterpolatedLiteral(src, w));
            } else {
              words.push(rbToStringLiteral(a.text(a.kid(w, 0))));
            }
          }
          out = rbLitBracketed(src, n, words);
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.replace(a.exS(n), a.exE(n), out);
          this.c.commit(k);
        }
      }
    }
  }
}
