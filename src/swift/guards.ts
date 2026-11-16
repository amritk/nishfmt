// Conservative stand-ins for the SwiftFormat rules not ported yet: each answers true
// (the rule would change nothing) only when the file has none of the tokens the rule
// starts from, and false (the file is not handled) otherwise.

import { SwFormatter } from "./formatter";
import { SW_DECL_TYPE, swParseDeclarations, swReleaseDecls } from "./decl";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swEndOfScope } from "./parsing";
import { swHasImport } from "./imports";
import { swHasModifier } from "./modifiers";
import { swLowercased } from "./rules_simple";
import { swDetectTestingFramework, swIsTestCase, SW_TEST_NONE } from "./rules_tests";
import {
  SW_OP_POSTFIX,
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

/** noForceUnwrapInTests: no `!` in the body of a test case. */
export const swGuardNoForceUnwrapInTests = (f: SwFormatter): boolean => {
  const framework = swDetectTestingFramework(f);
  if (framework === SW_TEST_NONE) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (!f.kw(i, "func")) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, i);
    if (fd === null || fd.bodyStart < 0 || !swIsTestCase(f, i, fd, framework)) {
      continue;
    }
    for (let j = fd.bodyStart; j <= fd.bodyEnd; j++) {
      if (f.op(j, "!", SW_OP_POSTFIX)) {
        return false;
      }
    }
  }
  return true;
};

/** swiftTestingTestCaseNames (raw identifiers need Swift 6.2, suite names are preserved): no `@Test` func named `test...`. */
export const swGuardSwiftTestingTestCaseNames = (f: SwFormatter): boolean => {
  if (!swHasImport(f, "Testing")) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (!f.kw(i, "func") || !swHasModifier(f, i, "@Test")) {
      continue;
    }
    const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (m >= 0 && f.k(m) === SW_IDENT) {
      const s = f.s(m);
      if (s.startsWith("test") || swLowercased(s).startsWith("`test")) {
        return false;
      }
    }
  }
  return true;
};

/** redundantSwiftTestingSuite: no `@Suite`. */
export const swGuardRedundantSwiftTestingSuite = (f: SwFormatter): boolean => {
  if (!swHasImport(f, "Testing")) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.k(i) === SW_KEYWORD && f.s(i) === "@Suite") {
      return false;
    }
  }
  return true;
};

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
    if (f.kw(i, "func")) {
      const fd = swParseFunctionDeclaration(f, i);
      if (fd !== null && fd.genericStart >= 0 && fd.whereStart >= 0) {
        return false;
      }
    } else if (f.kw(i, "struct") || f.kw(i, "class") || f.kw(i, "enum") || f.kw(i, "actor")) {
      const name = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      const gs = name >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, name) : -1;
      if (gs < 0 || !f.tok(gs, SW_START, "<")) {
        continue;
      }
      const ge = swEndOfScope(f, gs);
      if (ge < 0) {
        continue;
      }
      const w = f.indexOfAfter(SW_KEYWORD, "where", 0, ge);
      const b = f.indexOfAfter(SW_START, "{", 0, ge);
      if (w >= 0 && b >= 0 && w < b) {
        return false;
      }
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
/** redundantMemberwiseInit: no top-level struct with exactly one init. */
export const swGuardRedundantMemberwiseInit = (f: SwFormatter): boolean => {
  if (!(swHasKeyword(f, "struct") && swHasKeyword(f, "init"))) {
    return true;
  }
  const decls = swParseDeclarations(f);
  let ok = true;
  for (const d of decls) {
    if (d.keyword !== "struct" || d.kind !== SW_DECL_TYPE) {
      continue;
    }
    let inits = 0;
    for (const b of d.body) {
      if (b.keyword === "init") {
        inits++;
      }
    }
    if (inits === 1) {
      ok = false;
    }
  }
  swReleaseDecls(f, decls);
  return ok;
};

/** redundantEquatable: no `Equatable` alongside a `func ==`. */
export const swGuardRedundantEquatable = (f: SwFormatter): boolean => {
  if (!swHasIdent(f, "Equatable")) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (f.kw(i, "func")) {
      const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (m >= 0 && f.k(m) === SW_OP && f.s(m) === "==") {
        return false;
      }
    }
  }
  return true;
};

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

