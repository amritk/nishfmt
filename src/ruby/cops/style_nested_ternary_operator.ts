// Style/NestedTernaryOperator.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_COLON,
  F_END,
  F_QUESTION,
  NT_BEGIN,
  NT_BREAK,
  NT_CSEND,
  NT_DEFINED_P,
  NT_IF,
  NT_NEXT,
  NT_RETURN,
  NT_SEND,
  NT_SUPER,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { scnEachStr, scnHeredoc, scnIfBranch, scnTernary } from "./style_cond_help";
import { stpPrefixNot } from "./style_ternary_parentheses";
import { ssxDescendants, ssxFE, ssxFS, ssxIs, ssxLocIs, ssxParenthesized } from "./style_syntax_help";

export class CopStyleNestedTernaryOperator {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/NestedTernaryOperator");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !scnTernary(src, n)) {
        continue;
      }
      for (const d of ssxDescendants(src, n)) {
        if (a.type(d) !== NT_IF || !scnTernary(src, d)) {
          continue;
        }
        const k = this.c.offense(a.exS(d), a.exE(d));
        if (k === null || this.ign.partOf(src, n) || this.containsHeredoc(src, n)) {
          continue;
        }
        const qs = ssxFS(src, n, F_QUESTION);
        const qe = ssxFE(src, n, F_QUESTION);
        k.replace(rbSpaceBegin(src, qs, 0, true, true, false), rbSpaceEnd(src, qe, 0, true, true, false), "\n");
        const cs = ssxFS(src, n, F_COLON);
        const ce = ssxFE(src, n, F_COLON);
        k.replace(rbSpaceBegin(src, cs, 0, true, true, false), rbSpaceEnd(src, ce, 0, true, true, false), "\nelse\n");
        const ib = scnIfBranch(src, n);
        if (ssxIs(src, ib, NT_BEGIN) && ssxLocIs(src, ib, F_BEGIN, "(")) {
          k.remove(ssxFS(src, ib, F_BEGIN), ssxFE(src, ib, F_BEGIN));
          k.remove(ssxFS(src, ib, F_END), ssxFE(src, ib, F_END));
        }
        if (this.modifierPosition(src, n)) {
          k.wrap(a.exS(n), a.exE(n), "(if ", "\nend)");
        } else {
          k.wrap(a.exS(n), a.exE(n), "if ", "\nend");
        }
        this.c.commit(k);
        this.ign.add(n);
      }
    }
  }

  private containsHeredoc(src: RbSource, n: i32): boolean {
    for (const s of scnEachStr(src, n)) {
      if (s !== n && scnHeredoc(src, s)) {
        return true;
      }
    }
    return false;
  }

  /** modifier_position? */
  private modifierPosition(src: RbSource, n: i32): boolean {
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    const t = src.a.type(p);
    if (t === NT_RETURN || t === NT_BREAK || t === NT_NEXT) {
      return true;
    }
    if (
      !(t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_YIELD || t === NT_DEFINED_P) ||
      ssxParenthesized(src, p)
    ) {
      return false;
    }
    if (stpPrefixNot(src, p)) {
      return true;
    }
    const first = t === NT_SEND || t === NT_CSEND ? src.a.kid(p, 2) : src.a.kid(p, 0);
    return first === n;
  }
}
