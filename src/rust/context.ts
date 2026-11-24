// RewriteContext and the snippet/span helpers rustfmt gets from its
// SnippetProvider and SpanUtils.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): rewrite.rs, source_map.rs, visitor.rs (SnippetProvider).

import { RsAst } from "./ast";
import { rsFindUncommented, rsFindUncommentedIn, rsSliceStr } from "./comment";
import { RsTokens } from "./lexer";
import { RsConfig } from "./shape";
import { add32, atI32, bytesText, sub32 } from "../core/arr";
import { fault } from "../core/fault";

/** `String.fromBytes(src, a, n)`, through the shared `bytesText`. */
export const rsBytesText = (src: u8[], a: i32, n: i32): string => bytesText(src, a, n);

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
  // The source `src[0, n)` as text: a snippet is a substring of it.
  text: string;
  constructor(src: u8[], n: i32, text: string, t: RsTokens, ast: RsAst, cfg: RsConfig) {
    this.src = src;
    this.n = n;
    this.text = text;
    this.t = t;
    this.ast = ast;
    this.cfg = cfg;
    this.lineStarts = [];
  }

  /** line_of_byte_pos: the 1-based line holding byte `pos`. */
  lineOf(pos: i32): i32 {
    const starts = this.lineStarts;
    if (this.nLines < 0) {
      const src = this.src;
      const n = this.n;
      starts.push(0);
      for (let i = 0; i < n && i < src.length; i++) {
        if (toI32(src[i]) === 10) {
          starts.push(i + 1);
        }
      }
      this.nLines = toI32(starts.length);
    }
    // `nLines` is the length of `lineStarts`, which holds line 1's start.
    const nl = this.nLines;
    if (nl < 1 || nl > starts.length) {
      fault();
      return 1;
    }
    let lo = 0;
    let hi = nl - 1;
    while (lo >= 0 && lo < hi && hi < starts.length) {
      // Both ends are below the table's length, so the sum is exact in u32.
      const mid = toI32((toU32(lo) + toU32(hi) + 1) >> 1);
      if (mid < 0 || mid >= starts.length) {
        fault();
        return 1;
      }
      if (starts[mid] <= pos) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    if (lo < 0 || lo >= starts.length) {
      fault();
      return 1;
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
    const los = o.lo;
    const his = o.hi;
    for (let i = 0; i < los.length; i++) {
      // `lo` and `hi` grow together.
      if (i >= his.length) {
        fault();
        return;
      }
      const l = los[i];
      const h = his[i];
      this.lo.push(l);
      this.hi.push(h);
    }
    o.lo = [];
    o.hi = [];
  }

  contains(line: i32): boolean {
    const los = this.lo;
    const his = this.hi;
    for (let i = 0; i < los.length; i++) {
      // `lo` and `hi` grow together.
      if (i >= his.length) {
        fault();
        return false;
      }
      if (los[i] <= line && line <= his[i]) {
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
    const s = this.f.text;
    // A span of the source, whose text the caller gave.
    if (lo < 0 || hi > toI32(s.length) || toI32(s.length) !== this.f.n) {
      fault();
      return "";
    }
    return s.substring(lo, hi);
  }

  /** The snippet of node `n`'s span. */
  snip(n: i32): string {
    return this.snippet(atI32(this.ast.lo, n), atI32(this.ast.hi, n));
  }

  /** The text of token `i`. */
  tokStr(i: i32): string {
    return this.snippet(atI32(this.f.t.lo, i), atI32(this.f.t.hi, i));
  }

  budget(used: i32): i32 {
    const b = sub32(this.cfg.maxWidth, used);
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
    return k < 0 ? -1 : add32(lo, k);
  }

  optSpanAfter(lo: i32, hi: i32, needle: string): i32 {
    const k = this.optSpanBefore(lo, hi, needle);
    return k < 0 ? -1 : add32(k, toI32(needle.length));
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
      this.f.why = `'${needle}' not in [${lo}, ${hi}): ${this.snippet(lo, hi < add32(lo, 60) ? hi : add32(lo, 60))}`;
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
      const k = rsFindUncommented(rsSliceStr(s, off, toI32(s.length)), needle);
      if (k < 0) {
        break;
      }
      // Offsets into a snippet, below 2^29.
      if (off < 0 || off > 536870911 || k > 536870911 || m < 0 || m > 536870911) {
        fault();
        break;
      }
      off += k + m;
    }
    return add32(lo, off);
  }

  spanBeforeLast(lo: i32, hi: i32, needle: string): i32 {
    return sub32(this.spanAfterLast(lo, hi, needle), 1);
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
