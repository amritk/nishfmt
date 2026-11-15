// Style/CaseLikeIf (MinBranchesCount: 3; unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CONST, NT_ERANGE, NT_IF, NT_IRANGE, NT_MATCH_WITH_LVASGN, NT_OR, NT_REGEXP, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfNamedCaptures, vfSameNode } from "./lint_variable_force";
import { scnElsif, scnModifier, scnTernary, scnUnless } from "./style_cond_help";
import { rbNodeLiteral } from "./style_hash_each_methods";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** const_reference?: a const whose name is longer than one character and all upper case. */
const rbCliConstRef = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const name = src.a.text(src.a.kid(n, 1));
  if (name.length <= 1) {
    return false;
  }
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    if (c >= 97 && c <= 122) {
      return false;
    }
  }
  return true;
};

/** class_reference?: a const whose name has a lower-case letter. */
const rbCliClassRef = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const name = src.a.text(src.a.kid(n, 1));
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    if (c >= 97 && c <= 122) {
      return true;
    }
  }
  return false;
};

/** deparenthesize: the last child of nested begins. */
const rbCliDeparen = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (ssxIs(src, n, NT_BEGIN)) {
    n = src.a.kid(n, -1);
  }
  return n;
};

/** A range node. */
const rbCliRange = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_IRANGE) || ssxIs(src, n, NT_ERANGE);

/** regexp_with_named_captures?. */
const rbCliNamedCaptures = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_REGEXP)) {
    return false;
  }
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (ssxIs(src, src.a.kid(n, i), NT_BEGIN)) {
      return false;
    }
  }
  return vfNamedCaptures(src, n).length > 0;
};

/** The error marker: RuboCop raises (NoMethodError) and adds no offense. */
const RB_CLI_RAISE: i32 = -2;

/** find_target: the target node, V_NIL, or RB_CLI_RAISE. */
const rbCliTarget = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return V_NIL;
  }
  const t = a.type(n);
  if (t === NT_BEGIN) {
    return rbCliTarget(src, a.kid(n, 0));
  }
  if (t === NT_OR) {
    return rbCliTarget(src, a.kid(n, 0));
  }
  if (t === NT_MATCH_WITH_LVASGN) {
    if (ssxIs(src, a.kid(n, 0), NT_REGEXP)) {
      return a.kid(n, 1);
    }
    return ssxIs(src, a.kid(n, 1), NT_REGEXP) ? a.kid(n, 0) : V_NIL;
  }
  if (t !== NT_SEND) {
    return V_NIL;
  }
  const m = ssxMeth(src, n);
  const r = a.kid(n, 0);
  const arg = a.kid(n, 2);
  if (m === "is_a?") {
    return r;
  }
  if (m === "==" || m === "eql?" || m === "equal?") {
    if (arg === V_NIL || r === V_NIL) {
      return V_NIL;
    }
    if (rbNodeLiteral(src, arg) || rbCliConstRef(src, arg)) {
      return r;
    }
    return rbNodeLiteral(src, r) || rbCliConstRef(src, r) ? arg : V_NIL;
  }
  if (m === "===") {
    return arg;
  }
  if (m === "include?" || m === "cover?") {
    if (r === V_NIL) {
      return V_NIL;
    }
    return rbCliRange(src, rbCliDeparen(src, r)) ? arg : V_NIL;
  }
  if (m === "match" || m === "match?" || m === "=~") {
    if (r === V_NIL) {
      return V_NIL;
    }
    if (ssxIs(src, r, NT_REGEXP)) {
      return arg;
    }
    if (arg === V_NIL) {
      return RB_CLI_RAISE;
    }
    return ssxIs(src, arg, NT_REGEXP) ? r : V_NIL;
  }
  return V_NIL;
};

/** condition_from_binary_op: the other operand, V_NIL, or RB_CLI_RAISE. */
const rbCliBinary = (src: RbSource, l0: i32, r0: i32, target: i32): i32 => {
  if (l0 === V_NIL || r0 === V_NIL) {
    return RB_CLI_RAISE;
  }
  const l = rbCliDeparen(src, l0);
  const r = rbCliDeparen(src, r0);
  if (vfSameNode(src, l, target)) {
    return r;
  }
  return vfSameNode(src, r, target) ? l : V_NIL;
};

/** collect_conditions: 1 a condition found, 0 none, RB_CLI_RAISE an error. */
const rbCliCollect = (src: RbSource, n: i32, target: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return 0;
  }
  const t = a.type(n);
  if (t === NT_BEGIN) {
    return rbCliCollect(src, a.kid(n, 0), target);
  }
  if (t === NT_OR) {
    const l = rbCliCollect(src, a.kid(n, 0), target);
    if (l !== 1) {
      return l;
    }
    return rbCliCollect(src, a.kid(n, 1), target);
  }
  let cond = V_NIL;
  if (t === NT_MATCH_WITH_LVASGN) {
    cond = rbCliBinary(src, a.kid(n, 0), a.kid(n, 1), target);
  } else if (t === NT_SEND) {
    const m = ssxMeth(src, n);
    const r = a.kid(n, 0);
    const arg = a.kid(n, 2);
    if (m === "is_a?") {
      cond = vfSameNode(src, r, target) ? arg : V_NIL;
    } else if (m === "==" || m === "eql?" || m === "equal?") {
      cond = rbCliBinary(src, r, arg, target);
      if (cond !== RB_CLI_RAISE && cond !== V_NIL && rbCliClassRef(src, cond)) {
        cond = V_NIL;
      }
    } else if (m === "=~" || m === "match" || m === "match?") {
      cond = rbCliBinary(src, r, arg, target);
    } else if (m === "===") {
      cond = vfSameNode(src, arg, target) ? r : V_NIL;
    } else if (m === "include?" || m === "cover?") {
      if (r !== V_NIL) {
        const d = rbCliDeparen(src, r);
        cond = rbCliRange(src, d) && vfSameNode(src, arg, target) ? d : V_NIL;
      }
    }
  }
  if (cond === RB_CLI_RAISE) {
    return RB_CLI_RAISE;
  }
  return cond !== V_NIL ? 1 : 0;
};

/** regexp_with_working_captures?. */
const rbCliWorkingCaptures = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIs(src, n, NT_MATCH_WITH_LVASGN)) {
    return rbCliNamedCaptures(src, a.kid(n, 0));
  }
  if (ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "match") {
    return rbCliNamedCaptures(src, a.kid(n, 0)) || rbCliNamedCaptures(src, a.kid(n, 2));
  }
  return false;
};

export class CopStyleCaseLikeIf {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CaseLikeIf");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_IF) || scnUnless(src, n) || scnElsif(src, n) || scnModifier(src, n) || scnTernary(src, n)) {
        continue;
      }
      // elsif_conditional? and min_branches_count?: the conditions of the if-elsif chain
      const conds: i32[] = [a.kid(n, 0)];
      let b = a.kid(n, 2);
      while (ssxIs(src, b, NT_IF) && scnElsif(src, b)) {
        conds.push(a.kid(b, 0));
        b = a.kid(b, 2);
      }
      if (conds.length < 3) {
        continue;
      }
      const target = rbCliTarget(src, conds[0]);
      if (target === V_NIL || target === RB_CLI_RAISE) {
        continue;
      }
      let ok = true;
      for (const c of conds) {
        if (rbCliWorkingCaptures(src, c)) {
          ok = false;
          break;
        }
        if (rbCliCollect(src, c, target) !== 1) {
          ok = false;
          break;
        }
      }
      if (ok) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
