// Style/RedundantInterpolation (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  NT_ARRAY,
  NT_BACK_REF,
  NT_BEGIN,
  NT_BREAK,
  NT_CVAR,
  NT_DSTR,
  NT_ENSURE,
  NT_GVAR,
  NT_IF,
  NT_IVAR,
  NT_KWBEGIN,
  NT_LVAR,
  NT_MATCH_PATTERN,
  NT_NEXT,
  NT_NTH_REF,
  NT_REDO,
  NT_RESBODY,
  NT_RESCUE,
  NT_RETRY,
  NT_RETURN,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

export class CopStyleRedundantInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantInterpolation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_DSTR) || a.nKid(n) !== 1) {
        continue;
      }
      const e = a.kid(n, 0);
      if (!a.isNode(e)) {
        continue;
      }
      const t = a.type(e);
      // interpolation?: a variable, a reference or a begin
      if (
        t !== NT_LVAR &&
        t !== NT_IVAR &&
        t !== NT_CVAR &&
        t !== NT_GVAR &&
        t !== NT_NTH_REF &&
        t !== NT_BACK_REF &&
        t !== NT_BEGIN
      ) {
        continue;
      }
      const p = src.parent(n);
      if (ssxIs(src, p, NT_DSTR)) {
        continue;
      }
      if (
        ssxIs(src, p, NT_ARRAY) &&
        ssxHas(src, p, F_BEGIN) &&
        src.src(ssxFS(src, p, F_BEGIN), ssxFE(src, p, F_BEGIN)).startsWith("%")
      ) {
        continue;
      }
      if (rbRiVoidValue(src, e)) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}

// void_value? (TargetRubyVersion is at least 3.0, so a match pattern is void).
function rbRiVoidValue(src: RbSource, n: i32): boolean {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_RETURN || t === NT_BREAK || t === NT_NEXT || t === NT_REDO || t === NT_RETRY) {
    return true;
  }
  if (t === NT_MATCH_PATTERN) {
    return true;
  }
  // void_compound_statement?
  if (t === NT_BEGIN || t === NT_KWBEGIN) {
    const k = a.nKid(n);
    return k > 0 && rbRiVoidValue(src, a.kid(n, k - 1));
  }
  if (t === NT_IF) {
    return rbRiVoidValue(src, a.kid(n, 1)) && rbRiVoidValue(src, a.kid(n, 2));
  }
  if (t === NT_RESCUE) {
    // rescue_void_value?
    const k = a.nKid(n);
    if (!rbRiVoidValue(src, a.kid(n, 0))) {
      return false;
    }
    if (ssxHas(src, n, F_ELSE)) {
      return rbRiVoidValue(src, a.kid(n, k - 1));
    }
    for (let i = 1; i < k; i++) {
      const r = a.kid(n, i);
      if (ssxIs(src, r, NT_RESBODY) && !rbRiVoidValue(src, a.kid(r, 2))) {
        return false;
      }
    }
    return true;
  }
  if (t === NT_ENSURE) {
    return rbRiVoidValue(src, a.kid(n, 0)) || rbRiVoidValue(src, a.kid(n, 1));
  }
  return false;
}
