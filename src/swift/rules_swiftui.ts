// SwiftFormat's SwiftUI rules: redundantEmptyView.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwDecl, swDeclKeywordIndex, swParseConformances, swParseDeclarations, swReleaseDecls, swStringExcludingLinebreaksAndComments } from "./decl";
import { swParseExpressionEnd, swParsePropertyDeclaration } from "./expr";
import { SwFormatter } from "./formatter";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swStartOfModifiers } from "./modifiers";
import { swEndOfScope } from "./parsing";
import { swCollectRecursive, swParentType } from "./rules_acl";
import { swIsSingleExpression, swStartOfBody } from "./rules_return";
import { swIsInResultBuilder } from "./rules_simple";
import { SW_DELIM, SW_END, SW_IDENT, SW_KEYWORD, SW_LINEBREAK, SW_OP_INFIX, SW_SPACE, SW_START, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, SwTok } from "./token";

export const swAllSpaceOrLinebreak = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.k(j) !== SW_SPACE && f.k(j) !== SW_LINEBREAK) {
      return false;
    }
  }
  return true;
};

/** expressionIsEmptyView(in:). */
const swExpressionIsEmptyView = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let ev = lo;
  if (f.tok(ev, SW_IDENT, "SwiftUI")) {
    const d = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ev);
    if (d < 0 || !f.op(d, ".", SW_OP_INFIX)) {
      return false;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, d);
    if (n < 0 || !f.tok(n, SW_IDENT, "EmptyView")) {
      return false;
    }
    ev = n;
  }
  if (!f.tok(ev, SW_IDENT, "EmptyView")) {
    return false;
  }
  const sa = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ev);
  if (sa < 0 || !f.tok(sa, SW_START, "(")) {
    return false;
  }
  const ea = swEndOfScope(f, sa);
  return ea === hi && swAllSpaceOrLinebreak(f, ev + 1, sa) && swAllSpaceOrLinebreak(f, sa + 1, ea);
};

/** redundantEmptyViewElseRange(at:) as its upper bound (the range starts after the previous `}`), or -1. */
const swRedundantEmptyViewElseEnd = (f: SwFormatter, elseIndex: i32): i32 => {
  if (!swIsInResultBuilder(f, elseIndex) || f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, elseIndex, SW_KEYWORD, "if")) {
    return -1;
  }
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, elseIndex);
  if (p < 0 || !f.tok(p, SW_END, "}") || !swAllSpaceOrLinebreak(f, p + 1, elseIndex)) {
    return -1;
  }
  const sb = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, elseIndex);
  if (sb < 0 || !f.tok(sb, SW_START, "{") || !swAllSpaceOrLinebreak(f, elseIndex + 1, sb)) {
    return -1;
  }
  const eb = swEndOfScope(f, sb);
  const first = eb >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sb) : -1;
  const ee = first >= 0 ? swParseExpressionEnd(f, first) : -1;
  if (ee < 0 || f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ee) !== eb) {
    return -1;
  }
  if (!swAllSpaceOrLinebreak(f, sb + 1, first) || !swAllSpaceOrLinebreak(f, ee + 1, eb) || !swExpressionIsEmptyView(f, first, ee)) {
    return -1;
  }
  return eb;
};

/** redundantEmptyView. */
export const swRuleRedundantEmptyView = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "else")) {
      continue;
    }
    const e = swRedundantEmptyViewElseEnd(f, i);
    if (e >= 0) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      f.removeTokens(p + 1, e + 1);
    }
  }
};

/** Whether the type conforms to `name` (isViewType / isViewModifierType). */
const swTypeConformsTo = (f: SwFormatter, t: SwDecl | null, name: string): boolean => {
  if (t === null) {
    return false;
  }
  const c = swParseConformances(f, swDeclKeywordIndex(f, t));
  for (let q = 0; q < toI32(c.starts.length); q++) {
    if (swStringExcludingLinebreaksAndComments(f, c.starts[q], c.ends[q] + 1) === name) {
      return true;
    }
  }
  return false;
};

/** scopeBodyIsSingleExpression(at:) with nothing else allowed. */
const swScopeBodyIsPlainExpression = (f: SwFormatter, sos: i32): boolean => {
  const e = swEndOfScope(f, sos);
  return e >= 0 && swIsSingleExpression(f, swStartOfBody(f, sos) + 1, e, false);
};

/** parseGroupCall(startingAt:) as [groupEnd, closureStart], or []. */
const swParseGroupCall = (f: SwFormatter, groupIndex: i32): i32[] => {
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, groupIndex);
  if (n < 0) {
    return [];
  }
  if (f.tok(n, SW_START, "{")) {
    const e = swEndOfScope(f, n);
    return e >= 0 ? [e, n] : [];
  }
  if (f.tok(n, SW_START, "(")) {
    const ep = swEndOfScope(f, n);
    if (ep < 0) {
      return [];
    }
    const ap = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ep);
    if (ap >= 0 && f.tok(ap, SW_START, "{")) {
      const ec = swEndOfScope(f, ap);
      if (ec >= 0 && f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n) === ep) {
        return [ec, ap];
      }
    }
    const cl = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
    if (cl >= 0 && f.tok(cl, SW_IDENT, "content")) {
      const colon = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cl);
      if (colon >= 0 && f.tok(colon, SW_DELIM, ":")) {
        const cs = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon);
        if (cs >= 0 && f.tok(cs, SW_START, "{")) {
          return [ep, cs];
        }
      }
    }
  }
  return [];
};

/** redundantSwiftUIGroup. */
export const swRuleRedundantSwiftUIGroup = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  for (const d of all) {
    const kw = swDeclKeywordIndex(f, d);
    let bodyLo = -1;
    let bodyHi = -1;
    let isBodyMember = false;
    const pt = swParentType(d);
    const isView = swTypeConformsTo(f, pt, "View");
    const isViewModifier = swTypeConformsTo(f, pt, "ViewModifier");
    if (d.keyword === "var" || d.keyword === "let") {
      const p = swParsePropertyDeclaration(f, kw);
      if (p === null) {
        continue;
      }
      bodyLo = p.bodyStart;
      bodyHi = p.bodyEnd;
      isBodyMember = p.identifier === "body" && isView;
    } else if (d.keyword === "func") {
      const fd = swParseFunctionDeclaration(f, kw);
      if (fd === null) {
        continue;
      }
      bodyLo = fd.bodyStart;
      bodyHi = fd.bodyEnd;
      isBodyMember = fd.hasName && fd.name === "body" && isViewModifier;
    } else {
      continue;
    }
    if (bodyLo < 0 || !(isView || isViewModifier)) {
      continue;
    }
    // topLevelRedundantGroup(in:)
    const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, bodyLo);
    if (first < 0 || first >= bodyHi || !f.tok(first, SW_IDENT, "Group")) {
      continue;
    }
    const gc = swParseGroupCall(f, first);
    if (gc.length === 0) {
      continue;
    }
    const groupEnd = gc[0];
    const closureStart = gc[1];
    const ce = swEndOfScope(f, closureStart);
    if (ce < 0 || closureStart + 1 >= ce) {
      continue;
    }
    const ft = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, closureStart);
    const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ce);
    if (ft < 0 || lt < 0 || ft > lt) {
      continue;
    }
    if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, groupEnd) !== bodyHi) {
      if (!swScopeBodyIsPlainExpression(f, bodyLo) || !swScopeBodyIsPlainExpression(f, closureStart)) {
        continue;
      }
    }
    let hasViewBuilder = false;
    const som = swStartOfModifiers(f, kw, true);
    for (let j = som; j < kw; j++) {
      if (f.s(j) === "@ViewBuilder" || f.s(j) === "@ContentBuilder") {
        hasViewBuilder = true;
      }
    }
    const needsViewBuilder = !isBodyMember && !swScopeBodyIsPlainExpression(f, closureStart);
    const addAt = needsViewBuilder && !hasViewBuilder ? som : -1;
    const bodyTokens = f.slice(ft, lt + 1);
    f.removeTokens(first, groupEnd + 1);
    f.insertToks(bodyTokens, first);
    if (addAt >= 0) {
      const indent = f.currentIndentForLine(addAt);
      const toks: SwTok[] = [new SwTok(SW_KEYWORD, "@ViewBuilder", 0), new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(addAt))];
      if (indent.length !== 0) {
        toks.push(new SwTok(SW_SPACE, indent, 0));
      }
      f.insertToks(toks, addAt);
    }
  }
  swReleaseDecls(f, decls);
};
