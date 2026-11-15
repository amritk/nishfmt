// RuboCop::Cop::Team for `rubocop -a`: every cop inspects the source, and
// their correctors merge in registry order, skipping a cop whose corrections
// clobber an earlier one's or that is autocorrect-incompatible with a cop
// already merged.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "./cop";
import { CopStyleStringLiterals } from "./cops/style_strings";
import { rbIncompatible } from "./registry";
import { RbRewriter } from "./rewriter";
import { RbSource } from "./source";

export class RbTeam {
  styleStringLiterals: CopStyleStringLiterals;
  // The cops' shared state, in registry order.
  cops: RbCop[];
  // FFRBONLY: run only these cops (comma-separated names).
  only: string = "";

  constructor() {
    this.styleStringLiterals = new CopStyleStringLiterals();
    this.cops = [this.styleStringLiterals.c];
  }

  private on(name: string): boolean {
    if (this.only.length === 0) {
      return true;
    }
    return `,${this.only},`.indexOf(`,${name},`) >= 0;
  }

  /** One pass: the merged corrections, or null when no cop corrects anything. */
  run(src: RbSource): RbRewriter | null {
    if (this.on("Style/StringLiterals")) {
      this.styleStringLiterals.run(src);
    } else {
      this.styleStringLiterals.c.begin(src);
    }
    const merged = new RbRewriter(src.n);
    const applied: string[] = [];
    for (const c of this.cops) {
      if (c.rw.empty()) {
        continue;
      }
      let skip = false;
      for (const o of applied) {
        if (rbIncompatible(c.name, o)) {
          skip = true;
        }
      }
      if (skip) {
        continue;
      }
      merged.merge(c.rw);
      applied.push(c.name);
    }
    return merged.empty() ? null : merged;
  }
}
