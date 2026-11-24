// Style/NumericLiterals (MinDigits: 5, Strict: false, no allowed numbers or patterns).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import { NT_FLOAT, NT_INT } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitSpaceC } from "./lit_help";

/** The index of the first `e`, `E` or `.` (/[eE.]/), or -1. */
const rbNlDelim = (s: string): i32 => {
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c === 101 || c === 69 || c === 46) {
      return i;
    }
  }
  return -1;
};

/** IntegerNode#integer_part: the source without a sign, up to the first [eE.]. */
export const rbNlIntegerPart = (source: string): string => {
  let s = source;
  if (s.startsWith("+") || s.startsWith("-")) {
    s = s.substring(1, toI32(s.length));
  }
  const d = rbNlDelim(s);
  return d < 0 ? s : s.substring(0, d);
};

const rbNlDigit = (c: i32): boolean => c >= 48 && c <= 57;

export class CopStyleNumericLiterals {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NumericLiterals");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_INT && t !== NT_FLOAT) {
        continue;
      }
      const source = src.nodeSrc(n);
      const int = rbNlIntegerPart(source);
      const k0 = toI32(int.length);
      if (int.startsWith("0") || k0 < 5) {
        continue;
      }
      // /^\d+$/, /\d{4}/, /_\d{1,2}_/
      let allDigits = true;
      let run = 0;
      let four = false;
      for (let i = 0; i < k0; i++) {
        const c = int.charCodeAt(i);
        if (rbNlDigit(c)) {
          run = add32(run, 1);
          if (run >= 4) {
            four = true;
          }
        } else {
          allDigits = false;
          run = 0;
        }
      }
      let short = false;
      for (let i = 0; i < k0; i++) {
        if (int.charCodeAt(i) !== 95) {
          continue;
        }
        let j = i + 1;
        while (j < k0 && rbNlDigit(int.charCodeAt(j))) {
          j++;
        }
        if (j - i - 1 >= 1 && j - i - 1 <= 2 && j < k0 && int.charCodeAt(j) === 95) {
          short = true;
        }
      }
      if (!allDigits && !four && !short) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), this.format(source));
        this.c.commit(k);
      }
    }
  }

  /** format_number */
  private format(source0: string): string {
    const ws: string[] = [];
    for (let i = 0; i < toI32(source0.length); i++) {
      const c = source0.charCodeAt(i);
      if (!rbLitSpaceC(c)) {
        ws.push(String.fromCharCode(c));
      }
    }
    const source = ws.join("");
    const d = rbNlDelim(source);
    const intPart = d < 0 ? source : source.substring(0, d);
    // format_int_part: Integer(int_part), its digits grouped by three.
    const neg = intPart.startsWith("-");
    const digits: string[] = [];
    for (let i = 0; i < toI32(intPart.length); i++) {
      const c = intPart.charCodeAt(i);
      if (rbNlDigit(c)) {
        digits.push(String.fromCharCode(c));
      }
    }
    // Integer() drops leading zeros
    let st = 0;
    while (st < digits.length - 1 && digits[st] === "0") {
      st++;
    }
    const out: string[] = [];
    if (neg) {
      out.push("-");
    }
    // Digit di of the m = dl - st kept, i = di - st into them: m - i = dl - di.
    const dl = toI32(digits.length);
    for (let di = st; di >= 0 && di < digits.length; di++) {
      const dg = digits[di];
      if (di > st && (dl - di) % 3 === 0) {
        out.push("_");
      }
      out.push(dg);
    }
    if (d >= 0) {
      out.push(source.substring(d, toI32(source.length)));
    }
    return out.join("");
  }
}
