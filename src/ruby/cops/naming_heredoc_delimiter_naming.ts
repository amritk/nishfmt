// Naming/HeredocDelimiterNaming (detection only; ForbiddenDelimiters:
// [/(^|\s)(EO[A-Z]{1}|END)(\s|$)/i]).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_END, NT_DSTR, NT_STR, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { nhdcDelimiter } from "./naming_heredoc_delimiter_case";
import { ssxFE, ssxFS, ssxIsWord } from "./style_syntax_help";

/** `\s`. */
const nhdnSpace = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** An ASCII letter, either case. */
const nhdnLetter = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Upcases an ASCII letter. */
const nhdnUp = (c: i32): i32 => (c >= 97 && c <= 122 ? c - 32 : c);

/** The forbidden delimiter regexp matches somewhere in `s`. */
const nhdnForbidden = (s: string): boolean => {
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    if (i > 0 && !nhdnSpace(s.charCodeAt(i - 1))) {
      continue;
    }
    let e = -1;
    if (i + 1 < n && nhdnUp(s.charCodeAt(i)) === 69 && nhdnUp(s.charCodeAt(i + 1)) === 79) {
      // EO[A-Z] (or END, whose D is a letter too)
      if (i + 2 < n && nhdnLetter(s.charCodeAt(i + 2))) {
        e = i + 3;
      }
    }
    if (
      e < 0 &&
      i + 2 < n &&
      nhdnUp(s.charCodeAt(i)) === 69 &&
      nhdnUp(s.charCodeAt(i + 1)) === 78 &&
      nhdnUp(s.charCodeAt(i + 2)) === 68
    ) {
      e = i + 3;
    }
    if (e >= 0 && (e === n || nhdnSpace(s.charCodeAt(e)))) {
      return true;
    }
  }
  return false;
};

/** meaningful_delimiters?: a word character, and no forbidden delimiter. */
const nhdnMeaningful = (d: string): boolean => {
  let word = false;
  for (let i = 0; i < toI32(d.length); i++) {
    if (ssxIsWord(d.charCodeAt(i))) {
      word = true;
    }
  }
  return word && !nhdnForbidden(d);
};

export class CopNamingHeredocDelimiterNaming {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/HeredocDelimiterNaming");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (!(t === NT_STR || t === NT_DSTR || t === NT_XSTR) || !rnHeredoc(src, n)) {
        continue;
      }
      if (nhdnMeaningful(nhdcDelimiter(src.nodeSrc(n)))) {
        continue;
      }
      if (a.nKid(n) === 0) {
        this.c.offense(a.exS(n), a.exE(n));
      } else {
        this.c.offense(ssxFS(src, n, F_HEREDOC_END), ssxFE(src, n, F_HEREDOC_END));
      }
    }
  }
}
