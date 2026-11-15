// Style/RedundantCondition (AllowedMethods: infinite?, nonzero?), with
// CommentsHelp#contains_comments?.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_COLON,
  F_ELSE,
  F_END,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_BREAK,
  NT_CASGN,
  NT_CVASGN,
  NT_ERANGE,
  NT_FORWARDED_ARGS,
  NT_FORWARDED_KWRESTARG,
  NT_FORWARDED_RESTARG,
  NT_GVASGN,
  NT_HASH,
  NT_IF,
  NT_IRANGE,
  NT_IVASGN,
  NT_KWSPLAT,
  NT_LVASGN,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_SPLAT,
  NT_SUPER,
  NT_TRUE,
  NT_YIELD,
  rbTypeName,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { lalBinaryOperation } from "./layout_align_help";
import { scnBasicConditional, scnCommentsInLines, scnElse, scnElseBranch, scnElsif, scnElsifConditional, scnIfBranch, scnIfKw, scnModifier, scnTernary } from "./style_cond_help";
import { smtAssignmentMethod } from "./style_multiline_ternary_operator";
import { scnAstEqual } from "./style_cond_reparse";
import { stpPrefixNot, stpSemanticOperator } from "./style_ternary_parentheses";
import { ssxBeginIs, ssxDescendants, ssxDot, ssxFE, ssxFS, ssxHas, ssxIs, ssxIsCall, ssxMeth, ssxOperatorName, ssxParenthesized } from "./style_syntax_help";

/** Whether a node type has its own RuboCop::AST::Node subclass (Builder::NODE_MAP). */
const srdTyped = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  const typed: i32[] = [
    NT_AND,
    NT_OR,
    NT_IF,
    NT_SEND,
    NT_BLOCK,
    NT_NUMBLOCK,
    NT_BREAK,
    NT_NEXT,
    NT_RETURN,
    NT_LVASGN,
    NT_IVASGN,
    NT_CVASGN,
    NT_GVASGN,
    NT_CASGN,
    NT_HASH,
    NT_IRANGE,
    NT_ERANGE,
    NT_KWSPLAT,
    NT_RESCUE,
    NT_SUPER,
    NT_YIELD,
  ];
  for (const x of typed) {
    if (x === t) {
      return true;
    }
  }
  return srdTypedMore(t);
};

/** The rest of Builder::NODE_MAP's keys, by name. */
const srdTypedMore = (t: i32): boolean => srdTypedNames.indexOf(` ${rbTypeName(t)} `) >= 0;

const srdTypedNames: string =
  " alias and_asgn arg args array blockarg case case_match class complex const csend cvar def defined? defs dstr ensure float for forward_arg forward_args forwarded_kwrestarg gvar in_pattern int index indexasgn itblock ivar kwarg kwargs kwbegin kwoptarg kwrestarg lambda lvar masgn mlhs module op_asgn optarg or_asgn pair procarg0 rational regexp resbody restarg sclass shadowarg str sym until until_post when while while_post xstr zsuper ";

/** CommentsHelp#find_end_line. */
export const srdFindEndLine = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (a.type(n) === NT_IF && !scnModifier(src, n)) {
    if (scnElse(src, n)) {
      return src.line(ssxFS(src, n, F_ELSE));
    }
    if (scnTernary(src, n)) {
      return src.line(a.exS(scnElseBranch(src, n)));
    }
    if (scnElsif(src, n)) {
      let p = src.parent(n);
      while (p !== V_NIL) {
        if (a.type(p) === NT_IF && scnIfKw(src, p)) {
          return src.line(ssxFS(src, p, F_END));
        }
        p = src.parent(p);
      }
    } else if (scnIfKw(src, n)) {
      const p = src.parent(n);
      if (p !== V_NIL && ssxHas(src, p, F_END) && src.src(ssxFS(src, p, F_END), ssxFE(src, p, F_END)) === ")") {
        return src.line(ssxFS(src, p, F_END));
      }
    }
    return src.line(ssxFS(src, n, F_END));
  }
  if (ssxIs(src, n, NT_BLOCK) || ssxIs(src, n, NT_NUMBLOCK)) {
    return src.line(ssxFS(src, n, F_END));
  }
  const p = src.parent(n);
  if (p !== V_NIL) {
    let idx = -1;
    for (let i = 0; i < a.nKid(p); i++) {
      if (a.kid(p, i) === n) {
        idx = i;
      }
    }
    const sib = a.kid(p, idx + 1);
    if (idx >= 0 && sib !== V_NIL && a.isNode(sib) && a.exS(sib) >= 0) {
      return src.line(a.exS(sib));
    }
    if (ssxHas(src, p, F_END)) {
      return src.line(ssxFS(src, p, F_END));
    }
    return src.line(a.exS(p));
  }
  return ssxHas(src, n, F_END) ? src.line(ssxFS(src, n, F_END)) : src.line(a.exS(n));
};

/** CommentsHelp#contains_comments? */
export const srdContainsComments = (src: RbSource, n: i32): boolean => {
  if (src.a.exS(n) < 0) {
    return false;
  }
  return scnCommentsInLines(src, src.line(src.a.exS(n)), srdFindEndLine(src, n)).length > 0;
};

export class CopStyleRedundantCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantCondition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !this.redundantOffense(src, n)) {
        continue;
      }
      let anc = false;
      let p = src.parent(n);
      while (p !== V_NIL) {
        if (a.type(p) === NT_IF && this.redundantOffense(src, p)) {
          anc = true;
        }
        p = src.parent(p);
      }
      if (anc) {
        continue;
      }
      const tern = scnTernary(src, n) && !this.branchesHaveMethod(src, n);
      const s = tern ? ssxFS(src, n, F_QUESTION) : a.exS(n);
      const e = tern ? ssxFE(src, n, F_COLON) : a.exE(n);
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      if (this.autocorrect(src, n, k)) {
        this.c.commit(k);
      }
    }
  }

  private redundantOffense(src: RbSource, n: i32): boolean {
    return !scnModifier(src, n) && !scnElsifConditional(src, n) && this.offense(src, n);
  }

  private autocorrect(src: RbSource, n: i32, k: RbRewriter): boolean {
    const a = src.a;
    for (const d of ssxDescendants(src, n)) {
      if (srdContainsComments(src, d)) {
        return false;
      }
    }
    if (scnTernary(src, n) && !this.branchesHaveMethod(src, n)) {
      k.replace(ssxFS(src, n, F_QUESTION), ssxFE(src, n, F_COLON), "||");
      const eb = scnElseBranch(src, n);
      if (ssxIs(src, eb, NT_IRANGE) || ssxIs(src, eb, NT_ERANGE)) {
        k.wrap(a.exS(eb), a.exE(eb), "(", ")");
      }
    } else if (scnModifier(src, n) || scnElseBranch(src, n) === V_NIL) {
      k.replace(a.exS(n), a.exE(n), src.nodeSrc(scnIfBranch(src, n)));
    } else {
      k.replace(a.exS(n), a.exE(n), this.makeTernary(src, n));
    }
    return true;
  }

  /** offense? */
  private offense(src: RbSource, n: i32): boolean {
    const a = src.a;
    const eb = a.kid(n, 2);
    if (ssxIs(src, eb, NT_IF) || (ssxIs(src, eb, NT_SEND) && ssxMeth(src, eb) === "[]=")) {
      return false;
    }
    if (!this.synonymous(src, n) || scnElsif(src, n)) {
      return false;
    }
    if (scnTernary(src, n) || eb === V_NIL || srdTyped(src, eb)) {
      return true;
    }
    return src.line(a.exS(eb)) === src.line(a.exE(eb));
  }

  /** synonymous_condition_and_branch? */
  private synonymous(src: RbSource, n: i32): boolean {
    const a = src.a;
    const cond = a.kid(n, 0);
    const ib = a.kid(n, 1);
    if (scnAstEqual(a, cond, a, ib, false)) {
      return true;
    }
    if (this.trueTypeAndElseNot(src, n)) {
      return true;
    }
    if (this.branchesHaveAssignment(src, n) && scnAstEqual(a, cond, a, a.kid(ib, -1), false)) {
      return true;
    }
    if (this.branchesHaveMethod(src, n)) {
      const fb = scnIfBranch(src, n);
      return ssxIsCall(src, ib) && scnAstEqual(a, cond, a, a.kid(ib, 2), false) && !(ssxIs(src, ib, NT_SEND) && ssxMeth(src, ib) === "[]") && fb !== V_NIL;
    }
    return false;
  }

  /** if_branch_is_true_type_and_else_is_not? */
  private trueTypeAndElseNot(src: RbSource, n: i32): boolean {
    if (!scnTernary(src, n) && !scnIfKw(src, n)) {
      return false;
    }
    const cond = src.a.kid(n, 0);
    if (!ssxIsCall(src, cond)) {
      return false;
    }
    const m = ssxMeth(src, cond);
    if (!m.endsWith("?") || m === "infinite?" || m === "nonzero?") {
      return false;
    }
    const ib = scnIfBranch(src, n);
    const eb = scnElseBranch(src, n);
    return ssxIs(src, ib, NT_TRUE) && eb !== V_NIL && !ssxIs(src, eb, NT_TRUE);
  }

  private asgnType(src: RbSource, n: i32): boolean {
    if (!src.a.isNode(n)) {
      return false;
    }
    const t = src.a.type(n);
    return t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN;
  }

  private asgnName(src: RbSource, n: i32): string {
    return src.a.type(n) === NT_CASGN ? src.a.text(src.a.kid(n, 1)) : src.a.text(src.a.kid(n, 0));
  }

  /** branches_have_assignment? (raw children). */
  private branchesHaveAssignment(src: RbSource, n: i32): boolean {
    const ib = src.a.kid(n, 1);
    const eb = src.a.kid(n, 2);
    if (ib === V_NIL || eb === V_NIL) {
      return false;
    }
    return this.asgnType(src, ib) && this.asgnType(src, eb) && this.asgnName(src, ib) === this.asgnName(src, eb);
  }

  /** single_argument_method? */
  private singleArgMethod(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) === "[]" || a.nKid(n) !== 3) {
      return false;
    }
    const arg = a.kid(n, 2);
    const t = a.type(arg);
    if (t === NT_SPLAT || t === NT_BLOCK_PASS || t === NT_FORWARDED_RESTARG || t === NT_FORWARDED_KWRESTARG || t === NT_FORWARDED_ARGS) {
      return false;
    }
    if (t === NT_HASH) {
      const f = a.kid(arg, 0);
      if (f !== V_NIL && (ssxIs(src, f, NT_KWSPLAT) || ssxIs(src, f, NT_FORWARDED_KWRESTARG))) {
        return false;
      }
    }
    return true;
  }

  /** branches_have_method? */
  private branchesHaveMethod(src: RbSource, n: i32): boolean {
    const a = src.a;
    const ib = scnIfBranch(src, n);
    const eb = scnElseBranch(src, n);
    if (ib === V_NIL || eb === V_NIL) {
      return false;
    }
    if (!this.singleArgMethod(src, ib) || !this.singleArgMethod(src, eb)) {
      return false;
    }
    if (ssxMeth(src, ib) !== ssxMeth(src, eb)) {
      return false;
    }
    return scnAstEqual(a, a.kid(ib, 0), a, a.kid(eb, 0), false);
  }

  /** require_parentheses? */
  private requireParens(src: RbSource, n: i32): boolean {
    const a = src.a;
    const t = a.type(n);
    if (scnBasicConditional(src, n) && scnModifier(src, n)) {
      return true;
    }
    if (t === NT_IRANGE || t === NT_ERANGE || t === NT_RESCUE) {
      return true;
    }
    if ((t === NT_AND || t === NT_OR) && stpSemanticOperator(src, n)) {
      return true;
    }
    if (t === NT_SEND) {
      return stpPrefixNot(src, n);
    }
    if (t === NT_RETURN || t === NT_NEXT || t === NT_BREAK || t === NT_YIELD || t === NT_SUPER) {
      return a.nKid(n) > 0 && !ssxParenthesized(src, n);
    }
    return false;
  }

  private requireBraces(src: RbSource, n: i32): boolean {
    return ssxIs(src, n, NT_HASH) && !ssxBeginIs(src, n, "{");
  }

  private wrapped(src: RbSource, n: i32): string {
    if (this.requireParens(src, n)) {
      return `(${src.nodeSrc(n)})`;
    }
    if (this.requireBraces(src, n)) {
      return `{ ${src.nodeSrc(n)} }`;
    }
    return src.nodeSrc(n);
  }

  /** make_ternary_form */
  private makeTernary(src: RbSource, n: i32): string {
    const a = src.a;
    const ib = a.kid(n, 1);
    const eb = a.kid(n, 2);
    const bhm = this.branchesHaveMethod(src, n);
    const binop = bhm && lalBinaryOperation(src, ib) && !ssxDot(src, ib);
    // if_source
    let is = "";
    if (bhm && ssxParenthesized(src, ib)) {
      const s = src.nodeSrc(ib);
      is = s.endsWith(")") ? s.substring(0, toI32(s.length) - 1) : s;
    } else if (binop) {
      is = `${src.nodeSrc(a.kid(ib, 0))} ${ssxMeth(src, ib)} (${src.nodeSrc(a.kid(ib, 2))}`;
    } else if (ssxIs(src, ib, NT_TRUE)) {
      const cond = a.kid(n, 0);
      if (a.nKid(cond) <= 2 || ssxParenthesized(src, cond)) {
        is = src.nodeSrc(cond);
      } else {
        is = `${src.src(a.exS(cond), ssxFE(src, cond, F_SELECTOR))}(${src.src(a.exS(a.kid(cond, 2)), a.exE(cond))})`;
      }
    } else {
      is = src.nodeSrc(ib);
    }
    // else_source
    let es = "";
    if (binop) {
      es = `${src.nodeSrc(a.kid(eb, 2))})`;
    } else if (bhm) {
      es = this.wrapped(src, a.kid(eb, 2));
    } else if (this.requireParens(src, eb)) {
      es = `(${src.nodeSrc(eb)})`;
    } else if (ssxIs(src, eb, NT_SEND) && a.nKid(eb) > 2 && !ssxParenthesized(src, eb) && !ssxOperatorName(ssxMeth(src, eb)) && !smtAssignmentMethod(ssxMeth(src, eb))) {
      const args: string[] = [];
      for (let i = 2; i < a.nKid(eb); i++) {
        args.push(src.nodeSrc(a.kid(eb, i)));
      }
      es = `${ssxMeth(src, eb)}(${args.join(", ")})`;
    } else if (this.branchesHaveAssignment(src, n)) {
      es = this.wrapped(src, a.kid(eb, -1));
    } else {
      es = src.nodeSrc(eb);
    }
    let r = `${is} || ${es}`;
    if (bhm && ssxParenthesized(src, ib)) {
      r = `${r})`;
    }
    const p = src.parent(n);
    if (p !== V_NIL && a.type(p) === NT_SEND) {
      return `(${r})`;
    }
    return r;
  }
}
