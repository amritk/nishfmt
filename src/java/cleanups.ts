// google-java-format's AST cleanups (the --cleanup pass, on by default since
// 2.0.0), on the parsed text: redundant semicolons go (between top-level
// declarations, between class members, empty statements in blocks and
// switch groups), `@Foo()` becomes `@Foo`, and a single lambda parameter
// loses its parentheses. A semicolon alone on its line takes the line with it.
//
// Ported from google-java-format 2.0.0's CleanupScanner, Cleanups and Edit
// (Apache License 2.0, Copyright 2026 Google Inc.). nishfmt formats whole
// files, so every range the passes check is the whole file.

import { Out } from "../core/out";
import { gIsIdentPart } from "../gdoc/engine";
import { GInput } from "../gdoc/input";
import {
  CK_ENUM,
  FL_ENUM,
  FL_IMPLICIT,
  JTree,
  N_ANNOTATION,
  N_BLOCK,
  N_CASE,
  N_CLASS,
  N_EMPTY,
  N_LAMBDA,
  N_VARIABLE,
} from "./ast";

export class JavaCleanups {
  // activeDeletions, a RangeSet: disjoint [lo, hi) ranges in order, connected ones merged.
  delLo: i32[];
  delHi: i32[];

  constructor() {
    this.delLo = [];
    this.delHi = [];
  }

  /**
   * CleanupScanner.scan over the tree `root` of `inp`'s text, then the
   * deletions applied: writes the cleaned text into `out` and answers
   * whether anything changed.
   */
  run(inp: GInput, t: JTree, root: i32, out: Out): boolean {
    this.delLo = [];
    this.delHi = [];
    this.topLevelSemicolons(inp, t, root);
    for (let n = 0; n < t.n; n++) {
      const k = t.kind[n];
      if (k === N_CLASS && (t.flags[n] & FL_IMPLICIT) === 0) {
        this.classSemicolons(inp, t, n);
      } else if (k === N_BLOCK) {
        this.emptyStatements(inp, t, t.a[n]);
      } else if (k === N_CASE) {
        this.emptyStatements(inp, t, t.c[n]);
      } else if (k === N_ANNOTATION) {
        this.annotationParens(inp, t, n);
      } else if (k === N_LAMBDA) {
        this.lambdaParens(inp, t, n);
      }
    }
    if (this.delLo.length === 0) {
      return false;
    }
    const src = inp.src;
    out.n = 0;
    let at = 0;
    for (let i = 0; i < toI32(this.delLo.length); i++) {
      const lo = this.delLo[i];
      const hi = this.delHi[i];
      out.range(src, at, lo);
      // A space where deleting would join two identifiers (`@Anno()int x`).
      if (lo > 0 && hi < inp.n && gIsIdentPart(toI32(src[lo - 1])) && gIsIdentPart(toI32(src[hi]))) {
        out.byte(32);
      }
      at = hi;
    }
    out.range(src, at, inp.n);
    return true;
  }

  /** RangeSet.add: merges [lo, hi) with every range it overlaps or touches. */
  private addDeletion(lo0: i32, hi0: i32): void {
    let lo = lo0;
    let hi = hi0;
    const nLo: i32[] = [];
    const nHi: i32[] = [];
    let placed = false;
    for (let i = 0; i < toI32(this.delLo.length); i++) {
      const a = this.delLo[i];
      const b = this.delHi[i];
      if (b < lo) {
        nLo.push(a);
        nHi.push(b);
      } else if (a > hi) {
        if (!placed) {
          nLo.push(lo);
          nHi.push(hi);
          placed = true;
        }
        nLo.push(a);
        nHi.push(b);
      } else {
        lo = a < lo ? a : lo;
        hi = b > hi ? b : hi;
      }
    }
    if (!placed) {
      nLo.push(lo);
      nHi.push(hi);
    }
    this.delLo = nLo;
    this.delHi = nHi;
  }

  /** RangeSet.encloses([lo, hi)). */
  private deletionEncloses(lo: i32, hi: i32): boolean {
    for (let i = 0; i < toI32(this.delLo.length); i++) {
      if (this.delLo[i] <= lo && hi <= this.delHi[i]) {
        return true;
      }
    }
    return false;
  }

  /**
   * deleteRedundantSemicolon: the semicolon and the blanks around it, and its
   * line break too when nothing is left before it on its line.
   */
  private deleteSemicolon(inp: GInput, semiPos: i32): void {
    const src = inp.src;
    let start = semiPos;
    while (start > 0 && isCleanupBlank(toI32(src[start - 1]))) {
      start--;
    }
    let lineBegin = start;
    while (lineBegin > 0 && toI32(src[lineBegin - 1]) !== 10 && toI32(src[lineBegin - 1]) !== 13) {
      lineBegin--;
    }
    let end = semiPos + 1;
    while (end < inp.n && isCleanupBlank(toI32(src[end]))) {
      end++;
    }
    const nothingBeforeOnLine = start === lineBegin || this.deletionEncloses(lineBegin, start);
    if (nothingBeforeOnLine && end < inp.n) {
      if (toI32(src[end]) === 13) {
        end++;
        if (end < inp.n && toI32(src[end]) === 10) {
          end++;
        }
      } else if (toI32(src[end]) === 10) {
        end++;
      }
    }
    this.addDeletion(start, end);
  }

  /**
   * Deletes the `;` tokens in [start, end) outside the spans `spanLo`/`spanHi`
   * (sorted by start; they may overlap).
   */
  private semicolonsInGaps(inp: GInput, start: i32, end: i32, spanLo: i32[], spanHi: i32[]): void {
    sortSpans(spanLo, spanHi);
    let s = 0;
    for (let k = tokenAtOrAfter(inp, start); k < inp.nTokens; k++) {
      const tok = inp.kTok[k];
      const p = inp.tPos[tok];
      if (p >= end) {
        break;
      }
      if (!inp.is(tok, ";")) {
        continue;
      }
      while (s < toI32(spanLo.length) && spanHi[s] <= p) {
        s++;
      }
      let covered = false;
      for (let q = s; q < toI32(spanLo.length) && spanLo[q] <= p; q++) {
        if (p < spanHi[q]) {
          covered = true;
          break;
        }
      }
      if (!covered) {
        this.deleteSemicolon(inp, p);
      }
    }
  }

  /** checkTopLevelSemicolons: the semicolons between the package, the imports and the type declarations. */
  private topLevelSemicolons(inp: GInput, t: JTree, cu: i32): void {
    const lo: i32[] = [];
    const hi: i32[] = [];
    if (t.b[cu] >= 0) {
      // The package declaration, up to its `;`.
      let k = tokenAtOrAfter(inp, t.end[t.b[cu]]);
      while (k < inp.nTokens && !inp.is(inp.kTok[k], ";")) {
        k++;
      }
      if (k < inp.nTokens) {
        lo.push(0);
        hi.push(inp.tEnd[inp.kTok[k]]);
      }
    }
    if (t.e[cu] >= 0) {
      lo.push(t.start[t.e[cu]]);
      hi.push(t.end[t.e[cu]]);
    }
    for (let i = 0; i < t.len(t.c[cu]); i++) {
      const d = t.at(t.c[cu], i);
      lo.push(t.start[d]);
      hi.push(t.end[d]);
    }
    for (let i = 0; i < t.len(t.d[cu]); i++) {
      const d = t.at(t.d[cu], i);
      if ((t.flags[d] & FL_IMPLICIT) !== 0) {
        // An implicitly declared class: its members.
        for (let j = 0; j < t.len(t.f[d]); j++) {
          const m = t.at(t.f[d], j);
          lo.push(t.start[m]);
          hi.push(memberEnd(inp, t, m));
        }
      } else {
        lo.push(t.start[d]);
        hi.push(t.end[d]);
      }
    }
    this.semicolonsInGaps(inp, 0, inp.n, lo, hi);
  }

  /** checkClassSemicolons: the semicolons between a class's members (an enum's `;` after its constants stays). */
  private classSemicolons(inp: GInput, t: JTree, c: i32): void {
    const members = t.f[c];
    const classStart = t.start[c];
    const classEnd = t.end[c];
    const lo: i32[] = [];
    const hi: i32[] = [];
    let lastEnumConstantEnd = classStart;
    let firstNonEnumMemberStart = classEnd;
    const isEnum = t.op[c] === CK_ENUM;
    for (let i = 0; i < t.len(members); i++) {
      const m = t.at(members, i);
      const ms = t.start[m];
      const me = memberEnd(inp, t, m);
      lo.push(ms);
      hi.push(me);
      if (isEnum) {
        if (t.kind[m] === N_VARIABLE && (t.flags[m] & FL_ENUM) !== 0) {
          lastEnumConstantEnd = me > lastEnumConstantEnd ? me : lastEnumConstantEnd;
        } else if (ms < firstNonEnumMemberStart) {
          firstNonEnumMemberStart = ms;
        }
      }
    }
    if (isEnum && lo.length > 0) {
      for (let k = tokenAtOrAfter(inp, lastEnumConstantEnd); k < inp.nTokens; k++) {
        const tok = inp.kTok[k];
        if (inp.tPos[tok] >= firstNonEnumMemberStart) {
          break;
        }
        if (inp.is(tok, ";")) {
          lo.push(inp.tPos[tok]);
          hi.push(inp.tEnd[tok]);
          break;
        }
      }
    }
    this.semicolonsInGaps(inp, classStart, classEnd, lo, hi);
  }

  /** visitEmptyStatement: an empty statement in a block or a switch group goes. */
  private emptyStatements(inp: GInput, t: JTree, stats: i32): void {
    for (let i = 0; i < t.len(stats); i++) {
      const s = t.at(stats, i);
      if (t.kind[s] === N_EMPTY) {
        this.deleteSemicolon(inp, t.start[s]);
      }
    }
  }

  /** visitAnnotation: `@Foo()` becomes `@Foo`, unless a comment is in the parentheses. */
  private annotationParens(inp: GInput, t: JTree, n: i32): void {
    if (t.len(t.b[n]) !== 0) {
      return;
    }
    const typeEnd = t.end[t.a[n]];
    const annoEnd = t.end[n];
    if (typeEnd <= 0 || annoEnd <= typeEnd || hasComment(inp, typeEnd, annoEnd)) {
      return;
    }
    this.addDeletion(typeEnd, annoEnd);
  }

  /** visitLambdaExpression: `(x) ->` becomes `x ->` when the one parameter has no type. */
  private lambdaParens(inp: GInput, t: JTree, n: i32): void {
    if (t.len(t.a[n]) !== 1) {
      return;
    }
    const k = tokenAtOrAfter(inp, t.start[n]);
    if (k + 2 >= inp.nTokens || !inp.is(inp.kTok[k], "(") || !inp.is(inp.kTok[k + 2], ")")) {
      return;
    }
    const lp = inp.kTok[k];
    const rp = inp.kTok[k + 2];
    if (hasComment(inp, inp.tPos[lp], inp.tEnd[rp])) {
      return;
    }
    this.addDeletion(inp.tPos[lp], inp.tEnd[lp]);
    this.addDeletion(inp.tPos[rp], inp.tEnd[rp]);
  }
}

/** Where member `m` ends: javac ends the last declarator of a field at its `;`. */
const memberEnd = (inp: GInput, t: JTree, m: i32): i32 => {
  const me = t.end[m];
  if (t.kind[m] === N_VARIABLE && (t.flags[m] & FL_ENUM) === 0) {
    const k = tokenAtOrAfter(inp, me);
    if (k < inp.nTokens && inp.is(inp.kTok[k], ";")) {
      return inp.tEnd[inp.kTok[k]];
    }
  }
  return me;
};

/** The first token (an index into `kTok`) at or after `pos`, or nTokens. */
const tokenAtOrAfter = (inp: GInput, pos: i32): i32 => {
  let k = inp.tokenAt(pos);
  if (k < 0) {
    k = 0;
  }
  while (k > 0 && inp.tPos[inp.kTok[k - 1]] >= pos) {
    k--;
  }
  while (k < inp.nTokens && inp.tPos[inp.kTok[k]] < pos) {
    k++;
  }
  return k;
};

const isCleanupBlank = (c: i32): boolean => c === 32 || c === 9;

/** Whether `[a, e)`, which holds only punctuation, an identifier, whitespace and comments, holds a comment. */
const hasComment = (inp: GInput, a: i32, e: i32): boolean => {
  for (let i = a; i < e; i++) {
    if (toI32(inp.src[i]) === 47) {
      return true;
    }
  }
  return false;
};

/** Sorts the spans by start (an insertion sort: they are nearly in order). */
const sortSpans = (lo: i32[], hi: i32[]): void => {
  for (let i = 1; i < toI32(lo.length); i++) {
    const a = lo[i];
    const b = hi[i];
    let j = i - 1;
    while (j >= 0 && lo[j] > a) {
      lo[j + 1] = lo[j];
      hi[j + 1] = hi[j];
      j--;
    }
    lo[j + 1] = a;
    hi[j + 1] = b;
  }
};
