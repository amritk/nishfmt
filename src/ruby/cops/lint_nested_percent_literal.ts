// Lint/NestedPercentLiteral (no correction): a %w/%W/%i/%I element that
// starts like a percent literal (`%w(`, `%(`, ...) and is not a whole format
// sequence.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARRAY, NT_STR, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitChars, rbLitIsPercent, rbLitPctType, rbLitWordC } from "./lit_help";

/** Adds p to ps unless it is there. */
const lnplAdd = (ps: i32[], p: i32): void => {
  for (const x of ps) {
    if (x === p) {
      return;
    }
  }
  ps.push(p);
};

const lnplDigit = (c: i32): boolean => c >= 48 && c <= 57;

/** The positions after `\d+\$` from p (none: empty). */
const lnplDigitDollar = (cs: i32[], p: i32, out: i32[]): void => {
  let i = p;
  while (i < toI32(cs.length) && lnplDigit(cs[i])) {
    i++;
  }
  if (i > p && i < toI32(cs.length) && cs[i] === 36) {
    lnplAdd(out, i + 1);
  }
};

/** FLAG*: every position reachable from p. */
const lnplFlags = (cs: i32[], p: i32): i32[] => {
  const out: i32[] = [p];
  for (let k = 0; k < toI32(out.length); k++) {
    const q = out[k];
    if (q < toI32(cs.length)) {
      const c = cs[q];
      if (c === 32 || c === 35 || c === 48 || c === 43 || c === 45) {
        lnplAdd(out, q + 1);
      }
    }
    lnplDigitDollar(cs, q, out);
  }
  return out;
};

/** NUMBER from p: `\d+`, `\*(\d+\$)?` or `#\{.*?\}`. */
const lnplNumber = (cs: i32[], p: i32, out: i32[]): void => {
  const n = toI32(cs.length);
  let i = p;
  while (i < n && lnplDigit(cs[i])) {
    i++;
    lnplAdd(out, i);
  }
  if (p < n && cs[p] === 42) {
    lnplAdd(out, p + 1);
    lnplDigitDollar(cs, p + 1, out);
  }
  if (p + 1 < n && cs[p] === 35 && cs[p + 1] === 123) {
    for (let j = p + 2; j < n && cs[j] !== 10; j++) {
      if (cs[j] === 125) {
        lnplAdd(out, j + 1);
      }
    }
  }
};

/** WIDTH? from each of ps. */
const lnplWidthOpt = (cs: i32[], ps: i32[]): i32[] => {
  const out: i32[] = [];
  for (const p of ps) {
    lnplAdd(out, p);
    lnplNumber(cs, p, out);
  }
  return out;
};

/** PRECISION? (`\.NUMBER?`) from each of ps. */
const lnplPrecisionOpt = (cs: i32[], ps: i32[]): i32[] => {
  const out: i32[] = [];
  for (const p of ps) {
    lnplAdd(out, p);
    if (p < toI32(cs.length) && cs[p] === 46) {
      lnplAdd(out, p + 1);
      lnplNumber(cs, p + 1, out);
    }
  }
  return out;
};

/** NAME (`<\w+>`) from each of ps; with opt, also each p itself. */
const lnplName = (cs: i32[], ps: i32[], opt: boolean): i32[] => {
  const out: i32[] = [];
  for (const p of ps) {
    if (opt) {
      lnplAdd(out, p);
    }
    if (p < toI32(cs.length) && cs[p] === 60) {
      let i = p + 1;
      while (i < toI32(cs.length) && rbLitWordC(cs[i])) {
        i++;
      }
      if (i > p + 1 && i < toI32(cs.length) && cs[i] === 62) {
        lnplAdd(out, i + 1);
      }
    }
  }
  return out;
};

/** Whether TYPE ends the string at one of ps. */
const lnplTypeEnds = (cs: i32[], ps: i32[]): boolean => {
  for (const p of ps) {
    if (p + 1 === toI32(cs.length) && cs[p] < 128 && "bBdiouxXeEfgGaAcps".indexOf(String.fromCharCode(cs[p])) >= 0) {
      return true;
    }
  }
  return false;
};

/** FORMAT_SEQUENCE: the whole string is one format sequence (Utils::FormatString::SEQUENCE). */
const lnplFormatSequence = (cs: i32[]): boolean => {
  const n = toI32(cs.length);
  if (n < 2 || cs[0] !== 37) {
    return false;
  }
  if (n === 2 && cs[1] === 37) {
    return true;
  }
  const f = lnplFlags(cs, 1);
  // WIDTH? PRECISION? NAME? TYPE
  if (lnplTypeEnds(cs, lnplName(cs, lnplPrecisionOpt(cs, lnplWidthOpt(cs, f)), true))) {
    return true;
  }
  // WIDTH? NAME PRECISION? TYPE
  if (lnplTypeEnds(cs, lnplPrecisionOpt(cs, lnplName(cs, lnplWidthOpt(cs, f), false)))) {
    return true;
  }
  // NAME FLAG* WIDTH? PRECISION? TYPE
  const nm = lnplName(cs, f, false);
  const nf: i32[] = [];
  for (const p of nm) {
    for (const q of lnplFlags(cs, p)) {
      lnplAdd(nf, q);
    }
  }
  if (lnplTypeEnds(cs, lnplPrecisionOpt(cs, lnplWidthOpt(cs, nf)))) {
    return true;
  }
  // WIDTH? PRECISION? TEMPLATE_NAME
  for (const p of lnplPrecisionOpt(cs, lnplWidthOpt(cs, f))) {
    if (p < n && cs[p] === 123 && cs[p - 1] !== 35) {
      let i = p + 1;
      while (i < n && rbLitWordC(cs[i])) {
        i++;
      }
      if (i > p + 1 && i === n - 1 && cs[i] === 125) {
        return true;
      }
    }
  }
  return false;
};

/** REGEXES: `/\A#{type}\W/` for a PERCENT_LITERAL_TYPES type. */
const lnplStartsLikeLiteral = (cs: i32[]): boolean => {
  const n = toI32(cs.length);
  if (n < 2 || cs[0] !== 37) {
    return false;
  }
  if (!rbLitWordC(cs[1])) {
    return true;
  }
  const c = cs[1];
  const typed = c === 105 || c === 73 || c === 113 || c === 81 || c === 114 || c === 115 || c === 119 || c === 87 || c === 120;
  return typed && n >= 3 && !rbLitWordC(cs[2]);
};

export class CopLintNestedPercentLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/NestedPercentLiteral");
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
      if (ty !== "%w" && ty !== "%W" && ty !== "%i" && ty !== "%I") {
        continue;
      }
      let hit = false;
      for (let i = 0; i < a.nKid(n) && !hit; i++) {
        const k = a.kid(n, i);
        if (!a.isNode(k)) {
          continue;
        }
        // child.children.first.to_s: a dstr's or dsym's first child prints as an S-expression
        const t = a.type(k);
        if (t !== NT_STR && t !== NT_SYM) {
          continue;
        }
        const cs = rbLitChars(a.text(a.kid(k, 0)));
        hit = !lnplFormatSequence(cs) && lnplStartsLikeLiteral(cs);
      }
      if (hit) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
