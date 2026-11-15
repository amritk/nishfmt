// Style/LambdaCall (EnforcedStyle: call).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, F_HEREDOC_BODY, F_HEREDOC_END, NT_DSTR, NT_STR, NT_XSTR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDescendants, ssxFE, ssxFS, ssxHas, ssxIsCall, ssxMeth, ssxSelS } from "./style_syntax_help";

/** Whether n or a descendant is a heredoc string. */
const ssxLcHeredoc = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const all = ssxDescendants(src, n);
  all.push(n);
  for (const d of all) {
    const t = a.type(d);
    if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && ssxHas(src, d, F_HEREDOC_BODY)) {
      return true;
    }
  }
  return false;
};

export class CopStyleLambdaCall {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/LambdaCall");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    // ignore_node: [start, end] of the nodes corrected so far.
    const igS: i32[] = [];
    const igE: i32[] = [];
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || ssxMeth(src, n) !== "call" || a.kid(n, 0) === V_NIL) {
        continue;
      }
      const s = a.exS(n);
      const e = a.exE(n);
      let comment = false;
      for (let i = 0; i < toI32(src.commS.length); i++) {
        if (s <= src.commS[i] && src.commE[i] <= e) {
          comment = true;
        }
      }
      if (comment) {
        continue;
      }
      let heredoc = false;
      for (let i = 2; i < a.nKid(n); i++) {
        if (ssxLcHeredoc(src, a.kid(n, i))) {
          heredoc = true;
        }
      }
      if (heredoc) {
        continue;
      }
      // implicit_call?
      if (ssxSelS(src, n) >= 0) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      let ignored = false;
      for (let i = 0; i < toI32(igS.length); i++) {
        if (igS[i] <= s && igE[i] >= e) {
          ignored = true;
        }
      }
      if (ignored) {
        continue;
      }
      const parts: string[] = [];
      for (let i = 2; i < a.nKid(n); i++) {
        parts.push(src.nodeSrc(a.kid(n, i)));
      }
      const args = parts.length === 0 ? "" : `(${parts.join(", ")})`;
      k.replace(s, e, `${src.nodeSrc(a.kid(n, 0))}${src.src(ssxFS(src, n, F_DOT), ssxFE(src, n, F_DOT))}call${args}`);
      igS.push(s);
      igE.push(ssxHas(src, n, F_HEREDOC_END) ? ssxFE(src, n, F_HEREDOC_END) : e);
      this.c.commit(k);
    }
  }
}
