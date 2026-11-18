// Style/ParallelAssignment.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  M_COLLECTION,
  NT_ARRAY,
  NT_CASGN,
  NT_CONST,
  NT_DEF,
  NT_CVAR,
  NT_DSTR,
  NT_GVAR,
  NT_IF,
  NT_IVAR,
  NT_LVAR,
  NT_MASGN,
  NT_MLHS,
  NT_RESCUE,
  NT_SELF,
  NT_SEND,
  NT_SPLAT,
  NT_STR,
  NT_SYM,
  NT_UNTIL,
  NT_WHILE,
  NT_XSTR,
  rbInspectSym,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { LalIgnored } from "./layout_align_help";
import { sbhAssignmentMethod, sbhMethodName } from "./style_body_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxDescendants, ssxFE, ssxFS, ssxHas, ssxLocIs, ssxRescueModifier } from "./style_syntax_help";

/** MlhsNode#assignments. */
const sbhPaAssignments = (src: RbSource, mlhs: i32, out: i32[]): void => {
  const a = src.a;
  for (let i = 0; i < a.nKid(mlhs); i++) {
    const c = a.kid(mlhs, i);
    if (!a.isNode(c)) {
      continue;
    }
    const t = a.type(c);
    if (t === NT_SPLAT) {
      let first = V_NIL;
      for (let j = 0; j < a.nKid(c); j++) {
        if (a.isNode(a.kid(c, j))) {
          first = a.kid(c, j);
          break;
        }
      }
      out.push(first === V_NIL ? c : first);
    } else if (t === NT_MLHS) {
      sbhPaAssignments(src, c, out);
    } else {
      out.push(c);
    }
  }
};

/** Array(node).compact: the non-nil children of a node (nothing for nil). */
const sbhPaArray = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (n === V_NIL || !src.a.isNode(n)) {
    return out;
  }
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (src.a.kid(n, i) !== V_NIL) {
      out.push(src.a.kid(n, i));
    }
  }
  return out;
};

/** The node and its descendants. */
const sbhPaEachNode = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (!src.a.isNode(n)) {
    return out;
  }
  out.push(n);
  for (const d of ssxDescendants(src, n)) {
    out.push(d);
  }
  return out;
};

/**
 * An AssignmentSorter over `lhs[i] = rhs[i]`; `self[i]` marks an rhs
 * rewritten by add_self_to_getters to `(send (self) name)`.
 */
class SbhPaSorter {
  src: RbSource;
  lhs: i32[];
  rhs: i32[];
  self: boolean[];

  constructor(src: RbSource, lhs: i32[], rhs: i32[], self: boolean[]) {
    this.src = src;
    this.lhs = lhs;
    this.rhs = rhs;
    this.self = self;
  }

  private eqRhs(i: i32, j: i32): boolean {
    if (this.self[i] !== this.self[j]) {
      return false;
    }
    if (this.self[i]) {
      return sbhMethodName(this.src, this.rhs[i]) === sbhMethodName(this.src, this.rhs[j]);
    }
    return ssxAstEqual(this.src.a, this.rhs[i], this.src.a, this.rhs[j]);
  }

  /** The assignment pairs i and j are == (structurally). */
  private eq(i: i32, j: i32): boolean {
    return ssxAstEqual(this.src.a, this.lhs[i], this.src.a, this.lhs[j]) && this.eqRhs(i, j);
  }

  /** var_name: {(casgn _ $_) (_ $_)} ("" for no match, a non-symbol capture as its inspect). */
  private varName(l: i32): string {
    const a = this.src.a;
    if (a.type(l) === NT_CASGN && a.nKid(l) === 2) {
      return a.inspect(a.kid(l, 1));
    }
    if (a.nKid(l) === 1) {
      return a.inspect(a.kid(l, 0));
    }
    return "";
  }

  /** matching_calls(rhs, recv, name): the argument lists of (send recv name ...) in rhs. */
  private matchingCalls(j: i32, recv: i32, name: string, args: i32[], anyArgs: boolean): boolean {
    const src = this.src;
    const a = src.a;
    if (this.self[j]) {
      if (
        sbhMethodName(src, this.rhs[j]) !== name ||
        !(a.isNode(recv) && a.type(recv) === NT_SELF && a.nKid(recv) === 0)
      ) {
        return false;
      }
      return anyArgs || args.length === 0;
    }
    for (const n of sbhPaEachNode(src, this.rhs[j])) {
      if (a.type(n) !== NT_SEND || sbhMethodName(src, n) !== name || !ssxAstEqual(a, a.kid(n, 0), a, recv)) {
        continue;
      }
      if (anyArgs) {
        return true;
      }
      if (a.nKid(n) - 2 !== args.length) {
        continue;
      }
      let ok = true;
      for (let k = 0; k < toI32(args.length); k++) {
        if (!ssxAstEqual(a, a.kid(n, k + 2), a, args[k])) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return true;
      }
    }
    return false;
  }

  /** dependency?(lhs[i], rhs[j]) */
  private dependency(i: i32, j: i32): boolean {
    const src = this.src;
    const a = src.a;
    const l = this.lhs[i];
    const vn = this.varName(l);
    if (vn.length > 0 && !this.self[j]) {
      for (const n of sbhPaEachNode(src, this.rhs[j])) {
        const t = a.type(n);
        if (
          (t === NT_LVAR || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR) &&
          a.nKid(n) === 1 &&
          a.inspect(a.kid(n, 0)) === vn
        ) {
          return true;
        }
        if (t === NT_CONST && a.nKid(n) === 2 && a.inspect(a.kid(n, 1)) === vn) {
          return true;
        }
      }
    }
    if (a.type(l) !== NT_SEND || !sbhAssignmentMethod(sbhMethodName(src, l))) {
      return false;
    }
    const m = sbhMethodName(src, l);
    if (m === "[]=") {
      const args: i32[] = [];
      for (let k = 2; k < a.nKid(l); k++) {
        args.push(a.kid(l, k));
      }
      return this.matchingCalls(j, a.kid(l, 0), "[]", args, false);
    }
    const none: i32[] = [];
    return this.matchingCalls(j, a.kid(l, 0), m.substring(0, toI32(m.length) - 1), none, true);
  }

  /** tsort: the assignment indexes in a valid order, or null on a cycle. */
  tsort(): i32[] | null {
    const n = toI32(this.lhs.length);
    // to_h: equal assignments share one key (the first).
    const keys: i32[] = [];
    for (let i = 0; i < n; i++) {
      let dup = false;
      for (const k of keys) {
        if (this.eq(k, i)) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        keys.push(i);
      }
    }
    const deps: i32[][] = [];
    for (const i of keys) {
      const d: i32[] = [];
      for (let j = 0; j < n; j++) {
        if (this.eq(j, i)) {
          continue;
        }
        if (this.dependency(i, j)) {
          d.push(j);
        }
      }
      deps.push(d);
    }
    const alive: boolean[] = [];
    for (let q = 0; q < toI32(keys.length); q++) {
      alive.push(true);
    }
    const result: i32[] = [];
    for (;;) {
      let found = -1;
      for (let q = 0; q < toI32(keys.length); q++) {
        if (alive[q] && deps[q].length === 0) {
          found = q;
          break;
        }
      }
      if (found < 0) {
        break;
      }
      alive[found] = false;
      const m = keys[found];
      result.push(m);
      for (let q = 0; q < toI32(keys.length); q++) {
        if (!alive[q]) {
          continue;
        }
        const kept: i32[] = [];
        for (const j of deps[q]) {
          if (!this.eq(j, m)) {
            kept.push(j);
          }
        }
        deps[q] = kept;
      }
    }
    for (let q = 0; q < toI32(keys.length); q++) {
      if (alive[q]) {
        return null;
      }
    }
    return result;
  }
}

/** Style/ParallelAssignment. */
export class CopStyleParallelAssignment {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/ParallelAssignment");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) === NT_MASGN) {
        this.onMasgn(src, n);
      }
    }
  }

  private onMasgn(src: RbSource, n: i32): void {
    const a = src.a;
    if (this.ign.partOf(src, n)) {
      return;
    }
    let rhs = a.kid(n, 1);
    if (a.isNode(rhs) && a.type(rhs) === NT_RESCUE) {
      rhs = a.kid(rhs, 0);
    }
    const rhsEls = sbhPaArray(src, rhs);
    const lhs: i32[] = [];
    sbhPaAssignments(src, a.kid(n, 0), lhs);
    // allowed_lhs?
    if (lhs.length === 1) {
      return;
    }
    for (const l of lhs) {
      if (a.type(l) === NT_SPLAT) {
        return;
      }
    }
    // allowed_rhs?
    if (!a.isNode(rhs) || a.type(rhs) !== NT_ARRAY) {
      return;
    }
    for (const r of rhsEls) {
      if (a.isNode(r) && a.type(r) === NT_SPLAT) {
        return;
      }
    }
    // allowed_masign?
    if (lhs.length !== rhsEls.length) {
      return;
    }
    const selfs: boolean[] = [];
    for (const r of rhsEls) {
      selfs.push(a.isNode(r) && a.type(r) === NT_SEND && a.kid(r, 0) === V_NIL && a.nKid(r) === 2);
    }
    if (new SbhPaSorter(src, lhs, rhsEls, selfs).tsort() === null) {
      return;
    }
    // contains_heredoc?
    for (const d of ssxDescendants(src, rhs)) {
      const t = a.type(d);
      if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, d)) {
        return;
      }
    }
    const k = this.c.offense(a.exS(n), a.exE(rhs));
    if (k !== null) {
      const noSelf: boolean[] = [];
      for (let i = 0; i < toI32(rhsEls.length); i++) {
        noSelf.push(false);
      }
      const order = new SbhPaSorter(src, lhs, rhsEls, noSelf).tsort();
      if (order !== null) {
        this.correct(src, k, n, rhs, lhs, rhsEls, order);
      }
      this.c.commit(k);
    }
    this.ign.add(n);
  }

  /** GenericCorrector#source. */
  private elementSource(src: RbSource, r: i32): string {
    const a = src.a;
    const t = a.type(r);
    if (t === NT_STR && a.mapKind(a.map(r)) === M_COLLECTION && !ssxHas(src, r, F_BEGIN)) {
      const v = a.text(a.kid(r, 0));
      const parts: string[] = ["'"];
      for (let i = 0; i < toI32(v.length); i++) {
        const c = v.charCodeAt(i);
        if (c === 92 || c === 39) {
          parts.push("\\");
        }
        parts.push(v.substring(i, i + 1));
      }
      parts.push("'");
      return parts.join("");
    }
    if (t === NT_SYM && !ssxHas(src, r, F_BEGIN)) {
      return rbInspectSym(a.text(a.kid(r, 0)));
    }
    return src.nodeSrc(r);
  }

  private correct(src: RbSource, k: RbRewriter, n: i32, rhs: i32, lhs: i32[], rhsEls: i32[], order: i32[]): void {
    const a = src.a;
    const offset = rmlSpaces(src.column(a.exS(n)));
    const indentation = rmlSpaces(src.column(a.exS(n)) + 2);
    const asg: string[] = [];
    for (const i of order) {
      asg.push(`${src.nodeSrc(lhs[i])} = ${this.elementSource(src, rhsEls[i])}`);
    }
    const p = src.parent(n);
    let modifier = V_NIL;
    if (p !== V_NIL && a.type(p) === NT_RESCUE) {
      modifier = a.kid(p, 1);
    } else {
      modifier = a.kid(src.parent(rhs), 1);
    }
    const pt = p === V_NIL ? -1 : a.type(p);
    if (
      (pt === NT_IF || pt === NT_WHILE || pt === NT_UNTIL) &&
      !ssxHas(src, p, F_END) &&
      (pt !== NT_IF || ssxLocIs(src, p, F_KEYWORD, "if") || ssxLocIs(src, p, F_KEYWORD, "unless"))
    ) {
      // ModifierCorrector
      const text = `${src.src(ssxFS(src, p, F_KEYWORD), a.exE(p))}\n${indentation}${asg.join(`\n${indentation}`)}\n${offset}end`;
      k.replace(a.exS(p), a.exE(p), text);
      return;
    }
    if (ssxRescueModifier(src, modifier)) {
      // RescueCorrector
      const result = a.kid(modifier, 2);
      const resc = src.parent(rhs);
      const masgn = src.parent(resc);
      const outer = masgn === V_NIL ? V_NIL : src.parent(masgn);
      let text = "";
      if (outer !== V_NIL && a.type(outer) === NT_DEF) {
        text = `${asg.join(`\n${offset}`)}\nrescue\n${offset}${src.nodeSrc(result)}`;
      } else {
        text = `begin\n${indentation}${asg.join(`\n${indentation}`)}\n${offset}rescue\n${indentation}${src.nodeSrc(result)}\n${offset}end`;
      }
      k.replace(a.exS(masgn), a.exE(masgn), text);
      return;
    }
    k.replace(a.exS(n), a.exE(n), asg.join(`\n${offset}`));
  }
}
