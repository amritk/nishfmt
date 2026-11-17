// Style/IfWithSemicolon.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_SELECTOR,
  NT_AND,
  NT_BEGIN,
  NT_BLOCK,
  NT_CSEND,
  NT_DEFINED_P,
  NT_IF,
  NT_MASGN,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_NUMBLOCK,
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
  scnBranches,
  scnElseBranch,
  scnIfBranch,
  scnModifier,
  scnOperatorKeyword,
  scnTernary,
  scnUnless,
} from "./style_cond_help";
import { stpPrefixNot } from "./style_ternary_parentheses";
import {
  ssxAssignment,
  ssxFE,
  ssxFS,
  ssxIs,
  ssxIsCall,
  ssxLocIs,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
} from "./style_syntax_help";

/** require_argument_parentheses? */
const siwsRequireArgParens = (src: RbSource, n: i32): boolean => {
  if (!ssxIsCall(src, n)) {
    return false;
  }
  const m = ssxMeth(src, n);
  if (m === "+" || m === "-" || m === "*" || m === "/" || m === "%" || m === "**") {
    return false;
  }
  return !ssxParenthesized(src, n) && src.a.nKid(n) > 2 && m !== "[]" && m !== "[]=";
};

/** lower_precedence_than_ternary? */
const siwsLowerPrecedence = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if (
    t === NT_AND ||
    t === NT_OR ||
    t === NT_IF ||
    t === NT_RESCUE ||
    t === NT_MATCH_PATTERN ||
    t === NT_MATCH_PATTERN_P ||
    t === NT_WHILE ||
    t === NT_UNTIL ||
    t === NT_WHILE_POST ||
    t === NT_UNTIL_POST
  ) {
    return true;
  }
  if (t === NT_SEND) {
    if (stpPrefixNot(src, n)) {
      return true;
    }
    // prefix_bang_on_command?
    if (ssxMeth(src, n) === "!" && ssxLocIs(src, n, F_SELECTOR, "!")) {
      const r = a.kid(n, 0);
      if (r !== V_NIL && (siwsRequireArgParens(src, r) || siwsLowerPrecedence(src, r))) {
        return true;
      }
    }
    return false;
  }
  if (t === NT_YIELD || t === NT_SUPER || t === NT_DEFINED_P) {
    return a.nKid(n) > 0 && !ssxParenthesized(src, n);
  }
  return false;
};

/** build_expression. */
const siwsBuild = (src: RbSource, n: i32): string => {
  if (!siwsRequireArgParens(src, n)) {
    return src.nodeSrc(n);
  }
  const a = src.a;
  return `${src.src(a.exS(n), ssxFE(src, n, F_SELECTOR))}(${src.src(a.exS(a.kid(n, 2)), a.exE(n))})`;
};

/** ternary_operand. */
const siwsOperand = (src: RbSource, n: i32): string =>
  siwsLowerPrecedence(src, n) ? `(${src.nodeSrc(n)})` : siwsBuild(src, n);

/** build_else_branch. */
const siwsElse = (src: RbSource, n: i32): string => {
  const ib = scnIfBranch(src, n);
  let r = `elsif ${src.nodeSrc(src.a.kid(n, 0))}\n  ${ib === V_NIL ? "" : src.nodeSrc(ib)}\n`;
  const eb = scnElseBranch(src, n);
  if (eb !== V_NIL) {
    if (ssxIs(src, eb, NT_IF)) {
      r = `${r}${siwsElse(src, eb)}`;
    } else {
      r = `${r}else\n  ${src.nodeSrc(eb)}\n`;
    }
  }
  return r;
};

/** String#chop. */
const siwsChop = (s: string): string => (s.length === 0 ? s : s.substring(0, toI32(s.length) - 1));

export class CopStyleIfWithSemicolon {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/IfWithSemicolon");
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
      const p = src.parent(n);
      if ((p !== V_NIL && a.type(p) === NT_IF) || this.ign.partOf(src, n)) {
        continue;
      }
      if (!ssxLocIs(src, n, F_BEGIN, ";")) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        if (this.requireNewline(src, n) || this.masgnOrBlock(src, n)) {
          k.replace(ssxFS(src, n, F_BEGIN), ssxFE(src, n, F_BEGIN), "\n");
        } else {
          k.replace(a.exS(n), a.exE(n), this.replacement(src, n));
        }
        this.c.commit(k);
      }
      this.ign.add(n);
    }
  }

  private requireNewline(src: RbSource, n: i32): boolean {
    for (const b of scnBranches(src, n)) {
      if (b === V_NIL) {
        continue;
      }
      if (ssxIs(src, b, NT_BEGIN) || (ssxIs(src, b, NT_RETURN) && src.a.nKid(b) > 0)) {
        return true;
      }
    }
    return false;
  }

  private masgnOrBlock(src: RbSource, n: i32): boolean {
    for (const b of scnBranches(src, n)) {
      if (ssxIs(src, b, NT_MASGN) || ssxIs(src, b, NT_BLOCK) || ssxIs(src, b, NT_NUMBLOCK)) {
        return true;
      }
    }
    return false;
  }

  private replacement(src: RbSource, n: i32): string {
    const a = src.a;
    const eb = scnElseBranch(src, n);
    const ib = scnIfBranch(src, n);
    if (ssxIs(src, eb, NT_IF)) {
      return siwsChop(
        `if ${src.nodeSrc(a.kid(n, 0))}\n  ${ib === V_NIL ? "" : src.nodeSrc(ib)}\n${siwsChop(siwsElse(src, eb))}\nend\n`,
      );
    }
    let thenCode = ib === V_NIL ? "nil" : siwsOperand(src, ib);
    let elseCode = eb === V_NIL ? "nil" : siwsOperand(src, eb);
    if (scnUnless(src, n)) {
      const x = thenCode;
      thenCode = elseCode;
      elseCode = x;
    }
    const cond = a.kid(n, 0);
    const tc = ssxAssignment(src, cond) ? `(${src.nodeSrc(cond)})` : siwsOperand(src, cond);
    const ternary = `${tc} ? ${thenCode} : ${elseCode}`;
    return this.operandOfParent(src, n) ? `(${ternary})` : ternary;
  }

  /** operand_of_parent? */
  private operandOfParent(src: RbSource, n: i32): boolean {
    const p = src.parent(n);
    if (p === V_NIL) {
      return false;
    }
    if (scnOperatorKeyword(src, p)) {
      return true;
    }
    if (!(ssxIs(src, p, NT_SEND) || ssxIs(src, p, NT_CSEND))) {
      return false;
    }
    if (stpPrefixNot(src, p)) {
      return false;
    }
    if (src.a.kid(p, 0) === n) {
      return true;
    }
    const m = ssxMeth(src, p);
    return ssxOperatorName(m) && m !== "[]" && m !== "[]=";
  }
}
