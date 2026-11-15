// Style/SingleArgumentDig (Style/DigChain counts as enabled; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK_PASS, NT_FORWARDED_ARGS, NT_FORWARDED_RESTARG, NT_HASH, NT_SEND, NT_SPLAT, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** DigHelp#dig?: (call _ :dig !{hash block_pass}+). */
const rbSadDig = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!ssxIsCall(src, n) || ssxMeth(src, n) !== "dig" || a.nKid(n) < 3) {
    return false;
  }
  for (let i = 2; i < a.nKid(n); i++) {
    if (ssxIs(src, a.kid(n, i), NT_HASH) || ssxIs(src, a.kid(n, i), NT_BLOCK_PASS)) {
      return false;
    }
  }
  return true;
};

export class CopStyleSingleArgumentDig {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SingleArgumentDig");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "dig" || a.kid(n, 0) === V_NIL || a.nKid(n) !== 3) {
        continue;
      }
      const x = a.kid(n, 2);
      if (!a.isNode(x)) {
        continue;
      }
      const t = a.type(x);
      if (t === NT_SPLAT || t === NT_BLOCK_PASS || t === NT_FORWARDED_RESTARG || t === NT_FORWARDED_ARGS || t === NT_HASH) {
        continue;
      }
      // ignore_dig_chain?: Style/DigChain's Enabled is `pending`, which cop_enabled? takes as true.
      if (rbSadDig(src, a.kid(n, 0)) || rbSadDig(src, src.parent(n))) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
