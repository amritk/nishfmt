// SwiftFormat's SwiftUI rules: redundantEmptyView.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swParseExpressionEnd } from "./expr";
import { SwFormatter } from "./formatter";
import { swEndOfScope } from "./parsing";
import { swIsInResultBuilder } from "./rules_simple";
import { SW_END, SW_IDENT, SW_KEYWORD, SW_LINEBREAK, SW_OP_INFIX, SW_SPACE, SW_START, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK } from "./token";

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
