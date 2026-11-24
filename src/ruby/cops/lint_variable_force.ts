// RuboCop's VariableForce: local variable scopes, variables, their
// assignments and references, and the branches they sit in, for
// Lint/UnusedBlockArgument, Lint/UnusedMethodArgument and
// Lint/UselessAssignment. The force walks the tree once; the cops then read
// the scopes in the order they were left (after_leaving_scope), which sees
// each scope's variables in their final state.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import { fault } from "../../core/fault";
import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  F_NAME,
  NT_AND,
  NT_AND_ASGN,
  NT_ARG,
  NT_BLOCK,
  NT_BLOCKARG,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_FOR,
  NT_IF,
  NT_KWARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_VAR,
  NT_MATCH_WITH_LVASGN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OPTARG,
  NT_OR,
  NT_OR_ASGN,
  NT_REGOPT,
  NT_RESBODY,
  NT_RESCUE,
  NT_RESTARG,
  NT_RETRY,
  NT_SCLASS,
  NT_SEND,
  NT_SHADOWARG,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_ZSUPER,
  V_NIL,
  vIdx,
  vTag,
} from "../ast";
import { rbSpaceBegin } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LVAR_BAD_START } from "./lint_lvar_start_table";
import { ssxFE, ssxFS, ssxHas, ssxLocIs, ssxSiblingIndex } from "./style_syntax_help";

/** A local variable (VariableForce::Variable). */
export class VfVar {
  name: string;
  decl: i32;
  scope: i32;
  // Assignment indices, in order.
  asg: i32[];
  nref: i32 = 0;
  // The reference nodes, in order (lvar, an operator assignment, zsuper, binding).
  refs: i32[];
  captured: boolean = false;

  constructor(name: string, decl: i32, scope: i32) {
    this.name = name;
    this.decl = decl;
    this.scope = scope;
    this.asg = [];
    this.refs = [];
  }
}

/** An assignment to a variable (VariableForce::Assignment). */
export class VfAsgn {
  node: i32;
  v: i32;
  referenced: boolean = false;
  reassigned: boolean = false;
  brDone: boolean = false;
  br: i32 = 0;
  // Assignment#references: the reference nodes that reached this assignment.
  refs: i32[];

  constructor(node: i32, v: i32) {
    this.node = node;
    this.v = v;
    this.refs = [];
  }
}

/** A scope (VariableForce::Scope): its node and its variables in hash order. */
export class VfScope {
  node: i32;
  naked: boolean;
  names: string[];
  vars: i32[];

  constructor(node: i32, naked: boolean) {
    this.node = node;
    this.naked = naked;
    this.names = [];
    this.vars = [];
  }
}

/** SCOPE_TYPES. */
export const vfScopeType = (t: i32): boolean =>
  t === NT_BLOCK ||
  t === NT_NUMBLOCK ||
  t === NT_CLASS ||
  t === NT_SCLASS ||
  t === NT_DEFS ||
  t === NT_MODULE ||
  t === NT_DEF;

/** ARGUMENT_DECLARATION_TYPES. */
export const vfArgType = (t: i32): boolean =>
  t === NT_ARG ||
  t === NT_OPTARG ||
  t === NT_RESTARG ||
  t === NT_KWARG ||
  t === NT_KWOPTARG ||
  t === NT_KWRESTARG ||
  t === NT_BLOCKARG ||
  t === NT_SHADOWARG;

/** OPERATOR_ASSIGNMENT_TYPES. */
export const vfOpAsgnType = (t: i32): boolean => t === NT_OR_ASGN || t === NT_AND_ASGN || t === NT_OP_ASGN;

/** LOOP_TYPES. */
export const vfLoopType = (t: i32): boolean =>
  t === NT_WHILE_POST || t === NT_UNTIL_POST || t === NT_WHILE || t === NT_UNTIL || t === NT_FOR;

/** Scope::OUTER_SCOPE_CHILD_INDICES: the last outer child index, or -1 for none. */
const vfOuterHi = (t: i32): i32 => {
  if (t === NT_CLASS) {
    return 1;
  }
  if (t === NT_DEFS || t === NT_MODULE || t === NT_SCLASS || t === NT_BLOCK) {
    return 0;
  }
  return -1;
};

/** Whether a branch class exists for a control node type (Branch::CLASSES_BY_TYPE). */
const vfBranchType = (t: i32): boolean =>
  t === NT_IF ||
  t === NT_WHILE ||
  t === NT_UNTIL ||
  t === NT_WHILE_POST ||
  t === NT_UNTIL_POST ||
  t === NT_CASE ||
  t === NT_CASE_MATCH ||
  t === NT_FOR ||
  t === NT_AND ||
  t === NT_AND_ASGN ||
  t === NT_OR ||
  t === NT_OR_ASGN ||
  t === NT_OP_ASGN ||
  t === NT_RESCUE ||
  t === NT_ENSURE;

/** Whether c is a word character of a regexp group name. */
const vfNameChar = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;

/** RESERVED_WORDS. */
const VF_RESERVED: string =
  " __ENCODING__ __FILE__ __LINE__ BEGIN END alias and begin break case class def do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield ";

const vfHex = (s: string, from: i32, to: i32): i32 => {
  const k = toI32(s.length);
  if (from < to && (from < 0 || to > k)) {
    fault();
    return 0;
  }
  let v = 0;
  for (let i = from; i >= 0 && i < to && i < k; i++) {
    // The table's numbers have at most six hex digits.
    if (v < 0 || v > 134217000) {
      fault();
      return 0;
    }
    const c = s.charCodeAt(i) & 0xff;
    if (c <= 57) {
      v = v * 16 + (c - 48);
    } else {
      v = v * 16 + (c - 87);
    }
  }
  return v;
};

/** Whether the non-ASCII code point c is in LVAR_BAD_START (an upper or titlecase letter). */
const vfBadStart = (c: i32): boolean => {
  const t = LVAR_BAD_START;
  const k = toI32(t.length);
  let i = 0;
  while (i >= 0 && i < k) {
    let j = i;
    let dash = -1;
    while (j >= 0 && j < k) {
      const d = t.charCodeAt(j);
      if (d === 44) {
        break;
      }
      if (d === 45) {
        dash = j;
      }
      j++;
    }
    const lo = vfHex(t, i, dash < 0 ? j : dash);
    let hi = lo;
    if (dash >= 0 && dash < k) {
      hi = vfHex(t, dash + 1, j);
    }
    if (c < lo) {
      return false;
    }
    if (c <= hi) {
      return true;
    }
    if (j >= k) {
      break;
    }
    i = j + 1;
  }
  return false;
};

/** VariableForce#local_variable_name?: Ruby makes a local variable of a named capture with this name. */
const vfLocalVariableName = (name: string): boolean => {
  const k = toI32(name.length);
  if (k === 0 || VF_RESERVED.indexOf(` ${name} `) >= 0) {
    return false;
  }
  const b = name.length > 0 ? name.charCodeAt(0) : 0;
  if (b < 128) {
    if (!((b >= 97 && b <= 122) || b === 95)) {
      return false;
    }
  } else {
    // the first character's code point, from its UTF-8 bytes
    let c = 0;
    let n = 1;
    if (b >= 0xf0) {
      c = b & 7;
      n = 4;
    } else if (b >= 0xe0) {
      c = b & 15;
      n = 3;
    } else {
      c = b & 31;
      n = 2;
    }
    for (let i = 1; i < n && i < k; i++) {
      // At most three steps from a value below 32.
      if (c < 0 || c > 33554431) {
        fault();
        return false;
      }
      c = c * 64 + (name.charCodeAt(i) & 63);
    }
    if (vfBadStart(c)) {
      return false;
    }
  }
  for (let i = 1; i < k; i++) {
    const c = name.charCodeAt(i);
    if (!(c >= 128 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) {
      return false;
    }
  }
  return true;
};

/** Regexp#named_captures.keys of a regexp literal (its source text, options). */
export const vfNamedCaptures = (src: RbSource, re: i32): string[] => {
  const out: string[] = [];
  const a = src.a;
  if (!ssxHas(src, re, F_BEGIN) || !ssxHas(src, re, F_END)) {
    return out;
  }
  const s = ssxFE(src, re, F_BEGIN);
  const e = ssxFS(src, re, F_END);
  let ext = false;
  const opt = a.kid(re, -1);
  if (a.isNode(opt) && a.type(opt) === NT_REGOPT) {
    for (let i = 0; i < a.nKid(opt); i++) {
      if (a.text(a.kid(opt, i)) === "x") {
        ext = true;
      }
    }
  }
  // Both are positions in the source, far below 2^30; each step of the loop
  // moves `i` forward, so `cls` stays below `e` too.
  if (s < 0 || e > 1073741823) {
    fault();
    return out;
  }
  let i = s;
  let cls = 0;
  while (i >= 0 && i < e) {
    const c = src.at(i);
    if (c === 92) {
      i += 2;
      continue;
    }
    if (cls > 0) {
      if (c === 91) {
        if (cls >= 1073741823) {
          fault();
          return out;
        }
        cls++;
      } else if (c === 93) {
        cls--;
      }
      i++;
      continue;
    }
    if (c === 91) {
      cls = 1;
      i++;
      if (src.at(i) === 94) {
        i = add32(i, 1);
      }
      if (src.at(i) === 93) {
        i = add32(i, 1);
      }
      continue;
    }
    if (ext && c === 35) {
      while (i < e && src.at(i) !== 10) {
        i++;
      }
      continue;
    }
    if (c === 40 && src.at(i + 1) === 63) {
      const q = src.at(i + 2);
      let close = -1;
      if (q === 60 && src.at(i + 3) !== 61 && src.at(i + 3) !== 33) {
        close = 62;
      } else if (q === 39) {
        close = 39;
      }
      if (close > 0) {
        let j = i + 3;
        while (j < e && vfNameChar(src.at(j))) {
          j++;
        }
        if (j > i + 3 && src.at(j) === close) {
          const name = src.src(i + 3, j);
          let seen = false;
          for (const x of out) {
            if (x === name) {
              seen = true;
            }
          }
          if (!seen) {
            out.push(name);
          }
        }
      }
    }
    i++;
  }
  return out;
};

/** AST::Node#==: the same type and equal children. */
export const vfSameNode = (src: RbSource, x: i32, y: i32): boolean => {
  if (x === y) {
    return true;
  }
  const a = src.a;
  if (vTag(x) !== vTag(y)) {
    return false;
  }
  if (!a.isNode(x)) {
    return x !== V_NIL && y !== V_NIL && a.text(x) === a.text(y);
  }
  if (a.type(x) !== a.type(y) || a.nKid(x) !== a.nKid(y)) {
    return false;
  }
  for (let i = 0; i < a.nKid(x); i++) {
    if (!vfSameNode(src, a.kid(x, i), a.kid(y, i))) {
      return false;
    }
  }
  return true;
};

/** UnusedArgCorrector.correct for an argument node. */
export const vfUnusedArgCorrect = (src: RbSource, k: RbRewriter, node: i32): void => {
  const a = src.a;
  const t = a.type(node);
  if (t === NT_KWARG || t === NT_KWOPTARG) {
    return;
  }
  if (t === NT_BLOCKARG) {
    let s = rbSpaceBegin(src, a.exS(node), 1, true, false, false);
    // `src.at` answers -1 before the source.
    while (s > 0 && src.at(s - 1) === 44) {
      s--;
    }
    k.remove(s, a.exE(node));
    return;
  }
  let name = "";
  if (t === NT_OPTARG) {
    name = a.text(a.kid(node, 0));
  } else {
    let s = a.exS(node);
    // A `*` is at a position below the source's length.
    while (s < 2147483647 && src.at(s) === 42) {
      s++;
    }
    name = src.src(s, a.exE(node));
  }
  k.replace(ssxFS(src, node, F_NAME), ssxFE(src, node, F_NAME), `_${name}`);
};

export class VfForce {
  src: RbSource;
  vars: VfVar[];
  asgns: VfAsgn[];
  scopes: VfScope[];
  stack: i32[];
  // Scope indices in the order they were left (after_leaving_scope).
  popped: i32[];
  scanned: Set<i32>;
  // Pre-order index and the last pre-order index of the subtree, by node index.
  ord: i32[];
  last: i32[];

  constructor(src: RbSource) {
    this.src = src;
    this.vars = [];
    this.asgns = [];
    this.scopes = [];
    this.stack = [];
    this.popped = [];
    this.scanned = new Set<i32>();
    this.ord = [];
    this.last = [];
  }

  /** investigate. */
  run(): void {
    const src = this.src;
    const a = src.a;
    if (src.root === V_NIL || !src.valid) {
      return;
    }
    for (let i = 0; i < a.nNodes; i++) {
      this.ord.push(-1);
      this.last.push(-1);
    }
    const pre = src.pre;
    const ord = this.ord;
    const last = this.last;
    // Every node of `pre` has an index below nNodes, the length of both.
    for (let i = 0; i < pre.length; i++) {
      const ni = vIdx(pre[i]);
      if (ni < 0 || ni >= ord.length || ni >= last.length) {
        fault();
        return;
      }
      ord[ni] = i;
      last[ni] = i;
    }
    let i = toI32(pre.length);
    while (i > 0) {
      i--;
      if (i >= pre.length) {
        fault();
        return;
      }
      const n = pre[i];
      const p = src.parent(n);
      if (p !== V_NIL) {
        const ni = vIdx(n);
        const pi = vIdx(p);
        if (ni < 0 || ni >= last.length || pi < 0 || pi >= last.length) {
          fault();
          return;
        }
        if (last[ni] > last[pi]) {
          last[pi] = last[ni];
        }
      }
    }
    this.pushScope(src.root);
    this.processNode(src.root);
    this.popScope();
  }

  // ---- Tree helpers -------------------------------------------------------------

  /** Whether x is a proper ancestor of y. */
  ancestorOf(x: i32, y: i32): boolean {
    const ord = this.ord;
    const last = this.last;
    const xi = vIdx(x);
    const yi = vIdx(y);
    if (xi < 0 || xi >= ord.length || xi >= last.length || yi < 0 || yi >= ord.length) {
      fault();
      return false;
    }
    const ox = ord[xi];
    const oy = ord[yi];
    return ox < oy && oy <= last[xi];
  }

  /** The descendants of n in pre-order. */
  descendants(n: i32): i32[] {
    const out: i32[] = [];
    const ord = this.ord;
    const last = this.last;
    const ni = vIdx(n);
    if (ni < 0 || ni >= ord.length || ni >= last.length) {
      fault();
      return out;
    }
    const o = ord[ni];
    const l = last[ni];
    const pre = this.src.pre;
    // The pre-order indexes o + 1 .. l.
    let i = o;
    while (i < l) {
      i++;
      if (i < 0 || i >= pre.length) {
        fault();
        break;
      }
      out.push(pre[i]);
    }
    return out;
  }

  /** covers?: the same node, or the container's range contains the node's. */
  covers(container: i32, n: i32): boolean {
    const a = this.src.a;
    return container === n || (a.exS(container) <= a.exS(n) && a.exE(n) <= a.exE(container));
  }

  // ---- Scope ----------------------------------------------------------------------

  /** Scope#include?. */
  include(si: i32, target: i32): boolean {
    const src = this.src;
    const a = src.a;
    const sc = this.scopeAt(si);
    const node = sc.node;
    // belong_to_outer_scope?
    if (!sc.naked && target === node) {
      return false;
    }
    if (this.ancestorOf(target, node)) {
      return false;
    }
    const p = src.parent(target);
    if (p === node) {
      const hi = vfOuterHi(a.type(p));
      if (hi >= 0 && ssxSiblingIndex(src, target) <= hi) {
        return false;
      }
    }
    // belong_to_inner_scope?
    if (p === V_NIL || p === node) {
      return true;
    }
    if (!vfScopeType(a.type(p))) {
      return true;
    }
    const hi = vfOuterHi(a.type(p));
    if (hi < 0) {
      return false;
    }
    return ssxSiblingIndex(src, target) <= hi;
  }

  /** Scope#body_node. */
  bodyNode(si: i32): i32 {
    const sc = this.scopeAt(si);
    if (sc.naked) {
      return sc.node;
    }
    const a = this.src.a;
    const t = a.type(sc.node);
    if (t === NT_MODULE || t === NT_SCLASS) {
      return a.kid(sc.node, 1);
    }
    if (t === NT_DEFS) {
      return a.kid(sc.node, 3);
    }
    return a.kid(sc.node, 2);
  }

  /** Scope#each_node: the nodes of the scope itself, pre-order. */
  eachNode(si: i32): i32[] {
    const out: i32[] = [];
    const sc = this.scopeAt(si);
    if (sc.naked) {
      out.push(sc.node);
    }
    this.scanNode(si, sc.node, out);
    return out;
  }

  private scanNode(si: i32, n: i32, out: i32[]): void {
    const a = this.src.a;
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      if (!a.isNode(c) || !this.include(si, c)) {
        continue;
      }
      out.push(c);
      this.scanNode(si, c, out);
    }
  }

  // ---- Branch ---------------------------------------------------------------------

  /** Branch.of: the child node of the innermost branched control node, or V_NIL. */
  branchOf(target: i32, si: i32): i32 {
    const src = this.src;
    let node = target;
    while (true) {
      const p = src.parent(node);
      if (p === V_NIL) {
        return V_NIL;
      }
      if (!this.include(si, node)) {
        return V_NIL;
      }
      if (vfBranchType(src.a.type(p)) && this.branched(node)) {
        return node;
      }
      node = p;
    }
  }

  /** Branch#branched? (!always_run?) for the branch whose child node is c. */
  branched(c: i32): boolean {
    const a = this.src.a;
    const p = this.src.parent(c);
    const t = a.type(p);
    if (t === NT_RESCUE) {
      return true;
    }
    if (t === NT_ENSURE) {
      return a.kid(p, -1) !== c;
    }
    if (t === NT_FOR) {
      return a.kid(p, 0) !== c && a.kid(p, 1) !== c;
    }
    return a.kid(p, 0) !== c;
  }

  /** Branch#parent. */
  branchParent(c: i32, si: i32): i32 {
    return this.branchOf(this.src.parent(c), si);
  }

  /** may_jump_to_other_branch? / may_run_incompletely? (the main body of a rescue or ensure). */
  mayRunIncompletely(c: i32): boolean {
    const a = this.src.a;
    const p = this.src.parent(c);
    const t = a.type(p);
    return (t === NT_RESCUE || t === NT_ENSURE) && a.kid(p, 0) === c;
  }

  /** Branch#exclusive_with?. */
  exclusiveWith(c: i32, other: i32, si: i32): boolean {
    if (other === V_NIL) {
      return false;
    }
    if (this.mayRunIncompletely(c)) {
      return false;
    }
    const src = this.src;
    const cn = src.parent(c);
    let oa = other;
    while (oa !== V_NIL) {
      if (cn === src.parent(oa)) {
        return c !== oa;
      }
      oa = this.branchParent(oa, si);
    }
    const pp = this.branchParent(c, si);
    return pp !== V_NIL ? this.exclusiveWith(pp, other, si) : false;
  }

  /** Assignment#branch (memoized). */
  asgBranch(k: i32): i32 {
    const as = this.asgAt(k);
    if (!as.brDone) {
      as.br = this.branchOf(as.node, this.varAt(as.v).scope);
      as.brDone = true;
    }
    return as.br;
  }

  // ---- Variable -------------------------------------------------------------------

  /** Variable#assign. */
  assignVar(vi: i32, node: i32): void {
    const v = this.varAt(vi);
    const k = toI32(this.asgns.length);
    this.asgns.push(new VfAsgn(node, vi));
    // mark_last_as_reassigned!
    const asg = v.asg;
    const ml = toI32(asg.length) - 1;
    if (!v.captured && ml >= 0 && ml < asg.length) {
      const lk = asg[ml];
      if (this.asgBranch(k) === this.asgBranch(lk)) {
        const last = this.asgAt(lk);
        if (!last.referenced) {
          last.reassigned = true;
        }
      }
    }
    v.asg.push(k);
  }

  /** Variable#reference!. */
  referenceVar(vi: i32, node: i32): void {
    const v = this.varAt(vi);
    const nref = v.nref;
    if (nref >= 2147483647) {
      fault();
      return;
    }
    v.nref = nref + 1;
    v.refs.push(node);
    const si = v.scope;
    const refBr = this.branchOf(node, si);
    const consumed: i32[] = [];
    const asg = v.asg;
    let j = toI32(asg.length);
    while (j > 0) {
      j--;
      if (j >= asg.length) {
        fault();
        return;
      }
      const k = asg[j];
      const abr = this.asgBranch(k);
      let skip = false;
      if (abr !== V_NIL) {
        for (const x of consumed) {
          if (x === abr) {
            skip = true;
          }
        }
      }
      if (skip) {
        continue;
      }
      const excl = abr !== V_NIL && refBr !== V_NIL && this.exclusiveWith(abr, refBr, si);
      if (!excl) {
        const as = this.asgAt(k);
        as.referenced = true;
        as.refs.push(node);
      }
      if (this.inModifierConditional(this.asgAt(k).node, node)) {
        continue;
      }
      if (abr === V_NIL || abr === refBr) {
        break;
      }
      if (!(this.mayRunIncompletely(abr) || this.exceptionMayReach(abr, node, si))) {
        consumed.push(abr);
      }
    }
  }

  /** Variable#in_modifier_conditional?. */
  private inModifierConditional(asgNode: i32, ref: i32): boolean {
    const src = this.src;
    const a = src.a;
    let p = src.parent(asgNode);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) {
        let modifier = false;
        if (t === NT_IF) {
          modifier =
            (ssxLocIs(src, p, F_KEYWORD, "if") || ssxLocIs(src, p, F_KEYWORD, "unless")) && !ssxHas(src, p, F_END);
        } else {
          modifier = !ssxHas(src, p, F_END);
        }
        const cond = a.kid(p, 0);
        if (modifier && this.covers(cond, asgNode)) {
          return this.covers(p, ref) && !this.covers(cond, ref);
        }
      }
      p = src.parent(p);
    }
    return false;
  }

  /** Variable#exception_may_reach?. */
  private exceptionMayReach(br: i32, ref: i32, si: i32): boolean {
    const src = this.src;
    let anc = this.branchParent(br, si);
    while (anc !== V_NIL) {
      if (this.mayRunIncompletely(anc) && !this.covers(anc, ref)) {
        const cn = src.parent(anc);
        if (src.a.type(cn) === NT_RESCUE || this.covers(cn, ref)) {
          return true;
        }
      }
      anc = this.branchParent(anc, si);
    }
    return false;
  }

  /** Variable#argument?. */
  isArgument(vi: i32): boolean {
    return vfArgType(this.src.a.type(this.varAt(vi).decl));
  }

  /** Variable#method_argument?. */
  isMethodArgument(vi: i32): boolean {
    const t = this.src.a.type(this.scopeAt(this.varAt(vi).scope).node);
    return this.isArgument(vi) && (t === NT_DEF || t === NT_DEFS);
  }

  /** Variable#block_argument? (block nodes only, not numblock). */
  isBlockArgument(vi: i32): boolean {
    return this.isArgument(vi) && this.src.a.type(this.scopeAt(this.varAt(vi).scope).node) === NT_BLOCK;
  }

  /** Variable#keyword_argument?. */
  isKeywordArgument(vi: i32): boolean {
    const t = this.src.a.type(this.varAt(vi).decl);
    return t === NT_KWARG || t === NT_KWOPTARG;
  }

  /** Assignment#used?. */
  asgUsed(k: i32): boolean {
    const as = this.asgAt(k);
    const v = this.varAt(as.v);
    return (!as.reassigned && v.captured && v.nref > 0) || as.referenced;
  }

  // ---- VariableTable --------------------------------------------------------------

  private cur(): i32 {
    const st = this.stack;
    const top = toI32(st.length) - 1;
    if (top >= 0 && top < st.length) {
      return st[top];
    }
    fault();
    return -1;
  }

  /** The scope `si`; a fault and a stand-in when it is not one. */
  private scopeAt(si: i32): VfScope {
    const scopes = this.scopes;
    if (si >= 0 && si < scopes.length) {
      return scopes[si];
    }
    fault();
    return new VfScope(V_NIL, true);
  }

  /** The variable `vi`; a fault and a stand-in when it is not one. */
  private varAt(vi: i32): VfVar {
    const vars = this.vars;
    if (vi >= 0 && vi < vars.length) {
      return vars[vi];
    }
    fault();
    return new VfVar("", V_NIL, -1);
  }

  /** The assignment `k`; a fault and a stand-in when it is not one. */
  private asgAt(k: i32): VfAsgn {
    const asgns = this.asgns;
    if (k >= 0 && k < asgns.length) {
      return asgns[k];
    }
    fault();
    return new VfAsgn(V_NIL, -1);
  }

  private pushScope(node: i32): void {
    const src = this.src;
    const naked = !vfScopeType(src.a.type(node));
    this.scopes.push(new VfScope(node, naked));
    this.stack.push(toI32(this.scopes.length) - 1);
  }

  private popScope(): void {
    const si = this.cur();
    const st = this.stack;
    if (st.length > 0) {
      st.pop();
    }
    this.popped.push(si);
  }

  private declare(name: string, node: i32): void {
    const si = this.cur();
    const vi = toI32(this.vars.length);
    this.vars.push(new VfVar(name, node, si));
    const sc = this.scopeAt(si);
    const names = sc.names;
    const vars = sc.vars;
    for (let i = 0; i < names.length; i++) {
      if (names[i] === name) {
        // `names` and `vars` grow together.
        if (i < vars.length) {
          vars[i] = vi;
        } else {
          fault();
        }
        return;
      }
    }
    sc.names.push(name);
    sc.vars.push(vi);
  }

  private isAnyBlock(n: i32): boolean {
    const t = this.src.a.type(n);
    return t === NT_BLOCK || t === NT_NUMBLOCK;
  }

  /** find_variable: the variable index, or -1. */
  findVar(name: string): i32 {
    const st = this.stack;
    let j = toI32(st.length);
    while (j > 0) {
      j--;
      if (j >= st.length) {
        fault();
        return -1;
      }
      const sc = this.scopeAt(st[j]);
      const names = sc.names;
      const vars = sc.vars;
      for (let i = 0; i < names.length; i++) {
        if (names[i] === name) {
          // `names` and `vars` grow together.
          if (i < vars.length) {
            return vars[i];
          }
          fault();
          return -1;
        }
      }
      if (!this.isAnyBlock(sc.node)) {
        return -1;
      }
    }
    return -1;
  }

  private accessible(): i32[] {
    const out: i32[] = [];
    const st = this.stack;
    let j = toI32(st.length);
    while (j > 0) {
      j--;
      if (j >= st.length) {
        fault();
        break;
      }
      const sc = this.scopeAt(st[j]);
      for (const v of sc.vars) {
        out.push(v);
      }
      if (!this.isAnyBlock(sc.node)) {
        break;
      }
    }
    return out;
  }

  private markCaptured(vi: i32): void {
    const cs = this.scopeAt(this.cur());
    if (!this.isAnyBlock(cs.node)) {
      return;
    }
    if (this.scopeAt(this.varAt(vi).scope).node === cs.node) {
      return;
    }
    this.varAt(vi).captured = true;
  }

  private assignTo(name: string, node: i32): void {
    const vi = this.findVar(name);
    if (vi < 0) {
      return;
    }
    this.markCaptured(vi);
    this.assignVar(vi, node);
  }

  private referenceTo(name: string, node: i32): void {
    const vi = this.findVar(name);
    if (vi < 0) {
      return;
    }
    this.markCaptured(vi);
    this.referenceVar(vi, node);
  }

  // ---- The walk -------------------------------------------------------------------

  private processChildren(n: i32): void {
    const a = this.src.a;
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      if (!a.isNode(c) || this.scanned.has(c)) {
        continue;
      }
      this.processNode(c);
    }
  }

  private processNode(n: i32): void {
    const src = this.src;
    const a = src.a;
    const t = a.type(n);
    if (t === NT_LVASGN) {
      const name = a.text(a.kid(n, 0));
      if (this.findVar(name) < 0) {
        this.declare(name, n);
      }
      this.processChildren(n);
      this.assignTo(name, n);
      return;
    }
    if (t === NT_MATCH_WITH_LVASGN) {
      const re = a.kid(n, 0);
      // regexp_captured_names: the names that are local variable names
      const names: string[] = [];
      for (const nm of vfNamedCaptures(src, re)) {
        if (vfLocalVariableName(nm)) {
          names.push(nm);
        }
      }
      for (const nm of names) {
        if (this.findVar(nm) < 0) {
          this.declare(nm, n);
        }
      }
      this.processNode(a.kid(n, 1));
      this.processNode(re);
      for (const nm of names) {
        this.assignTo(nm, n);
      }
      return;
    }
    if (t === NT_MATCH_VAR) {
      const name = a.text(a.kid(n, 0));
      if (this.findVar(name) < 0) {
        this.declare(name, n);
      }
      return;
    }
    if (t === NT_MASGN) {
      this.processNode(a.kid(n, 1));
      this.processNode(a.kid(n, 0));
      return;
    }
    if (t === NT_LVAR) {
      this.referenceTo(a.text(a.kid(n, 0)), n);
    } else if (t === NT_RESCUE) {
      let retry = false;
      for (let i = 0; i < a.nKid(n) && !retry; i++) {
        const c = a.kid(n, i);
        if (a.isNode(c) && a.type(c) === NT_RESBODY) {
          for (const d of this.descendants(c)) {
            if (a.type(d) === NT_RETRY) {
              retry = true;
            }
          }
        }
      }
      if (retry) {
        this.processLoop(n);
        return;
      }
    } else if (t === NT_ZSUPER) {
      for (const vi of this.accessible()) {
        if (this.isMethodArgument(vi)) {
          this.referenceVar(vi, n);
        }
      }
    } else if (t === NT_SEND) {
      const arg = a.kid(n, 2);
      if (a.text(a.kid(n, 1)) === "binding" && !(a.isNode(arg) && a.nKid(arg) > 0)) {
        for (const vi of this.accessible()) {
          this.referenceVar(vi, n);
        }
      }
    } else if (vfArgType(t)) {
      const nm = a.kid(n, 0);
      if (nm !== V_NIL) {
        this.declare(a.text(nm), n);
      }
    } else if (vfOpAsgnType(t)) {
      const lhs = a.kid(n, 0);
      if (a.isNode(lhs) && a.type(lhs) === NT_LVASGN) {
        const name = a.text(a.kid(lhs, 0));
        if (this.findVar(name) < 0) {
          this.declare(name, lhs);
        }
        this.referenceTo(name, n);
        this.processNode(a.kid(n, -1));
        this.assignTo(name, lhs);
        return;
      }
    } else if (vfLoopType(t)) {
      this.processLoop(n);
      return;
    } else if (vfScopeType(t)) {
      this.processScope(n);
      return;
    }
    this.processChildren(n);
  }

  private processLoop(n: i32): void {
    const a = this.src.a;
    const t = a.type(n);
    if (t === NT_WHILE_POST || t === NT_UNTIL_POST) {
      this.processNode(a.kid(n, 1));
      this.processNode(a.kid(n, 0));
    } else if (t === NT_FOR) {
      this.processNode(a.kid(n, 1));
      this.processNode(a.kid(n, 0));
      if (a.kid(n, 2) !== V_NIL) {
        this.processNode(a.kid(n, 2));
      }
    } else {
      this.processChildren(n);
    }
    this.markLoopAssignments(n);
  }

  private processScope(n: i32): void {
    const a = this.src.a;
    const t = a.type(n);
    if (t !== NT_DEF) {
      const k0 = a.kid(n, 0);
      if (a.isNode(k0)) {
        this.processNode(k0);
        this.scanned.add(k0);
      }
      if (t === NT_CLASS) {
        const k1 = a.kid(n, 1);
        if (a.isNode(k1)) {
          this.processNode(k1);
          this.scanned.add(k1);
        }
      }
    }
    this.pushScope(n);
    this.processChildren(n);
    this.popScope();
  }

  /** mark_assignments_as_referenced_in_loop. */
  private markLoopAssignments(loop: i32): void {
    const src = this.src;
    const a = src.a;
    const names: string[] = [];
    const asgNodes = new Set<i32>();
    const asgList: i32[] = [];
    for (const d of this.descendants(loop)) {
      const t = a.type(d);
      let nm = "";
      let has = false;
      if (t === NT_LVAR) {
        nm = a.text(a.kid(d, 0));
        has = true;
      } else if (t === NT_LVASGN) {
        asgNodes.add(d);
        asgList.push(d);
      } else if (vfOpAsgnType(t)) {
        const lhs = a.kid(d, 0);
        if (a.isNode(lhs) && a.type(lhs) === NT_LVASGN) {
          nm = a.text(a.kid(lhs, 0));
          has = true;
        }
      }
      if (has) {
        let seen = false;
        for (const x of names) {
          if (x === nm) {
            seen = true;
          }
        }
        if (!seen) {
          names.push(nm);
        }
      }
    }
    for (const nm of names) {
      const vi = this.findVar(nm);
      if (vi < 0) {
        continue;
      }
      const inLoop: i32[] = [];
      for (const k of this.varAt(vi).asg) {
        const an = this.asgAt(k).node;
        // Array#include? compares nodes structurally (AST::Node#==).
        let hit = asgNodes.has(an);
        if (!hit && a.type(an) === NT_LVASGN) {
          for (const x of asgList) {
            if (vfSameNode(src, x, an)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          inLoop.push(k);
        }
      }
      if (inLoop.length === 0) {
        continue;
      }
      for (const k of inLoop) {
        let p = src.parent(this.asgAt(k).node);
        while (p !== V_NIL) {
          const t = a.type(p);
          if (t === NT_IF || t === NT_CASE || t === NT_CASE_MATCH || t === NT_RESCUE) {
            const as = this.asgAt(k);
            as.referenced = true;
            as.refs.push(loop);
            break;
          }
          p = src.parent(p);
        }
      }
      const il = toI32(inLoop.length) - 1;
      if (il < 0 || il >= inLoop.length) {
        fault();
        return;
      }
      const as = this.asgAt(inLoop[il]);
      as.referenced = true;
      as.refs.push(loop);
    }
  }
}
