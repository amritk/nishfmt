// Conservative stand-ins for the SwiftFormat rules not ported yet: each answers true
// (the rule would change nothing) only when the file has none of the tokens the rule
// starts from, and false (the file is not handled) otherwise.

import { SwFormatter } from "./formatter";
import { SwDecl, SW_DECL_TYPE, swDeclKeywordIndex, swParseDeclarations, swReleaseDecls } from "./decl";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swEndOfScope, swStartOfForLoopPattern } from "./parsing";
import { swHasImport } from "./imports";
import { swHasModifier } from "./modifiers";
import { swLowercased } from "./rules_simple";
import { swDetectTestingFramework, swIsTestCase, SW_TEST_NONE } from "./rules_tests";
import {
  SW_OP_POSTFIX,
  SW_END,
  SW_LINEBREAK,
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

/** preferForLoop: no `.forEach`. */
export const swGuardPreferForLoop = (f: SwFormatter): boolean => {
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (!f.tok(i, SW_IDENT, "forEach")) {
      continue;
    }
    const dot = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (dot < 0 || !f.op(dot, ".", SW_OP_INFIX)) {
      continue;
    }
    let ob = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (ob >= 0 && f.tok(ob, SW_START, "(")) {
      ob = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ob);
    }
    if (ob < 0 || !f.tok(ob, SW_START, "{")) {
      continue;
    }
    // preserveSingleLineForEach: a closure on one line is kept
    const cb = swEndOfScope(f, ob);
    if (cb < 0) {
      return false;
    }
    for (let j = ob; j < cb; j++) {
      if (f.k(j) === SW_LINEBREAK) {
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
    let initDecl: SwDecl | null = null;
    for (const b of d.body) {
      if (b.keyword === "init") {
        inits++;
        initDecl = b;
      }
    }
    if (inits !== 1 || initDecl === null) {
      continue;
    }
    // The init must be non-failable, with a body, and every parameter labelled by its own name.
    const ik = swDeclKeywordIndex(f, initDecl);
    const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ik);
    if (nx >= 0 && f.k(nx) === SW_OP && (f.s(nx) === "?" || f.s(nx) === "!")) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, ik);
    if (fd === null || fd.bodyStart < 0) {
      continue;
    }
    let labelsMatch = true;
    for (const a of fd.args) {
      if (a.internalLabel.length === 0 || a.externalLabel !== a.internalLabel) {
        labelsMatch = false;
      }
    }
    if (labelsMatch) {
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

/** redundantEnumerated: no `for (a, b) in ....enumerated()`. */
export const swGuardRedundantEnumerated = (f: SwFormatter): boolean => {
  if (!swHasIdent(f, "enumerated")) {
    return true;
  }
  const n = f.count();
  for (let i = 0; i < n; i++) {
    if (!f.kw(i, "for")) {
      continue;
    }
    const ps = swStartOfForLoopPattern(f, i);
    if (ps < 0 || !f.tok(ps, SW_START, "(")) {
      continue;
    }
    const pe = swEndOfScope(f, ps);
    const inIndex = pe >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pe) : -1;
    if (inIndex < 0 || !f.kw(inIndex, "in")) {
      continue;
    }
    for (let j = inIndex + 1; j < n && !f.tok(j, SW_START, "{"); j++) {
      if (f.tok(j, SW_IDENT, "enumerated")) {
        return false;
      }
    }
  }
  return true;
};

export const swGuardRedundantEmptyView = (f: SwFormatter): boolean => !swHasIdent(f, "EmptyView");

export const swGuardRedundantSwiftUIGroup = (f: SwFormatter): boolean => !swHasIdent(f, "Group");

