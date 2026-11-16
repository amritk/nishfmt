// Conservative stand-ins for the SwiftFormat rules not ported yet: each answers true
// (the rule would change nothing) only when the file has none of the tokens the rule
// starts from, and false (the file is not handled) otherwise.

import { SwFormatter } from "./formatter";
import { swHasImport } from "./imports";
import {
  SW_END,
  SW_IDENT,
  SW_NUMBER,
  SW_KEYWORD,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_PREFIX,
  SW_START,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  swIsStringDelimiter,
} from "./token";

const swHasIdent = (f: SwFormatter, name: string): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) === SW_IDENT && f.s(i) === name) {
      return true;
    }
  }
  return false;
};

const swHasKeyword = (f: SwFormatter, name: string): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) === SW_KEYWORD && f.s(i) === name) {
      return true;
    }
  }
  return false;
};

/** Rules that only act on files importing XCTest or Testing. */
export const swGuardTests = (f: SwFormatter): boolean => !swHasImport(f, "Testing") && !swHasImport(f, "XCTest");

/** Rules that only act on files importing Testing. */
export const swGuardSwiftTesting = (f: SwFormatter): boolean => !swHasImport(f, "Testing");

/** nestedIf: no `{` directly followed by `if`. */
export const swGuardNestedIf = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.tok(i, SW_START, "{") && f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_KEYWORD, "if")) {
      return false;
    }
  }
  return true;
};

/** preferForLoop: no `.forEach`. */
export const swGuardPreferForLoop = (f: SwFormatter): boolean => !swHasIdent(f, "forEach");

/** redundantClosure: no `}` followed by `()`. */
export const swGuardRedundantClosure = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.tok(i, SW_END, "}")) {
      const p = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.tok(p, SW_START, "(")) {
        const q = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p);
        if (q >= 0 && f.tok(q, SW_END, ")")) {
          return false;
        }
      }
    }
  }
  return true;
};

/** trailingClosures: no argument list ending in a closure. */
export const swGuardTrailingClosures = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.tok(i, SW_END, ")")) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.tok(p, SW_END, "}")) {
        return false;
      }
    }
  }
  return true;
};

/** redundantVariable: no `return identifier` ending its expression there. */
export const swGuardRedundantVariable = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (!f.kw(i, "return")) {
      continue;
    }
    const v = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
    if (v < 0 || f.k(v) !== SW_IDENT) {
      continue;
    }
    const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, v);
    if (nx < 0) {
      return false;
    }
    const k = f.k(nx);
    const s = f.s(nx);
    if (k === SW_OP || (k === SW_START && (s === "(" || s === "[" || s === "{")) || (k === SW_KEYWORD && (s === "as" || s === "is"))) {
      continue;
    }
    return false;
  }
  return true;
};

/** simplifyGenericConstraints: no `where` alongside generics. */
export const swGuardSimplifyGenericConstraints = (f: SwFormatter): boolean => {
  if (!swHasKeyword(f, "where")) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.tok(i, SW_START, "<")) {
      return false;
    }
  }
  return true;
};

/** repeatedGuard: no `guard` right after a closing brace. */
export const swGuardRepeatedGuard = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.kw(i, "guard")) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.tok(p, SW_END, "}")) {
        return false;
      }
    }
  }
  return true;
};

/** redundantInit: no `.init`. */
export const swGuardRedundantInit = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) === SW_IDENT && f.s(i) === "init") {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.ks(p, SW_OP, ".")) {
        return false;
      }
    }
  }
  return true;
};

/** contentBuilder: no result-builder attributes. */
export const swGuardContentBuilder = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) === SW_KEYWORD) {
      const s = f.s(i);
      if (s.startsWith("@") && (s.indexOf("Builder") >= 0 || s === "@SwiftUI" || s === "@SwiftUICore")) {
        return false;
      }
    }
  }
  return true;
};

/** redundantMemberwiseInit: no struct with an init. */
export const swGuardRedundantMemberwiseInit = (f: SwFormatter): boolean => !(swHasKeyword(f, "struct") && swHasKeyword(f, "init"));

export const swGuardRedundantEquatable = (f: SwFormatter): boolean => !swHasIdent(f, "Equatable");

export const swGuardRedundantEnumerated = (f: SwFormatter): boolean => !swHasIdent(f, "enumerated");

export const swGuardRedundantEmptyView = (f: SwFormatter): boolean => !swHasIdent(f, "EmptyView");

export const swGuardRedundantSwiftUIGroup = (f: SwFormatter): boolean => !swHasIdent(f, "Group");

/** yodaConditions: no comparison with a constant-looking left side. */
export const swGuardYodaConditions = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) !== SW_OP || f.a(i) !== SW_OP_INFIX) {
      continue;
    }
    const s = f.s(i);
    if (!(s === "==" || s === "!=" || s === "<" || s === "<=" || s === ">" || s === ">=")) {
      continue;
    }
    let p = f.indexBefore(SW_T_NON_SPACE, i);
    while (p >= 0 && f.k(p) === SW_OP && f.a(p) !== SW_OP_INFIX && f.a(p) !== SW_OP_PREFIX) {
      p--;
    }
    if (p < 0) {
      continue;
    }
    const k = f.k(p);
    const ps = f.s(p);
    if (k === SW_NUMBER || (k === SW_IDENT && (ps === "true" || ps === "false" || ps === "nil"))) {
      return false;
    }
    if (k === SW_END || k === SW_START) {
      return false;
    }
    if (k === SW_IDENT && p > 0 && f.op(p - 1, ".", SW_OP_PREFIX)) {
      return false;
    }
    if (swIsStringDelimiter(k, ps)) {
      return false;
    }
  }
  return true;
};

