// Style/SoleNestedConditional (AllowModifier: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_END,
  F_KEYWORD,
  F_OPERATOR,
  F_SELECTOR,
  NT_AND,
  NT_CVASGN,
  NT_GVASGN,
  NT_IF,
  NT_IVASGN,
  NT_LVASGN,
  NT_OR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  ScnAssoc,
  scnElse,
  scnElsif,
  scnIfBranch,
  scnIfKw,
  scnModifier,
  scnTernary,
  scnUnless,
  scnWholeE,
  scnWholeS,
} from "./style_cond_help";
import { scnCorrectionParses } from "./style_cond_reparse";
import { srcComparison } from "./style_redundant_conditional";
import { stpPrefixNot } from "./style_ternary_parentheses";
import {
  ssxAssignment,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxIs,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
} from "./style_syntax_help";

export class CopStyleSoleNestedConditional {
  c: RbCop;
  as: ScnAssoc;
  ignored: Set<i32>;
  ok: boolean = true;

  constructor() {
    this.c = new RbCop("Style/SoleNestedConditional");
    this.as = new ScnAssoc();
    this.ignored = new Set<i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ignored = new Set<i32>();
    let built = false;
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !this.offending(src, n)) {
        continue;
      }
      if (!built) {
        this.as.build(src);
        built = true;
      }
      const ib = scnIfBranch(src, n);
      const probe = new RbRewriter(src.n);
      this.ok = true;
      this.autocorrect(src, n, ib, probe);
      if (!this.ok || !scnCorrectionParses(src, probe)) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, ib, F_KEYWORD), ssxFE(src, ib, F_KEYWORD));
      if (k === null || this.ignored.has(n)) {
        continue;
      }
      this.ok = true;
      this.autocorrect(src, n, ib, k);
      if (this.ok) {
        this.c.commit(k);
      }
      this.ignored.add(ib);
    }
  }

  /** offending_conditional? */
  private offending(src: RbSource, n: i32): boolean {
    if (scnTernary(src, n) || scnElse(src, n) || scnElsif(src, n)) {
      return false;
    }
    const ib = scnIfBranch(src, n);
    if (ib === V_NIL || !ssxIs(src, ib, NT_IF)) {
      return false;
    }
    // use_variable_assignment_in_condition?
    const cond = src.a.kid(n, 0);
    const names: string[] = [];
    const all: i32[] = [cond];
    for (const d of ssxDescendants(src, cond)) {
      all.push(d);
    }
    for (const x of all) {
      const t = src.a.type(x);
      if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN) {
        names.push(src.a.text(src.a.kid(x, 0)));
      }
    }
    const ics = src.nodeSrc(src.a.kid(ib, 0));
    for (const nm of names) {
      if (nm === ics) {
        return false;
      }
    }
    return !scnElse(src, ib) && !scnTernary(src, ib);
  }

  private rep(k: RbRewriter, s: i32, e: i32, t: string): void {
    if (!k.replace(s, e, t)) {
      this.ok = false;
    }
  }

  private autocorrect(src: RbSource, n: i32, ib: i32, k: RbRewriter): void {
    const a = src.a;
    if (scnModifier(src, n)) {
      this.correctNode(src, ib, k);
      const ic = a.kid(ib, 0);
      if (!k.insertBefore(a.exS(ic), a.exE(ic), `${this.chainable(src, n)} && `)) {
        this.ok = false;
      }
      const rs = ssxFS(src, n, F_KEYWORD);
      const re = a.exE(a.kid(n, 0));
      this.rep(k, rbSpaceBegin(src, rs, 0, false, false, false), rbSpaceEnd(src, re, 0, false, false, false), "");
      return;
    }
    this.correctNode(src, n, k);
    const nc = a.kid(n, 0);
    const ic = a.kid(ib, 0);
    if (scnModifier(src, ib)) {
      if (!k.insertAfter(a.exS(nc), a.exE(nc), ` && ${this.chainable(src, ib)}`)) {
        this.ok = false;
      }
      const rs = ssxFS(src, ib, F_KEYWORD);
      const re = a.exE(ic);
      this.rep(k, rbSpaceBegin(src, rs, 0, false, false, false), rbSpaceEnd(src, re, 0, false, false, false), "");
      return;
    }
    this.rep(k, a.exE(nc), a.exS(ic), " && ");
    this.rep(k, a.exS(ic), a.exE(ic), this.chainable(src, ib));
    const es = ssxFS(src, n, F_END);
    const ee = ssxFE(src, n, F_END);
    if (src.line(es) === src.line(ssxFS(src, ib, F_END))) {
      this.rep(k, es, ee, "");
    } else {
      this.rep(k, scnWholeS(src, es), scnWholeE(src, ee, true), "");
    }
    // correct_for_comment
    const icl = src.line(a.exS(ic));
    const texts: string[] = [];
    for (const c of this.as.of(ib)) {
      if (src.line(src.commS[c]) < icl) {
        texts.push(src.src(src.commS[c], src.commE[c]));
      }
    }
    if (texts.length > 0) {
      const ks = ssxFS(src, n, F_KEYWORD);
      if (!k.insertBefore(ks, ssxFE(src, n, F_KEYWORD), `${texts.join("\n")}\n`)) {
        this.ok = false;
      }
    }
  }

  /** correct_node */
  private correctNode(src: RbSource, n: i32, k: RbRewriter): void {
    if (scnUnless(src, n)) {
      this.rep(k, ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD), "if");
    }
    const c = src.a.kid(n, 0);
    this.rep(k, src.a.exS(c), src.a.exE(c), this.chainable(src, n));
  }

  /** chainable_condition */
  private chainable(src: RbSource, n: i32): string {
    const c = src.a.kid(n, 0);
    const w = this.addParens(src, c);
    if (scnIfKw(src, n)) {
      return w;
    }
    return ssxIs(src, c, NT_AND) ? `!(${w})` : `!${w}`;
  }

  /** add_parentheses_if_needed */
  private addParens(src: RbSource, c: i32): string {
    const a = src.a;
    const chk = ssxIsAnyBlock(src, c) ? a.kid(c, 0) : c;
    if (!this.needParens(src, chk)) {
      return src.nodeSrc(c);
    }
    if (
      ssxIsCall(src, c) &&
      a.nKid(c) > 2 &&
      !ssxParenthesized(src, c) &&
      !srcComparison(ssxMeth(src, c)) &&
      !ssxOperatorName(ssxMeth(src, c))
    ) {
      return `${src.src(a.exS(c), ssxFE(src, c, F_SELECTOR))}(${src.src(a.exS(a.kid(c, 2)), a.exE(c))})`;
    }
    if (ssxIs(src, c, NT_AND)) {
      return this.parenthesizedAnd(src, c);
    }
    return `(${src.nodeSrc(c)})`;
  }

  /** add_parentheses? */
  private needParens(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (ssxAssignment(src, n) || ssxIs(src, n, NT_OR)) {
      return true;
    }
    if (ssxIs(src, n, NT_AND)) {
      for (const d of ssxDescendants(src, n)) {
        if (ssxAssignment(src, d)) {
          return true;
        }
      }
    }
    if (!ssxIsCall(src, n)) {
      return false;
    }
    return (a.nKid(n) > 2 && !ssxParenthesized(src, n)) || stpPrefixNot(src, n);
  }

  /** parenthesized_and */
  private parenthesizedAnd(src: RbSource, n: i32): string {
    const a = src.a;
    const os = ssxFS(src, n, F_OPERATOR);
    const oe = ssxFE(src, n, F_OPERATOR);
    const op = src.src(rbSpaceBegin(src, os, 0, true, true, false), rbSpaceEnd(src, oe, 0, true, true, false));
    const r = a.kid(n, 1);
    let rs = src.nodeSrc(r);
    if (ssxIs(src, r, NT_AND)) {
      rs = this.parenthesizedAnd(src, r);
    } else if (ssxAssignment(src, r)) {
      rs = `(${src.nodeSrc(r)})`;
    }
    return `${src.nodeSrc(a.kid(n, 0))}${op}${rs}`;
  }
}
