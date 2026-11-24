// Style/TrailingUnderscoreVariable (AllowNamedUnderscoreVariables: true).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { atI32, sub32 } from "../../core/arr";
import { F_BEGIN, F_END, F_OPERATOR, NT_ARRAY, NT_LVASGN, NT_MASGN, NT_MLHS, NT_SPLAT, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxFS, ssxHas, ssxLocIs } from "./style_syntax_help";

/** One unneeded range and its replacement. */
class SbhTuRange {
  s: i32;
  e: i32;
  rep: string;

  constructor(s: i32, e: i32, rep: string) {
    this.s = s;
    this.e = e;
    this.rep = rep;
  }
}

/** Whether a variable is `_` or `*_` (AllowNamedUnderscoreVariables). */
const sbhTuUnderscore = (src: RbSource, v: i32): boolean => {
  const a = src.a;
  const t = a.type(v);
  if (t !== NT_LVASGN && t !== NT_SPLAT) {
    return false;
  }
  let x = a.nKid(v) > 0 ? a.kid(v, 0) : V_NIL;
  if (x !== V_NIL && a.isNode(x)) {
    x = a.nKid(x) > 0 ? a.kid(x, 0) : V_NIL;
  }
  if (x === V_NIL || a.isNode(x)) {
    return false;
  }
  return a.text(x) === "_";
};

/** find_first_offense (-1 for none): an index into vars. */
const sbhTuFirstOffense = (src: RbSource, vars: i32[]): i32 => {
  let off = -1;
  for (let i = toI32(vars.length) - 1; i >= 0; i--) {
    if (!sbhTuUnderscore(src, vars[i])) {
      break;
    }
    off = i;
  }
  if (off < 0) {
    return -1;
  }
  // splat_variable_before?: reverse_index finds the last variable == the offense.
  let idx = off;
  const vo = atI32(vars, off);
  for (let i = toI32(vars.length) - 1; i >= 0 && i < vars.length; i--) {
    if (ssxAstEqual(src.a, vars[i], src.a, vo)) {
      idx = i;
      break;
    }
  }
  for (let i = 0; i < idx && i < vars.length; i++) {
    if (src.a.type(vars[i]) === NT_SPLAT) {
      return -1;
    }
  }
  return off;
};

/** unneeded_ranges. */
const sbhTuUnneeded = (src: RbSource, node: i32, out: SbhTuRange[]): void => {
  const a = src.a;
  const masgn = a.type(node) === NT_MASGN;
  const mlhs = masgn ? a.kid(node, 0) : node;
  const vars: i32[] = [];
  for (let i = 0; i < a.nKid(mlhs); i++) {
    vars.push(a.kid(mlhs, i));
  }
  // main_node_offense (computed first, appended last)
  let main: SbhTuRange | null = null;
  const off = sbhTuFirstOffense(src, vars);
  if (off >= 0) {
    const ov = atI32(vars, off);
    const v0 = atI32(vars, 0);
    if (a.exS(ov) === a.exS(v0) && a.exE(ov) === a.exE(v0)) {
      // unused_range
      if (!masgn) {
        main = new SbhTuRange(a.exS(mlhs), a.exE(mlhs), "_");
      } else {
        const rhs = a.kid(node, 1);
        const bracketed =
          ssxLocIs(src, rhs, F_BEGIN, "[") || (ssxHas(src, rhs, F_BEGIN) && src.at(ssxFS(src, rhs, F_BEGIN)) === 37);
        main = new SbhTuRange(a.exS(mlhs), a.exS(rhs), a.type(rhs) === NT_ARRAY && !bracketed ? "[" : "");
      }
    } else if (ssxLocIs(src, mlhs, F_END, ")")) {
      main = new SbhTuRange(sub32(a.exS(ov), 1), sub32(a.exE(mlhs), 1), "");
    } else {
      main = new SbhTuRange(a.exS(ov), ssxFS(src, node, F_OPERATOR), "");
    }
  }
  for (const v of vars) {
    if (a.isNode(v) && a.type(v) === NT_MLHS) {
      sbhTuUnneeded(src, v, out);
    }
  }
  if (main !== null) {
    out.push(main);
  }
};

/** Style/TrailingUnderscoreVariable. */
export class CopStyleTrailingUnderscoreVariable {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrailingUnderscoreVariable");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_MASGN) {
        continue;
      }
      const rs: SbhTuRange[] = [];
      sbhTuUnneeded(src, n, rs);
      for (const r of rs) {
        const k = this.c.offense(r.s, r.e);
        if (k === null) {
          continue;
        }
        k.replace(r.s, r.e, r.rep);
        if (r.rep === "[") {
          k.insertAfter(a.exS(n), a.exE(n), "]");
        }
        this.c.commit(k);
      }
    }
  }
}
