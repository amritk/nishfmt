// SwiftFormat's spacing rules: spaceAround* and spaceInside*.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swUniCheckPrefix } from "./unicode";
import { SwFormatter } from "./formatter";
import { swIsInClosureArguments, swIsUnwrap } from "./parsing";
import { SW_SPACE_NO, SW_SPACE_YES, swShouldInsertSpaceAfterToken } from "./parsing2";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_NONE,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_LINEBREAK,
  swIsLvalue,
  swIsStringDelimiter,
  swKindIsComment,
} from "./token";
import { swCpAt, swCpIsSpace } from "./tokenizer";

const swIsSpaceOrLinebreakAt = (f: SwFormatter, i: i32): boolean => f.has(i) && (f.k(i) === SW_SPACE || f.k(i) === SW_LINEBREAK);

/** spaceAroundBraces. */
export const swRuleSpaceAroundBraces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "{") || !f.has(i - 1)) {
      continue;
    }
    const pk = f.k(i - 1);
    const ps = f.s(i - 1);
    const pa = f.a(i - 1);
    if (pk === SW_SPACE || pk === SW_LINEBREAK || (pk === SW_OP && (pa === SW_OP_PREFIX || pa === SW_OP_INFIX)) || (pk === SW_START && !swIsStringDelimiter(pk, ps))) {
      continue;
    }
    f.insert(SW_SPACE, " ", 0, i);
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_END, "}") || !f.has(i + 1)) {
      continue;
    }
    const nk = f.k(i + 1);
    if (nk === SW_IDENT || nk === SW_KEYWORD) {
      f.insert(SW_SPACE, " ", 0, i + 1);
    }
  }
};

/** spaceAroundBrackets. */
export const swRuleSpaceAroundBrackets = (f: SwFormatter): void => {
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (!f.tok(i0, SW_START, "[")) {
      continue;
    }
    const i = i0 - 1;
    if (swShouldInsertSpaceAfterToken(f, i) === SW_SPACE_YES) {
      f.insert(SW_SPACE, " ", 0, i + 1);
    } else if (f.has(i) && f.k(i) === SW_SPACE && swShouldInsertSpaceAfterToken(f, i - 1) === SW_SPACE_NO) {
      f.removeToken(i);
    }
  }
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (!f.tok(i0, SW_END, "]")) {
      continue;
    }
    const i = i0 + 1;
    if (!f.has(i)) {
      continue;
    }
    const k = f.k(i);
    if (k === SW_IDENT || k === SW_KEYWORD || f.tok(i, SW_START, "{") || (f.tok(i, SW_START, "(") && swIsInClosureArguments(f, i - 1))) {
      f.insert(SW_SPACE, " ", 0, i);
    } else if (k === SW_SPACE) {
      if ((f.tok(i + 1, SW_START, "(") && !swIsInClosureArguments(f, i + 1)) || f.tok(i + 1, SW_START, "[")) {
        f.removeToken(i);
      }
    }
  }
};

/** spaceAroundParens. */
export const swRuleSpaceAroundParens = (f: SwFormatter): void => {
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (!f.tok(i0, SW_START, "(")) {
      continue;
    }
    const i = i0 - 1;
    if (swShouldInsertSpaceAfterToken(f, i) === SW_SPACE_YES) {
      f.insertSpace(" ", i + 1);
    } else if (f.has(i) && f.k(i) === SW_SPACE && swShouldInsertSpaceAfterToken(f, i - 1) === SW_SPACE_NO) {
      f.removeToken(i);
    }
  }
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (!f.tok(i0, SW_END, ")")) {
      continue;
    }
    const i = i0 + 1;
    if (!f.has(i)) {
      continue;
    }
    const k = f.k(i);
    if (k === SW_IDENT || k === SW_KEYWORD || f.tok(i, SW_START, "{")) {
      f.insertSpace(" ", i);
    } else if (k === SW_SPACE && f.tok(i + 1, SW_START, "[")) {
      f.removeToken(i);
    }
  }
};

/** spaceAroundComments. */
export const swRuleSpaceAroundComments = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_START, "//") && f.has(i - 1) && !swIsSpaceOrLinebreakAt(f, i - 1)) {
      f.insert(SW_SPACE, " ", 0, i);
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_END, "*/")) {
      continue;
    }
    const startIndex = f.indexOfBefore(SW_START, "/*", 0, i);
    if (startIndex < 0) {
      continue;
    }
    const cs = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, startIndex);
    const ce = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (cs < 0 || ce < 0 || f.k(cs) !== SW_COMMENT || f.k(ce) !== SW_COMMENT || f.s(cs).startsWith("@") || f.s(ce).endsWith("@")) {
      continue;
    }
    if (f.has(i + 1)) {
      if (!swIsSpaceOrLinebreakAt(f, i + 1)) {
        if (!f.tok(i + 1, SW_DELIM, ",")) {
          f.insert(SW_SPACE, " ", 0, i + 1);
        }
      } else {
        const n = f.indexAfter(SW_T_NON_SPACE, i + 1);
        if (n >= 0 && f.tok(n, SW_DELIM, ",")) {
          f.removeToken(i + 1);
        }
      }
    }
    if (f.has(startIndex - 1) && !swIsSpaceOrLinebreakAt(f, startIndex - 1)) {
      if (f.k(startIndex - 1) === SW_COMMENT && swEndsWithSpace(f.s(startIndex - 1))) {
        continue;
      }
      f.insert(SW_SPACE, " ", 0, startIndex);
    }
  }
};

/** Whether the last scalar of `s` is a space. */
const swEndsWithSpace = (s: string): boolean => {
  const n = toI32(s.length);
  if (n === 0) {
    return false;
  }
  let q = n - 1;
  while (q > 0 && (s.charCodeAt(q) & 0xc0) === 0x80) {
    q--;
  }
  const b: u8[] = [];
  for (let j = q; j < n; j++) {
    b.push(toU8(s.charCodeAt(j)));
  }
  return swCpIsSpace(swCpAt(b, toI32(b.length), 0));
};

/** spaceAroundGenerics. */
export const swRuleSpaceAroundGenerics = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_START, "<") && f.has(i - 1) && f.k(i - 1) === SW_SPACE && f.has(i - 2) && (f.k(i - 2) === SW_IDENT || f.k(i - 2) === SW_KEYWORD)) {
      f.removeToken(i - 1);
    }
  }
};

/** spaceInsideBraces. */
export const swRuleSpaceInsideBraces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "{") || !f.has(i + 1)) {
      continue;
    }
    if (!swIsSpaceOrLinebreakAt(f, i + 1) && !f.tok(i + 1, SW_END, "}") && !f.tok(i + 1, SW_START, "{")) {
      f.insert(SW_SPACE, " ", 0, i + 1);
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_END, "}") || !f.has(i - 1)) {
      continue;
    }
    if (!swIsSpaceOrLinebreakAt(f, i - 1) && !f.tok(i - 1, SW_END, "}") && !f.tok(i - 1, SW_START, "{")) {
      f.insert(SW_SPACE, " ", 0, i);
    }
  }
};

const swRemoveInsideSpace = (f: SwFormatter, open: string, close: string): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_START, open) && f.has(i + 1) && f.k(i + 1) === SW_SPACE && f.has(i + 2) && !swKindIsComment(f.k(i + 2), f.s(i + 2))) {
      f.removeToken(i + 1);
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_END, close) && f.has(i - 1) && f.k(i - 1) === SW_SPACE && f.has(i - 2) && !(swKindIsComment(f.k(i - 2), f.s(i - 2)) || f.k(i - 2) === SW_LINEBREAK)) {
      f.removeToken(i - 1);
    }
  }
};

/** spaceInsideBrackets. */
export const swRuleSpaceInsideBrackets = (f: SwFormatter): void => {
  swRemoveInsideSpace(f, "[", "]");
};

/** spaceInsideParens. */
export const swRuleSpaceInsideParens = (f: SwFormatter): void => {
  swRemoveInsideSpace(f, "(", ")");
};

/** spaceInsideGenerics. */
export const swRuleSpaceInsideGenerics = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_START, "<") && f.has(i + 1) && f.k(i + 1) === SW_SPACE) {
      f.removeToken(i + 1);
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_END, ">") && f.has(i - 1) && f.k(i - 1) === SW_SPACE && f.has(i - 2) && f.k(i - 2) !== SW_LINEBREAK) {
      f.removeToken(i - 1);
    }
  }
};

/** spaceInsideComments. */
export const swRuleSpaceInsideComments = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "//") || !f.has(i + 1) || f.k(i + 1) !== SW_COMMENT) {
      continue;
    }
    const s = f.s(i + 1);
    if (s.length === 0) {
      continue;
    }
    swUniCheckPrefix(s, 5);
    const c = s.charCodeAt(0);
    if (c === 47 || c === 33 || c === 58) {
      if (s.length > 1) {
        const d = s.charCodeAt(1);
        if (!(d === 32 || d === 9 || d === 47)) {
          f.replaceToken(i + 1, SW_COMMENT, s.substring(0, 1) + " " + s.substring(1), 0);
        }
      }
    } else if (!(c === 32 || c === 9) && !s.startsWith("===")) {
      f.insert(SW_SPACE, " ", 0, i + 1);
    }
  }
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (!f.tok(i0, SW_START, "/*") || !f.has(i0 + 1) || f.k(i0 + 1) !== SW_COMMENT) {
      continue;
    }
    const s = f.s(i0 + 1);
    swUniCheckPrefix(s, 5);
    if (s.length > 3) {
      // hasSuffix("---") / hasSuffix("@") work on Characters too.
      swUniCheckPrefix(s.substring(toI32(s.length) - 4), 4);
    }
    if (s.startsWith("---") || s.startsWith("@") || s.endsWith("---") || s.endsWith("@")) {
      continue;
    }
    const c = s.length > 0 ? s.charCodeAt(0) : 0;
    if (s.length > 0 && (c === 42 || c === 33 || c === 58)) {
      if (s.length > 1) {
        const d = s.charCodeAt(1);
        if (!(d === 32 || d === 47 || d === 116) && !s.startsWith("**") && !s.startsWith("*/")) {
          f.replaceToken(i0 + 1, SW_COMMENT, s.substring(0, 1) + " " + s.substring(1), 0);
        }
      }
    } else {
      f.insert(SW_SPACE, " ", 0, i0 + 1);
    }
    const i = f.indexOfAfter(SW_END, "*/", 0, i0);
    if (i >= 0 && f.has(i - 1)) {
      const ps = f.s(i - 1);
      if (!swIsSpaceOrLinebreakAt(f, i - 1) && !ps.endsWith("*") && !swIsBlank(ps)) {
        f.insert(SW_SPACE, " ", 0, i);
      }
    }
  }
};

/** String.trimmingCharacters(in: .whitespaces).isEmpty. */
const swIsBlank = (s: string): boolean => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9) {
      i++;
      continue;
    }
    if (c < 0x80) {
      return false;
    }
    const b: u8[] = [];
    const l = c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
    for (let j = 0; j < l && i + j < n; j++) {
      b.push(toU8(s.charCodeAt(i + j)));
    }
    const cp = swCpAt(b, toI32(b.length), 0);
    if (!(cp === 0xa0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000)) {
      return false;
    }
    i += l;
  }
  return true;
};

/** spaceAroundOperators (default options). */
export const swRuleSpaceAroundOperators = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    const k = f.k(i);
    const s = f.s(i);
    const a = f.a(i);
    if (k === SW_OP && a === SW_OP_NONE) {
      if (!f.has(i + 1)) {
        continue;
      }
      const nk = f.k(i + 1);
      if (nk === SW_LINEBREAK || nk === SW_END || nk === SW_OP || nk === SW_DELIM) {
        continue;
      }
      if (nk === SW_SPACE) {
        const n = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
        if (n < 0 || f.k(n) === SW_LINEBREAK || f.k(n) === SW_END || f.k(n) === SW_DELIM) {
          f.removeToken(i + 1);
        }
        continue;
      }
      f.insert(SW_SPACE, " ", 0, i + 1);
    } else if (swIsUnwrap(f, i)) {
      if (f.has(i - 1) && f.has(i + 1) && !swIsSpaceOrLinebreakAt(f, i + 1) && (f.kw(i - 1, "as") || f.kw(i - 1, "try"))) {
        f.insert(SW_SPACE, " ", 0, i + 1);
      }
    } else if (k === SW_OP && s === "::") {
      if (f.has(i + 1) && f.k(i + 1) === SW_SPACE) {
        f.removeToken(i + 1);
      }
      if (f.has(i - 1) && f.k(i - 1) === SW_SPACE) {
        f.removeToken(i - 1);
      }
    } else if (k === SW_OP && s === ".") {
      if (f.has(i + 1) && f.k(i + 1) === SW_SPACE) {
        f.removeToken(i + 1);
      }
      const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
      if (prevIndex < 0) {
        f.removeTokens(0, i);
        continue;
      }
      const pk = f.k(prevIndex);
      const ps = f.s(prevIndex);
      const pa = f.a(prevIndex);
      if ((pk === SW_OP && pa === SW_OP_INFIX) || pk === SW_START) {
        continue;
      }
      if (pk === SW_IDENT && ps === "unsafe") {
        continue;
      }
      let spaceRequired = false;
      if (swIsUnwrap(f, prevIndex)) {
        const p = f.indexBefore(SW_T_NON_SPACE, prevIndex);
        spaceRequired = p >= 0 && (f.kw(p, "as") || f.kw(p, "try"));
      } else if (pk === SW_OP && pa === SW_OP_PREFIX) {
        spaceRequired = false;
      } else {
        spaceRequired = !(pk === SW_KEYWORD && ps.startsWith("@")) && !swIsLvalue(pk, ps, pa);
      }
      if (swIsSpaceOrLinebreakAt(f, i - 1)) {
        if (!spaceRequired) {
          f.removeToken(i - 1);
        }
      } else if (spaceRequired) {
        f.insertSpace(" ", i);
      }
    } else if (k === SW_OP && s === "?" && a === SW_OP_INFIX) {
      // Spacing around ternary ? is not optional
    } else if (k === SW_OP && a === SW_OP_INFIX) {
      if (f.has(i + 1) && !swIsSpaceOrLinebreakAt(f, i + 1)) {
        f.insert(SW_SPACE, " ", 0, i + 1);
      }
      if (f.has(i - 1) && !swIsSpaceOrLinebreakAt(f, i - 1)) {
        f.insert(SW_SPACE, " ", 0, i);
      }
    } else if (k === SW_OP && a === SW_OP_PREFIX) {
      const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
      if (prevIndex >= 0 && (f.tok(prevIndex, SW_START, "[") || f.tok(prevIndex, SW_START, "(") || f.tok(prevIndex, SW_START, "<"))) {
        f.removeTokens(prevIndex + 1, i);
      } else if (f.has(i - 1) && !swIsSpaceOrLinebreakAt(f, i - 1) && f.k(i - 1) !== SW_OP) {
        f.insert(SW_SPACE, " ", 0, i);
      }
    } else if ((k === SW_DELIM && (s === ":" || s === "," || s === ";")) || (k === SW_OP && a === SW_OP_POSTFIX) || (k === SW_START && s === ":")) {
      if (k === SW_DELIM && s === ":" && f.has(i + 1) && f.k(i + 1) === SW_IDENT && f.tok(i + 2, SW_DELIM, ":")) {
        // It's a selector
        continue;
      }
      if (f.has(i + 1)) {
        const nk = f.k(i + 1);
        if (!(nk === SW_SPACE || nk === SW_LINEBREAK || nk === SW_END || nk === SW_OP || nk === SW_DELIM)) {
          f.insert(SW_SPACE, " ", 0, i + 1);
        }
      }
      const spaceBefore = f.has(i - 1) && f.k(i - 1) === SW_SPACE && f.has(i - 2) && f.k(i - 2) !== SW_LINEBREAK;
      if (spaceBefore) {
        f.removeToken(i - 1);
      }
    }
  }
};

