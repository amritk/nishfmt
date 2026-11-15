// Bundler/InsecureProtocolSource (AllowHttpProtocol: true, so only the
// deprecated symbol sources are corrected). Gemfiles only.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbGemfileIncluded } from "./bundler_gem_help";

export class CopBundlerInsecureProtocolSource {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Bundler/InsecureProtocolSource");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemfileIncluded(src.p.st.path)) {
      return;
    }
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) !== 3 || a.text(a.kid(n, 1)) !== "source") {
        continue;
      }
      // (sym {:gemcutter :rubygems :rubyforge}); the str "http://rubygems.org" is allowed.
      const arg = a.kid(n, 2);
      if (!a.isNode(arg) || a.type(arg) !== NT_SYM) {
        continue;
      }
      const v = a.text(a.kid(arg, 0));
      if (v !== "gemcutter" && v !== "rubygems" && v !== "rubyforge") {
        continue;
      }
      const k = this.c.offense(a.exS(arg), a.exE(arg));
      if (k !== null) {
        k.replace(a.exS(arg), a.exE(arg), "'https://rubygems.org'");
        this.c.commit(k);
      }
    }
  }
}
