// Style/SafeNavigation (ConvertCodeThatCanStartToReturnNil: false,
// MaxChainLength: 2, AllowedMethods: present? blank? presence try try!; its
// correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { faulted } from "../../core/fault";
import { add32 } from "../../core/arr";
import {
  F_DOT,
  F_ELSE,
  F_OPERATOR,
  NT_AND,
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_CSEND,
  NT_DEFS,
  NT_IF,
  NT_NEXT,
  NT_NIL,
  NT_NUMBLOCK,
  NT_RETURN,
  NT_SEND,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { sbhOperatorMethod } from "./style_body_help";
import { scnElsif, scnTernary, scnUnless } from "./style_cond_help";
import { ssxDescendants, ssxFS, ssxHas, ssxInList, ssxIs, ssxIsCall, ssxLocIs, ssxMeth } from "./style_syntax_help";

// NilMethods#nil_methods under RuboCop (nil.methods with rubocop loaded, to_d, AllowedMethods).
const RB_SN_NIL_METHODS: string =
  " ! != !~ & <=> == === =~ ^ __id__ __send__ blank? class clone define_singleton_method display dup enum_for eql? equal?" +
  " extend freeze frozen? hash inspect instance_eval instance_exec instance_of? instance_variable_defined?" +
  " instance_variable_get instance_variable_set instance_variables is_a? itself kind_of? method methods nil? object_id" +
  " presence present? private_methods protected_methods public_method public_methods public_send rationalize" +
  " remove_instance_variable respond_to? send singleton_class singleton_method singleton_methods tap then to_a to_c" +
  " to_d to_enum to_f to_h to_i to_json to_r to_s to_yaml try try! yield_self | ";

/** An exception RuboCop raises mid-check (no offense, and on_and stops). */
const RB_SN_RAISE: i32 = -2;

/** Node#receiver for any node: a call's, a block call's, a defs' (V_NIL otherwise). */
const rbSnReceiver = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return V_NIL;
  }
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND || t === NT_DEFS) {
    return a.kid(n, 0);
  }
  if ((t === NT_BLOCK || t === NT_NUMBLOCK) && ssxIsCall(src, a.kid(n, 0))) {
    return a.kid(a.kid(n, 0), 0);
  }
  return V_NIL;
};

/** matching_nodes?. */
const rbSnMatching = (src: RbSource, l: i32, r: i32): boolean => {
  if (vfSameNode(src, l, r)) {
    return true;
  }
  // matching_call_nodes?
  const a = src.a;
  if (!ssxIsCall(src, l) || !ssxIsCall(src, r) || ssxMeth(src, l) !== ssxMeth(src, r) || a.nKid(l) !== a.nKid(r)) {
    return false;
  }
  if (!rbSnMatching(src, a.kid(l, 0), a.kid(r, 0))) {
    return false;
  }
  for (let i = 2; i < a.nKid(l); i++) {
    if (!vfSameNode(src, a.kid(l, i), a.kid(r, i))) {
      return false;
    }
  }
  return true;
};

/** find_matching_receiver_invocation. */
const rbSnFindReceiver = (src: RbSource, chain: i32, v: i32): i32 => {
  let c = chain;
  while (src.a.isNode(c)) {
    const r = rbSnReceiver(src, c);
    if (rbSnMatching(src, r, v)) {
      return r;
    }
    c = r;
  }
  return V_NIL;
};

/** negated?. */
const rbSnNegated = (src: RbSource, n0: i32): boolean => {
  let n = n0;
  while (ssxIs(src, src.parent(n), NT_SEND)) {
    n = src.parent(n);
  }
  return ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "!";
};

/** unsafe_method?: 1 true, 0 false, RB_SN_RAISE when RuboCop raises (no call). */
const rbSnUnsafeMethod = (src: RbSource, node: i32, s: i32): i32 => {
  if (rbSnNegated(src, s)) {
    return 1;
  }
  if (scnTernary(src, node)) {
    return 0;
  }
  if (!ssxIsCall(src, s)) {
    return RB_SN_RAISE;
  }
  if (ssxHas(src, s, F_OPERATOR)) {
    return 1;
  }
  return !ssxLocIs(src, s, F_DOT, ".") && !ssxLocIs(src, s, F_DOT, "&.") ? 1 : 0;
};

/** unsafe_method_used?: 1, 0 or RB_SN_RAISE. */
const rbSnUnsafeUsed = (src: RbSource, node: i32, chain: i32, m: i32): i32 => {
  const u = rbSnUnsafeMethod(src, node, m);
  if (u !== 0) {
    return u;
  }
  let p = src.parent(m);
  while (p !== V_NIL) {
    if (ssxIs(src, p, NT_SEND)) {
      const v = rbSnUnsafeMethod(src, node, p);
      if (v !== 0) {
        return v;
      }
      if (ssxInList(RB_SN_NIL_METHODS, ssxMeth(src, p))) {
        return 1;
      }
      if (vfSameNode(src, p, chain)) {
        return 0;
      }
    }
    p = src.parent(p);
  }
  return 0;
};

/** chain_length. */
const rbSnChainLength = (src: RbSource, chain: i32, m: i32): i32 => {
  let total = 0;
  let p = src.parent(m);
  while (p !== V_NIL) {
    if (ssxIsCall(src, p)) {
      total = add32(total, 1);
      if (vfSameNode(src, p, chain)) {
        return total;
      }
    }
    p = src.parent(p);
  }
  return total;
};

/** offending_node?: 1, 0 or RB_SN_RAISE. */
const rbSnOffending = (src: RbSource, node: i32, lhsRecv: i32, rhs: i32, rhsRecv: i32): i32 => {
  if (!rbSnMatching(src, lhsRecv, rhsRecv) || rhsRecv === V_NIL) {
    return 0;
  }
  // use_var_only_in_unless_modifier?
  if (ssxIs(src, node, NT_IF) && scnUnless(src, node) && !ssxIs(src, src.parent(lhsRecv), NT_SEND)) {
    return 0;
  }
  if (rbSnChainLength(src, rhs, rhsRecv) > 2) {
    return 0;
  }
  const u = rbSnUnsafeUsed(src, node, rhs, src.parent(rhsRecv));
  if (u !== 0) {
    return u === 1 ? 0 : RB_SN_RAISE;
  }
  if (ssxIs(src, rhs, NT_SEND) && ssxMeth(src, rhs) === "empty?") {
    return 0;
  }
  return 1;
};

/** dotless_operator_method?. */
const rbSnDotlessOperator = (src: RbSource, m: i32): boolean => {
  if (ssxHas(src, m, F_DOT)) {
    return false;
  }
  const name = ssxMeth(src, m);
  return name === "[]" || name === "[]=" || sbhOperatorMethod(src, m);
};

/** (send (send $_ :nil?) :!): the checked node, or V_NIL. */
const rbSnNotNilCheck = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "!" || a.nKid(n) !== 2) {
    return V_NIL;
  }
  const r = a.kid(n, 0);
  if (!ssxIs(src, r, NT_SEND) || ssxMeth(src, r) !== "nil?" || a.nKid(r) !== 2) {
    return V_NIL;
  }
  return a.kid(r, 0);
};

/** (send $_ {:nil? :!}): the receiver, or V_NIL. */
const rbSnNilOrNot = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!ssxIs(src, n, NT_SEND) || a.nKid(n) !== 2) {
    return V_NIL;
  }
  const m = ssxMeth(src, n);
  return m === "nil?" || m === "!" ? a.kid(n, 0) : V_NIL;
};

/** `(begin and ...)` anywhere in n (n included). */
const rbSnAndInsideBegin = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const all: i32[] = [n];
  for (const d of ssxDescendants(src, n)) {
    all.push(d);
  }
  for (const d of all) {
    if (a.type(d) === NT_BEGIN && a.nKid(d) > 0 && ssxIs(src, a.kid(d, 0), NT_AND)) {
      return true;
    }
  }
  return false;
};

/** A part of collect_and_clauses: a node, or an `and` node's operator range. */
class RbSnPart {
  pos: i32;
  node: i32;
  op: boolean;

  constructor(pos: i32, node: i32, op: boolean) {
    this.pos = pos;
    this.node = node;
    this.op = op;
  }
}

export class CopStyleSafeNavigation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SafeNavigation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_IF)) {
        this.onIf(src, n);
      } else if (ssxIs(src, n, NT_AND)) {
        this.onAnd(src, n);
      }
    }
  }

  private onIf(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxHas(src, n, F_ELSE) || scnElsif(src, n)) {
      return;
    }
    const cond = a.kid(n, 0);
    const k1 = a.kid(n, 1);
    const k2 = a.kid(n, 2);
    let v = V_NIL;
    let body = V_NIL;
    if (scnTernary(src, n)) {
      if (rbSnNilOrNot(src, cond) !== V_NIL && ssxIs(src, k1, NT_NIL)) {
        v = rbSnNilOrNot(src, cond);
        body = k2;
      } else if (rbSnNotNilCheck(src, cond) !== V_NIL && ssxIs(src, k2, NT_NIL)) {
        v = rbSnNotNilCheck(src, cond);
        body = k1;
      } else if (ssxIs(src, k2, NT_NIL)) {
        v = cond;
        body = k1;
      }
    } else if (k1 === V_NIL) {
      v = rbSnNilOrNot(src, cond) !== V_NIL ? rbSnNilOrNot(src, cond) : cond;
      body = k2;
    } else if (k2 === V_NIL) {
      v = rbSnNotNilCheck(src, cond) !== V_NIL ? rbSnNotNilCheck(src, cond) : cond;
      body = k1;
    }
    let recv = rbSnFindReceiver(src, body, v);
    if (a.isNode(body)) {
      const t = a.type(body);
      if (t === NT_BREAK || t === NT_NEXT || t === NT_RETURN || t === NT_YIELD) {
        recv = V_NIL;
      }
    }
    if (rbSnOffending(src, n, v, body, recv) !== 1) {
      return;
    }
    const mc = src.parent(recv);
    if (!ssxIsCall(src, mc)) {
      return;
    }
    if (rbSnDotlessOperator(src, mc)) {
      return;
    }
    let top = mc;
    while (ssxIs(src, src.parent(top), NT_SEND)) {
      top = src.parent(top);
    }
    if (rbSnDotlessOperator(src, top) || ssxLocIs(src, mc, F_DOT, "::")) {
      return;
    }
    this.c.note(a.exS(n), a.exE(n));
  }

  private onAnd(src: RbSource, n: i32): void {
    const a = src.a;
    const parts: RbSnPart[] = [];
    this.andParts(src, n, parts);
    for (const d of ssxDescendants(src, n)) {
      if (a.type(d) !== NT_AND) {
        continue;
      }
      // concat_nodes: an and inside a block (anywhere above it) adds nothing.
      let inBlock = false;
      let p = src.parent(d);
      while (p !== V_NIL) {
        if (a.type(p) === NT_BLOCK) {
          inBlock = true;
        }
        p = src.parent(p);
      }
      if (!inBlock) {
        this.andParts(src, d, parts);
      }
    }
    // sort_by begin_pos (insertion order on ties)
    for (let i = 1; i < toI32(parts.length); i++) {
      let j = i;
      while (j > 0 && parts[j - 1].pos > parts[j].pos) {
        const x = parts[j];
        parts[j] = parts[j - 1];
        parts[j - 1] = x;
        j--;
      }
    }
    // each_slice(2).each_cons(2): pairs of slices [lhs, op], [rhs, _]
    // Slices start at even indexes; the pairs are the slices at si * 2 and si * 2 + 2.
    let next = 0;
    for (let li = 0; li >= 0 && li < parts.length; li = next) {
      const ri = add32(li, 2);
      if (faulted()) {
        return;
      }
      next = ri;
      if (ri < 0 || ri >= parts.length) {
        break;
      }
      const lhs = parts[li];
      const rhs = parts[ri];
      if (lhs.op || rhs.op) {
        // A range in a node's place matches nothing.
        continue;
      }
      const nn = rbSnNotNilCheck(src, lhs.node);
      const lhsRecv = nn !== V_NIL ? nn : lhs.node;
      // strip_begin
      let sb = rhs.node;
      if (ssxIs(src, sb, NT_BEGIN)) {
        if (a.nKid(sb) === 1 && !ssxIs(src, a.kid(sb, 0), NT_BEGIN)) {
          sb = a.kid(sb, 0);
        } else if (a.nKid(sb) === 0) {
          sb = V_NIL;
        }
      }
      const rhsRecv = rbSnFindReceiver(src, sb, lhsRecv);
      if (nn !== V_NIL) {
        continue;
      }
      const off = rbSnOffending(src, n, lhsRecv, rhs.node, rhsRecv);
      if (off === RB_SN_RAISE) {
        return;
      }
      if (off !== 1) {
        continue;
      }
      // find_method_chain(lhs_receiver) == lhs_receiver
      let chain = lhsRecv;
      while (ssxIsCall(src, src.parent(chain))) {
        chain = src.parent(chain);
      }
      if (!vfSameNode(src, chain, lhsRecv)) {
        continue;
      }
      this.c.note(a.exS(lhs.node), a.exE(rhs.node));
    }
  }

  /** and_parts. */
  private andParts(src: RbSource, n: i32, parts: RbSnPart[]): void {
    const a = src.a;
    parts.push(new RbSnPart(ssxFS(src, n, F_OPERATOR), V_NIL, true));
    const rhs = a.kid(n, 1);
    if (!rbSnAndInsideBegin(src, rhs)) {
      parts.push(new RbSnPart(a.exS(rhs), rhs, false));
    }
    const lhs = a.kid(n, 0);
    if (!ssxIs(src, lhs, NT_AND) && !rbSnAndInsideBegin(src, lhs)) {
      parts.push(new RbSnPart(a.exS(lhs), lhs, false));
    }
  }
}
