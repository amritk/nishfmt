// SwiftFormat's hoistPatternLet rule (hoistPatternLet true).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexBeforeWhere } from "./formatter";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

/** indicesOf(_:in:); an empty array for nil. */
const swIndicesOf = (f: SwFormatter, keyword: string, lo: i32, hi: i32): i32[] => {
  const indices: i32[] = [];
  let keywordFound = false;
  let identifierFound = false;
  let count = 0;
  for (let index = lo; index < hi; index++) {
    const k = f.k(index);
    const s = f.s(index);
    if (k === SW_KEYWORD && s === keyword) {
      indices.push(index);
      keywordFound = true;
    } else if (k === SW_IDENT && s === "_") {
      // skip
    } else if (k === SW_IDENT && !swPrevIsPrefixDot(f, index)) {
      identifierFound = true;
      if (keywordFound) {
        count++;
      }
    } else if (k === SW_DELIM && s === ",") {
      if (!(keywordFound || !identifierFound)) {
        return [];
      }
      keywordFound = false;
      identifierFound = false;
    } else if (k === SW_START && (s === "{" || s === "<")) {
      return [];
    }
  }
  return (keywordFound || !identifierFound) && count > 0 ? indices : [];
};

const swPrevIsPrefixDot = (f: SwFormatter, i: i32): boolean => {
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
  return p >= 0 && f.op(p, ".", SW_OP_PREFIX);
};

/** hoistPatternLet. */
export const swRuleHoistPatternLet = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "(")) {
      continue;
    }
    const endIndex = f.indexOfAfter(SW_END, ")", 0, i);
    if (endIndex < 0) {
      continue;
    }
    const prevIndex = swIndexBeforeWhere(f, i, (g, j) => {
      const k = g.k(j);
      const s = g.s(j);
      if (k === SW_OP && s === ".") {
        return false;
      }
      if (k === SW_KEYWORD && (s === "let" || s === "var")) {
        return false;
      }
      if (k === SW_END && s === "*/") {
        return false;
      }
      return k === SW_END || k === SW_DELIM || k === SW_OP || k === SW_KEYWORD;
    });
    if (prevIndex < 0) {
      continue;
    }
    if (f.tok(prevIndex, SW_END, "case") || f.kw(prevIndex, "case") || f.kw(prevIndex, "catch")) {
      // ok
    } else if (f.tok(prevIndex, SW_DELIM, ",")) {
      let tuple = false;
      for (let j = prevIndex - 1; j >= 0; j--) {
        if (f.tok(j, SW_END, "case") || f.kw(j, "catch")) {
          break;
        }
        if (f.kw(j, "var") || f.kw(j, "let")) {
          continue;
        }
        if (f.k(j) === SW_KEYWORD) {
          tuple = true;
          break;
        }
      }
      if (tuple) {
        continue;
      }
    } else {
      continue;
    }
    const si = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
    const startIndex = si >= 0 ? si : prevIndex + 1;
    if (f.kw(startIndex, "let") || f.kw(startIndex, "var")) {
      continue;
    }
    let keyword = "let";
    let indices = swIndicesOf(f, keyword, i + 1, endIndex);
    if (indices.length === 0) {
      keyword = "var";
      indices = swIndicesOf(f, keyword, i + 1, endIndex);
    }
    if (indices.length === 0) {
      continue;
    }
    for (let q = toI32(indices.length) - 1; q >= 0; q--) {
      const index = indices[q];
      if (f.k(index + 1) === SW_SPACE) {
        f.removeToken(index + 1);
      }
      f.removeToken(index);
    }
    f.insert(SW_KEYWORD, keyword, 0, startIndex);
    if (f.has(startIndex + 1)) {
      const nk = f.k(startIndex + 1);
      if (nk !== SW_SPACE && nk !== SW_LINEBREAK) {
        f.insert(SW_SPACE, " ", 0, startIndex + 1);
      }
    }
    if (f.has(startIndex - 1)) {
      const pk = f.k(startIndex - 1);
      if (pk !== SW_SPACE && pk !== SW_LINEBREAK && !f.isComment(startIndex - 1) && pk !== SW_START) {
        f.insert(SW_SPACE, " ", 0, startIndex);
      }
    }
  }
};
