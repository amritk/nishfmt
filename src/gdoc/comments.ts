// The comment re-indentation google-java-format's JavaCommentsHelper and
// ktfmt's KDocCommentsHelper share: line comments get a space after `//`
// and are wrapped at 100 columns, javadoc-shaped block comments are
// re-starred, other block comments keep their relative indentation.
//
// Ported from google-java-format 1.28.0's JavaCommentsHelper and Newlines
// (Apache License 2.0, Copyright 2015, 2016 Google Inc.); tools/kotlin/NOTES.md
// says why that credit holds for ktfmt's 1.23.0 and Java's 2.0.0.

import { add32, strUtf16Len, sub32 } from "../core/arr";
import { fault } from "../core/fault";

const MAX_LINE_LENGTH: i32 = 100;

export const isWsc = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

export const trimBoth = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && isWsc(s.charCodeAt(a))) {
    a++;
  }
  while (b > a && b > 0 && isWsc(s.charCodeAt(b - 1))) {
    b--;
  }
  return s.substring(a, b);
};

export const trimTrailing = (s: string): string => {
  let b = toI32(s.length);
  while (b > 0 && isWsc(s.charCodeAt(b - 1))) {
    b--;
  }
  return s.substring(0, b);
};

/** String.trim: strips characters <= ' '. */
const javaTrim = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && s.charCodeAt(a) <= 32) {
    a++;
  }
  while (b > a && b > 0 && s.charCodeAt(b - 1) <= 32) {
    b--;
  }
  return s.substring(a, b);
};

/** Newlines.lineIterator: lines with their terminators removed here. */
export const splitLines = (text: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const n = toI32(text.length);
  let i = 0;
  while (i >= 0 && i < n) {
    const c = text.charCodeAt(i);
    let next = i + 1;
    if (c === 10 || c === 13) {
      out.push(text.substring(a, i));
      if (c === 13 && next < n && text.charCodeAt(next) === 10) {
        next = next + 1;
      }
      a = next;
    }
    i = next;
  }
  if (a < n || out.length === 0) {
    out.push(text.substring(a, n));
  }
  return out;
};

export const spacesOf = (k: i32): string => {
  let s = "";
  for (let i = 0; i < k; i++) {
    s = `${s} `;
  }
  return s;
};

/** The byte index of UTF-16 unit `u` in `s`. */
const unitToByte = (s: string, u: i32): i32 => {
  let units = 0;
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      if (units >= u) {
        return i;
      }
      // At most two units a byte, so only a string past 2^30 bytes faults.
      if (units > 2147483645) {
        fault();
        return n;
      }
      if (c >= 0xf0) {
        units += 2;
      } else {
        units += 1;
      }
    }
  }
  return n;
};

/** LINE_COMMENT_MISSING_SPACE_PREFIX: `//+` then not noinspection / $NON-NLS-n$, then not whitespace or `/`. */
const missingSpaceAt = (line: string): i32 => {
  let i = 0;
  const n = toI32(line.length);
  while (i < n && line.charCodeAt(i) === 47) {
    i++;
  }
  if (i < 2 || i >= n) {
    return -1;
  }
  const rest = line.substring(i, n);
  if (rest.startsWith("noinspection")) {
    return -1;
  }
  if (rest.startsWith("$NON-NLS-")) {
    let j = 9;
    const j0 = j;
    while (j < toI32(rest.length) && rest.charCodeAt(j) >= 48 && rest.charCodeAt(j) <= 57) {
      j++;
    }
    if (j > j0 && j < toI32(rest.length) && rest.charCodeAt(j) === 36) {
      return -1;
    }
  }
  const c = line.charCodeAt(i);
  if (isWsc(c) || c === 47) {
    return -1;
  }
  return i;
};

export const wrapLineComments = (lines: string[], column0: i32): string[] => {
  const result: string[] = [];
  for (const line0 of lines) {
    let line = line0;
    const k = missingSpaceAt(line);
    if (k >= 0) {
      line = `${line.substring(0, k)} ${line.substring(k, toI32(line.length))}`;
    }
    if (line.startsWith("// MOE:")) {
      result.push(line);
      continue;
    }
    while (toI64(strUtf16Len(line)) + toI64(column0) > toI64(MAX_LINE_LENGTH)) {
      let idx = sub32(MAX_LINE_LENGTH, column0);
      // Work in UTF-16 units, as Java does. The line is longer than `idx`
      // units here, so unit `idx` is inside it.
      while (idx >= 2) {
        const p = unitToByte(line, idx);
        if (p < 0 || p >= line.length) {
          fault();
          return result;
        }
        if (isWsc(line.charCodeAt(p))) {
          break;
        }
        idx--;
      }
      if (idx <= 2) {
        break;
      }
      const b = unitToByte(line, idx);
      result.push(line.substring(0, b));
      line = `//${line.substring(b, toI32(line.length))}`;
    }
    result.push(line);
  }
  return result;
};

export const indentLineComments = (lines0: string[], column0: i32): string => {
  const lines = wrapLineComments(lines0, column0);
  if (lines.length < 1) {
    fault();
    return "";
  }
  let out = javaTrim(lines[0]);
  const ind = spacesOf(column0);
  for (let i = 1; i < toI32(lines.length); i++) {
    out = `${out}\n${ind}${javaTrim(lines[i])}`;
  }
  return out;
};

export const preserveIndentation = (lines: string[], column0: i32): string => {
  let startCol = -1;
  for (let i = 1; i < toI32(lines.length); i++) {
    const l = lines[i];
    let idx = -1;
    for (let k = 0; k < toI32(l.length); k++) {
      if (!isWsc(l.charCodeAt(k))) {
        idx = k;
        break;
      }
    }
    if (idx >= 0 && (startCol === -1 || idx < startCol)) {
      startCol = idx;
    }
  }
  if (lines.length < 1) {
    fault();
    return "";
  }
  let out = lines[0];
  const ind = spacesOf(column0);
  for (let i = 1; i < toI32(lines.length); i++) {
    const l = lines[i];
    out = `${out}\n${ind}`;
    if (startCol >= 0 && toI32(l.length) >= startCol) {
      out = out + l.substring(startCol, toI32(l.length));
    } else if (startCol < 0) {
      // substring(-1) would throw in Java; every line is blank here, so only empty lines reach it.
      out = out + l;
    } else {
      out = out + l;
    }
  }
  return out;
};

export const indentJavadoc = (lines: string[], column0: i32): string => {
  if (lines.length < 1) {
    fault();
    return "";
  }
  let out = javaTrim(lines[0]);
  const ind = spacesOf(add32(column0, 1));
  for (let i = 1; i < toI32(lines.length); i++) {
    out = `${out}\n${ind}`;
    const line = javaTrim(lines[i]);
    if (!line.startsWith("*")) {
      out = `${out}* `;
    }
    out = out + line;
  }
  return out;
};

export const javadocShaped = (lines: string[]): boolean => {
  if (lines.length < 1) {
    return false;
  }
  const first = javaTrim(lines[0]);
  if (first.startsWith("/**")) {
    return true;
  }
  if (!first.startsWith("/*")) {
    return false;
  }
  for (let i = 1; i < toI32(lines.length); i++) {
    if (!javaTrim(lines[i]).startsWith("*")) {
      return false;
    }
  }
  return true;
};
