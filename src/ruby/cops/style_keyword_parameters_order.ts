// Style/KeywordParametersOrder.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_BLOCK, NT_DEF, NT_DEFS, NT_KWARG, NT_KWOPTARG, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { ssxCommentsInLines, ssxLocIs } from "./style_syntax_help";

/** Style/KeywordParametersOrder. */
export class CopStyleKeywordParametersOrder {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/KeywordParametersOrder");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_KWOPTARG) {
        continue;
      }
      const args = src.parent(n);
      if (args === V_NIL) {
        continue;
      }
      // right_siblings.select(&:kwarg_type?)
      const kwargs: i32[] = [];
      let after = false;
      let firstOpt = V_NIL;
      for (let i = 0; i < a.nKid(args); i++) {
        const c = a.kid(args, i);
        if (c === n) {
          after = true;
          continue;
        }
        if (after && a.isNode(c) && a.type(c) === NT_KWARG) {
          kwargs.push(c);
        }
      }
      for (let i = 0; i < a.nKid(args); i++) {
        const c = a.kid(args, i);
        if (a.isNode(c) && a.type(c) === NT_KWOPTARG) {
          firstOpt = c;
          break;
        }
      }
      if (kwargs.length === 0) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      let def = src.parent(n);
      while (def !== V_NIL && a.type(def) !== NT_DEF && a.type(def) !== NT_DEFS && a.type(def) !== NT_BLOCK) {
        def = src.parent(def);
      }
      if (def === V_NIL) {
        continue;
      }
      // arguments_range(defining_node)
      const dargs = a.type(def) === NT_DEFS ? a.kid(def, 2) : a.kid(def, 1);
      const fa = a.kid(dargs, 0);
      const la = a.kid(dargs, -1);
      if (ssxCommentsInLines(src, src.line(a.exS(fa)), src.line(a.exE(la))) || firstOpt !== n) {
        this.c.commit(k);
        continue;
      }
      const parts: string[] = [];
      for (const kw of kwargs) {
        parts.push(src.nodeSrc(kw));
      }
      k.insertBefore(a.exS(n), a.exE(n), `${parts.join(", ")}, `);
      if (!ssxLocIs(src, dargs, F_END, ")")) {
        // append_newline_to_last_kwoptarg
        const last = a.kid(dargs, -1);
        if (a.isNode(last) && a.type(last) === NT_KWARG && a.type(def) !== NT_BLOCK) {
          for (let i = a.nKid(dargs) - 1; i >= 0; i--) {
            const c = a.kid(dargs, i);
            if (a.isNode(c) && a.type(c) === NT_KWOPTARG) {
              k.insertAfter(a.exS(c), a.exE(c), "\n");
              break;
            }
          }
        }
      }
      // remove_kwargs
      for (const kw of kwargs) {
        const s1 = rbSpaceBegin(src, a.exS(kw), 1, true, true, false);
        const e1 = rbSpaceEnd(src, a.exE(kw), 2, true, false, false);
        let s2 = s1;
        while (src.at(s2 - 1) === 44) {
          s2--;
        }
        k.remove(s2 < 0 ? 0 : s2, e1);
      }
      this.c.commit(k);
    }
  }
}
