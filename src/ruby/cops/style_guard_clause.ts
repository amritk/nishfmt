// Style/GuardClause (MinBodyLength: 1, AllowConsecutiveConditionals: false;
// Layout/LineLength Max: 120).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_END,
  F_HEREDOC_END,
  F_KEYWORD,
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_DEF,
  NT_DEFS,
  NT_IF,
  NT_LVAR,
  NT_LVASGN,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_RETURN,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  SCN_MAX,
  scnBranches,
  scnElse,
  scnElseBranch,
  scnElsif,
  scnElsifConditional,
  scnEndlessDef,
  scnHeredoc,
  scnIfBranch,
  scnInverseKeyword,
  scnLen,
  scnModifier,
  scnOperatorKeyword,
  scnTernary,
  scnThen,
  scnWholeE,
  scnWholeS,
} from "./style_cond_help";
import {
  ssxAssignment,
  ssxDefBody,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxIs,
  ssxIsCall,
  ssxMeth,
} from "./style_syntax_help";

/** match_guard_clause?: raise/fail without receiver, return, break or next, on one line. */
const sgcMatch = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  let ok = t === NT_RETURN || t === NT_BREAK || t === NT_NEXT;
  if (t === NT_SEND && src.a.kid(n, 0) === V_NIL) {
    const m = ssxMeth(src, n);
    ok = m === "raise" || m === "fail";
  }
  return ok && src.line(src.a.exS(n)) === src.line(src.a.exE(n));
};

/** Node#guard_clause?: the guard node (the rhs of an and/or), or V_NIL. */
const sgcGuard = (src: RbSource, n: i32): i32 => {
  if (n === V_NIL) {
    return V_NIL;
  }
  const g = scnOperatorKeyword(src, n) ? src.a.kid(n, 1) : n;
  return sgcMatch(src, g) ? g : V_NIL;
};

export class CopStyleGuardClause {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/GuardClause");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        this.checkEndingBody(src, ssxDefBody(src, n));
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        const m = ssxMeth(src, a.kid(n, 0));
        if (m === "define_method" || m === "define_singleton_method") {
          this.checkEndingBody(src, a.kid(n, 2));
        }
      } else if (t === NT_IF) {
        this.onIf(src, n);
      }
    }
  }

  private onIf(src: RbSource, n: i32): void {
    if (this.acceptedForm(src, n, false)) {
      return;
    }
    let g = sgcGuard(src, scnIfBranch(src, n));
    let kw = "";
    let guard = 0;
    if (g !== V_NIL) {
      kw = src.src(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      guard = 1;
    } else {
      g = sgcGuard(src, scnElseBranch(src, n));
      if (g === V_NIL) {
        return;
      }
      kw = scnInverseKeyword(src, n);
      guard = 2;
    }
    const andOr = scnOperatorKeyword(src, src.parent(g));
    if (andOr) {
      guard = 0;
    }
    this.registerOffense(src, n, andOr ? src.nodeSrc(src.parent(g)) : src.nodeSrc(g), kw, guard);
  }

  private checkEndingBody(src: RbSource, body: i32): void {
    if (body === V_NIL) {
      return;
    }
    if (ssxIs(src, body, NT_IF)) {
      this.checkEndingIf(src, body);
    } else if (ssxIs(src, body, NT_BEGIN)) {
      const last = src.a.kid(body, -1);
      if (ssxIs(src, last, NT_IF)) {
        this.checkEndingIf(src, last);
      }
    }
  }

  private checkEndingIf(src: RbSource, n: i32): void {
    if (this.acceptedForm(src, n, true)) {
      return;
    }
    // min_body_length?
    if (src.line(ssxFS(src, n, F_END)) - src.line(ssxFS(src, n, F_KEYWORD)) <= 1) {
      return;
    }
    this.registerOffense(src, n, "return", scnInverseKeyword(src, n), 0);
    this.checkEndingBody(src, scnIfBranch(src, n));
  }

  /** register_offense (guard: 0 nil, 1 :if, 2 :else). */
  private registerOffense(src: RbSource, n: i32, exitKw: string, condKw: string, guard: i32): void {
    const a = src.a;
    const cond = src.nodeSrc(a.kid(n, 0));
    let example = `${exitKw} ${condKw} ${cond}`;
    let multi: string | null = null;
    if (src.column(a.exS(n)) + scnLen(example) > SCN_MAX) {
      if (this.trivial(src, n)) {
        return;
      }
      example = `${condKw} ${cond}; ${exitKw}; end`;
      multi = `${condKw} ${cond}\n  ${exitKw}`;
    }
    const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
    if (k === null) {
      return;
    }
    if (scnElse(src, n) && guard === 0) {
      return;
    }
    this.autocorrect(src, n, example, multi, guard, k);
    this.c.commit(k);
  }

  private autocorrect(src: RbSource, n: i32, example: string, multi: string | null, guard: i32, k: RbRewriter): void {
    const a = src.a;
    const rs = ssxFS(src, n, F_KEYWORD);
    const re = a.exE(a.kid(n, 0));
    k.replace(rs, re, multi === null ? example : multi);
    if (scnThen(src, n)) {
      k.replace(ssxFS(src, n, F_BEGIN), ssxFE(src, n, F_BEGIN), "\n");
    }
    const ib = scnIfBranch(src, n);
    const eb = scnElseBranch(src, n);
    const guardBranch = guard === 2 ? eb : ib;
    const leaveBranch = guard === 2 ? ib : eb;
    const heredoc = this.findHeredocArgument(src, guardBranch);
    if (multi !== null) {
      if (guard !== 0 && heredoc !== V_NIL) {
        k.insertAfter(ssxFS(src, heredoc, F_HEREDOC_END), ssxFE(src, heredoc, F_HEREDOC_END), "\nend");
      } else {
        k.insertAfter(rs, re, "\nend");
      }
    }
    if (heredoc !== V_NIL) {
      this.removeWholeLines(src, k, ssxFS(src, n, F_END), ssxFE(src, n, F_END));
      if (!scnElse(src, n)) {
        return;
      }
      if (leaveBranch !== V_NIL) {
        this.removeWholeLines(src, k, a.exS(leaveBranch), a.exE(leaveBranch));
        k.insertAfter(
          ssxFS(src, heredoc, F_HEREDOC_END),
          ssxFE(src, heredoc, F_HEREDOC_END),
          `\n${src.nodeSrc(leaveBranch)}`,
        );
      }
      this.removeWholeLines(src, k, ssxFS(src, n, F_ELSE), ssxFE(src, n, F_ELSE));
      const b = guard === 1 ? ib : eb;
      this.removeWholeLines(src, k, a.exS(b), a.exE(b));
      return;
    }
    k.remove(ssxFS(src, n, F_END), ssxFE(src, n, F_END));
    if (!scnElse(src, n)) {
      return;
    }
    k.remove(ssxFS(src, n, F_ELSE), ssxFE(src, n, F_ELSE));
    const b = guard === 1 ? ib : eb;
    k.remove(a.exS(b), a.exE(b));
  }

  private removeWholeLines(src: RbSource, k: RbRewriter, s: i32, e: i32): void {
    k.remove(scnWholeS(src, s), scnWholeE(src, e, true));
  }

  /** find_heredoc_argument. */
  private findHeredocArgument(src: RbSource, n0: i32): i32 {
    let n = n0;
    if (n === V_NIL) {
      return V_NIL;
    }
    while (ssxIs(src, n, NT_BEGIN)) {
      n = src.a.kid(n, 0);
    }
    if (n === V_NIL || !src.a.isNode(n)) {
      return V_NIL;
    }
    if (scnHeredoc(src, n)) {
      return n;
    }
    if (!ssxIsCall(src, n)) {
      return V_NIL;
    }
    for (let i = src.a.nKid(n) - 1; i >= 2; i--) {
      const h = this.findHeredocArgument(src, src.a.kid(n, i));
      if (h !== V_NIL) {
        return h;
      }
    }
    return this.findHeredocArgument(src, src.a.kid(n, 0));
  }

  /** trivial? */
  private trivial(src: RbSource, n: i32): boolean {
    const ib = scnIfBranch(src, n);
    if (ib === V_NIL) {
      return false;
    }
    let k = 0;
    for (const b of scnBranches(src, n)) {
      if (b !== V_NIL) {
        k++;
      }
    }
    return k === 1 && !ssxIs(src, ib, NT_IF) && !ssxIs(src, ib, NT_BEGIN);
  }

  /** accepted_form? */
  private acceptedForm(src: RbSource, n: i32, ending: boolean): boolean {
    const a = src.a;
    if (this.acceptedIf(src, n, ending)) {
      return true;
    }
    const cond = a.kid(n, 0);
    if (src.line(a.exS(cond)) !== src.line(a.exE(cond))) {
      return true;
    }
    const p = src.parent(n);
    return p !== V_NIL && (ssxAssignment(src, p) || scnEndlessDef(src, p));
  }

  private acceptedIf(src: RbSource, n: i32, ending: boolean): boolean {
    if (scnModifier(src, n) || scnTernary(src, n) || scnElsifConditional(src, n) || this.assignedLvarUsed(src, n)) {
      return true;
    }
    if (ending) {
      return scnElse(src, n);
    }
    return !scnElse(src, n) || scnElsif(src, n);
  }

  /** assigned_lvar_used_in_if_branch? */
  private assignedLvarUsed(src: RbSource, n: i32): boolean {
    const ib = scnIfBranch(src, n);
    if (ib === V_NIL) {
      return false;
    }
    const names = new Set<string>();
    let any = false;
    for (const d of ssxDescendants(src, src.a.kid(n, 0))) {
      if (src.a.type(d) === NT_LVASGN) {
        names.add(src.a.text(src.a.kid(d, 0)));
        any = true;
      }
    }
    if (!any) {
      return false;
    }
    for (const d of ssxDescendants(src, ib)) {
      if (src.a.type(d) === NT_LVAR && names.has(src.nodeSrc(d))) {
        return true;
      }
    }
    return false;
  }
}
