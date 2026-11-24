// Layout/EmptyLinesAroundExceptionHandlingKeywords: no empty line before or
// after `rescue`, `else` and `ensure` of a def, block or `begin` body.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { sub32 } from "../../core/arr";
import {
  F_ELSE,
  F_END,
  F_KEYWORD,
  NT_BLOCK,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_KWBEGIN,
  NT_NUMBLOCK,
  NT_RESBODY,
  NT_RESCUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbNKid, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayCheckNoEmpty } from "./layout_empty_help";

/** keyword_locations: the starts of the body's `else`, `rescue` and `ensure` keywords. */
const rbExcKwLocations = (src: RbSource, body: i32, out: i32[]): void => {
  if (body === V_NIL) {
    return;
  }
  const a = src.a;
  const t = a.type(body);
  if (t === NT_RESCUE) {
    if (rnHas(src, body, F_ELSE)) {
      out.push(rnS(src, body, F_ELSE));
    }
    for (let i = 1; i < rbNKid(src, body) - 1; i++) {
      const r = a.kid(body, i);
      if (r !== V_NIL && a.type(r) === NT_RESBODY && rnHas(src, r, F_KEYWORD)) {
        out.push(rnS(src, r, F_KEYWORD));
      }
    }
  } else if (t === NT_ENSURE) {
    out.push(rnS(src, body, F_KEYWORD));
    rbExcKwLocations(src, a.kid(body, 0), out);
  }
};

export class CopLayoutEmptyLinesAroundExceptionHandlingKeywords {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundExceptionHandlingKeywords");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      let body = V_NIL;
      if (t === NT_DEF || t === NT_DEFS || t === NT_BLOCK || t === NT_NUMBLOCK) {
        // An endless def has no `end` and is skipped.
        if ((t === NT_DEF || t === NT_DEFS) && !rnHas(src, n, F_END)) {
          continue;
        }
        body = a.kid(n, -1);
      } else if (t === NT_KWBEGIN) {
        body = a.kid(n, 0);
      } else {
        continue;
      }
      this.checkBody(src, L, n, body, src.line(a.exS(n)));
    }
  }

  private checkBody(src: RbSource, L: RbLayLines, par: i32, body: i32, defLine: i32): void {
    const a = src.a;
    const locs: i32[] = [];
    rbExcKwLocations(src, body, locs);
    for (const s of locs) {
      const line = src.line(s);
      if (line === defLine) {
        continue;
      }
      // last_body_and_end_on_same_line?
      const endLine = src.line(rnS(src, par, F_END));
      let lastBody = 0;
      if (a.type(body) !== NT_RESCUE) {
        lastBody = src.line(a.exE(body));
      } else if (rnHas(src, body, F_ELSE)) {
        lastBody = src.line(rnS(src, body, F_ELSE));
      } else {
        lastBody = src.line(a.exS(a.kid(body, -2)));
      }
      if (lastBody === endLine) {
        continue;
      }
      rbLayCheckNoEmpty(this.c, L, line);
      rbLayCheckNoEmpty(this.c, L, sub32(line, 2));
    }
  }
}
