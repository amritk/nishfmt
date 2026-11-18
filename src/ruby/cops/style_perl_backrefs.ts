// Style/PerlBackrefs.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BACK_REF, NT_CLASS, NT_DSTR, NT_GVAR, NT_MODULE, NT_NTH_REF, NT_REGEXP, NT_XSTR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopStylePerlBackrefs {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/PerlBackrefs");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BACK_REF && t !== NT_GVAR && t !== NT_NTH_REF) {
        continue;
      }
      const first = a.text(a.kid(n, 0));
      let pref = "";
      if (t === NT_NTH_REF) {
        pref = `Regexp.last_match(${first})`;
      } else if (first === "$&" || first === "$MATCH") {
        pref = "Regexp.last_match(0)";
      } else if (first === "$`" || first === "$PREMATCH") {
        pref = "Regexp.last_match.pre_match";
      } else if (first === "$'" || first === "$POSTMATCH") {
        pref = "Regexp.last_match.post_match";
      } else {
        continue;
      }
      // constant_prefix
      let p = src.parent(n);
      while (p !== V_NIL) {
        if (a.type(p) === NT_CLASS || a.type(p) === NT_MODULE) {
          pref = `::${pref}`;
          break;
        }
        p = src.parent(p);
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const par = src.parent(n);
      if (par !== V_NIL && (a.type(par) === NT_DSTR || a.type(par) === NT_REGEXP || a.type(par) === NT_XSTR)) {
        pref = `{${pref}}`;
      }
      k.replace(a.exS(n), a.exE(n), pref);
      this.c.commit(k);
    }
  }
}
