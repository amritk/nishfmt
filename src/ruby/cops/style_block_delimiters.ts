// Style/BlockDelimiters (EnforcedStyle: line_count_based, AllowedMethods:
// lambda proc it, no AllowedPatterns or BracesRequiredMethods).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  NT_BLOCK,
  NT_CSEND,
  NT_ENSURE,
  NT_FOR,
  NT_HASH,
  NT_NUMBLOCK,
  NT_PAIR,
  NT_RESCUE,
  NT_SEND,
  NT_SUPER,
  NT_UNTIL,
  NT_WHILE,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  sbhAssignmentMethod,
  sbhBlockMethod,
  sbhBlockNode,
  sbhBraces,
  sbhCallArgs,
  sbhChained,
  sbhDirectiveComment,
  sbhIsBlock,
  sbhMethodName,
  sbhOperatorMethod,
  sbhResbodies,
  sbhResbodyExceptions,
} from "./style_body_help";
import { LalIgnored } from "./layout_align_help";
import { rbLayCommentAtLine } from "./layout_empty_help";
import { ssxBeginIs, ssxFE, ssxFS, ssxIsAnyBlock, ssxIsSpace, ssxParenthesized } from "./style_syntax_help";

/** get_blocks: the blocks an argument holds that bind differently without parentheses. */
const sbhBdGetBlocks = (src: RbSource, n: i32, out: i32[]): void => {
  if (!src.a.isNode(n)) {
    return;
  }
  const t = src.a.type(n);
  if (t === NT_BLOCK || t === NT_NUMBLOCK) {
    out.push(n);
  } else if (t === NT_SEND || t === NT_CSEND) {
    const r = src.a.kid(n, 0);
    if (r !== V_NIL) {
      sbhBdGetBlocks(src, r, out);
    }
    for (let i = 2; i < src.a.nKid(n); i++) {
      sbhBdGetBlocks(src, src.a.kid(n, i), out);
    }
  } else if (t === NT_HASH) {
    if (ssxBeginIs(src, n, "{")) {
      return;
    }
    for (let i = 0; i < src.a.nKid(n); i++) {
      sbhBdGetBlocks(src, src.a.kid(n, i), out);
    }
  } else if (t === NT_PAIR) {
    for (let i = 0; i < src.a.nKid(n); i++) {
      sbhBdGetBlocks(src, src.a.kid(n, i), out);
    }
  }
};

/** BlockNode#single_line?: its opening and closing on one line. */
const sbhBdSingleLine = (src: RbSource, n: i32): boolean =>
  src.line(ssxFS(src, n, F_BEGIN)) === src.line(ssxFS(src, n, F_END));

/** modifier_rescue? */
const sbhBdModifierRescue = (src: RbSource, n: i32): boolean => {
  if (src.a.kid(n, 0) === V_NIL || src.a.kid(n, -1) !== V_NIL) {
    return false;
  }
  const rb = sbhResbodies(src, n);
  if (rb.length !== 1) {
    return false;
  }
  return sbhResbodyExceptions(src, rb[0]).length === 0 && src.a.kid(rb[0], 1) === V_NIL;
};

/** require_do_end? */
const sbhBdRequireDoEnd = (src: RbSource, n: i32): boolean => {
  if (sbhBraces(src, n) || !sbhBdSingleLine(src, n)) {
    return false;
  }
  const body = src.a.kid(n, 2);
  if (body === V_NIL || !src.a.isNode(body)) {
    return false;
  }
  if (src.a.type(body) === NT_ENSURE) {
    return true;
  }
  if (src.a.type(body) !== NT_RESCUE) {
    return false;
  }
  return !sbhBdModifierRescue(src, body);
};

/** proper_block_style? */
const sbhBdProper = (src: RbSource, n: i32): boolean => {
  if (sbhBdRequireDoEnd(src, n)) {
    return true;
  }
  const p = src.parent(n);
  if (p !== V_NIL && src.a.type(p) === NT_FOR && src.a.kid(p, 1) === n) {
    return true;
  }
  const m = sbhBlockMethod(src, n);
  if (m === "lambda" || m === "proc" || m === "it") {
    return true;
  }
  return !sbhBdSingleLine(src, n) !== sbhBraces(src, n);
};

/** loop_condition?: the block is (inside) the condition of a while/until, with no block in between. */
const sbhBdLoopCondition = (src: RbSource, n: i32): boolean => {
  let child = n;
  let p = src.parent(n);
  while (p !== V_NIL && !ssxIsAnyBlock(src, p)) {
    const t = src.a.type(p);
    if ((t === NT_WHILE || t === NT_UNTIL) && src.a.kid(p, 0) === child) {
      return true;
    }
    child = p;
    p = src.parent(p);
  }
  return false;
};

/** correction_would_break_code? */
const sbhBdWouldBreak = (src: RbSource, n: i32): boolean => {
  if (sbhBraces(src, n)) {
    return sbhBdLoopCondition(src, n);
  }
  const sn = src.a.kid(n, 0);
  return sbhCallArgs(src, sn).length > 0 && !ssxParenthesized(src, sn);
};

/** end_of_chain. */
const sbhBdEndOfChain = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  for (;;) {
    const t = src.a.type(n);
    if (t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_YIELD) {
      const b = sbhBlockNode(src, n);
      if (b !== V_NIL) {
        n = b;
        continue;
      }
    }
    if (!sbhChained(src, n)) {
      return n;
    }
    n = src.parent(n);
  }
};

/** move_comment_before_block. */
const sbhBdMoveComment = (src: RbSource, k: RbRewriter, ci: i32, block: i32, ce: i32): void => {
  const cs = src.commS[ci];
  const cEnd = src.commE[ci];
  const text = src.src(cs, cEnd);
  if (sbhDirectiveComment(text)) {
    return;
  }
  let rangeEnd = ce;
  if (sbhChained(src, block)) {
    rangeEnd = src.a.exE(sbhBdEndOfChain(src, src.parent(block)));
  }
  // source_range_before_comment: range.end.join(comment.begin), less its trailing whitespace.
  const preS = rangeEnd;
  let preE = cs;
  while (preE > preS && ssxIsSpace(src.at(preE - 1))) {
    preE--;
  }
  k.remove(cs, rbSpaceEnd(src, cEnd, 2, true, false, false));
  // remove_trailing_whitespace
  if (cs > preE) {
    let allWs = true;
    for (let p = preE; p < cs; p++) {
      if (!ssxIsSpace(src.at(p))) {
        allWs = false;
      }
    }
    if (allWs) {
      k.remove(preE, cs);
    }
  }
  k.insertAfter(preS, preE, "\n");
  k.insertBefore(src.a.exS(block), src.a.exE(block), `${text}\n`);
};

/** Style/BlockDelimiters. */
export class CopStyleBlockDelimiters {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/BlockDelimiters");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_YIELD) {
        this.onSend(src, n);
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        this.onBlock(src, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const args = sbhCallArgs(src, n);
    if (args.length === 0 || ssxParenthesized(src, n)) {
      return;
    }
    if (sbhAssignmentMethod(sbhMethodName(src, n))) {
      return;
    }
    if (sbhOperatorMethod(src, n) && args.length === 1 && sbhIsBlock(src, args[0])) {
      return;
    }
    for (const arg of args) {
      const blocks: i32[] = [];
      sbhBdGetBlocks(src, arg, blocks);
      for (const b of blocks) {
        this.ign.add(b);
      }
    }
  }

  private onBlock(src: RbSource, n: i32): void {
    if (this.ign.partOf(src, n)) {
      return;
    }
    if (sbhBdProper(src, n)) {
      return;
    }
    const bs = ssxFS(src, n, F_BEGIN);
    const be = ssxFE(src, n, F_BEGIN);
    const k = this.c.offense(bs, be);
    if (k === null) {
      return;
    }
    if (!sbhBdWouldBreak(src, n)) {
      if (sbhBraces(src, n)) {
        this.bracesToDoEnd(src, k, n);
      } else {
        this.doEndToBraces(src, k, n);
      }
    }
    this.ign.add(n);
    this.c.commit(k);
  }

  /** replace_braces_with_do_end. */
  private bracesToDoEnd(src: RbSource, k: RbRewriter, n: i32): void {
    const bs = ssxFS(src, n, F_BEGIN);
    const be = ssxFE(src, n, F_BEGIN);
    const es = ssxFS(src, n, F_END);
    const ee = ssxFE(src, n, F_END);
    if (!ssxIsSpace(src.at(bs - 1))) {
      k.insertBefore(bs, be, " ");
    }
    if (!ssxIsSpace(src.at(es - 1))) {
      k.insertBefore(es, ee, " ");
    }
    if (!ssxIsSpace(src.at(bs + 1))) {
      k.insertAfter(bs, be, " ");
    }
    k.replace(bs, be, "do");
    const ci = rbLayCommentAtLine(src, src.line(es));
    if (ci >= 0) {
      sbhBdMoveComment(src, k, ci, n, ee);
    }
    k.replace(es, ee, "end");
  }

  /** replace_do_end_with_braces (begin_required? needs a multiline block, which line_count_based never corrects to braces). */
  private doEndToBraces(src: RbSource, k: RbRewriter, n: i32): void {
    const bs = ssxFS(src, n, F_BEGIN);
    const be = ssxFE(src, n, F_BEGIN);
    if (!ssxIsSpace(src.at(bs + 2))) {
      k.insertAfter(bs, be, " ");
    }
    k.replace(bs, be, "{");
    k.replace(ssxFS(src, n, F_END), ssxFE(src, n, F_END), "}");
  }
}
