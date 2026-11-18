// Lint/PercentStringArray (unsafe; detection only): quotes or commas in a
// %w/%W element, or a quoted string split at whitespace.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARRAY, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitChars, rbLitIsPercent, rbLitPctType } from "./lit_help";
import { rbLitUAlnum } from "./lit_unicode";

/** unclosed_quote: the opening quote of a source that does not end with it, or -1. */
const lpsaUnclosed = (cs: i32[]): i32 => {
  const n = toI32(cs.length);
  if (n === 0) {
    return -1;
  }
  const q = cs[0];
  if (q !== 39 && q !== 34) {
    return -1;
  }
  return n > 1 && cs[n - 1] !== q ? q : -1;
};

/** closing_quote?. */
const lpsaClosing = (cs: i32[], q: i32): boolean => {
  const n = toI32(cs.length);
  return n > 0 && cs[n - 1] === q && (n === 1 || cs[0] !== q);
};

/** QUOTES_AND_COMMAS: /,$/, /^'.*'$/ or /^".*"$/ on some line of the value. */
const lpsaQuotesOrCommas = (cs: i32[]): boolean => {
  const n = toI32(cs.length);
  let s = 0;
  while (s <= n) {
    let e = s;
    while (e < n && cs[e] !== 10) {
      e++;
    }
    if (e > s && cs[e - 1] === 44) {
      return true;
    }
    if (e - s >= 2 && (cs[s] === 39 || cs[s] === 34) && cs[e - 1] === cs[s]) {
      return true;
    }
    s = e + 1;
  }
  return false;
};

export class CopLintPercentStringArray {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/PercentStringArray");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY || !rbLitIsPercent(src, n)) {
        continue;
      }
      const ty = rbLitPctType(src, n);
      if (ty !== "%w" && ty !== "%W") {
        continue;
      }
      if (this.splitQuoted(src, n) || this.quotesOrCommas(src, n)) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }

  /** split_quoted_string?. */
  private splitQuoted(src: RbSource, n: i32): boolean {
    const a = src.a;
    const srcs: i32[][] = [];
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      let e = a.exE(k);
      if (e > a.exS(k) && src.at(e - 1) === 44) {
        e--;
      }
      const cs: i32[] = [];
      for (let j = a.exS(k); j < e; j++) {
        cs.push(src.at(j));
      }
      srcs.push(cs);
    }
    for (let i = 0; i < toI32(srcs.length); i++) {
      const q = lpsaUnclosed(srcs[i]);
      if (q < 0) {
        continue;
      }
      for (let j = i + 1; j < toI32(srcs.length); j++) {
        if (lpsaClosing(srcs[j], q)) {
          return true;
        }
      }
    }
    return false;
  }

  /** contains_quotes_or_commas? (a dstr's first child prints as an S-expression, which never matches). */
  private quotesOrCommas(src: RbSource, n: i32): boolean {
    const a = src.a;
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (!a.isNode(k) || a.type(k) !== NT_STR) {
        continue;
      }
      const cs = rbLitChars(a.text(a.kid(k, 0)));
      let alnum = false;
      for (const c of cs) {
        if (rbLitUAlnum(c)) {
          alnum = true;
        }
      }
      if (alnum && lpsaQuotesOrCommas(cs)) {
        return true;
      }
    }
    return false;
  }
}
