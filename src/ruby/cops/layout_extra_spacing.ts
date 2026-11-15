// Layout/ExtraSpacing (AllowForAlignment: true, AllowBeforeTrailingComments:
// false, ForceEqualSignAlignment: false), with the alignment_lines part of
// PrecedingFollowingAlignment that LspAlign does not have.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
const rmlEsKey = (col: i32, t: i32): i64 => (toI64(col) << 32) | toI64(t + 16);

/** The number of distinct values in `xs`. */
const rmlEsDistinct = (xs: i32[]): i32 => {
  const s = new Set<i32>();
  for (const x of xs) {
    s.add(x);
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
    const nt = toI32(src.tokT.length);
    for (let i = 0; i + 1 < nt; i++) {
      if (src.tokT[i + 1] === TK_tNL) {
        continue;
      }
      // extra_space_range
      if (src.line(src.tokS[i]) !== src.line(src.tokS[i + 1])) {
        continue;
      }
      const s = src.tokE[i];
      const e = src.tokS[i + 1] - 1;
      if (e <= s) {
        continue;
      }
      if (st.alignedTok(i, i + 1)) {
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
    for (let i = 0; i + 1 < toI32(src.commS.length); i++) {
      if (src.column(src.commS[i]) === src.column(src.commS[i + 1])) {
        this.alignedComments.add(src.line(src.commS[i]));
        this.alignedComments.add(src.line(src.commS[i + 1]));
      }
    }
    this.byLine = new Map<i32, i32[]>();
    for (let i = 0; i < toI32(src.tokT.length); i++) {
      const l = src.line(src.tokS[i]);
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
    for (let i = 0; i < toI32(this.ignS.length); i++) {
      if (pos >= this.ignS[i] && pos < this.ignE[i]) {
        return true;
      }
    }
    return false;
  }

  /** aligned_tok?(previous_token, token) for token indexes. */
  alignedTok(pi: i32, ti: i32): boolean {
    const src = this.src;
    const t = src.tokT[ti];
    if (t === TK_COMMENT) {
      return this.alignedComments.has(src.line(src.tokS[ti]));
    }
    if (!this.al.withSomething(src.tokS[ti], src.tokE[ti])) {
      return false;
    }
    return lspAsgnOrCmp(t) || this.spacingVaries(pi, ti);
  }

  /** spacing_varies? */
  private spacingVaries(pi: i32, ti: i32): boolean {
    const src = this.src;
    const line = src.line(src.tokS[ti]);
    const prof = this.profile(line);
    const col = src.column(src.tokS[ti]);
    const ent = prof.typed.get(rmlEsKey(col, src.tokT[ti])) ?? -1;
    const entries = prof.byCol.get(col);
    const nEntries = entries === undefined ? 0 : toI32(entries.length) / 2;
    if (ent >= 0 && toI32(prof.tLines[ent].length) > 1) {
      // uniform_alignment_allowed?
      const v = prof.verdicts.get(ent);
      if (v !== undefined) {
        return v;
      }
      const r = rmlEsDistinct(prof.tSpacings[ent]) > 1 || this.otherColumn(prof, col, prof.tLines[ent]);
      prof.verdicts.set(ent, r);
      return r;
    }
    if (nEntries > 1 && entries !== undefined) {
      const sp: i32[] = [];
      for (let i = 1; i < toI32(entries.length); i += 2) {
        sp.push(entries[i]);
      }
      return rmlEsDistinct(sp) > 1;
    }
    // nearest_spacing_varies?
    const spacing = src.tokS[ti] - src.tokE[pi];
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
      const shared: i32[] = [];
      for (let i = 0; i + 1 < toI32(entries.length); i += 2) {
        if (set.has(entries[i])) {
          shared.push(entries[i + 1]);
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
    while (l >= 1 && l <= last) {
      const cur = l;
      l += dir;
      if (this.boundary.has(cur)) {
        break;
      }
      if (this.al.commentLines.has(cur)) {
        continue;
      }
      // spacing_before_token_at
      const toks = this.byLine.get(cur);
      if (toks === undefined) {
        continue;
      }
      let idx = -1;
      for (let i = 0; i < toI32(toks.length); i++) {
        if (src.column(src.tokS[toks[i]]) === col) {
          idx = i;
          break;
        }
      }
      if (idx <= 0) {
        continue;
      }
      const other = src.tokS[toks[idx]] - src.tokE[toks[idx - 1]];
      return other !== spacing;
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
    for (const l of this.groups[g]) {
      const toks = this.byLine.get(l);
      if (toks === undefined) {
        continue;
      }
      for (let i = 1; i < toI32(toks.length); i++) {
        const prev = toks[i - 1];
        const tok = toks[i];
        const spacing = src.tokS[tok] - src.tokE[prev];
        const col = src.column(src.tokS[tok]);
        const bc = p.byCol.get(col);
        if (bc === undefined) {
          const ys: i32[] = [l, spacing];
          p.byCol.set(col, ys);
          p.cols.push(col);
        } else {
          bc.push(l);
          bc.push(spacing);
        }
        const key = rmlEsKey(col, src.tokT[tok]);
        let ent = p.typed.get(key) ?? -1;
        if (ent < 0) {
          ent = toI32(p.tLines.length);
          p.typed.set(key, ent);
          const nl: i32[] = [];
          const ns: i32[] = [];
          p.tLines.push(nl);
          p.tSpacings.push(ns);
        }
        p.tLines[ent].push(l);
        p.tSpacings[ent].push(spacing);
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
    // sort
    for (let i = 1; i < toI32(lines.length); i++) {
      const x = lines[i];
      let j = i - 1;
      while (j >= 0 && lines[j] > x) {
        lines[j + 1] = lines[j];
        j--;
      }
      lines[j + 1] = x;
    }
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
    while (l >= 1 && l <= this.nLines) {
      const cur = l;
      l += dir;
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
