// Style/IfUnlessModifier (Layout/LineLength: Max 120, AllowURI, AllowCopDirectives).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_END,
  F_KEYWORD,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_CSEND,
  NT_DEFINED_P,
  NT_DSTR,
  NT_IF,
  NT_LVAR,
  NT_LVASGN,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_MATCH_WITH_LVASGN,
  NT_OR,
  NT_PAIR,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import {
  SCN_MAX,
  scnAcceptableLineLength,
  scnChained,
  scnCodeAfter,
  scnCommentAt,
  scnEachNode,
  scnEachStr,
  scnElse,
  scnElsif,
  scnEndlessDef,
  scnFirstLineComment,
  scnHasAncestor,
  scnHeredoc,
  scnHeredocRange,
  scnIfBranch,
  scnKeyword,
  scnLen,
  scnModifier,
  scnModifierFits,
  scnNestedConditional,
  scnNonEligibleBodyBase,
  scnNonEligibleCondition,
  scnNonEligibleNodeBase,
  scnSpaces,
  scnTernary,
  scnToModifierForm,
  scnWholeE,
  scnWholeS,
} from "./style_cond_help";
import { ssxDescendants, ssxFE, ssxFS, ssxIs, ssxIsCall, ssxSiblingIndex } from "./style_syntax_help";

const SIUM_COP: string = "Style/IfUnlessModifier";

/** unwrap_begin: a pair's value, a begin's first child. */
const siumUnwrap = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  if (!src.a.isNode(n)) {
    return V_NIL;
  }
  if (src.a.type(n) === NT_PAIR) {
    n = src.a.kid(n, 1);
  }
  return ssxIs(src, n, NT_BEGIN) ? src.a.kid(n, 0) : n;
};

/** collection_from_ancestor. */
const siumCollectionFrom = (src: RbSource, n: i32): i32 => {
  if (n === V_NIL) {
    return V_NIL;
  }
  const t = src.a.type(n);
  if (t === NT_ARRAY || t === NT_SEND || t === NT_CSEND || t === NT_AND || t === NT_OR) {
    return n;
  }
  if (t === NT_PAIR) {
    return src.parent(n);
  }
  return V_NIL;
};

/** find_containing_collection. */
const siumCollection = (src: RbSource, n: i32): i32 => {
  const p = src.parent(n);
  if (p === V_NIL || src.a.type(p) !== NT_BEGIN) {
    return siumCollectionFrom(src, p);
  }
  return siumCollectionFrom(src, src.parent(p));
};

/** Util#same_line? of a node's first line and a range's line. */
const siumLine = (src: RbSource, p: i32): i32 => src.line(p);

export class CopStyleIfUnlessModifier {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/IfUnlessModifier");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    for (const n of src.pre) {
      if (src.a.type(n) === NT_IF) {
        this.onIf(src, n);
      }
    }
  }

  private onIf(src: RbSource, n: i32): void {
    const a = src.a;
    if (scnEndlessDef(src, scnIfBranch(src, n)) || scnHasAncestor(src, n, NT_DSTR)) {
      return;
    }
    const cond = a.kid(n, 0);
    const defs = ssxIs(src, cond, NT_DEFINED_P) ? [cond] : scnEachNode(src, cond, NT_DEFINED_P);
    for (const d of defs) {
      if (this.definedArgumentUndefined(src, n, d)) {
        return;
      }
    }
    if (scnEachNode(src, cond, NT_MATCH_PATTERN).length > 0 || scnEachNode(src, cond, NT_MATCH_PATTERN_P).length > 0) {
      return;
    }
    let ok = false;
    if (this.singleLineAsModifier(src, n) && !ssxIs(src, cond, NT_MATCH_WITH_LVASGN)) {
      ok = true;
    } else if (this.tooLongDueToModifier(src, n)) {
      ok = true;
    }
    if (!ok) {
      return;
    }
    if (this.modifierSharingLineInLogicalOperator(src, n)) {
      return;
    }
    const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
    if (k === null) {
      return;
    }
    if (this.ign.partOf(src, n) || this.anotherModifierIfOnSameLine(src, n)) {
      return;
    }
    // autocorrect
    let repl = "";
    if (scnModifier(src, n)) {
      repl = this.replacementForModifierForm(src, n, k);
    } else {
      repl = scnToModifierForm(src, n, SIUM_COP);
    }
    k.replace(a.exS(n), a.exE(n), repl);
    this.c.commit(k);
    this.ign.add(n);
  }

  /** defined_argument_is_undefined? */
  private definedArgumentUndefined(src: RbSource, ifNode: i32, d: i32): boolean {
    const arg = src.a.kid(d, 0);
    if (!(ssxIs(src, arg, NT_LVAR) || ssxIs(src, arg, NT_SEND))) {
      return false;
    }
    if (ssxIs(src, arg, NT_SEND)) {
      // node_parts[0] is the receiver: never an lvasgn's name.
      return true;
    }
    const name = src.a.text(src.a.kid(arg, 0));
    for (const s of this.leftSiblings(src, ifNode)) {
      if (ssxIs(src, s, NT_LVASGN) && src.a.text(src.a.kid(s, 0)) === name) {
        return false;
      }
    }
    return true;
  }

  private leftSiblings(src: RbSource, n: i32): i32[] {
    const out: i32[] = [];
    const p = src.parent(n);
    if (p === V_NIL) {
      return out;
    }
    for (let i = 0; i < src.a.nKid(p); i++) {
      const c = src.a.kid(p, i);
      if (c === n) {
        break;
      }
      out.push(c);
    }
    return out;
  }

  /** single_line_as_modifier? */
  private singleLineAsModifier(src: RbSource, n: i32): boolean {
    if (
      this.nonEligibleNode(src, n) ||
      scnNonEligibleBodyBase(src, scnIfBranch(src, n)) ||
      scnNonEligibleCondition(src, src.a.kid(n, 0))
    ) {
      return false;
    }
    return scnModifierFits(src, n, SIUM_COP);
  }

  /** non_eligible_node? */
  private nonEligibleNode(src: RbSource, n: i32): boolean {
    if (scnTernary(src, n) || scnElsif(src, n) || scnElse(src, n)) {
      return true;
    }
    if (scnChained(src, n) || scnNestedConditional(src, n) || this.multilineInsideCollection(src, n)) {
      return true;
    }
    return scnNonEligibleNodeBase(src, n, SIUM_COP);
  }

  /** multiline_inside_collection? */
  private multilineInsideCollection(src: RbSource, n: i32): boolean {
    if (scnModifier(src, n)) {
      return false;
    }
    const col = siumCollection(src, n);
    if (col === V_NIL) {
      return false;
    }
    for (let i = 0; i < src.a.nKid(col); i++) {
      const inner = siumUnwrap(src, src.a.kid(col, i));
      if (inner === V_NIL || !ssxIs(src, inner, NT_IF) || scnTernary(src, inner)) {
        continue;
      }
      // shares_line_with?: same_line?(inner, node.loc.end) || same_line?(inner.loc.end, node)
      const nl = src.line(src.a.exS(n));
      const il = src.line(src.a.exS(inner));
      if (siumLine(src, ssxFS(src, n, F_END)) === il) {
        return true;
      }
      if (ssxFS(src, inner, F_END) >= 0 && this.hasEnd(src, inner) && siumLine(src, ssxFS(src, inner, F_END)) === nl) {
        return true;
      }
    }
    return false;
  }

  private hasEnd(src: RbSource, n: i32): boolean {
    return src.a.has(src.a.map(n), F_END);
  }

  /** modifier_sharing_line_in_logical_operator? */
  private modifierSharingLineInLogicalOperator(src: RbSource, n: i32): boolean {
    const col = siumCollection(src, n);
    if (!scnModifier(src, n) || col === V_NIL || !(ssxIs(src, col, NT_AND) || ssxIs(src, col, NT_OR))) {
      return false;
    }
    return this.anotherModifierIfOnSameLine(src, n);
  }

  /** another_modifier_if_on_same_line? */
  private anotherModifierIfOnSameLine(src: RbSource, n: i32): boolean {
    const col = siumCollection(src, n);
    if (col === V_NIL) {
      return false;
    }
    const line = src.line(src.a.exS(n));
    for (const d of ssxDescendants(src, col)) {
      if (d !== n && src.a.type(d) === NT_IF && scnModifier(src, d) && src.line(src.a.exS(d)) === line) {
        return true;
      }
    }
    return false;
  }

  /** too_long_due_to_modifier? */
  private tooLongDueToModifier(src: RbSource, n: i32): boolean {
    return scnModifier(src, n) && this.tooLongSingleLine(src, n) && !this.anotherStatementOnSameLine(src, n);
  }

  /** too_long_single_line? */
  private tooLongSingleLine(src: RbSource, n: i32): boolean {
    const l = src.line(src.a.exS(n));
    if (l !== src.line(src.a.exE(n))) {
      return false;
    }
    return !scnAcceptableLineLength(src, src.lineText(l), l);
  }

  /** another_statement_on_same_line? */
  private anotherStatementOnSameLine(src: RbSource, n0: i32): boolean {
    const lineNo = src.line(src.a.exE(n0));
    let n = n0;
    let index = -1;
    while (n !== V_NIL && src.a.type(n) !== NT_BEGIN) {
      index = ssxSiblingIndex(src, n);
      n = src.parent(n);
    }
    if (n === V_NIL) {
      return false;
    }
    const sib = src.a.kid(n, index + 1);
    return sib !== V_NIL && src.a.isNode(sib) && src.line(src.a.exS(sib)) === lineNo;
  }

  /** replacement_for_modifier_form. */
  private replacementForModifierForm(src: RbSource, n: i32, k: RbRewriter): string {
    const a = src.a;
    const indent = scnSpaces(src.column(a.exS(n)));
    const ci = scnCommentAt(src, src.line(a.exS(n)));
    if (ci >= 0) {
      const ls = scnLen(src.lineText(src.line(a.exS(n))));
      const cl = src.commE[ci] - src.commS[ci];
      if (SCN_MAX >= ls - cl && SCN_MAX <= ls) {
        k.remove(rbSpaceBegin(src, src.commS[ci], 1, true, false, false), src.commE[ci]);
        return `${src.src(src.commS[ci], src.commE[ci])}\n${indent}${src.nodeSrc(scnIfBranch(src, n))} ${scnKeyword(src, n)} ${src.nodeSrc(a.kid(n, 0))}`;
      }
    }
    const hs = this.heredocRanges(src, n);
    if (hs.length > 0) {
      for (let i = 0; i < toI32(hs.length); i += 2) {
        k.remove(scnWholeS(src, hs[i]), scnWholeE(src, hs[i + 1], true));
      }
      const lines: string[] = [];
      lines.push(`${scnKeyword(src, n)} ${src.nodeSrc(a.kid(n, 0))}`);
      const hc = this.heredocRanges(src, a.kid(n, 0));
      for (let i = 0; i < toI32(hc.length); i += 2) {
        lines.push(src.src(hc[i], hc[i + 1]));
      }
      lines.push(`${indent}  ${src.nodeSrc(scnIfBranch(src, n))}`);
      const hb = this.heredocRanges(src, scnIfBranch(src, n));
      for (let i = 0; i < toI32(hb.length); i += 2) {
        lines.push(src.src(hb[i], hb[i + 1]));
      }
      lines.push(`${indent}end`);
      return lines.join("\n");
    }
    return `${scnKeyword(src, n)} ${src.nodeSrc(a.kid(n, 0))}\n${indent}  ${src.nodeSrc(scnIfBranch(src, n))}\n${indent}end`;
  }

  /** heredoc_ranges_in: whole-line ranges (no final newline) of the heredocs in n, nested ones dropped; [s0, e0, s1, e1, ...]. */
  private heredocRanges(src: RbSource, n: i32): i32[] {
    const ss: i32[] = [];
    const es: i32[] = [];
    if (n === V_NIL) {
      return ss;
    }
    for (const h of scnEachStr(src, n)) {
      if (!scnHeredoc(src, h)) {
        continue;
      }
      const r = scnHeredocRange(src, h);
      ss.push(scnWholeS(src, r[0]));
      es.push(scnWholeE(src, r[1], false));
    }
    const out: i32[] = [];
    for (let i = 0; i < toI32(ss.length); i++) {
      let contained = false;
      for (let j = 0; j < toI32(ss.length); j++) {
        if (ss[j] <= ss[i] && es[i] <= es[j] && (ss[j] !== ss[i] || es[j] !== es[i])) {
          contained = true;
        }
      }
      if (!contained) {
        out.push(ss[i]);
        out.push(es[i]);
      }
    }
    return out;
  }
}
