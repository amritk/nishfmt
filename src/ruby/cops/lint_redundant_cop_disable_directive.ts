// Lint/RedundantCopDisableDirective.
//
// RuboCop runs this cop apart from the others: after a file's inspection
// loop settles, the Runner hands it the offenses the other cops found in the
// last pass that it did not correct (offenses inside disabled ranges
// included), applies its corrections once, and runs the inspection loop again
// on the result (Runner#add_redundant_disables). It does not run at all under
// --only. So `run` does nothing; the team calls `runWith` instead.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  LDH_INF,
  LDH_NEG_INF,
  LdhAnalysis,
  LdhConfig,
  LdhDirective,
  LdhRegistry,
  ldhStrip,
} from "./lint_directive_help";
import { lrceIndex } from "./lint_redundant_cop_enable_directive";

const LRCD_MARKER: string = "DEPARTMENT";

/** The offenses to check: cop names and first/last lines. */
class LrcdOffenses {
  names: string[];
  l1: i32[];
  l2: i32[];
  // The cops whose offenses are all here (complete: every cop is).
  known: Set<string>;
  complete: boolean;

  constructor(complete: boolean) {
    this.names = [];
    this.l1 = [];
    this.l2 = [];
    this.known = new Set<string>();
    this.complete = complete;
  }

  /** range_with_offense? over the cops `pick` selects: true when none overlaps [b, e]. */
  noneIn(reg: LdhRegistry, b: i32, e: i32, cop: string, prefix: boolean): boolean {
    if (!this.complete) {
      // A cop the team did not run may have offenses here.
      for (const n of reg.names) {
        const sel = cop.length === 0 || (prefix ? n.startsWith(cop) : n === cop);
        if (sel && reg.enabled(n) && !this.known.has(n)) {
          return false;
        }
      }
    }
    const names = this.names;
    const l1 = this.l1;
    const l2 = this.l2;
    // The three grow together.
    for (let i = 0; i < names.length && i < l1.length && i < l2.length; i++) {
      const n = names[i];
      const first = l1[i];
      const last = l2[i];
      const sel = cop.length === 0 || (prefix ? n.startsWith(cop) : n === cop);
      if (sel && first <= e && last >= b) {
        return false;
      }
    }
    return true;
  }
}

/** String#gsub(needle, ''). */
const lrcdRemoveAll = (s: string, needle: string): string => {
  const k = toI32(needle.length);
  if (k === 0) {
    return s;
  }
  const out: string[] = [];
  let i = 0;
  while (true) {
    const j = s.indexOf(needle, i);
    if (j < 0) {
      out.push(s.substring(i, toI32(s.length)));
      break;
    }
    out.push(s.substring(i, j));
    // A match ends within `s`, so the u32 sum of the two is the true one.
    i = toI32(toU32(j) + toU32(k));
  }
  return out.join("");
};

/** Whether s matches /\A\s*,\s*\z/. */
const lrcdCommaOnly = (s: string): boolean => {
  let commas = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c === 44) {
      // Only whether there is exactly one counts.
      if (commas < 2) {
        commas++;
      }
    } else if (!(c === 32 || (c >= 9 && c <= 13))) {
      return false;
    }
  }
  if (commas !== 1) {
    return false;
  }
  return true;
};

export class CopLintRedundantCopDisableDirective {
  c: RbCop;

  // The registry, built on first use and kept across files.
  reg: LdhRegistry | null = null;

  constructor() {
    this.c = new RbCop("Lint/RedundantCopDisableDirective");
  }

  private registry(): LdhRegistry {
    const r = this.reg;
    if (r !== null) {
      return r;
    }
    const nr = new LdhRegistry();
    this.reg = nr;
    return nr;
  }

  /** In the team's registry pass: nothing (see the file comment). */
  run(src: RbSource): void {
    this.c.begin(src);
  }

  /**
   * on_new_investigation with offenses_to_check: the offenses in `cops`
   * (RbCop.offS/offE of the last pass, which corrected nothing). With
   * `complete` false, a directive naming an enabled cop that is not in `cops`
   * is never redundant.
   */
  runWith(src: RbSource, cops: RbCop[], complete: boolean): void {
    this.c.begin(src);
    const off = new LrcdOffenses(complete);
    for (const c of cops) {
      off.known.add(c.name);
      const offS = c.offS;
      const offE = c.offE;
      // The two grow together.
      for (let i = 0; i < offS.length && i < offE.length; i++) {
        const s = offS[i];
        const e = offE[i];
        off.names.push(c.name);
        off.l1.push(src.line(s));
        off.l2.push(src.line(e));
      }
    }
    const reg = this.registry();
    const cfg = new LdhConfig(src, reg);
    cfg.analyze();
    // redundant_cops: comment index -> cop names (insertion order).
    const rcDir: i32[] = [];
    const rcCops: string[][] = [];
    let self: LdhAnalysis | null = null;
    for (const an of cfg.cops) {
      if (an.name === "Lint/RedundantCopDisableDirective") {
        self = an;
      }
    }
    for (const an of cfg.cops) {
      const cop = an.name;
      if (reg.has(cop) && reg.pending(cop)) {
        continue;
      }
      const n = toI32(an.rb.length);
      // an.rb, an.re and an.rd grow together, and every directive index is
      // one of cfg.dirs': the guards that fault cannot fail.
      // each_already_disabled
      for (let i = 1; i < n; i++) {
        if (this.ignore(self, an, i)) {
          continue;
        }
        const rb = an.rb;
        const re = an.re;
        const rd = an.rd;
        if (i >= rb.length || i >= re.length || i >= rd.length) {
          fault();
          return;
        }
        if (re[i - 1] !== rb[i]) {
          continue;
        }
        const bi = rb[i];
        const ei = re[i];
        const ci = rd[i];
        if (ci < 0) {
          continue;
        }
        const dirs = cfg.dirs;
        if (ci >= dirs.length) {
          fault();
          return;
        }
        const d = dirs[ci];
        if (this.skipDirective(d) || d.disabledAll()) {
          continue;
        }
        let red = cop;
        if (this.departmentDisabled(reg, cop, d)) {
          red = this.redundantDepartment(reg, off, cop, bi, ei);
        }
        if (red.length > 0) {
          this.add(rcDir, rcCops, ci, red);
        }
      }
      // each_line_range
      for (let i = 0; i < n; i++) {
        if (this.ignore(self, an, i)) {
          continue;
        }
        const rb = an.rb;
        const re = an.re;
        const rd = an.rd;
        if (i >= rb.length || i >= re.length || i >= rd.length) {
          fault();
          return;
        }
        const bi = rb[i];
        const ei = re[i];
        const ci = rd[i];
        // expected_final_disable?
        if (reg.has(cop) && !reg.enabled(cop) && ei === LDH_INF) {
          continue;
        }
        if (ci < 0) {
          continue;
        }
        const dirs = cfg.dirs;
        if (ci >= dirs.length) {
          fault();
          return;
        }
        const d = dirs[ci];
        if (this.skipDirective(d)) {
          continue;
        }
        let red = "";
        if (d.disabledAll()) {
          let noNext = true;
          if (i + 1 < n) {
            const rb2 = an.rb;
            if (i + 1 >= rb2.length) {
              fault();
              return;
            }
            noNext = ei !== rb2[i + 1];
          }
          if (noNext && off.noneIn(reg, bi, ei, "", false)) {
            red = "all";
          }
        } else {
          // line_range_through_repeated_disables
          let el = ei;
          for (let j = i + 1; j >= 0 && j < n; j++) {
            const rb2 = an.rb;
            const rd2 = an.rd;
            if (j >= rb2.length || j >= rd2.length) {
              fault();
              return;
            }
            if (el !== rb2[j] || !this.repeatedDisable(reg, cfg, cop, rd2[j])) {
              break;
            }
            const re2 = an.re;
            if (j >= re2.length) {
              fault();
              return;
            }
            el = re2[j];
          }
          if (this.departmentDisabled(reg, cop, d)) {
            red = this.redundantDepartment(reg, off, cop, bi, el);
          } else if (off.noneIn(reg, bi, el, cop, false)) {
            red = cop;
          }
        }
        if (red.length > 0) {
          this.add(rcDir, rcCops, ci, red);
        }
      }
    }
    // add_offenses (rcDir and rcCops grow together)
    for (let i = 0; i < rcDir.length && i < rcCops.length; i++) {
      const di = rcDir[i];
      const cs = rcCops[i];
      const dirs = cfg.dirs;
      if (di < 0 || di >= dirs.length) {
        fault();
        return;
      }
      const d = dirs[di];
      if (d.disabledAll() || d.directiveCount() === toI32(cs.length)) {
        this.entireComment(src, reg, cfg, self, d, cs);
      } else {
        this.someCops(src, reg, self, d, cs);
      }
    }
  }

  private add(rcDir: i32[], rcCops: string[][], ci: i32, cop: string): void {
    // The two grow together.
    for (let i = 0; i < rcDir.length && i < rcCops.length; i++) {
      if (rcDir[i] === ci) {
        const cs = rcCops[i];
        for (const x of cs) {
          if (x === cop) {
            return;
          }
        }
        cs.push(cop);
        return;
      }
    }
    const fresh: string[] = [cop];
    rcDir.push(ci);
    rcCops.push(fresh);
  }

  /** ignore_offense?: a range from the configuration, or within this cop's own disabled ranges. */
  private ignore(self: LdhAnalysis | null, an: LdhAnalysis, i: i32): boolean {
    const rb = an.rb;
    const re = an.re;
    if (i < 0 || i >= rb.length || i >= re.length) {
      fault();
      return true;
    }
    const b = rb[i];
    const e = re[i];
    if (b === LDH_NEG_INF) {
      return true;
    }
    if (self === null) {
      return b >= 0 && b <= 0 && e >= 0 && e <= 0;
    }
    const srb = self.rb;
    const sre = self.re;
    // The two grow together.
    for (let j = 0; j < srb.length && j < sre.length; j++) {
      const sb = srb[j];
      const se = sre[j];
      if (sb <= b && b <= se && sb <= e && e <= se) {
        return true;
      }
    }
    return false;
  }

  /** skip_directive? (for a real comment): push, pop or next. */
  private skipDirective(d: LdhDirective): boolean {
    return d.mode === "push" || d.mode === "pop" || d.mode === "next";
  }

  /** department_disabled?. */
  private departmentDisabled(reg: LdhRegistry, cop: string, d: LdhDirective): boolean {
    return d.inDirectiveDepartment(reg, cop) && !d.overriddenByDepartment(reg, cop);
  }

  /** repeated_disable?. */
  private repeatedDisable(reg: LdhRegistry, cfg: LdhConfig, cop: string, ci: i32): boolean {
    if (ci < 0) {
      return false;
    }
    const dirs = cfg.dirs;
    if (ci >= dirs.length) {
      fault();
      return false;
    }
    const d = dirs[ci];
    if (this.skipDirective(d)) {
      return false;
    }
    return !d.disabledAll() && !this.departmentDisabled(reg, cop, d);
  }

  /** find_redundant_department: the marked department, or "". */
  private redundantDepartment(reg: LdhRegistry, off: LrcdOffenses, cop: string, b: i32, e: i32): string {
    const sl = cop.indexOf("/");
    const dept = sl >= 0 ? cop.substring(0, sl) : cop;
    return off.noneIn(reg, b, e, dept, true) ? `${LRCD_MARKER}${dept}` : "";
  }

  /** unknown_cop?. */
  private unknown(reg: LdhRegistry, cop: string): boolean {
    if (cop === "all" || cop.startsWith(LRCD_MARKER)) {
      return false;
    }
    return !reg.has(cop);
  }

  /** Whether this cop is enabled on a line (its own analysis: `all` and `Lint` do not disable it). */
  private enabledAt(self: LdhAnalysis | null, l: i32): boolean {
    if (this.c.src === null || self === null) {
      return true;
    }
    const srb = self.rb;
    const sre = self.re;
    // The two grow together.
    for (let j = 0; j < srb.length && j < sre.length; j++) {
      if (srb[j] <= l && l <= sre[j]) {
        return false;
      }
    }
    return true;
  }

  /** add_offense: a corrector, or null for a repeated range or a disabled line. */
  private offense(src: RbSource, self: LdhAnalysis | null, s: i32, e: i32): RbRewriter | null {
    if (!this.c.note(s, e) || !this.enabledAt(self, src.line(s))) {
      return null;
    }
    return new RbRewriter(src.n);
  }

  private entireComment(
    src: RbSource,
    reg: LdhRegistry,
    cfg: LdhConfig,
    self: LdhAnalysis | null,
    d: LdhDirective,
    cops: string[],
  ): void {
    const k = this.offense(src, self, d.ms, d.me);
    if (k === null) {
      return;
    }
    for (const c of cops) {
      if (this.unknown(reg, c)) {
        return;
      }
    }
    // remove_entire_comment
    const ds = d.ms;
    const de = d.reasonEnd(src);
    let s = ds;
    let e = de;
    const line = src.line(ds);
    if (this.previousLineBlank(src, line) && cfg.commentOnlyLine(line) && ds === d.cs) {
      e = rbSpaceEnd(src, de, 2, true, false, false);
    } else {
      s = rbSpaceBegin(src, ds, 1, true, false, false);
      e = rbSpaceEnd(src, de, 2, ds === 0, false, false);
    }
    // leave_free_comment?
    const free = lrcdRemoveAll(src.src(d.cs, d.ce), ldhStrip(src.src(s, e)));
    if (free.length > 0 && !free.startsWith("#")) {
      k.replace(s, e, " # ");
    } else {
      k.remove(s, e);
    }
    this.c.commit(k);
  }

  /** previous_line_blank?: source_line(line - 1), which for line 1 is the buffer's last line. */
  private previousLineBlank(src: RbSource, line: i32): boolean {
    let text = "";
    const n = src.n;
    if (line >= 2) {
      text = src.lineText(line - 1);
    } else if (n > 0 && src.at(n - 1) !== 10) {
      text = src.lineText(src.lineCount());
    }
    for (let i = 0; i < toI32(text.length); i++) {
      const c = text.charCodeAt(i);
      if (!(c === 32 || (c >= 9 && c <= 13))) {
        return false;
      }
    }
    return true;
  }

  private someCops(src: RbSource, reg: LdhRegistry, self: LdhAnalysis | null, d: LdhDirective, cops: string[]): void {
    const rs: i32[] = [];
    const re: i32[] = [];
    const rc: string[] = [];
    for (const c of cops) {
      const name = lrcdRemoveAll(c, LRCD_MARKER);
      let p = lrceIndex(src, d.cs, d.ce, name);
      let len = toI32(name.length);
      if (p < 0) {
        // Badge.parse(cop).cop_name: the part after the last slash.
        let sl = -1;
        for (let j = 0; j < toI32(name.length); j++) {
          if (name.charCodeAt(j) === 47) {
            sl = j;
          }
        }
        const nk = toI32(name.length);
        let short = name;
        if (sl >= 0 && sl < nk) {
          short = name.substring(sl + 1, nk);
        }
        p = lrceIndex(src, d.cs, d.ce, short);
        len = toI32(short.length);
      }
      if (p < 0) {
        // RuboCop raises here.
        return;
      }
      // Insert sorted by begin (sort_by!).
      let at = toI32(rs.length);
      while (at > 0 && rs[at - 1] > p) {
        at--;
      }
      rs.push(0);
      re.push(0);
      rc.push("");
      // The three grow together.
      for (let j = toI32(rs.length) - 1; j > at && j > 0 && j < rs.length && j < re.length && j < rc.length; j--) {
        rs[j] = rs[j - 1];
        re[j] = re[j - 1];
        rc[j] = rc[j - 1];
      }
      const pe = toI64(p) + toI64(len);
      if (at < 0 || at >= rs.length || at >= re.length || at >= rc.length || pe > toI64(2147483647)) {
        fault();
        return;
      }
      rs[at] = p;
      re[at] = toI32(pe);
      rc[at] = c;
    }
    const m = toI32(rs.length);
    const ml = m - 1;
    let lastEnd = 0;
    if (ml >= 0) {
      if (ml >= re.length) {
        fault();
        return;
      }
      lastEnd = re[ml];
    }
    for (let i = 0; i < rs.length && i < re.length && i < rc.length; i++) {
      const ri = rs[i];
      const ei = re[i];
      const ci = rc[i];
      const k = this.offense(src, self, ri, ei);
      if (k === null || this.unknown(reg, ci)) {
        continue;
      }
      // directive_range_in_list
      let s = ri;
      let e = ei;
      if (this.endsItsLine(src, lastEnd) && this.trailing(src, rs, re, i)) {
        s = rbSpaceBegin(src, s, 1, true, false, false);
        // `src.at` answers -1 before the source.
        while (s > 0 && src.at(s - 1) === 44) {
          s--;
        }
      }
      // A comma is at a position below the source's length.
      while (e < 2147483647 && src.at(e) === 44) {
        e++;
      }
      e = rbSpaceEnd(src, e, 2, false, false, false);
      k.remove(s, e);
      this.c.commit(k);
    }
  }

  /** ends_its_line?: only whitespace follows e on its line. */
  private endsItsLine(src: RbSource, e: i32): boolean {
    const le = src.lineEnd(src.line(e));
    for (let p = e; p < le; p++) {
      const c = src.at(p);
      if (!(c === 32 || (c >= 9 && c <= 13))) {
        return false;
      }
    }
    // /\s*\z/ finds the first position of the trailing blank run; e must be that position.
    // `src.at` answers -1 before the source.
    let c0 = -1;
    if (e > 0) {
      c0 = src.at(e - 1);
    }
    return e === src.lineStart(src.line(e)) || !(c0 === 32 || (c0 >= 9 && c0 <= 13));
  }

  /** trailing_range?: from range i on, ranges are separated by commas only. */
  private trailing(src: RbSource, rs: i32[], re: i32[], i: i32): boolean {
    const lim = toI32(rs.length) - 1;
    for (let j = i; j >= 0 && j < lim; j++) {
      const nx = j + 1;
      if (nx >= rs.length || j >= re.length) {
        fault();
        return false;
      }
      if (!lrcdCommaOnly(src.src(re[j], rs[nx]))) {
        return false;
      }
    }
    return true;
  }
}
