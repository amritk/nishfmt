// Layout/ExtraSpacing (AllowForAlignment: true, AllowBeforeTrailingComments:
// false, ForceEqualSignAlignment: false), with the alignment_lines part of
// PrecedingFollowingAlignment that LspAlign does not have.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { stableSort } from "../../core/sort";
import { NT_PAIR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource, TK_COMMENT } from "../source";
import { TK_tNL } from "../tables";
import { LspAlign, lspAsgnOrCmp } from "./layout_space_align";
import { LspToks } from "./layout_space_help";
import { rmlIsDef, rmlSingleLine } from "./layout_multiline_help";

/** One alignment group's spacing profile (build_group_profile). */
class RmlEsProfile {
  // by_column: column -> [line, spacing, line, spacing, ...]
  byCol: Map<i32, i32[]>;
  cols: i32[];
  // typed: (column, type) -> entry; the entries' lines and spacings
  typed: Map<i64, i32>;
  tLines: i32[][];
  tSpacings: i32[][];
  // @alignment_verdicts by typed entry
  verdicts: Map<i32, boolean>;

  constructor() {
    this.byCol = new Map<i32, i32[]>();
    this.cols = [];
    this.typed = new Map<i64, i32>();
    this.tLines = [];
    this.tSpacings = [];
    this.verdicts = new Map<i32, boolean>();
  }
}

/** The key of a (column, token type) pair. */
const rmlEsKey = (col: i32, t: i32): i64 => (toI64(col) << 32) | (toI64(t) + toI64(16));

/** The number of distinct values in `xs`. */
const rmlEsDistinct = (xs: i32[]): i32 => {
  const s = new Set<i32>();
  for (const x of xs) {
    s.add(x);
  }
  return toI32(s.size);
};

/** distinct_spacings(entries).count(&:positive?) over [line, spacing, ...] pairs. */
const rmlEsPositiveDistinct = (entries: i32[]): i32 => {
  const s = new Set<i32>();
  // The odd slots: the spacings.
  for (let i = 1; i < entries.length; i++) {
    if ((i & 1) === 0) {
      continue;
    }
    const v = entries[i];
    if (v > 0) {
      s.add(v);
    }
  }
  return toI32(s.size);
};

export class CopLayoutExtraSpacing {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/ExtraSpacing");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.root === V_NIL) {
      return;
    }
    const st = new RmlEsState(src);
    const tokT = src.tokT;
    const tokS = src.tokS;
    const tokE = src.tokE;
    // Each token `j` after the first, with `i` the one before it.
    for (let j = 1; j < tokT.length; j++) {
      const i = j - 1;
      if (tokT[j] === TK_tNL) {
        continue;
      }
      if (j >= tokS.length || i >= tokS.length) {
        fault();
        return;
      }
      const si = tokS[i];
      const sj = tokS[j];
      // extra_space_range
      if (src.line(si) !== src.line(sj)) {
        continue;
      }
      if (i >= tokE.length) {
        fault();
        return;
      }
      const s = tokE[i];
      const e64 = toI64(sj) - toI64(1);
      if (e64 < toI64(-2147483648)) {
        fault();
        return;
      }
      const e = toI32(e64);
      if (e <= s) {
        continue;
      }
      if (st.alignedTok(i, j)) {
        continue;
      }
      if (st.ignored(s)) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(s, e);
        this.c.commit(k);
      }
    }
  }
}

/** The per-investigation state of Layout/ExtraSpacing. */
class RmlEsState {
  src: RbSource;
  al: LspAlign;
  nLines: i32;
  alignedComments: Set<i32>;
  byLine: Map<i32, i32[]>;
  boundary: Set<i32>;
  // @alignment_lines_by_line: line -> group
  groupOf: Map<i32, i32>;
  groups: i32[][];
  profiles: Map<i32, RmlEsProfile>;
  haveIgn: boolean = false;
  ignS: i32[];
  ignE: i32[];

  constructor(src: RbSource) {
    this.src = src;
    this.al = new LspAlign(src, new LspToks(src));
    this.nLines = this.al.nLines;
    // aligned_locations(comments)
    this.alignedComments = new Set<i32>();
    const commS = src.commS;
    for (let j = 1; j < commS.length; j++) {
      const a = commS[j - 1];
      const b = commS[j];
      if (src.column(a) === src.column(b)) {
        this.alignedComments.add(src.line(a));
        this.alignedComments.add(src.line(b));
      }
    }
    this.byLine = new Map<i32, i32[]>();
    const tokT = src.tokT;
    const tokS = src.tokS;
    for (let i = 0; i < tokT.length; i++) {
      if (i >= tokS.length) {
        fault();
        break;
      }
      const l = src.line(tokS[i]);
      const xs = this.byLine.get(l);
      if (xs === undefined) {
        const ys: i32[] = [i];
        this.byLine.set(l, ys);
      } else {
        xs.push(i);
      }
    }
    this.boundary = new Set<i32>();
    for (const n of src.pre) {
      if (rmlIsDef(src, n)) {
        this.boundary.add(src.line(src.a.exS(n)));
        this.boundary.add(src.line(src.a.exE(n)));
      }
    }
    this.groupOf = new Map<i32, i32>();
    this.groups = [];
    this.profiles = new Map<i32, RmlEsProfile>();
    this.ignS = [];
    this.ignE = [];
  }

  /** ignored_range?(ast, start_pos) */
  ignored(pos: i32): boolean {
    const src = this.src;
    if (!this.haveIgn) {
      this.haveIgn = true;
      for (const n of src.pre) {
        if (src.a.type(n) !== NT_PAIR) {
          continue;
        }
        const p = src.parent(n);
        if (p !== V_NIL && rmlSingleLine(src, p)) {
          continue;
        }
        this.ignS.push(src.a.exE(src.a.kid(n, 0)));
        this.ignE.push(src.a.exS(src.a.kid(n, 1)));
      }
    }
    const ignS = this.ignS;
    const ignE = this.ignE;
    // The two grow together.
    for (let i = 0; i < ignS.length && i < ignE.length; i++) {
      if (pos >= ignS[i] && pos < ignE[i]) {
        return true;
      }
    }
    return false;
  }

  /** aligned_tok?(previous_token, token) for token indexes. */
  alignedTok(pi: i32, ti: i32): boolean {
    const src = this.src;
    const tokT = src.tokT;
    const tokS = src.tokS;
    const tokE = src.tokE;
    if (ti < 0 || ti >= tokT.length || ti >= tokS.length) {
      fault();
      return false;
    }
    const t = tokT[ti];
    const s = tokS[ti];
    if (t === TK_COMMENT) {
      return this.alignedComments.has(src.line(s));
    }
    if (ti >= tokE.length) {
      fault();
      return false;
    }
    if (!this.al.withSomething(s, tokE[ti])) {
      return false;
    }
    return lspAsgnOrCmp(t) || this.spacingVaries(pi, ti);
  }

  /** spacing_varies? */
  private spacingVaries(pi: i32, ti: i32): boolean {
    const src = this.src;
    const tokT = src.tokT;
    const tokS = src.tokS;
    if (ti < 0 || ti >= tokT.length || ti >= tokS.length) {
      fault();
      return false;
    }
    const tt = tokT[ti];
    const ts = tokS[ti];
    const line = src.line(ts);
    // A line number is at least 1 and below the file's length.
    if (line < 1 || line > 1073741823) {
      fault();
      return false;
    }
    const prof = this.profile(line);
    const col = src.column(ts);
    const ent = prof.typed.get(rmlEsKey(col, tt)) ?? -1;
    const entries = prof.byCol.get(col);
    const nEntries = entries === undefined ? 0 : toI32(entries.length) / 2;
    if (ent >= 0) {
      const tLines = prof.tLines;
      const tSpacings = prof.tSpacings;
      if (ent >= tLines.length || ent >= tSpacings.length) {
        fault();
        return false;
      }
      const ls = tLines[ent];
      const sps = tSpacings[ent];
      if (toI32(ls.length) > 1) {
        // uniform_alignment_allowed?
        const v = prof.verdicts.get(ent);
        if (v !== undefined) {
          return v;
        }
        // spacings.uniq.size > 1 || distinct_spacings(entries).count(&:positive?) > 1 ||
        //   aligned_on_other_column?
        const r =
          rmlEsDistinct(sps) > 1 ||
          (entries !== undefined && rmlEsPositiveDistinct(entries) > 1) ||
          this.otherColumn(prof, col, ls);
        prof.verdicts.set(ent, r);
        return r;
      }
    }
    if (nEntries > 1 && entries !== undefined) {
      const es: i32[] = entries;
      const sp: i32[] = [];
      // The odd slots: the spacings.
      for (let i = 1; i < es.length; i++) {
        if ((i & 1) !== 0) {
          sp.push(es[i]);
        }
      }
      return rmlEsDistinct(sp) > 1;
    }
    // nearest_spacing_varies?
    const tokE = src.tokE;
    if (pi < 0 || pi >= tokE.length) {
      fault();
      return false;
    }
    const sp64 = toI64(ts) - toI64(tokE[pi]);
    if (sp64 < toI64(-2147483648) || sp64 > toI64(2147483647)) {
      fault();
      return false;
    }
    const spacing = toI32(sp64);
    return this.nearestDiffers(line - 1, -1, col, spacing) || this.nearestDiffers(line + 1, 1, col, spacing);
  }

  /** aligned_on_other_column? */
  private otherColumn(prof: RmlEsProfile, col: i32, lines: i32[]): boolean {
    const set = new Set<i32>();
    for (const l of lines) {
      set.add(l);
    }
    for (const c of prof.cols) {
      const entries = prof.byCol.get(c);
      if (c === col || entries === undefined) {
        continue;
      }
      const es: i32[] = entries;
      const shared: i32[] = [];
      // The (line, spacing) pairs: `i` runs over the spacings.
      for (let i = 1; i < es.length; i++) {
        if ((i & 1) === 0) {
          continue;
        }
        const l = es[i - 1];
        const s = es[i];
        if (set.has(l)) {
          shared.push(s);
        }
      }
      if (rmlEsDistinct(shared) > 1) {
        return true;
      }
    }
    return false;
  }

  /** nearest_spacing_differs? over lines from `from` in direction `dir`. */
  private nearestDiffers(from: i32, dir: i32, col: i32, spacing: i32): boolean {
    const src = this.src;
    let l = from;
    const last = this.nLines;
    // A line count is far below this.
    if (last > 1073741823) {
      fault();
      return false;
    }
    while (l >= 1 && l <= last) {
      const cur = l;
      // `dir` is -1 or 1.
      if (dir < 0) {
        l--;
      } else {
        l++;
      }
      if (this.boundary.has(cur)) {
        break;
      }
      if (this.al.commentLines.has(cur)) {
        continue;
      }
      // spacing_before_token_at
      const found = this.byLine.get(cur);
      if (found === undefined) {
        continue;
      }
      const toks: i32[] = found;
      const tokS = src.tokS;
      const tokE = src.tokE;
      let idx = -1;
      for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk < 0 || tk >= tokS.length) {
          fault();
          return false;
        }
        if (src.column(tokS[tk]) === col) {
          idx = i;
          break;
        }
      }
      if (idx <= 0) {
        continue;
      }
      if (idx >= toks.length) {
        fault();
        return false;
      }
      const a = toks[idx];
      const b = toks[idx - 1];
      if (a < 0 || a >= tokS.length || b < 0 || b >= tokE.length) {
        fault();
        return false;
      }
      const other = toI64(tokS[a]) - toI64(tokE[b]);
      if (other < toI64(-2147483648) || other > toI64(2147483647)) {
        fault();
        return false;
      }
      return other !== toI64(spacing);
    }
    return false;
  }

  /** group_profile(line_number). */
  private profile(line: i32): RmlEsProfile {
    const g = this.alignmentLines(line);
    const have = this.profiles.get(g);
    if (have !== undefined) {
      return have;
    }
    const src = this.src;
    const p = new RmlEsProfile();
    const groups = this.groups;
    if (g < 0 || g >= groups.length) {
      fault();
      return p;
    }
    const tokT = src.tokT;
    const tokS = src.tokS;
    const tokE = src.tokE;
    for (const l of groups[g]) {
      const found = this.byLine.get(l);
      if (found === undefined) {
        continue;
      }
      const toks: i32[] = found;
      for (let i = 1; i < toks.length; i++) {
        const prev = toks[i - 1];
        const tok = toks[i];
        if (tok < 0 || tok >= tokS.length || tok >= tokT.length || prev < 0 || prev >= tokE.length) {
          fault();
          return p;
        }
        const ts = tokS[tok];
        const tt = tokT[tok];
        const sp64 = toI64(ts) - toI64(tokE[prev]);
        if (sp64 < toI64(-2147483648) || sp64 > toI64(2147483647)) {
          fault();
          return p;
        }
        const spacing = toI32(sp64);
        const col = src.column(ts);
        const bc = p.byCol.get(col);
        if (bc === undefined) {
          const ys: i32[] = [l, spacing];
          p.byCol.set(col, ys);
          p.cols.push(col);
        } else {
          bc.push(l);
          bc.push(spacing);
        }
        const key = rmlEsKey(col, tt);
        let ent = p.typed.get(key) ?? -1;
        const tLines = p.tLines;
        const tSpacings = p.tSpacings;
        if (ent < 0) {
          ent = toI32(tLines.length);
          p.typed.set(key, ent);
          const nl: i32[] = [];
          const ns: i32[] = [];
          tLines.push(nl);
          tSpacings.push(ns);
        }
        if (ent >= tLines.length || ent >= tSpacings.length) {
          fault();
          return p;
        }
        const tl = tLines[ent];
        const ts2 = tSpacings[ent];
        tl.push(l);
        ts2.push(spacing);
      }
    }
    this.profiles.set(g, p);
    return p;
  }

  /** alignment_lines(line_number): the group's index (memoized for every line of it). */
  private alignmentLines(line: i32): i32 {
    const have = this.groupOf.get(line);
    if (have !== undefined) {
      return have;
    }
    const seen = new Set<i32>();
    const lines: i32[] = [];
    this.relevant(line, -1, seen, lines);
    this.relevant(line, 1, seen, lines);
    // sort (any sort of numbers gives the one order)
    stableSort(lines, (a: i32, b: i32): i32 => (a > b ? 1 : 0));
    const g = toI32(this.groups.length);
    this.groups.push(lines);
    for (const l of lines) {
      this.groupOf.set(l, g);
    }
    return g;
  }

  /** relevant_lines over lines from `first` in direction `dir` with definition_boundary_lines. */
  private relevant(first: i32, dir: i32, seen: Set<i32>, out: i32[]): void {
    const al = this.al;
    const origIndent = al.indentation(first);
    let atLevel = true;
    let l = first;
    const last = this.nLines;
    // A line count is far below this.
    if (last > 1073741823) {
      fault();
      return;
    }
    while (l >= 1 && l <= last) {
      const cur = l;
      // `dir` is -1 or 1.
      if (dir < 0) {
        l--;
      } else {
        l++;
      }
      const ind = al.indentation(cur);
      const blank = al.blank(cur);
      if ((cur !== first && this.boundary.has(cur)) || (ind < origIndent && !blank) || (atLevel && blank)) {
        break;
      }
      if (!al.commentLines.has(cur) && ind === origIndent && !seen.has(cur)) {
        seen.add(cur);
        out.push(cur);
      }
      if (!blank) {
        atLevel = ind === origIndent;
      }
    }
  }
}
