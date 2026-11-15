// Naming/VariableNumber (detection only; EnforcedStyle: normalcase,
// CheckMethodNames: true, CheckSymbols: true, the default
// AllowedIdentifiers, AllowedPatterns: []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_ARG, NT_CVASGN, NT_DEF, NT_DEFS, NT_GVASGN, NT_IVASGN, NT_LVASGN, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhAsciiDigit, nmhClassEmitter, nmhCps } from "./naming_help";
import { ssxDefName, ssxFE, ssxFS, ssxInList } from "./style_syntax_help";

/** allowed_identifier?: without `@` and `$`, one of AllowedIdentifiers. */
const nvnAllowed = (name: string): boolean => {
  const out: string[] = [];
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    if (c !== 64 && c !== 36) {
      out.push(name.substring(i, i + 1));
    }
  }
  return ssxInList(" TLS1_1 TLS1_2 capture3 iso8601 rfc1123_date rfc822 rfc2822 rfc3339 x86_64 ", out.join(""));
};

/** normalcase: `/(?:\D|[^_\d]\d+|\A\d+)\z|\A_\d+\z/`. */
const nvnNormalcase = (name: string): boolean => {
  const cs = nmhCps(name);
  const n = cs.length;
  if (n === 0) {
    return false;
  }
  if (!nmhAsciiDigit(cs[n - 1])) {
    return true;
  }
  let k = n - 1;
  while (k > 0 && nmhAsciiDigit(cs[k - 1])) {
    k--;
  }
  if (k === 0 || cs[k - 1] !== 95) {
    return true;
  }
  return k === 1;
};

export class CopNamingVariableNumber {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/VariableNumber");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_ARG || t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN) {
        const name = a.text(a.kid(n, 0));
        if (!nvnAllowed(name) && !nvnNormalcase(name)) {
          this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
        }
      } else if (t === NT_DEF || t === NT_DEFS) {
        const name = ssxDefName(src, n);
        if (!nvnAllowed(name) && !nvnNormalcase(name) && !nmhClassEmitter(src, n, name)) {
          this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
        }
      } else if (t === NT_SYM) {
        const h = a.kid(n, 0);
        const name = h === V_NIL ? "" : a.text(h);
        if (name.length > 0 && !nvnAllowed(name) && !nvnNormalcase(name)) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      }
    }
  }
}
