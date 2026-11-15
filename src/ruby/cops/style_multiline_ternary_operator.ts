// Style/MultilineTernaryOperator.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BREAK, NT_CSEND, NT_DEFINED_P, NT_IF, NT_NEXT, NT_RETURN, NT_SEND, NT_SUPER, NT_YIELD, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { scnCommentsInLines, scnElseBranch, scnIfBranch, scnTernary } from "./style_cond_help";
import { ssxMeth, ssxParenthesized } from "./style_syntax_help";

/** MethodIdentifierPredicates#assignment_method?: not a comparison, ends with `=`. */
export const smtAssignmentMethod = (m: string): boolean =>
  m !== "==" && m !== "===" && m !== "!=" && m !== "<=" && m !== ">=" && m.length > 0 && m.endsWith("=");

export class CopStyleMultilineTernaryOperator {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/MultilineTernaryOperator");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || !scnTernary(src, n) || src.line(a.exS(n)) === src.line(a.exE(n))) {
        continue;
      }
      const repl = this.replacement(src, n);
      if (src.nodeSrc(n) === repl) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null || this.ign.partOf(src, n)) {
        continue;
      }
      k.replace(a.exS(n), a.exE(n), repl);
      const p = src.parent(n);
      if (p !== V_NIL) {
        const cs = scnCommentsInLines(src, src.line(a.exS(n)), src.line(a.exS(scnElseBranch(src, n))));
        if (cs.length > 0) {
          const parts: string[] = [];
          for (const c of cs) {
            parts.push(`${src.src(src.commS[c], src.commE[c])}\n`);
          }
          k.insertBefore(a.exS(p), a.exE(p), parts.join(""));
        }
      }
      this.c.commit(k);
      this.ign.add(n);
    }
  }

  private replacement(src: RbSource, n: i32): string {
    const c = src.nodeSrc(src.a.kid(n, 0));
    const t = src.nodeSrc(scnIfBranch(src, n));
    const e = src.nodeSrc(scnElseBranch(src, n));
    if (this.singleLine(src, n)) {
      return `${c} ? ${t} : ${e}`;
    }
    return `if ${c}\n  ${t}\nelse\n  ${e}\nend`;
  }

  /** enforce_single_line_ternary_operator? */
  private singleLine(src: RbSource, n: i32): boolean {
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    const t = src.a.type(p);
    if (t === NT_DEFINED_P) {
      return !ssxParenthesized(src, p);
    }
    if (t === NT_RETURN || t === NT_BREAK || t === NT_NEXT || t === NT_CSEND || t === NT_SUPER || t === NT_YIELD) {
      return true;
    }
    if (t === NT_SEND) {
      return !smtAssignmentMethod(ssxMeth(src, p));
    }
    return false;
  }
}
