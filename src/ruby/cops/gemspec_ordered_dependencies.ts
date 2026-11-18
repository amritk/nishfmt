// Gemspec/OrderedDependencies. Gemspecs only.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_LVAR, NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbGemConsecutive, rbGemName, rbGemOutOfOrder, rbGemRegister, rbGemspecIncluded } from "./bundler_gem_help";

export class CopGemspecOrderedDependencies {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Gemspec/OrderedDependencies");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemspecIncluded(src.p.st.path) || src.root === V_NIL) {
      return;
    }
    const a = src.a;
    // dependency_declarations:
    // (send (lvar _) {:add_dependency :add_runtime_dependency :add_development_dependency} (str _) ...)
    const decls: i32[] = [];
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.nKid(n) < 3) {
        continue;
      }
      const r = a.kid(n, 0);
      const m = a.text(a.kid(n, 1));
      const g = a.kid(n, 2);
      if (!a.isNode(r) || a.type(r) !== NT_LVAR || !a.isNode(g) || a.type(g) !== NT_STR) {
        continue;
      }
      if (m === "add_dependency" || m === "add_runtime_dependency" || m === "add_development_dependency") {
        decls.push(n);
      }
    }
    for (let i = 1; i < toI32(decls.length); i++) {
      const prev = decls[i - 1];
      const cur = decls[i];
      if (!rbGemConsecutive(src, prev, cur) || !rbGemOutOfOrder(rbGemName(src, cur), rbGemName(src, prev))) {
        continue;
      }
      if (a.text(a.kid(prev, 1)) === a.text(a.kid(cur, 1))) {
        rbGemRegister(this.c, src, prev, cur);
      }
    }
  }
}
