// Style/SingleLineMethods (AllowIfMethodIsEmpty: true). Style/EndlessMethod
// is `Enabled: pending`, which Config#cop_enabled? takes as truthy, with
// EnforcedStyle allow_single_line: the correction makes an endless method
// where EndlessMethodBodyHelp allows one.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK_PASS,
  NT_BREAK,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_ERANGE,
  NT_FORWARDED_KWRESTARG,
  NT_FORWARDED_RESTARG,
  NT_IF,
  NT_IRANGE,
  NT_KWBEGIN,
  NT_LAMBDA,
  NT_MASGN,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_NEXT,
  NT_OR,
  NT_PAIR,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_SUPER,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { rbLayCommentAtLine } from "./layout_empty_help";
import { rmlAsgnType, rmlSpaces } from "./layout_multiline_help";
import {
  sbhAssignmentMethod,
  sbhCallArgs,
  sbhComparisonName,
  sbhLambdaLiteral,
  sbhMethodName,
  sbhOperatorMethod,
  sbhResbodies,
} from "./style_body_help";
import {
  ssxDefArgs,
  ssxDefBody,
  ssxDefName,
  ssxDescendants,
  ssxEndless,
  ssxFE,
  ssxFirstLine,
  ssxFS,
  ssxHas,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxLocIs,
  ssxParenthesized,
  ssxSingleLine,
} from "./style_syntax_help";

/** Node#assignment? (MethodDispatchNode's is setter_method?). */
export const sbhSlmAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (ssxIsCall(src, n)) {
    return ssxHas(src, n, F_OPERATOR);
  }
  return rmlAsgnType(src.a.type(n));
};

/** EndlessMethodBodyHelp#assigned_value. */
const sbhSlmAssignedValue = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (src.a.isNode(n) && (sbhSlmAssignment(src, n) || src.a.type(n) === NT_RESCUE)) {
    n = src.a.type(n) === NT_RESCUE ? src.a.kid(n, 0) : src.a.kid(n, -1);
  }
  return n;
};

/** EndlessMethodBodyHelp#command_call? */
const sbhSlmCommandCall = (src: RbSource, n0: i32): boolean => {
  let n = n0;
  if (ssxIsAnyBlock(src, n)) {
    n = src.a.kid(n, 0);
  }
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t !== NT_SEND && t !== NT_CSEND && t !== NT_SUPER && t !== NT_YIELD) {
    return false;
  }
  if (sbhCallArgs(src, n).length === 0 || ssxParenthesized(src, n) || sbhOperatorMethod(src, n)) {
    return false;
  }
  return !(ssxIsCall(src, n) && ssxHas(src, n, F_OPERATOR));
};

/** each_node(:any_block): the node and its descendants that are blocks. */
const sbhSlmBlocks = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (ssxIsAnyBlock(src, n)) {
    out.push(n);
  }
  for (const d of ssxDescendants(src, n)) {
    if (ssxIsAnyBlock(src, d)) {
      out.push(d);
    }
  }
  return out;
};

/** argument_receiving_call: the call the def is an argument of (V_NIL for none). */
const sbhSlmArgCall = (src: RbSource, def: i32): i32 => {
  const call = src.parent(def);
  if (call === V_NIL || !ssxIsCall(src, call)) {
    return V_NIL;
  }
  for (let i = 2; i < src.a.nKid(call); i++) {
    if (src.a.kid(call, i) === def) {
      return call;
    }
  }
  return V_NIL;
};

/** SingleLineMethods#require_parentheses? */
const sbhSlmRequireParens = (src: RbSource, body: i32): boolean => {
  if (!src.a.isNode(body) || src.a.type(body) !== NT_SEND) {
    return false;
  }
  const m = sbhMethodName(src, body);
  if (m === "+" || m === "-" || m === "*" || m === "/" || m === "%" || m === "**") {
    return false;
  }
  return src.a.nKid(body) > 2 && !sbhComparisonName(m);
};

/** EndlessMethodBodyHelp#endless_method_body? (with SingleLineMethods#command_body_in_argument?). */
const sbhSlmEndlessBody = (src: RbSource, body: i32): boolean => {
  const a = src.a;
  const t = a.type(body);
  if (t === NT_BEGIN || t === NT_KWBEGIN || t === NT_RESCUE || t === NT_ENSURE || t === NT_MASGN) {
    return false;
  }
  // low_precedence_body?
  if (t === NT_MATCH_PATTERN || t === NT_MATCH_PATTERN_P || t === NT_WHILE_POST || t === NT_UNTIL_POST) {
    return false;
  }
  if (
    (t === NT_AND || t === NT_OR) &&
    (ssxLocIs(src, body, F_OPERATOR, "and") || ssxLocIs(src, body, F_OPERATOR, "or"))
  ) {
    return false;
  }
  if (
    t === NT_IF &&
    !ssxHas(src, body, F_END) &&
    (ssxLocIs(src, body, F_KEYWORD, "if") || ssxLocIs(src, body, F_KEYWORD, "unless"))
  ) {
    return false;
  }
  if ((t === NT_WHILE || t === NT_UNTIL) && !ssxHas(src, body, F_END)) {
    return false;
  }
  // ends_with_omitted_hash_value? / ends_with_anonymous_argument?
  const be = a.exE(body);
  for (const d of ssxDescendants(src, body)) {
    const dt = a.type(d);
    if (dt === NT_PAIR && src.at(a.exE(d) - 1) === 58 && a.exE(d) === be) {
      return false;
    }
    if ((dt === NT_FORWARDED_RESTARG || dt === NT_FORWARDED_KWRESTARG || dt === NT_BLOCK_PASS) && a.exE(d) === be) {
      if (dt !== NT_BLOCK_PASS || a.kid(d, 0) === V_NIL) {
        return false;
      }
    }
  }
  if (sbhSlmAssignment(src, body)) {
    // multiple_values?: an array without brackets.
    const v = sbhSlmAssignedValue(src, body);
    if (
      a.isNode(v) &&
      a.type(v) === NT_ARRAY &&
      !ssxLocIs(src, v, F_BEGIN, "[") &&
      !(ssxHas(src, v, F_BEGIN) && src.at(ssxFS(src, v, F_BEGIN)) === 37)
    ) {
      return false;
    }
  }
  // command_disallowed_in_endless_body?
  if (sbhSlmAssignment(src, body) && sbhSlmCommandCall(src, sbhSlmAssignedValue(src, body))) {
    return false;
  }
  const call = sbhSlmArgCall(src, src.parent(body));
  if (!sbhSlmRequireParens(src, body) && sbhSlmCommandCall(src, body) && call !== V_NIL) {
    return false;
  }
  if (call !== V_NIL && !ssxParenthesized(src, call)) {
    for (const b of sbhSlmBlocks(src, body)) {
      if (ssxLocIs(src, b, F_END, "end") && !sbhLambdaLiteral(src, a.kid(b, 0))) {
        return false;
      }
    }
  }
  if (
    t === NT_SEND &&
    a.kid(body, 0) !== V_NIL &&
    sbhMethodName(src, body) === "!" &&
    ssxLocIs(src, body, F_SELECTOR, "!") &&
    sbhSlmCommandCall(src, a.kid(body, 0))
  ) {
    return false;
  }
  for (const b of sbhSlmBlocks(src, body)) {
    if (ssxLocIs(src, b, F_END, "end") && sbhSlmCommandCall(src, a.kid(b, 0))) {
      return false;
    }
  }
  return true;
};

/** captures_following_code? */
const sbhSlmCaptures = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const p = src.parent(n);
  if (p === V_NIL) {
    return false;
  }
  if (a.exE(p) === a.exE(n)) {
    return sbhSlmCaptures(src, p);
  }
  if (a.kid(p, 0) !== n) {
    return false;
  }
  const t = a.type(p);
  if (t === NT_AND || t === NT_OR) {
    return ssxLocIs(src, p, F_OPERATOR, "&&") || ssxLocIs(src, p, F_OPERATOR, "||");
  }
  if (t === NT_IF) {
    return ssxHas(src, p, F_QUESTION);
  }
  if (t === NT_RESCUE) {
    const rb = sbhResbodies(src, p);
    return rb.length > 0 && ssxFirstLine(src, n) === ssxFirstLine(src, rb[0]);
  }
  return t === NT_SEND || t === NT_CSEND || t === NT_IRANGE || t === NT_ERANGE;
};

/** correct_to_endless? */
const sbhSlmToEndless = (src: RbSource, def: i32, body: i32): boolean => {
  if (body === V_NIL) {
    return false;
  }
  if (sbhAssignmentMethod(ssxDefName(src, def))) {
    return false;
  }
  if (sbhSlmCaptures(src, def)) {
    return false;
  }
  const t = src.a.type(body);
  if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_RETURN || t === NT_BREAK || t === NT_NEXT) {
    return false;
  }
  return sbhSlmEndlessBody(src, body);
};

/** Style/SingleLineMethods. */
export class CopStyleSingleLineMethods {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SingleLineMethods");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      if (!ssxSingleLine(src, n) || ssxEndless(src, n)) {
        continue;
      }
      const body = ssxDefBody(src, n);
      if (body === V_NIL) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (sbhSlmToEndless(src, n, body)) {
        this.toEndless(src, k, n, body);
      } else {
        this.toMultiline(src, k, n, body);
      }
      this.c.commit(k);
    }
  }

  /** correct_to_multiline. */
  private toMultiline(src: RbSource, k: RbRewriter, n: i32, body: i32): void {
    const a = src.a;
    const col = src.column(ssxFS(src, n, F_KEYWORD));
    const ind = `\n${rmlSpaces(col + 2)}`;
    if (a.type(body) === NT_BEGIN && ssxLocIs(src, body, F_BEGIN, "(")) {
      k.insertBefore(a.exS(body), a.exE(body), ind);
    } else if (a.type(body) === NT_BEGIN) {
      for (let i = 0; i < a.nKid(body); i++) {
        const part = a.kid(body, i);
        if (a.isNode(part)) {
          k.insertBefore(a.exS(part), a.exE(part), ind);
        }
      }
    } else {
      k.insertBefore(a.exS(body), a.exE(body), ind);
    }
    k.insertBefore(ssxFS(src, n, F_END), ssxFE(src, n, F_END), `\n${rmlSpaces(col)}`);
    // LineBreakCorrector.move_comment
    const ci = rbLayCommentAtLine(src, src.line(a.exS(n)));
    if (ci >= 0) {
      const cs = src.commS[ci];
      const ce = src.commE[ci];
      k.insertBefore(a.exS(n), a.exE(n), `${src.src(cs, ce)}\n${rmlSpaces(col)}`);
      k.remove(cs, ce);
    }
  }

  /** correct_to_endless. */
  private toEndless(src: RbSource, k: RbRewriter, n: i32, body: i32): void {
    const a = src.a;
    let receiver = "";
    if (a.type(n) === NT_DEFS) {
      receiver = `${src.nodeSrc(a.kid(n, 0))}.`;
    }
    // method_body_source
    let bodySrc = src.nodeSrc(body);
    if (sbhSlmRequireParens(src, body)) {
      const parts: string[] = [];
      for (let i = 2; i < a.nKid(body); i++) {
        parts.push(src.nodeSrc(a.kid(body, i)));
      }
      bodySrc = `${sbhMethodName(src, body)}(${parts.join(", ")})`;
      if (a.kid(body, 0) !== V_NIL) {
        bodySrc = `${src.nodeSrc(a.kid(body, 0))}.${bodySrc}`;
      }
    }
    // endless_arguments
    const args = ssxDefArgs(src, n);
    let argSrc = "()";
    if (a.nKid(args) > 0) {
      argSrc = ssxHas(src, args, F_BEGIN) ? src.nodeSrc(args) : `(${src.nodeSrc(args)})`;
    }
    k.replace(a.exS(n), a.exE(n), `def ${receiver}${ssxDefName(src, n)}${argSrc} = ${bodySrc}`);
  }
}
