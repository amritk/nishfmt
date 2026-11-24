// SwiftFormat's whitespace rules: trailingSpace, consecutiveBlankLines,
// consecutiveSpaces, linebreakAtEndOfFile, linebreaks.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swRefHi, swRefLo } from "./decl";
import { swEndOfScope } from "./parsing";
import { SwFormatter } from "./formatter";
import {
  SW_COMMENT,
  SW_END,
  SW_LINEBREAK,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_NON_SPACE,
  SW_T_START_OF_SCOPE,
  swIsMultilineStringDelimiter,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** trailingSpace (truncateBlankLines is on by default). */
export const swRuleTrailingSpace = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_SPACE) {
      continue;
    }
    if (!f.has(toI32(toU32(i) + 1)) || f.k(toI32(toU32(i) + 1)) === SW_LINEBREAK) {
      f.removeToken(i);
    } else if (f.k(toI32(toU32(i) + 1)) === SW_STRBODY && f.s(toI32(toU32(i) + 1)) === "") {
      f.removeTokens(i, toI32(toU32(i) + 2));
    }
  }
};

/** consecutiveBlankLines. */
export const swRuleConsecutiveBlankLines = (f: SwFormatter): void => {
  // The current scope can only be a multiline string delimiter inside a multiline string
  // literal: keep their ranges (auto-updating) and look for the scope only there.
  const ml: i32[] = [];
  for (let j = 0; j < f.count(); j++) {
    if (f.k(j) === SW_START && swIsMultilineStringDelimiter(f.k(j), f.s(j))) {
      const e = swEndOfScope(f, j);
      ml.push(f.ref(j, e >= 0 ? e : f.count()));
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_LINEBREAK) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
    if (prevIndex < 0 || f.k(prevIndex) !== SW_LINEBREAK) {
      continue;
    }
    let inString = false;
    for (const h of ml) {
      if (i > swRefLo(f, h) && i <= swRefHi(f, h)) {
        inString = true;
      }
    }
    const scope = inString ? f.indexBefore(SW_T_START_OF_SCOPE, i) : -1;
    if (scope >= 0 && swIsMultilineStringDelimiter(f.k(scope), f.s(scope))) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE, i);
    if (nextIndex >= 0) {
      if (f.k(nextIndex) === SW_LINEBREAK) {
        f.removeTokens(toI32(toU32(i) + 1), toI32(toU32(nextIndex) + 1));
      }
    } else {
      f.removeTokens(i, f.count());
    }
  }
  for (const h of ml) {
    f.unref(h);
  }
};

/** consecutiveSpaces. */
export const swRuleConsecutiveSpaces = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_SPACE) {
      continue;
    }
    const s = f.s(i);
    if (s === "") {
      f.removeToken(i);
      continue;
    }
    if (s === " ") {
      continue;
    }
    if (!f.has(i - 1) || !f.has(toI32(toU32(i) + 1))) {
      continue;
    }
    const pk = f.k(i - 1);
    const ps = f.s(i - 1);
    if (pk === SW_LINEBREAK || (pk === SW_START && (ps === "/*" || ps === "//")) || pk === SW_COMMENT) {
      continue;
    }
    if (pk === SW_END && ps === "*/" && f.tok(toI32(toU32(i) + 1), SW_START, "/*")) {
      const scope = f.indexBefore(SW_T_START_OF_SCOPE, i);
      if (scope >= 0 && f.tok(scope, SW_START, "/*")) {
        continue;
      }
    }
    const nk = f.k(toI32(toU32(i) + 1));
    if (nk === SW_LINEBREAK || (nk === SW_END && f.s(toI32(toU32(i) + 1)) === "*/") || nk === SW_COMMENT) {
      continue;
    }
    f.replaceToken(i, SW_SPACE, " ", 0);
  }
};

/** linebreakAtEndOfFile. */
export const swRuleLinebreakAtEndOfFile = (f: SwFormatter): void => {
  let wasLinebreak = true;
  for (let i = f.enumStartAll(); i >= 0; i = f.enumNextAll()) {
    const k = f.k(i);
    if (k === SW_LINEBREAK) {
      wasLinebreak = true;
    } else if (k !== SW_SPACE) {
      wasLinebreak = false;
    }
  }
  if (f.isEnabled() && !wasLinebreak) {
    f.insertLinebreak(f.count());
  }
};

/** linebreaks (the linebreak option is "\n"). */
export const swRuleLinebreaks = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_LINEBREAK) {
      continue;
    }
    f.replaceToken(i, SW_LINEBREAK, "\n", f.linebreakLine(i));
  }
};
