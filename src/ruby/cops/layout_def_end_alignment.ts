// Layout/DefEndAlignment (EnforcedStyleAlignWith: start_of_line).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, F_KEYWORD, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import {
  rmlAlignEnd,
  rmlColumnOffset,
  rmlDefModifier,
  rmlDescendants,
  rmlIsDef,
  rmlSingleLine,
} from "./layout_multiline_help";
import { LspIgnored } from "./layout_space_help";

export class CopLayoutDefEndAlignment {
  c: RbCop;
  ign: LspIgnored;

  constructor() {
    this.c = new RbCop("Layout/DefEndAlignment");
    this.ign = new LspIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign = new LspIgnored();
    const a = src.a;
    for (const n of src.pre) {
      if (rmlIsDef(src, n)) {
        this.check(src, n, rnS(src, n, F_KEYWORD));
      } else if (a.type(n) === NT_SEND) {
        if (rmlDefModifier(src, n) === V_NIL) {
          continue;
        }
        const ds: i32[] = [];
        rmlDescendants(src, n, ds);
        let md = V_NIL;
        for (const d of ds) {
          if (rmlIsDef(src, d)) {
            md = d;
            break;
          }
        }
        if (md === V_NIL || rmlSingleLine(src, md)) {
          continue;
        }
        this.check(src, md, a.exS(n));
        this.ign.add(md);
      }
    }
  }

  /** check_end_kw_alignment against the range starting at `as`. */
  private check(src: RbSource, n: i32, as: i32): void {
    if (this.ign.has(n) || !rnHas(src, n, F_END)) {
      return;
    }
    const es = rnS(src, n, F_END);
    if (src.line(as) === src.line(es) || rmlColumnOffset(src, as, es) === 0) {
      return;
    }
    const k = this.c.offense(es, rnE(src, n, F_END));
    if (k !== null) {
      rmlAlignEnd(src, k, es, src.column(src.a.exS(this.outermostDefModifier(src, n))));
      this.c.commit(k);
    }
  }

  /** outermost_def_modifier: the last of the send ancestors that each modify `n`. */
  private outermostDefModifier(src: RbSource, n: i32): i32 {
    let to = n;
    for (let p = src.parent(n); p !== V_NIL; p = src.parent(p)) {
      if (src.a.type(p) !== NT_SEND) {
        continue;
      }
      if (rmlDefModifier(src, p) !== n) {
        break;
      }
      to = p;
    }
    return to;
  }
}
