// Style/AccessModifierDeclarations (EnforcedStyle: group, AllowModifiersOn
// Symbols/Attrs/AliasMethod: true; its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_SELECTOR, NT_ARRAY, NT_BLOCK, NT_CONST, NT_IF, NT_NUMBLOCK, NT_PAIR, NT_SEND, NT_SPLAT, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAccessModifier, ssxFE, ssxFS, ssxHas, ssxIs, ssxMeth } from "./style_syntax_help";

/** access_modifier_with_symbol?: only symbol arguments, or one splat of a %i[] array, a const or a send. */
const rbAmdWithSymbol = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const k = a.nKid(n);
  if (k < 3) {
    return false;
  }
  let allSym = true;
  for (let i = 2; i < k; i++) {
    if (!ssxIs(src, a.kid(n, i), NT_SYM)) {
      allSym = false;
    }
  }
  if (allSym) {
    return true;
  }
  if (k !== 3 || !ssxIs(src, a.kid(n, 2), NT_SPLAT)) {
    return false;
  }
  const x = a.kid(a.kid(n, 2), 0);
  if (ssxIs(src, x, NT_CONST) || ssxIs(src, x, NT_SEND)) {
    return true;
  }
  // percent_symbol_array?: an array whose opening starts with %i or %I
  if (!ssxIs(src, x, NT_ARRAY) || !ssxHas(src, x, F_BEGIN)) {
    return false;
  }
  const b = src.src(ssxFS(src, x, F_BEGIN), ssxFE(src, x, F_BEGIN));
  return b.startsWith("%i") || b.startsWith("%I");
};

/** (send nil? <names> <args>): one argument that is a receiverless send named in `names` with `argc` arguments (-1: any, at least one). */
const rbAmdWrapped = (src: RbSource, n: i32, names: string, argc: i32): boolean => {
  const a = src.a;
  if (a.nKid(n) !== 3) {
    return false;
  }
  const x = a.kid(n, 2);
  if (!ssxIs(src, x, NT_SEND) || a.kid(x, 0) !== V_NIL || names.indexOf(` ${ssxMeth(src, x)} `) < 0) {
    return false;
  }
  const k = a.nKid(x) - 2;
  return argc < 0 ? k >= 1 : k === argc;
};

/** allowed?. */
const rbAmdAllowed = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!ssxAccessModifier(src, n)) {
    return true;
  }
  const p = src.parent(n);
  if (ssxIs(src, p, NT_PAIR) || ssxIs(src, p, NT_BLOCK) || ssxIs(src, p, NT_NUMBLOCK)) {
    return true;
  }
  const sym = rbAmdWithSymbol(src, n);
  // dynamic_method_list?
  for (let i = 2; i < a.nKid(n); i++) {
    if (ssxIs(src, a.kid(n, i), NT_SPLAT) && !sym) {
      return true;
    }
  }
  return sym || rbAmdWrapped(src, n, " attr attr_reader attr_writer attr_accessor ", -1) || rbAmdWrapped(src, n, " alias_method ", 2);
};

export class CopStyleAccessModifierDeclarations {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/AccessModifierDeclarations");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || rbAmdAllowed(src, n)) {
        continue;
      }
      const p = src.parent(n);
      if (p !== V_NIL ? ssxIs(src, p, NT_IF) : rbAmdWithSymbol(src, n)) {
        continue;
      }
      if (a.nKid(n) < 3) {
        continue;
      }
      // right_siblings_same_inline_method? (a right sibling that is no node raises: no offense)
      let skip = false;
      if (p !== V_NIL) {
        let after = false;
        for (let i = 0; i < a.nKid(p); i++) {
          const s = a.kid(p, i);
          if (!after) {
            after = s === n;
            continue;
          }
          if (!a.isNode(s)) {
            skip = true;
            break;
          }
          if (ssxIs(src, s, NT_SEND) && !rbAmdAllowed(src, s) && a.nKid(s) >= 3 && a.kid(s, 2) !== V_NIL && ssxMeth(src, s) === ssxMeth(src, n)) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      }
    }
  }
}
