// Lint/ShadowedException (no correction): a rescue that rescues an exception
// and one of its ancestors together, or an exception after one of its
// ancestors. RuboCop resolves each rescued exception with Kernel.const_get
// in its own process; lint_exception_table.ts lists what that resolves.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_RESCUE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LEX_CLASSES, LEX_PATHS } from "./lint_exception_table";
import { sbhResbodies, sbhResbodyExceptions } from "./style_body_help";

// Module#<=> results, with LSE_NIL for nil.
const LSE_NIL: i32 = -2;

/** `s` split at byte `sep`. */
const lseSplit = (s: string, sep: i32): string[] => {
  const out: string[] = [];
  let b = 0;
  for (let i = 0; i <= toI32(s.length); i++) {
    if (i === toI32(s.length) || s.charCodeAt(i) === sep) {
      out.push(s.substring(b, i));
      b = i + 1;
    }
  }
  return out;
};

/** The exception classes: superclass and Errno value by index, and the constant paths. */
class LseTable {
  sup: i32[];
  errno: i32[];
  paths: Map<string, i32>;
  exception: i32 = -1;
  standardError: i32 = -1;
  systemCallError: i32 = -1;

  constructor() {
    this.sup = [];
    this.errno = [];
    this.paths = new Map<string, i32>();
    for (const row of lseSplit(LEX_CLASSES, 59)) {
      const f = lseSplit(row, 32);
      this.sup.push(parseInt(f[0]));
      this.errno.push(parseInt(f[1]));
    }
    for (const row of lseSplit(LEX_PATHS, 59)) {
      const f = lseSplit(row, 32);
      this.paths.set(f[0], parseInt(f[1]));
    }
    this.exception = this.find("Exception");
    this.standardError = this.find("StandardError");
    this.systemCallError = this.find("SystemCallError");
  }

  /** Kernel.const_get(path): a class index, or -1 (NameError, or not an exception class). */
  find(path0: string): i32 {
    const path = path0.startsWith("::") ? path0.substring(2, toI32(path0.length)) : path0;
    return this.paths.get(path) ?? -1;
  }

  /** Whether x is y or inherits from it. */
  private kindOf(x: i32, y: i32): boolean {
    let c = x;
    while (c >= 0) {
      if (c === y) {
        return true;
      }
      c = this.sup[c];
    }
    return false;
  }

  /** `x <=> y` for classes (-1 for nil). */
  cmp(x: i32, y: i32): i32 {
    if (x < 0 || y < 0) {
      // nil <=> nil is 0; nil against a class is nil
      return x < 0 && y < 0 ? 0 : LSE_NIL;
    }
    if (x === y) {
      return 0;
    }
    if (this.kindOf(x, y)) {
      return -1;
    }
    if (this.kindOf(y, x)) {
      return 1;
    }
    return LSE_NIL;
  }

  /** system_call_err?: ancestors[1] == SystemCallError. */
  systemCallErr(x: i32): boolean {
    return x >= 0 && this.sup[x] === this.systemCallError;
  }
}

export class CopLintShadowedException {
  c: RbCop;
  tab: LseTable | null = null;

  constructor() {
    this.c = new RbCop("Lint/ShadowedException");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESCUE) {
        continue;
      }
      const tab = this.table();
      const rescues = sbhResbodies(src, n);
      const groups: i32[][] = [];
      for (const r of rescues) {
        groups.push(this.evaluate(src, tab, r));
      }
      let multi = false;
      for (const g of groups) {
        if (this.multipleLevels(tab, g)) {
          multi = true;
        }
      }
      if (!multi && this.sortedAll(tab, groups)) {
        continue;
      }
      // find_shadowing_rescue
      let shadow = -1;
      for (let i = 0; i < toI32(groups.length) && shadow < 0; i++) {
        if (this.multipleLevels(tab, groups[i])) {
          shadow = i;
        }
      }
      for (let i = 0; i + 1 < toI32(groups.length) && shadow < 0; i++) {
        if (!this.sorted(tab, groups[i], groups[i + 1])) {
          shadow = i;
        }
      }
      if (shadow >= 0) {
        const r = rescues[shadow];
        this.c.offense(a.exS(r), a.exE(r));
      }
    }
  }

  /** The table, built on first use and kept across files. */
  private table(): LseTable {
    const t = this.tab;
    if (t !== null) {
      return t;
    }
    const nt = new LseTable();
    this.tab = nt;
    return nt;
  }

  /** evaluate_exceptions: class indices, -1 for nil. */
  private evaluate(src: RbSource, tab: LseTable, r: i32): i32[] {
    const out: i32[] = [];
    const exs = sbhResbodyExceptions(src, r);
    if (exs.length === 0) {
      out.push(tab.standardError);
      return out;
    }
    for (const e of exs) {
      if (!src.a.isNode(e)) {
        out.push(-1);
        continue;
      }
      out.push(tab.find(src.src(src.a.exS(e), src.a.exE(e))));
    }
    return out;
  }

  private includes(g: i32[], x: i32): boolean {
    for (const y of g) {
      if (y === x) {
        return true;
      }
    }
    return false;
  }

  /** compare_exceptions: truthy. */
  private compare(tab: LseTable, x: i32, y: i32): boolean {
    if (tab.systemCallErr(x) && tab.systemCallErr(y)) {
      return tab.errno[x] !== tab.errno[y] && tab.cmp(x, y) !== LSE_NIL;
    }
    return x >= 0 && y >= 0 && tab.cmp(x, y) !== LSE_NIL;
  }

  /** contains_multiple_levels_of_exceptions?. */
  private multipleLevels(tab: LseTable, g: i32[]): boolean {
    if (g.length > 1 && this.includes(g, tab.exception)) {
      return true;
    }
    for (let i = 0; i < toI32(g.length); i++) {
      for (let j = i + 1; j < toI32(g.length); j++) {
        if (this.compare(tab, g[i], g[j])) {
          return true;
        }
      }
    }
    return false;
  }

  /** none?: every element nil. */
  private none(g: i32[]): boolean {
    for (const x of g) {
      if (x >= 0) {
        return false;
      }
    }
    return true;
  }

  /** The sorted? test of one pair. */
  private sorted(tab: LseTable, x: i32[], y: i32[]): boolean {
    if (this.includes(x, tab.exception)) {
      return false;
    }
    if (this.includes(y, tab.exception) || this.none(x) || this.none(y)) {
      return true;
    }
    // (x <=> y || 0) <= 0 with Array#<=>
    const k = x.length < y.length ? toI32(x.length) : toI32(y.length);
    for (let i = 0; i < k; i++) {
      const c = tab.cmp(x[i], y[i]);
      if (c === LSE_NIL) {
        return true;
      }
      if (c !== 0) {
        return c < 0;
      }
    }
    return x.length <= y.length;
  }

  private sortedAll(tab: LseTable, gs: i32[][]): boolean {
    for (let i = 0; i + 1 < toI32(gs.length); i++) {
      if (!this.sorted(tab, gs[i], gs[i + 1])) {
        return false;
      }
    }
    return true;
  }
}
