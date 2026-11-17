// Style/EmptyCaseCondition.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_KEYWORD,
  NT_AND,
  NT_BREAK,
  NT_CASE,
  NT_CSEND,
  NT_ERANGE,
  NT_IF,
  NT_IRANGE,
  NT_NEXT,
  NT_OR,
  NT_RETURN,
  NT_SEND,
  NT_SUPER,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { scnCommentsInLines, scnSpaces, scnThen } from "./style_cond_help";
import { ssxAssignment, ssxDescendants, ssxFE, ssxFS, ssxIs } from "./style_syntax_help";

export class CopStyleEmptyCaseCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EmptyCaseCondition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_CASE || a.kid(n, 0) !== V_NIL) {
        continue;
      }
      const p = src.parent(n);
      if (p !== V_NIL) {
        const pt = a.type(p);
        if (
          pt === NT_RETURN ||
          pt === NT_BREAK ||
          pt === NT_NEXT ||
          pt === NT_SEND ||
          pt === NT_CSEND ||
          pt === NT_YIELD ||
          pt === NT_SUPER
        ) {
          continue;
        }
      }
      const whens: i32[] = [];
      for (let i = 1; i < a.nKid(n) - 1; i++) {
        whens.push(a.kid(n, i));
      }
      const bodies: i32[] = [];
      for (const w of whens) {
        bodies.push(a.kid(w, -1));
      }
      bodies.push(a.kid(n, -1));
      let ret = false;
      for (const b of bodies) {
        if (b === V_NIL || !a.isNode(b)) {
          continue;
        }
        if (a.type(b) === NT_RETURN) {
          ret = true;
        }
        for (const d of ssxDescendants(src, b)) {
          if (a.type(d) === NT_RETURN) {
            ret = true;
          }
        }
      }
      if (ret) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k === null) {
        continue;
      }
      // correct_case_when
      const cs = ssxFS(src, n, F_KEYWORD);
      const ce = ssxFE(src, whens[0], F_KEYWORD);
      k.replace(cs, ce, "if");
      const col = src.column(cs);
      const ind = scnSpaces(col);
      const parts: string[] = [];
      for (const c of scnCommentsInLines(src, src.line(cs), src.line(ce))) {
        parts.push(`${ind}${src.src(src.commS[c], src.commE[c])}\n`);
      }
      const ls = cs - col;
      k.insertBefore(ls, ce, parts.join(""));
      for (let i = 1; i < toI32(whens.length); i++) {
        k.replace(ssxFS(src, whens[i], F_KEYWORD), ssxFE(src, whens[i], F_KEYWORD), "elsif");
      }
      // correct_when_conditions
      for (const w of whens) {
        const nc = a.nKid(w) - 1;
        const first = a.kid(w, 0);
        const last = a.kid(w, nc - 1);
        if (src.parent(src.parent(w)) !== V_NIL && scnThen(src, w)) {
          k.replace(a.exE(last), ssxFE(src, w, F_BEGIN), "\n");
        }
        if (nc > 1) {
          const cp: string[] = [];
          for (let i = 0; i < nc; i++) {
            const c = a.kid(w, i);
            const t = a.type(c);
            if (
              ssxAssignment(src, c) ||
              t === NT_IF ||
              t === NT_AND ||
              t === NT_OR ||
              t === NT_IRANGE ||
              t === NT_ERANGE
            ) {
              cp.push(`(${src.nodeSrc(c)})`);
            } else {
              cp.push(src.nodeSrc(c));
            }
          }
          k.replace(a.exS(first), a.exE(last), cp.join(" || "));
        }
      }
      this.c.commit(k);
    }
  }
}
