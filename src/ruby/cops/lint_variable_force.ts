// RuboCop's VariableForce: local variable scopes, variables, their
// assignments and references, and the branches they sit in, for
// Lint/UnusedBlockArgument, Lint/UnusedMethodArgument and
// Lint/UselessAssignment. The force walks the tree once; the cops then read
// the scopes in the order they were left (after_leaving_scope), which sees
// each scope's variables in their final state.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
import { ssxFE, ssxFS, ssxHas, ssxLocIs, ssxSiblingIndex } from "./style_syntax_help";

/** A local variable (VariableForce::Variable). */
export class VfVar {
  name: string;
  decl: i32;
  scope: i32;
  // Assignment indices, in order.
  asg: i32[];
  nref: i32 = 0;
  captured: boolean = false;

  constructor(name: string, decl: i32, scope: i32) {
    this.name = name;
    this.decl = decl;
    this.scope = scope;
    this.asg = [];
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

  constructor(node: i32, v: i32) {
    this.node = node;
    this.v = v;
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
  t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_CLASS || t === NT_SCLASS || t === NT_DEFS || t === NT_MODULE || t === NT_DEF;

/** ARGUMENT_DECLARATION_TYPES. */
export const vfArgType = (t: i32): boolean =>
  t === NT_ARG || t === NT_OPTARG || t === NT_RESTARG || t === NT_KWARG || t === NT_KWOPTARG || t === NT_KWRESTARG || t === NT_BLOCKARG || t === NT_SHADOWARG;

/** OPERATOR_ASSIGNMENT_TYPES. */
export const vfOpAsgnType = (t: i32): boolean => t === NT_OR_ASGN || t === NT_AND_ASGN || t === NT_OP_ASGN;

/** LOOP_TYPES. */
export const vfLoopType = (t: i32): boolean => t === NT_WHILE_POST || t === NT_UNTIL_POST || t === NT_WHILE || t === NT_UNTIL || t === NT_FOR;

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
const vfNameChar = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;

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
  let i = s;
  let cls = 0;
  while (i < e) {
    const c = src.at(i);
    if (c === 92) {
      i += 2;
      continue;
    }
    if (cls > 0) {
      if (c === 91) {
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
        i++;
      }
      if (src.at(i) === 93) {
        i++;
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
    while (src.at(s - 1) === 44) {
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
    while (src.at(s) === 42) {
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
    const np = toI32(src.pre.length);
    for (let i = 0; i < np; i++) {
      this.ord[vIdx(src.pre[i])] = i;
      this.last[vIdx(src.pre[i])] = i;
    }
    for (let i = np - 1; i >= 0; i--) {
      const n = src.pre[i];
      const p = src.parent(n);
      if (p !== V_NIL && this.last[vIdx(n)] > this.last[vIdx(p)]) {
        this.last[vIdx(p)] = this.last[vIdx(n)];
      }
    }
    this.pushScope(src.root);
    this.processNode(src.root);
    this.popScope();
  }

  // ---- Tree helpers -------------------------------------------------------------

  /** Whether x is a proper ancestor of y. */
  ancestorOf(x: i32, y: i32): boolean {
    const ox = this.ord[vIdx(x)];
    const oy = this.ord[vIdx(y)];
    return ox < oy && oy <= this.last[vIdx(x)];
  }

  /** The descendants of n in pre-order. */
  descendants(n: i32): i32[] {
    const out: i32[] = [];
    const o = this.ord[vIdx(n)];
    const l = this.last[vIdx(n)];
    for (let i = o + 1; i <= l; i++) {
      out.push(this.src.pre[i]);
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
    const sc = this.scopes[si];
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
    const sc = this.scopes[si];
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
    const sc = this.scopes[si];
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
    const as = this.asgns[k];
    if (!as.brDone) {
      as.br = this.branchOf(as.node, this.vars[as.v].scope);
      as.brDone = true;
    }
    return as.br;
  }

  // ---- Variable -------------------------------------------------------------------

  /** Variable#assign. */
  assignVar(vi: i32, node: i32): void {
    const v = this.vars[vi];
    const k = toI32(this.asgns.length);
    this.asgns.push(new VfAsgn(node, vi));
    // mark_last_as_reassigned!
    const m = toI32(v.asg.length);
    if (!v.captured && m > 0) {
      const lk = v.asg[m - 1];
      if (this.asgBranch(k) === this.asgBranch(lk)) {
        const last = this.asgns[lk];
        if (!last.referenced) {
          last.reassigned = true;
        }
      }
    }
    v.asg.push(k);
  }

  /** Variable#reference!. */
  referenceVar(vi: i32, node: i32): void {
    const v = this.vars[vi];
    v.nref += 1;
    const si = v.scope;
    const refBr = this.branchOf(node, si);
    const consumed: i32[] = [];
    for (let j = toI32(v.asg.length) - 1; j >= 0; j--) {
      const k = v.asg[j];
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
        this.asgns[k].referenced = true;
      }
      if (this.inModifierConditional(this.asgns[k].node, node)) {
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
          modifier = (ssxLocIs(src, p, F_KEYWORD, "if") || ssxLocIs(src, p, F_KEYWORD, "unless")) && !ssxHas(src, p, F_END);
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
    return vfArgType(this.src.a.type(this.vars[vi].decl));
  }

  /** Variable#method_argument?. */
  isMethodArgument(vi: i32): boolean {
    const t = this.src.a.type(this.scopes[this.vars[vi].scope].node);
    return this.isArgument(vi) && (t === NT_DEF || t === NT_DEFS);
  }

  /** Variable#block_argument? (block nodes only, not numblock). */
  isBlockArgument(vi: i32): boolean {
    return this.isArgument(vi) && this.src.a.type(this.scopes[this.vars[vi].scope].node) === NT_BLOCK;
  }

  /** Variable#keyword_argument?. */
  isKeywordArgument(vi: i32): boolean {
    const t = this.src.a.type(this.vars[vi].decl);
    return t === NT_KWARG || t === NT_KWOPTARG;
  }

  /** Assignment#used?. */
  asgUsed(k: i32): boolean {
    const as = this.asgns[k];
    const v = this.vars[as.v];
    return (!as.reassigned && v.captured && v.nref > 0) || as.referenced;
  }

  // ---- VariableTable --------------------------------------------------------------

  private cur(): i32 {
    return this.stack[this.stack.length - 1];
  }

  private pushScope(node: i32): void {
    const src = this.src;
    const naked = !vfScopeType(src.a.type(node));
    this.scopes.push(new VfScope(node, naked));
    this.stack.push(toI32(this.scopes.length) - 1);
  }

  private popScope(): void {
    const si = this.cur();
    this.stack.pop();
    this.popped.push(si);
  }

  private declare(name: string, node: i32): void {
    const si = this.cur();
    const vi = toI32(this.vars.length);
    this.vars.push(new VfVar(name, node, si));
    const sc = this.scopes[si];
    for (let i = 0; i < toI32(sc.names.length); i++) {
      if (sc.names[i] === name) {
        sc.vars[i] = vi;
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
    for (let j = toI32(this.stack.length) - 1; j >= 0; j--) {
      const sc = this.scopes[this.stack[j]];
      for (let i = 0; i < toI32(sc.names.length); i++) {
        if (sc.names[i] === name) {
          return sc.vars[i];
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
    for (let j = toI32(this.stack.length) - 1; j >= 0; j--) {
      const sc = this.scopes[this.stack[j]];
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
    const cs = this.scopes[this.cur()];
    if (!this.isAnyBlock(cs.node)) {
      return;
    }
    if (this.scopes[this.vars[vi].scope].node === cs.node) {
      return;
    }
    this.vars[vi].captured = true;
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
      const names = vfNamedCaptures(src, re);
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
      for (const k of this.vars[vi].asg) {
        const an = this.asgns[k].node;
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
        let p = src.parent(this.asgns[k].node);
        while (p !== V_NIL) {
          const t = a.type(p);
          if (t === NT_IF || t === NT_CASE || t === NT_CASE_MATCH || t === NT_RESCUE) {
            this.asgns[k].referenced = true;
            break;
          }
          p = src.parent(p);
        }
      }
      this.asgns[inLoop[inLoop.length - 1]].referenced = true;
    }
  }
}
