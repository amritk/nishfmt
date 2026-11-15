// Layout/ElseAlignment (with Layout/EndAlignment's keyword style).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_KEYWORD,
  F_SELECTOR,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_IF,
  NT_KWBEGIN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_RESCUE,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import {
  RmlAlignCorr,
  rmlAsgnType,
  rmlBeginsItsLine,
  rmlColumnOffset,
  rmlExtractRhs,
  rmlFirstPartOfCallChain,
  rmlStartLineRange,
  rmlTernary,
} from "./layout_multiline_help";
import { LspIgnored } from "./layout_space_help";

/** IfNode#keyword's length-based predicates: 1 for if?, 2 for unless?, 0 otherwise. */
const rmlElseIfKind = (src: RbSource, n: i32): i32 => {
  if (rmlTernary(src, n)) {
    return 0;
  }
  const t = src.src(rnS(src, n, F_KEYWORD), rnE(src, n, F_KEYWORD));
  if (t === "if") {
    return 1;
  }
  return toI32(t.length) === 6 ? 2 : 0;
};

export class CopLayoutElseAlignment {
  c: RbCop;
  ign: LspIgnored;
  corr: RmlAlignCorr | null = null;

  constructor() {
    this.c = new RbCop("Layout/ElseAlignment");
    this.ign = new LspIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign = new LspIgnored();
    this.corr = new RmlAlignCorr(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF) {
        this.onIf(src, n, V_NIL);
      } else if (t === NT_RESCUE) {
        if (rnHas(src, n, F_ELSE)) {
          const b = this.rescueBase(src, n);
          if (b >= 0) {
            this.check(src, b, n);
          }
        }
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        if (rnHas(src, n, F_ELSE)) {
          this.check(src, rnS(src, a.kid(n, -2), F_KEYWORD), n);
        }
      } else if (rmlAsgnType(t) || t === NT_SEND) {
        // check_assignment
        const rhs = rmlFirstPartOfCallChain(src, rmlExtractRhs(src, n));
        if (rhs === V_NIL || !a.isNode(rhs) || a.type(rhs) !== NT_IF) {
          continue;
        }
        this.onIf(src, rhs, rhs);
        this.ign.add(rhs);
      }
    }
  }

  private onIf(src: RbSource, n: i32, base: i32): void {
    if (this.ign.has(n) || !rnHas(src, n, F_ELSE) || !rmlBeginsItsLine(src, rnS(src, n, F_ELSE))) {
      return;
    }
    // base_range_of_if
    let bs = -1;
    if (base !== V_NIL) {
      bs = src.a.exS(base);
    } else {
      let p = n;
      while (p !== V_NIL) {
        if (src.a.type(p) === NT_IF && rmlElseIfKind(src, p) !== 0) {
          bs = rnS(src, p, F_KEYWORD);
          break;
        }
        p = src.parent(p);
      }
    }
    if (bs >= 0) {
      this.check(src, bs, n);
    }
    // elsif_conditional?
    const eb = src.a.kid(n, rmlElseIfKind(src, n) === 2 ? 1 : 2);
    if (eb !== V_NIL && src.a.isNode(eb) && src.a.type(eb) === NT_IF && !rmlTernary(src, eb)) {
      if (src.src(rnS(src, eb, F_KEYWORD), rnE(src, eb, F_KEYWORD)) === "elsif") {
        this.onIf(src, eb, base);
        this.ign.add(eb);
      }
    }
  }

  /** base_range_of_rescue (-1 when the node has no keyword to align with). */
  private rescueBase(src: RbSource, n: i32): i32 {
    let p = src.parent(n);
    if (p !== V_NIL && src.a.type(p) === NT_ENSURE) {
      p = src.parent(p);
    }
    if (p === V_NIL) {
      return -1;
    }
    const t = src.a.type(p);
    if (t === NT_DEF || t === NT_DEFS) {
      const pp = src.parent(p);
      if (pp !== V_NIL && src.a.type(pp) === NT_SEND) {
        return rnHas(src, pp, F_SELECTOR) ? rnS(src, pp, F_SELECTOR) : -1;
      }
      return rnS(src, p, F_KEYWORD);
    }
    if (t === NT_KWBEGIN) {
      return rnS(src, p, F_BEGIN);
    }
    if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      return rmlStartLineRange(src, p).s;
    }
    if (t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
      return rnS(src, p, F_KEYWORD);
    }
    return rnHas(src, n, F_KEYWORD) ? rnS(src, n, F_KEYWORD) : -1;
  }

  /** check_alignment(base_range, node.loc.else). */
  private check(src: RbSource, bs: i32, n: i32): void {
    const es = rnS(src, n, F_ELSE);
    const ee = rnE(src, n, F_ELSE);
    if (!rmlBeginsItsLine(src, es)) {
      return;
    }
    const delta = rmlColumnOffset(src, bs, es);
    if (delta === 0) {
      return;
    }
    const k = this.c.offense(es, ee);
    const corr = this.corr;
    if (k !== null && corr !== null) {
      corr.correct(k, es, ee, delta);
      this.c.commit(k);
    }
  }
}
