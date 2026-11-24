// RuboCop::Cop::PrecedingFollowingAlignment (AllowForAlignment: true) for
// Layout/SpaceAroundOperators and Layout/SpaceBeforeFirstArg: whether a range
// lines up with a token on a neighbouring line. One instance per
// investigation (the mixin memoizes per cop instance).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_ASSIGNMENT, F_OPERATOR, NT_DEF, NT_OPTARG } from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { rnHas, rnS } from "../node";
import { RbSource, TK_COMMENT } from "../source";
import { TK_tEQ, TK_tEQL, TK_tEQQ, TK_tGEQ, TK_tLEQ, TK_tLSHFT, TK_tNEQ, TK_tOP_ASGN } from "../tables";
import { LspToks, lspIsWs } from "./layout_space_help";

/** ASSIGNMENT_OR_COMPARISON_TOKENS. */
export const lspAsgnOrCmp = (t: i32): boolean =>
  t === TK_tEQL ||
  t === TK_tEQ ||
  t === TK_tEQQ ||
  t === TK_tNEQ ||
  t === TK_tLEQ ||
  t === TK_tGEQ ||
  t === TK_tOP_ASGN ||
  t === TK_tLSHFT;

/** Token#equal_sign? */
const lspEqualSign = (t: i32): boolean => t === TK_tEQL || t === TK_tOP_ASGN;

// aligned_with_equals_sign results.
export const LSP_AL_NONE: i32 = 0;
export const LSP_AL_YES: i32 = 1;
export const LSP_AL_NO: i32 = 2;

/** Whether 1-based line `l` is exactly `text` (ASCII). */
const lspLineIs = (src: RbSource, l: i32, text: string): boolean => {
  const s = src.lineStart(l);
  const e = src.lineEnd(l);
  if (sub32(e, s) !== toI32(text.length)) {
    return false;
  }
  // e - s is text's length.
  let i = 0;
  for (let p = s; p < e && i >= 0 && i < text.length; p++) {
    if (src.at(p) !== text.charCodeAt(i)) {
      return false;
    }
    i++;
  }
  return true;
};

export class LspAlign {
  src: RbSource;
  tk: LspToks;
  // processed_source.lines.size (lines after a data `__END__` dropped).
  nLines: i32;
  commentLines: Set<i32>;
  haveAsgn: boolean = false;
  asgnLines: Set<i32>;
  interrupting: Set<i32>;

  constructor(src: RbSource, tk: LspToks) {
    this.src = src;
    this.tk = tk;
    let n = src.lineCount();
    const nt = toI32(src.tokT.length);
    const lastTokLine = nt > 0 ? src.line(atI32(src.tokS, nt - 1)) : n;
    for (let ix = 0; ix < n; ix++) {
      if (ix >= lastTokLine && lspLineIs(src, ix + 1, "__END__")) {
        n = ix;
        break;
      }
    }
    this.nLines = n;
    // aligned_comment_lines: comments that begin their line.
    this.commentLines = new Set<i32>();
    this.asgnLines = new Set<i32>();
    this.interrupting = new Set<i32>();
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const s = src.commS[i];
      const l = src.line(s);
      if (this.firstNonWs(sub32(l, 1)) === src.column(s)) {
        this.commentLines.add(l);
      }
    }
  }

  /** The length of 0-based line `l0`. */
  lineLen(l0: i32): i32 {
    const l = add32(l0, 1);
    return sub32(this.src.lineEnd(l), this.src.lineStart(l));
  }

  /** line =~ /\S/ on 0-based line `l0` (-1 for nil). */
  firstNonWs(l0: i32): i32 {
    const s = this.src.lineStart(add32(l0, 1));
    const e = add32(s, this.lineLen(l0));
    for (let p = s; p < e; p++) {
      if (!lspIsWs(this.src.at(p))) {
        return sub32(p, s);
      }
    }
    return -1;
  }

  /** ProcessedSource#line_indentation of 1-based line `l`. */
  indentation(l: i32): i32 {
    const s = this.src.lineStart(l);
    const e = add32(s, this.lineLen(sub32(l, 1)));
    let p = s;
    while (p < e && lspIsWs(this.src.at(p))) {
      p++;
    }
    return p > s ? sub32(p, s) : 0;
  }

  /** String#blank? of 1-based line `l`. */
  blank(l: i32): boolean {
    return this.firstNonWs(sub32(l, 1)) < 0;
  }

  /** range.source == line[col, size] on 0-based line `l0`. */
  private sameText(s: i32, e: i32, l0: i32, col: i32): boolean {
    const n = this.lineLen(l0);
    if (col < 0 || add32(col, sub32(e, s)) > n) {
      return false;
    }
    const ls = this.src.lineStart(add32(l0, 1));
    let q = add32(ls, col);
    for (let p = s; p < e; p++) {
      if (this.src.at(p) !== this.src.at(q)) {
        return false;
      }
      // q stays below ls + n, inside the line.
      if (q >= 2147483647) {
        fault();
        return false;
      }
      q++;
    }
    return true;
  }

  /** aligned_with_something?(range) */
  withSomething(s: i32, e: i32): boolean {
    return this.adjacent(s, e, false);
  }

  /** aligned_with_operator?(range) */
  withOperator(s: i32, e: i32): boolean {
    return this.adjacent(s, e, true);
  }

  /** aligned_with_adjacent_line? and aligned_with_any_line_range? */
  private adjacent(s: i32, e: i32, op: boolean): boolean {
    const line = this.src.line(s);
    const line2 = sub32(line, 2);
    if (this.withLine(line2, -1, s, e, -1, op) || this.withLine(line, 1, s, e, -1, op)) {
      return true;
    }
    const base = this.firstNonWs(sub32(line, 1));
    return this.withLine(line2, -1, s, e, base, op) || this.withLine(line, 1, s, e, base, op);
  }

  /** aligned_with_line? over 0-based lines from `from` in direction `dir` (`indent` -1 for nil). */
  private withLine(from: i32, dir: i32, s: i32, e: i32, indent: i32, op: boolean): boolean {
    // Every caller steps by one line.
    if (dir < -1 || dir > 1) {
      fault();
      return false;
    }
    const nl = this.nLines;
    let l0 = from;
    while (l0 >= 0 && l0 < nl) {
      const cur = l0;
      l0 += dir;
      if (this.commentLines.has(cur + 1)) {
        continue;
      }
      const index = this.firstNonWs(cur);
      if (index < 0) {
        continue;
      }
      if (indent >= 0) {
        if (index < indent) {
          break;
        }
        if (index > indent) {
          continue;
        }
      }
      if (op) {
        return this.sameText(s, e, cur, this.src.column(s)) || this.equalsOperator(s, e, cur + 1);
      }
      return this.words(s, e, cur) || this.equalsOperator(s, e, cur + 1);
    }
    return false;
  }

  /** aligned_words? */
  private words(s: i32, e: i32, l0: i32): boolean {
    const left = this.src.column(s);
    const n = this.lineLen(l0);
    const ls = this.src.lineStart(add32(l0, 1));
    if (left >= 1 && left < n) {
      const pl = add32(ls, left);
      if (lspIsWs(this.src.at(sub32(pl, 1))) && !lspIsWs(this.src.at(pl))) {
        return true;
      }
    }
    return this.sameText(s, e, l0, left);
  }

  /** aligned_equals_operator?(range, lineno) */
  equalsOperator(s: i32, e: i32, lineno: i32): boolean {
    const tk = this.tk;
    const from = tk.withinFrom(this.src.lineStart(lineno));
    const to = tk.withinTo(this.src.lineEnd(lineno));
    const tt = tk.t;
    let ti = -1;
    for (let i = from; i <= to; i++) {
      // withinFrom and withinTo answer token indexes.
      if (i < 0 || i >= tt.length) {
        fault();
        return false;
      }
      if (lspAsgnOrCmp(tt[i])) {
        ti = i;
        break;
      }
    }
    if (ti < 0) {
      return false;
    }
    const tType = atI32(tt, ti);
    const lastCol = this.src.column(e);
    const tokLastCol = this.src.column(atI32(tk.e, ti));
    const endsEq = e > s && this.src.at(sub32(e, 1)) === 61;
    // aligned_with_preceding_equals?
    if (endsEq && lastCol === tokLastCol) {
      return true;
    }
    // aligned_with_append_operator?
    const isAppend = sub32(e, s) === 2 && this.src.at(s) === 60 && this.src.at(add32(s, 1)) === 60;
    return ((isAppend && lspEqualSign(tType)) || (endsEq && tType === TK_tLSHFT)) && lastCol === tokLastCol;
  }

  /** assignment_lines and interrupting_operator_lines. */
  private assignments(): void {
    if (this.haveAsgn) {
      return;
    }
    this.haveAsgn = true;
    const src = this.src;
    const a = src.a;
    // remove_equals_in_def
    const ignore = new Set<i32>();
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF) {
        if (rnHas(src, n, F_ASSIGNMENT)) {
          ignore.add(rnS(src, n, F_ASSIGNMENT));
        }
      } else if (t === NT_OPTARG) {
        if (rnHas(src, n, F_OPERATOR)) {
          ignore.add(rnS(src, n, F_OPERATOR));
        }
      }
    }
    // first_operator_on_line (raw token order)
    const firstOp = new Map<i32, i32>();
    const tokT = src.tokT;
    const tokS = src.tokS;
    const nt = toI32(tokT.length);
    for (let i = 0; i < nt && i < tokT.length; i++) {
      const t = tokT[i];
      if (t !== TK_COMMENT && lspAsgnOrCmp(t)) {
        const l = src.line(atI32(tokS, i));
        if (!firstOp.has(l)) {
          firstOp.set(l, i);
        }
      }
    }
    // assignment_tokens: uniq by line, then the first operator of its line.
    const seen = new Set<i32>();
    for (let i = 0; i < nt && i < tokT.length; i++) {
      if (!lspEqualSign(tokT[i]) || ignore.has(atI32(tokS, i))) {
        continue;
      }
      const l = src.line(atI32(tokS, i));
      if (seen.has(l)) {
        continue;
      }
      seen.add(l);
      if ((firstOp.get(l) ?? -1) === i) {
        this.asgnLines.add(l);
      }
    }
    for (let i = 0; i < nt && i < tokT.length; i++) {
      if (lspAsgnOrCmp(tokT[i])) {
        const l = src.line(atI32(tokS, i));
        if (!this.asgnLines.has(l)) {
          this.interrupting.add(l);
        }
      }
    }
  }

  /** relevant_assignment_lines over 1-based lines from `first` in direction `dir`: the second hit (-1 for none). */
  private secondRelevant(first: i32, dir: i32): i32 {
    this.assignments();
    const origIndent = this.indentation(first);
    let atLevel = true;
    let count = 0;
    // Every caller steps by one line.
    if (dir < -1 || dir > 1) {
      fault();
      return -1;
    }
    const nl = this.nLines;
    // A line count, below the largest i32.
    if (nl >= 2147483647) {
      fault();
      return -1;
    }
    let l = first;
    while (l >= 1 && l <= nl) {
      const cur = l;
      l += dir;
      const ind = this.indentation(cur);
      const blank = this.blank(cur);
      if ((cur !== first && this.interrupting.has(cur)) || (ind < origIndent && !blank) || (atLevel && blank)) {
        break;
      }
      if (this.asgnLines.has(cur) && ind === origIndent) {
        // The second hit answers.
        if (count >= 1) {
          return cur;
        }
        count = 1;
      }
      if (!blank) {
        atLevel = ind === origIndent;
      }
    }
    return -1;
  }

  /** aligned_with_equals_sign(token, line_range): preceding (dir -1) or subsequent (dir 1). */
  withEqualsSign(s: i32, e: i32, dir: i32): i32 {
    const line = this.src.line(s);
    const tokIndent = this.indentation(line);
    const rel = this.secondRelevant(line, dir);
    if (rel < 0) {
      return LSP_AL_NONE;
    }
    if (this.indentation(rel) < tokIndent) {
      return LSP_AL_NONE;
    }
    if (rel > this.nLines) {
      return LSP_AL_NONE;
    }
    return this.equalsOperator(s, e, rel) ? LSP_AL_YES : LSP_AL_NO;
  }
}
