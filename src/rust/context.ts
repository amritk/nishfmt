// RewriteContext and the snippet/span helpers rustfmt gets from its
// SnippetProvider and SpanUtils.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): rewrite.rs, source_map.rs, visitor.rs (SnippetProvider).

import { RsAst } from "./ast";
import { rsFindUncommented, rsFindUncommentedIn } from "./comment";
import { RsTokens } from "./lexer";
import { RsConfig } from "./shape";

/** What one formatting run over a source shares: the source, its tokens and AST, and failure flags. */
export class RsFile {
  src: u8[];
  n: i32;
  t: RsTokens;
  ast: RsAst;
  cfg: RsConfig;
  // Set when the port meets something it does not handle: the file is skipped.
  unsupported: boolean = false;
  why: string = "";
  // Set when a span helper did not find its needle (rustfmt would panic).
  broken: boolean = false;
  // recover_comment_removed kept a snippet (ErrorKind::LostComment).
  lostComment: boolean = false;
  // The byte offset of each line's start, built on first use.
  lineStarts: i32[];
  nLines: i32 = -1;
  constructor(src: u8[], n: i32, t: RsTokens, ast: RsAst, cfg: RsConfig) {
    this.src = src;
    this.n = n;
    this.t = t;
    this.ast = ast;
    this.cfg = cfg;
    this.lineStarts = [];
  }

  /** line_of_byte_pos: the 1-based line holding byte `pos`. */
  lineOf(pos: i32): i32 {
    if (this.nLines < 0) {
      this.lineStarts.push(0);
      for (let i = 0; i < this.n; i++) {
        if (toI32(this.src[i]) === 10) {
          this.lineStarts.push(i + 1);
        }
      }
      this.nLines = toI32(this.lineStarts.length);
    }
    let lo = 0;
    let hi = this.nLines - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= pos) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }
}

/** A visitor's skipped_range: inclusive 1-based line pairs. */
export class RsRanges {
  lo: i32[];
  hi: i32[];
  constructor() {
    this.lo = [];
    this.hi = [];
  }

  push(lo: i32, hi: i32): void {
    this.lo.push(lo);
    this.hi.push(hi);
  }

  append(o: RsRanges): void {
    for (let i = 0; i < o.lo.length; i++) {
      this.lo.push(o.lo[i]);
      this.hi.push(o.hi[i]);
    }
    o.lo = [];
    o.hi = [];
  }

  contains(line: i32): boolean {
    for (let i = 0; i < this.lo.length; i++) {
      if (this.lo[i] <= line && line <= this.hi[i]) {
        return true;
      }
    }
    return false;
  }
}

export class RsCtx {
  f: RsFile;
  ast: RsAst;
  cfg: RsConfig;
  insideMacro: boolean = false;
  useBlock: boolean = false;
  isIfElseBlock: boolean = false;
  isLoopBlock: boolean = false;
  forceOneLineChain: boolean = false;
  isMacroDef: boolean = false;
  macroRewriteFailure: boolean = false;
  // The skipped_range of the visitor this context came from.
  skipped: RsRanges;
  constructor(f: RsFile) {
    this.f = f;
    this.ast = f.ast;
    this.cfg = f.cfg;
    this.skipped = new RsRanges();
  }

  snippet(lo: i32, hi: i32): string {
    if (lo >= hi) {
      return "";
    }
    return String.fromBytes(this.f.src, lo, hi);
  }

  /** The snippet of node `n`'s span. */
  snip(n: i32): string {
    return this.snippet(this.ast.lo[n], this.ast.hi[n]);
  }

  /** The text of token `i`. */
  tokStr(i: i32): string {
    return this.snippet(this.f.t.lo[i], this.f.t.hi[i]);
  }

  budget(used: i32): i32 {
    const b = this.cfg.maxWidth - used;
    return b < 0 ? 0 : b;
  }

  unsupported(why: string): void {
    if (!this.f.unsupported) {
      this.f.unsupported = true;
      this.f.why = why;
    }
  }

  // ---- SpanUtils

  optSpanBefore(lo: i32, hi: i32, needle: string): i32 {
    if (lo >= hi) {
      return -1;
    }
    const k = rsFindUncommentedIn(this.f.src, lo, hi, needle);
    return k < 0 ? -1 : lo + k;
  }

  optSpanAfter(lo: i32, hi: i32, needle: string): i32 {
    const k = this.optSpanBefore(lo, hi, needle);
    return k < 0 ? -1 : k + toI32(needle.length);
  }

  spanBefore(lo: i32, hi: i32, needle: string): i32 {
    const k = this.optSpanBefore(lo, hi, needle);
    if (k < 0) {
      this.markBroken(lo, hi, needle);
      return lo;
    }
    return k;
  }

  markBroken(lo: i32, hi: i32, needle: string): void {
    if (!this.f.broken) {
      this.f.broken = true;
      this.f.why = `'${needle}' not in [${lo}, ${hi}): ${this.snippet(lo, hi < lo + 60 ? hi : lo + 60)}`;
    }
  }

  spanAfter(lo: i32, hi: i32, needle: string): i32 {
    const k = this.optSpanAfter(lo, hi, needle);
    if (k < 0) {
      this.markBroken(lo, hi, needle);
      return lo;
    }
    return k;
  }

  spanAfterLast(lo: i32, hi: i32, needle: string): i32 {
    const s = this.snippet(lo, hi);
    let off = 0;
    const m = toI32(needle.length);
    for (;;) {
      const k = rsFindUncommented(s.slice(off, toI32(s.length)), needle);
      if (k < 0) {
        break;
      }
      off += k + m;
    }
    return lo + off;
  }

  spanBeforeLast(lo: i32, hi: i32, needle: string): i32 {
    return this.spanAfterLast(lo, hi, needle) - 1;
  }

  /** A copy of this context with the same flags (RewriteContext is cloned in places). */
  clone(): RsCtx {
    const c = new RsCtx(this.f);
    c.insideMacro = this.insideMacro;
    c.useBlock = this.useBlock;
    c.isIfElseBlock = this.isIfElseBlock;
    c.isLoopBlock = this.isLoopBlock;
    c.forceOneLineChain = this.forceOneLineChain;
    c.isMacroDef = this.isMacroDef;
    c.skipped = this.skipped;
    return c;
  }
}
