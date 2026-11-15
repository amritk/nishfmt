// What the Layout spacing cops share: ProcessedSource#sorted_tokens and
// tokens_within over them, Token#space_before?/space_after?, and the
// SurroundingSpace and SpaceCorrector mixins.
//
// Ported from RuboCop 1.92.2 and rubocop-ast 1.51.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";

/** Ruby's /\s/: space, \t, \n, \v, \f, \r. */
export const lspIsWs = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** /[ \t]/. */
export const lspIsBlank = (c: i32): boolean => c === 32 || c === 9;

/** ProcessedSource#sorted_tokens: the tokens stably sorted by begin_pos. */
export class LspToks {
  t: i32[];
  v: string[];
  s: i32[];
  e: i32[];
  n: i32;

  constructor(src: RbSource) {
    // The sort is done once per source and shared (the arrays are read-only).
    src.sortTokens();
    this.n = toI32(src.tokT.length);
    this.t = src.sortT;
    this.v = src.sortV;
    this.s = src.sortS;
    this.e = src.sortE;
  }

  /** first_token_index: bsearch_index { begin_pos >= pos } (-1 for nil). */
  firstIdx(pos: i32): i32 {
    let lo = 0;
    let hi = this.n;
    let ok = false;
    while (lo < hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (this.s[mid] >= pos) {
        ok = true;
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ok ? lo : -1;
  }

  /** last_token_index: bsearch_index { end_pos >= pos } (-1 for nil). */
  lastIdx(pos: i32): i32 {
    let lo = 0;
    let hi = this.n;
    let ok = false;
    while (lo < hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (this.e[mid] >= pos) {
        ok = true;
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ok ? lo : -1;
  }

  /** The first index of tokens_within(s...e) (a nil bsearch is a beginless range). */
  withinFrom(s: i32): i32 {
    const i = this.firstIdx(s);
    return i < 0 ? 0 : i;
  }

  /** The last index of tokens_within(s...e) (inclusive; an empty slice when below withinFrom). */
  withinTo(e: i32): i32 {
    const i = this.lastIdx(e);
    return i < 0 ? this.n - 1 : i;
  }
}

/** Token#space_after?: /\G\s/ at the token's end. */
export const lspSpaceAfter = (src: RbSource, e: i32): boolean => lspIsWs(src.at(e));

/** Token#space_before?: /\G\s/ just before the token (at the token itself at offset 0). */
export const lspSpaceBefore = (src: RbSource, s: i32): boolean => lspIsWs(src.at(s === 0 ? s : s - 1));

/** SurroundingSpace#extra_space?: the whitespace next to the token is a space or a tab. */
export const lspExtraSpace = (src: RbSource, s: i32, e: i32, left: boolean): boolean => {
  if (left) {
    return lspIsBlank(src.at(e));
  }
  return lspIsBlank(src.at(s === 0 ? s : s - 1));
};

/** SurroundingSpace#reposition over [ \t] (and newlines when asked). */
export const lspReposition = (src: RbSource, pos0: i32, step: i32, newlines: boolean): i32 => {
  let pos = pos0;
  const off = step === -1 ? -1 : 0;
  while (true) {
    // Ruby's src[-1] is the last character.
    const i = pos + off;
    const c = i < 0 ? src.at(src.n + i) : src.at(i);
    if (lspIsBlank(c) || (newlines && c === 10)) {
      pos += step;
    } else {
      break;
    }
  }
  return pos < 0 ? 0 : pos;
};

/** Identity sets of nodes (ignore_node / ignored_node?). */
export class LspIgnored {
  nodes: Set<i32>;

  constructor() {
    this.nodes = new Set<i32>();
  }

  has(n: i32): boolean {
    return this.nodes.has(n);
  }

  add(n: i32): void {
    this.nodes.add(n);
  }
}

/** SpaceCorrector.remove_space for the delimiter tokens [ls, le) and [rs, re). */
export const lspRemoveSpace = (src: RbSource, k: RbRewriter, le: i32, rs: i32): void => {
  if (lspSpaceAfter(src, le)) {
    k.remove(le, lspReposition(src, le, 1, false));
  }
  if (lspSpaceBefore(src, rs)) {
    k.remove(lspReposition(src, rs, -1, false), rs);
  }
};

/**
 * SurroundingSpace#no_space_offenses with a SpaceCorrector.remove_space
 * autocorrect of the same delimiters (every no_space style cop of this batch).
 */
export const lspNoSpaceOffenses = (cop: RbCop, ign: LspIgnored, src: RbSource, node: i32, ls: i32, le: i32, rs: i32, re: i32, startOk: boolean, endOk: boolean): void => {
  if (lspExtraSpace(src, ls, le, true) && !startOk) {
    const k = cop.offense(le, lspReposition(src, le, 1, false));
    if (k !== null) {
      if (!ign.has(node)) {
        lspRemoveSpace(src, k, le, rs);
      }
      ign.add(node);
      cop.commit(k);
    }
  }
  if (!lspExtraSpace(src, rs, re, false) || endOk) {
    return;
  }
  const k = cop.offense(lspReposition(src, rs, -1, false), rs);
  if (k !== null) {
    if (!ign.has(node)) {
      lspRemoveSpace(src, k, le, rs);
    }
    ign.add(node);
    cop.commit(k);
  }
};

/** SurroundingSpace#empty_offenses with EnforcedStyleForEmptyBrackets: no_space. */
export const lspEmptyOffenses = (cop: RbCop, ls: i32, le: i32, rs: i32, re: i32): void => {
  if (le === rs) {
    return;
  }
  const k = cop.offense(ls, re);
  if (k !== null) {
    k.remove(le, rs);
    cop.commit(k);
  }
};

/** A range's source matches /\s/ somewhere. */
export const lspHasWs = (src: RbSource, s: i32, e: i32): boolean => {
  for (let i = s; i < e; i++) {
    if (lspIsWs(src.at(i))) {
      return true;
    }
  }
  return false;
};

/** A range's source matches /\S/ somewhere. */
export const lspHasNonWs = (src: RbSource, s: i32, e: i32): boolean => {
  for (let i = s; i < e; i++) {
    if (!lspIsWs(src.at(i))) {
      return true;
    }
  }
  return false;
};
