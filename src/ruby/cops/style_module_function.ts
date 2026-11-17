// Style/ModuleFunction (EnforcedStyle: module_function, Autocorrect: false:
// detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_MODULE, NT_SELF, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxMeth } from "./style_syntax_help";

export class CopStyleModuleFunction {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ModuleFunction");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_MODULE)) {
        continue;
      }
      const body = a.kid(n, 1);
      if (body === V_NIL) {
        continue;
      }
      const nodes: i32[] = [];
      if (ssxIs(src, body, NT_BEGIN)) {
        for (let i = 0; i < a.nKid(body); i++) {
          nodes.push(a.kid(body, i));
        }
      } else {
        nodes.push(body);
      }
      // check_module_function: none when a `private` directive is there.
      let priv = false;
      for (const x of nodes) {
        if (ssxIs(src, x, NT_SEND) && a.kid(x, 0) === V_NIL && ssxMeth(src, x) === "private") {
          priv = true;
        }
      }
      if (priv) {
        continue;
      }
      for (const x of nodes) {
        // (send nil? :extend self)
        if (
          ssxIs(src, x, NT_SEND) &&
          a.kid(x, 0) === V_NIL &&
          ssxMeth(src, x) === "extend" &&
          a.nKid(x) === 3 &&
          ssxIs(src, a.kid(x, 2), NT_SELF)
        ) {
          this.c.offense(a.exS(x), a.exE(x));
        }
      }
    }
  }
}
