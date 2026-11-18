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
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LdhConfig, LdhDirective, LdhRegistry } from "./lint_directive_help";
import { lalIsWs } from "./layout_align_help";

/** Whether c is Ruby's \w. */
const lrceWord = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** Whether c is Ruby's \s. */
/** The first position of `name` (not followed by \w) within [s, e), or -1. */
export const lrceIndex = (src: RbSource, s: i32, e: i32, name: string): i32 => {
  const n = toI32(name.length);
  for (let p = s; p + n <= e; p++) {
    if (src.src(p, p + n) === name && !lrceWord(src.at(p + n))) {
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
    count.set(name, v + by);
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
    for (let i = 0; i + 3 <= src.n && !(hasEnable && hasPop); i++) {
      if (src.at(i) === 101 && i + 6 <= src.n && src.src(i, i + 6) === "enable") {
        hasEnable = true;
      } else if (src.at(i) === 112 && src.at(i + 1) === 111 && src.at(i + 2) === 112) {
        hasPop = true;
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
        depth++;
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
            enabled++;
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
    for (let i = 0; i < toI32(exDir.length); i++) {
      this.registerOffense(src, reg, cfg.dirs[exDir[i]], exNames[i]);
    }
  }

  private extra(exDir: i32[], exNames: string[][], ci: i32): string[] {
    for (let i = 0; i < toI32(exDir.length); i++) {
      if (exDir[i] === ci) {
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
      const k = this.c.offense(p, p + toI32(name.length));
      if (k === null) {
        continue;
      }
      if (d.matchNames(reg, names)) {
        this.removeDirective(src, k, d);
      } else {
        this.removeWithComma(src, k, d, p, p + toI32(name.length));
      }
      this.c.commit(k);
    }
  }

  /** range_with_comma. */
  private removeWithComma(src: RbSource, k: RbRewriter, d: LdhDirective, s0: i32, e0: i32): void {
    let s = s0;
    let e = e0;
    while (s > d.cs && (src.at(s - 1) === 32 || src.at(s - 1) === 9)) {
      s--;
    }
    while (e < d.ce && (src.at(e) === 32 || src.at(e) === 9)) {
      e++;
    }
    if (s > d.cs && src.at(s - 1) === 44) {
      k.remove(s - 1, e);
    } else if (e < d.ce && src.at(e) === 44) {
      if (!(e + 1 < d.ce && src.at(e + 1) === 32)) {
        s++;
      }
      k.remove(s, e + 1);
    } else {
      k.remove(d.cs, d.ce);
    }
  }
}
