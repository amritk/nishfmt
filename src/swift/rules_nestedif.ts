// SwiftFormat's nestedIf rule (mergeNestedIf / flattenElseIf; if expressions need
// Swift 5.9, so with an undefined version no `if` is an expression).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import { swRefLo } from "./decl";
import { swParsePropertyDeclaration } from "./expr";
import { swCommentDirective } from "./imports";
import { SwFormatter } from "./formatter";
import { swEndOfScope, swSpaceEquivalentToTokens, swStartOfConditionalBranchBody } from "./parsing";
import { swIsInResultBuilder } from "./rules_simple";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
  swIsMultilineStringDelimiter,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

/** ifStatementBranches(at:) as [start0, end0, start1, end1, ...]. */
const swIfBranchPairs = (f: SwFormatter, ifIndex: i32): i32[] => {
  const out: i32[] = [];
  let next = ifIndex;
  while (next >= 0 && (next === ifIndex || f.kw(next, "else"))) {
    const sob = swStartOfConditionalBranchBody(f, next);
    if (sob < 0) {
      break;
    }
    const eob = swEndOfScope(f, sob);
    if (eob < 0) {
      break;
    }
    out.push(sob);
    out.push(eob);
    if (next > ifIndex && !f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, next, SW_KEYWORD, "if")) {
      break;
    }
    next = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eob);
  }
  return out;
};

const swHasComment = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.isComment(j)) {
      return true;
    }
  }
  return false;
};

/** Whether a comment body in lo ..< hi reads as a comment directive (`word: ...`). */
const swHasCommentDirective = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.k(j) === SW_COMMENT && swCommentDirective(f.s(j)).length !== 0) {
      return true;
    }
  }
  return false;
};

const swHasMultilineString = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (swIsMultilineStringDelimiter(f.k(j), f.s(j))) {
      return true;
    }
  }
  return false;
};

/** replaceNestedIfIndentation(_:with:after:through:). */
const swReplaceNestedIfIndentation = (
  f: SwFormatter,
  oldIndent: string,
  newIndent: string,
  lowerBound: i32,
  upperBound0: i32,
): void => {
  if (oldIndent === newIndent) {
    return;
  }
  let upperBound = upperBound0;
  while (lowerBound < upperBound) {
    let lb = -1;
    for (let j = upperBound; j >= lowerBound; j = toI32(toU32(j) - 1)) {
      if (f.k(j) === SW_LINEBREAK) {
        lb = j;
        break;
      }
    }
    if (lb < 0 || lb <= lowerBound) {
      return;
    }
    if (f.has(toI32(toU32(lb) + 1)) && f.k(toI32(toU32(lb) + 1)) === SW_SPACE) {
      const indent = f.s(toI32(toU32(lb) + 1));
      if (indent.startsWith(oldIndent)) {
        f.insertSpace(newIndent + indent.substring(oldIndent.length), toI32(toU32(lb) + 1));
      }
    }
    upperBound = lb - 1;
  }
};

/** flattenElseIf(at:). */
const swFlattenElseIf = (f: SwFormatter, ifIndex: i32): boolean => {
  const br = swIfBranchPairs(f, ifIndex);
  if (br.length === 0) {
    return false;
  }
  if (swIsInResultBuilder(f, ifIndex)) {
    let hasReturn = false;
    // br holds start, end pairs; an array length keeps q below 2147483645.
    for (let q = 0; q < br.length - 1 && q < 2147483645; q += 2) {
      if (f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, br[q], SW_KEYWORD, "return")) {
        hasReturn = true;
      }
    }
    if (!hasReturn) {
      return false;
    }
  }
  // br holds start, end pairs.
  const nbr = toI32(br.length);
  if (nbr < 2) {
    fault();
    return false;
  }
  const os = br[nbr - 2];
  const oe = br[nbr - 1];
  const elseIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, os);
  if (elseIndex < 0 || !f.kw(elseIndex, "else")) {
    return false;
  }
  const nestedIfIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, os);
  if (nestedIfIndex < 0 || !f.kw(nestedIfIndex, "if")) {
    return false;
  }
  const nb = swIfBranchPairs(f, nestedIfIndex);
  const nnb = toI32(nb.length);
  if (nnb < 1) {
    return false;
  }
  const nestedEnd = nb[nnb - 1];
  if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nestedEnd) !== oe) {
    return false;
  }
  if (
    swHasComment(f, toI32(toU32(elseIndex) + 1), nestedIfIndex) ||
    swHasComment(f, toI32(toU32(nestedEnd) + 1), oe) ||
    swHasMultilineString(f, nestedIfIndex, toI32(toU32(nestedEnd) + 1)) ||
    swHasCommentDirective(f, nestedIfIndex, toI32(toU32(nestedEnd) + 1))
  ) {
    return false;
  }
  const outerIndent = f.currentIndentForLine(elseIndex);
  const nestedIndent = f.currentIndentForLine(nestedIfIndex);
  f.removeTokens(toI32(toU32(nestedEnd) + 1), toI32(toU32(oe) + 1));
  swReplaceNestedIfIndentation(f, nestedIndent, outerIndent, nestedIfIndex, nestedEnd);
  f.replaceTokens(toI32(toU32(elseIndex) + 1), nestedIfIndex, [new SwTok(SW_SPACE, " ", 0)]);
  return true;
};

/** parseConditionalStatement(at:).first?.range.lowerBound, or -1. */
const swFirstConditionStart = (f: SwFormatter, ifIndex: i32): i32 => {
  const brace = f.indexOfAfter(SW_START, "{", 0, ifIndex);
  if (brace < 0) {
    return -1;
  }
  const cs = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ifIndex);
  if (cs < 0 || cs >= brace) {
    return -1;
  }
  if ((f.kw(cs, "let") || f.kw(cs, "var")) && swParsePropertyDeclaration(f, cs) === null) {
    return -1;
  }
  return cs;
};

/** conditionsAreWrapped(after:before:). */
const swConditionsAreWrapped = (f: SwFormatter, keywordIndex: i32, endIndex: i32): boolean => {
  const last = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  return last >= 0 && f.indexInType(SW_T_LINEBREAK, toI32(toU32(keywordIndex) + 1), last) >= 0;
};

/** nestedIfCommentLines(in:): null for nil; each line as [lo, hi). */
const swNestedIfCommentLines = (f: SwFormatter, lo: i32, hi: i32): i32[] | null => {
  const out: i32[] = [];
  if (!swHasComment(f, lo, hi)) {
    return out;
  }
  if (swHasCommentDirective(f, lo, hi)) {
    return null;
  }
  let st = lo;
  for (let j = lo; j <= hi; j++) {
    if (j === hi || f.k(j) === SW_LINEBREAK) {
      let a = st;
      let b = j;
      while (a < b && f.k(a) === SW_SPACE) {
        a++;
      }
      while (b > a && f.k(toI32(toU32(b) - 1)) === SW_SPACE) {
        b = toI32(toU32(b) - 1);
      }
      for (let q = a; q < b; q++) {
        if (!f.isComment(q) && f.k(q) !== SW_SPACE) {
          return null;
        }
      }
      if (b > a) {
        out.push(a);
        out.push(b);
      }
      st = j + 1;
    }
  }
  return out;
};

/** mergeNestedIf(at:). */
const swMergeNestedIf = (f: SwFormatter, ifIndex: i32): boolean => {
  if (!f.kw(ifIndex, "if") || swIsInResultBuilder(f, ifIndex)) {
    return false;
  }
  const obs = swStartOfConditionalBranchBody(f, ifIndex);
  const obe = obs >= 0 ? swEndOfScope(f, obs) : -1;
  if (obe < 0) {
    return false;
  }
  const ae = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, obe);
  if (ae >= 0 && f.kw(ae, "else")) {
    return false;
  }
  const nested = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, obs);
  if (nested < 0 || nested >= obe || !f.kw(nested, "if")) {
    return false;
  }
  const nbs = swStartOfConditionalBranchBody(f, nested);
  const nbe = nbs >= 0 ? swEndOfScope(f, nbs) : -1;
  if (nbe < 0 || swHasMultilineString(f, nested, toI32(toU32(nbe) + 1))) {
    return false;
  }
  if (f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, obe) !== nbe) {
    return false;
  }
  const an = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nbe);
  if (an >= 0 && f.kw(an, "else")) {
    return false;
  }
  const oce = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, obs);
  const ocs = swFirstConditionStart(f, ifIndex);
  const ncs = swFirstConditionStart(f, nested);
  const nce = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nbs);
  if (oce < 0 || ocs < 0 || ncs < 0 || nce < 0) {
    return false;
  }
  const ccl = swNestedIfCommentLines(f, toI32(toU32(obs) + 1), nested);
  if (ccl === null || swHasComment(f, toI32(toU32(oce) + 1), toI32(toU32(obs) + 1))) {
    return false;
  }
  const lines: SwTok[][] = [];
  // ccl holds start, end pairs; an array length keeps q below 2147483645.
  const cl: i32[] = ccl;
  for (let q = 0; q < cl.length - 1 && q < 2147483645; q += 2) {
    lines.push(f.slice(cl[q], cl[q + 1]));
  }
  const wrapSeparator =
    lines.length === 0 && (swConditionsAreWrapped(f, ifIndex, obs) || swConditionsAreWrapped(f, nested, nbs));
  const conditionIndent = swSpaceEquivalentToTokens(f, f.startOfLine(ocs), ocs);
  const outerIndent = f.currentIndentForLine(ifIndex);
  const nestedIndent = f.currentIndentForLine(nested);
  let tci = -1;
  for (let j = toI32(toU32(nbe) + 1); j <= obe; j = toI32(toU32(j) + 1)) {
    if (f.isComment(j)) {
      tci = j;
      break;
    }
  }
  const h = tci >= 0 ? f.ref(tci, tci) : -1;
  if (tci >= 0) {
    const cbls = f.startOfLine(nbe);
    if (f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cbls, nbe) < 0 && !f.onSameLine(nbe, tci)) {
      f.removeTokens(cbls, toI32(toU32(f.endOfLine(nbe)) + 1));
    } else if (f.onSameLine(nbe, tci)) {
      f.removeTokens(nbe, tci);
    } else {
      f.removeToken(nbe);
    }
  } else {
    f.removeTokens(toI32(toU32(nbe) + 1), toI32(toU32(obe) + 1));
  }
  const line = f.linebreakLine(ifIndex);
  if (wrapSeparator && f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nested) >= 0) {
    const ncs2 = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nested);
    f.replaceTokens(toI32(toU32(oce) + 1), ncs2, [new SwTok(SW_DELIM, ",", 0), new SwTok(SW_LINEBREAK, "\n", line)]);
  } else if (lines.length === 0) {
    f.replaceTokens(toI32(toU32(oce) + 1), nested + 1, [new SwTok(SW_DELIM, ",", 0)]);
  } else {
    const ci = swSpaceEquivalentToTokens(f, f.startOfLine(ifIndex), ocs);
    const indented: SwTok[] = [new SwTok(SW_LINEBREAK, "\n", line)];
    if (ci.length !== 0) {
      indented.push(new SwTok(SW_SPACE, ci, 0));
    }
    const bodyBreak: SwTok[] = [new SwTok(SW_LINEBREAK, "\n", line)];
    if (outerIndent.length !== 0) {
      bodyBreak.push(new SwTok(SW_SPACE, outerIndent, 0));
    }
    f.replaceTokens(toI32(toU32(nce) + 1), nbs, bodyBreak);
    const sep: SwTok[] = [new SwTok(SW_DELIM, ",", 0)];
    for (const t of indented) {
      sep.push(t);
    }
    for (const l of lines) {
      for (const t of l) {
        sep.push(t);
      }
      for (const t of indented) {
        sep.push(t);
      }
    }
    f.replaceTokens(toI32(toU32(oce) + 1), ncs, sep);
  }
  const mbs = swStartOfConditionalBranchBody(f, ifIndex);
  const mbe = mbs >= 0 ? swEndOfScope(f, mbs) : -1;
  if (mbe >= 0) {
    // A token index: the u32 difference is exact.
    const indentationEnd = h >= 0 ? toI32(toU32(f.startOfLine(swRefLo(f, h))) - 2) : mbe;
    swReplaceNestedIfIndentation(f, nestedIndent, outerIndent, oce, indentationEnd);
  }
  if (h >= 0) {
    f.unref(h);
  }
  if (wrapSeparator) {
    f.insertSpace(conditionIndent, toI32(toU32(oce) + 3));
  }
  return true;
};

/** nestedIf. */
export const swRuleNestedIf = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "if")) {
      continue;
    }
    while (swMergeNestedIf(f, i) || swFlattenElseIf(f, i)) {
      // repeat
    }
  }
};
