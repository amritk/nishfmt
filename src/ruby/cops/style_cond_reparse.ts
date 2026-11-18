// What the Style cops about conditionals use to check a correction by
// reparsing it: ReparsedEquivalence (verified_by_reparse, correction_parses?)
// for corrections of any shape, given as a corrector.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CLASS, NT_DEF, NT_DEFS, NT_MODULE, NT_SCLASS, RbAst, V_NIL, vTag } from "../ast";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";

/** UTF-8 bytes of a nish string to code points. */
export const scnDecode = (s: string): i32[] => {
  const out: i32[] = [];
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
      i++;
      continue;
    }
    let k = 0;
    let v = 0;
    if (c >= 0xf0) {
      k = 3;
      v = c & 0x07;
    } else if (c >= 0xe0) {
      k = 2;
      v = c & 0x0f;
    } else {
      k = 1;
      v = c & 0x1f;
    }
    for (let j = 1; j <= k && i + j < n; j++) {
      v = (v << 6) | (s.charCodeAt(i + j) & 0x3f);
    }
    out.push(v);
    i += k + 1;
  }
  return out;
};

/** correction_parses?: the source corrected by `rw` is valid syntax. */
export const scnCorrectionParses = (src: RbSource, rw: RbRewriter): boolean => {
  const rs = new RbSource(scnDecode(rw.process(src.pts)), src.p.st.path);
  return rs.valid;
};

/** normalize_reparsed_ast for TernaryParentheses: a begin with one node child is that child. */
const scnUnwrapBegin = (a: RbAst, h0: i32): i32 => {
  let h = h0;
  while (a.isNode(h) && a.type(h) === NT_BEGIN && a.nKid(h) === 1 && a.isNode(a.kid(h, 0))) {
    h = a.kid(h, 0);
  }
  return h;
};

/** Parser::AST::Node#== of two ASTs (unwrap: normalized by unwrapping single-node begins). */
export const scnAstEqual = (a1: RbAst, h10: i32, a2: RbAst, h20: i32, unwrap: boolean): boolean => {
  const h1 = unwrap ? scnUnwrapBegin(a1, h10) : h10;
  const h2 = unwrap ? scnUnwrapBegin(a2, h20) : h20;
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
    if (!scnAstEqual(a1, a1.kid(h1, i), a2, a2.kid(h2, i), unwrap)) {
      return false;
    }
  }
  return true;
};

/** ReparsedEquivalence#reparse_scope: the innermost def/defs/class/module/sclass containing [s, e) (V_NIL: none). */
export const scnReparseScope = (src: RbSource, s: i32, e: i32): i32 => {
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

/** Whether the code points [s, e) contain `__LINE__`. */
const scnHasLineKw = (src: RbSource, s: i32, e: i32): boolean => {
  const lit = "__LINE__";
  for (let i = s; i + 8 <= e; i++) {
    let ok = true;
    for (let j = 0; j < 8; j++) {
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

/**
 * ReparsedEquivalence#verified_by_reparse for one item at [s, e) whose
 * correction is `rw`: whether the corrected scope parses to the same
 * (normalized) AST. An oversized scope counts as verified.
 */
export const scnVerifiedByReparse = (src: RbSource, rw: RbRewriter, s: i32, e: i32, unwrap: boolean): boolean => {
  const scope = scnReparseScope(src, s, e);
  const from = scope === V_NIL ? 0 : src.a.exS(scope);
  const to = scope === V_NIL ? src.n : src.a.exE(scope);
  if (to - from > 64 * 1024) {
    return true;
  }
  const corrected = scnDecode(rw.process(src.pts));
  const delta = toI32(corrected.length) - src.n;
  const frag: i32[] = [];
  for (let p = from; p < to + delta && p < toI32(corrected.length); p++) {
    frag.push(corrected[p]);
  }
  const path = src.p.st.path;
  let origA: RbAst = src.a;
  let origRoot = scope === V_NIL ? src.root : scope;
  if (scnHasLineKw(src, from, to)) {
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
  const rs = new RbSource(frag, path);
  if (!rs.valid) {
    return false;
  }
  return scnAstEqual(origA, origRoot, rs.a, rs.root, unwrap);
};
