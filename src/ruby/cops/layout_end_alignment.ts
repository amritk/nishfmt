// Layout/EndAlignment (EnforcedStyleAlignWith: keyword).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_END,
  F_KEYWORD,
  NT_AND,
  NT_BEGIN,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CLASS,
  NT_IF,
  NT_MODULE,
  NT_OR,
  NT_SCLASS,
  NT_SEND,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import {
  rmlAlignEnd,
  rmlAsgnType,
  rmlColumnOffset,
  rmlExtractRhs,
  rmlFirstChildNode,
  rmlFirstPartOfCallChain,
  rmlIsArgument,
  rmlIsAssignment,
  rmlIsConditional,
  rmlTernary,
} from "./layout_multiline_help";
import { LspIgnored } from "./layout_space_help";

/** EndAlignment#leading_node. */
export const rmlEndLeadingNode = (src: RbSource, rhs0: i32): i32 => {
  let rhs = rmlFirstPartOfCallChain(src, rhs0);
  while (rhs !== V_NIL && src.a.isNode(rhs)) {
    const t = src.a.type(rhs);
    if (t !== NT_BEGIN && t !== NT_OR && t !== NT_AND) {
      break;
    }
    rhs = rmlFirstChildNode(src, rhs);
  }
  return rhs;
};

export class CopLayoutEndAlignment {
  c: RbCop;
  ign: LspIgnored;

  constructor() {
    this.c = new RbCop("Layout/EndAlignment");
    this.ign = new LspIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign = new LspIgnored();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SCLASS || t === NT_CLASS || t === NT_MODULE) {
        const p = src.parent(n);
        if (p !== V_NIL && rmlIsAssignment(src, p)) {
          this.asgn(src, n);
        } else {
          this.check(src, n);
        }
      } else if (t === NT_IF) {
        if (!rmlTernary(src, n)) {
          this.check(src, n);
        }
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        this.check(src, n);
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        if (rmlIsArgument(src, n)) {
          this.asgn(src, n);
        } else {
          this.check(src, n);
        }
      } else if (rmlAsgnType(t) || t === NT_SEND) {
        const rhs0 = rmlExtractRhs(src, n);
        if (rhs0 === V_NIL) {
          continue;
        }
        // check_assignment
        const rhs = rmlEndLeadingNode(src, rhs0);
        if (rhs === V_NIL || !rmlIsConditional(src, rhs) || rmlTernary(src, rhs)) {
          continue;
        }
        this.asgn(src, rhs);
      }
    }
  }

  /** check_asgn_alignment: the keyword style checks the keyword, then ignores the node. */
  private asgn(src: RbSource, inner: i32): void {
    this.check(src, inner);
    this.ign.add(inner);
  }

  /** check_end_kw_alignment against the node's keyword. */
  private check(src: RbSource, n: i32): void {
    if (this.ign.has(n) || !rnHas(src, n, F_END)) {
      return;
    }
    const es = rnS(src, n, F_END);
    const ks = rnS(src, n, F_KEYWORD);
    if (src.line(ks) === src.line(es) || rmlColumnOffset(src, ks, es) === 0) {
      return;
    }
    const k = this.c.offense(es, rnE(src, n, F_END));
    if (k !== null) {
      rmlAlignEnd(src, k, es, src.column(src.a.exS(n)));
      this.c.commit(k);
    }
  }
}
