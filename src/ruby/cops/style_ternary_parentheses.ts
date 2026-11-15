// Style/TernaryParentheses (EnforcedStyle: require_no_parentheses,
// AllowSafeAssignment: true).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_DOT, F_END, F_KEYWORD, F_OPERATOR, F_SELECTOR, NT_AND, NT_BEGIN, NT_CASGN, NT_CSEND, NT_CVASGN, NT_DEFINED_P, NT_GVASGN, NT_IF, NT_IVASGN, NT_LVASGN, NT_MASGN, NT_MATCH_PATTERN_P, NT_OR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { scnModifier, scnTernary } from "./style_cond_help";
import { scnVerifiedByReparse } from "./style_cond_reparse";
import { ssxFE, ssxFS, ssxHas, ssxIs, ssxIsCall, ssxIsSpace, ssxLocIs, ssxMeth, ssxParenthesized, ssxSetter } from "./style_syntax_help";

/** SafeAssignment#safe_assignment?: `(begin {equals_asgn? #setter_method?})`. */
export const stpSafeAssignment = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_BEGIN) || src.a.nKid(n) !== 1) {
    return false;
  }
  const c = src.a.kid(n, 0);
  if (!src.a.isNode(c)) {
    return false;
  }
  const t = src.a.type(c);
  if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN || t === NT_MASGN) {
    return true;
  }
  return ssxIsCall(src, c) && ssxSetter(src, c);
};

/** PredicateOperatorNode#semantic_operator?: the operator is `and`/`or`. */
export const stpSemanticOperator = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_OPERATOR, "and") || ssxLocIs(src, n, F_OPERATOR, "or");

/** MethodIdentifierPredicates#prefix_not?: `not x`. */
export const stpPrefixNot = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "!" && ssxLocIs(src, n, F_SELECTOR, "not");

export class CopStyleTernaryParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TernaryParentheses");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF) {
        continue;
      }
      const cond = a.kid(n, 0);
      if (this.onlyClosingParenLast(src, cond)) {
        continue;
      }
      if (ssxLocIs(src, cond, F_BEGIN, "(") && ssxIs(src, a.kid(cond, 0), NT_MATCH_PATTERN_P)) {
        continue;
      }
      if (!scnTernary(src, n) || !ssxIs(src, cond, NT_BEGIN)) {
        continue;
      }
      // parenthesized_modifier_condition?
      const inner = a.kid(cond, 0);
      if (ssxIs(src, inner, NT_IF) && scnModifier(src, inner)) {
        continue;
      }
      if (stpSafeAssignment(src, cond)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (this.unsafe(src, cond)) {
        continue;
      }
      const probe = new RbRewriter(src.n);
      if (!this.correct(src, cond, probe) || !scnVerifiedByReparse(src, probe, a.exS(cond), a.exE(cond), true)) {
        continue;
      }
      this.correct(src, cond, k);
      this.c.commit(k);
    }
  }

  /** only_closing_parenthesis_is_last_line?: source.split("\n").last == ")". */
  private onlyClosingParenLast(src: RbSource, cond: i32): boolean {
    const s = src.nodeSrc(cond);
    let e = toI32(s.length);
    while (e > 0 && s.charCodeAt(e - 1) === 10) {
      e--;
    }
    let nl = e;
    while (nl > 0 && s.charCodeAt(nl - 1) !== 10) {
      nl--;
    }
    return s.substring(nl, e) === ")";
  }

  /** unsafe_autocorrect? */
  private unsafe(src: RbSource, cond: i32): boolean {
    for (let i = 0; i < src.a.nKid(cond); i++) {
      const c = src.a.kid(cond, i);
      if ((ssxIs(src, c, NT_OR) || ssxIs(src, c, NT_AND)) && stpSemanticOperator(src, c)) {
        return true;
      }
      if (stpPrefixNot(src, c)) {
        return true;
      }
    }
    return false;
  }

  /** correct_parenthesized. */
  private correct(src: RbSource, cond: i32, k: RbRewriter): boolean {
    const a = src.a;
    let ok = k.remove(ssxFS(src, cond, F_BEGIN), ssxFE(src, cond, F_BEGIN));
    const ee = ssxFE(src, cond, F_END);
    ok = k.remove(ssxFS(src, cond, F_END), ee) && ok;
    if (!ssxIsSpace(src.at(ee))) {
      ok = k.insertAfter(ssxFS(src, cond, F_END), ee, " ") && ok;
    }
    let last = V_NIL;
    for (let i = 0; i < a.nKid(cond); i++) {
      if (a.isNode(a.kid(cond, i))) {
        last = a.kid(cond, i);
      }
    }
    if (last !== V_NIL && this.argsNeedParens(src, last)) {
      const isDef = a.type(last) === NT_DEFINED_P;
      const rs = isDef ? ssxFE(src, last, F_KEYWORD) : ssxFE(src, last, F_SELECTOR);
      const first = isDef ? a.kid(last, 0) : a.kid(last, 2);
      const lastArg = a.kid(last, -1);
      ok = k.replace(rs, a.exS(first), "(") && ok;
      ok = k.insertAfter(a.exS(lastArg), a.exE(lastArg), ")") && ok;
    }
    return ok;
  }

  /** node_args_need_parens? */
  private argsNeedParens(src: RbSource, s: i32): boolean {
    const a = src.a;
    const t = a.type(s);
    if (t === NT_DEFINED_P) {
      if (a.nKid(s) === 0 || ssxParenthesized(src, s)) {
        return false;
      }
      // dot?/safe_navigation? are false; method_name is :defined? (lowercase): unparenthesized.
      return true;
    }
    if (t !== NT_SEND && t !== NT_CSEND) {
      return false;
    }
    if (a.nKid(s) <= 2 || ssxParenthesized(src, s)) {
      return false;
    }
    if (ssxLocIs(src, s, F_DOT, ".") || ssxLocIs(src, s, F_DOT, "&.")) {
      return true;
    }
    const m = ssxMeth(src, s);
    const c0 = m.length > 0 ? m.charCodeAt(0) : 0;
    const letter = (c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122);
    return letter;
  }
}
