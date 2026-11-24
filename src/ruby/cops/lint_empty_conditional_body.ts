// Lint/EmptyConditionalBody (AllowComments: true). Its correction (flipping
// an orphaned `else`) runs under `rubocop -a`.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, sub32 } from "../../core/arr";
import { F_BEGIN, F_ELSE, F_END, NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { lbhCommentsContainDisables } from "./lint_batch_help";
import { scnElseBranch, scnElsif, scnIfBranch, scnInverseKeyword } from "./style_cond_help";
import { srdContainsComments } from "./style_redundant_condition";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

export class CopLintEmptyConditionalBody {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyConditionalBody");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || scnIfBranch(src, n) !== V_NIL) {
        continue;
      }
      if (
        ssxHas(src, n, F_BEGIN) &&
        ssxHas(src, n, F_END) &&
        src.line(ssxFS(src, n, F_BEGIN)) === src.line(ssxFS(src, n, F_END))
      ) {
        continue;
      }
      if (srdContainsComments(src, n) && !lbhCommentsContainDisables(src, n, this.c.name)) {
        continue;
      }
      const e = ssxHas(src, n, F_ELSE) ? ssxFS(src, n, F_ELSE) : a.exE(n);
      const k = this.c.offense(a.exS(n), e);
      if (k === null) {
        continue;
      }
      // can_simplify_conditional?
      if (scnElsif(src, n) || scnElseBranch(src, n) === V_NIL || !ssxHas(src, n, F_ELSE)) {
        continue;
      }
      if (src.src(ssxFS(src, n, F_ELSE), ssxFE(src, n, F_ELSE)) !== "else") {
        continue;
      }
      this.flip(src, n, k);
      this.c.commit(k);
    }
  }

  /** flip_orphaned_else. */
  private flip(src: RbSource, n: i32, k: RbRewriter): void {
    const a = src.a;
    const cond = a.kid(n, 0);
    k.replace(ssxFS(src, n, F_ELSE), ssxFE(src, n, F_ELSE), `${scnInverseKeyword(src, n)} ${src.nodeSrc(cond)}`);
    // remove_empty_branch
    if (this.emptyIfBranch(src, n) && this.elseBranch(src, n)) {
      k.remove(a.exS(n), ssxFS(src, n, F_ELSE));
    } else if (src.line(a.exE(cond)) === src.line(ssxFS(src, n, F_ELSE))) {
      k.remove(a.exS(n), ssxFS(src, n, F_ELSE));
    } else {
      // deletion_range(branch_range(node)): branch_range is node.begin..condition.end here.
      const re = a.exE(cond);
      const line = src.line(re);
      const lineLen = sub32(src.lineEnd(line), src.lineStart(line));
      let end = add32(sub32(add32(re, lineLen), src.column(re)), 1);
      if (end > src.n) {
        end = src.n;
      }
      k.remove(a.exS(n), end);
    }
  }

  /** empty_if_branch?. */
  private emptyIfBranch(src: RbSource, n: i32): boolean {
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    if (!ssxIs(src, p, NT_IF)) {
      return true;
    }
    const ib = scnIfBranch(src, p);
    if (ib === V_NIL) {
      return true;
    }
    return ssxIs(src, ib, NT_IF) && scnIfBranch(src, ib) === V_NIL;
  }

  /** else_branch?. */
  private elseBranch(src: RbSource, n: i32): boolean {
    const eb = scnElseBranch(src, n);
    return eb !== V_NIL && !ssxIs(src, eb, NT_IF);
  }
}
