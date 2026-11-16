// SwiftFormat's todos, semicolons and blankLinesBetweenChainedFunctions
// rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SW_UNI_UNCERTAIN, swUniJoinsPrevious } from "./unicode";
import { SwFormatter } from "./formatter";
import { swCurrentScope } from "./parsing";
import { swLowercased } from "./rules_simple";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_START,
  SW_T_COMMENT,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
} from "./token";
import { swCpAt, swCpIsSpace } from "./tokenizer";

/** Removes a leading "/" followed by whitespace (the regex `^/(\s+)`). */
const swStripSlashSpace = (s: string): string => {
  if (!s.startsWith("/")) {
    return s;
  }
  let i = 1;
  const n = toI32(s.length);
  const b = new Array<u8>(n);
  for (let j = 0; j < n; j++) {
    b[j] = toU8(s.charCodeAt(j));
  }
  while (i < n) {
    const c = swCpAt(b, n, i);
    // \s: space, tab, linebreaks and Unicode whitespace
    if (!(swCpIsSpace(c) || c === 10 || c === 13 || c === 11 || c === 12 || c === 0x85 || c === 0x2028 || c === 0x2029)) {
      break;
    }
    i += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  if (i === 1) {
    return s;
  }
  return s.substring(i);
};

/** todos. */
export const swRuleTodos = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_COMMENT) {
      continue;
    }
    let string = f.s(i);
    let removedSpace = false;
    if (string.startsWith("/")) {
      const scopeStart = f.indexBefore(SW_T_START_OF_SCOPE, i);
      if (scopeStart >= 0 && f.tok(scopeStart, SW_START, "//")) {
        const prevLinebreak = f.indexBefore(SW_T_LINEBREAK, scopeStart);
        if (prevLinebreak >= 0) {
          const l = f.indexBefore(SW_T_NON_SPACE, prevLinebreak);
          if (l >= 0 && f.k(l) === SW_COMMENT) {
            continue;
          }
        }
        const nextLinebreak = f.indexAfter(SW_T_LINEBREAK, i);
        if (nextLinebreak >= 0) {
          const n = f.indexAfter(SW_T_NON_SPACE, nextLinebreak);
          if (n >= 0 && f.tok(n, SW_START, "//")) {
            continue;
          }
        }
        removedSpace = true;
        string = swStripSlashSpace(string);
      }
    }
    const keys = ["todo:", "todo :", "fixme:", "fixme :", "mark:", "mark :", "mark-", "mark -"];
    const vals = ["TODO:", "TODO:", "FIXME:", "FIXME:", "MARK:", "MARK:", "MARK: -", "MARK: -"];
    // A Kelvin sign lowercases to `k` (`mark`); Swift's hasPrefix and dropFirst work on Characters.
    if (string.substring(0, string.length < 24 ? toI32(string.length) : 24).indexOf("\u212a") >= 0) {
      SW_UNI_UNCERTAIN[0] = 1;
    }
    for (let q = 0; q < toI32(keys.length); q++) {
      if (swLowercased(string).startsWith(keys[q])) {
        if (swUniJoinsPrevious(string, toI32(keys[q].length))) {
          SW_UNI_UNCERTAIN[0] = 1;
        }
        string = vals[q] + string.substring(toI32(keys[q].length));
      }
    }
    let tag = "";
    if (string.startsWith("TODO")) {
      tag = "TODO";
    } else if (string.startsWith("MARK")) {
      tag = "MARK";
    } else if (string.startsWith("FIXME")) {
      tag = "FIXME";
    } else {
      continue;
    }
    if (swUniJoinsPrevious(string, toI32(tag.length))) {
      SW_UNI_UNCERTAIN[0] = 1;
    }
    let suffix = string.substring(toI32(tag.length));
    if (suffix.length > 0) {
      const c = suffix.charCodeAt(0);
      if (!(c === 32 || c === 58)) {
        continue;
      }
    }
    while (suffix.length > 0 && (suffix.charCodeAt(0) === 32 || suffix.charCodeAt(0) === 58)) {
      if (swUniJoinsPrevious(suffix, 1)) {
        SW_UNI_UNCERTAIN[0] = 1;
      }
      suffix = suffix.substring(1);
    }
    if (tag === "MARK" && swUniJoinsPrevious(suffix, 1) && suffix.startsWith("-")) {
      SW_UNI_UNCERTAIN[0] = 1;
    }
    if (tag === "MARK" && suffix.startsWith("-") && suffix !== "-" && !suffix.startsWith("- ")) {
      suffix = "- " + suffix.substring(1);
    }
    f.replaceToken(i, SW_COMMENT, tag + ":" + (suffix.length === 0 ? "" : " " + suffix), 0);
    if (removedSpace) {
      f.insertSpace(" ", i);
    }
  }
};

/** semicolons (inlineOnly; swiftVersion < 3 holds for an undefined version). */
export const swRuleSemicolons = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_DELIM, ";")) {
      continue;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const prevTokenIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (n >= 0 && !f.tok(n, SW_END, "}") && prevTokenIndex >= 0) {
      const cs = swCurrentScope(f, i);
      if (f.kw(prevTokenIndex, "return") || (cs >= 0 && f.tok(cs, SW_START, "("))) {
        // Not safe to remove or replace
      } else if (f.k(prevTokenIndex) === SW_IDENT && f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevTokenIndex, SW_KEYWORD, "var")) {
        // Not safe to remove or replace
      } else {
        const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
        if (m >= 0 && f.k(m) === SW_LINEBREAK) {
          f.removeToken(i);
        }
      }
    } else {
      f.removeToken(i);
    }
  }
};

/** blankLinesBetweenChainedFunctions. */
export const swRuleBlankLinesBetweenChainedFunctions = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.op(i, ".", SW_OP_INFIX)) {
      continue;
    }
    const endOfLine = f.endOfLine(i);
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfLine);
    if (nextIndex < 0 || !f.op(nextIndex, ".", SW_OP_INFIX)) {
      continue;
    }
    const ntc = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, endOfLine);
    if (ntc < 0) {
      continue;
    }
    if (f.isComment(ntc)) {
      if (f.ruleEnabled("blankLinesAroundMark")) {
        const b = f.indexAfter(SW_T_NON_SPACE, ntc);
        if (b >= 0 && f.k(b) === SW_COMMENT && f.s(b).startsWith("MARK:")) {
          continue;
        }
      }
      const eoc = f.indexBefore(SW_T_COMMENT, nextIndex);
      if (eoc >= 0) {
        const eol = f.endOfLine(eoc);
        const sol = f.startOfLine(nextIndex);
        f.removeTokens(eol + 1, sol);
      }
    }
    const startOfLine = f.startOfLine(ntc);
    f.removeTokens(endOfLine + 1, startOfLine);
  }
};

