// Style/SpecialGlobalVars (EnforcedStyle: use_english_names; its correction
// is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_GVAR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxInList, ssxIs } from "./style_syntax_help";

// The Perl names ENGLISH_VARS maps to English ones.
const RB_SGV_PERL: string = " $: $\" $0 $! $@ $; $, $/ $\\ $. $_ $> $< $$ $? $~ $= $* ";

export class CopStyleSpecialGlobalVars {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SpecialGlobalVars");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_GVAR) && ssxInList(RB_SGV_PERL, a.text(a.kid(n, 0)))) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
