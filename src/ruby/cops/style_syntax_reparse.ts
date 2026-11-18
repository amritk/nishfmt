// RuboCop::Cop::ReparsedEquivalence for corrections that only remove ranges:
// a correction counts only when the corrected source parses to the same AST.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_CLASS, NT_DEF, NT_DEFS, NT_MODULE, NT_SCLASS, RbAst, V_NIL, vTag } from "../ast";
import { RbSource } from "../source";

/** Parser::AST::Node#==: same types and children, locations ignored. */
export const ssxAstEqual = (a1: RbAst, h1: i32, a2: RbAst, h2: i32): boolean => {
  if (vTag(h1) !== vTag(h2)) {
    return false;
  }
  if (!a1.isNode(h1)) {
    return h1 === V_NIL ? h2 === V_NIL : a1.inspect(h1) === a2.inspect(h2);
  }
  if (a1.type(h1) !== a2.type(h2) || a1.nKid(h1) !== a2.nKid(h2)) {
    return false;
  }
  for (let i = 0; i < a1.nKid(h1); i++) {
    if (!ssxAstEqual(a1, a1.kid(h1, i), a2, a2.kid(h2, i))) {
      return false;
    }
  }
  return true;
};

/** Whether the code points [s, e) contain the ASCII text `lit`. */
const ssxRangeIncludes = (src: RbSource, s: i32, e: i32, lit: string): boolean => {
  const k = toI32(lit.length);
  for (let i = s; i + k <= e; i++) {
    let ok = true;
    for (let j = 0; j < k; j++) {
      if (src.at(i + j) !== lit.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
};

/** reparse_scope: the innermost def, defs, class, module or sclass on the path to the range (V_NIL: none). */
const ssxReparseScope = (src: RbSource, s: i32, e: i32): i32 => {
  const a = src.a;
  let node = src.root;
  let scope = V_NIL;
  while (node !== V_NIL && a.isNode(node)) {
    const t = a.type(node);
    if (t === NT_DEF || t === NT_DEFS || t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
      scope = node;
    }
    let next = V_NIL;
    for (let i = 0; i < a.nKid(node); i++) {
      const c = a.kid(node, i);
      if (a.isNode(c) && a.exS(c) >= 0 && a.exS(c) <= s && e <= a.exE(c)) {
        next = c;
        break;
      }
    }
    node = next;
  }
  return scope;
};

/** corrections_verify? for the removals [ss[i], es[i]) of the items `idx`. */
const ssxRemovalsVerify = (src: RbSource, scope: i32, ss: i32[], es: i32[], idx: i32[]): boolean => {
  const drop: boolean[] = [];
  for (let i = 0; i < src.n; i++) {
    drop.push(false);
  }
  for (const i of idx) {
    for (let p = ss[i]; p < es[i]; p++) {
      drop[p] = true;
    }
  }
  let from = 0;
  let to = src.n;
  if (scope !== V_NIL) {
    from = src.a.exS(scope);
    to = src.a.exE(scope);
  }
  // corrected[scope.begin ... scope.end + delta]: the removals lie inside the scope.
  const pts: i32[] = [];
  for (let p = from; p < to; p++) {
    if (!drop[p]) {
      pts.push(src.pts[p]);
    }
  }
  const path = src.p.st.path;
  let origA: RbAst = src.a;
  let origRoot = scope === V_NIL ? src.root : scope;
  if (ssxRangeIncludes(src, from, to, "__LINE__")) {
    const op: i32[] = [];
    for (let p = from; p < to; p++) {
      op.push(src.pts[p]);
    }
    const os = new RbSource(op, path);
    if (!os.valid) {
      return false;
    }
    origA = os.a;
    origRoot = os.root;
  }
  if (origRoot === V_NIL) {
    return false;
  }
  const rs = new RbSource(pts, path);
  if (!rs.valid || rs.root === V_NIL) {
    return false;
  }
  return ssxAstEqual(origA, origRoot, rs.a, rs.root);
};

/** verified_subset. */
const ssxVerifiedSubset = (src: RbSource, scope: i32, ss: i32[], es: i32[], group: i32[], out: i32[]): void => {
  if (ssxRemovalsVerify(src, scope, ss, es, group)) {
    for (const i of group) {
      out.push(i);
    }
    return;
  }
  if (group.length === 1) {
    return;
  }
  const half = toI32(group.length) / 2;
  const g1: i32[] = [];
  const g2: i32[] = [];
  for (let i = 0; i < toI32(group.length); i++) {
    if (i < half) {
      g1.push(group[i]);
    } else {
      g2.push(group[i]);
    }
  }
  ssxVerifiedSubset(src, scope, ss, es, g1, out);
  ssxVerifiedSubset(src, scope, ss, es, g2, out);
};

/**
 * ReparsedEquivalence#verified_by_reparse (oversized: :report) for items whose
 * correction removes [ss[i], es[i]): the indexes of the verified items, grouped
 * by reparse scope in first-seen order.
 */
export const ssxVerifiedRemovals = (src: RbSource, ss: i32[], es: i32[]): i32[] => {
  const scopes: i32[] = [];
  const groups: i32[][] = [];
  for (let i = 0; i < toI32(ss.length); i++) {
    const sc = ssxReparseScope(src, ss[i], es[i]);
    let g = -1;
    for (let j = 0; j < toI32(scopes.length); j++) {
      if (scopes[j] === sc) {
        g = j;
        break;
      }
    }
    if (g < 0) {
      scopes.push(sc);
      const fresh: i32[] = [];
      groups.push(fresh);
      g = toI32(scopes.length) - 1;
    }
    groups[g].push(i);
  }
  const out: i32[] = [];
  for (let j = 0; j < toI32(scopes.length); j++) {
    const sc = scopes[j];
    const size = sc === V_NIL ? src.n : src.a.exE(sc) - src.a.exS(sc);
    if (size > 64 * 1024) {
      for (const i of groups[j]) {
        out.push(i);
      }
      continue;
    }
    ssxVerifiedSubset(src, sc, ss, es, groups[j], out);
  }
  return out;
};
