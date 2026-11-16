// SwiftFormat's hoistTry rule and FormattingHelpers.hoistEffectKeyword.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swParseFunctionDeclaration, swUnescaped } from "./funcdecl";
import { swCurrentScope, swIsKeyword, swIsMacroTok, swIsAttribute, swIsUnwrap, swStartOfScope } from "./parsing";
import {
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SwTokList,
  swIsMultilineStringDelimiter,
  swIsStringDelimiter,
} from "./token";

/** The names of functions that capture `try` (isEffectCapturingAt for hoistTry). */
class SwTryNames {
  names: string[];
  constructor() {
    this.names = [];
  }
}

const swIsTryCapturing = (f: SwFormatter, names: SwTryNames, i: i32): boolean => {
  if (f.k(i) !== SW_IDENT) {
    return false;
  }
  const name = f.s(i);
  if (name.startsWith("XCTAssert")) {
    return true;
  }
  return names.names.indexOf(swUnescaped(name)) >= 0;
};

const swSameList = (a: SwTokList, b: SwTokList): boolean => {
  const n = a.count();
  if (n !== b.count()) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (a.k[i] !== b.k[i] || a.a[i] !== b.a[i] || a.s[i] !== b.s[i]) {
      return false;
    }
  }
  return true;
};

/** hoistEffectKeyword("try", ...) over the whole file, repeated until stable. */
const swHoistTry = (f: SwFormatter, names: SwTryNames): void => {
  while (true) {
    const before = f.t.copy();
    for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
      if (f.tok(i, SW_START, "(") || f.tok(i, SW_START, "[")) {
        swHoistTryInScope(f, names, i);
      }
    }
    if (swSameList(before, f.t)) {
      return;
    }
  }
};

const swInsertEffectKeyword = (f: SwFormatter, index0: i32, keyword: string): void => {
  let index = index0;
  while (f.k(index) === SW_SPACE || f.k(index) === SW_LINEBREAK) {
    index++;
  }
  if (f.kw(index, keyword)) {
    return;
  }
  f.insert(SW_KEYWORD, keyword, 0, index);
  if (f.has(index + 1) && f.k(index + 1) !== SW_SPACE) {
    f.insertSpace(" ", index + 1);
  } else {
    f.insertSpace(" ", index);
  }
  if (swIsKeyword(f, index - 1)) {
    f.insertSpace(" ", index);
  }
};

const swHoistTryInScope = (f: SwFormatter, names: SwTryNames, scopeStart: i32): void => {
  const keyword = "try";
  const toRemove: i32[] = [];
  let prev = scopeStart;
  while (true) {
    const i = f.indexOfAfter(SW_KEYWORD, keyword, 0, prev);
    if (i < 0) {
      break;
    }
    if (f.has(i + 1) && !swIsUnwrap(f, i + 1)) {
      toRemove.push(i);
    }
    prev = i;
  }
  if (toRemove.length === 0) {
    return;
  }
  let insertIndex = scopeStart;
  while (true) {
    const i = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, insertIndex);
    if (i < 0) {
      break;
    }
    const pk = f.k(insertIndex);
    const ps = f.s(insertIndex);
    const prevIsOpen = pk === SW_START && (ps === "(" || ps === "[");
    const k = f.k(i);
    const s = f.s(i);
    const a = f.a(i);
    let breakLoop = false;
    if (k === SW_IDENT && prevIsOpen) {
      if (swIsTryCapturing(f, names, i)) {
        return;
      }
    } else if (k === SW_OP && a === SW_OP_INFIX && s !== "=") {
      if (prevIsOpen && swIsTryCapturing(f, names, i)) {
        return;
      }
    } else if (swIsMacroTok(f, i) && pk === SW_START && ps === "(") {
      return;
    } else if (swIsAttribute(f, i) && pk === SW_START && ps === "(") {
      return;
    } else if (k === SW_KEYWORD && (s === "is" || s === "as" || s === "try" || s === "await")) {
      // continue the walk
    } else if (
      k === SW_END &&
      s === "}" &&
      ((pk === SW_OP && f.a(insertIndex) === SW_OP_INFIX) || (pk === SW_LINEBREAK && swNextIsInfix(f, i)))
    ) {
      const sos = swStartOfScope(f, i);
      const pi = sos >= 0 ? f.indexBefore(SW_T_NON_SPACE, sos) : -1;
      if (pi < 0) {
        break;
      }
      insertIndex = pi;
      continue;
    } else if (
      (k === SW_OP && a === SW_OP_PREFIX) ||
      k === SW_STRBODY ||
      (k === SW_END && s === ")" && (pk === SW_STRBODY || (pk === SW_END && swIsStringDelimiter(pk, ps)))) ||
      (k === SW_START && swIsStringDelimiter(k, s))
    ) {
      // continue the walk
    } else {
      let valueCase = false;
      if (swIsUnwrap(f, i)) {
        const l = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
        if (l >= 0 && f.kw(l, "try")) {
          return;
        }
        if (!prevIsOpen) {
          valueCase = true;
        }
      } else if (
        (k === SW_OP && a === SW_OP_POSTFIX) ||
        k === SW_IDENT ||
        k === SW_NUMBER ||
        (k === SW_END && (s === ">" || s === "]" || s === ")" || swIsStringDelimiter(k, s)))
      ) {
        valueCase = true;
      } else if (k === SW_LINEBREAK) {
        if ((pk === SW_OP && f.a(insertIndex) === SW_OP_INFIX) || pk === SW_STRBODY) {
          // continue the walk
        } else if (swNextIsInfix(f, i)) {
          // continue the walk
        } else {
          const j = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
          if (j >= 0 && f.k(j) === SW_OP && f.a(j) === SW_OP_INFIX && f.s(j) !== "=") {
            insertIndex = j;
            continue;
          }
          breakLoop = true;
        }
      } else {
        breakLoop = true;
      }
      if (valueCase) {
        const pa = f.a(insertIndex);
        let ok =
          (pk === SW_OP && (pa === SW_OP_INFIX || pa === SW_OP_POSTFIX)) ||
          pk === SW_STRBODY ||
          pk === SW_LINEBREAK ||
          (pk === SW_START && (ps === "<" || ps === "[" || ps === "("));
        if (!ok) {
          const cs = swCurrentScope(f, i + 1);
          ok = cs >= 0 && swIsMultilineStringDelimiter(f.k(cs), f.s(cs));
        }
        if (!ok) {
          breakLoop = true;
        } else if (f.k(i) === SW_END) {
          const sos = swStartOfScope(f, i);
          insertIndex = sos >= 0 ? sos : i;
          continue;
        }
      }
    }
    if (breakLoop) {
      break;
    }
    insertIndex = i;
  }
  for (let q = toRemove.length - 1; q >= 0; q--) {
    const index = toRemove[q];
    f.removeToken(index);
    if (f.has(index) && f.k(index) === SW_SPACE) {
      f.removeToken(index);
    }
  }
  swInsertEffectKeyword(f, insertIndex, keyword);
};

const swNextIsInfix = (f: SwFormatter, i: i32): boolean => {
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  return n >= 0 && f.k(n) === SW_OP && f.a(n) === SW_OP_INFIX;
};

/** hoistTry. */
export const swRuleHoistTry = (f: SwFormatter): void => {
  const names = new SwTryNames();
  names.names.push("expect");
  names.names.push("XCTUnwrap");
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "func")) {
      continue;
    }
    const d = swParseFunctionDeclaration(f, i);
    if (d === null || !d.hasName) {
      continue;
    }
    let ok = false;
    for (const a of d.args) {
      let auto = false;
      let throws = false;
      for (let j = a.typeStart; j <= a.typeEnd; j++) {
        if (f.s(j) === "@autoclosure") {
          auto = true;
        }
        if (f.s(j) === "throws") {
          throws = true;
        }
      }
      if (auto && throws) {
        ok = true;
        break;
      }
    }
    if (ok && names.names.indexOf(d.name) < 0) {
      names.names.push(d.name);
    }
  }
  swHoistTry(f, names);
};
