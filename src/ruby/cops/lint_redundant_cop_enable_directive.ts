// Lint/RedundantCopEnableDirective.
//
// CommentConfig#extra_enabled_comments counts the cops the configuration
// disables as already disabled (registry.disabled_names). Under `rubocop
// --only` the registry holds only the cops asked for, so that count starts
// empty there; this port follows a full run.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { V_NIL } from "../ast";
import { add32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LdhConfig, LdhDirective, LdhRegistry } from "./lint_directive_help";
import { lalIsWs } from "./layout_align_help";

/** Whether c is Ruby's \w. */
const lrceWord = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** The first position of `name` (not followed by \w) within [s, e), or -1. */
export const lrceIndex = (src: RbSource, s: i32, e: i32, name: string): i32 => {
  const n = toI32(name.length);
  // p + n <= e: p up to e - n, a position in the comment.
  const lim = sub32(e, n);
  if (lim >= 2147483647) {
    fault();
    return -1;
  }
  for (let p = s; p <= lim; p++) {
    const pn = add32(p, n);
    if (src.src(p, pn) === name && !lrceWord(src.at(pn))) {
      return p;
    }
  }
  return -1;
};

/** names[name] += by, keeping the hash's key order. */
const lrceBump = (count: Map<string, i32>, keys: string[], name: string, by: i32): void => {
  const v = count.get(name);
  if (v === undefined) {
    keys.push(name);
    count.set(name, by);
  } else {
    count.set(name, add32(v, by));
  }
};

export class CopLintRedundantCopEnableDirective {
  c: RbCop;

  // The registry, built on first use and kept across files.
  reg: LdhRegistry | null = null;

  constructor() {
    this.c = new RbCop("Lint/RedundantCopEnableDirective");
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

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.root === V_NIL) {
      return;
    }
    let hasEnable = false;
    let hasPop = false;
    const n = src.n;
    // i + 3 <= n, which no i meets when n < 3.
    if (n >= 3) {
      const lim = n - 3;
      for (let i = 0; i <= lim && !(hasEnable && hasPop); i++) {
        if (src.at(i) === 101 && i <= n - 6 && src.src(i, add32(i, 6)) === "enable") {
          hasEnable = true;
        } else if (src.at(i) === 112 && src.at(i + 1) === 111 && src.at(i + 2) === 112) {
          hasPop = true;
        }
      }
    }
    if (!hasEnable && !hasPop) {
      return;
    }
    const reg = this.registry();
    const cfg = new LdhConfig(src, reg);
    if (hasEnable) {
      this.checkExtraEnables(src, reg, cfg);
    }
    if (hasPop) {
      this.checkOrphanPops(src, cfg);
    }
  }

  /** check_orphan_pops. */
  private checkOrphanPops(src: RbSource, cfg: LdhConfig): void {
    let depth = 0;
    for (const d of cfg.dirs) {
      if (d.mode === "push") {
        depth = add32(depth, 1);
      } else if (d.mode === "pop") {
        if (depth > 0) {
          depth--;
          continue;
        }
        const k = this.c.offense(d.ms, d.me);
        if (k !== null) {
          this.removeDirective(src, k, d);
          this.c.commit(k);
        }
      }
    }
  }

  /** remove_directive(corrector, directive.range_with_reason, directive.comment). */
  private removeDirective(src: RbSource, k: RbRewriter, d: LdhDirective): void {
    const re = d.reasonEnd(src);
    // range.end.join(comment.source_range.end).source.match?(/\A\s*(?:#|\z)/)
    let p = re;
    while (p < d.ce && lalIsWs(src.at(p))) {
      p++;
    }
    if (p >= d.ce || src.at(p) === 35) {
      k.remove(d.ms, rbSpaceEnd(src, re, 2, true, false, false));
    } else {
      k.replace(d.ms, re, "#");
    }
  }

  /** check_extra_enables. */
  private checkExtraEnables(src: RbSource, reg: LdhRegistry, cfg: LdhConfig): void {
    // extra_enabled_comments
    const count = new Map<string, i32>();
    const keys: string[] = [];
    for (const n of reg.disabledNames()) {
      lrceBump(count, keys, n, 1);
    }
    const exDir: i32[] = [];
    const exNames: string[][] = [];
    for (const d of cfg.dirs) {
      if (!cfg.commentOnlyLine(d.line) || d.selfClosing()) {
        continue;
      }
      if (d.enabledAll()) {
        let enabled = 0;
        for (const key of keys) {
          const v = count.get(key) ?? 0;
          if (v > 0) {
            count.set(key, v - 1);
            // Only whether any was enabled matters.
            enabled = 1;
          }
        }
        if (enabled === 0) {
          this.extra(exDir, exNames, d.ci).push("all");
        }
      } else {
        for (const n of d.copNames(reg)) {
          const v = count.get(n) ?? 0;
          if (d.disabled()) {
            lrceBump(count, keys, n, 1);
          } else if (v > 0) {
            count.set(n, v - 1);
          } else {
            this.extra(exDir, exNames, d.ci).push(n);
          }
        }
      }
    }
    const dirs = cfg.dirs;
    for (let i = 0; i < toI32(exDir.length); i++) {
      // exDir holds comment indexes, one directive each, beside exNames.
      const di = exDir[i];
      if (di < 0 || di >= dirs.length || i >= exNames.length) {
        fault();
        return;
      }
      this.registerOffense(src, reg, dirs[di], exNames[i]);
    }
  }

  private extra(exDir: i32[], exNames: string[][], ci: i32): string[] {
    for (let i = 0; i < toI32(exDir.length); i++) {
      if (exDir[i] === ci) {
        // extra pushes onto both together.
        if (i >= exNames.length) {
          fault();
          break;
        }
        return exNames[i];
      }
    }
    const fresh: string[] = [];
    exDir.push(ci);
    exNames.push(fresh);
    return fresh;
  }

  private registerOffense(src: RbSource, reg: LdhRegistry, d: LdhDirective, names: string[]): void {
    for (const n0 of names) {
      let name = n0;
      if (d.inDirectiveDepartment(reg, name) && !d.overriddenByDepartment(reg, name)) {
        const sl = name.indexOf("/");
        name = sl >= 0 ? name.substring(0, sl) : name;
      }
      const p = lrceIndex(src, d.cs, d.ce, name);
      if (p < 0) {
        continue;
      }
      const pe = add32(p, toI32(name.length));
      const k = this.c.offense(p, pe);
      if (k === null) {
        continue;
      }
      if (d.matchNames(reg, names)) {
        this.removeDirective(src, k, d);
      } else {
        this.removeWithComma(src, k, d, p, pe);
      }
      this.c.commit(k);
    }
  }

  /** range_with_comma. */
  private removeWithComma(src: RbSource, k: RbRewriter, d: LdhDirective, s0: i32, e0: i32): void {
    const cs = d.cs;
    const ce = d.ce;
    let s = s0;
    let e = e0;
    // cs >= 0, so s > cs leaves s - 1 a position.
    while (s > cs && s > 0 && (src.at(s - 1) === 32 || src.at(s - 1) === 9)) {
      s--;
    }
    while (e < ce && (src.at(e) === 32 || src.at(e) === 9)) {
      e++;
    }
    if (s > cs && s > 0 && src.at(s - 1) === 44) {
      k.remove(s - 1, e);
    } else if (e < ce && src.at(e) === 44) {
      if (!(e + 1 < ce && src.at(e + 1) === 32)) {
        s = add32(s, 1);
      }
      k.remove(s, e + 1);
    } else {
      k.remove(cs, ce);
    }
  }
}
