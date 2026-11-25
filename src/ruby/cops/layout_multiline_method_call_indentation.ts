// Layout/MultilineMethodCallIndentation (EnforcedStyle: aligned).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, sub32 } from "../../core/arr";
import {
  F_BEGIN,
  F_DOT,
  F_END,
  F_SELECTOR,
  NT_ARRAY,
  NT_BEGIN,
  NT_FOR,
  NT_HASH,
  NT_IF,
  NT_KWBEGIN,
  NT_PAIR,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnMethod, rnS } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  rmxArgumentInMethodCall,
  rmxAssignmentRhs,
  rmxCorrectIndentation,
  rmxGrouped,
  rmxIndentation,
  rmxInsideArgParens,
  rmxKwExpr,
  rmxKwNode,
  rmxLeftHandSide,
  rmxNotForThisCop,
  rmxOperatorMethod,
  rmxPartOfAssignmentRhs,
  rmxWithinNode,
} from "./layout_multiline_expr_help";
import {
  RmlAlignCorr,
  RmlRange,
  rmlBeginsItsLine,
  rmlDescendants,
  rmlIsBlock,
  rmlIsCall,
  rmlReceiver,
  rmlSingleLine,
  rmlTernary,
} from "./layout_multiline_help";

/** The begin of no range. */
const RMC_NONE_S: i32 = -1;

export class CopLayoutMultilineMethodCallIndentation {
  c: RbCop;
  corr: RmlAlignCorr | null = null;

  constructor() {
    this.c = new RbCop("Layout/MultilineMethodCallIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.corr = new RmlAlignCorr(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!rmlIsCall(src, n)) {
        continue;
      }
      const recv = a.kid(n, 0);
      if (recv === V_NIL || rnMethod(src, n) === "[]" || !rnHas(src, n, F_DOT)) {
        continue;
      }
      const lhs = rmxLeftHandSide(src, recv);
      const rhs = this.rightHandSide(src, n);
      if (rhs.s < 0) {
        continue;
      }
      const delta = this.offending(src, n, lhs, rhs);
      if (delta === 0) {
        continue;
      }
      const k = this.c.offense(rhs.s, rhs.e);
      if (k !== null) {
        this.autocorrect(src, k, n, rhs, delta);
        this.c.commit(k);
      }
    }
  }

  /** right_hand_side(send_node). */
  private rightHandSide(src: RbSource, n: i32): RmlRange {
    const ds = rnS(src, n, F_DOT);
    const de = rnE(src, n, F_DOT);
    const dot = src.src(ds, de);
    if (rnHas(src, n, F_SELECTOR)) {
      const ss = rnS(src, n, F_SELECTOR);
      const se = rnE(src, n, F_SELECTOR);
      if ((dot === "." || dot === "&.") && src.line(ds) === src.line(ss)) {
        return new RmlRange(ds < ss ? ds : ss, de > se ? de : se);
      }
      return new RmlRange(ss, se);
    }
    if (rnMethod(src, n) === "call" && rnHas(src, n, F_BEGIN)) {
      const bs = rnS(src, n, F_BEGIN);
      const be = rnE(src, n, F_BEGIN);
      return new RmlRange(ds < bs ? ds : bs, de > be ? de : be);
    }
    return new RmlRange(RMC_NONE_S, RMC_NONE_S);
  }

  /** offending_range: the column delta of an offense, or 0. */
  private offending(src: RbSource, n: i32, lhs: i32, rhs: RmlRange): i32 {
    if (!rmlBeginsItsLine(src, rhs.s)) {
      return 0;
    }
    const pair = this.findPairAncestor(src, n);
    if (pair !== V_NIL) {
      return this.hashPairIndentation(src, n, lhs, rhs);
    }
    if (rmxNotForThisCop(src, n)) {
      return 0;
    }
    // check_regular_indentation
    const base = this.alignmentBase(src, n, rhs);
    const col = base >= 0 ? src.column(base) : add32(rmxIndentation(src, lhs), rmxCorrectIndentation(src, n));
    return sub32(col, src.column(rhs.s));
  }

  /** find_pair_ancestor (V_NIL for none). */
  private findPairAncestor(src: RbSource, n: i32): i32 {
    const a = src.a;
    let child = n;
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_PAIR) {
        return p;
      }
      if (rmxGrouped(src, p) || rmxInsideArgParens(src, n, p)) {
        return V_NIL;
      }
      // inside_body?
      const t = a.type(p);
      if (rmlIsBlock(src, p)) {
        if (a.kid(p, 0) !== child) {
          return V_NIL;
        }
      } else if (t === NT_IF) {
        if (!rmlTernary(src, p)) {
          return V_NIL;
        }
      } else if (t === NT_KWBEGIN || t === NT_WHILE || t === NT_UNTIL || t === NT_FOR) {
        return V_NIL;
      }
      child = p;
      p = src.parent(p);
    }
    return V_NIL;
  }

  /** find_base_receiver. */
  private baseReceiver(src: RbSource, n0: i32): i32 {
    let n = n0;
    while (rmlReceiver(src, n) !== V_NIL) {
      n = rmlReceiver(src, n);
    }
    return n;
  }

  /** first_call_has_a_dot. */
  private firstCallWithDot(src: RbSource, n: i32): i32 {
    const base = this.baseReceiver(src, n);
    let p = src.parent(base);
    while (p !== V_NIL && !rnHas(src, p, F_DOT)) {
      p = src.parent(p);
    }
    return p;
  }

  /** The block node of a send (V_NIL for none). */
  private blockNode(src: RbSource, n: i32): i32 {
    const p = src.parent(n);
    if (p !== V_NIL && rmlIsBlock(src, p) && src.a.kid(p, 0) === n) {
      return p;
    }
    return V_NIL;
  }

  /** dot.join(selector) of a call: the start of the range (-1 for none). */
  private dotSel(src: RbSource, n: i32): i32 {
    if (!rnHas(src, n, F_DOT)) {
      return -1;
    }
    const ds = rnS(src, n, F_DOT);
    if (rnHas(src, n, F_SELECTOR)) {
      const ss = rnS(src, n, F_SELECTOR);
      return ds < ss ? ds : ss;
    }
    return ds;
  }

  /** Whether the rhs source starts with `.` or `&.`. */
  private dotRhs(src: RbSource, rhs: RmlRange): boolean {
    const c = src.at(rhs.s);
    return c === 46 || (c === 38 && rbAtOff(src, rhs.s, 1) === 46);
  }

  /** check_hash_pair_indentation: the delta, or 0. */
  private hashPairIndentation(src: RbSource, n: i32, lhs: i32, rhs: RmlRange): i32 {
    const a = src.a;
    // find_hash_pair_alignment_base
    let base = -1;
    const br = this.baseReceiver(src, a.kid(n, 0));
    if (br !== V_NIL && a.isNode(br) && a.type(br) === NT_HASH) {
      base = this.dotSel(src, this.firstCallWithDot(src, n));
    }
    if (base < 0 && this.insideMultilineChainArg(src, n)) {
      return 0;
    }
    if (base < 0) {
      base = this.firstDotAlignmentBase(src, n, rhs);
    }
    if (base < 0) {
      base = a.exS(lhs);
    }
    // aligned_with_first_line_dot?
    if (this.dotRhs(src, rhs)) {
      const fc = this.firstCallWithDot(src, n);
      if (fc !== a.kid(n, 0)) {
        const d = rnS(src, fc, F_DOT);
        if (src.line(d) === src.line(a.exS(n)) && src.column(d) === src.column(rhs.s)) {
          return 0;
        }
      }
    }
    return sub32(src.column(base), src.column(rhs.s));
  }

  /** first_dot_alignment_base (-1 for none). */
  private firstDotAlignmentBase(src: RbSource, n: i32, rhs: RmlRange): i32 {
    const a = src.a;
    if (!this.dotRhs(src, rhs)) {
      return -1;
    }
    const fc = this.firstCallWithDot(src, n);
    if (fc === V_NIL || !rnHas(src, fc, F_DOT) || fc === n) {
      return -1;
    }
    // after_multiline_block_base
    const bn = this.blockNode(src, fc);
    if (bn !== V_NIL && !rmlSingleLine(src, bn)) {
      const ab = src.parent(bn);
      if (ab !== V_NIL && rmlIsCall(src, ab) && rnHas(src, ab, F_DOT) && ab !== n) {
        return this.dotSel(src, ab);
      }
    }
    const d = rnS(src, fc, F_DOT);
    if (src.line(d) !== src.line(a.exS(a.kid(fc, 0)))) {
      return -1;
    }
    return this.dotSel(src, fc);
  }

  /** inside_multiline_chain_arg? */
  private insideMultilineChainArg(src: RbSource, n: i32): boolean {
    const a = src.a;
    const pair = this.findPairAncestor(src, n);
    const hash = src.parent(pair);
    if (hash === V_NIL) {
      return false;
    }
    const call = src.parent(hash);
    if (call === V_NIL || !rmlIsCall(src, call) || a.kid(call, 0) === hash || !rnHas(src, call, F_DOT)) {
      return false;
    }
    if (!rnHas(src, call, F_SELECTOR)) {
      return false;
    }
    return src.line(rnS(src, call, F_SELECTOR)) !== src.line(a.exS(a.kid(call, 0)));
  }

  /** alignment_base for the aligned style (-1 for none). */
  private alignmentBase(src: RbSource, n: i32, rhs: RmlRange): i32 {
    const s = this.semanticBase(src, n, rhs);
    if (s >= 0) {
      return s;
    }
    return this.syntacticBase(src, n, rhs);
  }

  /** syntactic_alignment_base (-1 for none). */
  private syntacticBase(src: RbSource, n: i32, rhs: RmlRange): i32 {
    const a = src.a;
    const kw = rmxKwNode(src, n);
    if (kw !== V_NIL) {
      return a.exS(rmxKwExpr(src, kw));
    }
    const asg = rmxPartOfAssignmentRhs(src, n, rhs.s, rhs.e);
    if (asg !== V_NIL) {
      return a.exS(rmxAssignmentRhs(src, asg));
    }
    // operation_rhs
    const recv = a.kid(n, 0);
    let p = src.parent(recv);
    while (p !== V_NIL) {
      if (
        a.type(p) === NT_SEND &&
        rmxOperatorMethod(rnMethod(src, p)) &&
        a.nKid(p) > 2 &&
        rmxWithinNode(src, recv, a.kid(p, 2))
      ) {
        return a.exS(a.kid(p, 2));
      }
      p = src.parent(p);
    }
    return -1;
  }

  /** semantic_alignment_base (-1 for none). */
  private semanticBase(src: RbSource, n: i32, rhs: RmlRange): i32 {
    if (!this.dotRhs(src, rhs)) {
      return -1;
    }
    const m = this.semanticNode(src, n);
    if (m === V_NIL || !rnHas(src, m, F_SELECTOR) || !rnHas(src, m, F_DOT)) {
      return -1;
    }
    return this.dotSel(src, m);
  }

  /** semantic_alignment_node (V_NIL for none). */
  private semanticNode(src: RbSource, n: i32): i32 {
    if (rmxArgumentInMethodCall(src, n, true) !== V_NIL) {
      return V_NIL;
    }
    // get_dot_right_above
    const nd = rnS(src, n, F_DOT);
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (rnHas(src, p, F_DOT)) {
        const d = rnS(src, p, F_DOT);
        if (toI64(src.line(d)) === toI64(src.line(nd)) - toI64(1) && src.column(d) === src.column(nd)) {
          return p;
        }
      }
      p = src.parent(p);
    }
    const mb = this.multilineBlockChainNode(src, n);
    if (mb !== V_NIL) {
      return mb;
    }
    return this.firstCallAlignmentNode(src, n);
  }

  /** unwrap_block_node. */
  private unwrap(src: RbSource, n: i32): i32 {
    return n !== V_NIL && rmlIsBlock(src, n) ? src.a.kid(n, 0) : n;
  }

  /** single_line_block_receiver? */
  private singleLineBlockReceiver(src: RbSource, r: i32): boolean {
    return r !== V_NIL && src.a.isNode(r) && rmlIsBlock(src, r) && rmlSingleLine(src, r);
  }

  /** leftmost_call_on_same_line. */
  private leftmost(src: RbSource, n: i32): i32 {
    let cur = this.unwrap(src, n);
    while (true) {
      if (!rmlIsCall(src, cur)) {
        break;
      }
      const r = this.unwrap(src, src.a.kid(cur, 0));
      if (r === V_NIL || !rmlIsCall(src, r) || !rnHas(src, r, F_DOT) || !rnHas(src, cur, F_DOT)) {
        break;
      }
      if (src.line(rnS(src, r, F_DOT)) !== src.line(rnS(src, cur, F_DOT))) {
        break;
      }
      cur = r;
    }
    return cur;
  }

  /** find_multiline_block_chain_node (V_NIL for none). */
  private multilineBlockChainNode(src: RbSource, n: i32): i32 {
    const a = src.a;
    const recv = a.kid(n, 0);
    const bn = this.blockNode(src, n);
    if (bn !== V_NIL) {
      // find_continuation_node
      if (this.singleLineBlockReceiver(src, recv)) {
        return this.leftmost(src, recv);
      }
      if (!rmlIsCall(src, recv) || !rnHas(src, recv, F_DOT)) {
        return V_NIL;
      }
      const rr = a.kid(recv, 0);
      if (rr !== V_NIL && a.type(rr) === NT_BEGIN && rmlSingleLine(src, bn)) {
        return recv;
      }
      if (!(src.line(rnS(src, recv, F_DOT)) > src.line(a.exE(rr)))) {
        return V_NIL;
      }
      return recv;
    }
    // handle_descendant_block
    if (this.singleLineBlockReceiver(src, recv)) {
      return this.leftmost(src, recv);
    }
    const ds: i32[] = [];
    rmlDescendants(src, n, ds);
    let blk = V_NIL;
    for (const d of ds) {
      if (rmlIsBlock(src, d)) {
        blk = d;
        break;
      }
    }
    if (blk === V_NIL || rmlSingleLine(src, blk)) {
      return V_NIL;
    }
    return rmlIsCall(src, recv) ? recv : src.parent(blk);
  }

  /** first_call_alignment_node (V_NIL for none). */
  private firstCallAlignmentNode(src: RbSource, n0: i32): i32 {
    const a = src.a;
    const n = this.firstCallWithDot(src, n0);
    if (n === V_NIL) {
      return V_NIL;
    }
    const br = this.baseReceiver(src, n);
    const d = rnS(src, n, F_DOT);
    if (br !== V_NIL && a.isNode(br) && src.line(d) === src.line(a.exE(br)) && a.type(br) === NT_ARRAY) {
      return n;
    }
    if (src.line(d) !== src.line(a.exS(n))) {
      return V_NIL;
    }
    if (br !== V_NIL && a.isNode(br) && src.line(d) === src.line(a.exE(br)) && a.type(br) === NT_BEGIN) {
      return V_NIL;
    }
    return n;
  }

  /** autocorrect(corrector, range). */
  private autocorrect(src: RbSource, k: RbRewriter, n: i32, rhs: RmlRange, delta: i32): void {
    const corr = this.corr;
    if (corr === null) {
      return;
    }
    const bn = this.blockNode(src, n);
    if (bn === V_NIL) {
      corr.correct(k, rhs.s, rhs.e, delta);
      return;
    }
    // correct_selector_only and correct_block
    const sl = src.line(rhs.s);
    corr.correct(k, src.lineStart(sl), src.lineEnd(sl), delta);
    const lines: i32[] = [];
    const body = src.a.kid(bn, 2);
    if (body !== V_NIL) {
      for (let l = src.line(src.a.exS(body)); l <= src.line(src.a.exE(body)) && l < 1073741823; l++) {
        lines.push(l);
      }
    }
    const el = src.line(rnS(src, bn, F_END));
    let dup = false;
    for (const l of lines) {
      if (l === el) {
        dup = true;
      }
    }
    if (!dup) {
      lines.push(el);
    }
    for (const l of lines) {
      if (l !== sl) {
        corr.correct(k, src.lineStart(l), src.lineEnd(l), delta);
      }
    }
  }
}
