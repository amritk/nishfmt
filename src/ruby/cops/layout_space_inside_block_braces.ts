// Layout/SpaceInsideBlockBraces (EnforcedStyle: space,
// EnforcedStyleForEmptyBraces: no_space, SpaceBeforeBlockParameters: true).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_BLOCK, NT_NUMBLOCK, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnFieldSrc, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { lspHasNonWs, lspHasWs, lspIsWs } from "./layout_space_help";

export class CopLayoutSpaceInsideBlockBraces {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideBlockBraces");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      if (rnFieldSrc(src, n, F_END) === "end") {
        continue;
      }
      const lbS = rnS(src, n, F_BEGIN);
      const lbE = rnE(src, n, F_BEGIN);
      const rbS = rnS(src, n, F_END);
      const rbE = rnE(src, n, F_END);
      const multiline = src.line(lbS) !== src.line(rbS);
      if (a.kid(n, 2) === V_NIL && multiline) {
        continue;
      }
      if (lbE === rbS) {
        continue; // adjacent_braces: EnforcedStyleForEmptyBraces is no_space
      }
      if (!lspHasNonWs(src, lbE, rbS)) {
        this.offense(src, lbE, rbS);
        continue;
      }
      // braces_with_contents_inside
      let pipeS = -1;
      let pipeE = -1;
      if (t === NT_BLOCK) {
        const args = a.kid(n, 1);
        if (rnHas(src, args, F_BEGIN) && rnFieldSrc(src, args, F_BEGIN) === "|") {
          pipeS = rnS(src, args, F_BEGIN);
          pipeE = rnE(src, args, F_BEGIN);
        }
      }
      // check_left_brace
      if (!lspIsWs(src.at(lbE))) {
        if (pipeS >= 0) {
          if (lbE === pipeS) {
            this.offense(src, lbS, pipeE);
          }
        } else {
          this.offense(src, lbE, lbE + 1);
        }
      }
      // check_right_brace: only the missing space corrects under the space style.
      if (!multiline && !lspIsWs(src.at(rbS - 1))) {
        this.offense(src, rbS, rbE);
      }
    }
  }

  private offense(src: RbSource, s: i32, e: i32): void {
    if (s >= e) {
      return;
    }
    const k = this.c.offense(s, e);
    if (k === null) {
      return;
    }
    const text = src.src(s, e);
    if (lspHasWs(src, s, e)) {
      k.remove(s, e);
    } else if (text === "{}") {
      k.replace(s, e, "{ }");
    } else if (text === "{|") {
      k.replace(s, e, "{ |");
    } else {
      k.insertBefore(s, e, " ");
    }
    this.c.commit(k);
  }
}
