// RuboCop::Cop::MultilineLiteralBraceLayout (EnforcedStyle: symmetrical) and
// the MultilineLiteralBraceCorrector, for the array, hash, method call and
// method definition brace layout cops.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_DOT, F_END, F_HEREDOC_END, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { rnE, rnHas, rnS } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { rbLayCommentAtLine } from "./layout_empty_help";
import {
  rmlDescendants,
  rmlFirstArg,
  rmlFirstLine,
  rmlIsArgument,
  rmlIsCall,
  rmlIsChained,
  rmlIsHeredoc,
  rmlLastLine,
  rmlSingleLine,
} from "./layout_multiline_help";
import { lspIsWs } from "./layout_space_help";

/** last_line_heredoc?(node, parent). */
const rmlMlbLastLineHeredoc = (src: RbSource, n: i32, last: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  if (rnHas(src, n, F_HEREDOC_END) && src.line(rnE(src, n, F_HEREDOC_END)) >= last) {
    return true;
  }
  for (let i = 0; i < a.nKid(n); i++) {
    if (rmlMlbLastLineHeredoc(src, a.kid(n, i), last)) {
      return true;
    }
  }
  return false;
};

/** The end of last_element_range_with_trailing_comma. */
const rmlMlbLastElementEnd = (src: RbSource, last: i32): i32 => {
  const e = src.a.exE(last);
  const p = rbSpaceEnd(src, e, 2, true, false, false);
  return src.at(p) === 44 ? p + 1 : e;
};

/** Whether the comment `ci` is the first thing on its line. */
const rmlMlbOwnLineComment = (src: RbSource, ci: i32): boolean => {
  const l = src.line(src.commS[ci]);
  let i = src.lineStart(l);
  const e = src.lineEnd(l);
  while (i < e && (lspIsWs(src.at(i)) || src.at(i) === 0)) {
    i++;
  }
  return src.at(i) === 35;
};

/** closing_bracket_on_own_line?(descendant, line). */
const rmlMlbClosingOwnLine = (src: RbSource, d: i32, line: i32): boolean => {
  if (!rnHas(src, d, F_END)) {
    return false;
  }
  const es = rnS(src, d, F_END);
  const ee = rnE(src, d, F_END);
  if (ee - es !== 1) {
    return false;
  }
  const c = src.at(es);
  if (c !== 125 && c !== 93 && c !== 41) {
    return false;
  }
  if (src.line(es) !== line) {
    return false;
  }
  for (let i = src.lineStart(line); i < es; i++) {
    if (!lspIsWs(src.at(i)) && src.at(i) !== 0) {
      return false;
    }
  }
  return true;
};

/**
 * check_brace_layout for `node` whose elements are `kids` (the cop's
 * children(node)) and whose raw last child is `rawLast`. `call` marks
 * MultilineMethodCallBraceLayout (single_line_ignoring_receiver?).
 */
export const rmlBraceLayout = (cop: RbCop, src: RbSource, node: i32, kids: i32[], rawLast: i32, call: boolean): void => {
  const a = src.a;
  if (call && rnHas(src, node, F_BEGIN) && rnHas(src, node, F_END)) {
    if (src.line(rnS(src, node, F_BEGIN)) === src.line(rnS(src, node, F_END))) {
      return;
    }
  }
  if (!rnHas(src, node, F_BEGIN) || toI32(kids.length) === 0 || rmlSingleLine(src, node)) {
    return;
  }
  if (a.isNode(rawLast) && rmlMlbLastLineHeredoc(src, rawLast, rmlLastLine(src, rawLast))) {
    return;
  }
  const es = rnS(src, node, F_END);
  const ee = rnE(src, node, F_END);
  const endLine = src.line(es);
  const ds: i32[] = [];
  rmlDescendants(src, node, ds);
  for (const d of ds) {
    if (rmlIsHeredoc(src, d) && rmlFirstLine(src, d) === endLine) {
      return;
    }
  }
  const first = kids[0];
  const last = kids[toI32(kids.length) - 1];
  const openSame = src.line(rnS(src, node, F_BEGIN)) === rmlFirstLine(src, first);
  const closeSame = endLine === rmlLastLine(src, last);
  if (openSame === closeSame) {
    return;
  }
  const k = cop.offense(es, ee);
  if (k === null) {
    return;
  }
  rmlBraceCorrect(src, k, node);
  cop.commit(k);
};

/** MultilineLiteralBraceCorrector#call (its children are the node's raw children). */
const rmlBraceCorrect = (src: RbSource, k: RbRewriter, node: i32): void => {
  const a = src.a;
  const last = a.kid(node, -1);
  const es = rnS(src, node, F_END);
  const ee = rnE(src, node, F_END);
  if (src.line(es) === rmlLastLine(src, last)) {
    k.insertBefore(es, ee, "\n");
    return;
  }
  // new_line_needed_before_closing_brace?
  const lee = rmlMlbLastElementEnd(src, last);
  if (rbLayCommentAtLine(src, src.line(lee)) >= 0 && (rmlIsChained(src, node) || rmlIsArgument(src, node))) {
    return;
  }
  // nested_closing_bracket_moved_before_comment?
  const ci = rbLayCommentAtLine(src, rmlLastLine(src, last) - 1);
  if (ci >= 0) {
    const cands: i32[] = [last];
    rmlDescendants(src, last, cands);
    let nested = V_NIL;
    const ll = rmlLastLine(src, last);
    for (const d of cands) {
      const same = a.type(d) === a.type(node) || (rmlIsCall(src, d) && rmlIsCall(src, node));
      if (same && rmlMlbClosingOwnLine(src, d, ll)) {
        nested = d;
        break;
      }
    }
    if (nested !== V_NIL && (rmlMlbOwnLineComment(src, ci) || !(rmlIsChained(src, nested) || rmlIsArgument(src, nested)))) {
      return;
    }
  }
  // correct_next_line_brace
  k.remove(rbSpaceBegin(src, es, 1, true, false, false), ee);
  let content = src.src(es, ee);
  if (rbLayCommentAtLine(src, rmlLastLine(src, last)) >= 0) {
    const re = src.lineEnd(rmlLastLine(src, node));
    content = src.src(es, re);
    k.remove(es, re);
  }
  k.insertBefore(lee, lee, content);
  // correct_heredoc_argument_method_chain
  const p = src.parent(node);
  if (p === V_NIL || !rmlIsCall(src, node) || !rmlIsCall(src, p)) {
    return;
  }
  const fa = rmlFirstArg(src, node);
  if (fa === V_NIL || !rmlIsHeredoc(src, fa) || a.type(fa) !== NT_STR || !rnHas(src, p, F_DOT)) {
    return;
  }
  const cs = rnS(src, p, F_DOT);
  const ce = a.exE(p);
  const chained = src.src(cs, ce);
  k.remove(cs, ce);
  k.insertAfter(lee, lee, chained);
};
