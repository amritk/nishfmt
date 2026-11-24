// SwiftFormat's test-only rules: noForceTryInTests, redundantThrows and
// redundantAsync (both testsOnly), with detectTestingFramework(), isTestCase(at:in:for:),
// isInFunctionBody(of:at:), addThrowsEffect(to:) and removeEffect(_:from:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { SwFuncDecl, swParseFunctionDeclaration } from "./funcdecl";
import { swHasImport } from "./imports";
import { swHasModifier } from "./modifiers";
import { swBackticksRequired } from "./rules_redundant1";
import {
  swEndOfScope,
  swIsStartOfClosure,
  swIsUnwrap,
  swLastSignificantKeyword,
  swStartOfScope,
  SW_EX_WHERE,
} from "./parsing";
import {
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_POSTFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SwTok,
  swIsSwiftKeyword,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

export const SW_TEST_NONE: i32 = 0;
export const SW_TEST_XCTEST: i32 = 1;
export const SW_TEST_SWIFT_TESTING: i32 = 2;

/** detectTestingFramework(). */
export const swDetectTestingFramework = (f: SwFormatter): i32 => {
  const t = swHasImport(f, "Testing");
  const x = swHasImport(f, "XCTest");
  if (t && x) {
    return SW_TEST_NONE;
  }
  if (t) {
    return SW_TEST_SWIFT_TESTING;
  }
  return x ? SW_TEST_XCTEST : SW_TEST_NONE;
};

/** isTestCase(at:in:for:). */
export const swIsTestCase = (f: SwFormatter, funcKeywordIndex: i32, fd: SwFuncDecl, framework: i32): boolean => {
  if (framework === SW_TEST_XCTEST) {
    return fd.hasName && fd.name.startsWith("test") && fd.returnStart < 0 && fd.args.length === 0;
  }
  return swHasModifier(f, funcKeywordIndex, "@Test");
};

/** isInFunctionBody(of:at:). */
export const swIsInFunctionBody = (f: SwFormatter, fd: SwFuncDecl, index: i32): boolean => {
  if (fd.bodyStart < 0 || index < fd.bodyStart || index > fd.bodyEnd) {
    return false;
  }
  const sos = swStartOfScope(f, index);
  if (sos < 0) {
    return false;
  }
  if (sos === fd.bodyStart) {
    return true;
  }
  if (swIsStartOfClosure(f, sos)) {
    return false;
  }
  if (swLastSignificantKeyword(f, sos, SW_EX_WHERE) === "func") {
    return false;
  }
  return swIsInFunctionBody(f, fd, sos);
};

/** isInStringInterpolation(at:). */
export const swIsInStringInterpolation = (f: SwFormatter, index: i32): boolean => {
  const sos = swStartOfScope(f, index);
  if (sos < 0) {
    return false;
  }
  if (f.tok(sos, SW_START, '"') || f.tok(sos, SW_START, '"""')) {
    return true;
  }
  return swIsInStringInterpolation(f, sos);
};

/** The effect strings of a declaration (`throws(E)` as one string). */
const swEffects = (f: SwFormatter, fd: SwFuncDecl): string[] => {
  const out: string[] = [];
  if (fd.effectsStart < 0) {
    return out;
  }
  for (let j = fd.effectsStart; j <= fd.effectsEnd; j = toI32(toU32(j) + 1)) {
    const s = f.s(j);
    if (!(f.k(j) === SW_KEYWORD || f.k(j) === SW_IDENT) || !(s === "async" || s === "throws" || s === "rethrows")) {
      continue;
    }
    if (s === "throws") {
      const p = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, j);
      if (p >= 0 && p <= fd.effectsEnd && f.tok(p, SW_START, "(")) {
        const e = swEndOfScope(f, p);
        if (e >= 0) {
          out.push(f.text(j, toI32(toU32(e) + 1)));
          j = e;
          continue;
        }
      }
    }
    out.push(s);
  }
  return out;
};

const swHasEffectPrefix = (effects: string[], prefix: string): boolean => {
  for (const e of effects) {
    if (e.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

/** addThrowsEffect(to:). */
export const swAddThrowsEffect = (f: SwFormatter, fd: SwFuncDecl): void => {
  if (swEffects(f, fd).indexOf("throws") >= 0) {
    return;
  }
  if (fd.effectsStart >= 0) {
    const asyncIndex = f.indexOfIn(SW_IDENT, "async", 0, fd.effectsStart, toI32(toU32(fd.effectsEnd) + 1));
    if (asyncIndex >= 0) {
      f.insertToks([new SwTok(SW_SPACE, " ", 0), new SwTok(SW_KEYWORD, "throws", 0)], toI32(toU32(asyncIndex) + 1));
    } else {
      f.insertToks([new SwTok(SW_KEYWORD, "throws", 0), new SwTok(SW_SPACE, " ", 0)], fd.effectsEnd);
    }
  } else {
    f.insertToks([new SwTok(SW_SPACE, " ", 0), new SwTok(SW_KEYWORD, "throws", 0)], toI32(toU32(fd.argsEnd) + 1));
  }
};

/** removeEffect(_:from:). */
const swRemoveEffect = (f: SwFormatter, effect: string, fd: SwFuncDecl): void => {
  if (fd.effectsStart < 0) {
    return;
  }
  let effectIndex = f.indexOfIn(SW_KEYWORD, effect, 0, fd.effectsStart, toI32(toU32(fd.effectsEnd) + 1));
  if (effectIndex < 0) {
    effectIndex = f.indexOfIn(SW_IDENT, effect, 0, fd.effectsStart, toI32(toU32(fd.effectsEnd) + 1));
  }
  if (effectIndex < 0) {
    return;
  }
  let endIndex = effectIndex;
  if (effect === "throws") {
    const p = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, effectIndex);
    if (p >= 0 && f.tok(p, SW_START, "(")) {
      const e = swEndOfScope(f, p);
      if (e >= 0) {
        endIndex = e;
      }
    }
  }
  if (toI32(toU32(endIndex) + 1) < f.count() && f.k(toI32(toU32(endIndex) + 1)) === SW_SPACE) {
    endIndex = toI32(toU32(endIndex) + 1);
  }
  f.removeTokens(effectIndex, toI32(toU32(endIndex) + 1));
};

/** noForceTryInTests. */
export const swRuleNoForceTryInTests = (f: SwFormatter): void => {
  const framework = swDetectTestingFramework(f);
  if (framework === SW_TEST_NONE) {
    return;
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "func")) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, i);
    if (fd === null || !swIsTestCase(f, i, fd, framework) || fd.bodyStart < 0) {
      continue;
    }
    let found = false;
    let abort = false;
    for (let index = fd.bodyEnd; index >= fd.bodyStart; index = toI32(toU32(index) - 1)) {
      if (!f.kw(index, "try")) {
        continue;
      }
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (n < 0) {
        abort = true;
        break;
      }
      if (!f.op(n, "!", SW_OP_POSTFIX)) {
        continue;
      }
      if (!swIsInFunctionBody(f, fd, index) || swIsInStringInterpolation(f, index)) {
        continue;
      }
      f.removeToken(n);
      found = true;
    }
    if (abort || !found) {
      continue;
    }
    swAddThrowsEffect(f, fd);
  }
};

/** redundantThrows / redundantAsync (testsOnly). */
const swRedundantEffect = (f: SwFormatter, effect: string): void => {
  const framework = swDetectTestingFramework(f);
  if (framework === SW_TEST_NONE) {
    return;
  }
  const marker = effect === "throws" ? "try" : "await";
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "func") && !f.kw(i, "init") && !f.kw(i, "subscript")) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, i);
    if (fd === null || !swHasEffectPrefix(swEffects(f, fd), effect) || fd.bodyStart < 0) {
      continue;
    }
    if (swHasModifier(f, i, "override")) {
      continue;
    }
    if (!f.kw(i, "func") || !swIsTestCase(f, i, fd, framework)) {
      continue;
    }
    let contains = false;
    for (let index = fd.bodyStart; index <= fd.bodyEnd; index = toI32(toU32(index) + 1)) {
      if (f.kw(index, marker)) {
        if (effect === "throws") {
          const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
          if (n >= 0 && swIsUnwrap(f, n)) {
            continue;
          }
        }
        if (swIsInFunctionBody(f, fd, index)) {
          contains = true;
          break;
        }
      } else if (effect === "throws" && f.kw(index, "throw")) {
        if (swIsInFunctionBody(f, fd, index)) {
          contains = true;
          break;
        }
      }
    }
    if (!contains) {
      swRemoveEffect(f, effect, fd);
    }
  }
};

export const swRuleRedundantThrows = (f: SwFormatter): void => {
  swRedundantEffect(f, "throws");
};

export const swRuleRedundantAsync = (f: SwFormatter): void => {
  swRedundantEffect(f, "async");
};

/** redundantSwiftTestingSuite. */
export const swRuleRedundantSwiftTestingSuite = (f: SwFormatter): void => {
  if (!swHasImport(f, "Testing")) {
    return;
  }
  for (let attrIndex = f.enumStart(); attrIndex >= 0; attrIndex = f.enumNext()) {
    if (!f.kw(attrIndex, "@Suite")) {
      continue;
    }
    const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, attrIndex);
    if (nextTokenIndex < 0) {
      continue;
    }
    let attributeEndIndex = attrIndex;
    if (f.tok(nextTokenIndex, SW_START, "(")) {
      const e = swEndOfScope(f, nextTokenIndex);
      if (e < 0) {
        continue;
      }
      const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextTokenIndex);
      if (first >= 0 && first < e) {
        continue;
      }
      attributeEndIndex = e;
    }
    let startIndex = attrIndex;
    let endIndex = attributeEndIndex;
    const hasLeadingSpace = attrIndex > 0 && f.k(attrIndex - 1) === SW_SPACE;
    const leadingSpaceIsAfterAttribute = hasLeadingSpace && attrIndex > 1 && f.k(attrIndex - 2) !== SW_LINEBREAK;
    const nextNonSpaceIndex = f.indexAfter(SW_T_NON_SPACE, attributeEndIndex);
    const hasTrailingLinebreak = nextNonSpaceIndex >= 0 && f.k(nextNonSpaceIndex) === SW_LINEBREAK;
    const hasTrailingSpace =
      toI32(toU32(attributeEndIndex) + 1) < f.count() && f.k(toI32(toU32(attributeEndIndex) + 1)) === SW_SPACE;
    if (leadingSpaceIsAfterAttribute) {
      startIndex = attrIndex - 1;
    } else if (hasTrailingLinebreak) {
      endIndex = nextNonSpaceIndex;
      if (hasLeadingSpace && attrIndex > 1 && f.k(attrIndex - 2) === SW_LINEBREAK) {
        startIndex = attrIndex - 1;
      }
    } else if (hasTrailingSpace) {
      endIndex = toI32(toU32(attributeEndIndex) + 1);
    }
    f.removeTokens(startIndex, toI32(toU32(endIndex) + 1));
  }
};

const swIsAsciiLetter = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Character.lowercased() of the first character; "" when it isn't ASCII (Unicode case mapping isn't ported). */
const swLowerFirst = (s: string): string => {
  if (s.length < 1) {
    return s;
  }
  const c = s.charCodeAt(0);
  if (c >= 128) {
    return "";
  }
  const l = c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.substring(0, 1);
  return l + s.substring(1);
};

const swAsciiLower = (s: string): string => {
  const parts: string[] = [];
  for (let j = 0; j < toI32(s.length); j++) {
    const c = s.charCodeAt(j);
    parts.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.substring(j, j + 1));
  }
  return parts.join("");
};

const swIsReservedName = (s: string): boolean =>
  swIsSwiftKeyword(s) ||
  s === "Any" ||
  s === "Self" ||
  s === "self" ||
  s === "super" ||
  s === "nil" ||
  s === "true" ||
  s === "false";

/** updateDeclarationName(forDeclarationAt:to:) for a `func`. */
const swUpdateDeclarationName = (f: SwFormatter, keywordIndex: i32, newName0: string): void => {
  const nameIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
  if (nameIndex < 0 || f.k(nameIndex) !== SW_IDENT) {
    return;
  }
  let newName = newName0;
  const quoted = newName.startsWith("`") && newName.endsWith("`") && newName.length >= 2;
  const unescaped = quoted ? newName.substring(1, toI32(newName.length) - 1) : newName;
  if (newName.length < 1) {
    return;
  }
  const c0 = newName.charCodeAt(0);
  if (c0 >= 128) {
    f.fatalError("non-ASCII test name", nameIndex);
    return;
  }
  if (!(swIsAsciiLetter(c0) || c0 === 96)) {
    return;
  }
  for (let j = 0; j < f.count(); j++) {
    if (f.k(j) === SW_IDENT && (f.s(j) === newName || f.s(j) === unescaped)) {
      return;
    }
  }
  if (swIsReservedName(unescaped)) {
    return;
  }
  if (!newName.startsWith("`") && swBackticksRequired(f, newName, nameIndex)) {
    newName = "`" + newName + "`";
  }
  f.replaceToken(nameIndex, SW_IDENT, newName, 0);
};

/** removeTestPrefix(fromFunctionAt:). */
const swRemoveTestPrefix = (f: SwFormatter, funcKeywordIndex: i32): void => {
  const mi = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, funcKeywordIndex);
  if (mi < 0 || f.k(mi) !== SW_IDENT) {
    return;
  }
  const name = f.s(mi);
  const lower = swAsciiLower(name);
  if (name.startsWith("test") && name !== "test") {
    let nn = swLowerFirst(name.substring(4));
    if (nn.length === 0) {
      f.fatalError("non-ASCII test name", mi);
      return;
    }
    while (nn.startsWith("_")) {
      nn = nn.substring(1);
    }
    swUpdateDeclarationName(f, funcKeywordIndex, nn);
  }
  if (name.startsWith("`test") && name.endsWith("`") && name !== "`test`" && !lower.startsWith("`test ")) {
    let nn = name.substring(5, toI32(name.length) - 1);
    while (nn.startsWith("_")) {
      nn = nn.substring(1);
    }
    if (nn.length === 0) {
      return;
    }
    const lf = swLowerFirst(nn);
    if (lf.length === 0) {
      f.fatalError("non-ASCII test name", mi);
      return;
    }
    swUpdateDeclarationName(f, funcKeywordIndex, lf);
  }
  if (lower.startsWith("`test ") && lower !== "`test `") {
    swUpdateDeclarationName(f, funcKeywordIndex, "`" + name.substring(6));
  }
};

/** swiftTestingTestCaseNames (raw identifiers need Swift 6.2; suite names are preserved). */
export const swRuleSwiftTestingTestCaseNames = (f: SwFormatter): void => {
  if (!swHasImport(f, "Testing")) {
    return;
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.kw(i, "func") && swHasModifier(f, i, "@Test")) {
      swRemoveTestPrefix(f, i);
    }
  }
};
