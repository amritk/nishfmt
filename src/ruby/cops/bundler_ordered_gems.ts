// Bundler/OrderedGems. Gemfiles only.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbGemConsecutive, rbGemName, rbGemOutOfOrder, rbGemRegister, rbGemfileIncluded } from "./bundler_gem_help";

export class CopBundlerOrderedGems {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Bundler/OrderedGems");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemfileIncluded(src.p.st.path) || src.root === V_NIL) {
      return;
    }
    const a = src.a;
    // gem_declarations: (send nil? :gem str ...)
    const decls: i32[] = [];
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) < 3 || a.text(a.kid(n, 1)) !== "gem") {
        continue;
      }
      const g = a.kid(n, 2);
      if (a.isNode(g) && a.type(g) === NT_STR) {
        decls.push(n);
      }
    }
    for (let i = 1; i < toI32(decls.length); i++) {
      const prev = decls[i - 1];
      const cur = decls[i];
      if (rbGemConsecutive(src, prev, cur) && rbGemOutOfOrder(rbGemName(src, cur), rbGemName(src, prev))) {
        rbGemRegister(this.c, src, prev, cur);
      }
    }
  }
}
