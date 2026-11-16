// SwiftFormat's noForceUnwrapInTests rule, with parseExpressionRange(endingAt:)
// and parseExpressionRange(containing:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swEndOfPostfixIfdef, swIsUnsafeExpression, swParseExpressionEnd } from "./expr";
import { SwFormatter } from "./formatter";
import { SwFuncDecl, swParseFunctionDeclaration } from "./funcdecl";
import { swEndOfScope, swIsUnwrap, swParseType, swStartOfScope } from "./parsing";
import {
  swAddThrowsEffect,
  swDetectTestingFramework,
  swIsInFunctionBody,
  swIsInStringInterpolation,
  swIsTestCase,
  SW_TEST_NONE,
  SW_TEST_XCTEST,
} from "./rules_tests";
import { swParseFunctionCallArguments } from "./rules_trailing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_KEYWORD,
  SW_T_NON_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SwTok,
  SwTokList,
} from "./token";

const swIsPrefixKeywordStr = (s: string): boolean => s === "await" || s === "try" || s === "repeat" || s === "each";

/** parseExpressionRange(endingAt:)'s lower bound, or -1 for nil. */
export const swParseExpressionStart = (f: SwFormatter, endIndex: i32): i32 => {
  if (f.op(endIndex, "=", SW_OP_INFIX)) {
    return -1;
  }
  const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  if (prev >= 0) {
    const pk = f.k(prev);
    const ps = f.s(prev);
    if (f.op(prev, ".", SW_OP_INFIX) || f.tok(prev, SW_DELIM, ".")) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      return b < 0 ? -1 : swParseExpressionStart(f, b);
    }
    if (pk === SW_OP && f.a(prev) === SW_OP_INFIX && ps !== "=") {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      return b < 0 ? -1 : swParseExpressionStart(f, b);
    }
    if (pk === SW_OP && f.a(prev) === SW_OP_PREFIX) {
      const tbo = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, prev);
      if (tbo >= 0 && f.k(tbo) === SW_OP && f.a(tbo) === SW_OP_INFIX) {
        const s = swParseExpressionStart(f, prev);
        if (s >= 0) {
          return s;
        }
      }
    }
    if (f.kw(prev, "as") || f.kw(prev, "is")) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      return b < 0 ? -1 : swParseExpressionStart(f, b);
    }
    if (swIsUnwrap(f, prev)) {
      const asIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      if (asIndex >= 0 && f.kw(asIndex, "as")) {
        const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, asIndex);
        return b < 0 ? -1 : swParseExpressionStart(f, b);
      }
    }
    if ((pk === SW_OP && f.a(prev) === SW_OP_PREFIX) || swIsPrefixKeywordStr(ps) || swIsUnsafeExpression(f, prev)) {
      const s = swParseExpressionStart(f, prev);
      return s >= 0 ? s : prev;
    }
    if (swIsUnwrap(f, prev) || f.op(prev, "?", SW_OP_POSTFIX)) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prev);
      if (b >= 0 && swIsPrefixKeywordStr(f.s(b))) {
        const s = swParseExpressionStart(f, b);
        return s >= 0 ? s : b;
      }
    }
  }
  const k = f.k(endIndex);
  if (k === SW_OP && (f.a(endIndex) === SW_OP_POSTFIX || f.a(endIndex) === SW_OP_INFIX)) {
    if (prev < 0) {
      return -1;
    }
    return swParseExpressionStart(f, prev);
  }
  if (k === SW_END) {
    const sos = f.indexBefore(SW_T_START_OF_SCOPE, endIndex);
    if (sos < 0) {
      return -1;
    }
    const pe = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sos);
    const prevStart = pe >= 0 ? swParseExpressionStart(f, pe) : -1;
    if (f.s(endIndex) === "#endif") {
      if (prevStart < 0 || swEndOfPostfixIfdef(f, sos) !== endIndex) {
        return -1;
      }
      return prevStart;
    }
    if (prevStart >= 0) {
      return prevStart;
    }
    return sos;
  }
  if (k === SW_IDENT || k === SW_NUMBER || (k === SW_KEYWORD && f.s(endIndex).startsWith("#"))) {
    return endIndex;
  }
  return -1;
};

/** parseExpressionRange(containing:) as [lo, hi], or null. */
export const swParseExpressionRangeContaining = (f: SwFormatter, index: i32): i32[] | null => {
  let fwdEnd = swParseExpressionEnd(f, index);
  if (fwdEnd < 0 && f.k(index) === SW_OP && (f.a(index) === SW_OP_POSTFIX || f.a(index) === SW_OP_INFIX)) {
    let parseToken = index;
    while (true) {
      const previousToken = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, parseToken);
      if (previousToken < 0) {
        break;
      }
      const e = swParseExpressionEnd(f, parseToken);
      if (e >= 0 && parseToken <= index && index <= e) {
        break;
      }
      parseToken = previousToken;
    }
    fwdEnd = swParseExpressionEnd(f, parseToken);
  }
  if (fwdEnd < 0) {
    return null;
  }
  const bs = swParseExpressionStart(f, fwdEnd);
  if (bs < 0 || !(bs <= index && index <= fwdEnd)) {
    return null;
  }
  return [bs, fwdEnd];
};

/** parseForceUnwrapExpressionRange(containing:) as [lo, hi], or null. */
const swForceUnwrapExpressionRange = (f: SwFormatter, index: i32): i32[] | null => {
  const r = swParseExpressionRangeContaining(f, index);
  if (r === null) {
    return null;
  }
  let start = r[0];
  let previous = start;
  while (true) {
    const next = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, previous);
    if (next < 0 || next > index) {
      break;
    }
    if (
      f.tok(next, SW_START, "(") &&
      swStartOfScope(f, next) === swStartOfScope(f, start) &&
      !f.onSameLine(previous, next) &&
      (f.k(previous) === SW_END || f.k(previous) === SW_IDENT)
    ) {
      start = next;
    }
    previous = next;
  }
  while (true) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
    if (p < 0 || !f.onSameLine(p, start)) {
      break;
    }
    if (!(f.s(p) === "try" || f.s(p) === "await" || (f.k(p) === SW_OP && f.a(p) === SW_OP_PREFIX))) {
      break;
    }
    start = p;
  }
  return [start, r[1]];
};

/** canInsertRequire(in:). */
const swCanInsertRequire = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let i = lo; i <= hi; i++) {
    if (f.kw(i, "#require")) {
      return false;
    }
  }
  let index = lo;
  while (true) {
    const scope = swStartOfScope(f, index);
    if (scope < 0) {
      break;
    }
    if (f.tok(scope, SW_START, "(")) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, scope);
      if (p >= 0 && f.kw(p, "#require")) {
        return false;
      }
    }
    index = scope;
  }
  return true;
};

/** canUnwrapOperatorOperand(in:). */
const swCanUnwrapOperatorOperand = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let i = lo; i <= hi; i++) {
    if (f.kw(i, "await") || f.kw(i, "try") || f.kw(i, "#require") || f.op(i, "?", SW_OP_INFIX)) {
      return false;
    }
  }
  for (let i = lo; i <= hi; i++) {
    if (!f.op(i, "!", SW_OP_POSTFIX)) {
      continue;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (p < 0 || n < 0 || !(n >= lo && n <= hi)) {
      continue;
    }
    const ns = f.s(n);
    if (f.kw(p, "as") || !(ns === "." || ns === "(" || ns === "[")) {
      return false;
    }
  }
  return true;
};

/** parseTokenAfterForceCastParenScope(asIndex:), or -1. */
const swTokenAfterForceCastParenScope = (f: SwFormatter, asIndex: i32): i32 => {
  if (!f.kw(asIndex, "as")) {
    return -1;
  }
  const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, asIndex);
  if (ta < 0 || !f.op(ta, "!", SW_OP_POSTFIX)) {
    return -1;
  }
  const cs = swStartOfScope(f, asIndex);
  if (cs < 0 || !f.tok(cs, SW_START, "(")) {
    return -1;
  }
  const eos = swEndOfScope(f, cs);
  if (eos < 0) {
    return -1;
  }
  const tap = f.indexAfter(SW_T_NON_LINEBREAK, eos);
  if (tap < 0 || !(f.k(tap) === SW_OP || f.k(tap) === SW_START)) {
    return -1;
  }
  return tap;
};

/** The `treatAsInfixOperator` test of parseExpressionRangeContainingForceUnwrap. */
const swTreatAsInfixOperator = (f: SwFormatter, i: i32): boolean => {
  if (f.k(i) === SW_OP && f.a(i) === SW_OP_INFIX && !f.op(i, ".", SW_OP_INFIX)) {
    return true;
  }
  if (f.kw(i, "is")) {
    return true;
  }
  if (f.kw(i, "as")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (n >= 0 && !f.op(n, "!", SW_OP_POSTFIX)) {
      return true;
    }
  }
  return false;
};

/** parseExpressionRangeContainingForceUnwrap(_:): an auto-updating range handle in `f`, or -1. */
const swExpressionRangeContainingForceUnwrap = (f: SwFormatter, fu: i32): i32 => {
  const r0 = swForceUnwrapExpressionRange(f, fu);
  if (r0 === null) {
    return -1;
  }
  let h = f.ref(r0[0], r0[1]);
  while (true) {
    const lo = f.refLo[h];
    const hi = f.refHi[h];
    let found = -1;
    for (let i = lo; i <= hi; i++) {
      const t = swTokenAfterForceCastParenScope(f, i);
      if (t >= 0 && !(t >= lo && t <= hi)) {
        found = t;
        break;
      }
    }
    if (found < 0) {
      break;
    }
    const e = swParseExpressionRangeContaining(f, found);
    f.unref(h);
    if (e === null) {
      return -1;
    }
    h = f.ref(e[0], e[1]);
  }
  const lo = f.refLo[h];
  const hi = f.refHi[h];
  const sl = swStartOfScope(f, lo);
  let infix = -1;
  for (let i = lo; i <= hi; i++) {
    if (swTreatAsInfixOperator(f, i) && swStartOfScope(f, i) === sl) {
      infix = i;
      break;
    }
  }
  if (infix < 0) {
    return h;
  }
  f.unref(h);
  for (let i = lo; i < infix; i++) {
    if (f.kw(i, "await")) {
      return -1;
    }
  }
  for (let i = lo; i <= hi; i++) {
    if (swStartOfScope(f, i) !== sl) {
      continue;
    }
    if (f.op(i, "?", SW_OP_INFIX)) {
      return -1;
    }
    if (f.kw(i, "as")) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (n >= 0 && f.op(n, "!", SW_OP_POSTFIX)) {
        return -1;
      }
    }
  }
  if (f.s(infix) === "as" || f.s(infix) === "is") {
    const ts = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, infix);
    const te = ts >= 0 ? swParseType(f, ts) : -1;
    if (te >= 0 && fu >= ts && fu <= te) {
      return -1;
    }
  }
  const olo = fu < infix ? lo : infix + 1;
  const ohi = fu < infix ? infix : hi + 1;
  const sub = new SwTokList();
  for (let i = olo; i < ohi; i++) {
    sub.push(f.k(i), f.s(i), f.a(i));
  }
  const g = new SwFormatter(sub);
  const sh = swExpressionRangeContainingForceUnwrap(g, fu - olo);
  if (sh < 0) {
    return -1;
  }
  return f.ref(g.refLo[sh] + olo, g.refHi[sh] + olo);
};

/** tryKeywordSupported(at:in:). */
const swTryKeywordSupported = (f: SwFormatter, index: i32, fd: SwFuncDecl): boolean =>
  swIsInFunctionBody(f, fd, index) && !swIsInStringInterpolation(f, index);

/** Converts one force unwrap (the loop body of noForceUnwrapInTests); answers whether it wrapped an expression. */
const swConvertForceUnwrap = (f: SwFormatter, op: i32, tc: i32, framework: i32): boolean => {
  if (!f.op(op, "!", SW_OP_POSTFIX)) {
    return false;
  }
  const fd = swParseFunctionDeclaration(f, tc);
  if (fd === null) {
    return false;
  }
  if (!swTryKeywordSupported(f, op, fd)) {
    return false;
  }
  const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, op);
  if (pt >= 0 && f.kw(pt, "try")) {
    return false;
  }
  // An implicitly unwrapped optional type annotation.
  const colon = f.lastIndexOfIn(SW_DELIM, ":", 0, 0, op);
  if (colon >= 0) {
    const kwi = f.lastIndexInType(SW_T_KEYWORD, 0, colon);
    if (kwi >= 0 && (f.s(kwi) === "let" || f.s(kwi) === "var")) {
      if (f.indexOfIn(SW_OP, "=", SW_OP_INFIX, colon, op) < 0) {
        return false;
      }
    }
  }
  const h = swExpressionRangeContainingForceUnwrap(f, op);
  if (h < 0) {
    return false;
  }
  if (framework !== SW_TEST_XCTEST && !swCanInsertRequire(f, f.refLo[h], f.refHi[h])) {
    f.unref(h);
    return false;
  }
  if (f.op(f.refLo[h], "\\", SW_OP_PREFIX)) {
    f.unref(h);
    return false;
  }
  const full = swForceUnwrapExpressionRange(f, f.refLo[h]);
  const th = f.ref(full !== null ? full[0] : f.refLo[h], full !== null ? full[0] : f.refLo[h]);
  const isOperatorRHS = f.refLo[th] < f.refLo[h];
  if (isOperatorRHS && !swCanUnwrapOperatorOperand(f, f.refLo[h], f.refHi[h])) {
    f.unref(h);
    f.unref(th);
    return false;
  }
  const rlo = f.refLo[h];
  const rhi = f.refHi[h];
  for (let i = rhi; i >= rlo; i--) {
    if (!f.op(i, "!", SW_OP_POSTFIX) || !swTryKeywordSupported(f, i, fd)) {
      continue;
    }
    let cur = i;
    let inSub = false;
    while (true) {
      const scopeStart = swStartOfScope(f, cur);
      if (scopeStart < 0 || !(scopeStart >= f.refLo[h] && scopeStart <= f.refHi[h])) {
        break;
      }
      const pi = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, scopeStart);
      if (pi >= 0) {
        const pk = f.k(pi);
        if (pk === SW_IDENT || (pk === SW_OP && f.a(pi) === SW_OP_POSTFIX) || pk === SW_END) {
          inSub = true;
          break;
        }
      }
      cur = scopeStart;
    }
    if (inSub) {
      continue;
    }
    const prev = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prev >= 0 && f.kw(prev, "as")) {
      const tap = swTokenAfterForceCastParenScope(f, prev);
      if (tap >= 0) {
        f.insert(SW_OP, "?", SW_OP_POSTFIX, tap);
      }
    }
    let shouldRemove = false;
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nt >= 0) {
      if (f.s(nt) === "is" || f.s(nt) === "as" || !(nt >= f.refLo[h] && nt <= f.refHi[h])) {
        shouldRemove = true;
      }
    } else {
      shouldRemove = true;
    }
    const prev2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (prev2 >= 0 && f.kw(prev2, "try")) {
      shouldRemove = true;
    }
    if (shouldRemove) {
      f.removeToken(i);
    } else {
      f.replaceToken(i, SW_OP, "?", SW_OP_POSTFIX);
    }
  }
  let needs = true;
  const lo = f.refLo[h];
  const hi = f.refHi[h];
  const tae = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, hi);
  if (tae >= 0 && f.op(tae, "=", SW_OP_INFIX)) {
    needs = false;
  }
  if (!isOperatorRHS && tae >= 0 && f.op(tae, "==", SW_OP_INFIX)) {
    needs = false;
  }
  if (!isOperatorRHS) {
    const cps = swStartOfScope(f, lo);
    if (cps >= 0 && f.tok(cps, SW_START, "(")) {
      const fni = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cps);
      if (fni >= 0 && f.k(fni) === SW_IDENT && tae >= 0 && f.k(tae) !== SW_OP) {
        const name = f.s(fni);
        if (name === "XCTAssertNil") {
          needs = false;
        } else if (name === "XCTAssertEqual") {
          if (swParseFunctionCallArguments(f, cps).length === 2) {
            needs = false;
          }
        }
      }
    }
  }
  const sos = swStartOfScope(f, lo);
  if (sos >= 0 && f.tok(sos, SW_START, "{")) {
    const tbe = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo);
    if (tbe >= 0 && f.k(tbe) !== SW_OP) {
      if (tbe === fd.bodyStart) {
        needs = false;
      }
      const ps = swParseExpressionStart(f, tbe);
      if (ps >= 0 && !(ps <= hi && lo <= tbe)) {
        needs = false;
      }
    }
  }
  if (needs) {
    const spo = f.k(lo) === SW_OP && f.a(lo) === SW_OP_PREFIX && !f.op(lo, ".", SW_OP_PREFIX);
    const wrapper: SwTok[] = [];
    if (!isOperatorRHS) {
      wrapper.push(new SwTok(SW_KEYWORD, "try", 0));
      wrapper.push(new SwTok(SW_SPACE, " ", 0));
    }
    if (framework === SW_TEST_XCTEST) {
      wrapper.push(new SwTok(SW_IDENT, "XCTUnwrap", 0));
    } else {
      wrapper.push(new SwTok(SW_KEYWORD, "#require", 0));
    }
    wrapper.push(new SwTok(SW_START, "(", 0));
    const ins = spo ? lo + 1 : lo;
    f.insert(SW_END, ")", 0, hi + 1);
    f.insertToks(wrapper, ins);
    if (spo && !isOperatorRHS) {
      f.insert(SW_END, ")", 0, f.refHi[h] + 1);
      f.insert(SW_START, "(", 0, ins);
    }
    if (isOperatorRHS && !f.kw(f.refLo[th], "try")) {
      f.insertToks([new SwTok(SW_KEYWORD, "try", 0), new SwTok(SW_SPACE, " ", 0)], f.refLo[th]);
    }
  }
  f.unref(h);
  f.unref(th);
  return needs;
};

/** noForceUnwrapInTests. */
export const swRuleNoForceUnwrapInTests = (f: SwFormatter): void => {
  const framework = swDetectTestingFramework(f);
  if (framework === SW_TEST_NONE) {
    return;
  }
  const testCases: i32[] = [];
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "func")) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, i);
    if (fd !== null && swIsTestCase(f, i, fd, framework)) {
      testCases.push(f.ref(i, i));
    }
  }
  if (testCases.length === 0) {
    return;
  }
  const ops: i32[] = [];
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.op(i, "!", SW_OP_POSTFIX)) {
      ops.push(f.ref(i, i));
    }
  }
  for (const tc of testCases) {
    const fd = swParseFunctionDeclaration(f, f.refLo[tc]);
    if (fd === null || fd.bodyStart < 0) {
      break;
    }
    const mine: i32[] = [];
    for (const o of ops) {
      const oi = f.refLo[o];
      if (oi >= fd.bodyStart && oi <= fd.bodyEnd) {
        mine.push(o);
      }
    }
    let converted = false;
    for (const o of mine) {
      if (swConvertForceUnwrap(f, f.refLo[o], f.refLo[tc], framework)) {
        converted = true;
      }
    }
    if (converted) {
      swAddThrowsEffect(f, fd);
    }
  }
  for (const o of ops) {
    f.unref(o);
  }
  for (const tc of testCases) {
    f.unref(tc);
  }
};
