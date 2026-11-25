// Style/EachWithObject.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_ARGS, NT_BEGIN, NT_BLOCK, NT_LVAR, NT_NUMBLOCK, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  ssxAssignment,
  ssxBasicLiteral,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxIs,
  ssxIsCall,
  ssxMeth,
  ssxSymText,
  ssxWholeLinesE,
  ssxWholeLinesS,
} from "./style_syntax_help";

/** return_value: the body's last expression when it is an lvar (V_NIL otherwise). */
const ssxEwoReturnValue = (src: RbSource, body: i32): i32 => {
  if (body === V_NIL) {
    return V_NIL;
  }
  const rv = ssxIs(src, body, NT_BEGIN) ? src.a.kid(body, -1) : body;
  return ssxIs(src, rv, NT_LVAR) ? rv : V_NIL;
};

export class CopStyleEachWithObject {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EachWithObject");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      const send = a.kid(n, 0);
      if (!ssxIsCall(src, send) || a.nKid(send) !== 3) {
        continue;
      }
      const m = ssxMeth(src, send);
      if (m !== "inject" && m !== "reduce") {
        continue;
      }
      if (ssxBasicLiteral(src, a.kid(send, 2))) {
        continue;
      }
      const body = a.kid(n, 2);
      const ss = ssxFS(src, send, F_SELECTOR);
      const se = ssxFE(src, send, F_SELECTOR);
      if (t === NT_NUMBLOCK) {
        if (a.text(a.kid(n, 1)) !== "2") {
          continue;
        }
        const rv = ssxEwoReturnValue(src, body);
        if (rv === V_NIL || src.nodeSrc(rv) !== "_1") {
          continue;
        }
        const k = this.c.offense(ss, se);
        if (k === null) {
          continue;
        }
        k.replace(ss, se, "each_with_object");
        for (const v of ssxDescendants(src, body)) {
          if (a.type(v) !== NT_LVAR) {
            continue;
          }
          const vs = src.nodeSrc(v);
          if (vs === "_1") {
            k.replace(a.exS(v), a.exE(v), "_2");
          }
          if (vs === "_2") {
            k.replace(a.exS(v), a.exE(v), "_1");
          }
        }
        this.c.commit(k);
        continue;
      }
      const args = a.kid(n, 1);
      if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 2) {
        continue;
      }
      const rv = ssxEwoReturnValue(src, body);
      if (rv === V_NIL) {
        continue;
      }
      // first_argument_returned?
      const first = a.kid(args, 0);
      const acc = ssxSymText(src, a.kid(first, 0));
      if (acc.length === 0 || acc !== ssxSymText(src, a.kid(rv, 0))) {
        continue;
      }
      // accumulator_param_assigned_to?
      let assigned = false;
      for (const d of ssxDescendants(src, body)) {
        if (ssxAssignment(src, d) && ssxSymText(src, a.kid(d, 0)) === acc) {
          assigned = true;
          break;
        }
      }
      if (assigned) {
        continue;
      }
      const k = this.c.offense(ss, se);
      if (k === null) {
        continue;
      }
      k.replace(ss, se, "each_with_object");
      const second = a.kid(args, 1);
      k.swap(a.exS(first), a.exE(first), a.exS(second), a.exE(second), src.nodeSrc(first), src.nodeSrc(second));
      const ws = ssxWholeLinesS(src, a.exS(rv));
      const we = ssxWholeLinesE(src, a.exE(rv), true);
      if (ssxStripEq(src.src(ws, we), src.nodeSrc(rv))) {
        k.remove(ws, we);
      } else {
        k.remove(a.exS(rv), a.exE(rv));
      }
      this.c.commit(k);
    }
  }
}

/** Whether `s.strip == t` (Ruby's strip: whitespace and NUL). */
export const ssxStripEq = (s: string, t: string): boolean => {
  let i = 0;
  let j = toI32(s.length);
  while (i < j) {
    const c = s.charCodeAt(i);
    if (c === 32 || (c >= 9 && c <= 13) || c === 0) {
      i++;
    } else {
      break;
    }
  }
  while (j > i && j > 0 && j <= s.length) {
    const c = s.charCodeAt(j - 1);
    if (c === 32 || (c >= 9 && c <= 13) || c === 0) {
      j--;
    } else {
      break;
    }
  }
  return s.substring(i, j) === t;
};
