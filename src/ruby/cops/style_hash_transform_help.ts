// HashTransformMethod (Style/HashTransformKeys, Style/HashTransformValues):
// the offenses, without the corrections (both cops are unsafe).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_ARG,
  NT_ARGS,
  NT_ARRAY,
  NT_BLOCK,
  NT_CONST,
  NT_CSEND,
  NT_HASH,
  NT_LVAR,
  NT_MLHS,
  NT_SEND,
  NT_SPLAT,
  V_NIL,
  VT_SYM,
  vTag,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { ssxDescendants, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** NodePattern's descend: whether n or anything under it (symbols included) is the symbol `name`. */
export const rbHtmContainsSym = (src: RbSource, n: i32, name: string): boolean => {
  const a = src.a;
  if (n === V_NIL) {
    return false;
  }
  if (!a.isNode(n)) {
    return vTag(n) === VT_SYM && a.text(n) === name;
  }
  for (let i = 0; i < a.nKid(n); i++) {
    if (rbHtmContainsSym(src, a.kid(n, i), name)) {
      return true;
    }
  }
  return false;
};

/** (hash) with no pairs. */
const rbHtmEmptyHash = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_HASH) && src.a.nKid(n) === 0;

/** hash_receiver?. */
export const rbHtmHashReceiver = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  if (a.type(n) === NT_HASH) {
    return true;
  }
  if (a.type(n) === NT_SEND) {
    const m = ssxMeth(src, n);
    return (
      m === "to_h" ||
      m === "to_hash" ||
      m === "merge" ||
      m === "merge!" ||
      m === "update" ||
      m === "invert" ||
      m === "except" ||
      m === "tally"
    );
  }
  if (a.type(n) === NT_BLOCK) {
    const s = a.kid(n, 0);
    if (!ssxIs(src, s, NT_SEND)) {
      return false;
    }
    const m = ssxMeth(src, s);
    if (a.nKid(s) === 2) {
      return (
        m === "group_by" ||
        m === "to_h" ||
        m === "tally" ||
        m === "transform_keys" ||
        m === "transform_keys!" ||
        m === "transform_values" ||
        m === "transform_values!"
      );
    }
    return m === "each_with_object" && a.nKid(s) === 3 && rbHtmEmptyHash(src, a.kid(s, 2));
  }
  return false;
};

/** (arg $_): the argument name, or "" when n is not a plain arg. */
const rbHtmArgName = (src: RbSource, n: i32): string => (ssxIs(src, n, NT_ARG) ? src.a.text(src.a.kid(n, 0)) : "");

/** (lvar name). */
const rbHtmLvar = (src: RbSource, n: i32, name: string): boolean =>
  ssxIs(src, n, NT_LVAR) && src.a.text(src.a.kid(n, 0)) === name;

/** A matched transformation: the transformed argument name, the transforming and the unchanged body expressions. */
export class RbHtmMatch {
  arg: string;
  body: i32;
  other: i32;

  constructor(arg: string, body: i32, other: i32) {
    this.arg = arg;
    this.body = body;
    this.other = other;
  }
}

/**
 * The (block (call #hash_receiver? :map|:collect|:to_h) (args (arg k) (arg v)) (array K V))
 * forms: the match, or null. `meth` is "map" (map or collect) or "to_h".
 */
const rbHtmPairBlock = (src: RbSource, blk: i32, meth: string, keys: boolean): RbHtmMatch | null => {
  const a = src.a;
  if (!ssxIs(src, blk, NT_BLOCK)) {
    return null;
  }
  const s = a.kid(blk, 0);
  if (!ssxIsCall(src, s) || a.nKid(s) !== 2 || !rbHtmHashReceiver(src, a.kid(s, 0))) {
    return null;
  }
  const m = ssxMeth(src, s);
  if (meth === "map" ? m !== "map" && m !== "collect" : m !== meth) {
    return null;
  }
  const args = a.kid(blk, 1);
  if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 2) {
    return null;
  }
  const k = rbHtmArgName(src, a.kid(args, 0));
  const v = rbHtmArgName(src, a.kid(args, 1));
  if (k.length === 0 || v.length === 0) {
    return null;
  }
  const body = a.kid(blk, 2);
  if (!ssxIs(src, body, NT_ARRAY) || a.nKid(body) !== 2) {
    return null;
  }
  const e0 = a.kid(body, 0);
  const e1 = a.kid(body, 1);
  if (keys) {
    return rbHtmLvar(src, e1, v) ? new RbHtmMatch(k, e0, e1) : null;
  }
  return rbHtmLvar(src, e0, k) ? new RbHtmMatch(v, e1, e0) : null;
};

/** on_bad_each_with_object. */
const rbHtmEachWithObject = (src: RbSource, blk: i32, keys: boolean): RbHtmMatch | null => {
  const a = src.a;
  if (!ssxIs(src, blk, NT_BLOCK)) {
    return null;
  }
  const s = a.kid(blk, 0);
  if (
    !ssxIsCall(src, s) ||
    ssxMeth(src, s) !== "each_with_object" ||
    a.nKid(s) !== 3 ||
    !rbHtmEmptyHash(src, a.kid(s, 2))
  ) {
    return null;
  }
  if (!rbHtmHashReceiver(src, a.kid(s, 0))) {
    return null;
  }
  const args = a.kid(blk, 1);
  if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 2) {
    return null;
  }
  const ml = a.kid(args, 0);
  if (!ssxIs(src, ml, NT_MLHS) || a.nKid(ml) !== 2) {
    return null;
  }
  const k = rbHtmArgName(src, a.kid(ml, 0));
  const v = rbHtmArgName(src, a.kid(ml, 1));
  const memo = rbHtmArgName(src, a.kid(args, 1));
  if (k.length === 0 || v.length === 0 || memo.length === 0) {
    return null;
  }
  const body = a.kid(blk, 2);
  if (
    !ssxIsCall(src, body) ||
    ssxMeth(src, body) !== "[]=" ||
    a.nKid(body) !== 4 ||
    !rbHtmLvar(src, a.kid(body, 0), memo)
  ) {
    return null;
  }
  const x = a.kid(body, 2);
  const y = a.kid(body, 3);
  if (keys) {
    if (rbHtmContainsSym(src, x, memo) || !rbHtmLvar(src, y, v)) {
      return null;
    }
    return new RbHtmMatch(k, x, y);
  }
  if (!rbHtmLvar(src, x, k) || rbHtmContainsSym(src, y, memo)) {
    return null;
  }
  return new RbHtmMatch(v, y, x);
};

/** handle_possible_offense's tests. */
const rbHtmOffending = (src: RbSource, m: RbHtmMatch): boolean => {
  const a = src.a;
  if (rbHtmLvar(src, m.body, m.arg)) {
    return false;
  }
  let ds: i32[] = [];
  if (a.isNode(m.body)) {
    ds = ssxDescendants(src, m.body);
  }
  for (const d of ds) {
    if (vfSameNode(src, d, m.other)) {
      return false;
    }
  }
  let uses = false;
  for (const d of ds) {
    if (a.type(d) === NT_LVAR && src.nodeSrc(d) === m.arg) {
      uses = true;
    }
  }
  return uses && !ssxIs(src, m.body, NT_SPLAT);
};

/** The HashTransformMethod offenses (keys: HashTransformKeys, else HashTransformValues). */
export const rbHtmRun = (src: RbSource, c: RbCop, keys: boolean): void => {
  const a = src.a;
  for (const n of src.pre) {
    if (!a.isNode(n)) {
      continue;
    }
    const t = a.type(n);
    if (t === NT_BLOCK) {
      const m1 = rbHtmEachWithObject(src, n, keys);
      if (m1 !== null && rbHtmOffending(src, m1)) {
        c.note(a.exS(n), a.exE(n));
      }
      const m2 = rbHtmPairBlock(src, n, "to_h", keys);
      if (m2 !== null && rbHtmOffending(src, m2)) {
        c.note(a.exS(n), a.exE(n));
      }
    } else if (t === NT_SEND || t === NT_CSEND) {
      const meth = ssxMeth(src, n);
      if (t === NT_SEND && meth === "[]" && a.nKid(n) === 3) {
        const r = a.kid(n, 0);
        if (ssxIs(src, r, NT_CONST) && a.text(a.kid(r, 1)) === "Hash") {
          const m3 = rbHtmPairBlock(src, a.kid(n, 2), "map", keys);
          if (m3 !== null && rbHtmOffending(src, m3)) {
            c.note(a.exS(n), a.exE(n));
          }
        }
      }
      if (meth === "to_h" && a.nKid(n) === 2) {
        const m4 = rbHtmPairBlock(src, a.kid(n, 0), "map", keys);
        if (m4 !== null && rbHtmOffending(src, m4)) {
          c.note(a.exS(n), a.exE(n));
        }
      }
    }
  }
};
