// SwiftFormat's nestedIf rule (mergeNestedIf / flattenElseIf; if expressions need
// Swift 5.9, so with an undefined version no `if` is an expression).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

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

const swHasMultilineString =(f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (swIsMultilineStringDelimiter(f.k(j), f.s(j))) {
      return true;
    }
  }
  return false;
};

/** replaceNestedIfIndentation(_:with:after:through:). */
const swReplaceNestedIfIndentation = (f: SwFormatter, oldIndent: string, newIndent: string, lowerBound: i32, upperBound0: i32): void => {
  if (oldIndent === newIndent) {
    return;
  }
  let upperBound = upperBound0;
  while (lowerBound < upperBound) {
    let lb = -1;
    for (let j = upperBound; j >= lowerBound; j--) {
      if (f.k(j) === SW_LINEBREAK) {
        lb = j;
        break;
      }
    }
    if (lb < 0 || lb <= lowerBound) {
      return;
    }
    if (f.has(lb + 1) && f.k(lb + 1) === SW_SPACE) {
      const indent = f.s(lb + 1);
      if (indent.startsWith(oldIndent)) {
        f.insertSpace(newIndent + indent.substring(oldIndent.length), lb + 1);
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
    for (let q = 0; q < toI32(br.length); q += 2) {
      if (f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, br[q], SW_KEYWORD, "return")) {
        hasReturn = true;
      }
    }
    if (!hasReturn) {
      return false;
    }
  }
  const os = br[toI32(br.length) - 2];
  const oe = br[toI32(br.length) - 1];
  const elseIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, os);
  if (elseIndex < 0 || !f.kw(elseIndex, "else")) {
    return false;
  }
  const nestedIfIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, os);
  if (nestedIfIndex < 0 || !f.kw(nestedIfIndex, "if")) {
    return false;
  }
  const nb = swIfBranchPairs(f, nestedIfIndex);
  if (nb.length === 0) {
    return false;
  }
  const nestedEnd = nb[toI32(nb.length) - 1];
  if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nestedEnd) !== oe) {
    return false;
  }
  if (swHasComment(f, elseIndex + 1, nestedIfIndex) || swHasComment(f, nestedEnd + 1, oe) || swHasMultilineString(f, nestedIfIndex, nestedEnd + 1) || swHasCommentDirective(f, nestedIfIndex, nestedEnd + 1)) {
    return false;
  }
  const outerIndent = f.currentIndentForLine(elseIndex);
  const nestedIndent = f.currentIndentForLine(nestedIfIndex);
  f.removeTokens(nestedEnd + 1, oe + 1);
  swReplaceNestedIfIndentation(f, nestedIndent, outerIndent, nestedIfIndex, nestedEnd);
  f.replaceTokens(elseIndex + 1, nestedIfIndex, [new SwTok(SW_SPACE, " ", 0)]);
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
  return last >= 0 && f.indexInType(SW_T_LINEBREAK, keywordIndex + 1, last) >= 0;
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
      while (b > a && f.k(b - 1) === SW_SPACE) {
        b--;
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
  if (nbe < 0 || swHasMultilineString(f, nested, nbe + 1)) {
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
  const ccl = swNestedIfCommentLines(f, obs + 1, nested);
  if (ccl === null || swHasComment(f, oce + 1, obs + 1)) {
    return false;
  }
  const lines: SwTok[][] = [];
  for (let q = 0; q < toI32(ccl.length); q += 2) {
    lines.push(f.slice(ccl[q], ccl[q + 1]));
  }
  const wrapSeparator = lines.length === 0 && (swConditionsAreWrapped(f, ifIndex, obs) || swConditionsAreWrapped(f, nested, nbs));
  const conditionIndent = swSpaceEquivalentToTokens(f, f.startOfLine(ocs), ocs);
  const outerIndent = f.currentIndentForLine(ifIndex);
  const nestedIndent = f.currentIndentForLine(nested);
  let tci = -1;
  for (let j = nbe + 1; j <= obe; j++) {
    if (f.isComment(j)) {
      tci = j;
      break;
    }
  }
  const h = tci >= 0 ? f.ref(tci, tci) : -1;
  if (tci >= 0) {
    const cbls = f.startOfLine(nbe);
    if (f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cbls, nbe) < 0 && !f.onSameLine(nbe, tci)) {
      f.removeTokens(cbls, f.endOfLine(nbe) + 1);
    } else if (f.onSameLine(nbe, tci)) {
      f.removeTokens(nbe, tci);
    } else {
      f.removeToken(nbe);
    }
  } else {
    f.removeTokens(nbe + 1, obe + 1);
  }
  const line = f.linebreakLine(ifIndex);
  if (wrapSeparator && f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nested) >= 0) {
    const ncs2 = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nested);
    f.replaceTokens(oce + 1, ncs2, [new SwTok(SW_DELIM, ",", 0), new SwTok(SW_LINEBREAK, "\n", line)]);
  } else if (lines.length === 0) {
    f.replaceTokens(oce + 1, nested + 1, [new SwTok(SW_DELIM, ",", 0)]);
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
    f.replaceTokens(nce + 1, nbs, bodyBreak);
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
    f.replaceTokens(oce + 1, ncs, sep);
  }
  const mbs = swStartOfConditionalBranchBody(f, ifIndex);
  const mbe = mbs >= 0 ? swEndOfScope(f, mbs) : -1;
  if (mbe >= 0) {
    const indentationEnd = h >= 0 ? f.startOfLine(f.refLo[h]) - 2 : mbe;
    swReplaceNestedIfIndentation(f, nestedIndent, outerIndent, oce, indentationEnd);
  }
  if (h >= 0) {
    f.unref(h);
  }
  if (wrapSeparator) {
    f.insertSpace(conditionIndent, oce + 3);
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
