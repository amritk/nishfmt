// Style/OneLineConditional (AlwaysCorrectToMultiline: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32 } from "../../core/arr";
import {
  F_BEGIN,
  NT_AND,
  NT_BEGIN,
  NT_BREAK,
  NT_CASGN,
  NT_CONST,
  NT_CSEND,
  NT_DEFINED_P,
  NT_IF,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_NEXT,
  NT_OR,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_SUPER,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import {
  scnElseBranch,
  scnElsif,
  scnElsifConditional,
  scnIfBranch,
  scnModifier,
  scnOperatorKeyword,
  scnTernary,
} from "./style_cond_help";
import { siieIfThenReplacement } from "./style_if_inside_else";
import { stpPrefixNot } from "./style_ternary_parentheses";
import { ssxAssignment, ssxIs, ssxIsCall, ssxLocIs, ssxMeth, ssxOperatorName } from "./style_syntax_help";

/** OneLineConditional#requires_parentheses? and the ternary operands of IfWithSemicolon share this shape. */
const solcRequiresParens = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if (
    t === NT_AND ||
    t === NT_OR ||
    t === NT_IF ||
    t === NT_RESCUE ||
    t === NT_WHILE ||
    t === NT_UNTIL ||
    t === NT_WHILE_POST ||
    t === NT_UNTIL_POST ||
    t === NT_MATCH_PATTERN ||
    t === NT_MATCH_PATTERN_P
  ) {
    return true;
  }
  if (ssxAssignment(src, n)) {
    return true;
  }
  // method_call_with_changed_precedence?
  if (ssxIsCall(src, n) && a.nKid(n) > 2 && !ssxLocIs(src, n, F_BEGIN, "(") && !ssxOperatorName(ssxMeth(src, n))) {
    return true;
  }
  // keyword_with_changed_precedence?
  if (stpPrefixNot(src, n)) {
    return true;
  }
  if (t === NT_RETURN || t === NT_BREAK || t === NT_NEXT || t === NT_YIELD || t === NT_SUPER || t === NT_DEFINED_P) {
    return a.nKid(n) > 0 && !ssxLocIs(src, n, F_BEGIN, "(");
  }
  return false;
};

export class CopStyleOneLineConditional {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/OneLineConditional");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || scnModifier(src, n) || scnTernary(src, n)) {
        continue;
      }
      if (src.line(a.exS(n)) !== src.line(a.exE(n))) {
        continue;
      }
      const eb = scnElseBranch(src, n);
      if (eb === V_NIL || scnElsif(src, n) || ssxIs(src, scnIfBranch(src, n), NT_BEGIN)) {
        continue;
      }
      let multiline = scnElsifConditional(src, n);
      if (!multiline && ssxIs(src, eb, NT_BEGIN)) {
        let k = 0;
        for (let i = 0; i < a.nKid(eb); i++) {
          if (a.kid(eb, i) !== V_NIL) {
            k = add32(k, 1);
          }
        }
        multiline = k >= 2;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null || this.ign.partOf(src, n)) {
        continue;
      }
      if (multiline) {
        k.replace(a.exS(n), a.exE(n), siieIfThenReplacement(src, n, null, "  "));
      } else {
        k.replace(a.exS(n), a.exE(n), this.ternaryCorrection(src, n));
      }
      this.c.commit(k);
      this.ign.add(n);
    }
  }

  private expr(src: RbSource, n: i32): string {
    if (n === V_NIL) {
      return "nil";
    }
    return solcRequiresParens(src, n) ? `(${src.nodeSrc(n)})` : src.nodeSrc(n);
  }

  private ternaryCorrection(src: RbSource, n: i32): string {
    const a = src.a;
    const r = `${this.expr(src, a.kid(n, 0))} ? ${this.expr(src, a.kid(n, 1))} : ${this.expr(src, a.kid(n, 2))}`;
    const p = src.parent(n);
    if (p === V_NIL) {
      return r;
    }
    if (scnOperatorKeyword(src, p) || (ssxIs(src, p, NT_SEND) && ssxOperatorName(ssxMeth(src, p)))) {
      return `(${r})`;
    }
    // parent_binds_tighter_than_ternary?
    const t = a.type(p);
    let tighter = false;
    if (t === NT_SEND || t === NT_CSEND) {
      tighter = a.kid(p, 0) === n;
    } else if (t === NT_CONST || t === NT_CASGN) {
      tighter = a.kid(p, 0) === n;
    } else if (t === NT_IF) {
      tighter = scnTernary(src, p) && a.kid(p, 0) === n;
    }
    return tighter ? `(${r})` : r;
  }
}
