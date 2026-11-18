// Lint/SendWithMixinArgument.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_CONST, NT_SELF, NT_SEND, NT_STR, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFS, ssxInList, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintSendWithMixinArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/SendWithMixinArgument");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || !ssxInList(" send public_send __send__ ", ssxMeth(src, n))) {
        continue;
      }
      const r = a.kid(n, 0);
      if (!(r === V_NIL || ssxIs(src, r, NT_SELF) || ssxIs(src, r, NT_CONST))) {
        continue;
      }
      if (a.nKid(n) < 4) {
        continue;
      }
      const m = a.kid(n, 2);
      if (!(ssxIs(src, m, NT_SYM) || ssxIs(src, m, NT_STR))) {
        continue;
      }
      const method = a.text(a.kid(m, 0));
      if (!ssxInList(" include prepend extend ", method)) {
        continue;
      }
      const names: string[] = [];
      let ok = true;
      for (let i = 3; i < a.nKid(n); i++) {
        const c = a.kid(n, i);
        if (!ssxIs(src, c, NT_CONST)) {
          ok = false;
          break;
        }
        names.push(src.nodeSrc(c));
      }
      if (!ok) {
        continue;
      }
      const s = ssxFS(src, n, F_SELECTOR);
      const k = this.c.offense(s, a.exE(n));
      if (k !== null) {
        k.replace(s, a.exE(n), `${method} ${names.join(", ")}`);
        this.c.commit(k);
      }
    }
  }
}
