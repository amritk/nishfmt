// Layout/EmptyLineAfterGuardClause: an empty line after a guard clause.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbByteAt } from "../util";
import { add32, atI32 } from "../../core/arr";
import {
  F_END,
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_KEYWORD,
  NT_AND,
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_CSEND,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_DSTR,
  NT_IF,
  NT_INDEX,
  NT_INDEXASGN,
  NT_KWBEGIN,
  NT_LAMBDA,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_RETURN,
  NT_SEND,
  NT_STR,
  NT_SUPER,
  NT_XSTR,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbLine, rnE, rnFieldSrc, rnHas, rnHeredoc, rnS } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  RbLayLines,
  rbLayCommentAtLine,
  rbLayDirectiveEnabled,
  rbLayHasAt,
  rbLayRxSpace,
  rbLayWordByte,
} from "./layout_empty_help";

/** A heredoc str, dstr or xstr. */
const rbGuardHeredoc = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, n);
};

/** IfNode#if_branch. */
const rbGuardIfBranch = (src: RbSource, n: i32): i32 => {
  const unless = rnHas(src, n, F_KEYWORD) && rnFieldSrc(src, n, F_KEYWORD) === "unless";
  return src.a.kid(n, unless ? 2 : 1);
};

/** `{(send nil? {:raise :fail} ...) return break next}`. */
const rbGuardBranchType = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_RETURN || t === NT_BREAK || t === NT_NEXT) {
    return true;
  }
  if (t !== NT_SEND || a.kid(n, 0) !== V_NIL) {
    return false;
  }
  const m = a.text(a.kid(n, 1));
  return m === "raise" || m === "fail";
};

/** Node#guard_clause?: match_guard_clause? of the node (of the rhs of and/or). */
const rbGuardClause = (src: RbSource, n0: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n0)) {
    return false;
  }
  const t0 = a.type(n0);
  const n = t0 === NT_AND || t0 === NT_OR ? a.kid(n0, 1) : n0;
  return rbGuardBranchType(src, n) && src.line(a.exS(n)) === src.line(a.exE(n));
};

/** SIMPLECOV_COMMENT_PATTERN: /\A#\s*(?::nocov:|simplecov\s*:\s*(?:disable|enable)\b)/. */
const rbGuardSimplecov = (text: string): boolean => {
  const k = toI32(text.length);
  if (k === 0 || rbByteAt(text, 0) !== 35) {
    return false;
  }
  let p = 1;
  while (p >= 0 && p < k && rbLayRxSpace(text.charCodeAt(p))) {
    p++;
  }
  if (rbLayHasAt(text, p, ":nocov:")) {
    return true;
  }
  if (!rbLayHasAt(text, p, "simplecov")) {
    return false;
  }
  p = add32(p, 9);
  while (p >= 0 && p < k && rbLayRxSpace(text.charCodeAt(p))) {
    p++;
  }
  if (p < 0 || p >= k || text.charCodeAt(p) !== 58) {
    return false;
  }
  p++;
  while (p >= 0 && p < k && rbLayRxSpace(text.charCodeAt(p))) {
    p++;
  }
  let w = 0;
  if (rbLayHasAt(text, p, "disable")) {
    w = 7;
  } else if (rbLayHasAt(text, p, "enable")) {
    w = 6;
  } else {
    return false;
  }
  const q = add32(p, w);
  return q >= k || !rbLayWordByte(rbByteAt(text, q));
};

export class CopLayoutEmptyLineAfterGuardClause {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLineAfterGuardClause");
  }

  // RuboCop raised in this node's callback (nil.blank?, nil.and_type?): no offense.
  crash: boolean = false;

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF) {
        continue;
      }
      this.crash = false;
      this.onIf(src, L, n);
    }
  }

  private onIf(src: RbSource, L: RbLayLines, node: i32): void {
    const a = src.a;
    if (this.correctStyle(src, node)) {
      return;
    }
    // multiple_statements_on_line? (correct_style? leaves only a begin or
    // kwbegin parent, with a right sibling).
    const sib = this.rightSibling(src, node);
    if (src.line(a.exE(node)) === src.line(a.exS(sib))) {
      return;
    }
    const kw = rnHas(src, node, F_KEYWORD) ? rnFieldSrc(src, node, F_KEYWORD) : "";
    const modifier = (kw === "if" || kw === "unless") && !rnHas(src, node, F_END);
    const lastLine = src.line(a.exE(node));
    if (modifier) {
      const h = this.lastHeredoc(src, node);
      if (this.crash) {
        return;
      }
      if (h !== V_NIL) {
        const bodyLines = rbLine(src, rnE(src, h, F_HEREDOC_BODY)) - rbLine(src, rnS(src, h, F_HEREDOC_BODY));
        const hl = add32(add32(lastLine, bodyLines), 1);
        if (this.nextLineEmptyOrDirective(src, L, hl) || this.crash) {
          return;
        }
        const k = this.c.offense(rnS(src, h, F_HEREDOC_END), rnE(src, h, F_HEREDOC_END));
        if (k !== null) {
          this.autocorrect(src, L, k, rnS(src, h, F_HEREDOC_BODY), rnE(src, h, F_HEREDOC_BODY));
          this.c.commit(k);
        }
        return;
      }
    }
    if (this.nextLineEmptyOrDirective(src, L, lastLine) || this.crash) {
      return;
    }
    let os = a.exS(node);
    let oe = a.exE(node);
    if (rnHas(src, node, F_END)) {
      os = rnS(src, node, F_END);
      oe = rnE(src, node, F_END);
    }
    const k = this.c.offense(os, oe);
    if (k !== null) {
      this.autocorrect(src, L, k, a.exS(node), a.exE(node));
      this.c.commit(k);
    }
  }

  /** Corrects by a newline after the whole lines of [s, e) (or the directive comment after them). */
  private autocorrect(src: RbSource, L: RbLayLines, k: RbRewriter, s: i32, e: i32): void {
    let rs = L.start(src.line(s));
    let re = L.end(src.line(e));
    const cm = this.allowedDirective(src, rbLine(src, e) + 1);
    if (cm >= 0) {
      rs = atI32(src.commS, cm);
      re = atI32(src.commE, cm);
    }
    k.insertAfter(rs, re, "\n");
  }

  /** Node#right_sibling (V_NIL when none). */
  private rightSibling(src: RbSource, n: i32): i32 {
    const p = src.parent(n);
    if (p === V_NIL) {
      return V_NIL;
    }
    const a = src.a;
    for (let i = 0; i < a.nKid(p); i++) {
      if (a.kid(p, i) === n) {
        return a.kid(p, i + 1);
      }
    }
    return V_NIL;
  }

  private correctStyle(src: RbSource, node: i32): boolean {
    const a = src.a;
    const br = rbGuardIfBranch(src, node);
    if (br === V_NIL || !rbGuardClause(src, br)) {
      return true;
    }
    const par = src.parent(node);
    if (par === V_NIL || (a.type(par) !== NT_BEGIN && a.type(par) !== NT_KWBEGIN)) {
      return true;
    }
    const sib = this.rightSibling(src, node);
    if (!a.isNode(sib)) {
      return true;
    }
    // next_sibling_empty_or_guard_clause?
    if (a.type(sib) === NT_IF) {
      const sb = rbGuardIfBranch(src, sib);
      if (sb !== V_NIL && (rbGuardClause(src, sb) || rbGuardBranchType(src, sb))) {
        return true;
      }
    }
    return false;
  }

  /** processed_source[line].blank? (a nil line raises in RuboCop). */
  private blankLine(L: RbLayLines, line: i32): boolean {
    if (!L.has(line)) {
      this.crash = true;
      return false;
    }
    return L.blank(line);
  }

  /** The comment on `line` when it is an enable directive or a simplecov one, or -1. */
  private allowedDirective(src: RbSource, line: i32): i32 {
    const cm = rbLayCommentAtLine(src, line);
    if (cm < 0) {
      return -1;
    }
    const text = src.src(atI32(src.commS, cm), atI32(src.commE, cm));
    return rbLayDirectiveEnabled(text) || rbGuardSimplecov(text) ? cm : -1;
  }

  private nextLineEmptyOrDirective(src: RbSource, L: RbLayLines, line: i32): boolean {
    if (this.blankLine(L, line)) {
      return true;
    }
    if (this.crash) {
      return false;
    }
    const next = add32(line, 1);
    return this.allowedDirective(src, next) >= 0 && this.blankLine(L, next);
  }

  /** use_heredoc_in_condition?: a heredoc among the condition's descendants. */
  private heredocBelow(src: RbSource, n: i32): boolean {
    const a = src.a;
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      if (!a.isNode(c)) {
        continue;
      }
      if (rbGuardHeredoc(src, c) || this.heredocBelow(src, c)) {
        return true;
      }
    }
    return false;
  }

  /** last_heredoc_argument. */
  private lastHeredoc(src: RbSource, n0: i32): i32 {
    const a = src.a;
    // last_heredoc_argument_node
    let n = n0;
    if (a.isNode(n0) && a.type(n0) === NT_IF) {
      const br = rbGuardIfBranch(src, n0);
      if (br === V_NIL) {
        this.crash = true;
        return V_NIL;
      }
      if (a.type(br) === NT_AND) {
        n = a.kid(br, 0);
      } else if (this.heredocBelow(src, a.kid(n0, 0))) {
        n = a.kid(n0, 0);
      } else {
        n = a.kid(br, -1);
      }
    }
    while (a.isNode(n) && a.type(n) === NT_BEGIN) {
      n = a.kid(n, 0);
    }
    if (rbGuardHeredoc(src, n)) {
      return n;
    }
    if (!a.isNode(n)) {
      return V_NIL;
    }
    // n.arguments (V_NIL when the node does not respond to it).
    const t = a.type(n);
    let from = -1;
    let holder = n;
    if (t === NT_SEND || t === NT_CSEND) {
      from = 2;
    } else if (t === NT_INDEX || t === NT_INDEXASGN) {
      from = 1;
    } else if (t === NT_SUPER || t === NT_YIELD || t === NT_DEFINED_P || t === NT_ZSUPER || t === NT_LAMBDA) {
      from = 0;
    } else if (t === NT_DEF || t === NT_BLOCK) {
      holder = a.kid(n, 1);
      from = 0;
    } else if (t === NT_DEFS) {
      holder = a.kid(n, 2);
      from = 0;
    } else if (t === NT_NUMBLOCK) {
      holder = V_NIL;
      from = 0;
    } else if (t === NT_BREAK || t === NT_NEXT || t === NT_RETURN) {
      const f = a.kid(n, 0);
      if (a.isNode(f) && a.type(f) === NT_BEGIN) {
        holder = f;
      }
      from = 0;
    }
    if (from < 0) {
      return V_NIL;
    }
    if (holder !== V_NIL && a.isNode(holder)) {
      for (let i = from; i < a.nKid(holder); i++) {
        const r = this.lastHeredoc(src, a.kid(holder, i));
        if (this.crash) {
          return V_NIL;
        }
        if (r !== V_NIL) {
          return r;
        }
      }
    }
    // last_heredoc_argument(n.receiver) if n.respond_to?(:receiver)
    if (t === NT_SEND || t === NT_CSEND || t === NT_INDEX || t === NT_INDEXASGN || t === NT_DEFS) {
      return this.lastHeredoc(src, a.kid(n, 0));
    }
    return V_NIL;
  }
}
