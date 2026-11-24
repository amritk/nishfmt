// Style/ConditionalAssignment (EnforcedStyle: assign_to_condition,
// SingleLineConditionsOnly: true, IncludeTernaryExpressions: true;
// Layout/LineLength Max: 120; Layout/EndAlignment: keyword), with the If,
// Ternary and Case correctors.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbNKid } from "../node";
import { fault, faulted } from "../../core/fault";
import { add32, atI32 } from "../../core/arr";
import {
  F_BEGIN,
  F_END,
  F_OPERATOR,
  NT_AND_ASGN,
  NT_ARRAY,
  NT_BEGIN,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CBASE,
  NT_CONST,
  NT_CVASGN,
  NT_GVASGN,
  NT_IF,
  NT_IVASGN,
  NT_LVASGN,
  NT_MASGN,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  SCN_MAX,
  scnBranches,
  scnElseBranch,
  scnElsif,
  scnIfBranch,
  scnLen,
  scnSpaces,
  scnTernary,
} from "./style_cond_help";
import { scnCorrectionParses } from "./style_cond_reparse";
import { ssxHas, ssxIs, ssxIsSpace, ssxMeth } from "./style_syntax_help";

/** ConstNode#const_name. */
const scaConstName = (src: RbSource, n: i32): string => {
  const ns = src.a.kid(n, 0);
  const nm = src.a.text(src.a.kid(n, 1));
  if (ns !== V_NIL && ssxIs(src, ns, NT_CONST)) {
    return `${scaConstName(src, ns)}::${nm}`;
  }
  return nm;
};

/** ConditionalAssignmentHelper#tail. */
const scaTail = (src: RbSource, b: i32): i32 => (ssxIs(src, b, NT_BEGIN) ? src.a.kid(b, -1) : b);

/** ConditionalAssignment#assignment_type? */
const scaAssignmentType = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (
    t === NT_CASGN ||
    t === NT_CVASGN ||
    t === NT_GVASGN ||
    t === NT_IVASGN ||
    t === NT_LVASGN ||
    t === NT_AND_ASGN ||
    t === NT_OR_ASGN ||
    t === NT_OP_ASGN ||
    t === NT_MASGN
  ) {
    return true;
  }
  if (t !== NT_SEND) {
    return false;
  }
  const m = ssxMeth(src, n);
  return (
    m === "[]=" || m === "<<" || m === "=~" || m === "!~" || m === "<=>" || m.endsWith("=") || m === "<" || m === ">"
  );
};

/** ConditionalAssignmentHelper#lhs. */
const scaLhs = (src: RbSource, n: i32): string => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_SEND) {
    const r = a.kid(n, 0);
    const recv = r === V_NIL ? "" : src.nodeSrc(r);
    const m = ssxMeth(src, n);
    if (m === "[]=") {
      const idx: string[] = [];
      for (let i = 2; i < rbNKid(src, n) - 1; i++) {
        idx.push(src.nodeSrc(a.kid(n, i)));
      }
      return `${recv}[${idx.join(", ")}] = `;
    }
    if (ssxHas(src, n, F_OPERATOR)) {
      return `${recv}.${m.substring(0, toI32(m.length) - 1)} = `;
    }
    return `${recv} ${m} `;
  }
  if (t === NT_OP_ASGN) {
    return `${src.nodeSrc(a.kid(n, 0))} ${a.text(a.kid(n, 1))}= `;
  }
  if (t === NT_OR_ASGN) {
    return `${src.nodeSrc(a.kid(n, 0))} ||= `;
  }
  if (t === NT_AND_ASGN) {
    return `${src.nodeSrc(a.kid(n, 0))} &&= `;
  }
  if (t === NT_CASGN) {
    const ns = a.kid(n, 0);
    const nm = a.text(a.kid(n, 1));
    if (ns === V_NIL) {
      return `${nm} = `;
    }
    if (ssxIs(src, ns, NT_CBASE)) {
      return `::${nm} = `;
    }
    return `${scaConstName(src, ns)}::${nm} = `;
  }
  if (t === NT_CVASGN || t === NT_GVASGN || t === NT_IVASGN || t === NT_LVASGN) {
    return `${a.text(a.kid(n, 0))} = `;
  }
  return src.nodeSrc(n);
};

/** The length of `line` with the first match of /\s*<lhs, spaces as \s*>/ removed. */
const scaStrippedLen = (line: string, lhs: string): i32 => {
  const segs: string[] = [];
  let p = 0;
  const lk = toI32(lhs.length);
  while (p <= lk) {
    let q = lhs.indexOf(" ", p);
    if (q < 0) {
      q = lk;
    }
    segs.push(lhs.substring(p, q));
    p = add32(q, 1);
    if (faulted()) {
      return 0;
    }
  }
  const k = toI32(line.length);
  for (let i = 0; i < k; i++) {
    let j = i;
    while (j < k && ssxIsSpace(line.charCodeAt(j))) {
      j++;
    }
    let ok = true;
    for (let s = 0; s < toI32(segs.length); s++) {
      if (s > 0) {
        while (j >= 0 && j < k && ssxIsSpace(line.charCodeAt(j))) {
          j++;
        }
      }
      const sg = segs[s];
      if (line.substring(j, add32(j, toI32(sg.length))) !== sg) {
        ok = false;
        break;
      }
      j = add32(j, toI32(sg.length));
    }
    if (ok) {
      return scnLen(line) - scnLen(line.substring(i, j));
    }
  }
  return scnLen(line);
};

export class CopStyleConditionalAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ConditionalAssignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF) {
        if (scnElsif(src, n)) {
          continue;
        }
        // expand_elses
        const eb0 = scnElseBranch(src, n);
        const elsifs: i32[] = [];
        this.expandElsif(src, eb0, elsifs);
        let anyTruthy = false;
        for (const x of elsifs) {
          if (x !== V_NIL) {
            anyTruthy = true;
          }
        }
        let eb = eb0;
        if (anyTruthy) {
          // anyTruthy saw an element.
          const el = toI32(elsifs.length);
          if (el < 1) {
            fault();
            return;
          }
          eb = elsifs[el - 1];
          if (elsifs.length > 0) {
            elsifs.pop();
          }
        }
        if (eb === V_NIL) {
          continue;
        }
        const branches: i32[] = [scnIfBranch(src, n)];
        for (const x of elsifs) {
          branches.push(x);
        }
        branches.push(eb);
        this.checkNode(src, n, branches);
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        const eb = a.kid(n, -1);
        if (eb === V_NIL) {
          continue;
        }
        const branches: i32[] = [];
        for (let i = 1; i < rbNKid(src, n) - 1; i++) {
          branches.push(a.kid(a.kid(n, i), -1));
        }
        branches.push(eb);
        this.checkNode(src, n, branches);
      }
    }
  }

  /** expand_elsif */
  private expandElsif(src: RbSource, n: i32, acc: i32[]): void {
    if (n === V_NIL || !ssxIs(src, n, NT_IF) || !scnElsif(src, n)) {
      return;
    }
    acc.push(scnIfBranch(src, n));
    const eb = scnElseBranch(src, n);
    if (ssxIs(src, eb, NT_IF) && scnElsif(src, eb)) {
      this.expandElsif(src, eb, acc);
    } else {
      acc.push(eb);
    }
  }

  private checkNode(src: RbSource, n: i32, branches: i32[]): void {
    const a = src.a;
    // allowed_statements?
    for (const b of branches) {
      if (b === V_NIL) {
        return;
      }
    }
    const stmts: i32[] = [];
    for (const b of branches) {
      const t = scaTail(src, b);
      if (t !== V_NIL) {
        stmts.push(t);
      }
    }
    if (stmts.length > 0) {
      const first = scaLhs(src, stmts[0]);
      for (const s of stmts) {
        if (scaLhs(src, s) !== first || ssxIs(src, s, NT_MASGN)) {
          return;
        }
      }
    }
    const s0 = stmts.length > 0 ? stmts[0] : V_NIL;
    if (stmts.length === 0 || !scaAssignmentType(src, s0)) {
      return;
    }
    for (const s of stmts) {
      if (a.type(s) !== a.type(s0)) {
        return;
      }
    }
    // allowed_single_line?
    for (const b of branches) {
      if (ssxIs(src, b, NT_BEGIN)) {
        return;
      }
    }
    // correction_exceeds_line_limit?
    const asg = scaLhs(src, scaTail(src, atI32(branches, 0)));
    const text = src.nodeSrc(n);
    let longest = -1;
    let p = 0;
    const k = toI32(text.length);
    while (p < k) {
      let q = text.indexOf("\n", p);
      if (q < 0) {
        q = k;
      }
      const l = scaStrippedLen(text.substring(p, q), asg);
      if (l > longest) {
        longest = l;
      }
      p = add32(q, 1);
      if (faulted()) {
        return;
      }
    }
    if (longest < 0) {
      longest = 0;
    }
    if (toI64(scnLen(asg)) + toI64(longest) > toI64(SCN_MAX)) {
      return;
    }
    const probe = new RbRewriter(src.n);
    if (!this.autocorrect(src, n, probe) || !scnCorrectionParses(src, probe)) {
      return;
    }
    const kr = this.c.offense(a.exS(n), a.exE(n));
    if (kr !== null) {
      this.autocorrect(src, n, kr);
      this.c.commit(kr);
    }
  }

  /** replace_branch_assignment */
  private replaceBranch(src: RbSource, b: i32, k: RbRewriter): boolean {
    const a = src.a;
    const v = a.kid(b, -1);
    let s = src.nodeSrc(v);
    if (ssxIs(src, v, NT_ARRAY) && !ssxHas(src, v, F_BEGIN)) {
      s = `[${s}]`;
    }
    return k.replace(a.exS(b), a.exE(b), s);
  }

  /** correct_branches */
  private correctBranch(src: RbSource, b: i32, k: RbRewriter): boolean {
    const v = src.a.kid(b, -1);
    return k.replace(src.a.exS(b), src.a.exE(b), src.nodeSrc(v));
  }

  /** move_assignment_outside_condition; false on a clobbering correction. */
  private autocorrect(src: RbSource, n: i32, k: RbRewriter): boolean {
    const a = src.a;
    const t = a.type(n);
    let ok = true;
    if (t === NT_CASE || t === NT_CASE_MATCH) {
      const eb = scaTail(src, a.kid(n, -1));
      const lhs = scaLhs(src, eb);
      ok = k.insertBefore(a.exS(n), a.exE(n), lhs) && ok;
      for (let i = 1; i < rbNKid(src, n) - 1; i++) {
        ok = this.correctBranch(src, scaTail(src, a.kid(a.kid(n, i), -1)), k) && ok;
      }
      ok = this.replaceBranch(src, eb, k) && ok;
      const es = src.a.fS(src.a.map(n), F_END);
      ok = k.insertBefore(es, src.a.fE(src.a.map(n), F_END), scnSpaces(scnLen(lhs))) && ok;
      return ok;
    }
    if (scnTernary(src, n)) {
      const ib = scnIfBranch(src, n);
      const eb = scnElseBranch(src, n);
      let expr = `${src.nodeSrc(a.kid(n, 0))} ? ${src.nodeSrc(a.kid(ib, -1))} : ${src.nodeSrc(a.kid(eb, -1))}`;
      if (ssxIs(src, ib, NT_SEND) && ssxMeth(src, ib) !== "[]=") {
        expr = `(${expr})`;
      }
      return k.replace(a.exS(n), a.exE(n), `${scaLhs(src, ib)}${expr}`);
    }
    const bs = scnBranches(src, n);
    const ib = scaTail(src, atI32(bs, 0));
    const eb = scaTail(src, atI32(bs, toI32(bs.length) - 1));
    const lhs = scaLhs(src, ib);
    ok = k.insertBefore(a.exS(n), a.exE(n), lhs) && ok;
    ok = this.replaceBranch(src, ib, k) && ok;
    for (let i = 1; i < toI32(bs.length) - 1; i++) {
      ok = this.correctBranch(src, scaTail(src, bs[i]), k) && ok;
    }
    ok = this.replaceBranch(src, eb, k) && ok;
    const es = src.a.fS(src.a.map(n), F_END);
    ok = k.insertBefore(es, src.a.fE(src.a.map(n), F_END), scnSpaces(scnLen(lhs))) && ok;
    return ok;
  }
}
