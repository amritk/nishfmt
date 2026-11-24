// google-java-format's AST cleanups (the --cleanup pass, on by default since
// 2.0.0), on the parsed text: redundant semicolons go (between top-level
// declarations, between class members, empty statements in blocks and
// switch groups), `@Foo()` becomes `@Foo`, and a single lambda parameter
// loses its parentheses. A semicolon alone on its line takes the line with it.
//
// Ported from google-java-format 2.0.0's CleanupScanner, Cleanups and Edit
// (Apache License 2.0, Copyright 2026 Google Inc.). nishfmt formats whole
// files, so every range the passes check is the whole file.

import { atI32, atU8 } from "../core/arr";
import { fault, faulted } from "../core/fault";
import { Out } from "../core/out";
import { gIsIdentPart } from "../gdoc/engine";
import { GInput, TF_COMMENT } from "../gdoc/input";
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
    const kind = t.kind;
    for (let n = 0; n < t.n; n++) {
      if (n >= kind.length) {
        fault();
        return false;
      }
      const k = kind[n];
      if (k === N_CLASS && (atI32(t.flags, n) & FL_IMPLICIT) === 0) {
        this.classSemicolons(inp, t, n);
      } else if (k === N_BLOCK) {
        this.emptyStatements(inp, t, atI32(t.a, n));
      } else if (k === N_CASE) {
        this.emptyStatements(inp, t, atI32(t.c, n));
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
    const delLo = this.delLo;
    const delHi = this.delHi;
    for (let i = 0; i < toI32(delLo.length); i++) {
      const lo = delLo[i];
      const hi = atI32(delHi, i);
      out.range(src, at, lo);
      // A space where deleting would join two identifiers (`@Anno()int x`).
      if (lo > 0 && hi < inp.n && gIsIdentPart(atU8(src, lo - 1)) && gIsIdentPart(atU8(src, hi))) {
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
    const delLo = this.delLo;
    const delHi = this.delHi;
    for (let i = 0; i < toI32(delLo.length); i++) {
      const a = delLo[i];
      if (i >= delHi.length) {
        fault();
        return;
      }
      const b = delHi[i];
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
    const delLo = this.delLo;
    const delHi = this.delHi;
    for (let i = 0; i < toI32(delLo.length); i++) {
      if (delLo[i] <= lo) {
        if (i >= delHi.length) {
          fault();
          return false;
        }
        if (hi <= delHi[i]) {
          return true;
        }
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
    const n = inp.n;
    if (semiPos < 0 || semiPos >= src.length) {
      // `src[semiPos]` is the `;` the scan found.
      fault();
      return;
    }
    // Both scans move down from `semiPos`, inside `src`.
    let start = semiPos;
    while (start > 0 && start <= src.length && isCleanupBlank(toI32(src[start - 1]))) {
      start--;
    }
    let lineBegin = start;
    while (
      lineBegin > 0 &&
      lineBegin <= src.length &&
      toI32(src[lineBegin - 1]) !== 10 &&
      toI32(src[lineBegin - 1]) !== 13
    ) {
      lineBegin--;
    }
    let end = semiPos + 1;
    while (end < n) {
      if (end >= src.length) {
        fault();
        return;
      }
      if (!isCleanupBlank(toI32(src[end]))) {
        break;
      }
      end++;
    }
    const nothingBeforeOnLine = start === lineBegin || this.deletionEncloses(lineBegin, start);
    if (nothingBeforeOnLine && end < n) {
      const c = atU8(src, end);
      if (c === 13) {
        end++;
        if (end < n && atU8(src, end) === 10) {
          end++;
        }
      } else if (c === 10) {
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
    const kTok = inp.kTok;
    const tPos = inp.tPos;
    for (let k = tokenAtOrAfter(inp, start); k < inp.nTokens; k++) {
      if (k < 0 || k >= kTok.length) {
        fault();
        return;
      }
      const tok = kTok[k];
      if (tok < 0 || tok >= tPos.length) {
        fault();
        return;
      }
      const p = tPos[tok];
      if (p >= end) {
        break;
      }
      if (!inp.is(tok, ";")) {
        continue;
      }
      const sLo = spanLo;
      const sHi = spanHi;
      while (s < toI32(sLo.length)) {
        if (s < 0 || s >= sHi.length) {
          fault();
          return;
        }
        if (sHi[s] > p) {
          break;
        }
        s++;
      }
      let covered = false;
      for (let q = s; q < toI32(sLo.length); q++) {
        if (q < 0 || q >= sHi.length) {
          fault();
          return;
        }
        if (sLo[q] > p) {
          break;
        }
        if (p < sHi[q]) {
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
    const pkg = atI32(t.b, cu);
    if (pkg >= 0) {
      // The package declaration, up to its `;`.
      let k = tokenAtOrAfter(inp, atI32(t.end, pkg));
      while (k < inp.nTokens && !inp.is(atI32(inp.kTok, k), ";")) {
        if (faulted()) {
          return;
        }
        k++;
      }
      if (k < inp.nTokens) {
        lo.push(0);
        hi.push(atI32(inp.tEnd, atI32(inp.kTok, k)));
      }
    }
    const mod = atI32(t.e, cu);
    if (mod >= 0) {
      lo.push(atI32(t.start, mod));
      hi.push(atI32(t.end, mod));
    }
    const imports = atI32(t.c, cu);
    for (let i = 0; i < t.len(imports); i++) {
      const d = t.at(imports, i);
      lo.push(atI32(t.start, d));
      hi.push(atI32(t.end, d));
    }
    const decls = atI32(t.d, cu);
    for (let i = 0; i < t.len(decls); i++) {
      const d = t.at(decls, i);
      if ((atI32(t.flags, d) & FL_IMPLICIT) !== 0) {
        // An implicitly declared class: its members.
        const members = atI32(t.f, d);
        for (let j = 0; j < t.len(members); j++) {
          const m = t.at(members, j);
          lo.push(atI32(t.start, m));
          hi.push(memberEnd(inp, t, m));
        }
      } else {
        lo.push(atI32(t.start, d));
        hi.push(atI32(t.end, d));
      }
    }
    this.semicolonsInGaps(inp, 0, inp.n, lo, hi);
  }

  /** checkClassSemicolons: the semicolons between a class's members (an enum's `;` after its constants stays). */
  private classSemicolons(inp: GInput, t: JTree, c: i32): void {
    const members = atI32(t.f, c);
    // An anonymous class body starts at its `{` here (javac starts it at the
    // call), so the call's arguments, which CleanupScanner adds as spans, are
    // never in the range.
    const classStart = atI32(t.start, c);
    const classEnd = atI32(t.end, c);
    const lo: i32[] = [];
    const hi: i32[] = [];
    let lastEnumConstantEnd = classStart;
    let firstNonEnumMemberStart = classEnd;
    const isEnum = atI32(t.op, c) === CK_ENUM;
    for (let i = 0; i < t.len(members); i++) {
      const m = t.at(members, i);
      const ms = atI32(t.start, m);
      const me = memberEnd(inp, t, m);
      lo.push(ms);
      hi.push(me);
      if (isEnum) {
        if (atI32(t.kind, m) === N_VARIABLE && (atI32(t.flags, m) & FL_ENUM) !== 0) {
          lastEnumConstantEnd = me > lastEnumConstantEnd ? me : lastEnumConstantEnd;
        } else if (ms < firstNonEnumMemberStart) {
          firstNonEnumMemberStart = ms;
        }
      }
    }
    if (isEnum && lo.length > 0) {
      for (let k = tokenAtOrAfter(inp, lastEnumConstantEnd); k < inp.nTokens; k++) {
        const tok = atI32(inp.kTok, k);
        if (atI32(inp.tPos, tok) >= firstNonEnumMemberStart || faulted()) {
          break;
        }
        if (inp.is(tok, ";")) {
          lo.push(atI32(inp.tPos, tok));
          hi.push(atI32(inp.tEnd, tok));
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
      if (atI32(t.kind, s) === N_EMPTY) {
        this.deleteSemicolon(inp, atI32(t.start, s));
      }
    }
  }

  /** visitAnnotation: `@Foo()` becomes `@Foo`, unless a comment is in the parentheses. */
  private annotationParens(inp: GInput, t: JTree, n: i32): void {
    if (t.len(atI32(t.b, n)) !== 0) {
      return;
    }
    const typeEnd = atI32(t.end, atI32(t.a, n));
    const annoEnd = atI32(t.end, n);
    if (typeEnd <= 0 || annoEnd <= typeEnd || hasComment(inp, typeEnd, annoEnd)) {
      return;
    }
    this.addDeletion(typeEnd, annoEnd);
  }

  /** visitLambdaExpression: `(x) ->` becomes `x ->` when the one parameter has no type. */
  private lambdaParens(inp: GInput, t: JTree, n: i32): void {
    if (t.len(atI32(t.a, n)) !== 1) {
      return;
    }
    const k = tokenAtOrAfter(inp, atI32(t.start, n));
    if (k < 0 || toI64(k) + toI64(2) >= toI64(inp.nTokens)) {
      return;
    }
    const lp = atI32(inp.kTok, k);
    if (!inp.is(lp, "(")) {
      return;
    }
    // `k + 2 < nTokens`, so the conversion is exact.
    const rp = atI32(inp.kTok, toI32(toI64(k) + toI64(2)));
    if (!inp.is(rp, ")")) {
      return;
    }
    if (hasComment(inp, atI32(inp.tPos, lp), atI32(inp.tEnd, rp))) {
      return;
    }
    this.addDeletion(atI32(inp.tPos, lp), atI32(inp.tEnd, lp));
    this.addDeletion(atI32(inp.tPos, rp), atI32(inp.tEnd, rp));
  }
}

/**
 * The comments of `inp`'s text, in order, as one string; CleanupScanner's
 * verifyCommentsPreserved compares them before and after the deletions.
 */
export const cleanupComments = (inp: GInput): string => {
  const parts: string[] = [];
  for (let t = 0; t < inp.nToks; t++) {
    if ((atI32(inp.tFlags, t) & TF_COMMENT) !== 0) {
      parts.push(inp.text(t));
    }
  }
  return parts.join("\u0000");
};

/** Where member `m` ends: javac ends the last declarator of a field at its `;`. */
const memberEnd = (inp: GInput, t: JTree, m: i32): i32 => {
  const me = atI32(t.end, m);
  if (atI32(t.kind, m) === N_VARIABLE && (atI32(t.flags, m) & FL_ENUM) === 0) {
    const k = tokenAtOrAfter(inp, me);
    if (k < inp.nTokens) {
      const tok = atI32(inp.kTok, k);
      if (inp.is(tok, ";")) {
        return atI32(inp.tEnd, tok);
      }
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
  const kTok = inp.kTok;
  const tPos = inp.tPos;
  while (k > 0) {
    if (k > kTok.length) {
      fault();
      return 0;
    }
    const tok = kTok[k - 1];
    if (tok < 0 || tok >= tPos.length) {
      fault();
      return 0;
    }
    if (tPos[tok] < pos) {
      break;
    }
    k--;
  }
  const nTokens = inp.nTokens;
  while (k < nTokens) {
    if (k < 0 || k >= kTok.length) {
      fault();
      return 0;
    }
    const tok = kTok[k];
    if (tok < 0 || tok >= tPos.length) {
      fault();
      return 0;
    }
    if (tPos[tok] >= pos) {
      break;
    }
    k++;
  }
  return k;
};

const isCleanupBlank = (c: i32): boolean => c === 32 || c === 9;

/** Whether `[a, e)`, which holds only punctuation, an identifier, whitespace and comments, holds a comment. */
const hasComment = (inp: GInput, a: i32, e: i32): boolean => {
  const src = inp.src;
  for (let i = a; i < e; i++) {
    if (i < 0 || i >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[i]) === 47) {
      return true;
    }
  }
  return false;
};

/** Sorts the spans by start (an insertion sort: they are nearly in order). */
const sortSpans = (lo: i32[], hi: i32[]): void => {
  for (let i = 1; i < toI32(lo.length); i++) {
    if (i >= hi.length) {
      fault();
      return;
    }
    const a = lo[i];
    const b = hi[i];
    // Shifts `[j + 1, i)` up one; every index is below `i`.
    let j = i - 1;
    while (j >= 0 && j < i && lo[j] > a) {
      const j1 = j + 1;
      if (j1 >= lo.length || j1 >= hi.length) {
        fault();
        return;
      }
      lo[j1] = lo[j];
      hi[j1] = hi[j];
      j--;
    }
    const j1 = j + 1;
    if (j1 < 0 || j1 >= lo.length || j1 >= hi.length) {
      fault();
      return;
    }
    lo[j1] = a;
    hi[j1] = b;
  }
};
