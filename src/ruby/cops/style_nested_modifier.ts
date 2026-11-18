// Style/NestedModifier.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_KEYWORD,
  NT_AND,
  NT_CSEND,
  NT_IF,
  NT_OR,
  NT_SEND,
  NT_SUPER,
  NT_SYM,
  NT_UNTIL,
  NT_WHILE,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { scnBasicConditional, scnKeyword, scnModifier, scnOperatorKeyword, scnTernary } from "./style_cond_help";
import { srcComparison } from "./style_redundant_conditional";
import { stpPrefixNot, stpSemanticOperator } from "./style_ternary_parentheses";
import { ssxAssignment, ssxFE, ssxFS, ssxIs, ssxMeth, ssxOperatorName, ssxParenthesized } from "./style_syntax_help";

/** low_precedence? */
const snmLowPrecedence = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if ((t === NT_AND || t === NT_OR) && stpSemanticOperator(src, n)) {
    return true;
  }
  if (stpPrefixNot(src, n) || (t === NT_IF && scnTernary(src, n)) || ssxAssignment(src, n)) {
    return true;
  }
  if (t === NT_CSEND || t === NT_YIELD || t === NT_SUPER) {
    const nargs = t === NT_CSEND ? a.nKid(n) - 2 : a.nKid(n);
    const m = t === NT_CSEND ? ssxMeth(src, n) : "";
    return nargs > 0 && !ssxParenthesized(src, n) && !ssxOperatorName(m);
  }
  return false;
};

/** operand_source. */
const snmOperand = (src: RbSource, c: i32): string => {
  const a = src.a;
  if (ssxIs(src, c, NT_SEND) && a.nKid(c) > 2 && !ssxOperatorName(ssxMeth(src, c))) {
    const parts: string[] = [];
    const r = a.kid(c, 0);
    if (r !== V_NIL) {
      parts.push(`${src.nodeSrc(r)}.`);
    }
    parts.push(ssxMeth(src, c));
    const args: string[] = [];
    for (let i = 2; i < a.nKid(c); i++) {
      args.push(src.nodeSrc(a.kid(c, i)));
    }
    parts.push(`(${args.join(", ")})`);
    return parts.join("");
  }
  return src.nodeSrc(c);
};

/** requires_parens? */
const snmRequiresParens = (src: RbSource, n: i32, negated: boolean): boolean => {
  if ((negated && scnOperatorKeyword(src, n)) || ssxIs(src, n, NT_OR) || snmLowPrecedence(src, n)) {
    return true;
  }
  // (COMPARISON_OPERATORS & node.children): a comparison method name among the children.
  if (ssxIs(src, n, NT_SYM)) {
    return srcComparison(src.a.text(src.a.kid(n, 0)));
  }
  return ssxIs(src, n, NT_SEND) && srcComparison(ssxMeth(src, n));
};

export class CopStyleNestedModifier {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/NestedModifier");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_IF && t !== NT_WHILE && t !== NT_UNTIL) {
        continue;
      }
      if (this.ign.partOf(src, n)) {
        continue;
      }
      const p = src.parent(n);
      if (!scnModifier(src, n) || p === V_NIL || !scnBasicConditional(src, p) || !scnModifier(src, p)) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k !== null) {
        if (t === NT_IF && a.type(p) === NT_IF) {
          k.replace(ssxFS(src, n, F_KEYWORD), a.exE(a.kid(p, 0)), this.newExpression(src, n, p));
        }
        this.c.commit(k);
      }
      this.ign.add(n);
    }
  }

  private newExpression(src: RbSource, inner: i32, outer: i32): string {
    const ok = scnKeyword(src, outer);
    const op = ok === "if" ? "&&" : "||";
    const oc = src.a.kid(outer, 0);
    let lh = snmOperand(src, oc);
    if ((ssxIs(src, oc, NT_OR) && op === "&&") || snmLowPrecedence(src, oc)) {
      lh = `(${lh})`;
    }
    const ic = src.a.kid(inner, 0);
    const negated = ok !== scnKeyword(src, inner);
    let rh = snmOperand(src, ic);
    if (snmRequiresParens(src, ic, negated)) {
      rh = `(${rh})`;
    }
    if (negated) {
      rh = `!${rh}`;
    }
    return `${ok} ${lh} ${op} ${rh}`;
  }
}
