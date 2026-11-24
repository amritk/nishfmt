// RuboCop::Cop::Util and the string helpers several cops share.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbInspectStr } from "./ast";

/**
 * Util#double_quotes_required?: the string holds a single quote, or a
 * backslash escape other than `\\` and `\"` (/'|(?<! \\) \\{2}* \\ (?![\\"])/x).
 */
export const rbDoubleQuotesRequired = (s: string): boolean => {
  const k = toI32(s.length);
  let i = 0;
  while (i >= 0 && i < k) {
    const c = s.charCodeAt(i);
    if (c === 39) {
      return true;
    }
    if (c === 92) {
      let j = i;
      while (j < k && s.charCodeAt(j) === 92) {
        j++;
      }
      if ((j - i) % 2 === 1 && (j >= k || s.charCodeAt(j) !== 34)) {
        return true;
      }
      i = j;
      continue;
    }
    i++;
  }
  return false;
};

/** Every `from` in `s` replaced with `to`. */
export const rbReplaceAll = (s: string, from: string, to: string): string => {
  const parts: string[] = [];
  let a = 0;
  const k = toI32(s.length);
  const f = toI32(from.length);
  let i = s.indexOf(from);
  while (i >= 0) {
    parts.push(s.substring(a, i));
    parts.push(to);
    // indexOf found `from` inside `s`, so both sums stay within s.length.
    a = toI32(toU32(i) + toU32(f));
    const nx = s.substring(a, k).indexOf(from);
    if (nx < 0) {
      i = -1;
    } else {
      i = toI32(toU32(a) + toU32(nx));
    }
  }
  parts.push(s.substring(a, k));
  return parts.join("");
};

/** Util#escape_string: inspect without the quotes, with `\"` unescaped. */
export const rbEscapeString = (s: string): string => {
  const ins = rbInspectStr(s);
  return rbReplaceAll(ins.substring(1, toI32(ins.length) - 1), '\\"', '"');
};

/** Util#needs_escaping? */
export const rbNeedsEscaping = (s: string): boolean => rbDoubleQuotesRequired(rbEscapeString(s));

/** Whether a string is valid UTF-8 (String#valid_encoding?). */
export const rbValidUtf8 = (s: string): boolean => {
  const n = toI32(s.length);
  let i = 0;
  while (i >= 0 && i < n) {
    const c = s.charCodeAt(i);
    let k = 0;
    let lo = 0x80;
    let hi = 0xbf;
    if (c < 0x80) {
      i++;
      continue;
    } else if (c >= 0xc2 && c < 0xe0) {
      k = 1;
    } else if (c >= 0xe0 && c < 0xf0) {
      k = 2;
      if (c === 0xe0) {
        lo = 0xa0;
      } else if (c === 0xed) {
        hi = 0x9f;
      }
    } else if (c >= 0xf0 && c < 0xf5) {
      k = 3;
      if (c === 0xf0) {
        lo = 0x90;
      } else if (c === 0xf4) {
        hi = 0x8f;
      }
    } else {
      return false;
    }
    let p = i + 1;
    for (let j = 1; j <= k; j++) {
      if (p < 0 || p >= n) {
        return false;
      }
      const d = s.charCodeAt(p);
      if (j === 1 ? d < lo || d > hi : (d & 0xc0) !== 0x80) {
        return false;
      }
      p++;
    }
    i = p;
  }
  return true;
};

/** Util#to_string_literal (UTF-8 is always a compatible external encoding). */
export const rbToStringLiteral = (s: string): string => {
  if (!rbValidUtf8(s) || rbNeedsEscaping(s)) {
    return rbInspectStr(s);
  }
  return `'${rbReplaceAll(rbReplaceAll(s, "\\", "\\\\"), '\\"', '"')}'`;
};

/** The byte at `i` of `s`, or -1 outside it. */
export const rbByteAt = (s: string, i: i32): i32 => (i >= 0 && i < s.length ? s.charCodeAt(i) : -1);
