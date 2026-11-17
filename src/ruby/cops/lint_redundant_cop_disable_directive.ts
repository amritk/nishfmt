// Lint/RedundantCopDisableDirective.
//
// RuboCop runs this cop apart from the others: after a file's inspection
// loop settles, the Runner hands it the offenses the other cops found in the
// last pass that it did not correct (offenses inside disabled ranges
// included), applies its corrections once, and runs the inspection loop again
// on the result (Runner#add_redundant_disables). It does not run at all under
// --only. So `run` does nothing; the team calls `runWith` instead.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
    for (let i = 0; i < toI32(this.names.length); i++) {
      const n = this.names[i];
      const sel = cop.length === 0 || (prefix ? n.startsWith(cop) : n === cop);
      if (sel && this.l1[i] <= e && this.l2[i] >= b) {
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
    i = j + k;
  }
  return out.join("");
};

/** Whether s matches /\A\s*,\s*\z/. */
const lrcdCommaOnly = (s: string): boolean => {
  let commas = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c === 44) {
      commas++;
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
      for (let i = 0; i < toI32(c.offS.length); i++) {
        off.names.push(c.name);
        off.l1.push(src.line(c.offS[i]));
        off.l2.push(src.line(c.offE[i]));
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
      // each_already_disabled
      for (let i = 1; i < n; i++) {
        if (this.ignore(self, an, i) || an.re[i - 1] !== an.rb[i]) {
          continue;
        }
        const ci = an.rd[i];
        if (ci < 0) {
          continue;
        }
        const d = cfg.dirs[ci];
        if (this.skipDirective(d) || d.disabledAll()) {
          continue;
        }
        let red = cop;
        if (this.departmentDisabled(reg, cop, d)) {
          red = this.redundantDepartment(reg, off, cop, an.rb[i], an.re[i]);
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
        // expected_final_disable?
        if (reg.has(cop) && !reg.enabled(cop) && an.re[i] === LDH_INF) {
          continue;
        }
        const ci = an.rd[i];
        if (ci < 0) {
          continue;
        }
        const d = cfg.dirs[ci];
        if (this.skipDirective(d)) {
          continue;
        }
        let red = "";
        if (d.disabledAll()) {
          const noNext = i + 1 >= n || an.re[i] !== an.rb[i + 1];
          if (noNext && off.noneIn(reg, an.rb[i], an.re[i], "", false)) {
            red = "all";
          }
        } else {
          // line_range_through_repeated_disables
          let last = i;
          for (let j = i + 1; j < n; j++) {
            if (an.re[last] !== an.rb[j] || !this.repeatedDisable(reg, cfg, cop, an.rd[j])) {
              break;
            }
            last = j;
          }
          if (this.departmentDisabled(reg, cop, d)) {
            red = this.redundantDepartment(reg, off, cop, an.rb[i], an.re[last]);
          } else if (off.noneIn(reg, an.rb[i], an.re[last], cop, false)) {
            red = cop;
          }
        }
        if (red.length > 0) {
          this.add(rcDir, rcCops, ci, red);
        }
      }
    }
    // add_offenses
    for (let i = 0; i < toI32(rcDir.length); i++) {
      const d = cfg.dirs[rcDir[i]];
      const cs = rcCops[i];
      if (d.disabledAll() || d.directiveCount() === toI32(cs.length)) {
        this.entireComment(src, reg, cfg, self, d, cs);
      } else {
        this.someCops(src, reg, self, d, cs);
      }
    }
  }

  private add(rcDir: i32[], rcCops: string[][], ci: i32, cop: string): void {
    for (let i = 0; i < toI32(rcDir.length); i++) {
      if (rcDir[i] === ci) {
        for (const x of rcCops[i]) {
          if (x === cop) {
            return;
          }
        }
        rcCops[i].push(cop);
        return;
      }
    }
    const fresh: string[] = [cop];
    rcDir.push(ci);
    rcCops.push(fresh);
  }

  /** ignore_offense?: a range from the configuration, or within this cop's own disabled ranges. */
  private ignore(self: LdhAnalysis | null, an: LdhAnalysis, i: i32): boolean {
    const b = an.rb[i];
    const e = an.re[i];
    if (b === LDH_NEG_INF) {
      return true;
    }
    if (self === null) {
      return b >= 0 && b <= 0 && e >= 0 && e <= 0;
    }
    for (let j = 0; j < toI32(self.rb.length); j++) {
      if (self.rb[j] <= b && b <= self.re[j] && self.rb[j] <= e && e <= self.re[j]) {
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
    const d = cfg.dirs[ci];
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
    for (let j = 0; j < toI32(self.rb.length); j++) {
      if (self.rb[j] <= l && l <= self.re[j]) {
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
    if (line - 1 >= 1) {
      text = src.lineText(line - 1);
    } else if (src.n > 0 && src.at(src.n - 1) !== 10) {
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
        const short = sl >= 0 ? name.substring(sl + 1, toI32(name.length)) : name;
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
      for (let j = toI32(rs.length) - 1; j > at; j--) {
        rs[j] = rs[j - 1];
        re[j] = re[j - 1];
        rc[j] = rc[j - 1];
      }
      rs[at] = p;
      re[at] = p + len;
      rc[at] = c;
    }
    const m = toI32(rs.length);
    for (let i = 0; i < m; i++) {
      const k = this.offense(src, self, rs[i], re[i]);
      if (k === null || this.unknown(reg, rc[i])) {
        continue;
      }
      // directive_range_in_list
      let s = rs[i];
      let e = re[i];
      if (this.endsItsLine(src, re[m - 1]) && this.trailing(src, rs, re, i)) {
        s = rbSpaceBegin(src, s, 1, true, false, false);
        while (src.at(s - 1) === 44) {
          s--;
        }
      }
      while (src.at(e) === 44) {
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
    const c0 = src.at(e - 1);
    return e === src.lineStart(src.line(e)) || !(c0 === 32 || (c0 >= 9 && c0 <= 13));
  }

  /** trailing_range?: from range i on, ranges are separated by commas only. */
  private trailing(src: RbSource, rs: i32[], re: i32[], i: i32): boolean {
    for (let j = i; j + 1 < toI32(rs.length); j++) {
      if (!lrcdCommaOnly(src.src(re[j], rs[j + 1]))) {
        return false;
      }
    }
    return true;
  }
}
