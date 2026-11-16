// Conservative stand-ins for the SwiftFormat rules not ported yet: each answers true
// (the rule would change nothing) only when the file has none of the tokens the rule
// starts from, and false (the file is not handled) otherwise.

import { SwFormatter } from "./formatter";
import { SwDecl, SW_DECL_TYPE, swDeclKeywordIndex, swParseDeclarations, swReleaseDecls } from "./decl";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swEndOfScope } from "./parsing";
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
