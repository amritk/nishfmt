// Lint/FloatOutOfRange (no correction), and the decimal analysis of a numeric
// literal it and Lint/FloatComparison share.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_FLOAT } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

/** Whether the significant digits d (no leading zeros) compare >= the digits t (as 0.d vs 0.t). */
const lforDigitsAtLeast = (d: string, t: string): boolean => {
  const n = d.length > t.length ? toI32(d.length) : toI32(t.length);
  for (let i = 0; i < n; i++) {
    const x = i < toI32(d.length) ? d.charCodeAt(i) : 48;
    const y = i < toI32(t.length) ? t.charCodeAt(i) : 48;
    if (x !== y) {
      return x > y;
    }
  }
  return true;
};

/**
 * How Ruby reads a decimal numeric literal's source: 0 when its value is
 * zero (underflow included), 2 when it overflows to Infinity, 1 otherwise.
 * A `0x`/`0b`/`0o`/`0d` integer is judged by its digits.
 */
export const lforFloatClass = (s: string): i32 => {
  const k = toI32(s.length);
  let i = 0;
  if (i < k && (s.charCodeAt(i) === 45 || s.charCodeAt(i) === 43)) {
    i++;
  }
  let hex = false;
  if (i + 1 < k && s.charCodeAt(i) === 48) {
    const c = s.charCodeAt(i + 1) | 32;
    if (c === 120 || c === 98 || c === 111 || c === 100) {
      hex = c === 120;
      i += 2;
    }
  }
  // The significant digits and the decimal exponent E (value = 0.digits * 10^E).
  const dig: string[] = [];
  let intDigits = 0;
  let seenDot = false;
  let leadZerosAfterDot = 0;
  let exp = 0;
  while (i < k) {
    const c = s.charCodeAt(i);
    if (c === 95) {
      i++;
      continue;
    }
    if (c === 46 && !hex) {
      seenDot = true;
      i++;
      continue;
    }
    const isDigit = (c >= 48 && c <= 57) || (hex && ((c | 32) >= 97 && (c | 32) <= 102));
    if (!isDigit) {
      break;
    }
    if (dig.length === 0 && c === 48) {
      if (seenDot) {
        leadZerosAfterDot++;
      }
    } else {
      dig.push(String.fromCharCode(c));
      if (!seenDot) {
        intDigits++;
      }
    }
    i++;
  }
  if (dig.length === 0) {
    return 0;
  }
  if (hex) {
    return 1;
  }
  if (i < k && (s.charCodeAt(i) | 32) === 101) {
    i++;
    let neg = false;
    if (i < k && (s.charCodeAt(i) === 45 || s.charCodeAt(i) === 43)) {
      neg = s.charCodeAt(i) === 45;
      i++;
    }
    let e = 0;
    while (i < k && ((s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) || s.charCodeAt(i) === 95)) {
      if (s.charCodeAt(i) !== 95 && e < 100000) {
        e = e * 10 + (s.charCodeAt(i) - 48);
      }
      i++;
    }
    exp = neg ? -e : e;
  }
  const d = dig.join("");
  const big = (intDigits > 0 ? intDigits : -leadZerosAfterDot) + exp;
  if (big > 309 || (big === 309 && lforDigitsAtLeast(d, "17976931348623158079"))) {
    return 2;
  }
  if (big < -323 || (big === -323 && !lforDigitsAtLeast(d, "24703282292062327209"))) {
    return 0;
  }
  return 1;
};

export class CopLintFloatOutOfRange {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/FloatOutOfRange");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_FLOAT) {
        continue;
      }
      const s = src.nodeSrc(n);
      const cls = lforFloatClass(s);
      let nonzeroDigit = false;
      for (let i = 0; i < toI32(s.length); i++) {
        const c = s.charCodeAt(i);
        if (c >= 49 && c <= 57) {
          nonzeroDigit = true;
        }
      }
      if (cls === 2 || (cls === 0 && nonzeroDigit)) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
