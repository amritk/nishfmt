// Lint/LiteralAsCondition. Its corrections are safe, so they run under
// `rubocop -a` too.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ELSE,
  F_END,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DSTR,
  NT_FOR,
  NT_IF,
  NT_IN_PATTERN,
  NT_KWBEGIN,
  NT_MATCH_VAR,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_REDO,
  NT_RETURN,
  NT_SEND,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHEN,
  NT_WHILE,
  NT_WHILE_POST,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { LalIgnored } from "./layout_align_help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { lbhBasicLiteral, lbhFalsey, lbhLiteral, lbhTruthy, lbhValueUsed } from "./lint_batch_help";
import {
  ScnAssoc,
  scnElseBranch,
  scnElsif,
  scnElsifConditional,
  scnIfBranch,
  scnRangeWithComments,
  scnUnless,
} from "./style_cond_help";
import { ssxDescendants, ssxFE, ssxFS, ssxHas, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintLiteralAsCondition {
  c: RbCop;
  ign: LalIgnored;
  as: ScnAssoc;
  built: boolean = false;

  constructor() {
    this.c = new RbCop("Lint/LiteralAsCondition");
    this.ign = new LalIgnored();
    this.as = new ScnAssoc();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    this.built = false;
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_AND) {
        this.onAndOr(src, n, lbhTruthy(src, a.kid(n, 0)));
      } else if (t === NT_OR) {
        this.onAndOr(src, n, lbhFalsey(src, a.kid(n, 0)));
      } else if (t === NT_IF) {
        const cond = a.kid(n, 0);
        if (lbhFalsey(src, cond) || lbhTruthy(src, cond)) {
          this.correctIf(src, n, cond);
        }
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        this.onLoop(src, n, t === NT_WHILE);
      } else if (t === NT_WHILE_POST || t === NT_UNTIL_POST) {
        this.onPostLoop(src, n, t === NT_WHILE_POST);
      } else if (t === NT_CASE) {
        this.onCase(src, n);
      } else if (t === NT_CASE_MATCH) {
        this.onCaseMatch(src, n);
      } else if (t === NT_SEND) {
        // negation_method?: a receiver and the method `!`.
        if (a.kid(n, 0) !== V_NIL && ssxMeth(src, n) === "!") {
          const cond = a.kid(n, 0);
          if (lbhLiteral(src, cond)) {
            this.c.offense(a.exS(cond), a.exE(cond));
          } else {
            this.checkNode(src, cond);
          }
        }
      }
    }
  }

  private onAndOr(src: RbSource, n: i32, hit: boolean): void {
    const a = src.a;
    if (!hit) {
      return;
    }
    const lhs = a.kid(n, 0);
    const k = this.c.offense(a.exS(lhs), a.exE(lhs));
    if (k === null) {
      return;
    }
    const rhs = a.kid(n, 1);
    if (this.voidValue(src, rhs)) {
      return;
    }
    this.replaceNode(src, k, n, src.nodeSrc(rhs));
  }

  /** replace_node: skipped inside a node an earlier correction replaced. */
  private replaceNode(src: RbSource, k: RbRewriter, n: i32, repl: string): void {
    for (let p = src.parent(n); p !== V_NIL; p = src.parent(p)) {
      if (this.ign.has(p)) {
        return;
      }
    }
    k.replace(src.a.exS(n), src.a.exE(n), repl);
    this.c.commit(k);
    this.ign.add(n);
  }

  /** removable?: whether the node can go without leaving a hole where a value is needed. */
  private removable(src: RbSource, n: i32): boolean {
    if (lbhValueUsed(src, n)) {
      return false;
    }
    const p = src.parent(n);
    if (p === V_NIL) {
      return true;
    }
    const t = src.a.type(p);
    if (t === NT_BEGIN || t === NT_KWBEGIN || t === NT_WHEN) {
      return true;
    }
    return (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) && ssxHas(src, p, F_END);
  }

  /** void_value_expression?. */
  private voidValue(src: RbSource, n0: i32): boolean {
    let n = n0;
    while (ssxIs(src, n, NT_BEGIN)) {
      n = src.a.nKid(n) > 0 ? src.a.kid(n, -1) : V_NIL;
    }
    return ssxIs(src, n, NT_RETURN) || ssxIs(src, n, NT_BREAK) || ssxIs(src, n, NT_NEXT);
  }

  private onLoop(src: RbSource, n: i32, isWhile: boolean): void {
    const a = src.a;
    const cond = a.kid(n, 0);
    const keep = isWhile ? "true" : "false";
    if (src.nodeSrc(cond) === keep) {
      return;
    }
    const sameSense = isWhile ? lbhTruthy(src, cond) : lbhFalsey(src, cond);
    const otherSense = isWhile ? lbhFalsey(src, cond) : lbhTruthy(src, cond);
    if (!sameSense && !otherSense) {
      return;
    }
    const k = this.c.offense(a.exS(cond), a.exE(cond));
    if (k === null) {
      return;
    }
    if (sameSense) {
      this.replaceNode(src, k, cond, keep);
    } else {
      this.replaceNode(src, k, n, this.removable(src, n) ? "" : "nil");
    }
  }

  private onPostLoop(src: RbSource, n: i32, isWhile: boolean): void {
    const a = src.a;
    const cond = a.kid(n, 0);
    const keep = isWhile ? "true" : "false";
    const cs = src.nodeSrc(cond);
    if (cs === keep) {
      return;
    }
    const sameSense = isWhile ? lbhTruthy(src, cond) : lbhFalsey(src, cond);
    const otherSense = isWhile ? lbhFalsey(src, cond) : lbhTruthy(src, cond);
    if (!sameSense && !otherSense) {
      return;
    }
    const k = this.c.offense(a.exS(cond), a.exE(cond));
    if (k === null) {
      return;
    }
    if (sameSense) {
      // node.source.sub(condition.source, keep)
      const ns = src.nodeSrc(n);
      const at = ns.indexOf(cs);
      if (at < 0) {
        return;
      }
      this.replaceNode(
        src,
        k,
        n,
        `${ns.substring(0, at)}${keep}${ns.substring(at + toI32(cs.length), toI32(ns.length))}`,
      );
      return;
    }
    if (this.orphansLoopControl(src, n)) {
      return;
    }
    const body = a.kid(n, 1);
    const parts: string[] = [];
    for (let i = 0; i < a.nKid(body); i++) {
      const ch = a.kid(body, i);
      if (a.isNode(ch)) {
        parts.push(src.nodeSrc(ch));
      }
    }
    this.replaceNode(src, k, n, parts.join("\n"));
  }

  /** orphans_loop_control_keyword?. */
  private orphansLoopControl(src: RbSource, n: i32): boolean {
    const a = src.a;
    const body = a.kid(n, 1);
    const nodes: i32[] = [body];
    for (const d of ssxDescendants(src, body)) {
      nodes.push(d);
    }
    for (const ctl of nodes) {
      const t = a.type(ctl);
      if (t !== NT_NEXT && t !== NT_BREAK && t !== NT_REDO) {
        continue;
      }
      let shielded = false;
      let p = src.parent(ctl);
      while (p !== V_NIL && p !== n) {
        const pt = a.type(p);
        if (
          pt === NT_BLOCK ||
          pt === NT_NUMBLOCK ||
          pt === NT_WHILE ||
          pt === NT_UNTIL ||
          pt === NT_WHILE_POST ||
          pt === NT_UNTIL_POST ||
          pt === NT_FOR
        ) {
          shielded = true;
        }
        p = src.parent(p);
      }
      if (!shielded) {
        return true;
      }
    }
    return false;
  }

  private onCase(src: RbSource, n: i32): void {
    const a = src.a;
    const cond = a.kid(n, 0);
    if (cond !== V_NIL) {
      if (!lbhFalsey(src, cond) && !lbhTruthy(src, cond)) {
        return;
      }
      this.checkCase(src, n);
      return;
    }
    for (let i = 1; i < a.nKid(n); i++) {
      const w = a.kid(n, i);
      if (!ssxIs(src, w, NT_WHEN)) {
        continue;
      }
      let all = true;
      for (let j = 0; j < a.nKid(w) - 1; j++) {
        if (!lbhLiteral(src, a.kid(w, j))) {
          all = false;
        }
      }
      if (!all) {
        continue;
      }
      this.c.offense(a.exS(a.kid(w, 0)), a.exE(a.kid(w, a.nKid(w) - 2)));
    }
  }

  private onCaseMatch(src: RbSource, n: i32): void {
    const a = src.a;
    if (a.kid(n, 0) !== V_NIL) {
      for (const d of ssxDescendants(src, n)) {
        if (a.type(d) === NT_MATCH_VAR) {
          return;
        }
      }
      this.checkCase(src, n);
      return;
    }
    for (let i = 1; i < a.nKid(n); i++) {
      const ip = a.kid(n, i);
      if (ssxIs(src, ip, NT_IN_PATTERN) && lbhLiteral(src, a.kid(ip, 0))) {
        this.c.offense(a.exS(ip), a.exE(ip));
      }
    }
  }

  private checkCase(src: RbSource, n: i32): void {
    const cond = src.a.kid(n, 0);
    if (ssxIs(src, cond, NT_ARRAY) && !this.primitiveArray(src, cond)) {
      return;
    }
    if (ssxIs(src, cond, NT_DSTR)) {
      return;
    }
    this.handleNode(src, cond);
  }

  private primitiveArray(src: RbSource, n: i32): boolean {
    for (let i = 0; i < src.a.nKid(n); i++) {
      const c = src.a.kid(n, i);
      const ok = ssxIs(src, c, NT_ARRAY) ? this.primitiveArray(src, c) : lbhBasicLiteral(src, c);
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  private checkNode(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxIs(src, n, NT_SEND)) {
      // prefix_bang?: negation_method? with the selector `!`.
      if (
        a.kid(n, 0) !== V_NIL &&
        ssxMeth(src, n) === "!" &&
        ssxHas(src, n, F_SELECTOR) &&
        src.src(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR)) === "!"
      ) {
        this.handleNode(src, a.kid(n, 0));
      }
      return;
    }
    if (ssxIs(src, n, NT_AND) || ssxIs(src, n, NT_OR)) {
      for (let i = 0; i < a.nKid(n); i++) {
        if (a.isNode(a.kid(n, i))) {
          this.handleNode(src, a.kid(n, i));
        }
      }
      return;
    }
    if (ssxIs(src, n, NT_BEGIN) && a.nKid(n) === 1) {
      this.handleNode(src, a.kid(n, 0));
    }
  }

  private handleNode(src: RbSource, n: i32): void {
    const a = src.a;
    if (lbhLiteral(src, n)) {
      const p = src.parent(n);
      if (p !== V_NIL && a.type(p) === NT_AND) {
        return;
      }
      this.c.offense(a.exS(n), a.exE(n));
      return;
    }
    if (ssxIs(src, n, NT_SEND) || ssxIs(src, n, NT_AND) || ssxIs(src, n, NT_OR) || ssxIs(src, n, NT_BEGIN)) {
      this.checkNode(src, n);
    }
  }

  /** correct_if_node. */
  private correctIf(src: RbSource, n: i32, cond: i32): void {
    const a = src.a;
    const result = scnUnless(src, n) ? lbhFalsey(src, cond) : lbhTruthy(src, cond);
    const ib = scnIfBranch(src, n);
    const eb = scnElseBranch(src, n);
    const surviving = result ? ib : eb;
    const elsif = scnElsif(src, n);
    const hasElse = ssxHas(src, n, F_ELSE);
    if (surviving === V_NIL && (elsif || hasElse)) {
      return;
    }
    const k = this.c.offense(a.exS(cond), a.exE(cond));
    if (k === null) {
      return;
    }
    let repl = "";
    if (elsif && result) {
      if (!this.built) {
        this.as.build(src);
        this.built = true;
      }
      const r = scnRangeWithComments(src, this.as, ib);
      repl = `else\n  ${src.src(r[0], r[1])}`;
    } else if (elsif && !result) {
      repl = `else\n  ${src.nodeSrc(eb)}`;
    } else if (ib !== V_NIL && result) {
      repl = src.nodeSrc(ib);
    } else if (scnElsifConditional(src, n)) {
      const es = src.nodeSrc(eb);
      const at = es.indexOf("elsif");
      repl = at < 0 ? `${es}\nend` : `${es.substring(0, at)}if${es.substring(at + 5, toI32(es.length))}\nend`;
    } else if (hasElse || ssxHas(src, n, F_QUESTION)) {
      repl = src.nodeSrc(eb);
    } else if (!this.removable(src, n)) {
      repl = "nil";
    }
    this.replaceNode(src, k, n, repl);
  }
}
