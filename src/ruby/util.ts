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
  while (i < k) {
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
    a = i + f;
    const nx = s.substring(a, k).indexOf(from);
    i = nx < 0 ? -1 : a + nx;
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

/** Util#to_string_literal (UTF-8 is always a compatible external encoding). */
export const rbToStringLiteral = (s: string): string => {
  if (rbNeedsEscaping(s)) {
    return rbInspectStr(s);
  }
  return `'${rbReplaceAll(rbReplaceAll(s, "\\", "\\\\"), '\\"', '"')}'`;
};
