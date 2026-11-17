// Style/RedundantBegin (Layout/LineLength Max: 120, Layout/SpaceInsideParens
// no_space).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_END,
  F_KEYWORD,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  NT_AND,
  NT_BLOCK,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEF,
  NT_DEFS,
  NT_EMPTY_ELSE,
  NT_ENSURE,
  NT_IF,
  NT_KWBEGIN,
  NT_LAMBDA,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin, rbSpaceEnd } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { sbhSlmAssignment } from "./style_single_line_methods";
import { sbhLambdaLiteral, sbhMethodName } from "./style_body_help";
import {
  ssxCharLen,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxIsSpace,
  ssxLocIs,
  ssxMultiline,
  ssxSingleLine,
  ssxWholeLinesE,
  ssxWholeLinesS,
} from "./style_syntax_help";

const sbhRbIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** modifier_form? of an if (if/unless keyword, no end) or while/until (no end). */
const sbhRbModifierForm = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (t === NT_IF) {
    return (ssxLocIs(src, n, F_KEYWORD, "if") || ssxLocIs(src, n, F_KEYWORD, "unless")) && !ssxHas(src, n, F_END);
  }
  if (t === NT_WHILE || t === NT_UNTIL) {
    return !ssxHas(src, n, F_END);
  }
  return false;
};

/** low_precedence_statement? */
const sbhRbLowPrecedence = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) {
    return sbhRbModifierForm(src, n);
  }
  if (t === NT_SEND) {
    return src.a.kid(n, 0) !== V_NIL && sbhMethodName(src, n) === "!" && ssxLocIs(src, n, F_SELECTOR, "not");
  }
  return (t === NT_AND || t === NT_OR) && (ssxLocIs(src, n, F_OPERATOR, "and") || ssxLocIs(src, n, F_OPERATOR, "or"));
};

/** A kwbegin's rescue_node || ensure_node: its first child is a rescue or an ensure. */
const sbhRbHasRescueEnsure = (src: RbSource, n: i32): boolean => {
  const f = src.a.nKid(n) > 0 ? src.a.kid(n, 0) : V_NIL;
  return sbhRbIs(src, f, NT_RESCUE) || sbhRbIs(src, f, NT_ENSURE);
};

/** ternary_operand_requiring_begin? */
const sbhRbTernaryOperand = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL || src.a.type(p) !== NT_IF || !ssxHas(src, p, F_QUESTION)) {
    return false;
  }
  return src.a.nKid(n) !== 1 || sbhRbLowPrecedence(src, src.a.kid(n, 0));
};

/** allowable_kwbegin? */
const sbhRbAllowable = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const k = a.nKid(n);
  if (k === 0) {
    return true;
  }
  const p = src.parent(n);
  if (p !== V_NIL && k >= 2) {
    return true;
  }
  const first = a.kid(n, 0);
  if (sbhRbIs(src, first, NT_RESCUE) || sbhRbIs(src, first, NT_ENSURE)) {
    return true;
  }
  // valid_context_using_only_begin?
  if (p !== V_NIL && sbhSlmAssignment(src, p)) {
    if (k !== 1) {
      return true;
    }
    // too_long_when_joined?
    if (ssxSingleLine(src, first)) {
      let len = ssxCharLen(src.nodeSrc(first));
      if (sbhRbLowPrecedence(src, first)) {
        len += 2;
      }
      if (src.column(a.exS(n)) + len > 120) {
        return true;
      }
    }
  }
  if (p !== V_NIL) {
    const pt = a.type(p);
    if (pt === NT_WHILE_POST || pt === NT_UNTIL_POST || pt === NT_SEND || pt === NT_AND || pt === NT_OR) {
      return true;
    }
  }
  return sbhRbTernaryOperand(src, n);
};

/** IfNode#branches. */
const sbhRbIfBranches = (src: RbSource, n: i32, out: i32[]): void => {
  const a = src.a;
  const unless = ssxLocIs(src, n, F_KEYWORD, "unless");
  const ifB = unless ? a.kid(n, 2) : a.kid(n, 1);
  const elseB = unless ? a.kid(n, 1) : a.kid(n, 2);
  if (ssxHas(src, n, F_QUESTION)) {
    out.push(ifB);
    out.push(elseB);
    return;
  }
  out.push(ifB);
  if (!ssxHas(src, n, F_ELSE)) {
    return;
  }
  if (sbhRbIs(src, elseB, NT_IF) && ssxLocIs(src, elseB, F_KEYWORD, "elsif")) {
    sbhRbIfBranches(src, elseB, out);
  } else {
    out.push(elseB);
  }
};

/** Style/RedundantBegin. */
export class CopStyleRedundantBegin {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantBegin");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        const body = t === NT_DEF ? a.kid(n, 2) : a.kid(n, 3);
        if (sbhRbIs(src, body, NT_KWBEGIN) && ssxHas(src, n, F_END)) {
          this.register(src, body);
        }
      } else if (t === NT_IF) {
        if (!sbhRbModifierForm(src, n)) {
          const br: i32[] = [];
          sbhRbIfBranches(src, n, br);
          this.inspectBranches(src, br);
        }
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        const br: i32[] = [];
        const k = a.nKid(n);
        for (let i = 1; i < k - 1; i++) {
          br.push(a.kid(a.kid(n, i), -1));
        }
        if (ssxHas(src, n, F_ELSE)) {
          const e = a.kid(n, k - 1);
          br.push(t === NT_CASE_MATCH && sbhRbIs(src, e, NT_EMPTY_ELSE) ? V_NIL : e);
        }
        this.inspectBranches(src, br);
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        if (!sbhRbModifierForm(src, n)) {
          const body = a.kid(n, 1);
          if (sbhRbIs(src, body, NT_KWBEGIN) && !sbhRbHasRescueEnsure(src, body)) {
            this.register(src, body);
          }
        }
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        if (sbhLambdaLiteral(src, a.kid(n, 0)) || ssxLocIs(src, n, F_END, "}")) {
          continue;
        }
        const body = a.kid(n, 2);
        if (sbhRbIs(src, body, NT_KWBEGIN)) {
          this.register(src, body);
        }
      } else if (t === NT_KWBEGIN) {
        // offensive_kwbegins(node).to_a.last
        let last = V_NIL;
        if (!sbhRbAllowable(src, n)) {
          last = n;
        }
        for (const d of ssxDescendants(src, n)) {
          if (a.type(d) === NT_KWBEGIN && !sbhRbAllowable(src, d)) {
            last = d;
          }
        }
        if (last !== V_NIL) {
          this.register(src, last);
        }
      }
    }
  }

  private inspectBranches(src: RbSource, br: i32[]): void {
    for (const b of br) {
      if (!sbhRbIs(src, b, NT_KWBEGIN) || sbhRbHasRescueEnsure(src, b) || sbhRbTernaryOperand(src, b)) {
        continue;
      }
      this.register(src, b);
    }
  }

  /** register_offense. */
  private register(src: RbSource, n: i32): void {
    const a = src.a;
    const bs = ssxFS(src, n, F_BEGIN);
    const be = ssxFE(src, n, F_BEGIN);
    const k = this.c.offense(bs, be);
    if (k === null) {
      return;
    }
    const p = src.parent(n);
    const pt = p === V_NIL ? -1 : a.type(p);
    if (p !== V_NIL && (sbhSlmAssignment(src, p) || pt === NT_RETURN || pt === NT_NEXT || pt === NT_BREAK)) {
      this.replaceWithStatement(src, k, bs, be, n);
    } else {
      // remove_begin
      if ((pt === NT_DEF || pt === NT_DEFS) && !ssxHas(src, p, F_END)) {
        k.remove(rbSpaceBegin(src, bs, 0, true, false, false), rbSpaceEnd(src, be, 0, true, false, false));
      } else {
        k.remove(bs, be);
      }
    }
    // use_modifier_form_after_multiline_begin_block?
    if (p !== V_NIL && ssxMultiline(src, n) && pt === NT_IF && sbhRbModifierForm(src, p) && a.kid(p, 0) !== n) {
      const cs = ssxFS(src, p, F_KEYWORD);
      const ce = a.exE(a.kid(p, 0));
      const first = a.kid(n, 0);
      k.insertAfter(a.exS(first), a.exE(first), ` ${src.src(cs, ce)}`);
      k.remove(ssxWholeLinesS(src, cs), ssxWholeLinesE(src, ce, true));
    }
    k.remove(ssxFS(src, n, F_END), ssxFE(src, n, F_END));
    this.c.commit(k);
  }

  /** replace_begin_with_statement. */
  private replaceWithStatement(src: RbSource, k: RbRewriter, bs: i32, be: i32, n: i32): void {
    const a = src.a;
    const first = a.kid(n, 0);
    let s = src.nodeSrc(first);
    if (sbhRbLowPrecedence(src, first)) {
      s = `(${s})`;
    }
    k.replace(bs, be, s);
    k.remove(be, a.exE(first));
    // restore_removed_comments
    let blank = true;
    for (let p = be; p < a.exS(first); p++) {
      if (!ssxIsSpace(src.at(p))) {
        blank = false;
        break;
      }
    }
    if (!blank) {
      const par = src.parent(n);
      k.insertBefore(a.exS(par), a.exE(par), src.src(be, a.exS(first)));
    }
  }
}
