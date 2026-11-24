// Style/RedundantParentheses: candidates are verified by reparsing the
// corrected source (ReparsedEquivalence with the cop's normalization) before
// their offenses are added, at the end of the investigation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32, sub32 } from "../../core/arr";
import {
  F_BEGIN,
  F_DOT,
  F_END,
  F_HEREDOC_END,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  NT___ENCODING__,
  NT___FILE__,
  NT___LINE__,
  NT_ALIAS,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CBASE,
  NT_CLASS,
  NT_COMPLEX,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_ENSURE,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_FOR,
  NT_GVAR,
  NT_HASH,
  NT_IF,
  NT_INT,
  NT_IRANGE,
  NT_IVAR,
  NT_KWBEGIN,
  NT_KWSPLAT,
  NT_LAMBDA,
  NT_LVAR,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_MATCH_WITH_LVASGN,
  NT_MODULE,
  NT_NEXT,
  NT_NIL,
  NT_NOT,
  NT_NUMBLOCK,
  NT_OR,
  NT_PAIR,
  NT_PIN,
  NT_POSTEXE,
  NT_RATIONAL,
  NT_REDO,
  NT_REGEXP,
  NT_REGOPT,
  NT_RESBODY,
  NT_RESCUE,
  NT_RETRY,
  NT_RETURN,
  NT_SELF,
  NT_SEND,
  NT_SPLAT,
  NT_STR,
  NT_SUPER,
  NT_SYM,
  NT_TRUE,
  NT_UNDEF,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHEN,
  NT_WHILE,
  NT_WHILE_POST,
  NT_XSTR,
  NT_YIELD,
  NT_ZSUPER,
  NT_BLOCK,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbAtOff, rbSpaceBegin, rbSpaceEnd } from "../help";
import { rnHeredoc } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { rmlAsgnType } from "./layout_multiline_help";
import {
  sbhCallArgs,
  sbhComparisonName,
  sbhLambdaLiteral,
  sbhMethodName,
  sbhOperatorMethod,
  SbhReparse,
} from "./style_body_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import {
  ssxDescendants,
  ssxHas,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxIsSpace,
  ssxLocIs,
  ssxSingleLine,
} from "./style_syntax_help";

// ---- Node predicates ------------------------------------------------------------------

const sbhRpIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** Node#literal? */
const sbhRpLiteral = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_REGEXP ||
  t === NT_TRUE ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT ||
  t === NT_FALSE ||
  t === NT_NIL;

/** Node#variable? */
const sbhRpVariable = (t: i32): boolean => t === NT_IVAR || t === NT_GVAR || t === NT_CVAR || t === NT_LVAR;

const sbhRpRange = (src: RbSource, n: i32): boolean => sbhRpIs(src, n, NT_IRANGE) || sbhRpIs(src, n, NT_ERANGE);

/** Node#special_keyword? */
const sbhRpSpecialKeyword = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (
    t !== NT_STR &&
    t !== NT_SYM &&
    t !== NT_INT &&
    t !== NT_CONST &&
    t !== NT___FILE__ &&
    t !== NT___LINE__ &&
    t !== NT___ENCODING__
  ) {
    return false;
  }
  const s = src.nodeSrc(n);
  return s === "__FILE__" || s === "__LINE__" || s === "__ENCODING__";
};

/** MethodIdentifierPredicates#prefix_not? */
const sbhRpPrefixNot = (src: RbSource, n: i32): boolean =>
  ssxIsCall(src, n) &&
  src.a.kid(n, 0) !== V_NIL &&
  sbhMethodName(src, n) === "!" &&
  ssxLocIs(src, n, F_SELECTOR, "not");

/** Node#keyword? */
const sbhRpKeyword = (src: RbSource, n: i32): boolean => {
  if (sbhRpSpecialKeyword(src, n) || (sbhRpIs(src, n, NT_SEND) && sbhRpPrefixNot(src, n))) {
    return true;
  }
  const t = src.a.type(n);
  switch (t) {
    case NT_AND:
      return ssxLocIs(src, n, F_OPERATOR, "and");
    case NT_OR:
      return ssxLocIs(src, n, F_OPERATOR, "or");
    case NT_ALIAS:
    case NT_BREAK:
    case NT_CASE:
    case NT_CLASS:
    case NT_DEF:
    case NT_DEFS:
    case NT_DEFINED_P:
    case NT_KWBEGIN:
    case NT_ENSURE:
    case NT_FOR:
    case NT_IF:
    case NT_MODULE:
    case NT_NEXT:
    case NT_NOT:
    case NT_POSTEXE:
    case NT_REDO:
    case NT_RESCUE:
    case NT_RETRY:
    case NT_RETURN:
    case NT_SELF:
    case NT_SUPER:
    case NT_ZSUPER:
    case NT_UNDEF:
    case NT_UNTIL:
    case NT_WHEN:
    case NT_WHILE:
    case NT_YIELD:
      return true;
    default:
      return false;
  }
};

/** Node#assignment? (MethodDispatchNode's is setter_method?). */
const sbhRpAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (ssxIsCall(src, n)) {
    return ssxHas(src, n, F_OPERATOR);
  }
  return rmlAsgnType(src.a.type(n));
};

/** `{ (send nil? :proc) (send #global_const?(:Proc) :new) }` pieces of Node#proc?. */
const sbhRpProcNew = (src: RbSource, n: i32): boolean => {
  if (!sbhRpIs(src, n, NT_SEND) || src.a.nKid(n) !== 2 || sbhMethodName(src, n) !== "new") {
    return false;
  }
  const r = src.a.kid(n, 0);
  if (!sbhRpIs(src, r, NT_CONST) || src.a.text(src.a.kid(r, 1)) !== "Proc") {
    return false;
  }
  const ns = src.a.kid(r, 0);
  return ns === V_NIL || sbhRpIs(src, ns, NT_CBASE);
};

/** Node#lambda_or_proc? (BlockNode#lambda?: its send node is named lambda). */
const sbhRpLambdaOrProc = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIsAnyBlock(src, n)) {
    if (sbhMethodName(src, a.kid(n, 0)) === "lambda") {
      return true;
    }
  }
  if (sbhRpIs(src, n, NT_BLOCK)) {
    const sn = a.kid(n, 0);
    if (sbhRpIs(src, sn, NT_SEND) && a.kid(sn, 0) === V_NIL && a.nKid(sn) === 2 && sbhMethodName(src, sn) === "proc") {
      return true;
    }
    if (sbhRpProcNew(src, sn)) {
      return true;
    }
  }
  return sbhRpProcNew(src, n);
};

/** Node#chained? (identity). */
const sbhRpChained = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  return p !== V_NIL && ssxIsCall(src, p) && src.a.kid(p, 0) === n;
};

/** MethodDispatchNode#unary_operation? (a send/csend/super/yield/defined?/lambda node). */
const sbhRpUnary = (src: RbSource, n: i32): boolean => {
  if (!ssxIsCall(src, n)) {
    return false;
  }
  if (!ssxHas(src, n, F_SELECTOR)) {
    return false;
  }
  return sbhOperatorMethod(src, n) && src.a.exS(n) === src.a.fS(src.a.map(n), F_SELECTOR);
};

/** children.one?'s count: the children that are not nil. */
const sbhRpTruthyKids = (src: RbSource, n: i32): i32 => {
  let k = 0;
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (src.a.kid(n, i) !== V_NIL) {
      k = add32(k, 1);
    }
  }
  return k;
};

/** A structural == between two handles (nil == nil). */
const sbhRpEq = (src: RbSource, x: i32, y: i32): boolean => ssxAstEqual(src.a, x, src.a, y);

/** The arguments of a call-like node (send, csend, super, yield, defined?). */
const sbhRpArgs = (src: RbSource, n: i32): i32[] => {
  if (sbhRpIs(src, n, NT_DEFINED_P)) {
    const out: i32[] = [];
    for (let i = 0; i < src.a.nKid(n); i++) {
      out.push(src.a.kid(n, i));
    }
    return out;
  }
  return sbhCallArgs(src, n);
};

/** Util#parentheses?: loc.end is `)`. */
const sbhRpParens = (src: RbSource, n: i32): boolean => src.a.isNode(n) && ssxLocIs(src, n, F_END, ")");

/** The text after a node's closing paren on its line, left-stripped: [start, end) code points. */
const sbhRpAfterClose = (src: RbSource, n: i32): i32 => {
  const es = src.a.fS(src.a.map(n), F_END);
  const le = src.lineEnd(src.line(es));
  let p = add32(es, 1);
  while (p < le && (ssxIsSpace(src.at(p)) || src.at(p) === 0)) {
    p++;
  }
  return p;
};

/** Whether the code points at p start with `s`. */
const sbhRpAt = (src: RbSource, p: i32, s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (rbAtOff(src, p, i) !== s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

/** heredoc_body_before_close_paren? */
const sbhRpHeredocBeforeClose = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const k = a.nKid(n);
  if (k === 0) {
    return false;
  }
  const last = a.kid(n, -1);
  if (last === V_NIL || !a.isNode(last)) {
    return false;
  }
  const close = a.fS(a.map(n), F_END);
  const all: i32[] = [last];
  for (const d of ssxDescendants(src, last)) {
    all.push(d);
  }
  for (const s of all) {
    const t = a.type(s);
    if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, s)) {
      if (a.fE(a.map(s), F_HEREDOC_END) <= close) {
        return true;
      }
    }
  }
  return false;
};

/** ParenthesesCorrector.heredoc_strands_code_after_close_paren? */
const sbhRpHeredocStrands = (src: RbSource, n: i32): boolean => {
  if (!sbhRpHeredocBeforeClose(src, n)) {
    return false;
  }
  const p = sbhRpAfterClose(src, n);
  const le = src.lineEnd(src.line(src.a.fS(src.a.map(n), F_END)));
  return p < le && !sbhRpAt(src, p, ".") && !sbhRpAt(src, p, "&.") && !sbhRpAt(src, p, ",");
};

/** ParenthesesCorrector.correct. */
export const sbhRpCorrect = (src: RbSource, k: RbRewriter, n: i32): void => {
  const a = src.a;
  const m = a.map(n);
  const bs = a.fS(m, F_BEGIN);
  const be = a.fE(m, F_BEGIN);
  const es = a.fS(m, F_END);
  const ee = a.fE(m, F_END);
  k.remove(bs, rbSpaceEnd(src, be, 2, true, true, false));
  // remove_close_paren
  const after = sbhRpAfterClose(src, n);
  const le = src.lineEnd(src.line(es));
  if (sbhRpHeredocBeforeClose(src, n) && (sbhRpAt(src, after, ".") || sbhRpAt(src, after, "&."))) {
    k.replace(rbSpaceBegin(src, es, 1, true, false, false), ee, "\n");
  } else {
    // comment_above_close_paren_swallows_chain?
    let swallow = false;
    const nk = a.nKid(n);
    const last = nk > 0 ? a.kid(n, nk - 1) : V_NIL;
    if (last !== V_NIL && a.isNode(last) && a.exE(last) < es) {
      let hasComment = false;
      let p = a.exE(last);
      while (p < es) {
        if (src.at(p) === 35) {
          let q = p + 1;
          while (q < es && src.at(q) !== 10) {
            q++;
          }
          if (q < es) {
            hasComment = true;
            break;
          }
        }
        p++;
      }
      if (hasComment) {
        swallow = after < le && src.at(after) !== 35;
      }
    }
    k.remove(rbSpaceBegin(src, es, 1, !swallow, false, false), ee);
  }
  // handle_orphaned_comma
  const ls = src.lineStart(src.line(es));
  let p = ls;
  while (p < le && ssxIsSpace(src.at(p))) {
    p++;
  }
  if (src.at(p) === 41) {
    p = add32(p, 1);
    while (p < le && ssxIsSpace(src.at(p))) {
      p++;
    }
    if (p < le && src.at(p) === 44) {
      let re = ee;
      let lastNode = V_NIL;
      for (let i = 0; i < a.nKid(n); i++) {
        if (a.isNode(a.kid(n, i))) {
          lastNode = a.kid(n, i);
        }
      }
      const heredoc = lastNode !== V_NIL && rnHeredoc(src, lastNode);
      if (heredoc) {
        // COMMA_REGEXP: the first `)` of the line followed by \s*,
        let q = ls;
        let off = 0;
        while (q < le) {
          if (src.at(q) === 41) {
            let r = q + 1;
            while (r < le && ssxIsSpace(src.at(r))) {
              r++;
            }
            if (r < le && src.at(r) === 44) {
              off = sub32(r, q);
              break;
            }
          }
          q++;
        }
        re = add32(ee, off);
      }
      k.remove(rbSpaceBegin(src, es, 1, true, true, true), re);
      if (heredoc) {
        k.insertAfter(a.exS(lastNode), a.exE(lastNode), ",");
      }
    }
  }
  // ternary condition followed by `?`
  const par = src.parent(n);
  if (par !== V_NIL && sbhRpIs(src, par, NT_IF) && ssxHas(src, par, F_QUESTION)) {
    if (src.column(a.exE(n)) === src.column(a.fS(a.map(par), F_QUESTION))) {
      k.insertAfter(es, ee, " ");
    }
  }
};

/** `(send `{(send _recv _msg) str array hash const #variable?} :[] ...)` */
const sbhRpSquareBrackets = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!sbhRpIs(src, n, NT_SEND) || sbhMethodName(src, n) !== "[]") {
    return false;
  }
  const r = a.kid(n, 0);
  if (r === V_NIL || !a.isNode(r)) {
    return false;
  }
  const all: i32[] = [r];
  for (const d of ssxDescendants(src, r)) {
    all.push(d);
  }
  for (const d of all) {
    const t = a.type(d);
    if (
      (t === NT_SEND && a.nKid(d) === 2) ||
      t === NT_STR ||
      t === NT_ARRAY ||
      t === NT_HASH ||
      t === NT_CONST ||
      sbhRpVariable(t)
    ) {
      return true;
    }
  }
  return false;
};

/** Style/RedundantParentheses. */
export class CopStyleRedundantParentheses {
  c: RbCop;
  // @pending_offenses: candidate nodes in first-added order.
  pend: i32[];

  constructor() {
    this.c = new RbCop("Style/RedundantParentheses");
    this.pend = [];
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const none: i32[] = [];
    this.pend = none;
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_BEGIN) {
        continue;
      }
      if (!sbhRpParens(src, n) || this.parensAllowed(src, n) || this.ignoreSyntax(src, n)) {
        continue;
      }
      this.check(src, n);
    }
    // on_investigation_end
    const ss: i32[] = [];
    const es: i32[] = [];
    const ks: RbRewriter[] = [];
    for (const n of this.pend) {
      ss.push(a.exS(n));
      es.push(a.exE(n));
      const k = new RbRewriter(src.n);
      sbhRpCorrect(src, k, n);
      ks.push(k);
    }
    const rp = new SbhReparse(src, true);
    for (const i of rp.verified(ss, es, ks)) {
      const n = atI32(this.pend, i);
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        sbhRpCorrect(src, k, n);
        this.c.commit(k);
      }
    }
  }

  private offense(n: i32): void {
    for (const x of this.pend) {
      if (x === n) {
        return;
      }
    }
    this.pend.push(n);
  }

  private parensAllowed(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (a.nKid(n) === 0) {
      return true;
    }
    const p = src.parent(n);
    // rescue?: {^resbody ^^resbody}
    if (
      p !== V_NIL &&
      (a.type(p) === NT_RESBODY || (src.parent(p) !== V_NIL && a.type(src.parent(p)) === NT_RESBODY))
    ) {
      return true;
    }
    // in_pattern_matching_in_method_argument?
    if (p !== V_NIL && ssxIsCall(src, p) && sbhRpIs(src, a.kid(n, 0), NT_MATCH_PATTERN_P)) {
      return true;
    }
    // allowed_pin_operator?: ^(pin (begin !{lvar ivar cvar gvar}))
    if (p !== V_NIL && a.type(p) === NT_PIN && a.nKid(p) === 1) {
      const b = a.kid(p, 0);
      if (sbhRpIs(src, b, NT_BEGIN) && a.nKid(b) === 1) {
        const c = a.kid(b, 0);
        if (!(a.isNode(c) && sbhRpVariable(a.type(c)))) {
          return true;
        }
      }
    }
    // allowed_expression?
    if (p !== V_NIL && sbhRpKeyword(src, p) && this.parensRequired(src, n)) {
      return true;
    }
    if (a.nKid(n) !== 1 && p !== V_NIL) {
      const pt = a.type(p);
      if (!(pt === NT_BEGIN || pt === NT_DEF || pt === NT_DEFS || ssxIsAnyBlock(src, p))) {
        return true;
      }
    }
    if (p !== V_NIL && sbhRpRange(src, p)) {
      return true;
    }
    return sbhRpHeredocStrands(src, n);
  }

  /** Parentheses#parens_required? */
  private parensRequired(src: RbSource, n: i32): boolean {
    const s = src.a.exS(n);
    const e = src.a.exE(n);
    const before = s === 0 ? rbAtOff(src, src.n, -1) : rbAtOff(src, s, -1);
    const after = src.at(e);
    return (before >= 97 && before <= 122) || (after >= 97 && after <= 122);
  }

  private ignoreSyntax(src: RbSource, n: i32): boolean {
    const a = src.a;
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    const pt = a.type(p);
    if (pt === NT_WHILE_POST || pt === NT_UNTIL_POST || pt === NT_MATCH_WITH_LVASGN) {
      return true;
    }
    // like_method_argument_parentheses?
    if (pt === NT_SEND || pt === NT_SUPER || pt === NT_YIELD) {
      const args = sbhCallArgs(src, p);
      if (
        args.length === 1 &&
        !sbhRpParens(src, p) &&
        !sbhOperatorMethod(src, p) &&
        sbhRpIs(src, atI32(args, 0), NT_BEGIN)
      ) {
        return true;
      }
    }
    // multiline_control_flow_statements?
    return !ssxSingleLine(src, p) && (pt === NT_RETURN || pt === NT_NEXT || pt === NT_BREAK);
  }

  private check(src: RbSource, b0: i32): void {
    const a = src.a;
    let b = b0;
    const node = a.kid(b, 0);
    const msg = this.message(src, b, node);
    if (msg === "!") {
      return;
    }
    if (msg.length > 0) {
      if (msg === "block body") {
        this.offense(b);
        return;
      }
      if (sbhRpRange(src, node) && !this.argOfParenCall(src, b, node)) {
        b = src.parent(b);
      }
      if (b !== V_NIL) {
        this.offense(b);
      }
      return;
    }
    // call_node?
    if (
      ssxIsCall(src, node) ||
      (ssxIsAnyBlock(src, node) && ssxLocIs(src, node, F_END, "}") && !sbhRpLambdaOrProc(src, node))
    ) {
      this.checkSend(src, b, node);
    }
  }

  /** find_offense_message ("" for none). */
  private message(src: RbSource, b: i32, node: i32): string {
    const a = src.a;
    if (!a.isNode(node)) {
      return "";
    }
    const t = a.type(node);
    const p = src.parent(b);
    if (this.keywordWithRedundantParens(src, node)) {
      return "a keyword";
    }
    if (sbhRpLiteral(t)) {
      // disallowed_literal?
      let dis = true;
      if (sbhRpRange(src, node)) {
        dis = p !== V_NIL && a.type(p) === NT_BEGIN && a.nKid(p) === 1;
      }
      if (dis) {
        return "a literal";
      }
    }
    if (sbhRpVariable(t)) {
      return "a variable";
    }
    if (t === NT_CONST) {
      return "a constant";
    }
    if ((p !== V_NIL && ssxIsAnyBlock(src, p)) || this.bodyRange(src, b, node)) {
      return "block body";
    }
    if (sbhRpAssignment(src, node) && (p === V_NIL || a.type(p) === NT_BEGIN)) {
      return "an assignment";
    }
    if (sbhRpLambdaOrProc(src, node)) {
      // `node.braces?` raises on a send (Proc.new): no offense for this begin.
      if (!ssxIsAnyBlock(src, node)) {
        return "!";
      }
      if (ssxLocIs(src, node, F_END, "}") || sbhLambdaLiteral(src, a.kid(node, 0))) {
        return "an expression";
      }
    }
    // disallowed_one_line_pattern_matching?
    let pm = true;
    if (p !== V_NIL) {
      if ((a.type(p) === NT_DEF || a.type(p) === NT_DEFS) && !ssxHas(src, p, F_END)) {
        pm = false;
      }
      if (sbhRpAssignment(src, p)) {
        pm = false;
      }
    }
    if (pm && (t === NT_MATCH_PATTERN || t === NT_MATCH_PATTERN_P)) {
      let opKw = false;
      let q = src.parent(node);
      while (q !== V_NIL) {
        if (a.type(q) === NT_AND || a.type(q) === NT_OR) {
          opKw = true;
          break;
        }
        q = src.parent(q);
      }
      if (!opKw) {
        return "a one-line pattern matching";
      }
    }
    // interpolation?: [^begin ^^dstr]
    if (p !== V_NIL && a.type(p) === NT_BEGIN && src.parent(p) !== V_NIL && a.type(src.parent(p)) === NT_DSTR) {
      return "an interpolated expression";
    }
    if (
      this.argOfParenCall(src, b, node) &&
      !(
        (t === NT_AND || t === NT_OR) &&
        (ssxLocIs(src, node, F_OPERATOR, "and") || ssxLocIs(src, node, F_OPERATOR, "or"))
      )
    ) {
      return "a method argument";
    }
    // oneline_rescue_parentheses_required?
    if (t === NT_RESCUE && p !== V_NIL) {
      const pt = a.type(p);
      let req = true;
      if (pt === NT_IF && ssxHas(src, p, F_QUESTION)) {
        req = false;
      } else if (
        (pt === NT_IF || pt === NT_WHILE || pt === NT_UNTIL || pt === NT_CASE || pt === NT_CASE_MATCH) &&
        sbhRpEq(src, a.kid(p, 0), b)
      ) {
        req = false;
      } else if (pt === NT_SEND || pt === NT_CSEND || pt === NT_ARRAY || pt === NT_PAIR) {
        req = false;
      }
      if (req) {
        return "a one-line rescue";
      }
    }
    if (sbhRpChained(src, b)) {
      return "";
    }
    if (t === NT_AND || t === NT_OR) {
      const semantic = ssxLocIs(src, node, F_OPERATOR, "and") || ssxLocIs(src, node, F_OPERATOR, "or");
      if (semantic && p !== V_NIL) {
        return "";
      }
      if (p !== V_NIL) {
        const pt = a.type(p);
        if (pt === NT_OR || pt === NT_SEND || pt === NT_SPLAT || pt === NT_KWSPLAT) {
          return "";
        }
        if (t !== NT_AND && pt === NT_AND) {
          return "";
        }
        if (pt === NT_IF && ssxHas(src, p, F_QUESTION)) {
          return "";
        }
      }
      return "a logical expression";
    }
    if (this.comparisonNode(src, node)) {
      return p === V_NIL ? "a comparison expression" : "";
    }
    return "";
  }

  /** respond_to?(:comparison_method?) && comparison_method? */
  private comparisonNode(src: RbSource, n: i32): boolean {
    const a = src.a;
    const t = a.type(n);
    let m = "";
    if (t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_ZSUPER || t === NT_YIELD || t === NT_LAMBDA) {
      m = sbhMethodName(src, n);
    } else if (t === NT_DEFINED_P) {
      m = "defined?";
    } else if (t === NT_DEF) {
      m = a.text(a.kid(n, 0));
    } else if (t === NT_DEFS) {
      m = a.text(a.kid(n, 1));
    } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      m = sbhMethodName(src, a.kid(n, 0));
    } else {
      return false;
    }
    return sbhComparisonName(m);
  }

  /** keyword_with_redundant_parentheses? */
  private keywordWithRedundantParens(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (!sbhRpKeyword(src, n)) {
      return false;
    }
    if (sbhRpSpecialKeyword(src, n)) {
      return true;
    }
    // args.one? counts the non-nil children; args.empty? all of them.
    if (sbhRpTruthyKids(src, n) === 1 && sbhRpIs(src, a.kid(n, 0), NT_BEGIN)) {
      return sbhRpParens(src, a.kid(n, 0));
    }
    return a.nKid(n) === 0 || sbhRpParens(src, n);
  }

  /** body_range? */
  private bodyRange(src: RbSource, b: i32, node: i32): boolean {
    const a = src.a;
    if (sbhRpChained(src, b) || !sbhRpRange(src, node)) {
      return false;
    }
    const p = src.parent(b);
    if (p === V_NIL || a.type(p) !== NT_BEGIN) {
      return false;
    }
    return (
      (a.kid(node, 0) === V_NIL && sbhRpEq(src, b, a.kid(p, 0))) ||
      (a.kid(node, 1) === V_NIL && sbhRpEq(src, b, a.kid(p, -1)))
    );
  }

  /** argument_of_parenthesized_method_call? */
  private argOfParenCall(src: RbSource, b: i32, node: i32): boolean {
    const a = src.a;
    const t = a.type(node);
    if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_RESCUE) {
      return false;
    }
    // method_call_parentheses_required?
    if (ssxIsCall(src, node) && (a.kid(node, 0) === V_NIL || ssxHas(src, node, F_DOT)) && a.nKid(node) > 2) {
      return false;
    }
    const p = src.parent(b);
    if (p === V_NIL) {
      return false;
    }
    return ssxIsCall(src, p) && sbhRpParens(src, p) && !sbhRpEq(src, a.kid(p, 0), b);
  }

  private checkSend(src: RbSource, b: i32, n0: i32): void {
    const a = src.a;
    let node = n0;
    if (ssxIsAnyBlock(src, node)) {
      node = a.kid(node, 0);
    }
    if (sbhRpUnary(src, node)) {
      // check_unary
      if (sbhRpChained(src, b)) {
        return;
      }
      while (sbhRpIs(src, node, NT_SEND) && sbhRpUnary(src, node) && !sbhRpPrefixNot(src, node)) {
        node = a.kid(node, 0);
      }
      if (this.callWithRedundantParens(src, b, node)) {
        this.offense(b);
      }
      return;
    }
    // setter_in_condition?
    if (ssxIsCall(src, node) && ssxHas(src, node, F_OPERATOR)) {
      const p = src.parent(b);
      if (p !== V_NIL) {
        const pt = a.type(p);
        if ((pt === NT_IF || pt === NT_WHILE || pt === NT_UNTIL) && a.kid(p, 0) === b) {
          return;
        }
      }
    }
    if (this.callWithRedundantParens(src, b, node)) {
      this.offense(b);
    }
  }

  /** method_call_with_redundant_parentheses? */
  private callWithRedundantParens(src: RbSource, b: i32, node: i32): boolean {
    const a = src.a;
    if (!a.isNode(node)) {
      return false;
    }
    const t = a.type(node);
    if (t !== NT_SEND && t !== NT_CSEND && t !== NT_SUPER && t !== NT_YIELD && t !== NT_DEFINED_P) {
      return false;
    }
    if (sbhRpPrefixNot(src, node)) {
      return false;
    }
    // singular_parenthesized_parent?
    const p = src.parent(b);
    if (p === V_NIL) {
      return true;
    }
    const pt = a.type(p);
    if (pt !== NT_SPLAT && pt !== NT_KWSPLAT && sbhRpTruthyKids(src, p) === 1) {
      return true;
    }
    return sbhRpArgs(src, node).length === 0 || sbhRpParens(src, node) || sbhRpSquareBrackets(src, node);
  }
}
