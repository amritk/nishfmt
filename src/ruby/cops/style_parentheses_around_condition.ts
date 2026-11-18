// Style/ParenthesesAroundCondition (AllowSafeAssignment: true,
// AllowInMultilineConditions: false), with the ParenthesesCorrector.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_HEREDOC_END,
  NT_BEGIN,
  NT_IF,
  NT_MASGN,
  NT_RESCUE,
  NT_SUPER,
  NT_UNTIL,
  NT_WHILE,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbFinalPos } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { scnBasicConditional, scnEachStr, scnHeredoc, scnModifier, scnTernary } from "./style_cond_help";
import { stpSafeAssignment } from "./style_ternary_parentheses";
import {
  ssxAssignment,
  ssxFE,
  ssxFS,
  ssxIs,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxIsSpace,
  ssxLocIs,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
  ssxSetter,
} from "./style_syntax_help";

/** /[a-z]/ on one code point. */
const spacLower = (c: i32): boolean => c >= 97 && c <= 122;

/** The text after a position on its line, lstripped (text_after_close_paren). */
const spacTextAfter = (src: RbSource, p: i32): string => {
  const le = src.lineEnd(src.line(p));
  let q = p;
  while (q < le && (ssxIsSpace(src.at(q)) || src.at(q) === 0)) {
    q++;
  }
  return src.src(q, le);
};

/** ParenthesesCorrector.correct for a begin node with parentheses. */
export const spacCorrectParens = (src: RbSource, n: i32, k: RbRewriter): void => {
  const a = src.a;
  const bs = ssxFS(src, n, F_BEGIN);
  const be = ssxFE(src, n, F_BEGIN);
  k.remove(bs, rbFinalPos(src, be, 1, false, true, true));
  const es = ssxFS(src, n, F_END);
  const ee = ssxFE(src, n, F_END);
  const after = spacTextAfter(src, ee);
  const last = a.nKid(n) > 0 ? a.kid(n, -1) : V_NIL;
  let heredocBefore = false;
  if (last !== V_NIL && a.isNode(last)) {
    for (const s of scnEachStr(src, last)) {
      if (scnHeredoc(src, s) && ssxFE(src, s, F_HEREDOC_END) <= es) {
        heredocBefore = true;
      }
    }
  }
  if (heredocBefore && (after.startsWith(".") || after.startsWith("&."))) {
    k.replace(rbFinalPos(src, es, -1, false, true, false), ee, "\n");
  } else {
    // comment_above_close_paren_swallows_chain?
    let swallow = false;
    if (last !== V_NIL && a.isNode(last) && a.exE(last) < es) {
      let hasComment = false;
      for (let p = a.exE(last); p < es; p++) {
        if (src.at(p) === 35) {
          for (let q = p + 1; q < es; q++) {
            if (src.at(q) === 10) {
              hasComment = true;
              break;
            }
          }
          break;
        }
      }
      swallow = hasComment && after.length > 0 && !after.startsWith("#");
    }
    k.remove(rbFinalPos(src, es, -1, false, !swallow, false), ee);
  }
  // handle_orphaned_comma: the `)` line is /\A\s*\)\s*,/.
  const ls = src.lineStart(src.line(es));
  let p = ls;
  while (p < es && ssxIsSpace(src.at(p))) {
    p++;
  }
  if (p === es) {
    let q = ee;
    while (ssxIsSpace(src.at(q))) {
      q++;
    }
    if (src.at(q) === 44) {
      k.remove(rbFinalPos(src, es, -1, true, true, true), ee);
    }
  }
};

export class CopStyleParenthesesAroundCondition {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/ParenthesesAroundCondition");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_IF) {
        if (scnTernary(src, n)) {
          continue;
        }
      } else if (t !== NT_WHILE && t !== NT_UNTIL) {
        continue;
      }
      const cond = a.kid(n, 0);
      if (!ssxIs(src, cond, NT_BEGIN) || a.nKid(cond) === 0) {
        continue;
      }
      const first = a.kid(cond, 0);
      // require_parentheses?
      if ((t === NT_WHILE || t === NT_UNTIL) && ssxIsAnyBlock(src, first) && ssxLocIs(src, first, F_END, "end")) {
        continue;
      }
      // semicolon_separated_expressions?
      if (a.nKid(cond) > 1) {
        const second = a.kid(cond, 1);
        let semi = false;
        for (let p = a.exE(first); p < a.exS(second); p++) {
          if (src.at(p) === 59) {
            semi = true;
          }
        }
        if (semi) {
          continue;
        }
      }
      if (this.modifierOp(src, first) || ssxIs(src, first, NT_MASGN)) {
        continue;
      }
      if (this.commandCallAssignment(src, first)) {
        continue;
      }
      // parens_allowed?
      if (spacLower(src.at(a.exS(cond) - 1 < 0 ? src.n - 1 : a.exS(cond) - 1)) || spacLower(src.at(a.exE(cond)))) {
        continue;
      }
      if (stpSafeAssignment(src, cond)) {
        continue;
      }
      const k = this.c.offense(a.exS(cond), a.exE(cond));
      if (k !== null) {
        spacCorrectParens(src, cond, k);
        this.c.commit(k);
      }
    }
  }

  /** modifier_op? */
  private modifierOp(src: RbSource, n: i32): boolean {
    if (ssxIs(src, n, NT_IF) && scnTernary(src, n)) {
      return false;
    }
    if (ssxIs(src, n, NT_RESCUE)) {
      return true;
    }
    return scnBasicConditional(src, n) && scnModifier(src, n);
  }

  /** command_call_assignment? */
  private commandCallAssignment(src: RbSource, n: i32): boolean {
    if (!src.a.isNode(n)) {
      return false;
    }
    if (!ssxAssignment(src, n) && !(ssxIsCall(src, n) && ssxSetter(src, n))) {
      return false;
    }
    let v = src.a.kid(n, -1);
    if (!src.a.isNode(v)) {
      return false;
    }
    if (ssxIs(src, v, NT_RESCUE)) {
      v = src.a.kid(v, 0);
    }
    return this.commandCallAssignment(src, v) || this.commandCall(src, v);
  }

  /** command_call? */
  private commandCall(src: RbSource, n0: i32): boolean {
    let n = n0;
    if (!src.a.isNode(n)) {
      return false;
    }
    if (ssxIsAnyBlock(src, n)) {
      n = src.a.kid(n, 0);
    }
    const t = src.a.type(n);
    let nargs = 0;
    if (ssxIsCall(src, n)) {
      nargs = src.a.nKid(n) - 2;
    } else if (t === NT_SUPER || t === NT_YIELD) {
      nargs = src.a.nKid(n);
    } else {
      return false;
    }
    if (nargs === 0 || ssxParenthesized(src, n)) {
      return false;
    }
    if (ssxIsCall(src, n)) {
      const m = ssxMeth(src, n);
      if (ssxOperatorName(m) || ssxSetter(src, n)) {
        return false;
      }
      return m !== "[]";
    }
    return true;
  }
}
