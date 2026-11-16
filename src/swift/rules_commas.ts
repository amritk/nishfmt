// SwiftFormat's trailingCommas rule (trailingCommas always, swiftVersion undefined:
// collections get a trailing comma, every other list loses it).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swStartOfScope } from "./parsing";
import {
  SW_SCOPE_ARRAY,
  SW_SCOPE_ARRAY_TYPE,
  SW_SCOPE_CAPTURE_LIST,
  SW_SCOPE_DICTIONARY,
  SW_SCOPE_DICTIONARY_TYPE,
  SW_SCOPE_FUNCTION_CALL,
  SW_SCOPE_PARAMETER_LIST,
  SW_SCOPE_SUBSCRIPT,
  SW_SCOPE_THROWS_TYPE,
  swScopeType,
} from "./parsing2";
import { SW_DELIM, SW_END, SW_LINEBREAK, SW_START, SW_T_NON_SPACE_OR_COMMENT, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK } from "./token";

/** addOrRemoveTrailingComma(beforeEndOfScope:trailingCommaSupported:) for a known answer. */
const swAddOrRemoveTrailingComma = (f: SwFormatter, endOfListIndex: i32, insert: boolean): void => {
  const prevTokenIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, endOfListIndex);
  if (prevTokenIndex < 0 || swStartOfScope(f, endOfListIndex) < 0) {
    return;
  }
  if (f.k(prevTokenIndex) === SW_LINEBREAK) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevTokenIndex + 1);
    if (p < 0) {
      return;
    }
    if (f.tok(p, SW_START, "[") || f.tok(p, SW_DELIM, ":") || f.tok(p, SW_START, "(")) {
      return;
    }
    if (f.tok(p, SW_DELIM, ",")) {
      if (!insert) {
        f.removeToken(p);
      }
    } else if (insert) {
      f.insert(SW_DELIM, ",", 0, p + 1);
    }
  } else if (f.tok(prevTokenIndex, SW_DELIM, ",")) {
    f.removeToken(prevTokenIndex);
  }
};

/** trailingCommas. */
export const swRuleTrailingCommas = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_END) {
      continue;
    }
    const sos = swStartOfScope(f, i);
    if (sos < 0) {
      continue;
    }
    const st = swScopeType(f, sos);
    if (st === SW_SCOPE_ARRAY || st === SW_SCOPE_DICTIONARY) {
      swAddOrRemoveTrailingComma(f, i, true);
      continue;
    }
    if (st === SW_SCOPE_SUBSCRIPT || st === SW_SCOPE_CAPTURE_LIST || st === SW_SCOPE_FUNCTION_CALL || st === SW_SCOPE_PARAMETER_LIST) {
      swAddOrRemoveTrailingComma(f, i, false);
      continue;
    }
    if (st === SW_SCOPE_ARRAY_TYPE || st === SW_SCOPE_DICTIONARY_TYPE || st === SW_SCOPE_THROWS_TYPE) {
      continue;
    }
    const s = f.s(i);
    if (s === ")" || s === ">") {
      swAddOrRemoveTrailingComma(f, i, false);
    }
  }
};
